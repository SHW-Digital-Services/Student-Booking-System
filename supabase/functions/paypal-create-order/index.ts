import { verifySupabaseJwt } from "../_shared/jwt.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function paypalConfig() {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  const environment = Deno.env.get("PAYPAL_ENVIRONMENT") || "sandbox";
  if (!clientId || !clientSecret) throw new Error("PayPal credentials are not configured");
  if (environment !== "sandbox" && environment !== "live") throw new Error("PAYPAL_ENVIRONMENT must be sandbox or live");
  return { clientId, clientSecret, apiBase: environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com" };
}

async function getAccessToken(config: ReturnType<typeof paypalConfig>) {
  const response = await fetch(`${config.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(`PayPal authentication failed (${response.status})`);
  return payload.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const auth = await verifySupabaseJwt(req.headers.get("Authorization"));
    const { bookingId } = await req.json();
    if (typeof bookingId !== "string" || !bookingId) return json(400, { error: "bookingId is required" });

    const supabase = supabaseAdmin();
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, student_id, tutor_id, duration_minutes, lesson_price, payment_status")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError || !booking) return json(404, { error: "Booking not found" });
    if (booking.student_id !== auth.sub) return json(403, { error: "You cannot pay for this booking" });
    if (booking.payment_status === "paid") return json(409, { error: "This booking is already paid" });

    const savedPrice = Number(booking.lesson_price || 0);
    let amount = savedPrice;
    if (amount <= 0) {
      const { data: tutor, error: tutorError } = await supabase.from("profiles").select("hourly_rate").eq("id", booking.tutor_id).maybeSingle();
      if (tutorError || !tutor) return json(400, { error: "Unable to determine lesson price" });
      amount = Number(((Number(tutor.hourly_rate || 0) * Number(booking.duration_minutes || 60)) / 60).toFixed(2));
    }
    if (!Number.isFinite(amount) || amount <= 0) return json(400, { error: "Invalid lesson price" });

    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from("payments")
      .select("paypal_order_id")
      .eq("booking_id", bookingId)
      .eq("student_id", auth.sub)
      .eq("payment_method", "paypal")
      .eq("status", "pending")
      .not("paypal_order_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingPaymentError) throw existingPaymentError;
    if (existingPayment?.paypal_order_id) return json(200, { orderId: existingPayment.paypal_order_id });

    const config = paypalConfig();
    const accessToken = await getAccessToken(config);
    const response = await fetch(`${config.apiBase}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "PayPal-Request-Id": `booking-${bookingId}-${crypto.randomUUID()}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: bookingId,
          custom_id: bookingId,
          description: "Lesson booking",
          amount: { currency_code: "GBP", value: amount.toFixed(2) },
        }],
      }),
    });
    const order = await response.json();
    if (!response.ok || !order.id) {
      console.error("PayPal create order failed:", response.status, order);
      return json(502, { error: "PayPal could not start checkout. Please try again." });
    }

    const { error: insertError } = await supabase.from("payments").insert({
      booking_id: booking.id,
      student_id: booking.student_id,
      tutor_id: booking.tutor_id,
      amount,
      currency: "GBP",
      payment_method: "paypal",
      paypal_order_id: order.id,
      status: "pending",
    });
    if (insertError) {
      console.error("PayPal pending order could not be saved:", insertError);
      return json(500, { error: "Could not save the payment attempt. Please retry checkout." });
    }

    return json(200, { orderId: order.id });
  } catch (error) {
    console.error("paypal-create-order failed:", error);
    return json(500, { error: error instanceof Error ? error.message : "Could not start PayPal checkout" });
  }
});

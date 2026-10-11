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

function getCapture(order: any) {
  return order?.purchase_units?.flatMap((unit: any) => unit?.payments?.captures || []).find((capture: any) => capture?.status === "COMPLETED") || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const auth = await verifySupabaseJwt(req.headers.get("Authorization"));
    const { bookingId, orderId } = await req.json();
    if (typeof bookingId !== "string" || !bookingId || typeof orderId !== "string" || !orderId) {
      return json(400, { error: "bookingId and orderId are required" });
    }

    const supabase = supabaseAdmin();
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, student_id, tutor_id, duration_minutes, lesson_price, payment_status")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError || !booking) return json(404, { error: "Booking not found" });
    if (booking.student_id !== auth.sub) return json(403, { error: "You cannot pay for this booking" });

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, amount, currency, status, paypal_transaction_id")
      .eq("booking_id", bookingId)
      .eq("student_id", auth.sub)
      .eq("paypal_order_id", orderId)
      .maybeSingle();
    if (paymentError || !payment) return json(404, { error: "PayPal order was not created for this booking" });
    if (payment.status === "completed") {
      const { error: bookingRepairError } = await supabase.from("bookings")
        .update({ status: "confirmed", payment_status: "paid", updated_at: new Date().toISOString() })
        .eq("id", bookingId)
        .eq("student_id", auth.sub);
      if (bookingRepairError) throw bookingRepairError;
      return json(200, { ok: true, orderId, transactionId: payment.paypal_transaction_id });
    }

    const savedPrice = Number(booking.lesson_price || 0);
    let expectedAmount = savedPrice;
    if (expectedAmount <= 0) {
      const { data: tutor, error: tutorError } = await supabase.from("profiles").select("hourly_rate").eq("id", booking.tutor_id).maybeSingle();
      if (tutorError || !tutor) return json(400, { error: "Unable to determine lesson price" });
      expectedAmount = Number(((Number(tutor.hourly_rate || 0) * Number(booking.duration_minutes || 60)) / 60).toFixed(2));
    }

    const config = paypalConfig();
    const accessToken = await getAccessToken(config);
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const orderResponse = await fetch(`${config.apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, { headers });
    let order = await orderResponse.json();
    if (!orderResponse.ok) {
      console.error("PayPal order lookup failed:", orderResponse.status, order);
      return json(502, { error: "Could not verify the PayPal order" });
    }

    const purchaseUnit = order.purchase_units?.[0];
    if (purchaseUnit?.custom_id !== bookingId || purchaseUnit?.reference_id !== bookingId) {
      return json(400, { error: "PayPal order does not match this booking" });
    }
    if (purchaseUnit?.amount?.currency_code !== "GBP" || Number(purchaseUnit?.amount?.value) !== expectedAmount) {
      return json(400, { error: "PayPal order amount does not match this booking" });
    }

    let capture = getCapture(order);
    if (order.status !== "COMPLETED") {
      const captureResponse = await fetch(`${config.apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: "POST",
        headers: { ...headers, "PayPal-Request-Id": `capture-${orderId}` },
      });
      order = await captureResponse.json();
      if (!captureResponse.ok) {
        // PayPal may have completed the capture while the previous request lost its response.
        const retryResponse = await fetch(`${config.apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, { headers });
        if (!retryResponse.ok) {
          console.error("PayPal capture failed:", captureResponse.status, order);
          return json(502, { error: "PayPal could not complete the payment. Please try again." });
        }
        order = await retryResponse.json();
      }
      capture = getCapture(order);
    }

    if (order.status !== "COMPLETED" || !capture || capture.amount?.currency_code !== "GBP" || Number(capture.amount?.value) !== expectedAmount) {
      return json(409, { error: "PayPal has not confirmed the expected payment amount" });
    }

    const { error: saveError } = await supabase.from("payments").update({
      amount: Number(capture.amount.value),
      currency: capture.amount.currency_code,
      paypal_transaction_id: capture.id,
      status: "completed",
      payment_date: capture.create_time || new Date().toISOString(),
    }).eq("id", payment.id);
    if (saveError) {
      console.error("PayPal capture could not be saved:", saveError);
      return json(500, { error: "PayPal completed the payment, but the booking update needs to be retried" });
    }

    const { error: bookingUpdateError } = await supabase.from("bookings")
      .update({ status: "confirmed", payment_status: "paid", updated_at: new Date().toISOString() })
      .eq("id", bookingId)
      .eq("student_id", auth.sub);
    if (bookingUpdateError) {
      console.error("PayPal booking update failed:", bookingUpdateError);
      return json(500, { error: "PayPal completed the payment, but the booking update needs to be retried" });
    }

    return json(200, { ok: true, orderId, transactionId: capture.id });
  } catch (error) {
    console.error("paypal-capture-order failed:", error);
    return json(500, { error: error instanceof Error ? error.message : "Could not capture PayPal payment" });
  }
});

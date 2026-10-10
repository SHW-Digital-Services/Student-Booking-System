---
name: student-booking-stripe-webhooks
description: Set up, deploy, troubleshoot, or maintain Stripe webhooks and related Supabase Edge Functions for the student-booking-system project.
---

# Student Booking Stripe Webhooks

Use this skill for Stripe payment webhook work in this repository. The relevant implementation is under `supabase/functions/stripe-webhook/`, with checkout setup and payment reconciliation in the sibling `stripe-init` and `stripe-reconcile` functions.

## Project facts

- Stripe Checkout is initialized by `stripe-init`. It writes `booking_id` and `student_id` into Checkout Session metadata (and PaymentIntent metadata).
- `stripe-webhook` handles `checkout.session.completed`, verifies the `stripe-signature` against the untouched request body using `STRIPE_WEBHOOK_SECRET`, saves or repairs the payment row, stores the Stripe customer ID on the student profile, then marks the booking confirmed and paid.
- The public webhook URL is `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`.
- `supabase/config.toml` sets `verify_jwt = false` for this endpoint. Keep that setting: Stripe does not send a Supabase user JWT, and the handler performs Stripe signature verification itself. Never remove the handler's signature check.
- This repository also has Supabase Edge Functions for checkout, reconciliation, customer portal, password reset, booking notifications, and system mail. Treat each function's auth checks and required environment variables independently.
- A Stripe webhook is an incoming Stripe-to-Edge-Function request. It is distinct from a Supabase Database Webhook, which sends table-change payloads.

## Workflow

1. Inspect the current handler, `stripe-init`, `stripe-reconcile`, `supabase/config.toml`, and function `deno.json` files before changing behavior. Confirm event metadata and payment/booking columns from the current schema or live project rather than assuming names.
2. Confirm the intended Supabase project before any remote operation. Compare the project ref in `VITE_SUPABASE_URL`, the local Supabase link metadata, and the connected Supabase account. Local generated link metadata can be stale; do not deploy or set secrets merely because it exists. If project identity/access is ambiguous, stop and tell the user which ref is unresolved.
3. Configure Edge Function secrets through Supabase secrets, never in Vite variables or committed files. `stripe-webhook` requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY`; Supabase supplies `SUPABASE_URL`. Other Stripe functions may additionally need `SUPABASE_ANON_KEY` and `FRONTEND_URL`; inspect their source before configuring.
4. Deploy `stripe-webhook` with gateway JWT verification disabled, matching `supabase/config.toml`. Deploy companion functions only when the requested flow needs them.
5. In Stripe, add a webhook endpoint at the function URL and subscribe at minimum to `checkout.session.completed`, the event currently handled by this function. Use the signing secret generated for this exact endpoint as `STRIPE_WEBHOOK_SECRET`. Keep test-mode and live-mode endpoints/secrets separate.
6. Verify delivery with a Stripe test event or test checkout, then inspect Stripe delivery status and Supabase Edge Function logs. Confirm the handler returns 2xx and that payment persistence and booking status are correct. A successful function response alone does not prove the complete payment flow.

## Constraints

- Do not put Stripe secret keys, webhook signing secrets, Supabase service-role keys, or database credentials in `VITE_*`, browser code, or tracked files.
- Preserve idempotent payment handling. Stripe can retry deliveries; do not add duplicate payment rows or mark a booking paid from an unverified request.
- The current handler acknowledges some persistence failures with HTTP 200 after logging them. When changing reliability behavior, review Stripe retry/idempotency implications and the reconciliation path before returning different statuses.
- Report local validation separately from confirmed Stripe delivery or deployed Supabase state. Do not claim the live flow works without a successful test event/checkout and database verification.

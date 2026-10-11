Production setup
================

Tutor email
-----------
- The tutor Send Email action calls the Supabase `system-mail` Edge Function using the signed-in user's session.
- Deploy `supabase/functions/system-mail` to the same Supabase project used by the frontend. Its deployment configuration is in `supabase/config.toml`.
- Apply the `20260612150000_system_mail.sql` migration if it is not already applied.
- Set `BREVO_API_KEY` and `BREVO_FROM` (a verified sender email address) in Supabase Edge Function secrets. These are server secrets, not Vercel frontend variables.
- The function records messages in `system_mail` and sends them through Brevo. The UI reports success only when the external email is sent.
- No Vercel `/api/email/send-student` route is required.


Required environment variables
- `VITE_SUPABASE_URL` - public Supabase URL for the frontend
- `VITE_SUPABASE_ANON_KEY` - public anon key for Supabase (frontend)
- `VITE_PAYPAL_CLIENT_ID` - PayPal app client ID used to load PayPal checkout in the frontend

Supabase Edge Function secrets
- `PAYPAL_CLIENT_ID` - PayPal app client ID (same public ID as `VITE_PAYPAL_CLIENT_ID`)
- `PAYPAL_CLIENT_SECRET` - PayPal app secret; keep this server-side
- `PAYPAL_ENVIRONMENT` - `sandbox` while testing, then `live` for real payments
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-only)
- `SUPABASE_ANON_KEY` - Supabase anon key used by Edge Functions to identify the signed-in user
- `SUPABASE_URL` - Supabase URL (provided by Supabase in hosted Edge Functions)

Notes
- Student checkout orders are created by `supabase/functions/paypal-create-order/index.ts`.
- Approved orders are captured and verified by `supabase/functions/paypal-capture-order/index.ts`.
- The capture function checks the booking owner, order reference, currency, and amount with PayPal before it updates `bookings` and `payments`.
- PayPal uses the existing `paypal_order_id` and `paypal_transaction_id` columns in `payments`.

Deploy checklist
- Set `VITE_PAYPAL_CLIENT_ID` in the frontend hosting environment.
- Add the PayPal credentials and Supabase keys as Supabase Edge Function secrets; never put `PAYPAL_CLIENT_SECRET` or the service role key in a `VITE_*` variable.
- In PayPal Developer Dashboard, use sandbox app credentials for testing and live app credentials for production.
- Deploy `paypal-create-order` and `paypal-capture-order` to the same Supabase project used by the frontend.
- Confirm the PayPal app client ID matches `VITE_PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_ID`, and that `PAYPAL_ENVIRONMENT` matches the selected app environment.
- Complete a sandbox booking and verify PayPal shows a completed capture and Supabase records the PayPal order/transaction and marks the booking paid.

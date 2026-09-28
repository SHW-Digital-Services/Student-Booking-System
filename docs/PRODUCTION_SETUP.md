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
- `VITE_STRIPE_PUBLIC_KEY` - Stripe publishable key for the frontend

Server-side required env vars
- `STRIPE_SECRET_KEY` - Stripe secret key (server)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret (for webhooks)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-only, used by server routes to write records)
- `SUPABASE_ANON_KEY` - Supabase anon key used by edge functions to identify the current user
- `FRONTEND_URL` - Base URL used for Stripe success and cancel redirects
- `SUPABASE_URL` - Supabase URL used by the Stripe webhook function

Notes
- Student checkout is handled by `supabase/functions/stripe-init/index.ts`.
- Stripe webhook processing is handled by `supabase/functions/stripe-webhook/index.ts`.
- Stripe customer portal links are handled by `supabase/functions/stripe-portal/index.ts`.
- The webhook updates `bookings` and inserts `payments` rows after a successful checkout session.

Deploy checklist
- Provide the server env vars in your hosting provider (Vercel, Azure, etc.).
- Ensure RLS policies on Supabase allow the server (service role) to write `payments` and update `bookings`.
- Configure the Stripe webhook endpoint and protect it with the Stripe signing secret.
- For the live webhook endpoint, make sure the Supabase Edge Function has the live `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` configured in its secrets, then redeploy `stripe-webhook`.
- Run end-to-end tests for booking → payment → booking status update.

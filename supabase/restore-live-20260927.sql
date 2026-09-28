-- Execute with psql, not the Supabase SQL Editor. See LIVE_DATABASE_EXPORT.md.
\set ON_ERROR_STOP on
BEGIN;

-- Match the exported application-role settings. The raw roles export also
-- contains the platform-managed supabase_admin timeout; leave that to Supabase.
ALTER ROLE anon SET statement_timeout TO '3s';
ALTER ROLE authenticated SET statement_timeout TO '8s';
ALTER ROLE authenticator SET statement_timeout TO '8s';

\ir live-schema-20260927.sql
\ir live-managed-customizations-20260927.sql

-- Required for circular booking/video-meeting FKs and auth signup triggers.
SET LOCAL session_replication_role = replica;
\ir data-20260927.local
SET LOCAL session_replication_role = origin;

\ir history-schema-20260927.local
\ir history-data-20260927.local
COMMIT;

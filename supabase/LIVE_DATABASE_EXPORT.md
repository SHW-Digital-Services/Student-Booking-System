# Live database export — 27 September 2026

Source: **Edu**, project `osavisvnpiuqiinkybpq`, PostgreSQL 17. Exported from the live database through the authenticated Supabase CLI, not reconstructed from repository migrations.

## Files

- `live-schema-20260927.sql`: application schema, functions, indexes, constraints, grants, RLS policies, extensions and Realtime publication memberships.
- `live-managed-customizations-20260927.sql`: the live signup trigger on `auth.users` and four custom `storage.objects` policies, queried separately from the live catalog.
- `data-20260927.local`: SQL COPY records, including application records, authentication users and storage metadata. The `.local` extension keeps sensitive records excluded from Git; the contents are SQL for psql.
- `roles-20260927.local`: raw role settings export, retained for reference. No custom roles were in this export. The restore script applies the three application-role timeouts and leaves the managed `supabase_admin` timeout to the destination platform.
- `history-schema-20260927.local` and `history-data-20260927.local`: Supabase migration history.
- `restore-live-20260927.sql`: psql entry point; loads the files in order in one transaction and stops on error.

## Restore to a fresh Supabase project

Use a new, empty Supabase project with PostgreSQL 17 and compatible managed Auth/Storage schemas. Do not run the repository migrations first or create users/buckets before restoring. Do not run this against the source project.

Install PostgreSQL's `psql` client. From the new project's **Connect** panel, get the **Session pooler** hostname, port and username. Use the destination's database password when prompted:

```powershell
cd D:\Dev\student-booking-system
psql "host=DESTINATION_SESSION_POOLER_HOST port=5432 dbname=postgres user=postgres.DESTINATION_PROJECT_REF sslmode=require" -W -f .\supabase\restore-live-20260927.sql
```

Replace both placeholders with the destination's values. Keep all export files together in this directory. `\ir` resolves filenames relative to the restore script. The COPY payload and psql commands mean this restore file cannot be pasted into the dashboard SQL Editor.

Triggers are disabled only for the data-loading portion, following Supabase's documented restore approach. This accommodates the circular foreign keys between bookings and video meetings and prevents duplicate profile creation during auth-user import. The transaction rolls back if an SQL statement fails. A real destination restore has not been executed or tested.

## Scope and remaining project setup

The live inventory contains 26 public application tables, four storage buckets, three stored objects, and zero Vault secrets. SQL includes bucket and object metadata, **not the three uploaded file contents**. Copy those files separately using Supabase Storage tooling; metadata alone cannot serve the files.

Edge Function deployments and secrets, Auth redirect URLs/providers/email settings, API keys and external payment/email service configuration are outside this SQL export. Configure them separately on the destination and point the frontend at its URL and keys. Existing stored absolute URLs may still reference the source project and require a deliberate update after copying storage files.

The schema and data were dumped separately while the source remained online. Each data dump has its own consistent snapshot; this is not a single atomic snapshot spanning all export files. If the source changes before cutover, take a final coordinated export.

## Validation performed

The CLI successfully exported the schema, roles and data. The main data dump contains 57 COPY sections with 57 matching end markers, including all 26 application tables. Sensitive `.local` exports are ignored by Git. Custom managed-schema policies and the signup trigger were read from the live database; the schema export already includes all three Realtime memberships, so the supplemental file does not duplicate them.

Validate the restored database's row counts, login flow, booking creation, storage access and Realtime updates before switching the application over. Source data and definitions were preserved; this export does not redesign policies or fix existing application behavior.

Reference: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

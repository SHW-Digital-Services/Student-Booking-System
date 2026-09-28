-- Live customizations from Edu (osavisvnpiuqiinkybpq), 2026-09-27.
-- Run after live-schema-20260927.sql in a fresh Supabase project.
-- Realtime publication memberships are already in the schema export.
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY storage_homework_insert_own_folder ON storage.objects
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'homework-submissions'::text AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY storage_lesson_activities_insert_authenticated ON storage.objects
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lesson-activities'::text);

CREATE POLICY storage_profile_pictures_update_own_folder ON storage.objects
AS PERMISSIVE FOR UPDATE TO authenticated
USING (bucket_id = 'profile-pictures'::text AND (storage.foldername(name))[1] = (SELECT auth.uid()::text))
WITH CHECK (bucket_id = 'profile-pictures'::text AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));

CREATE POLICY storage_profile_pictures_insert_own_folder ON storage.objects
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'profile-pictures'::text AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));

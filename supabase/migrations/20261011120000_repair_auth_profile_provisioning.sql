-- Create a profile for each new Supabase Auth user. Public registration must
-- never derive the privileged tutor role from user-editable metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, date_of_birth)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    'student',
    CASE
      WHEN pg_input_is_valid(NEW.raw_user_meta_data ->> 'date_of_birth', 'date')
        THEN (NEW.raw_user_meta_data ->> 'date_of_birth')::date
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Repair accounts created before the trigger existed. Only infer the
-- non-privileged student role; tutor profiles must be restored by an admin.
INSERT INTO public.profiles (id, email, full_name, role, date_of_birth)
SELECT
  users.id,
  COALESCE(users.email, ''),
  COALESCE(users.raw_user_meta_data ->> 'full_name', ''),
  'student',
  CASE
    WHEN pg_input_is_valid(users.raw_user_meta_data ->> 'date_of_birth', 'date')
      THEN (users.raw_user_meta_data ->> 'date_of_birth')::date
    ELSE NULL
  END
FROM auth.users AS users
WHERE COALESCE(users.raw_user_meta_data ->> 'role', 'student') = 'student'
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profiles
    WHERE profiles.id = users.id
  )
ON CONFLICT (id) DO NOTHING;

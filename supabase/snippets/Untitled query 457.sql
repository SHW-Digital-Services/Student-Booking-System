-- 20260122155034_init_schema.sql
-- Student Booking System - Initial Schema (Supabase / Postgres)
-- Safe to run via: supabase db reset

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- Helper: updated_at trigger
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Profiles
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null check (role in ('student', 'tutor')),
  date_of_birth date null,
  phone_number text null,
  address text null,
  profile_picture_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create profile on auth user signup (uses metadata if present)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, date_of_birth)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    nullif(new.raw_user_meta_data->>'date_of_birth', '')::date
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ============================================================
-- Bookings
-- ============================================================
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  lesson_date date not null,
  lesson_time time not null,
  duration_minutes int not null default 60 check (duration_minutes > 0 and duration_minutes <= 480),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_student_id_idx on public.bookings(student_id);
create index if not exists bookings_tutor_id_idx on public.bookings(tutor_id);
create index if not exists bookings_lesson_date_idx on public.bookings(lesson_date);

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

-- ============================================================
-- Payments
-- ============================================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid null references public.bookings(id) on delete set null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'GBP',
  payment_method text not null default 'paypal',
  transaction_reference text null,
  order_reference text null,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'refunded')),
  payment_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists payments_student_id_idx on public.payments(student_id);
create index if not exists payments_booking_id_idx on public.payments(booking_id);
create index if not exists payments_payment_date_idx on public.payments(payment_date);

-- ============================================================
-- Lessons
-- ============================================================
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid null references public.bookings(id) on delete set null,
  lesson_date date not null,
  lesson_time time not null,
  duration_minutes int not null default 60 check (duration_minutes > 0 and duration_minutes <= 480),
  title text not null,
  covered_in_previous_lesson text not null default '',
  covered_in_current_lesson text not null default '',
  next_lesson_description text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lessons_student_id_idx on public.lessons(student_id);
create index if not exists lessons_tutor_id_idx on public.lessons(tutor_id);
create index if not exists lessons_booking_id_idx on public.lessons(booking_id);
create index if not exists lessons_lesson_date_idx on public.lessons(lesson_date);

drop trigger if exists trg_lessons_updated_at on public.lessons;
create trigger trg_lessons_updated_at
before update on public.lessons
for each row execute function public.set_updated_at();

-- ============================================================
-- Lesson Activities
-- ============================================================
create table if not exists public.lesson_activities (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  title text not null,
  description text not null default '',
  file_url text not null,
  file_name text not null,
  file_size bigint not null default 0 check (file_size >= 0),
  uploaded_by uuid not null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lesson_activities_lesson_id_idx on public.lesson_activities(lesson_id);
create index if not exists lesson_activities_uploaded_by_idx on public.lesson_activities(uploaded_by);

-- ============================================================
-- Homework Submissions
-- ============================================================
create table if not exists public.homework_submissions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  submission_file_url text not null,
  submission_file_name text not null,
  submission_file_size bigint not null default 0 check (submission_file_size >= 0),
  submitted_at timestamptz not null default now(),
  tutor_feedback text null,
  marked_at timestamptz null,
  marked_by uuid null references public.profiles(id) on delete set null,
  status text not null default 'submitted' check (status in ('submitted', 'marked', 'resubmitted')),
  created_at timestamptz not null default now()
);

create index if not exists homework_submissions_lesson_id_idx on public.homework_submissions(lesson_id);
create index if not exists homework_submissions_student_id_idx on public.homework_submissions(student_id);
create index if not exists homework_submissions_submitted_at_idx on public.homework_submissions(submitted_at);

-- ============================================================
-- Tutor Availability
-- ============================================================
create table if not exists public.tutor_availability (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Prevent duplicates for the exact same slot (matches your onConflict)
  unique (tutor_id, day_of_week, start_time)
);

create index if not exists tutor_availability_tutor_id_idx on public.tutor_availability(tutor_id);

drop trigger if exists trg_tutor_availability_updated_at on public.tutor_availability;
create trigger trg_tutor_availability_updated_at
before update on public.tutor_availability
for each row execute function public.set_updated_at();

-- ============================================================
-- Blocked Time Slots
-- ============================================================
create table if not exists public.blocked_time_slots (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_datetime > start_datetime)
);

create index if not exists blocked_time_slots_tutor_id_idx on public.blocked_time_slots(tutor_id);
create index if not exists blocked_time_slots_start_idx on public.blocked_time_slots(start_datetime);

drop trigger if exists trg_blocked_time_slots_updated_at on public.blocked_time_slots;
create trigger trg_blocked_time_slots_updated_at
before update on public.blocked_time_slots
for each row execute function public.set_updated_at();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_activities enable row level security;
alter table public.homework_submissions enable row level security;
alter table public.tutor_availability enable row level security;
alter table public.blocked_time_slots enable row level security;

-- ---------------------------
-- Profiles policies
-- ---------------------------
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- ---------------------------
-- Bookings policies
-- ---------------------------
drop policy if exists "bookings_select_own_student_or_tutor" on public.bookings;
create policy "bookings_select_own_student_or_tutor"
on public.bookings
for select
to authenticated
using (student_id = auth.uid() or tutor_id = auth.uid());

drop policy if exists "bookings_insert_student_or_tutor" on public.bookings;
create policy "bookings_insert_student_or_tutor"
on public.bookings
for insert
to authenticated
with check (
  -- student creates their own booking
  (student_id = auth.uid())
  or
  -- tutor creates booking for a student (POS system)
  (tutor_id = auth.uid())
);

drop policy if exists "bookings_update_student_or_tutor" on public.bookings;
create policy "bookings_update_student_or_tutor"
on public.bookings
for update
to authenticated
using (student_id = auth.uid() or tutor_id = auth.uid())
with check (student_id = auth.uid() or tutor_id = auth.uid());

-- ---------------------------
-- Payments policies
-- ---------------------------
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own"
on public.payments
for select
to authenticated
using (
  student_id = auth.uid()
  or exists (
    select 1
    from public.bookings b
    where b.id = payments.booking_id
      and b.tutor_id = auth.uid()
  )
);

drop policy if exists "payments_insert_student_or_tutor_for_booking" on public.payments;
create policy "payments_insert_student_or_tutor_for_booking"
on public.payments
for insert
to authenticated
with check (
  -- student paying for themselves
  student_id = auth.uid()
  or (
    -- tutor recording payment for a booking they own
    booking_id is not null
    and exists (
      select 1
      from public.bookings b
      where b.id = payments.booking_id
        and b.tutor_id = auth.uid()
    )
  )
);

-- (Optional) restrict updates; current app doesn't update payments after insert.
drop policy if exists "payments_update_none" on public.payments;
create policy "payments_update_none"
on public.payments
for update
to authenticated
using (false)
with check (false);

-- ---------------------------
-- Lessons policies
-- ---------------------------
drop policy if exists "lessons_select_own_student_or_tutor" on public.lessons;
create policy "lessons_select_own_student_or_tutor"
on public.lessons
for select
to authenticated
using (student_id = auth.uid() or tutor_id = auth.uid());

drop policy if exists "lessons_insert_tutor_only" on public.lessons;
create policy "lessons_insert_tutor_only"
on public.lessons
for insert
to authenticated
with check (tutor_id = auth.uid());

drop policy if exists "lessons_update_tutor_only" on public.lessons;
create policy "lessons_update_tutor_only"
on public.lessons
for update
to authenticated
using (tutor_id = auth.uid())
with check (tutor_id = auth.uid());

drop policy if exists "lessons_delete_tutor_only" on public.lessons;
create policy "lessons_delete_tutor_only"
on public.lessons
for delete
to authenticated
using (tutor_id = auth.uid());

-- ---------------------------
-- Lesson activities policies
-- ---------------------------
drop policy if exists "lesson_activities_select_if_in_lesson" on public.lesson_activities;
create policy "lesson_activities_select_if_in_lesson"
on public.lesson_activities
for select
to authenticated
using (
  exists (
    select 1
    from public.lessons l
    where l.id = lesson_activities.lesson_id
      and (l.student_id = auth.uid() or l.tutor_id = auth.uid())
  )
);

drop policy if exists "lesson_activities_insert_tutor_only" on public.lesson_activities;
create policy "lesson_activities_insert_tutor_only"
on public.lesson_activities
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.lessons l
    where l.id = lesson_activities.lesson_id
      and l.tutor_id = auth.uid()
  )
);

drop policy if exists "lesson_activities_delete_tutor_only" on public.lesson_activities;
create policy "lesson_activities_delete_tutor_only"
on public.lesson_activities
for delete
to authenticated
using (
  exists (
    select 1
    from public.lessons l
    where l.id = lesson_activities.lesson_id
      and l.tutor_id = auth.uid()
  )
);

-- ---------------------------
-- Homework submissions policies
-- ---------------------------
drop policy if exists "homework_select_student_or_tutor_of_lesson" on public.homework_submissions;
create policy "homework_select_student_or_tutor_of_lesson"
on public.homework_submissions
for select
to authenticated
using (
  student_id = auth.uid()
  or exists (
    select 1
    from public.lessons l
    where l.id = homework_submissions.lesson_id
      and l.tutor_id = auth.uid()
  )
);

drop policy if exists "homework_insert_student_only" on public.homework_submissions;
create policy "homework_insert_student_only"
on public.homework_submissions
for insert
to authenticated
with check (student_id = auth.uid());

drop policy if exists "homework_update_tutor_only" on public.homework_submissions;
create policy "homework_update_tutor_only"
on public.homework_submissions
for update
to authenticated
using (
  exists (
    select 1
    from public.lessons l
    where l.id = homework_submissions.lesson_id
      and l.tutor_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.lessons l
    where l.id = homework_submissions.lesson_id
      and l.tutor_id = auth.uid()
  )
);

-- ---------------------------
-- Tutor availability policies
-- ---------------------------
drop policy if exists "availability_select_authenticated" on public.tutor_availability;
create policy "availability_select_authenticated"
on public.tutor_availability
for select
to authenticated
using (true);

drop policy if exists "availability_upsert_tutor_only" on public.tutor_availability;
create policy "availability_upsert_tutor_only"
on public.tutor_availability
for all
to authenticated
using (tutor_id = auth.uid())
with check (tutor_id = auth.uid());

-- ---------------------------
-- Blocked time slots policies
-- ---------------------------
drop policy if exists "blocked_slots_select_authenticated" on public.blocked_time_slots;
create policy "blocked_slots_select_authenticated"
on public.blocked_time_slots
for select
to authenticated
using (true);

drop policy if exists "blocked_slots_manage_tutor_only" on public.blocked_time_slots;
create policy "blocked_slots_manage_tutor_only"
on public.blocked_time_slots
for all
to authenticated
using (tutor_id = auth.uid())
with check (tutor_id = auth.uid());

-- ============================================================
-- Storage buckets (optional, but matches your code)
-- ============================================================
-- Buckets used by your app:
-- - profile-pictures
-- - homework-submissions
-- - lesson-activities
insert into storage.buckets (id, name, public)
values
  ('profile-pictures', 'profile-pictures', true),
  ('homework-submissions', 'homework-submissions', true),
  ('lesson-activities', 'lesson-activities', true)
on conflict (id) do nothing;

-- ============================================================
-- Storage RLS (minimal; buckets are public-read above)
-- ============================================================
-- Note: storage.objects already has RLS enabled in Supabase.
-- These policies allow uploads for authenticated users.

drop policy if exists "storage_profile_pictures_insert_own_folder" on storage.objects;
create policy "storage_profile_pictures_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage_profile_pictures_update_own_folder" on storage.objects;
create policy "storage_profile_pictures_update_own_folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage_homework_insert_own_folder" on storage.objects;
create policy "storage_homework_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'homework-submissions'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Lesson activities: your paths do not include tutor id, so this is permissive.
drop policy if exists "storage_lesson_activities_insert_authenticated" on storage.objects;
create policy "storage_lesson_activities_insert_authenticated"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'lesson-activities');


-- supabase/seed.sql
-- Seed data for local development (SAFE with auth FK constraints)
-- This seed assumes you will create real users via Supabase Auth first.
-- It only inserts rows when suitable profiles exist.

set search_path = public;

-- =====================================================
-- Storage buckets (idempotent)
-- =====================================================
insert into storage.buckets (id, name, public)
values
  ('profile-pictures', 'profile-pictures', true),
  ('homework-submissions', 'homework-submissions', true),
  ('lesson-activities', 'lesson-activities', true)
on conflict (id) do nothing;

-- =====================================================
-- Seed tutor availability for the first tutor found
-- =====================================================
with tutor as (
  select id
  from public.profiles
  where role = 'tutor'
  order by created_at asc
  limit 1
)
insert into public.tutor_availability (
  tutor_id,
  day_of_week,
  start_time,
  end_time,
  is_available
)
select
  tutor.id,
  v.day_of_week,
  v.start_time,
  v.end_time,
  true
from tutor
cross join (
  values
    (1, time '09:00', time '12:00'), -- Monday
    (3, time '13:00', time '17:00'), -- Wednesday
    (5, time '10:00', time '14:00')  -- Friday
) as v(day_of_week, start_time, end_time)
on conflict (tutor_id, day_of_week, start_time) do nothing;

-- =====================================================
-- Seed a sample booking between first student + first tutor
-- =====================================================
with
student as (
  select id
  from public.profiles
  where role = 'student'
  order by created_at asc
  limit 1
),
tutor as (
  select id
  from public.profiles
  where role = 'tutor'
  order by created_at asc
  limit 1
),
new_booking as (
  insert into public.bookings (
    student_id,
    tutor_id,
    lesson_date,
    lesson_time,
    duration_minutes,
    status,
    payment_status,
    notes
  )
  select
    student.id,
    tutor.id,
    (current_date + 2),
    time '10:00',
    60,
    'pending',
    'unpaid',
    'Seeded booking (local dev)'
  from student, tutor
  where student.id is not null and tutor.id is not null and student.id <> tutor.id
  returning id, student_id, tutor_id, lesson_date, lesson_time
)
select 1;

-- =====================================================
-- Seed a sample lesson linked to the most recent booking (if any)
-- =====================================================
with b as (
  select id, student_id, tutor_id, lesson_date, lesson_time
  from public.bookings
  order by created_at desc
  limit 1
)
insert into public.lessons (
  student_id,
  tutor_id,
  booking_id,
  lesson_date,
  lesson_time,
  duration_minutes,
  title,
  covered_in_previous_lesson,
  covered_in_current_lesson,
  next_lesson_description,
  status
)
select
  b.student_id,
  b.tutor_id,
  b.id,
  b.lesson_date,
  b.lesson_time,
  60,
  'Seeded Lesson',
  '',
  'Introduction and setup.',
  'Next time: start first module.',
  'scheduled'
from b
where b.id is not null
  and not exists (select 1 from public.lessons l where l.booking_id = b.id);

-- =====================================================
-- Seed a pending payment row for the most recent booking (if any)
-- =====================================================
with b as (
  select id, student_id
  from public.bookings
  order by created_at desc
  limit 1
)
insert into public.payments (
  booking_id,
  student_id,
  amount,
  currency,
  payment_method,
  transaction_reference,
  order_reference,
  status
)
select
  b.id,
  b.student_id,
  20.00,
  'GBP',
  'paypal',
  null,
  null,
  'pending'
from b
where b.id is not null
  and not exists (select 1 from public.payments p where p.booking_id = b.id);

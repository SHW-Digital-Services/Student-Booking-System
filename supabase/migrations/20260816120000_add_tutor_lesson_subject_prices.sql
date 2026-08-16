-- Tutor lesson subjects and per-subject prices.

alter table public.profiles
  add column if not exists subjects text null,
  add column if not exists hourly_rate numeric(10,2) not null default 30 check (hourly_rate >= 0);

create table if not exists public.tutor_subjects (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tutor_subjects_name_not_blank check (length(trim(name)) > 0),
  constraint tutor_subjects_tutor_name_unique unique (tutor_id, name)
);

create index if not exists tutor_subjects_tutor_id_idx on public.tutor_subjects(tutor_id);
create index if not exists tutor_subjects_active_idx on public.tutor_subjects(is_active);

drop trigger if exists trg_tutor_subjects_updated_at on public.tutor_subjects;
create trigger trg_tutor_subjects_updated_at
before update on public.tutor_subjects
for each row execute function public.set_updated_at();

alter table public.bookings
  add column if not exists lesson_subject_id uuid null references public.tutor_subjects(id) on delete set null,
  add column if not exists lesson_subject_name text null,
  add column if not exists lesson_price numeric(10,2) null check (lesson_price is null or lesson_price >= 0);

create index if not exists bookings_lesson_subject_id_idx on public.bookings(lesson_subject_id);

alter table public.tutor_subjects enable row level security;

drop policy if exists "tutor_subjects_select_authenticated" on public.tutor_subjects;
create policy "tutor_subjects_select_authenticated"
on public.tutor_subjects
for select
to authenticated
using (true);

drop policy if exists "tutor_subjects_insert_tutor_only" on public.tutor_subjects;
create policy "tutor_subjects_insert_tutor_only"
on public.tutor_subjects
for insert
to authenticated
with check (tutor_id = auth.uid());

drop policy if exists "tutor_subjects_update_tutor_only" on public.tutor_subjects;
create policy "tutor_subjects_update_tutor_only"
on public.tutor_subjects
for update
to authenticated
using (tutor_id = auth.uid())
with check (tutor_id = auth.uid());

drop policy if exists "tutor_subjects_delete_tutor_only" on public.tutor_subjects;
create policy "tutor_subjects_delete_tutor_only"
on public.tutor_subjects
for delete
to authenticated
using (tutor_id = auth.uid());

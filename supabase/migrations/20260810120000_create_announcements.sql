create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(trim(message)) > 0 and char_length(message) <= 500),
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_valid_date_range check (ends_at is null or ends_at >= starts_at)
);

create index if not exists announcements_active_dates_idx
  on public.announcements (starts_at, ends_at);

alter table public.announcements enable row level security;

drop policy if exists "announcements_select_authenticated" on public.announcements;
create policy "announcements_select_authenticated"
on public.announcements for select to authenticated using (true);

drop policy if exists "announcements_manage_tutors" on public.announcements;
create policy "announcements_manage_tutors"
on public.announcements for all to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'tutor'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'tutor'));

drop trigger if exists trg_announcements_updated_at on public.announcements;
create trigger trg_announcements_updated_at
before update on public.announcements
for each row execute function public.set_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.announcements;
exception
  when duplicate_object then null;
end;
$$;


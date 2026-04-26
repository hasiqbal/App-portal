-- Linked Islamic calendar events for mobile calendar cards and portal management.
-- Events are linked to exact Hijri date parts and a resolved Gregorian date.
-- Completed events are auto-removed after a grace period.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create or replace function public.current_portal_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'portal_role', ''),
    nullif(auth.jwt() ->> 'portal_role', '')
  );
$$;

create table if not exists public.islamic_calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_type text not null default 'important_date',
  field_label text,
  region text,
  notes text,
  source_name text,
  linked_hijri_day integer not null,
  linked_hijri_month integer not null,
  linked_hijri_year integer not null,
  linked_hijri_label text not null,
  linked_gregorian_date date not null,
  original_hijri_year integer,
  auto_delete_grace_days integer not null default 3,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.islamic_calendar_events
  add column if not exists title text,
  add column if not exists event_type text,
  add column if not exists field_label text,
  add column if not exists region text,
  add column if not exists notes text,
  add column if not exists source_name text,
  add column if not exists linked_hijri_day integer,
  add column if not exists linked_hijri_month integer,
  add column if not exists linked_hijri_year integer,
  add column if not exists linked_hijri_label text,
  add column if not exists linked_gregorian_date date,
  add column if not exists original_hijri_year integer,
  add column if not exists auto_delete_grace_days integer,
  add column if not exists created_by text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.islamic_calendar_events
set
  event_type = coalesce(nullif(event_type, ''), 'important_date'),
  auto_delete_grace_days = coalesce(auto_delete_grace_days, 3),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.islamic_calendar_events
  alter column title set not null,
  alter column event_type set default 'important_date',
  alter column event_type set not null,
  alter column linked_hijri_day set not null,
  alter column linked_hijri_month set not null,
  alter column linked_hijri_year set not null,
  alter column linked_hijri_label set not null,
  alter column linked_gregorian_date set not null,
  alter column auto_delete_grace_days set default 3,
  alter column auto_delete_grace_days set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'islamic_calendar_events_event_type_check'
  ) then
    alter table public.islamic_calendar_events
      add constraint islamic_calendar_events_event_type_check
      check (event_type in ('important_date', 'masjid_event'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'islamic_calendar_events_hijri_day_check'
  ) then
    alter table public.islamic_calendar_events
      add constraint islamic_calendar_events_hijri_day_check
      check (linked_hijri_day between 1 and 30);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'islamic_calendar_events_hijri_month_check'
  ) then
    alter table public.islamic_calendar_events
      add constraint islamic_calendar_events_hijri_month_check
      check (linked_hijri_month between 1 and 12);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'islamic_calendar_events_grace_days_check'
  ) then
    alter table public.islamic_calendar_events
      add constraint islamic_calendar_events_grace_days_check
      check (auto_delete_grace_days between 0 and 30);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'islamic_calendar_events_unique_linked'
  ) then
    alter table public.islamic_calendar_events
      add constraint islamic_calendar_events_unique_linked
      unique (title, event_type, linked_hijri_day, linked_hijri_month, linked_hijri_year);
  end if;
end;
$$;

create index if not exists idx_islamic_calendar_events_gregorian_date
  on public.islamic_calendar_events (linked_gregorian_date);

create index if not exists idx_islamic_calendar_events_type_date
  on public.islamic_calendar_events (event_type, linked_gregorian_date);

create index if not exists idx_islamic_calendar_events_hijri_link
  on public.islamic_calendar_events (linked_hijri_year, linked_hijri_month, linked_hijri_day);

create or replace function public.islamic_calendar_events_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_islamic_calendar_events on public.islamic_calendar_events;
create trigger set_updated_at_islamic_calendar_events
before update on public.islamic_calendar_events
for each row execute function public.islamic_calendar_events_set_updated_at();

create or replace function public.cleanup_completed_islamic_calendar_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
  london_today date := (now() at time zone 'Europe/London')::date;
begin
  with removed as (
    delete from public.islamic_calendar_events
    where linked_gregorian_date < (london_today - auto_delete_grace_days)
    returning 1
  )
  select count(*) into deleted_count from removed;

  return coalesce(deleted_count, 0);
end;
$$;

grant usage on schema public to anon, authenticated;
grant select on public.islamic_calendar_events to anon;
grant select, insert, update, delete on public.islamic_calendar_events to authenticated;
grant all on public.islamic_calendar_events to service_role;
grant execute on function public.cleanup_completed_islamic_calendar_events() to service_role;

alter table public.islamic_calendar_events enable row level security;

drop policy if exists islamic_calendar_events_anon_read on public.islamic_calendar_events;
create policy islamic_calendar_events_anon_read
on public.islamic_calendar_events
for select
to anon
using (true);

drop policy if exists islamic_calendar_events_authenticated_read on public.islamic_calendar_events;
create policy islamic_calendar_events_authenticated_read
on public.islamic_calendar_events
for select
to authenticated
using (public.current_portal_role() in ('admin', 'editor', 'viewer'));

drop policy if exists islamic_calendar_events_authenticated_insert on public.islamic_calendar_events;
create policy islamic_calendar_events_authenticated_insert
on public.islamic_calendar_events
for insert
to authenticated
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists islamic_calendar_events_authenticated_update on public.islamic_calendar_events;
create policy islamic_calendar_events_authenticated_update
on public.islamic_calendar_events
for update
to authenticated
using (public.current_portal_role() in ('admin', 'editor'))
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists islamic_calendar_events_authenticated_delete on public.islamic_calendar_events;
create policy islamic_calendar_events_authenticated_delete
on public.islamic_calendar_events
for delete
to authenticated
using (public.current_portal_role() = 'admin');

select cron.unschedule(jobid)
from cron.job
where jobname = 'cleanup-completed-islamic-calendar-events-daily';

select cron.schedule(
  'cleanup-completed-islamic-calendar-events-daily',
  '5 1 * * *',
  $$
  select public.cleanup_completed_islamic_calendar_events();
  $$
);

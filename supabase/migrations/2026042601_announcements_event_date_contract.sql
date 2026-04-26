-- Ensure announcements event-date contract exists for calendar integrations.
-- Safe to run repeatedly.

alter table if exists public.announcements
  add column if not exists event_date timestamptz;

alter table if exists public.announcements
  add column if not exists recurrence_type text;

alter table if exists public.announcements
  add column if not exists recurrence_interval integer;

alter table if exists public.announcements
  add column if not exists recurrence_weekday integer;

alter table if exists public.announcements
  add column if not exists recurrence_month_day integer;

alter table if exists public.announcements
  add column if not exists recurrence_until timestamptz;

create index if not exists idx_announcements_is_active_published_at
  on public.announcements (is_active, published_at desc);

create index if not exists idx_announcements_event_date
  on public.announcements (event_date);

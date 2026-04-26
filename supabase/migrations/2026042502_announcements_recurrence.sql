-- Add recurrence metadata for announcement-driven event scheduling.
-- Supports one-time, weekly, and monthly recurring events.

alter table if exists public.announcements
  add column if not exists recurrence_type text,
  add column if not exists recurrence_interval integer,
  add column if not exists recurrence_weekday integer,
  add column if not exists recurrence_month_day integer,
  add column if not exists recurrence_until date;

update public.announcements
set recurrence_type = lower(trim(recurrence_type))
where recurrence_type is not null;

update public.announcements
set recurrence_interval = 1
where recurrence_type in ('weekly', 'monthly')
  and recurrence_interval is null;

alter table if exists public.announcements
  alter column recurrence_interval set default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_recurrence_type_check'
  ) then
    alter table public.announcements
      add constraint announcements_recurrence_type_check
      check (
        recurrence_type is null
        or recurrence_type in ('none', 'weekly', 'monthly')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_recurrence_interval_check'
  ) then
    alter table public.announcements
      add constraint announcements_recurrence_interval_check
      check (
        recurrence_interval is null
        or recurrence_interval between 1 and 52
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_recurrence_weekday_check'
  ) then
    alter table public.announcements
      add constraint announcements_recurrence_weekday_check
      check (
        recurrence_weekday is null
        or recurrence_weekday between 0 and 6
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_recurrence_month_day_check'
  ) then
    alter table public.announcements
      add constraint announcements_recurrence_month_day_check
      check (
        recurrence_month_day is null
        or recurrence_month_day between 1 and 31
      );
  end if;
end;
$$;

-- Notification scheduler foundation for one-time and recurring delivery.
-- Safe to run multiple times.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

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

create table if not exists public.notification_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enabled boolean not null default true,
  schedule_type text not null default 'one_time'
    check (schedule_type in ('one_time', 'daily', 'weekly', 'prayer')),
  schedule_timezone text not null default 'Europe/London',
  one_time_at timestamptz,
  next_run_at timestamptz,
  recurrence_days smallint[] not null default '{}',
  prayer_names text[] not null default '{}',
  title text not null,
  body text not null,
  urdu_body text,
  image_url text,
  link_url text,
  cta_label text,
  audience text not null default 'all'
    check (audience in ('all', 'active', 'new')),
  category text not null default 'general',
  created_by text,
  run_count integer not null default 0,
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_automation_events (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.notification_automations(id) on delete set null,
  notification_id uuid,
  scheduled_for timestamptz,
  processed_at timestamptz,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped')),
  recipient_count integer,
  error_message text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.push_notifications
  add column if not exists automation_id uuid,
  add column if not exists trigger_source text not null default 'manual';

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'push_notifications'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'push_notifications_automation_id_fkey'
  ) then
    alter table public.push_notifications
      add constraint push_notifications_automation_id_fkey
      foreign key (automation_id) references public.notification_automations(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists idx_notification_automations_due
  on public.notification_automations (enabled, next_run_at);

create index if not exists idx_notification_automations_schedule
  on public.notification_automations (schedule_type, enabled);

create index if not exists idx_notification_automation_events_created
  on public.notification_automation_events (created_at desc);

create index if not exists idx_notification_automation_events_status
  on public.notification_automation_events (status, created_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'push_notifications'
  ) then
    create index if not exists idx_push_notifications_scheduled_due
      on public.push_notifications (status, scheduled_for)
      where status = 'scheduled';
  end if;
end;
$$;

create or replace function public.notification_scheduler_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_notification_automations on public.notification_automations;
create trigger set_updated_at_notification_automations
before update on public.notification_automations
for each row execute function public.notification_scheduler_set_updated_at();

alter table public.notification_automations enable row level security;
alter table public.notification_automation_events enable row level security;

drop policy if exists notification_automations_read on public.notification_automations;
create policy notification_automations_read
on public.notification_automations
for select
to authenticated
using (public.current_portal_role() in ('admin', 'editor', 'viewer'));

drop policy if exists notification_automations_insert on public.notification_automations;
create policy notification_automations_insert
on public.notification_automations
for insert
to authenticated
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists notification_automations_update on public.notification_automations;
create policy notification_automations_update
on public.notification_automations
for update
to authenticated
using (public.current_portal_role() in ('admin', 'editor'))
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists notification_automations_delete on public.notification_automations;
create policy notification_automations_delete
on public.notification_automations
for delete
to authenticated
using (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists notification_automation_events_read on public.notification_automation_events;
create policy notification_automation_events_read
on public.notification_automation_events
for select
to authenticated
using (public.current_portal_role() in ('admin', 'editor', 'viewer'));

select cron.unschedule(jobid)
from cron.job
where jobname = 'process-recurring-notifications-every-minute';

select cron.schedule(
  'process-recurring-notifications-every-minute',
  '*/1 * * * *',
  $$
  select net.http_post(
    url := 'https://lhaqqqatdztuijgdfdcf.functions.supabase.co/process-recurring-notifications',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTkxMTksImV4cCI6MjA5MTE3NTExOX0.Z3MV96PflYqwoexwsoi7ma4yAO3og1juWWu9YWviLbU","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTkxMTksImV4cCI6MjA5MTE3NTExOX0.Z3MV96PflYqwoexwsoi7ma4yAO3og1juWWu9YWviLbU"}'::jsonb,
    body := '{"source":"pg_cron"}'::jsonb
  );
  $$
);

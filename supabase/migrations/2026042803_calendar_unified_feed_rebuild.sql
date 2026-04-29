-- Fresh calendar pipeline foundation:
-- 1) Archive legacy islamic_calendar_events table (no row migration)
-- 2) Create fresh important-date table (same public name)
-- 3) Disable auto-delete lifecycle for important_date rows
-- 4) Add unified month feed RPC with fail-closed hijri coverage checks

create extension if not exists pgcrypto;
create extension if not exists unaccent;

do $$
begin
  begin
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'cleanup-completed-islamic-calendar-events-daily';
  exception
    when undefined_table or undefined_function then
      null;
  end;
end;
$$;

create or replace function public.cleanup_completed_islamic_calendar_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Important dates are no longer lifecycle-deleted by cron.
  return 0;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'islamic_calendar_events'
      and c.relkind = 'r'
  ) and not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'islamic_calendar_events_archive_20260428'
      and c.relkind = 'r'
  ) then
    execute 'alter table public.islamic_calendar_events rename to islamic_calendar_events_archive_20260428';
  end if;
end;
$$;

create table if not exists public.islamic_calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_type text not null default 'important_date',
  field_label text,
  region text,
  notes text,
  source_name text not null default 'portal-manual',
  linked_hijri_day integer not null,
  linked_hijri_month integer not null,
  linked_hijri_year integer not null default 0,
  linked_hijri_label text,
  linked_gregorian_date date,
  original_hijri_year integer,
  auto_delete_grace_days integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint islamic_calendar_events_event_type_check
    check (event_type in ('important_date')),
  constraint islamic_calendar_events_hijri_day_check
    check (linked_hijri_day between 1 and 30),
  constraint islamic_calendar_events_hijri_month_check
    check (linked_hijri_month between 1 and 12),
  constraint islamic_calendar_events_grace_days_check
    check (auto_delete_grace_days = 0)
);

create unique index if not exists idx_islamic_calendar_events_unique_hijri_title
  on public.islamic_calendar_events (
    lower(title),
    linked_hijri_day,
    linked_hijri_month,
    linked_hijri_year
  );

create index if not exists idx_islamic_calendar_events_v2_hijri_link
  on public.islamic_calendar_events (linked_hijri_year, linked_hijri_month, linked_hijri_day);

create index if not exists idx_islamic_calendar_events_v2_created_at
  on public.islamic_calendar_events (created_at desc);

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

grant usage on schema public to anon, authenticated;
grant select on public.islamic_calendar_events to anon;
grant select, insert, update, delete on public.islamic_calendar_events to authenticated;
grant all on public.islamic_calendar_events to service_role;

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
using (public.current_portal_role() in ('admin', 'editor'));

create or replace function public.try_parse_date(value text)
returns date
language plpgsql
stable
as $$
declare
  trimmed text := nullif(btrim(value), '');
begin
  if trimmed is null then
    return null;
  end if;

  begin
    return (trimmed)::timestamptz::date;
  exception
    when others then
      begin
        return (trimmed)::date;
      exception
        when others then
          return null;
      end;
  end;
end;
$$;

create or replace function public.hijri_month_name_to_number(month_label text)
returns integer
language sql
immutable
as $$
  with normalized as (
    select regexp_replace(lower(unaccent(coalesce(month_label, ''))), '[^a-z]', '', 'g') as key
  )
  select case key
    when 'muharram' then 1
    when 'safar' then 2
    when 'rabialawwal' then 3
    when 'rabialawal' then 3
    when 'rabiulawwal' then 3
    when 'rabiulawal' then 3
    when 'rabialthani' then 4
    when 'rabialakhir' then 4
    when 'rabiuthani' then 4
    when 'rabiulakhir' then 4
    when 'jumadaalula' then 5
    when 'jumadaula' then 5
    when 'jumadaalawwal' then 5
    when 'jumadaalakhirah' then 6
    when 'jumadaalthaniah' then 6
    when 'rajab' then 7
    when 'shaban' then 8
    when 'shaaban' then 8
    when 'ramadan' then 9
    when 'shawwal' then 10
    when 'dhulqadah' then 11
    when 'dhualqadah' then 11
    when 'dhulhijjah' then 12
    when 'dhualhijjah' then 12
    else null
  end
  from normalized;
$$;

create or replace function public.get_calendar_events_for_month(
  p_gregorian_year integer,
  p_gregorian_month integer
)
returns table (
  id text,
  title text,
  event_type text,
  field_label text,
  region text,
  notes text,
  source_name text,
  linked_hijri_label text,
  linked_gregorian_date date,
  auto_delete_grace_days integer,
  source_announcement_id text,
  source_link_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date;
  month_end date;
  expected_days integer;
  coverage_rows integer;
  parsed_rows integer;
begin
  if p_gregorian_year < 1900 or p_gregorian_year > 2200 then
    raise exception 'Invalid gregorian year: %', p_gregorian_year;
  end if;

  if p_gregorian_month < 1 or p_gregorian_month > 12 then
    raise exception 'Invalid gregorian month: %', p_gregorian_month;
  end if;

  month_start := make_date(p_gregorian_year, p_gregorian_month, 1);
  month_end := (month_start + interval '1 month - 1 day')::date;
  expected_days := extract(day from month_end)::integer;

  select count(*)
  into coverage_rows
  from public.hijri_calendar hc
  where hc.gregorian_year = p_gregorian_year
    and hc.gregorian_month = p_gregorian_month;

  if coverage_rows <> expected_days then
    raise exception 'hijri_calendar coverage missing for %-%, expected % rows but found %',
      p_gregorian_year,
      lpad(p_gregorian_month::text, 2, '0'),
      expected_days,
      coverage_rows;
  end if;

  with month_hijri as (
    select
      hc.gregorian_date::date as linked_gregorian_date,
      hc.hijri_date as linked_hijri_label,
      (parts.match)[1]::integer as hijri_day,
      public.hijri_month_name_to_number((parts.match)[2]) as hijri_month,
      nullif((parts.match)[3], '')::integer as hijri_year
    from public.hijri_calendar hc
    join lateral (
      select regexp_match(hc.hijri_date, '^\s*(\d{1,2})\s+(.+?)\s+(\d{1,4})\b') as match
    ) as parts on true
    where hc.gregorian_year = p_gregorian_year
      and hc.gregorian_month = p_gregorian_month
      and parts.match is not null
      and public.hijri_month_name_to_number((parts.match)[2]) between 1 and 12
  )
  select count(*)
  into parsed_rows
  from month_hijri;

  if parsed_rows <> expected_days then
    raise exception 'hijri_calendar parse coverage missing for %-%, expected % parsed rows but found %',
      p_gregorian_year,
      lpad(p_gregorian_month::text, 2, '0'),
      expected_days,
      parsed_rows;
  end if;

  return query
  with month_hijri as (
    select
      hc.gregorian_date::date as linked_gregorian_date,
      hc.hijri_date as linked_hijri_label,
      (parts.match)[1]::integer as hijri_day,
      public.hijri_month_name_to_number((parts.match)[2]) as hijri_month,
      nullif((parts.match)[3], '')::integer as hijri_year
    from public.hijri_calendar hc
    join lateral (
      select regexp_match(hc.hijri_date, '^\s*(\d{1,2})\s+(.+?)\s+(\d{1,4})\b') as match
    ) as parts on true
    where hc.gregorian_year = p_gregorian_year
      and hc.gregorian_month = p_gregorian_month
      and parts.match is not null
      and public.hijri_month_name_to_number((parts.match)[2]) between 1 and 12
  ),
  important_events as (
    select
      e.id::text as id,
      e.title,
      'important_date'::text as event_type,
      e.field_label,
      e.region,
      e.notes,
      coalesce(nullif(e.source_name, ''), 'portal-manual') as source_name,
      mh.linked_hijri_label as linked_hijri_label,
      mh.linked_gregorian_date,
      0::integer as auto_delete_grace_days,
      null::text as source_announcement_id,
      null::text as source_link_url
    from public.islamic_calendar_events e
    join month_hijri mh
      on mh.hijri_day = e.linked_hijri_day
     and mh.hijri_month = e.linked_hijri_month
     and (
      e.linked_hijri_year = 0
      or e.linked_hijri_year = mh.hijri_year
      or not exists (
        select 1
        from month_hijri mh_exact
        where mh_exact.hijri_day = e.linked_hijri_day
          and mh_exact.hijri_month = e.linked_hijri_month
          and mh_exact.hijri_year = e.linked_hijri_year
      )
     )
    where e.event_type = 'important_date'
  ),
  announcement_source as (
    select
      a.id::text as announcement_id,
      coalesce(nullif(btrim(a.title), ''), 'Event') as title,
      coalesce(a.created_at::date, month_start) as created_date,
      to_jsonb(a) as payload
    from public.announcements a
    where coalesce(a.is_active, false) = true
  ),
  announcement_filtered as (
    select
      s.announcement_id,
      s.title,
      s.created_date,
      s.payload,
      case
        when lower(coalesce(nullif(btrim(s.payload ->> 'recurrence_type'), ''), 'none')) in ('weekly', 'monthly')
          then lower(coalesce(nullif(btrim(s.payload ->> 'recurrence_type'), ''), 'none'))
        else 'none'
      end as recurrence_type,
      case
        when nullif(btrim(s.payload ->> 'recurrence_interval'), '') ~ '^\d+$'
          then greatest(1, least(52, (s.payload ->> 'recurrence_interval')::integer))
        else 1
      end as recurrence_interval,
      case
        when nullif(btrim(s.payload ->> 'recurrence_weekday'), '') ~ '^[0-6]$'
          then (s.payload ->> 'recurrence_weekday')::integer
        else null
      end as recurrence_weekday,
      case
        when nullif(btrim(s.payload ->> 'recurrence_month_day'), '') ~ '^\d{1,2}$'
         and (s.payload ->> 'recurrence_month_day')::integer between 1 and 31
          then (s.payload ->> 'recurrence_month_day')::integer
        else null
      end as recurrence_month_day,
      coalesce(
        public.try_parse_date(s.payload ->> 'event_date'),
        public.try_parse_date(s.payload ->> 'start_time'),
        public.try_parse_date(s.payload ->> 'event_time'),
        public.try_parse_date(s.payload ->> 'time'),
        public.try_parse_date(s.payload ->> 'published_at'),
        public.try_parse_date(s.payload ->> 'created_at')
      ) as base_event_date,
      public.try_parse_date(s.payload ->> 'recurrence_until') as recurrence_until_date,
      coalesce(
        nullif(btrim(s.payload ->> 'type'), ''),
        nullif(btrim(s.payload ->> 'event_type'), ''),
        nullif(btrim(s.payload ->> 'category'), '')
      ) as field_label,
      nullif(btrim(s.payload ->> 'link_url'), '') as source_link_url,
      nullif(btrim(coalesce(
        s.payload ->> 'start_time',
        s.payload ->> 'event_time',
        s.payload ->> 'time'
      )), '') as note_time,
      nullif(btrim(coalesce(
        s.payload ->> 'lead_names',
        s.payload ->> 'guests',
        s.payload ->> 'guest_speakers',
        s.payload ->> 'teacher_name'
      )), '') as note_names
    from announcement_source s
    where (
      lower(coalesce(s.payload ->> 'tag', 'false')) in ('true', 't', '1', 'yes', 'y')
      or public.try_parse_date(s.payload ->> 'event_date') is not null
      or nullif(btrim(coalesce(
        s.payload ->> 'start_time',
        s.payload ->> 'event_time',
        s.payload ->> 'time'
      )), '') is not null
      or lower(coalesce(
        nullif(btrim(s.payload ->> 'type'), ''),
        nullif(btrim(s.payload ->> 'event_type'), ''),
        nullif(btrim(s.payload ->> 'category'), '')
      )) like '%event%'
      or lower(coalesce(
        nullif(btrim(s.payload ->> 'type'), ''),
        nullif(btrim(s.payload ->> 'event_type'), ''),
        nullif(btrim(s.payload ->> 'category'), '')
      )) in ('event', 'events', 'jalsa', 'class', 'special', 'ramadan', 'eid', 'jumuah', 'jumu''ah', 'lecture', 'workshop', 'community', 'youth', 'funeral', 'nikah')
    )
  ),
  announcement_normalized as (
    select
      f.announcement_id,
      f.title,
      f.field_label,
      null::text as region,
      nullif(concat_ws(' • ', f.note_time, f.note_names), '') as notes,
      f.source_link_url,
      f.recurrence_type,
      f.recurrence_interval,
      f.recurrence_weekday,
      f.recurrence_month_day,
      f.recurrence_until_date,
      coalesce(f.base_event_date, f.created_date) as effective_base_date
    from announcement_filtered f
  ),
  announcement_occurrences as (
    select
      n.announcement_id,
      n.title,
      n.field_label,
      n.region,
      n.notes,
      n.source_link_url,
      n.effective_base_date as occurrence_date
    from announcement_normalized n
    where n.recurrence_type = 'none'
      and n.effective_base_date between month_start and month_end
      and (n.recurrence_until_date is null or n.effective_base_date <= n.recurrence_until_date)

    union all

    select
      n.announcement_id,
      n.title,
      n.field_label,
      n.region,
      n.notes,
      n.source_link_url,
      gs::date as occurrence_date
    from announcement_normalized n
    cross join lateral (
      select case
        when n.recurrence_weekday between 0 and 6 then n.recurrence_weekday
        else extract(dow from n.effective_base_date)::integer
      end as target_weekday
    ) as weekday_meta
    cross join lateral (
      select (
        n.effective_base_date
        + (((weekday_meta.target_weekday - extract(dow from n.effective_base_date)::integer + 7) % 7) * interval '1 day')
      )::date as anchor_date
    ) as weekly_anchor
    cross join lateral generate_series(month_start::timestamp, month_end::timestamp, interval '1 day') as gs
    where n.recurrence_type = 'weekly'
      and extract(dow from gs)::integer = weekday_meta.target_weekday
      and (n.recurrence_until_date is null or gs::date <= n.recurrence_until_date)
      and mod(abs((gs::date - weekly_anchor.anchor_date)), 7 * n.recurrence_interval) = 0

    union all

    select
      n.announcement_id,
      n.title,
      n.field_label,
      n.region,
      n.notes,
      n.source_link_url,
      make_date(p_gregorian_year, p_gregorian_month, monthly_meta.target_day) as occurrence_date
    from announcement_normalized n
    cross join lateral (
      select case
        when n.recurrence_month_day between 1 and 31 then n.recurrence_month_day
        else extract(day from n.effective_base_date)::integer
      end as target_day
    ) as monthly_meta
    where n.recurrence_type = 'monthly'
      and monthly_meta.target_day <= expected_days
      and (
        n.recurrence_until_date is null
        or make_date(p_gregorian_year, p_gregorian_month, monthly_meta.target_day) <= n.recurrence_until_date
      )
      and mod(
        abs(
          ((p_gregorian_year * 12 + p_gregorian_month)
            - ((extract(year from n.effective_base_date)::integer * 12)
              + extract(month from n.effective_base_date)::integer))
        ),
        n.recurrence_interval
      ) = 0
  ),
  announcement_events as (
    select
      format('announcement-%s-%s', o.announcement_id, to_char(o.occurrence_date, 'YYYY-MM-DD')) as id,
      o.title,
      'masjid_event'::text as event_type,
      o.field_label,
      o.region,
      o.notes,
      'announcements'::text as source_name,
      coalesce(mh.linked_hijri_label, '') as linked_hijri_label,
      o.occurrence_date as linked_gregorian_date,
      0::integer as auto_delete_grace_days,
      o.announcement_id as source_announcement_id,
      o.source_link_url
    from announcement_occurrences o
    left join month_hijri mh
      on mh.linked_gregorian_date = o.occurrence_date
  )
  select
    all_events.id,
    all_events.title,
    all_events.event_type,
    all_events.field_label,
    all_events.region,
    all_events.notes,
    all_events.source_name,
    all_events.linked_hijri_label,
    all_events.linked_gregorian_date,
    all_events.auto_delete_grace_days,
    all_events.source_announcement_id,
    all_events.source_link_url
  from (
    select * from important_events
    union all
    select * from announcement_events
  ) as all_events
  order by all_events.linked_gregorian_date asc, all_events.title asc, all_events.id asc;
end;
$$;

grant execute on function public.get_calendar_events_for_month(integer, integer) to anon;
grant execute on function public.get_calendar_events_for_month(integer, integer) to authenticated;
grant execute on function public.get_calendar_events_for_month(integer, integer) to service_role;
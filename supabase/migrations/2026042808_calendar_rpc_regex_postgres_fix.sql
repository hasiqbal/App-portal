-- Fix PostgreSQL regex parsing in calendar RPC (use POSIX classes, not \\d/\\s).

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
      select regexp_match(hc.hijri_date, '^[[:space:]]*([0-9]{1,2})[[:space:]]+(.+?)[[:space:]]+([0-9]{1,4})') as match
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
      select regexp_match(hc.hijri_date, '^[[:space:]]*([0-9]{1,2})[[:space:]]+(.+?)[[:space:]]+([0-9]{1,4})') as match
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



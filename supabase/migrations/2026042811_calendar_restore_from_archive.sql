-- Restore important dates from archived table after rebuild.
-- Converts restored rows to recurring model (linked_hijri_year = 0).

insert into public.islamic_calendar_events (
  title,
  event_type,
  field_label,
  region,
  notes,
  source_name,
  linked_hijri_day,
  linked_hijri_month,
  linked_hijri_year,
  linked_hijri_label,
  linked_gregorian_date,
  original_hijri_year,
  auto_delete_grace_days,
  created_by,
  created_at,
  updated_at
)
select
  a.title,
  'important_date'::text as event_type,
  a.field_label,
  a.region,
  a.notes,
  coalesce(nullif(a.source_name, ''), 'portal-manual') as source_name,
  a.linked_hijri_day,
  a.linked_hijri_month,
  0 as linked_hijri_year,
  null::text as linked_hijri_label,
  null::date as linked_gregorian_date,
  a.linked_hijri_year as original_hijri_year,
  0 as auto_delete_grace_days,
  a.created_by,
  coalesce(a.created_at, now()) as created_at,
  now() as updated_at
from (
  select distinct on (lower(title), linked_hijri_day, linked_hijri_month)
    title,
    field_label,
    region,
    notes,
    source_name,
    linked_hijri_day,
    linked_hijri_month,
    linked_hijri_year,
    created_by,
    created_at,
    updated_at
  from public.islamic_calendar_events_archive_20260428
  where event_type = 'important_date'
    and linked_hijri_day between 1 and 30
    and linked_hijri_month between 1 and 12
  order by
    lower(title),
    linked_hijri_day,
    linked_hijri_month,
    updated_at desc nulls last,
    created_at desc nulls last
) a
on conflict (title, linked_hijri_day, linked_hijri_month, linked_hijri_year)
do update set
  field_label = excluded.field_label,
  region = excluded.region,
  notes = excluded.notes,
  source_name = excluded.source_name,
  original_hijri_year = excluded.original_hijri_year,
  auto_delete_grace_days = 0,
  linked_hijri_label = null,
  linked_gregorian_date = null,
  updated_at = now();

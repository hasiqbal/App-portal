-- Align DB uniqueness with portal upsert conflict target.
-- Import flow uses ON CONFLICT(title, linked_hijri_day, linked_hijri_month, linked_hijri_year).

create unique index if not exists idx_islamic_calendar_events_upsert_key
  on public.islamic_calendar_events (
    title,
    linked_hijri_day,
    linked_hijri_month,
    linked_hijri_year
  );

-- Hijri month-length overrides (29/30 days) per Hijri year+month.

create table if not exists public.hijri_month_overrides (
  id uuid primary key default gen_random_uuid(),
  hijri_year integer not null,
  hijri_month integer not null,
  days_in_month integer not null check (days_in_month in (29, 30)),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (hijri_year, hijri_month),
  check (hijri_month between 1 and 12)
);

alter table public.hijri_month_overrides enable row level security;

drop policy if exists "anon_select_hijri_month_overrides" on public.hijri_month_overrides;
create policy "anon_select_hijri_month_overrides"
  on public.hijri_month_overrides for select to anon using (true);

drop policy if exists "auth_all_hijri_month_overrides" on public.hijri_month_overrides;
create policy "auth_all_hijri_month_overrides"
  on public.hijri_month_overrides for all to authenticated using (true) with check (true);

drop policy if exists "service_all_hijri_month_overrides" on public.hijri_month_overrides;
create policy "service_all_hijri_month_overrides"
  on public.hijri_month_overrides for all to service_role using (true) with check (true);

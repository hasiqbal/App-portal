-- Curated scrape targets for daily random sunnah.com selection.
-- Scope limited to: adab, riyadussalihin, shamail.

create extension if not exists pgcrypto;

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

create table if not exists public.hadith_scrape_targets (
  id uuid primary key default gen_random_uuid(),
  collection_key text not null check (collection_key in ('adab', 'riyadussalihin', 'shamail')),
  book_number integer not null check (book_number > 0),
  hadith_number integer not null check (hadith_number > 0),
  enabled boolean not null default true,
  weight integer not null default 1 check (weight > 0),
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_hadith_scrape_targets_target unique (collection_key, book_number, hadith_number)
);

create index if not exists idx_hadith_scrape_targets_enabled
  on public.hadith_scrape_targets (enabled);

create index if not exists idx_hadith_scrape_targets_collection
  on public.hadith_scrape_targets (collection_key);

create index if not exists idx_hadith_scrape_targets_order
  on public.hadith_scrape_targets (display_order, collection_key, book_number, hadith_number);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_hadith_scrape_targets on public.hadith_scrape_targets;
create trigger set_updated_at_hadith_scrape_targets
before update on public.hadith_scrape_targets
for each row execute function public.handle_updated_at();

alter table public.hadith_scrape_targets enable row level security;

drop policy if exists hadith_scrape_targets_read on public.hadith_scrape_targets;
create policy hadith_scrape_targets_read
on public.hadith_scrape_targets
for select
to authenticated
using (public.current_portal_role() in ('admin', 'editor', 'viewer'));

drop policy if exists hadith_scrape_targets_insert on public.hadith_scrape_targets;
create policy hadith_scrape_targets_insert
on public.hadith_scrape_targets
for insert
to authenticated
with check (public.current_portal_role() = 'admin');

drop policy if exists hadith_scrape_targets_update on public.hadith_scrape_targets;
create policy hadith_scrape_targets_update
on public.hadith_scrape_targets
for update
to authenticated
using (public.current_portal_role() = 'admin')
with check (public.current_portal_role() = 'admin');

drop policy if exists hadith_scrape_targets_delete on public.hadith_scrape_targets;
create policy hadith_scrape_targets_delete
on public.hadith_scrape_targets
for delete
to authenticated
using (public.current_portal_role() = 'admin');

insert into public.hadith_scrape_targets (collection_key, book_number, hadith_number, enabled, weight, display_order, notes)
values
  ('adab', 1, 1, true, 1, 10, 'Seed target'),
  ('adab', 1, 5, true, 1, 20, 'Seed target'),
  ('riyadussalihin', 1, 1, true, 1, 30, 'Seed target'),
  ('riyadussalihin', 1, 5, true, 1, 40, 'Seed target'),
  ('shamail', 1, 1, true, 1, 50, 'Seed target'),
  ('shamail', 1, 5, true, 1, 60, 'Seed target')
on conflict (collection_key, book_number, hadith_number) do nothing;

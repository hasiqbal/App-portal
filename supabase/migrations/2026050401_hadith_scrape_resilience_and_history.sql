create table if not exists public.hadith_scrape_map_cache (
  cache_key text primary key,
  numbers jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.hadith_scrape_history (
  id uuid primary key default gen_random_uuid(),
  hadith_key text not null unique,
  collection_key text not null,
  book_number integer not null,
  hadith_number integer not null,
  source_url text,
  first_served_at timestamptz not null default now(),
  last_served_at timestamptz not null default now(),
  serve_count integer not null default 1
);

create index if not exists hadith_scrape_history_last_served_idx
  on public.hadith_scrape_history (last_served_at desc);

alter table public.hadith_scrape_map_cache enable row level security;
alter table public.hadith_scrape_history enable row level security;

revoke all on public.hadith_scrape_map_cache from anon, authenticated;
revoke all on public.hadith_scrape_history from anon, authenticated;

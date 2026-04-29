alter table if exists public.push_subscriptions
  add column if not exists youtube_live_enabled boolean not null default false;
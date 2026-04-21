-- Align adhkar_groups schema with both JMN app reads and portal management writes.
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.adhkar_groups (
  id            uuid        not null default gen_random_uuid() primary key,
  name          text        not null,
  prayer_time   text,
  group_name    text,
  icon          text        not null default 'star',
  icon_color    text        not null default '#ffffff',
  icon_bg_color text        not null default '#0f766e',
  badge_text    text,
  badge_color   text        not null default '#0f766e',
  description   text,
  display_order integer     not null default 0,
  is_active     boolean     not null default true,
  bg_image_url  text,
  content_type  text check (content_type in ('adhkar', 'quran')),
  content_source text check (content_source in ('db', 'local', 'api')),
  content_key   text,
  card_icon     text,
  card_badge    text,
  card_subtitle text,
  arabic_title  text,
  card_reference text,
  card_color    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table if exists public.adhkar_groups
  add column if not exists name text,
  add column if not exists prayer_time text,
  add column if not exists group_name text,
  add column if not exists icon text,
  add column if not exists icon_color text,
  add column if not exists icon_bg_color text,
  add column if not exists badge_text text,
  add column if not exists badge_color text,
  add column if not exists description text,
  add column if not exists display_order integer,
  add column if not exists is_active boolean,
  add column if not exists bg_image_url text,
  add column if not exists content_type text,
  add column if not exists content_source text,
  add column if not exists content_key text,
  add column if not exists card_icon text,
  add column if not exists card_badge text,
  add column if not exists card_subtitle text,
  add column if not exists arabic_title text,
  add column if not exists card_reference text,
  add column if not exists card_color text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.adhkar_groups
set
  icon = coalesce(icon, 'star'),
  icon_color = coalesce(icon_color, '#ffffff'),
  icon_bg_color = coalesce(icon_bg_color, '#0f766e'),
  badge_color = coalesce(badge_color, '#0f766e'),
  display_order = coalesce(display_order, 0),
  is_active = coalesce(is_active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.adhkar_groups
  alter column name set not null,
  alter column icon set default 'star',
  alter column icon set not null,
  alter column icon_color set default '#ffffff',
  alter column icon_color set not null,
  alter column icon_bg_color set default '#0f766e',
  alter column icon_bg_color set not null,
  alter column badge_color set default '#0f766e',
  alter column badge_color set not null,
  alter column display_order set default 0,
  alter column display_order set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists idx_adhkar_groups_prayer_active_order
  on public.adhkar_groups (prayer_time, is_active, display_order);

create index if not exists idx_adhkar_groups_group_name
  on public.adhkar_groups (group_name);

drop trigger if exists trg_adhkar_groups_updated_at on public.adhkar_groups;
create trigger trg_adhkar_groups_updated_at
before update on public.adhkar_groups
for each row
execute function public.handle_updated_at();

alter table public.adhkar_groups enable row level security;

drop policy if exists "adhkar_groups_anon_read_active" on public.adhkar_groups;
create policy "adhkar_groups_anon_read_active"
on public.adhkar_groups
for select
to anon
using (is_active = true);

drop policy if exists "adhkar_groups_authenticated_read_all" on public.adhkar_groups;
create policy "adhkar_groups_authenticated_read_all"
on public.adhkar_groups
for select
to authenticated
using (true);

drop policy if exists "adhkar_groups_authenticated_insert" on public.adhkar_groups;
create policy "adhkar_groups_authenticated_insert"
on public.adhkar_groups
for insert
to authenticated
with check (true);

drop policy if exists "adhkar_groups_authenticated_update" on public.adhkar_groups;
create policy "adhkar_groups_authenticated_update"
on public.adhkar_groups
for update
to authenticated
using (true)
with check (true);

drop policy if exists "adhkar_groups_authenticated_delete" on public.adhkar_groups;
create policy "adhkar_groups_authenticated_delete"
on public.adhkar_groups
for delete
to authenticated
using (true);

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public."Sunnah_rmeinders"') is not null
     and to_regclass('public.sunnah_reminders') is null then
    execute 'alter table public."Sunnah_rmeinders" rename to sunnah_reminders';
  end if;

  if to_regclass('public.sunnah_rmeinders') is not null
     and to_regclass('public.sunnah_reminders') is null then
    execute 'alter table public.sunnah_rmeinders rename to sunnah_reminders';
  end if;
end
$$;

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.sunnah_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  icon text not null default '⭐',
  icon_color text not null default '#ffffff',
  icon_bg_color text not null default '#0f766e',
  badge_text text,
  badge_color text not null default '#0f766e',
  description text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.sunnah_groups
  add column if not exists name text,
  add column if not exists category text,
  add column if not exists icon text,
  add column if not exists icon_color text,
  add column if not exists icon_bg_color text,
  add column if not exists badge_text text,
  add column if not exists badge_color text,
  add column if not exists description text,
  add column if not exists display_order integer,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.sunnah_groups
set
  icon = coalesce(icon, '⭐'),
  icon_color = coalesce(icon_color, '#ffffff'),
  icon_bg_color = coalesce(icon_bg_color, '#0f766e'),
  badge_color = coalesce(badge_color, '#0f766e'),
  display_order = coalesce(display_order, 0),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.sunnah_groups
  alter column name set not null,
  alter column icon set default '⭐',
  alter column icon set not null,
  alter column icon_color set default '#ffffff',
  alter column icon_color set not null,
  alter column icon_bg_color set default '#0f766e',
  alter column icon_bg_color set not null,
  alter column badge_color set default '#0f766e',
  alter column badge_color set not null,
  alter column display_order set default 0,
  alter column display_order set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create table if not exists public.sunnah_reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  arabic_title text,
  arabic text,
  transliteration text,
  translation text,
  urdu_translation text,
  description text,
  reference text,
  count text not null default '1',
  category text not null default 'general',
  group_name text,
  group_order integer not null default 0,
  display_order integer not null default 0,
  is_active boolean not null default true,
  file_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.sunnah_reminders
  add column if not exists title text,
  add column if not exists arabic_title text,
  add column if not exists arabic text,
  add column if not exists transliteration text,
  add column if not exists translation text,
  add column if not exists urdu_translation text,
  add column if not exists description text,
  add column if not exists reference text,
  add column if not exists count text,
  add column if not exists category text,
  add column if not exists group_name text,
  add column if not exists group_order integer,
  add column if not exists display_order integer,
  add column if not exists is_active boolean,
  add column if not exists file_url text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sunnah_reminders'
      and column_name = 'detail'
  ) then
    execute 'update public.sunnah_reminders set description = coalesce(description, detail)';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sunnah_reminders'
      and column_name = 'friday_only'
  ) then
    execute 'update public.sunnah_reminders set category = ''friday'' where category is null and friday_only = true';
  end if;
end
$$;

update public.sunnah_reminders
set
  title = coalesce(title, 'Untitled Sunnah Reminder'),
  count = coalesce(count, '1'),
  category = coalesce(category, 'general'),
  group_order = coalesce(group_order, 0),
  display_order = coalesce(display_order, 0),
  is_active = coalesce(is_active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.sunnah_reminders
  alter column title set not null,
  alter column count set default '1',
  alter column count set not null,
  alter column category set default 'general',
  alter column category set not null,
  alter column group_order set default 0,
  alter column group_order set not null,
  alter column display_order set default 0,
  alter column display_order set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists idx_sunnah_groups_category_order
  on public.sunnah_groups (category, display_order, name);

create index if not exists idx_sunnah_groups_name
  on public.sunnah_groups (name);

create index if not exists idx_sunnah_reminders_list
  on public.sunnah_reminders (category, is_active, group_order, display_order);

create index if not exists idx_sunnah_reminders_group_name
  on public.sunnah_reminders (group_name);

create index if not exists idx_sunnah_reminders_active_display
  on public.sunnah_reminders (is_active, display_order);

alter table public.sunnah_groups enable row level security;
alter table public.sunnah_reminders enable row level security;

drop policy if exists "anon_select_sunnah_groups" on public.sunnah_groups;
drop policy if exists "authenticated_select_sunnah_groups" on public.sunnah_groups;
drop policy if exists "authenticated_insert_sunnah_groups" on public.sunnah_groups;
drop policy if exists "authenticated_update_sunnah_groups" on public.sunnah_groups;
drop policy if exists "authenticated_delete_sunnah_groups" on public.sunnah_groups;

drop policy if exists "anon_select_sunnah_reminders" on public.sunnah_reminders;
drop policy if exists "authenticated_select_sunnah_reminders" on public.sunnah_reminders;
drop policy if exists "authenticated_insert_sunnah_reminders" on public.sunnah_reminders;
drop policy if exists "authenticated_update_sunnah_reminders" on public.sunnah_reminders;
drop policy if exists "authenticated_delete_sunnah_reminders" on public.sunnah_reminders;

create policy "anon_select_sunnah_groups"
  on public.sunnah_groups for select to anon using (true);

create policy "authenticated_select_sunnah_groups"
  on public.sunnah_groups for select to authenticated using (true);

create policy "authenticated_insert_sunnah_groups"
  on public.sunnah_groups for insert to authenticated with check (true);

create policy "authenticated_update_sunnah_groups"
  on public.sunnah_groups for update to authenticated using (true) with check (true);

create policy "authenticated_delete_sunnah_groups"
  on public.sunnah_groups for delete to authenticated using (true);

create policy "anon_select_sunnah_reminders"
  on public.sunnah_reminders for select to anon using (is_active = true);

create policy "authenticated_select_sunnah_reminders"
  on public.sunnah_reminders for select to authenticated using (true);

create policy "authenticated_insert_sunnah_reminders"
  on public.sunnah_reminders for insert to authenticated with check (true);

create policy "authenticated_update_sunnah_reminders"
  on public.sunnah_reminders for update to authenticated using (true) with check (true);

create policy "authenticated_delete_sunnah_reminders"
  on public.sunnah_reminders for delete to authenticated using (true);

drop trigger if exists set_updated_at_sunnah_groups on public.sunnah_groups;
create trigger set_updated_at_sunnah_groups
  before update on public.sunnah_groups
  for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at_sunnah_reminders on public.sunnah_reminders;
create trigger set_updated_at_sunnah_reminders
  before update on public.sunnah_reminders
  for each row execute function public.handle_updated_at();

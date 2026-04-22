-- Dedicated qaseedah/naat domain tables with role-aware RLS.
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

-- Best-effort role resolution from JWT claims.
-- Portal currently signs into Supabase with a shared auth account and adds
-- portal_role into user metadata at login.
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

create table if not exists public.qaseedah_naat_groups (
  id                uuid        not null default gen_random_uuid() primary key,
  name              text        not null,
  content_type      text        not null check (content_type in ('qaseedah', 'naat')),
  legacy_group_name text,
  description       text,
  icon              text        not null default '📖',
  icon_color        text        not null default '#ffffff',
  icon_bg_color     text        not null default '#0f766e',
  badge_text        text,
  badge_color       text        not null default '#0f766e',
  display_order     integer     not null default 0,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint qaseedah_naat_groups_type_name_unique unique (content_type, name)
);

alter table if exists public.qaseedah_naat_groups
  add column if not exists name text,
  add column if not exists content_type text,
  add column if not exists legacy_group_name text,
  add column if not exists description text,
  add column if not exists icon text,
  add column if not exists icon_color text,
  add column if not exists icon_bg_color text,
  add column if not exists badge_text text,
  add column if not exists badge_color text,
  add column if not exists display_order integer,
  add column if not exists is_active boolean,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.qaseedah_naat_groups
set
  icon = coalesce(icon, '📖'),
  icon_color = coalesce(icon_color, '#ffffff'),
  icon_bg_color = coalesce(icon_bg_color, '#0f766e'),
  badge_color = coalesce(badge_color, '#0f766e'),
  display_order = coalesce(display_order, 0),
  is_active = coalesce(is_active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.qaseedah_naat_groups
  alter column name set not null,
  alter column content_type set not null,
  alter column icon set default '📖',
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

alter table public.qaseedah_naat_groups
  drop constraint if exists qaseedah_naat_groups_content_type_check;

alter table public.qaseedah_naat_groups
  add constraint qaseedah_naat_groups_content_type_check
  check (content_type in ('qaseedah', 'naat'));

create table if not exists public.qaseedah_naat_entries (
  id                uuid        not null default gen_random_uuid() primary key,
  group_id          uuid        not null references public.qaseedah_naat_groups(id) on update cascade on delete restrict,
  content_type      text        not null check (content_type in ('qaseedah', 'naat')),
  legacy_adhkar_id  uuid,
  title             text        not null,
  arabic_title      text,
  arabic            text        not null default '',
  transliteration   text,
  translation       text,
  urdu_translation  text,
  reference         text,
  count             text        not null default '1',
  prayer_time       text        not null default 'general',
  display_order     integer     not null default 0,
  is_active         boolean     not null default true,
  sections          jsonb,
  file_url          text,
  tafsir            text,
  description       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table if exists public.qaseedah_naat_entries
  add column if not exists group_id uuid,
  add column if not exists content_type text,
  add column if not exists legacy_adhkar_id uuid,
  add column if not exists title text,
  add column if not exists arabic_title text,
  add column if not exists arabic text,
  add column if not exists transliteration text,
  add column if not exists translation text,
  add column if not exists urdu_translation text,
  add column if not exists reference text,
  add column if not exists count text,
  add column if not exists prayer_time text,
  add column if not exists display_order integer,
  add column if not exists is_active boolean,
  add column if not exists sections jsonb,
  add column if not exists file_url text,
  add column if not exists tafsir text,
  add column if not exists description text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.qaseedah_naat_entries
set
  count = coalesce(count, '1'),
  prayer_time = coalesce(prayer_time, 'general'),
  display_order = coalesce(display_order, 0),
  is_active = coalesce(is_active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now()),
  arabic = coalesce(arabic, ''),
  content_type = coalesce(content_type, 'qaseedah');

alter table public.qaseedah_naat_entries
  alter column title set not null,
  alter column arabic set default '',
  alter column arabic set not null,
  alter column count set default '1',
  alter column count set not null,
  alter column prayer_time set default 'general',
  alter column prayer_time set not null,
  alter column display_order set default 0,
  alter column display_order set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column content_type set not null;

alter table public.qaseedah_naat_entries
  drop constraint if exists qaseedah_naat_entries_content_type_check;

alter table public.qaseedah_naat_entries
  add constraint qaseedah_naat_entries_content_type_check
  check (content_type in ('qaseedah', 'naat'));

alter table public.qaseedah_naat_entries
  drop constraint if exists qaseedah_naat_entries_group_id_fkey;

alter table public.qaseedah_naat_entries
  add constraint qaseedah_naat_entries_group_id_fkey
  foreign key (group_id) references public.qaseedah_naat_groups(id) on update cascade on delete restrict;

create unique index if not exists idx_qaseedah_naat_groups_type_name
  on public.qaseedah_naat_groups (content_type, name);

create index if not exists idx_qaseedah_naat_groups_active_order
  on public.qaseedah_naat_groups (content_type, is_active, display_order, name);

create unique index if not exists idx_qaseedah_naat_entries_legacy_adhkar_id
  on public.qaseedah_naat_entries (legacy_adhkar_id)
  where legacy_adhkar_id is not null;

create index if not exists idx_qaseedah_naat_entries_group_order
  on public.qaseedah_naat_entries (group_id, is_active, display_order, created_at);

create index if not exists idx_qaseedah_naat_entries_type_order
  on public.qaseedah_naat_entries (content_type, is_active, prayer_time, display_order, created_at);

create index if not exists idx_qaseedah_naat_entries_title_search
  on public.qaseedah_naat_entries using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(translation, '') || ' ' || coalesce(urdu_translation, '') || ' ' || coalesce(reference, '')));

-- Backfill groups from adhkar_groups first.
insert into public.qaseedah_naat_groups (
  name,
  content_type,
  legacy_group_name,
  description,
  icon,
  icon_color,
  icon_bg_color,
  badge_text,
  badge_color,
  display_order,
  is_active,
  created_at,
  updated_at
)
select
  coalesce(nullif(trim(g.name), ''), nullif(trim(g.group_name), ''), 'General') as normalized_name,
  g.content_type,
  nullif(trim(g.group_name), ''),
  g.description,
  coalesce(g.card_icon, g.icon, '📖'),
  coalesce(g.icon_color, '#ffffff'),
  coalesce(g.icon_bg_color, '#0f766e'),
  coalesce(g.card_badge, g.badge_text),
  coalesce(g.badge_color, '#0f766e'),
  coalesce(g.display_order, 0),
  coalesce(g.is_active, true),
  coalesce(g.created_at, now()),
  coalesce(g.updated_at, now())
from public.adhkar_groups g
where g.content_type in ('qaseedah', 'naat')
on conflict (content_type, name) do update
set
  description = coalesce(excluded.description, public.qaseedah_naat_groups.description),
  icon = coalesce(excluded.icon, public.qaseedah_naat_groups.icon),
  badge_text = coalesce(excluded.badge_text, public.qaseedah_naat_groups.badge_text),
  display_order = least(public.qaseedah_naat_groups.display_order, excluded.display_order),
  is_active = excluded.is_active,
  updated_at = now();

-- Backfill missing groups from adhkar entries where group metadata was never created.
insert into public.qaseedah_naat_groups (
  name,
  content_type,
  legacy_group_name,
  display_order,
  is_active
)
select distinct
  coalesce(nullif(trim(a.group_name), ''), 'General') as normalized_name,
  a.content_type,
  nullif(trim(a.group_name), ''),
  coalesce(a.group_order, 0),
  true
from public.adhkar a
where a.content_type in ('qaseedah', 'naat')
on conflict (content_type, name) do nothing;

-- Backfill entries from adhkar table.
insert into public.qaseedah_naat_entries (
  group_id,
  content_type,
  legacy_adhkar_id,
  title,
  arabic_title,
  arabic,
  transliteration,
  translation,
  urdu_translation,
  reference,
  count,
  prayer_time,
  display_order,
  is_active,
  sections,
  file_url,
  tafsir,
  description,
  created_at,
  updated_at
)
select
  g.id,
  a.content_type,
  a.id,
  a.title,
  a.arabic_title,
  coalesce(a.arabic, ''),
  a.transliteration,
  a.translation,
  a.urdu_translation,
  a.reference,
  coalesce(a.count, '1'),
  coalesce(a.prayer_time, 'general'),
  coalesce(a.display_order, 0),
  coalesce(a.is_active, true),
  a.sections,
  a.file_url,
  coalesce(a.tafsir, a.description),
  a.description,
  coalesce(a.created_at, now()),
  coalesce(a.updated_at, now())
from public.adhkar a
join public.qaseedah_naat_groups g
  on g.content_type = a.content_type
 and lower(g.name) = lower(coalesce(nullif(trim(a.group_name), ''), 'General'))
where a.content_type in ('qaseedah', 'naat')
  and not exists (
    select 1
    from public.qaseedah_naat_entries existing
    where existing.legacy_adhkar_id = a.id
  );

-- Keep updated_at fresh.
drop trigger if exists trg_qaseedah_naat_groups_updated_at on public.qaseedah_naat_groups;
create trigger trg_qaseedah_naat_groups_updated_at
before update on public.qaseedah_naat_groups
for each row execute function public.handle_updated_at();

drop trigger if exists trg_qaseedah_naat_entries_updated_at on public.qaseedah_naat_entries;
create trigger trg_qaseedah_naat_entries_updated_at
before update on public.qaseedah_naat_entries
for each row execute function public.handle_updated_at();

-- Permissions + RLS.
grant usage on schema public to anon, authenticated;
grant select on public.qaseedah_naat_groups to anon;
grant select on public.qaseedah_naat_entries to anon;
grant select, insert, update, delete on public.qaseedah_naat_groups to authenticated;
grant select, insert, update, delete on public.qaseedah_naat_entries to authenticated;

alter table public.qaseedah_naat_groups enable row level security;
alter table public.qaseedah_naat_entries enable row level security;

drop policy if exists "qaseedah_naat_groups_anon_read_active" on public.qaseedah_naat_groups;
create policy "qaseedah_naat_groups_anon_read_active"
on public.qaseedah_naat_groups
for select
to anon
using (is_active = true);

drop policy if exists "qaseedah_naat_groups_authenticated_read" on public.qaseedah_naat_groups;
create policy "qaseedah_naat_groups_authenticated_read"
on public.qaseedah_naat_groups
for select
to authenticated
using (public.current_portal_role() in ('admin', 'editor', 'viewer'));

drop policy if exists "qaseedah_naat_groups_authenticated_insert" on public.qaseedah_naat_groups;
create policy "qaseedah_naat_groups_authenticated_insert"
on public.qaseedah_naat_groups
for insert
to authenticated
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists "qaseedah_naat_groups_authenticated_update" on public.qaseedah_naat_groups;
create policy "qaseedah_naat_groups_authenticated_update"
on public.qaseedah_naat_groups
for update
to authenticated
using (public.current_portal_role() in ('admin', 'editor'))
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists "qaseedah_naat_groups_authenticated_delete" on public.qaseedah_naat_groups;
create policy "qaseedah_naat_groups_authenticated_delete"
on public.qaseedah_naat_groups
for delete
to authenticated
using (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists "qaseedah_naat_entries_anon_read_active" on public.qaseedah_naat_entries;
create policy "qaseedah_naat_entries_anon_read_active"
on public.qaseedah_naat_entries
for select
to anon
using (is_active = true);

drop policy if exists "qaseedah_naat_entries_authenticated_read" on public.qaseedah_naat_entries;
create policy "qaseedah_naat_entries_authenticated_read"
on public.qaseedah_naat_entries
for select
to authenticated
using (public.current_portal_role() in ('admin', 'editor', 'viewer'));

drop policy if exists "qaseedah_naat_entries_authenticated_insert" on public.qaseedah_naat_entries;
create policy "qaseedah_naat_entries_authenticated_insert"
on public.qaseedah_naat_entries
for insert
to authenticated
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists "qaseedah_naat_entries_authenticated_update" on public.qaseedah_naat_entries;
create policy "qaseedah_naat_entries_authenticated_update"
on public.qaseedah_naat_entries
for update
to authenticated
using (public.current_portal_role() in ('admin', 'editor'))
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists "qaseedah_naat_entries_authenticated_delete" on public.qaseedah_naat_entries;
create policy "qaseedah_naat_entries_authenticated_delete"
on public.qaseedah_naat_entries
for delete
to authenticated
using (public.current_portal_role() in ('admin', 'editor'));

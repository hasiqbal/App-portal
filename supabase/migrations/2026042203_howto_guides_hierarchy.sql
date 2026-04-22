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

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.howto_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  icon text null,
  color text null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.howto_guides (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.howto_groups(id) on delete restrict,
  slug text not null unique,
  title text not null,
  subtitle text null,
  intro text null,
  language text not null default 'en',
  icon text null,
  color text null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  publish_start_at timestamptz null,
  publish_end_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint howto_guides_language_check check (language in ('en', 'ur', 'ar')),
  constraint howto_guides_publish_window_check check (publish_end_at is null or publish_start_at is null or publish_end_at > publish_start_at)
);

create table if not exists public.howto_sections (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.howto_guides(id) on delete cascade,
  heading text not null,
  section_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint howto_sections_guide_order_unique unique (guide_id, section_order)
);

create table if not exists public.howto_steps (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.howto_sections(id) on delete cascade,
  step_order integer not null default 0,
  title text not null,
  detail text null,
  note text null,
  rich_content_html text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint howto_steps_section_order_unique unique (section_id, step_order)
);

create table if not exists public.howto_step_blocks (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.howto_steps(id) on delete cascade,
  block_order integer not null default 0,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint howto_step_blocks_kind_check check (kind in ('text', 'action', 'note', 'recitation')),
  constraint howto_step_blocks_step_order_unique unique (step_id, block_order)
);

create table if not exists public.howto_step_images (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.howto_steps(id) on delete cascade,
  display_order integer not null default 0,
  image_url text not null,
  thumb_url text null,
  caption text null,
  source text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint howto_step_images_step_order_unique unique (step_id, display_order)
);

create table if not exists public.howto_guide_versions (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.howto_guides(id) on delete cascade,
  version_no integer not null,
  snapshot jsonb not null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint howto_guide_versions_unique unique (guide_id, version_no)
);

create table if not exists public.howto_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null,
  action text not null,
  entity text not null,
  entity_id uuid null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_howto_guides_group_order on public.howto_guides(group_id, display_order);
create index if not exists idx_howto_guides_language_active on public.howto_guides(language, is_active);
create index if not exists idx_howto_sections_guide_order on public.howto_sections(guide_id, section_order);
create index if not exists idx_howto_steps_section_order on public.howto_steps(section_id, step_order);

create or replace trigger trg_howto_groups_updated_at
before update on public.howto_groups
for each row execute function public.handle_updated_at();

create or replace trigger trg_howto_guides_updated_at
before update on public.howto_guides
for each row execute function public.handle_updated_at();

create or replace trigger trg_howto_sections_updated_at
before update on public.howto_sections
for each row execute function public.handle_updated_at();

create or replace trigger trg_howto_steps_updated_at
before update on public.howto_steps
for each row execute function public.handle_updated_at();

create or replace trigger trg_howto_step_blocks_updated_at
before update on public.howto_step_blocks
for each row execute function public.handle_updated_at();

create or replace trigger trg_howto_step_images_updated_at
before update on public.howto_step_images
for each row execute function public.handle_updated_at();

alter table public.howto_groups enable row level security;
alter table public.howto_guides enable row level security;
alter table public.howto_sections enable row level security;
alter table public.howto_steps enable row level security;
alter table public.howto_step_blocks enable row level security;
alter table public.howto_step_images enable row level security;
alter table public.howto_guide_versions enable row level security;
alter table public.howto_audit_log enable row level security;

grant select on public.howto_groups, public.howto_guides, public.howto_sections, public.howto_steps, public.howto_step_blocks, public.howto_step_images to anon;
grant select, insert, update, delete on public.howto_groups, public.howto_guides, public.howto_sections, public.howto_steps, public.howto_step_blocks, public.howto_step_images to authenticated;
grant select, insert on public.howto_guide_versions, public.howto_audit_log to authenticated;

drop policy if exists howto_groups_anon_read on public.howto_groups;
create policy howto_groups_anon_read
on public.howto_groups
for select to anon
using (is_active = true);

drop policy if exists howto_groups_auth_read on public.howto_groups;
create policy howto_groups_auth_read
on public.howto_groups
for select to authenticated
using (true);

drop policy if exists howto_groups_auth_write on public.howto_groups;
create policy howto_groups_auth_write
on public.howto_groups
for all to authenticated
using (public.current_portal_role() in ('admin', 'editor'))
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists howto_groups_auth_delete on public.howto_groups;
create policy howto_groups_auth_delete
on public.howto_groups
for delete to authenticated
using (public.current_portal_role() = 'admin');

drop policy if exists howto_guides_anon_read on public.howto_guides;
create policy howto_guides_anon_read
on public.howto_guides
for select to anon
using (
  is_active = true
  and (publish_start_at is null or publish_start_at <= now())
  and (publish_end_at is null or publish_end_at > now())
);

drop policy if exists howto_guides_auth_read on public.howto_guides;
create policy howto_guides_auth_read
on public.howto_guides
for select to authenticated
using (true);

drop policy if exists howto_guides_auth_write on public.howto_guides;
create policy howto_guides_auth_write
on public.howto_guides
for all to authenticated
using (public.current_portal_role() in ('admin', 'editor'))
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists howto_guides_auth_delete on public.howto_guides;
create policy howto_guides_auth_delete
on public.howto_guides
for delete to authenticated
using (public.current_portal_role() = 'admin');

drop policy if exists howto_sections_public_read on public.howto_sections;
create policy howto_sections_public_read
on public.howto_sections
for select
using (
  exists (
    select 1
    from public.howto_guides g
    where g.id = howto_sections.guide_id
      and (
        auth.role() = 'authenticated'
        or (
          g.is_active = true
          and (g.publish_start_at is null or g.publish_start_at <= now())
          and (g.publish_end_at is null or g.publish_end_at > now())
        )
      )
  )
);

drop policy if exists howto_sections_auth_write on public.howto_sections;
create policy howto_sections_auth_write
on public.howto_sections
for all to authenticated
using (public.current_portal_role() in ('admin', 'editor'))
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists howto_sections_auth_delete on public.howto_sections;
create policy howto_sections_auth_delete
on public.howto_sections
for delete to authenticated
using (public.current_portal_role() = 'admin');

drop policy if exists howto_steps_public_read on public.howto_steps;
create policy howto_steps_public_read
on public.howto_steps
for select
using (
  exists (
    select 1
    from public.howto_sections s
    join public.howto_guides g on g.id = s.guide_id
    where s.id = howto_steps.section_id
      and (
        auth.role() = 'authenticated'
        or (
          g.is_active = true
          and (g.publish_start_at is null or g.publish_start_at <= now())
          and (g.publish_end_at is null or g.publish_end_at > now())
        )
      )
  )
);

drop policy if exists howto_steps_auth_write on public.howto_steps;
create policy howto_steps_auth_write
on public.howto_steps
for all to authenticated
using (public.current_portal_role() in ('admin', 'editor'))
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists howto_steps_auth_delete on public.howto_steps;
create policy howto_steps_auth_delete
on public.howto_steps
for delete to authenticated
using (public.current_portal_role() = 'admin');

drop policy if exists howto_step_blocks_public_read on public.howto_step_blocks;
create policy howto_step_blocks_public_read
on public.howto_step_blocks
for select
using (true);

drop policy if exists howto_step_blocks_auth_write on public.howto_step_blocks;
create policy howto_step_blocks_auth_write
on public.howto_step_blocks
for all to authenticated
using (public.current_portal_role() in ('admin', 'editor'))
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists howto_step_blocks_auth_delete on public.howto_step_blocks;
create policy howto_step_blocks_auth_delete
on public.howto_step_blocks
for delete to authenticated
using (public.current_portal_role() = 'admin');

drop policy if exists howto_step_images_public_read on public.howto_step_images;
create policy howto_step_images_public_read
on public.howto_step_images
for select
using (true);

drop policy if exists howto_step_images_auth_write on public.howto_step_images;
create policy howto_step_images_auth_write
on public.howto_step_images
for all to authenticated
using (public.current_portal_role() in ('admin', 'editor'))
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists howto_step_images_auth_delete on public.howto_step_images;
create policy howto_step_images_auth_delete
on public.howto_step_images
for delete to authenticated
using (public.current_portal_role() = 'admin');

drop policy if exists howto_guide_versions_auth_read on public.howto_guide_versions;
create policy howto_guide_versions_auth_read
on public.howto_guide_versions
for select to authenticated
using (public.current_portal_role() in ('admin', 'editor', 'viewer'));

drop policy if exists howto_guide_versions_auth_write on public.howto_guide_versions;
create policy howto_guide_versions_auth_write
on public.howto_guide_versions
for insert to authenticated
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists howto_audit_log_auth_read on public.howto_audit_log;
create policy howto_audit_log_auth_read
on public.howto_audit_log
for select to authenticated
using (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists howto_audit_log_auth_write on public.howto_audit_log;
create policy howto_audit_log_auth_write
on public.howto_audit_log
for insert to authenticated
with check (public.current_portal_role() in ('admin', 'editor'));

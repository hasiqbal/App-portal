-- Hadith inclusion rules for daily random selection.
-- Include model: if no rules exist, all supported books are considered.

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

create table if not exists public.hadith_inclusion_rules (
  id uuid primary key default gen_random_uuid(),
  collection_key text not null,
  edition_key text not null,
  include_scope text not null check (include_scope in ('book', 'section')),
  section_number integer,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hadith_inclusion_rules_section_required
    check (
      (include_scope = 'book' and section_number is null)
      or (include_scope = 'section' and section_number is not null)
    )
);

create unique index if not exists uq_hadith_inclusion_rules_scope
  on public.hadith_inclusion_rules (collection_key, include_scope, coalesce(section_number, 0));

create index if not exists idx_hadith_inclusion_rules_enabled
  on public.hadith_inclusion_rules (enabled);

create index if not exists idx_hadith_inclusion_rules_collection
  on public.hadith_inclusion_rules (collection_key);

create index if not exists idx_hadith_inclusion_rules_edition
  on public.hadith_inclusion_rules (edition_key);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_hadith_inclusion_rules on public.hadith_inclusion_rules;
create trigger set_updated_at_hadith_inclusion_rules
before update on public.hadith_inclusion_rules
for each row execute function public.handle_updated_at();

alter table public.hadith_inclusion_rules enable row level security;

drop policy if exists hadith_inclusion_rules_read on public.hadith_inclusion_rules;
create policy hadith_inclusion_rules_read
on public.hadith_inclusion_rules
for select
to authenticated
using (public.current_portal_role() in ('admin', 'editor', 'viewer'));

drop policy if exists hadith_inclusion_rules_insert on public.hadith_inclusion_rules;
create policy hadith_inclusion_rules_insert
on public.hadith_inclusion_rules
for insert
to authenticated
with check (public.current_portal_role() = 'admin');

drop policy if exists hadith_inclusion_rules_update on public.hadith_inclusion_rules;
create policy hadith_inclusion_rules_update
on public.hadith_inclusion_rules
for update
to authenticated
using (public.current_portal_role() = 'admin')
with check (public.current_portal_role() = 'admin');

drop policy if exists hadith_inclusion_rules_delete on public.hadith_inclusion_rules;
create policy hadith_inclusion_rules_delete
on public.hadith_inclusion_rules
for delete
to authenticated
using (public.current_portal_role() = 'admin');

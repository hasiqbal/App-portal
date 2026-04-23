alter table public.howto_guides
  add column if not exists notes text[] not null default '{}'::text[];

update public.howto_guides
set notes = '{}'::text[]
where notes is null;

alter table public.howto_guides
  alter column notes set default '{}'::text[],
  alter column notes set not null;
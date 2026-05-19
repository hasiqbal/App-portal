-- Permanent schema alignment for adhkar content metadata columns.
-- Safe to run multiple times.

do $$
declare
  check_constraint record;
begin
  if to_regclass('public.adhkar') is null then
    return;
  end if;

  alter table public.adhkar
    add column if not exists content_type text,
    add column if not exists content_source text,
    add column if not exists content_key text;

  update public.adhkar
  set content_type = coalesce(nullif(content_type, ''), 'adhkar')
  where content_type is null or btrim(content_type) = '';

  -- Rebuild content_type checks so all supported content types are accepted.
  for check_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.adhkar'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%content_type%'
  loop
    execute format('alter table public.adhkar drop constraint if exists %I', check_constraint.conname);
  end loop;

  alter table public.adhkar
    add constraint adhkar_content_type_check
    check (content_type in ('adhkar', 'quran', 'qaseedah', 'naat'));

  -- content_source is optional for legacy rows, but constrained when present.
  for check_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.adhkar'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%content_source%'
  loop
    execute format('alter table public.adhkar drop constraint if exists %I', check_constraint.conname);
  end loop;

  alter table public.adhkar
    add constraint adhkar_content_source_check
    check (content_source is null or content_source in ('db', 'local', 'api'));

  create index if not exists idx_adhkar_content_source
    on public.adhkar (content_source);

  create index if not exists idx_adhkar_content_key
    on public.adhkar (content_key);
end $$;

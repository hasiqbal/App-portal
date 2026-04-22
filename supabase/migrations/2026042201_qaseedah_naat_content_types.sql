-- Expand content_type support for adhkar and adhkar_groups.
-- Safe to run multiple times.

do $$
declare
  check_constraint record;
begin
  if to_regclass('public.adhkar') is not null then
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

    execute 'create index if not exists idx_adhkar_content_type_active_order
      on public.adhkar (content_type, is_active, prayer_time, group_order, display_order)';
  end if;
end $$;

do $$
declare
  check_constraint record;
begin
  if to_regclass('public.adhkar_groups') is not null then
    for check_constraint in
      select conname
      from pg_constraint
      where conrelid = 'public.adhkar_groups'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%content_type%'
    loop
      execute format('alter table public.adhkar_groups drop constraint if exists %I', check_constraint.conname);
    end loop;

    alter table public.adhkar_groups
      add constraint adhkar_groups_content_type_check
      check (content_type in ('adhkar', 'quran', 'qaseedah', 'naat'));

    execute 'create index if not exists idx_adhkar_groups_content_type_active_order
      on public.adhkar_groups (content_type, is_active, display_order)';
  end if;
end $$;

-- Ensure deleting an announcement also removes announcement-linked rows
-- from any public table that tracks announcement references.

create or replace function public.delete_announcement_cascade(p_announcement_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  relation_row record;
begin
  target_id := p_announcement_id::uuid;

  for relation_row in
    select c.table_schema, c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name <> 'announcements'
      and c.column_name in ('announcement_id', 'source_announcement_id')
  loop
    execute format(
      'delete from %I.%I where %I::text = $1',
      relation_row.table_schema,
      relation_row.table_name,
      relation_row.column_name
    ) using target_id::text;
  end loop;

  delete from public.announcements
  where id = target_id;
end;
$$;

grant execute on function public.delete_announcement_cascade(text) to authenticated;
grant execute on function public.delete_announcement_cascade(text) to service_role;

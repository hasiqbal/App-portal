alter table public.howto_groups
  add column if not exists urdu_name text;

update public.howto_groups
set urdu_name = name
where urdu_name is null;

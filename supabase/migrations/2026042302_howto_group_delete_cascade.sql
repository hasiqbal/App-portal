alter table public.howto_guides
  drop constraint if exists howto_guides_group_id_fkey;

alter table public.howto_guides
  add constraint howto_guides_group_id_fkey
  foreign key (group_id)
  references public.howto_groups(id)
  on delete cascade;
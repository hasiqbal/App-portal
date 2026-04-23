alter table public.howto_groups
  add column if not exists source_group_id uuid references public.howto_groups(id) on delete set null;

alter table public.howto_guides
  add column if not exists source_guide_id uuid references public.howto_guides(id) on delete set null;

create index if not exists howto_groups_source_group_id_idx
  on public.howto_groups(source_group_id);

create index if not exists howto_guides_source_guide_id_idx
  on public.howto_guides(source_guide_id);

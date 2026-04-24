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

create table if not exists public.donation_options (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text null,
  frequency text not null,
  amount_minor integer null,
  currency text not null default 'GBP',
  is_custom boolean not null default false,
  tags text[] not null default '{}'::text[],
  is_active boolean not null default true,
  is_featured boolean not null default false,
  is_pinned boolean not null default false,
  pin_order integer not null default 0,
  display_order integer not null default 0,
  global_order integer not null default 0,
  campaign_label text null,
  campaign_copy text null,
  promo_start_at timestamptz null,
  promo_end_at timestamptz null,
  price_slot integer null,
  stripe_price_id text null,
  stripe_product_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donation_options_frequency_check check (frequency in ('one-off', 'monthly')),
  constraint donation_options_price_slot_check check (price_slot is null or (price_slot between 1 and 9)),
  constraint donation_options_promo_window_check check (promo_end_at is null or promo_start_at is null or promo_end_at > promo_start_at),
  constraint donation_options_currency_check check (char_length(currency) = 3),
  constraint donation_options_amount_check check (
    (is_custom = true and amount_minor is null)
    or (is_custom = false and amount_minor is not null and amount_minor > 0)
  )
);

alter table public.donation_options
  add column if not exists title text,
  add column if not exists subtitle text,
  add column if not exists frequency text,
  add column if not exists amount_minor integer,
  add column if not exists currency text,
  add column if not exists is_custom boolean,
  add column if not exists tags text[],
  add column if not exists is_active boolean,
  add column if not exists is_featured boolean,
  add column if not exists is_pinned boolean,
  add column if not exists pin_order integer,
  add column if not exists display_order integer,
  add column if not exists global_order integer,
  add column if not exists campaign_label text,
  add column if not exists campaign_copy text,
  add column if not exists promo_start_at timestamptz,
  add column if not exists promo_end_at timestamptz,
  add column if not exists price_slot integer,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_product_id text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.donation_options
set
  subtitle = coalesce(subtitle, ''),
  currency = upper(coalesce(currency, 'GBP')),
  is_custom = coalesce(is_custom, false),
  tags = coalesce(tags, '{}'::text[]),
  is_active = coalesce(is_active, true),
  is_featured = coalesce(is_featured, false),
  is_pinned = coalesce(is_pinned, false),
  pin_order = coalesce(pin_order, 0),
  display_order = coalesce(display_order, 0),
  global_order = coalesce(global_order, 0),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.donation_options
  alter column title set not null,
  alter column frequency set not null,
  alter column currency set default 'GBP',
  alter column currency set not null,
  alter column is_custom set default false,
  alter column is_custom set not null,
  alter column tags set default '{}'::text[],
  alter column tags set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column is_featured set default false,
  alter column is_featured set not null,
  alter column is_pinned set default false,
  alter column is_pinned set not null,
  alter column pin_order set default 0,
  alter column pin_order set not null,
  alter column display_order set default 0,
  alter column display_order set not null,
  alter column global_order set default 0,
  alter column global_order set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create unique index if not exists uq_donation_options_price_slot
  on public.donation_options (price_slot);

create unique index if not exists uq_donation_options_stripe_price_id
  on public.donation_options (stripe_price_id);

create index if not exists idx_donation_options_render
  on public.donation_options (is_active, is_pinned desc, pin_order, global_order, frequency, display_order);

create index if not exists idx_donation_options_schedule
  on public.donation_options (promo_start_at, promo_end_at);

create table if not exists public.donation_option_audit (
  id uuid primary key default gen_random_uuid(),
  donation_option_id uuid null,
  actor_id uuid null,
  action text not null,
  before_data jsonb null,
  after_data jsonb null,
  created_at timestamptz not null default now(),
  constraint donation_option_audit_action_check check (action in ('insert', 'update', 'delete'))
);

create index if not exists idx_donation_option_audit_entity_time
  on public.donation_option_audit (donation_option_id, created_at desc);

create index if not exists idx_donation_option_audit_time
  on public.donation_option_audit (created_at desc);

create or replace function public.log_donation_option_audit()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.donation_option_audit (donation_option_id, actor_id, action, before_data, after_data)
    values (new.id, auth.uid(), 'insert', null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.donation_option_audit (donation_option_id, actor_id, action, before_data, after_data)
    values (new.id, auth.uid(), 'update', to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.donation_option_audit (donation_option_id, actor_id, action, before_data, after_data)
    values (old.id, auth.uid(), 'delete', to_jsonb(old), null);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_donation_options_updated_at on public.donation_options;
create trigger trg_donation_options_updated_at
before update on public.donation_options
for each row execute function public.handle_updated_at();

drop trigger if exists trg_donation_options_audit on public.donation_options;
create trigger trg_donation_options_audit
after insert or update or delete on public.donation_options
for each row execute function public.log_donation_option_audit();

insert into public.donation_options (
  title,
  subtitle,
  frequency,
  amount_minor,
  currency,
  is_custom,
  tags,
  is_active,
  is_featured,
  is_pinned,
  pin_order,
  display_order,
  global_order,
  campaign_label,
  campaign_copy,
  promo_start_at,
  promo_end_at,
  price_slot,
  stripe_price_id,
  stripe_product_id
)
values
  (
    'Custom donation amount',
    'Choose your own one-off amount for the masjid.',
    'one-off',
    null,
    'GBP',
    true,
    array['General', 'Sadaqah'],
    true,
    false,
    false,
    0,
    0,
    0,
    null,
    null,
    null,
    null,
    2,
    null,
    null
  ),
  (
    '£5 donation',
    'Quick one-off contribution.',
    'one-off',
    500,
    'GBP',
    false,
    array['General', 'Sadaqah'],
    true,
    false,
    false,
    0,
    1,
    1,
    null,
    null,
    null,
    null,
    1,
    null,
    null
  ),
  (
    '£10 donation',
    'One-off support for the masjid.',
    'one-off',
    1000,
    'GBP',
    false,
    array['Masjid Rebuild', 'Sadaqah'],
    true,
    false,
    false,
    0,
    2,
    2,
    null,
    null,
    null,
    null,
    6,
    null,
    null
  ),
  (
    '£10 monthly',
    'Starter monthly support for the masjid rebuild project.',
    'monthly',
    1000,
    'GBP',
    false,
    array['Masjid Rebuild', 'General'],
    true,
    false,
    false,
    0,
    0,
    3,
    null,
    null,
    null,
    null,
    4,
    null,
    null
  ),
  (
    '£25 monthly',
    'Monthly sadaqah for the masjid rebuild project.',
    'monthly',
    2500,
    'GBP',
    false,
    array['Masjid Rebuild', 'Sadaqah'],
    true,
    true,
    true,
    0,
    1,
    4,
    'Recommended',
    'Most selected recurring support tier.',
    null,
    null,
    3,
    null,
    null
  ),
  (
    '£50 monthly',
    'Sustained monthly support for masjid operations.',
    'monthly',
    5000,
    'GBP',
    false,
    array['Masjid Rebuild', 'General'],
    true,
    false,
    false,
    0,
    2,
    5,
    null,
    null,
    null,
    null,
    8,
    null,
    null
  ),
  (
    '£75 monthly',
    'Higher monthly contribution for long-term impact.',
    'monthly',
    7500,
    'GBP',
    false,
    array['Masjid Rebuild'],
    true,
    false,
    false,
    0,
    3,
    6,
    null,
    null,
    null,
    null,
    9,
    null,
    null
  ),
  (
    '£100 monthly',
    'Major monthly support for the masjid rebuild project.',
    'monthly',
    10000,
    'GBP',
    false,
    array['Masjid Rebuild'],
    true,
    false,
    false,
    0,
    4,
    7,
    null,
    null,
    null,
    null,
    7,
    null,
    null
  )
on conflict (price_slot) do update
set
  title = excluded.title,
  subtitle = excluded.subtitle,
  frequency = excluded.frequency,
  amount_minor = excluded.amount_minor,
  currency = excluded.currency,
  is_custom = excluded.is_custom,
  tags = excluded.tags,
  is_active = excluded.is_active,
  is_featured = excluded.is_featured,
  is_pinned = excluded.is_pinned,
  pin_order = excluded.pin_order,
  display_order = excluded.display_order,
  global_order = excluded.global_order,
  campaign_label = excluded.campaign_label,
  campaign_copy = excluded.campaign_copy,
  promo_start_at = excluded.promo_start_at,
  promo_end_at = excluded.promo_end_at,
  stripe_price_id = coalesce(excluded.stripe_price_id, public.donation_options.stripe_price_id),
  stripe_product_id = coalesce(excluded.stripe_product_id, public.donation_options.stripe_product_id),
  updated_at = now();

alter table public.donation_options enable row level security;
alter table public.donation_option_audit enable row level security;

grant select on public.donation_options to anon;
grant select, insert, update, delete on public.donation_options to authenticated;
grant select, insert on public.donation_option_audit to authenticated;

drop policy if exists donation_options_anon_read on public.donation_options;
create policy donation_options_anon_read
on public.donation_options
for select to anon
using (
  is_active = true
  and (promo_start_at is null or promo_start_at <= now())
  and (promo_end_at is null or promo_end_at > now())
);

drop policy if exists donation_options_auth_read on public.donation_options;
create policy donation_options_auth_read
on public.donation_options
for select to authenticated
using (true);

drop policy if exists donation_options_auth_insert on public.donation_options;
create policy donation_options_auth_insert
on public.donation_options
for insert to authenticated
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists donation_options_auth_update on public.donation_options;
create policy donation_options_auth_update
on public.donation_options
for update to authenticated
using (public.current_portal_role() in ('admin', 'editor'))
with check (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists donation_options_auth_delete on public.donation_options;
create policy donation_options_auth_delete
on public.donation_options
for delete to authenticated
using (public.current_portal_role() = 'admin');

drop policy if exists donation_option_audit_auth_read on public.donation_option_audit;
create policy donation_option_audit_auth_read
on public.donation_option_audit
for select to authenticated
using (public.current_portal_role() in ('admin', 'editor'));

drop policy if exists donation_option_audit_auth_insert on public.donation_option_audit;
create policy donation_option_audit_auth_insert
on public.donation_option_audit
for insert to authenticated
with check (public.current_portal_role() in ('admin', 'editor'));

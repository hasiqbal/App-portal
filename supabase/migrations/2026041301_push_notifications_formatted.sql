-- Adds formatted notification fields for rich payload support.
alter table if exists public.push_notifications
  add column if not exists urdu_body text,
  add column if not exists cta_label text,
  add column if not exists payload_json jsonb not null default '{}'::jsonb,
  add column if not exists format_version text not null default 'v1';

create index if not exists idx_push_notifications_format_version
  on public.push_notifications (format_version);

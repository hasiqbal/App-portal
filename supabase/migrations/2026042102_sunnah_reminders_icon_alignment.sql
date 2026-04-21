-- Ensure sunnah_reminders.icon exists for clients selecting icon.
-- Safe to run multiple times.

alter table if exists public.sunnah_reminders
  add column if not exists icon text;

update public.sunnah_reminders
set icon = coalesce(nullif(trim(icon), ''), 'star');

alter table if exists public.sunnah_reminders
  alter column icon set default 'star';

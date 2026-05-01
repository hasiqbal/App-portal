-- Extend automation schedule modes with custom recurrence options.
-- Safe to run multiple times.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'notification_automations_schedule_type_check'
      and conrelid = 'public.notification_automations'::regclass
  ) then
    alter table public.notification_automations
      drop constraint notification_automations_schedule_type_check;
  end if;

  alter table public.notification_automations
    add constraint notification_automations_schedule_type_check
    check (schedule_type in ('one_time', 'daily', 'weekly', 'every_n_days', 'monthly', 'prayer'));
end;
$$;
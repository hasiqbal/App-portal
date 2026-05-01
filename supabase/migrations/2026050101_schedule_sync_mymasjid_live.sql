create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drop any existing schedule with the same name so this migration is idempotent.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'jmn-sync-mymasjid-live-every-minute') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'jmn-sync-mymasjid-live-every-minute';
  end if;
end $$;

-- The function self-loops for ~50s polling every 5s, so a 1-minute cron
-- gives near-continuous coverage. The function uses a distributed lock
-- (app_settings.live_poll_lock_ts) to avoid concurrent overlap.
select cron.schedule(
  'jmn-sync-mymasjid-live-every-minute',
  '*/1 * * * *',
  $$
  select net.http_post(
    url := 'https://lhaqqqatdztuijgdfdcf.functions.supabase.co/sync-mymasjid-live',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTkxMTksImV4cCI6MjA5MTE3NTExOX0.Z3MV96PflYqwoexwsoi7ma4yAO3og1juWWu9YWviLbU"}'::jsonb,
    body := '{"dryRun":false}'::jsonb
  );
  $$
);

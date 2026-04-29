create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid)
from cron.job
where jobname = 'jmn-sync-youtube-live-every-minute';

select cron.schedule(
  'jmn-sync-youtube-live-every-minute',
  '*/1 * * * *',
  $$
  select net.http_post(
    url := 'https://lhaqqqatdztuijgdfdcf.functions.supabase.co/sync-youtube-live',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTkxMTksImV4cCI6MjA5MTE3NTExOX0.Z3MV96PflYqwoexwsoi7ma4yAO3og1juWWu9YWviLbU"}'::jsonb,
    body := '{"dryRun":false}'::jsonb
  );
  $$
);
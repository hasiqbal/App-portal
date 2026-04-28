-- Ensure local app notification templates are centrally managed in app_settings.
-- This migration updates existing values as well (not only missing keys).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_settings'
  ) THEN
    INSERT INTO public.app_settings (key, value, updated_at)
    VALUES (
      'notification_templates_v1',
      '{"prayerStart":{"title":"{prayerName} prayer time","body":"Azaan for {prayerName} has started."},"jamaatReminder":{"title":"{prayerName} jamaat in {minutes} minutes","body":"As-salatu khayrun minan nawm. {prayerName} jamaat starts in {minutes} minutes."},"adhkarReminder":{"title":"{prayerName} adhkar is due","body":"Open Duas for {prayerName} adhkar after jamaat."},"liveNow":{"title":"JMN Radio is now live","body":"Tap to open Jami'' Masjid Noorani live stream."},"livePrayerStart":{"title":"JMN Radio live - {prayerName} prayer time","body":"{prayerName} time has started. Tap to open JMN live stream."},"liveJamaatReminder":{"title":"JMN Radio live - {prayerName} jamaat in {minutes} min","body":"{prayerName} jamaat starts in {minutes} minutes. Tap to open live stream."}}',
      now()
    )
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at;
  END IF;
END;
$$;

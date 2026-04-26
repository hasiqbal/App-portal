-- Add lightweight contract constraints for recurring announcement events.
-- Uses NOT VALID to avoid blocking existing legacy rows while enforcing new writes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_recurrence_requires_event_date_chk'
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_recurrence_requires_event_date_chk
      CHECK (
        recurrence_type IS NULL
        OR recurrence_type = 'none'
        OR event_date IS NOT NULL
      ) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_recurrence_interval_chk'
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_recurrence_interval_chk
      CHECK (
        recurrence_interval IS NULL
        OR recurrence_interval >= 1
      ) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_recurrence_weekday_chk'
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_recurrence_weekday_chk
      CHECK (
        recurrence_weekday IS NULL
        OR recurrence_weekday BETWEEN 0 AND 6
      ) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_recurrence_month_day_chk'
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_recurrence_month_day_chk
      CHECK (
        recurrence_month_day IS NULL
        OR recurrence_month_day BETWEEN 1 AND 31
      ) NOT VALID;
  END IF;
END $$;

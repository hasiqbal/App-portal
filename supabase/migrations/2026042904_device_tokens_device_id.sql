-- Add device_id column to device_tokens so the same physical device
-- can be deduplicated even when the Expo push token rotates.
ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS device_id text;

-- Partial unique index: enforces one active row per device_id
-- but allows NULL (for old rows that don't have it yet).
CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_device_id_key
  ON public.device_tokens (device_id)
  WHERE device_id IS NOT NULL;

-- Index for fast lookup when deactivating stale tokens by device_id.
CREATE INDEX IF NOT EXISTS device_tokens_device_id_idx
  ON public.device_tokens (device_id)
  WHERE device_id IS NOT NULL;

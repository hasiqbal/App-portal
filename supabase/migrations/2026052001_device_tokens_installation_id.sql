-- Track the local app install separately from the physical device.
-- A reinstall clears the app's local storage and generates a new installation_id,
-- which lets the app refresh a device_tokens row even if the Expo token is reused.
ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS installation_id text;

CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_installation_id_key
  ON public.device_tokens (installation_id)
  WHERE installation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS device_tokens_installation_id_idx
  ON public.device_tokens (installation_id)
  WHERE installation_id IS NOT NULL;
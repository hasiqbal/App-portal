const MISSING_FLAG_KEY = 'masjid-settings:missing-table';

let missingTableCache = false;

function persistMissingFlag(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MISSING_FLAG_KEY, '1');
  } catch {
    // Ignore storage failures.
  }
}

function readMissingFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MISSING_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function shouldSkipMasjidSettingsRequests(): boolean {
  if (missingTableCache) return true;
  if (readMissingFlag()) {
    missingTableCache = true;
    return true;
  }
  return false;
}

export function isMasjidSettingsMissingError(error: unknown): boolean {
  const message = typeof error === 'string'
    ? error
    : (error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '');
  const lowered = message.toLowerCase();

  return (
    lowered.includes('masjid_settings')
    && (
      lowered.includes('does not exist')
      || lowered.includes('relation')
      || lowered.includes('schema cache')
      || lowered.includes('not found')
      || lowered.includes('404')
    )
  );
}

export function markMasjidSettingsMissing(): void {
  missingTableCache = true;
  persistMissingFlag();
}

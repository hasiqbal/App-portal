import { createClient } from '@supabase/supabase-js';

const LEGACY_EXTERNAL_SUPABASE_URL = 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const LEGACY_EXTERNAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTkxMTksImV4cCI6MjA5MTE3NTExOX0.Z3MV96PflYqwoexwsoi7ma4yAO3og1juWWu9YWviLbU';

const SUPABASE_URL = (
  import.meta.env.VITE_EXTERNAL_SUPABASE_URL
  || LEGACY_EXTERNAL_SUPABASE_URL
  || ''
).trim();

const SUPABASE_ANON_KEY = (
  import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY
  || LEGACY_EXTERNAL_SUPABASE_ANON_KEY
  || ''
).trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_EXTERNAL_SUPABASE_* overrides).',
  );
}

/** Standard client — uses anon key + user JWT after login */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Compatibility alias: legacy call sites still import supabaseAdmin.
// It now uses the signed-in user session instead of any privileged key.
export const supabaseAdmin = supabase;

/**
 * OnSpace Cloud Supabase client — used for storage workflows.
 * Falls back to the main supabase client when dedicated OnSpace vars are not present.
 */
export const onspaceCloud = createClient(
  (import.meta.env.VITE_SUPABASE_URL as string) || SUPABASE_URL,
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

/**
 * Invoke an edge function on the configured Supabase project.
 * You can override function host via VITE_EXTERNAL_FUNCTIONS_BASE_URL when needed.
 */
export async function invokeExternalFunction<T = unknown>(
  functionName: string,
  body: unknown,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? SUPABASE_ANON_KEY;
    const functionsBaseUrl = (
      import.meta.env.VITE_EXTERNAL_FUNCTIONS_BASE_URL
      || `${SUPABASE_URL}/functions/v1`
    ).replace(/\/$/, '');

    const res = await fetch(
      `${functionsBaseUrl}/${functionName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { data: null, error: `[${res.status}] ${text}` };
    }
    const data = await res.json() as T;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

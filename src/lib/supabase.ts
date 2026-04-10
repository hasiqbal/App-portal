import { createClient } from '@supabase/supabase-js';

// External Supabase database: lhaqqqatdztuijgdfdcf.supabase.co
const SUPABASE_URL      = 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTkxMTksImV4cCI6MjA5MTE3NTExOX0.Z3MV96PflYqwoexwsoi7ma4yAO3og1juWWu9YWviLbU';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU5OTExOSwiZXhwIjoyMDkxMTc1MTE5fQ.Dlt1Dkkh7WzUPLOVh1JgNU7h6u3m1PyttSlHuNxho4w';

/** Standard client — uses anon key + user JWT after login */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Admin client — uses service role key, bypasses all RLS.
 * Use ONLY for portal_users management and admin-only operations.
 * Never expose to end users / mobile app.
 */
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * OnSpace Cloud Supabase client — used for STORAGE operations only.
 * The adhkar-images bucket lives in OnSpace Cloud, not the external Supabase.
 * Uses VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY auto-configured by OnSpace.
 */
export const onspaceCloud = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { auth: { persistSession: false } },
);

/**
 * Invoke an edge function on the EXTERNAL Supabase instance (lhaqqqatdztuijgdfdcf).
 * This is needed because supabase.functions.invoke() routes to OnSpace Cloud,
 * not to the external Supabase project where our edge functions actually live.
 */
export async function invokeExternalFunction<T = unknown>(
  functionName: string,
  body: unknown,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/${functionName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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

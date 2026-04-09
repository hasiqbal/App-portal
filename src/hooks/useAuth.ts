/**
 * Authentication hook + context
 *
 * Features:
 * - DB-backed login (portal_users table) with role-based access
 * - Local session persisted in localStorage
 * - 30-minute inactivity timeout with a 2-minute warning toast
 * - Auto-resets on any user interaction (mouse, keyboard, touch)
 * - Activity logs written directly to OnSpace Cloud activity_log table
 */

import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase, supabaseAdmin } from '@/lib/supabase';

// ─── OnSpace Cloud — activity log destination ─────────────────────────────────
// We write activity logs here (not to external Supabase) because OnSpace Cloud
// is reliably accessible with anon key and we have full control over its schema.
const ONSPACE_URL     = 'https://erwtsmhykudttxbeerwt.backend.onspace.ai';
const ONSPACE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyd3RzbWhva3VkdHR4YmVlcnd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDgxMTksImV4cCI6MjA1OTQyNDExOX0.sNXApMNqRjBbVDI-BOZ3kQZXCmpAkUWJqkIWB1FqvLc';

// ─── Activity Log Helper ──────────────────────────────────────────────────────

export async function logActivity(params: {
  username: string;
  user_role: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  entity_label?: string | null;
  details?: Record<string, unknown> | null;
}) {
  const row = {
    username:     params.username,
    user_role:    params.user_role,
    action:       params.action,
    entity_type:  params.entity_type,
    entity_id:    params.entity_id   ?? null,
    entity_label: params.entity_label ?? null,
    details:      params.details      ?? null,
    ip_address:   null,
  };

  try {
    const res = await fetch(`${ONSPACE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':        ONSPACE_ANON_KEY,
        'Authorization': `Bearer ${ONSPACE_ANON_KEY}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(row),
    });

    if (res.ok) {
      console.log('[ActivityLog] ✓ logged:', params.action, 'for', params.username);
    } else {
      const text = await res.text().catch(() => res.statusText);
      console.error('[ActivityLog] ✗ failed:', res.status, text);
    }
  } catch (e) {
    console.error('[ActivityLog] ✗ network error:', e);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface LocalUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

interface AuthState {
  user: LocalUser | null;
  loading: boolean;
  localLogin: (user: LocalUser) => void;
  signOut: () => Promise<void>;
  /** Check credential against DB and return user on success */
  dbLogin: (username: string, password: string) => Promise<LocalUser>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_KEY    = 'jmn_admin_session';
const SESSION_TS_KEY = 'jmn_admin_last_active';
const TIMEOUT_MS     = 30 * 60 * 1000;  // 30 minutes
const WARNING_BEFORE =  2 * 60 * 1000;  // warn 2 minutes before
const CHECK_INTERVAL = 30 * 1000;       // check every 30 seconds

// Shared Supabase Auth service account — gives portal sessions the `authenticated`
// role so RLS write policies are satisfied on the external Supabase.
const PORTAL_SERVICE_EMAIL    = 'portal@jmn-masjid.internal';
const PORTAL_SERVICE_PASSWORD = 'JMN_Portal_2024!Secure';

// ─── Context ──────────────────────────────────────────────────────────────────

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: false,
  localLogin: () => {},
  signOut: async () => {},
  dbLogin: async () => { throw new Error('AuthContext not mounted'); },
});

export const useAuth = () => useContext(AuthContext);

// ─── useAuthState (used once in App.tsx as the provider) ─────────────────────

export function useAuthState(): AuthState {
  const [user, setUser]       = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const warningToastId        = useRef<string | number | null>(null);
  const signOutRef            = useRef<() => Promise<void>>();

  // ── Core sign-out ─────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed: LocalUser = JSON.parse(stored);
        await logActivity({
          username:     parsed.username,
          user_role:    parsed.role,
          action:       'logout',
          entity_type:  'session',
          entity_label: 'Signed out',
          details:      { name: parsed.name },
        });
      } catch { /* ignore */ }
    }

    setUser(null);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_TS_KEY);
    if (warningToastId.current !== null) {
      toast.dismiss(warningToastId.current);
      warningToastId.current = null;
    }
    await supabase.auth.signOut();
  }, []);

  signOutRef.current = signOut;

  // ── Timestamp helpers ─────────────────────────────────────────────────────
  const touchActivity = useCallback(() => {
    localStorage.setItem(SESSION_TS_KEY, String(Date.now()));
    if (warningToastId.current !== null) {
      toast.dismiss(warningToastId.current);
      warningToastId.current = null;
    }
  }, []);

  const getLastActive = (): number => {
    const ts = localStorage.getItem(SESSION_TS_KEY);
    return ts ? parseInt(ts, 10) : Date.now();
  };

  // ── Supabase Auth sign-in (gets authenticated JWT for write access) ─────
  const signIntoSupabase = useCallback(async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email:    PORTAL_SERVICE_EMAIL,
      password: PORTAL_SERVICE_PASSWORD,
    });
    if (error) {
      console.warn('[Auth] Supabase sign-in failed — authenticated writes may be blocked:', error.message);
    }
  }, []);

  // ── DB login ──────────────────────────────────────────────────────────────
  const dbLogin = useCallback(async (username: string, password: string): Promise<LocalUser> => {
    const normalised = username.trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '_');
    console.log('[Auth] dbLogin attempt for:', normalised);

    // Use admin client to bypass RLS on external Supabase portal_users
    const { data, error } = await supabaseAdmin
      .from('portal_users')
      .select('id, username, name, role, is_active, password')
      .eq('username', normalised)
      .maybeSingle();

    console.log('[Auth] portal_users result:', {
      found: !!data,
      error: error?.message,
      username: data?.username,
      role: data?.role,
    });

    if (!error && data) {
      if (!data.is_active) {
        throw new Error('Your account has been deactivated. Contact the administrator.');
      }
      if (data.password !== password) {
        throw new Error('Incorrect password. Please try again.');
      }

      // Update last_login (fire-and-forget)
      supabaseAdmin
        .from('portal_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.id)
        .then(() => {});

      // Establish Supabase Auth session for write access
      await signIntoSupabase();

      const localUser: LocalUser = {
        id:       data.id,
        username: data.username,
        name:     data.name || data.username,
        role:     data.role as UserRole,
      };

      // Log to OnSpace Cloud activity_log
      await logActivity({
        username:     data.username,
        user_role:    data.role,
        action:       'login',
        entity_type:  'session',
        entity_label: `Signed in as ${data.role}`,
        details:      { name: data.name, platform: navigator.platform },
      });

      return localUser;
    }

    // ── Fallback: root admin hardcoded ─────────────────────────────────────
    const storedCreds = (() => {
      try { return JSON.parse(localStorage.getItem('__jmn_admin_creds__') ?? 'null'); } catch { return null; }
    })();
    const adminPassword: string = storedCreds?.password ?? 'admin';

    if (normalised === 'admin' && password === adminPassword) {
      // Seed default users on first admin login
      supabaseAdmin.from('portal_users').upsert(
        { username: 'admin', name: 'Root Administrator', password: adminPassword, role: 'admin', is_active: true, created_by: 'system' },
        { onConflict: 'username' }
      ).then(() => {
        supabaseAdmin.from('portal_users').upsert(
          [
            { username: 'masjid_editor', name: 'Masjid Editor', password: 'editor123', role: 'editor', is_active: true, created_by: 'admin' },
            { username: 'masjid_viewer', name: 'Masjid Viewer', password: 'viewer123', role: 'viewer', is_active: true, created_by: 'admin' },
          ],
          { onConflict: 'username', ignoreDuplicates: true }
        ).then(() => {});
      });

      await signIntoSupabase();

      await logActivity({
        username:     'admin',
        user_role:    'admin',
        action:       'login',
        entity_type:  'session',
        entity_label: 'Signed in as admin',
        details:      { platform: navigator.platform },
      });

      return { id: 'root-admin', username: 'admin', name: 'Root Administrator', role: 'admin' };
    }

    // User not found — list available usernames for debugging
    const { data: allUsers } = await supabaseAdmin
      .from('portal_users')
      .select('username')
      .order('username');
    const hint = allUsers && allUsers.length > 0
      ? ` Available: ${allUsers.map((u: { username: string }) => u.username).join(', ')}`
      : '';
    throw new Error(`Username "${normalised}" not found.${hint}`);
  }, [signIntoSupabase]);

  // ── Local login ────────────────────────────────────────────────────────────
  const localLogin = useCallback((u: LocalUser) => {
    setUser(u);
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    touchActivity();
  }, [touchActivity]);

  // ── Restore session on mount ───────────────────────────────────────────────
  useEffect(() => {
    const restore = async () => {
      try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) {
          const parsed: LocalUser = JSON.parse(stored);
          const idle = Date.now() - getLastActive();
          if (idle < TIMEOUT_MS) {
            setUser(parsed);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) await signIntoSupabase();
          } else {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(SESSION_TS_KEY);
            await supabase.auth.signOut();
          }
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
      setLoading(false);
    };
    restore();
  }, [signIntoSupabase]);

  // ── Activity listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const handler = () => touchActivity();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    touchActivity();
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [user, touchActivity]);

  // ── Inactivity checker ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      const idle      = Date.now() - getLastActive();
      const remaining = TIMEOUT_MS - idle;
      if (remaining <= 0) {
        clearInterval(interval);
        toast.error('Session expired due to inactivity. Please sign in again.', { duration: 5000 });
        signOutRef.current?.();
        return;
      }
      if (remaining <= WARNING_BEFORE && warningToastId.current === null) {
        warningToastId.current = toast.warning(
          'You will be signed out in 2 minutes due to inactivity.',
          {
            duration:  WARNING_BEFORE,
            id:        'session-warning',
            action:    { label: 'Stay signed in', onClick: () => touchActivity() },
          }
        );
      }
    }, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [user, touchActivity]);

  return { user, loading, localLogin, signOut, dbLogin };
}

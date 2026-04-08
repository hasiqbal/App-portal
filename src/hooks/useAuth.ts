/**
 * Authentication hook + context
 *
 * Features:
 * - DB-backed login (portal_users table) with role-based access
 * - Local session persisted in localStorage
 * - 30-minute inactivity timeout with a 2-minute warning toast
 * - Auto-resets on any user interaction (mouse, keyboard, touch)
 */

import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

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
// role so RLS write policies are satisfied. All portal roles are still managed
// by the portal_users table; this is purely for Supabase JWT authentication.
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
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_TS_KEY);
    if (warningToastId.current !== null) {
      toast.dismiss(warningToastId.current);
      warningToastId.current = null;
    }
    // Sign out of Supabase Auth so the authenticated JWT is revoked
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
      email: PORTAL_SERVICE_EMAIL,
      password: PORTAL_SERVICE_PASSWORD,
    });
    if (error) {
      // Non-fatal: log but don't block portal login
      console.warn('Supabase Auth sign-in failed (write operations may be blocked):', error.message);
    } else {
      console.log('Supabase Auth session established — authenticated writes enabled.');
    }
  }, []);

  // ── DB login ──────────────────────────────────────────────────────────────
  const dbLogin = useCallback(async (username: string, password: string): Promise<LocalUser> => {
    const normalised = username.trim().toLowerCase();

    // ── Try database first ────────────────────────────────────────────────
    const { data, error } = await supabase
      .from('portal_users')
      .select('id, username, name, role, is_active, password')
      .eq('username', normalised)
      .maybeSingle();            // maybeSingle returns null instead of error when no row found

    // Table exists and row found → validate
    if (!error && data) {
      if (!data.is_active) {
        throw new Error('Your account has been deactivated. Contact the administrator.');
      }
      if (data.password !== password) {
        throw new Error('Invalid username or password.');
      }
      // Update last_login timestamp (fire-and-forget)
      supabase
        .from('portal_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.id)
        .then(() => {});

      // Establish Supabase Auth session for authenticated write access
      await signIntoSupabase();

      return {
        id: data.id,
        username: data.username,
        name: data.name || data.username,
        role: data.role as UserRole,
      };
    }

    // ── Fallback: table missing or no users yet → accept root admin ───────
    // This handles first-time setup before portal_users is seeded.
    const storedCreds = (() => {
      try { return JSON.parse(localStorage.getItem('__jmn_admin_creds__') ?? 'null'); } catch { return null; }
    })();
    const adminPassword: string = storedCreds?.password ?? 'admin';

    if (normalised === 'admin' && password === adminPassword) {
      // Best-effort: try to ensure the root admin row exists in the DB
      supabase.from('portal_users').upsert(
        { username: 'admin', name: 'Root Administrator', password: adminPassword, role: 'admin', is_active: true, created_by: 'system' },
        { onConflict: 'username' }
      ).then(() => {});

      // Establish Supabase Auth session for authenticated write access
      await signIntoSupabase();

      return { id: 'root-admin', username: 'admin', name: 'Root Administrator', role: 'admin' };
    }

    throw new Error('Invalid username or password.');
  }, [signIntoSupabase]);

  // ── Local login (set session after dbLogin succeeds) ──────────────────────
  const localLogin = useCallback((u: LocalUser) => {
    setUser(u);
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    touchActivity();
  }, [touchActivity]);

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    const restore = async () => {
      try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) {
          const parsed: LocalUser = JSON.parse(stored);
          const idle = Date.now() - getLastActive();
          if (idle < TIMEOUT_MS) {
            setUser(parsed);
            // Re-establish Supabase Auth session on page reload
            // (check if we already have a valid session first)
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
              await signIntoSupabase();
            }
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

  // ── Activity listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const handler = () => touchActivity();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    touchActivity();
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [user, touchActivity]);

  // ── Inactivity checker ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      const idle = Date.now() - getLastActive();
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
            duration: WARNING_BEFORE,
            id: 'session-warning',
            action: { label: 'Stay signed in', onClick: () => touchActivity() },
          }
        );
      }
    }, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [user, touchActivity]);

  return { user, loading, localLogin, signOut, dbLogin };
}

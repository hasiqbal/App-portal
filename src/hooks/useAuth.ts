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
import { invokeExternalFunction, supabase } from '#/lib/supabase';

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
  };

  try {
    const { error } = await invokeExternalFunction('portal-auth', {
      action: 'logActivity',
      row,
    });

    if (!error) {
      console.log('[ActivityLog] ✓ logged:', params.action, 'for', params.username);
    } else {
      console.error('[ActivityLog] ✗ failed:', error);
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

type PortalAuthLoginResult = {
  user: LocalUser;
  session: {
    access_token: string;
    refresh_token: string;
  };
};

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

  // ── DB login ──────────────────────────────────────────────────────────────
  const dbLogin = useCallback(async (username: string, password: string): Promise<LocalUser> => {
    const normalised = username.trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '_');
    console.log('[Auth] dbLogin attempt for:', normalised);
    const { data, error } = await invokeExternalFunction<PortalAuthLoginResult>('portal-auth', {
      action: 'login',
      username: normalised,
      password,
    });

    if (error || !data?.user || !data.session?.access_token || !data.session?.refresh_token) {
      throw new Error(error || 'Login failed.');
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    if (sessionError) {
      throw new Error(`Login session failed: ${sessionError.message}`);
    }

    // Ensure the active access token is freshly minted from the refresh token.
    // This helps role claims (portal_role) stay in sync for RLS-protected writes.
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      throw new Error(`Login session refresh failed: ${refreshError.message}`);
    }

    return data.user;
  }, []);

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
            if (!session) {
              localStorage.removeItem(SESSION_KEY);
              localStorage.removeItem(SESSION_TS_KEY);
              setUser(null);
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
  }, []);

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

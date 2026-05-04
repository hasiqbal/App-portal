import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type PortalUserRole = 'admin' | 'editor' | 'viewer';

type PortalUser = {
  id: string;
  username: string;
  name: string;
  role: PortalUserRole;
  is_active: boolean;
  password: string;
};

type LoginPayload = {
  action: 'login';
  username?: string;
  password?: string;
};

type LogActivityPayload = {
  action: 'logActivity';
  row?: {
    username?: string;
    user_role?: string;
    action?: string;
    entity_type?: string;
    entity_id?: string | null;
    entity_label?: string | null;
    details?: Record<string, unknown> | null;
  };
};

type ListActivityLogsPayload = {
  action: 'listActivityLogs';
  limit?: number;
};

type RequestPayload = LoginPayload | LogActivityPayload | ListActivityLogsPayload | { action?: string };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const PORTAL_SERVICE_EMAIL = Deno.env.get('PORTAL_SERVICE_EMAIL') ?? '';
const PORTAL_SERVICE_PASSWORD = Deno.env.get('PORTAL_SERVICE_PASSWORD') ?? '';
const PORTAL_ROOT_ADMIN_PASSWORD = Deno.env.get('PORTAL_ROOT_ADMIN_PASSWORD') ?? 'admin';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getRequesterRole(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) {
    return 'service_role';
  }

  const claims = decodeJwtClaims(token);
  if (!claims) return null;

  const userMetadata = (claims.user_metadata ?? null) as Record<string, unknown> | null;
  return (
    (typeof userMetadata?.portal_role === 'string' ? userMetadata.portal_role : null)
    ?? (typeof claims.portal_role === 'string' ? claims.portal_role : null)
    ?? (typeof claims.role === 'string' ? claims.role : null)
  );
}

async function ensureServiceSession(admin: ReturnType<typeof createClient>, role: PortalUserRole, username: string) {
  if (!PORTAL_SERVICE_EMAIL || !PORTAL_SERVICE_PASSWORD) {
    return { error: 'Missing PORTAL_SERVICE_EMAIL or PORTAL_SERVICE_PASSWORD.' } as const;
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signInServiceUser = () => authClient.auth.signInWithPassword({
    email: PORTAL_SERVICE_EMAIL,
    password: PORTAL_SERVICE_PASSWORD,
  });

  let { data: signInData, error: signInError } = await signInServiceUser();

  if (signInError || !signInData.session || !signInData.user) {
    const { error: createUserError } = await admin.auth.admin.createUser({
      email: PORTAL_SERVICE_EMAIL,
      password: PORTAL_SERVICE_PASSWORD,
      email_confirm: true,
      user_metadata: { portal_service: true },
    });

    if (createUserError && !/already|exists|registered/i.test(createUserError.message || '')) {
      return { error: createUserError.message || 'Service account provisioning failed.' } as const;
    }

    const retry = await signInServiceUser();
    signInData = retry.data;
    signInError = retry.error;
  }

  if (signInError || !signInData.session || !signInData.user) {
    return { error: signInError?.message || 'Service account sign-in failed.' } as const;
  }

  await admin.auth.admin.updateUserById(signInData.user.id, {
    user_metadata: {
      portal_role: role,
      portal_username: username,
    },
  });

  // Re-sign-in to force a fresh access token that contains updated role claims.
  const refreshed = await signInServiceUser();
  if (refreshed.error || !refreshed.data.session) {
    return { error: refreshed.error?.message || 'Failed to refresh service session.' } as const;
  }

  return {
    session: {
      access_token: refreshed.data.session.access_token,
      refresh_token: refreshed.data.session.refresh_token,
    },
  } as const;
}

async function handleLogin(admin: ReturnType<typeof createClient>, payload: LoginPayload) {
  const username = (payload.username ?? '').trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '_');
  const password = payload.password ?? '';

  if (!username || !password) {
    return jsonResponse({ error: 'username and password are required.' }, 400);
  }

  const { data, error } = await admin
    .from('portal_users')
    .select('id, username, name, role, is_active, password')
    .eq('username', username)
    .maybeSingle<PortalUser>();

  let userRow = data;

  if (!error && !data && username === 'admin' && password === PORTAL_ROOT_ADMIN_PASSWORD) {
    await admin.from('portal_users').upsert(
      {
        username: 'admin',
        name: 'Root Administrator',
        password: PORTAL_ROOT_ADMIN_PASSWORD,
        role: 'admin',
        is_active: true,
        created_by: 'system',
      },
      { onConflict: 'username' },
    );

    await admin.from('portal_users').upsert(
      [
        {
          username: 'masjid_editor',
          name: 'Masjid Editor',
          password: 'editor123',
          role: 'editor',
          is_active: true,
          created_by: 'admin',
        },
      ],
      { onConflict: 'username', ignoreDuplicates: true },
    );

    const seeded = await admin
      .from('portal_users')
      .select('id, username, name, role, is_active, password')
      .eq('username', 'admin')
      .single<PortalUser>();

    if (seeded.error) {
      return jsonResponse({ error: seeded.error.message }, 500);
    }

    userRow = seeded.data;
  }

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  if (!userRow) {
    const { data: users } = await admin.from('portal_users').select('username').order('username');
    const hint = users && users.length > 0
      ? ` Available: ${users.map((u: { username: string }) => u.username).join(', ')}`
      : '';
    return jsonResponse({ error: `Username "${username}" not found.${hint}` }, 404);
  }

  if (!userRow.is_active) {
    return jsonResponse({ error: 'Your account has been deactivated. Contact the administrator.' }, 403);
  }

  if (userRow.password !== password) {
    return jsonResponse({ error: 'Incorrect password. Please try again.' }, 401);
  }

  await admin
    .from('portal_users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', userRow.id);

  const serviceSession = await ensureServiceSession(admin, userRow.role, userRow.username);
  if ('error' in serviceSession) {
    return jsonResponse({ error: serviceSession.error }, 500);
  }

  await admin.from('activity_log').insert({
    username: userRow.username,
    user_role: userRow.role,
    action: 'login',
    entity_type: 'session',
    entity_label: `Signed in as ${userRow.role}`,
    details: { name: userRow.name, source: 'portal-auth' },
  });

  return jsonResponse({
    user: {
      id: userRow.id,
      username: userRow.username,
      name: userRow.name || userRow.username,
      role: userRow.role,
    },
    session: serviceSession.session,
  });
}

async function handleLogActivity(req: Request, admin: ReturnType<typeof createClient>, payload: LogActivityPayload) {
  const requesterRole = getRequesterRole(req);
  if (!requesterRole || !['service_role', 'admin', 'editor'].includes(requesterRole)) {
    return jsonResponse({ error: 'Unauthorized.' }, 401);
  }

  const row = payload.row;
  if (!row || !row.username || !row.user_role || !row.action || !row.entity_type) {
    return jsonResponse({ error: 'Invalid activity payload.' }, 400);
  }

  const { error } = await admin.from('activity_log').insert({
    username: row.username,
    user_role: row.user_role,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id ?? null,
    entity_label: row.entity_label ?? null,
    details: row.details ?? null,
  });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true });
}

async function handleListActivityLogs(req: Request, admin: ReturnType<typeof createClient>, payload: ListActivityLogsPayload) {
  const requesterRole = getRequesterRole(req);
  if (!requesterRole || !['service_role', 'admin'].includes(requesterRole)) {
    return jsonResponse({ error: 'Unauthorized.' }, 401);
  }

  const limitRaw = Number(payload.limit ?? 500);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.floor(limitRaw))) : 500;

  const { data, error } = await admin
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse(data ?? []);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const payload = (await req.json().catch(() => ({}))) as RequestPayload;

  switch (payload.action) {
    case 'login':
      return handleLogin(admin, payload);
    case 'logActivity':
      return handleLogActivity(req, admin, payload);
    case 'listActivityLogs':
      return handleListActivityLogs(req, admin, payload);
    default:
      return jsonResponse({ error: 'Unsupported action.' }, 400);
  }
});

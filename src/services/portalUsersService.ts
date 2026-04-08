/**
 * Portal Users Service
 * CRUD operations for admin portal user accounts.
 * Only admin-role users should invoke mutating methods.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { UserRole } from '@/hooks/useAuth';
import { activityLogger } from '@/services/activityLogService';

// All portal_users operations use the admin client (service role)
// so they bypass RLS and never depend on the authenticated JWT policy.
const db = supabaseAdmin;

export interface PortalUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_by: string | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserPayload {
  username: string;
  name: string;
  password: string;
  role: UserRole;
  created_by?: string;
}

export interface UpdateUserPayload {
  name?: string;
  role?: UserRole;
  is_active?: boolean;
  password?: string;
}

export const portalUsersService = {
  /** Fetch all portal users (passwords omitted from UI display). */
  getAll: async (): Promise<PortalUser[]> => {
    const { data, error } = await db
      .from('portal_users')
      .select('id, username, name, role, is_active, created_by, last_login, created_at, updated_at')
      .order('role', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      console.error('portal_users getAll error:', error.message, error.code);
      throw new Error(`Failed to fetch users: ${error.message}`);
    }
    console.log('portal_users getAll:', data?.length, 'rows returned');
    return data as PortalUser[];
  },

  /** Create a new portal user. */
  create: async (payload: CreateUserPayload): Promise<PortalUser> => {
    // uses db (admin client) — no RLS restriction
    const username = payload.username.trim().toLowerCase();
    if (!username) throw new Error('Username is required.');
    if (username.length < 3) throw new Error('Username must be at least 3 characters.');
    if (!/^[a-z0-9_.-]+$/.test(username)) throw new Error('Username can only contain letters, numbers, underscores, dots, and hyphens.');
    if (!payload.password || payload.password.length < 6) throw new Error('Password must be at least 6 characters.');

    const { data, error } = await db
      .from('portal_users')
      .insert({
        username,
        name: payload.name || username,
        password: payload.password,
        role: payload.role,
        created_by: payload.created_by ?? 'admin',
        is_active: true,
      })
      .select('id, username, name, role, is_active, created_by, last_login, created_at, updated_at')
      .single();
    if (error) {
      if (error.code === '23505') throw new Error(`Username "${username}" is already taken.`);
      throw new Error(`Failed to create user: ${error.message}`);
    }
    activityLogger.log('user_created', 'portal_user', { entityId: data.id, entityLabel: data.username, details: { role: data.role } });
    return data as PortalUser;
  },

  /** Update a portal user's editable fields. */
  update: async (id: string, payload: UpdateUserPayload): Promise<PortalUser> => {
    if (payload.password !== undefined && payload.password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (payload.name !== undefined)      update.name      = payload.name;
    if (payload.role !== undefined)      update.role      = payload.role;
    if (payload.is_active !== undefined) update.is_active = payload.is_active;
    if (payload.password !== undefined && payload.password.trim()) {
      update.password = payload.password.trim();
    }

    const { data, error } = await db
      .from('portal_users')
      .update(update)
      .eq('id', id)
      .select('id, username, name, role, is_active, created_by, last_login, created_at, updated_at')
      .single();
    if (error) throw new Error(`Failed to update user: ${error.message}`);
    // Determine what kind of update this was
    if (payload.is_active !== undefined) {
      activityLogger.log(
        payload.is_active ? 'user_activated' : 'user_deactivated',
        'portal_user',
        { entityId: id, entityLabel: data.username }
      );
    } else {
      activityLogger.log('user_updated', 'portal_user', { entityId: id, entityLabel: data.username });
    }
    return data as PortalUser;
  },

  /** Delete a portal user by ID. Cannot delete the root admin. */
  delete: async (id: string, requesterUsername: string): Promise<void> => {
    // Prevent deleting yourself
    const { data: target } = await db
      .from('portal_users')
      .select('username, role')
      .eq('id', id)
      .single();

    if (target?.username === requesterUsername) {
      throw new Error('You cannot delete your own account.');
    }
    if (target?.role === 'admin' && target.username === 'admin') {
      throw new Error('The root admin account cannot be deleted.');
    }

    const { error } = await db.from('portal_users').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete user: ${error.message}`);
    activityLogger.log('user_deleted', 'portal_user', { entityId: id, entityLabel: target?.username });
  },
};

/**
 * usePermissions hook
 * Returns capability flags derived from the logged-in user's role.
 *
 * Roles:
 *  admin  → full access (read, write, delete, user management)
 *  editor → read + write, no delete, no user management
 *  viewer → read-only
 */

import { useAuth, UserRole } from '#/hooks/useAuth';

export interface Permissions {
  role: UserRole | null;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageUsers: boolean;
  isAdmin: boolean;
}

export function usePermissions(): Permissions {
  const { user } = useAuth();
  const role = user?.role ?? null;

  return {
    role,
    canView:        !!role,
    canEdit:        role === 'admin' || role === 'editor',
    canDelete:      role === 'admin',
    canManageUsers: role === 'admin',
    isAdmin:        role === 'admin',
  };
}

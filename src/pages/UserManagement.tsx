import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Users, Plus, Pencil, Trash2, Shield, Eye, Edit2,
  CheckCircle, XCircle, RefreshCw, KeyRound, UserCog,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import Sidebar from '@/components/layout/Sidebar';
import PageBanner from '@/components/layout/PageBanner';
import { useAuth, type UserRole } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { portalUsersService, type PortalUser } from '@/services/portalUsersService';

// ─── Role config ──────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bg: string; Icon: React.ElementType; description: string }> = {
  admin: {
    label: 'Admin',
    color: 'text-purple-700',
    bg: 'bg-purple-50 border-purple-200',
    Icon: Shield,
    description: 'Full access — manage users, edit and delete all content',
  },
  editor: {
    label: 'Editor',
    color: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-200',
    Icon: Edit2,
    description: 'Can view and edit content, cannot delete or manage users',
  },
  viewer: {
    label: 'Viewer',
    color: 'text-slate-600',
    bg: 'bg-slate-50 border-slate-200',
    Icon: Eye,
    description: 'Read-only access to all portal sections',
  },
};

const RoleBadge = ({ role }: { role: UserRole }) => {
  const { label, color, bg, Icon } = ROLE_CONFIG[role];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${color} ${bg}`}>
      <Icon size={10} />
      {label}
    </span>
  );
};

// ─── User form dialog ─────────────────────────────────────────────────────────

interface UserFormDialogProps {
  open: boolean;
  onClose: () => void;
  editUser?: PortalUser | null;
  currentUsername: string;
}

const EMPTY_FORM = { username: '', name: '', password: '', confirmPassword: '', role: 'viewer' as UserRole };

const UserFormDialog = ({ open, onClose, editUser, currentUsername }: UserFormDialogProps) => {
  const qc = useQueryClient();
  const isEdit = !!editUser;
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);

  // Reset form when dialog opens
  const handleOpen = (o: boolean) => {
    if (o) {
      setForm(
        isEdit
          ? { username: editUser!.username, name: editUser!.name, password: '', confirmPassword: '', role: editUser!.role }
          : EMPTY_FORM
      );
    }
  };

  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const createMutation = useMutation({
    mutationFn: () =>
      portalUsersService.create({
        username: form.username,
        name: form.name,
        password: form.password,
        role: form.role,
        created_by: currentUsername,
      }),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['portal_users'] });
      toast.success(`User "${u.username}" created successfully.`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      portalUsersService.update(editUser!.id, {
        name: form.name,
        role: form.role,
        ...(form.password ? { password: form.password } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal_users'] });
      toast.success('User updated successfully.');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && form.password !== form.confirmPassword) {
      toast.error('Passwords do not match.'); return;
    }
    if (isEdit && form.password && form.password !== form.confirmPassword) {
      toast.error('Passwords do not match.'); return;
    }
    isEdit ? updateMutation.mutate() : createMutation.mutate();
  };

  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { handleOpen(o); if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[hsl(142_60%_28%)]">
            <UserCog size={18} />
            {isEdit ? 'Edit User' : 'Create New User'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Username (create only) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Username</Label>
            <Input
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              placeholder="e.g. john_doe"
              disabled={isEdit}
              className={`border-[hsl(140_20%_88%)] ${isEdit ? 'bg-slate-50 text-muted-foreground' : ''}`}
              required={!isEdit}
            />
            {isEdit && (
              <p className="text-[11px] text-muted-foreground">Username cannot be changed after creation.</p>
            )}
          </div>

          {/* Display name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Display Name</Label>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. John Doe"
              className="border-[hsl(140_20%_88%)]"
              required
            />
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Role</Label>
            <Select value={form.role} onValueChange={(v) => set('role', v as UserRole)}>
              <SelectTrigger className="border-[hsl(140_20%_88%)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_CONFIG) as UserRole[]).map((r) => {
                  const { label, Icon, description } = ROLE_CONFIG[r];
                  return (
                    <SelectItem key={r} value={r}>
                      <div className="flex items-start gap-2 py-0.5">
                        <Icon size={13} className="mt-0.5 shrink-0" />
                        <div>
                          <p className="font-semibold text-xs">{label}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight">{description}</p>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">
              {isEdit ? 'New Password' : 'Password'}
              {isEdit && <span className="font-normal text-muted-foreground ml-1">(leave blank to keep current)</span>}
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder={isEdit ? '••••••••' : 'Min. 6 characters'}
                className="pr-20 border-[hsl(140_20%_88%)]"
                required={!isEdit}
                minLength={isEdit ? 0 : 6}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground px-1"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          {((!isEdit) || form.password) && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Confirm Password</Label>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(e) => set('confirmPassword', e.target.value)}
                placeholder="Re-enter password"
                className="border-[hsl(140_20%_88%)]"
                required={!isEdit || !!form.password}
              />
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              style={{ background: 'hsl(142 60% 32%)', color: 'white' }}
            >
              {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ─── User row card ────────────────────────────────────────────────────────────

interface UserRowProps {
  u: PortalUser;
  currentUser: { username: string };
  onEdit: (u: PortalUser) => void;
  onDelete: (u: PortalUser) => void;
  onToggleActive: (u: PortalUser) => void;
}

const UserRow = ({ u, currentUser, onEdit, onDelete, onToggleActive }: UserRowProps) => {
  const isSelf = u.username === currentUser.username;
  const isRootAdmin = u.username === 'admin' && u.role === 'admin';

  return (
    <div className={`bg-white rounded-xl border p-4 flex items-start gap-4 transition-all ${
      !u.is_active ? 'opacity-60 border-slate-200' : 'border-[hsl(140_20%_88%)] shadow-sm'
    }`}>
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
        u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
        u.role === 'editor' ? 'bg-blue-100 text-blue-700' :
        'bg-slate-100 text-slate-600'
      }`}>
        {(u.name || u.username).slice(0, 2).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-[hsl(150_30%_12%)]">{u.name || u.username}</span>
          {isSelf && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-700 bg-green-50">
              You
            </Badge>
          )}
          {isRootAdmin && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50">
              Root
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">@{u.username}</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <RoleBadge role={u.role} />
          {u.last_login ? (
            <span className="text-[10px] text-muted-foreground">
              Last login: {new Date(u.last_login).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">Never logged in</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Active toggle — not for root admin or self */}
        {!isRootAdmin && !isSelf && (
          <div className="flex items-center gap-1.5" title={u.is_active ? 'Deactivate account' : 'Activate account'}>
            {u.is_active
              ? <CheckCircle size={13} className="text-green-500" />
              : <XCircle size={13} className="text-slate-400" />
            }
            <Switch
              checked={u.is_active}
              onCheckedChange={() => onToggleActive(u)}
              className="scale-75"
            />
          </div>
        )}

        {/* Edit */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onEdit(u)}
          className="h-8 w-8 p-0 hover:bg-[hsl(142_50%_93%)] hover:text-[hsl(142_60%_28%)]"
          title="Edit user"
        >
          <Pencil size={13} />
        </Button>

        {/* Delete — not for root admin or self */}
        {!isRootAdmin && !isSelf && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(u)}
            className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
            title="Delete user"
          >
            <Trash2 size={13} />
          </Button>
        )}
      </div>
    </div>
  );
};

// ─── Role legend card ─────────────────────────────────────────────────────────

const RoleLegend = () => (
  <div className="bg-white rounded-xl border border-[hsl(140_20%_88%)] p-4 space-y-3">
    <p className="text-xs font-bold text-[hsl(150_30%_18%)] uppercase tracking-wide">Role Permissions</p>
    <div className="space-y-2">
      {(Object.entries(ROLE_CONFIG) as [UserRole, (typeof ROLE_CONFIG)[UserRole]][]).map(([role, cfg]) => (
        <div key={role} className={`flex items-start gap-2 p-2 rounded-lg border ${cfg.bg}`}>
          <cfg.Icon size={13} className={`mt-0.5 shrink-0 ${cfg.color}`} />
          <div>
            <p className={`text-[11px] font-bold ${cfg.color}`}>{cfg.label}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{cfg.description}</p>
          </div>
        </div>
      ))}
    </div>
    <div className="border-t border-[hsl(140_20%_88%)] pt-3 space-y-1">
      <p className="text-[10px] font-semibold text-[hsl(150_30%_18%)]">Security Notes</p>
      <ul className="text-[10px] text-muted-foreground space-y-0.5 list-disc list-inside">
        <li>Only admins can manage user accounts</li>
        <li>Passwords can only be changed by an admin</li>
        <li>The root admin cannot be deleted</li>
        <li>Sessions expire after 30 minutes of inactivity</li>
      </ul>
    </div>
  </div>
);

// ─── Stats row ────────────────────────────────────────────────────────────────

const UserStats = ({ users }: { users: PortalUser[] }) => {
  const active = users.filter((u) => u.is_active).length;
  const admins = users.filter((u) => u.role === 'admin').length;
  const editors = users.filter((u) => u.role === 'editor').length;
  const viewers = users.filter((u) => u.role === 'viewer').length;

  const stats = [
    { label: 'Total Users', value: users.length, color: 'text-[hsl(142_60%_28%)]', bg: 'bg-[hsl(142_50%_93%)]' },
    { label: 'Active', value: active, color: 'text-green-700', bg: 'bg-green-50' },
    { label: 'Admins', value: admins, color: 'text-purple-700', bg: 'bg-purple-50' },
    { label: 'Editors', value: editors, color: 'text-blue-700', bg: 'bg-blue-50' },
    { label: 'Viewers', value: viewers, color: 'text-slate-600', bg: 'bg-slate-50' },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
      {stats.map((s) => (
        <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
          <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const UserManagement = () => {
  const { user: currentUser } = useAuth();
  const { canManageUsers } = usePermissions();
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PortalUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<PortalUser | null>(null);

  const { data: users = [], isLoading, error, refetch } = useQuery({
    queryKey: ['portal_users'],
    queryFn: () => portalUsersService.getAll(),
  });

  const toggleMutation = useMutation({
    mutationFn: (u: PortalUser) => portalUsersService.update(u.id, { is_active: !u.is_active }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['portal_users'] });
      toast.success(`User "${updated.username}" ${updated.is_active ? 'activated' : 'deactivated'}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (u: PortalUser) => portalUsersService.delete(u.id, currentUser?.username ?? ''),
    onSuccess: (_, u) => {
      qc.invalidateQueries({ queryKey: ['portal_users'] });
      toast.success(`User "${u.username}" deleted.`);
      setDeleteConfirm(null);
    },
    onError: (e: Error) => { toast.error(e.message); setDeleteConfirm(null); },
  });

  // Guard: non-admins see a restricted view
  if (!canManageUsers) {
    return (
      <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center md:pt-0 pt-14">
          <div className="text-center space-y-3 p-8">
            <Shield size={40} className="mx-auto text-purple-300" />
            <h2 className="text-lg font-bold text-[hsl(150_30%_18%)]">Admin Only</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              User management is restricted to admin-role accounts only. Contact your administrator for access.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />
      <main className="flex-1 md:pt-0 pt-14">
        <PageBanner
          icon={<Users size={22} />}
          title="User Management"
          subtitle="Manage portal accounts, roles, and access permissions"
        />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-10 space-y-6">
          {/* Stats */}
          {users.length > 0 && <UserStats users={users} />}

          {/* Main content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* User list */}
            <div className="lg:col-span-2 space-y-4">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[hsl(150_30%_18%)]">
                  Portal Users
                  <span className="ml-2 text-xs font-normal text-muted-foreground">({users.length})</span>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refetch()}
                    className="h-8 gap-1.5 text-xs border-[hsl(140_20%_88%)]"
                  >
                    <RefreshCw size={12} />
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => { setEditTarget(null); setFormOpen(true); }}
                    className="h-8 gap-1.5 text-xs"
                    style={{ background: 'hsl(142 60% 32%)', color: 'white' }}
                  >
                    <Plus size={13} />
                    Add User
                  </Button>
                </div>
              </div>

              {/* Loading */}
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-[hsl(142_60%_35%)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="space-y-3">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                    <p className="font-semibold mb-1">Failed to load users</p>
                    <p className="text-xs">{(error as Error).message}</p>
                  </div>
                  {/* SQL fix banner for missing authenticated SELECT policy */}
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                    <p className="text-xs font-bold text-amber-800">⚠ Run this SQL on your Supabase Dashboard → SQL Editor to fix access:</p>
                    <pre className="bg-white border border-amber-200 rounded-lg p-3 text-[10px] font-mono text-slate-700 overflow-x-auto whitespace-pre">{`-- Fix portal_users: add authenticated SELECT policy
create policy "authenticated_select_portal_users"
  on portal_users for select to authenticated
  using (true);

-- Create activity_log table
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  user_role text not null default 'admin',
  action text not null,
  entity_type text not null,
  entity_id text,
  entity_label text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_created_at_idx on activity_log(created_at desc);
create index if not exists activity_log_username_idx on activity_log(username);
create index if not exists activity_log_entity_type_idx on activity_log(entity_type);
alter table activity_log enable row level security;
create policy "anon_no_access" on activity_log for select to anon using (false);
create policy "auth_insert" on activity_log for insert to authenticated with check (true);
create policy "auth_select" on activity_log for select to authenticated using (true);

-- Add editor & viewer users
insert into portal_users (username, name, password, role, is_active, created_by)
values
  ('masjid_editor', 'Masjid Editor', 'editor123', 'editor', true, 'admin'),
  ('masjid_viewer', 'Masjid Viewer', 'viewer123', 'viewer', true, 'admin')
on conflict (username) do nothing;`}</pre>
                    <Button size="sm" variant="outline" onClick={() => refetch()} className="border-amber-400 text-amber-700 hover:bg-amber-100">
                      Retry After Running SQL
                    </Button>
                  </div>
                </div>
              )}

              {/* User list */}
              {!isLoading && !error && (
                <div className="space-y-3">
                  {users.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      No users found.
                    </div>
                  ) : (
                    users.map((u) => (
                      <UserRow
                        key={u.id}
                        u={u}
                        currentUser={currentUser!}
                        onEdit={(target) => { setEditTarget(target); setFormOpen(true); }}
                        onDelete={setDeleteConfirm}
                        onToggleActive={(target) => toggleMutation.mutate(target)}
                      />
                    ))
                  )}
                </div>
              )}

              {/* Password info box */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2.5">
                <KeyRound size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  <strong>Password Policy:</strong> Passwords are managed exclusively by admins. Users cannot change their own passwords from the login screen — all resets must be done from this page.
                </p>
              </div>
            </div>

            {/* Role legend */}
            <div>
              <RoleLegend />
            </div>
          </div>
        </div>

        {/* Create/Edit dialog */}
        <UserFormDialog
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditTarget(null); }}
          editUser={editTarget}
          currentUsername={currentUser?.username ?? ''}
        />

        {/* Delete confirm dialog */}
        <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-red-700">Delete User?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete{' '}
              <strong>@{deleteConfirm?.username}</strong>? This cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default UserManagement;

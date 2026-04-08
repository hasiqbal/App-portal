import React, { useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import Sidebar from '@/components/layout/Sidebar';
import PageBanner from '@/components/layout/PageBanner';
import { useAuth } from '@/hooks/useAuth';
import { supabaseAdmin } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRole = 'admin' | 'editor' | 'viewer';

interface PortalUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_by: string | null;
  last_login: string | null;
  created_at: string;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function fetchUsers(): Promise<PortalUser[]> {
  const { data, error } = await supabaseAdmin
    .from('portal_users')
    .select('id, username, name, role, is_active, created_by, last_login, created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data as PortalUser[];
}

async function createUser(payload: {
  username: string; name: string; password: string; role: UserRole; created_by: string;
}): Promise<PortalUser> {
  const username = payload.username.trim().toLowerCase();
  if (!username || username.length < 3) throw new Error('Username must be at least 3 characters.');
  if (!/^[a-z0-9_.-]+$/.test(username)) throw new Error('Username may only contain letters, numbers, underscores, dots, hyphens.');
  if (!payload.password || payload.password.length < 6) throw new Error('Password must be at least 6 characters.');
  const { data, error } = await supabaseAdmin
    .from('portal_users')
    .insert({ username, name: payload.name || username, password: payload.password, role: payload.role, created_by: payload.created_by, is_active: true })
    .select('id, username, name, role, is_active, created_by, last_login, created_at')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error(`Username "${username}" is already taken.`);
    throw new Error(error.message);
  }
  return data as PortalUser;
}

async function updateUser(id: string, fields: Partial<{ name: string; role: UserRole; is_active: boolean; password: string }>): Promise<PortalUser> {
  if (fields.password !== undefined && fields.password.length > 0 && fields.password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.name      !== undefined) update.name      = fields.name;
  if (fields.role      !== undefined) update.role      = fields.role;
  if (fields.is_active !== undefined) update.is_active = fields.is_active;
  if (fields.password  !== undefined && fields.password.trim()) update.password = fields.password.trim();
  const { data, error } = await supabaseAdmin
    .from('portal_users')
    .update(update)
    .eq('id', id)
    .select('id, username, name, role, is_active, created_by, last_login, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data as PortalUser;
}

async function deleteUser(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('portal_users').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Role config ──────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bg: string; Icon: React.ElementType; description: string }> = {
  admin:  { label: 'Admin',  color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', Icon: Shield, description: 'Full access — manage users, edit and delete all content' },
  editor: { label: 'Editor', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     Icon: Edit2,  description: 'View and edit content; cannot delete or manage users' },
  viewer: { label: 'Viewer', color: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200',   Icon: Eye,    description: 'Read-only access to all portal sections' },
};

const RoleBadge = ({ role }: { role: UserRole }) => {
  const cfg = ROLE_CONFIG[role];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.color} ${cfg.bg}`}>
      <cfg.Icon size={10} />
      {cfg.label}
    </span>
  );
};

// ─── User Form Dialog ─────────────────────────────────────────────────────────

interface FormState {
  username: string; name: string; role: UserRole; password: string; confirm: string;
}

const BLANK: FormState = { username: '', name: '', role: 'viewer', password: '', confirm: '' };

const UserFormDialog = ({
  open, onClose, editUser, currentUsername,
}: {
  open: boolean; onClose: () => void; editUser: PortalUser | null; currentUsername: string;
}) => {
  const qc = useQueryClient();
  const isEdit = !!editUser;
  const [form, setForm] = useState<FormState>(BLANK);
  const [showPwd, setShowPwd] = useState(false);

  // Reset when dialog opens
  React.useEffect(() => {
    if (open) {
      setShowPwd(false);
      setForm(isEdit
        ? { username: editUser!.username, name: editUser!.name, role: editUser!.role, password: '', confirm: '' }
        : BLANK
      );
    }
  }, [open]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const createMut = useMutation({
    mutationFn: () => createUser({ username: form.username, name: form.name, password: form.password, role: form.role, created_by: currentUsername }),
    onSuccess: (u) => { qc.invalidateQueries({ queryKey: ['portal_users'] }); toast.success(`User @${u.username} created.`); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: () => updateUser(editUser!.id, { name: form.name, role: form.role, ...(form.password ? { password: form.password } : {}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portal_users'] }); toast.success('User updated.'); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = createMut.isPending || updateMut.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && form.password !== form.confirm) { toast.error('Passwords do not match.'); return; }
    if (isEdit && form.password && form.password !== form.confirm) { toast.error('Passwords do not match.'); return; }
    isEdit ? updateMut.mutate() : createMut.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[hsl(142_60%_28%)]">
            <UserCog size={18} />
            {isEdit ? 'Edit User' : 'Create User'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          {/* Username */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Username</Label>
            <Input
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              placeholder="e.g. masjid_editor"
              disabled={isEdit}
              required={!isEdit}
              className="border-[hsl(140_20%_88%)]"
            />
            {isEdit && <p className="text-[11px] text-muted-foreground">Username cannot be changed.</p>}
          </div>

          {/* Display name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Display Name</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Full name" required className="border-[hsl(140_20%_88%)]" />
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Role</Label>
            <Select value={form.role} onValueChange={(v) => set('role', v as UserRole)}>
              <SelectTrigger className="border-[hsl(140_20%_88%)]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(ROLE_CONFIG) as [UserRole, typeof ROLE_CONFIG[UserRole]][]).map(([r, cfg]) => (
                  <SelectItem key={r} value={r}>
                    <div className="flex items-start gap-2 py-0.5">
                      <cfg.Icon size={13} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-xs">{cfg.label}</p>
                        <p className="text-[10px] text-muted-foreground">{cfg.description}</p>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">
              {isEdit ? 'New Password' : 'Password'}
              {isEdit && <span className="font-normal text-muted-foreground ml-1">(leave blank to keep)</span>}
            </Label>
            <div className="relative">
              <Input
                type={showPwd ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder={isEdit ? '••••••••' : 'Min. 6 characters'}
                required={!isEdit}
                minLength={isEdit ? 0 : 6}
                className="pr-16 border-[hsl(140_20%_88%)]"
              />
              <button type="button" onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">
                {showPwd ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Confirm */}
          {(!isEdit || form.password) && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Confirm Password</Label>
              <Input
                type={showPwd ? 'text' : 'password'}
                value={form.confirm}
                onChange={(e) => set('confirm', e.target.value)}
                placeholder="Re-enter password"
                required={!isEdit || !!form.password}
                className="border-[hsl(140_20%_88%)]"
              />
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy} style={{ background: 'hsl(142 60% 32%)', color: 'white' }}>
              {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ─── Delete Confirm ───────────────────────────────────────────────────────────

const DeleteDialog = ({
  user, onClose, onConfirm, busy,
}: {
  user: PortalUser | null; onClose: () => void; onConfirm: () => void; busy: boolean;
}) => (
  <Dialog open={!!user} onOpenChange={(v) => { if (!v) onClose(); }}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="text-red-700">Delete User?</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        Permanently delete <strong>@{user?.username}</strong>? This cannot be undone.
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="destructive" onClick={onConfirm} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ─── User Card ────────────────────────────────────────────────────────────────

const UserCard = ({
  user,
  isSelf,
  onEdit,
  onDelete,
  onToggle,
}: {
  user: PortalUser;
  isSelf: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) => {
  const isRootAdmin = user.username === 'admin' && user.role === 'admin';
  const initials = (user.name || user.username).slice(0, 2).toUpperCase();
  const avatarColor = user.role === 'admin' ? 'bg-purple-100 text-purple-700' : user.role === 'editor' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600';

  return (
    <div className={`bg-white rounded-xl border p-4 flex items-center gap-4 transition-all ${!user.is_active ? 'opacity-60 border-slate-200' : 'border-[hsl(140_20%_88%)] shadow-sm'}`}>
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor}`}>
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-[hsl(150_30%_12%)]">{user.name || user.username}</span>
          {isSelf && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-green-300 text-green-700 bg-green-50 font-bold">You</span>}
          {isRootAdmin && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-300 text-amber-700 bg-amber-50 font-bold">Root</span>}
        </div>
        <p className="text-xs text-muted-foreground">@{user.username}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <RoleBadge role={user.role} />
          <span className="text-[10px] text-muted-foreground">
            {user.last_login
              ? `Last login: ${new Date(user.last_login).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : 'Never logged in'}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {!isRootAdmin && !isSelf && (
          <div className="flex items-center gap-1.5">
            {user.is_active ? <CheckCircle size={12} className="text-green-500" /> : <XCircle size={12} className="text-slate-400" />}
            <Switch checked={user.is_active} onCheckedChange={onToggle} className="scale-75" />
          </div>
        )}
        <Button size="sm" variant="ghost" onClick={onEdit} className="h-8 w-8 p-0 hover:bg-[hsl(142_50%_93%)] hover:text-[hsl(142_60%_28%)]">
          <Pencil size={13} />
        </Button>
        {!isRootAdmin && !isSelf && (
          <Button size="sm" variant="ghost" onClick={onDelete} className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600">
            <Trash2 size={13} />
          </Button>
        )}
      </div>
    </div>
  );
};

// ─── Stats ────────────────────────────────────────────────────────────────────

const Stats = ({ users }: { users: PortalUser[] }) => {
  const items = [
    { label: 'Total',   value: users.length,                              color: 'text-[hsl(142_60%_28%)]', bg: 'bg-[hsl(142_50%_93%)]' },
    { label: 'Active',  value: users.filter((u) => u.is_active).length,  color: 'text-green-700',          bg: 'bg-green-50' },
    { label: 'Admins',  value: users.filter((u) => u.role === 'admin').length,  color: 'text-purple-700',  bg: 'bg-purple-50' },
    { label: 'Editors', value: users.filter((u) => u.role === 'editor').length, color: 'text-blue-700',    bg: 'bg-blue-50' },
    { label: 'Viewers', value: users.filter((u) => u.role === 'viewer').length, color: 'text-slate-600',   bg: 'bg-slate-50' },
  ];
  return (
    <div className="grid grid-cols-5 gap-3">
      {items.map((s) => (
        <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
          <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
};

// ─── Role Legend ──────────────────────────────────────────────────────────────

const RoleLegend = () => (
  <div className="bg-white rounded-xl border border-[hsl(140_20%_88%)] p-4 space-y-3">
    <p className="text-xs font-bold text-[hsl(150_30%_18%)] uppercase tracking-wide">Role Permissions</p>
    <div className="space-y-2">
      {(Object.entries(ROLE_CONFIG) as [UserRole, typeof ROLE_CONFIG[UserRole]][]).map(([role, cfg]) => (
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
        <li>Passwords reset only by an admin</li>
        <li>Root admin cannot be deleted</li>
        <li>Sessions expire after 30 min inactivity</li>
      </ul>
    </div>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

const UserManagement = () => {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();

  const [formOpen,       setFormOpen]       = useState(false);
  const [editTarget,     setEditTarget]     = useState<PortalUser | null>(null);
  const [deleteTarget,   setDeleteTarget]   = useState<PortalUser | null>(null);

  const { data: users = [], isLoading, error, refetch } = useQuery({
    queryKey: ['portal_users'],
    queryFn: fetchUsers,
    staleTime: 0,
  });

  const toggleMut = useMutation({
    mutationFn: (u: PortalUser) => updateUser(u.id, { is_active: !u.is_active }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['portal_users'] });
      toast.success(`@${updated.username} ${updated.is_active ? 'activated' : 'deactivated'}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (u: PortalUser) => deleteUser(u.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal_users'] });
      toast.success('User deleted.');
      setDeleteTarget(null);
    },
    onError: (e: Error) => { toast.error(e.message); setDeleteTarget(null); },
  });

  const openCreate = () => { setEditTarget(null); setFormOpen(true); };
  const openEdit   = (u: PortalUser) => { setEditTarget(u); setFormOpen(true); };

  const handleDelete = (u: PortalUser) => {
    if (u.username === 'admin') { toast.error('Root admin cannot be deleted.'); return; }
    if (u.username === currentUser?.username) { toast.error('Cannot delete your own account.'); return; }
    setDeleteTarget(u);
  };

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
          {users.length > 0 && <Stats users={users} />}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* User List */}
            <div className="lg:col-span-2 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[hsl(150_30%_18%)]">
                  Portal Users <span className="ml-1 text-xs font-normal text-muted-foreground">({users.length})</span>
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 gap-1.5 text-xs border-[hsl(140_20%_88%)]">
                    <RefreshCw size={12} /> Refresh
                  </Button>
                  <Button size="sm" onClick={openCreate} className="h-8 gap-1.5 text-xs" style={{ background: 'hsl(142 60% 32%)', color: 'white' }}>
                    <Plus size={13} /> Add User
                  </Button>
                </div>
              </div>

              {/* Loading */}
              {isLoading && (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-[hsl(142_60%_35%)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {/* Error */}
              {!isLoading && error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-red-700 mb-1">Failed to load users</p>
                  <p className="text-xs text-red-600">{(error as Error).message}</p>
                  <Button size="sm" variant="outline" onClick={() => refetch()} className="mt-3 border-red-300 text-red-700">Retry</Button>
                </div>
              )}

              {/* List */}
              {!isLoading && !error && (
                <div className="space-y-3">
                  {users.length === 0
                    ? <p className="text-center py-10 text-sm text-muted-foreground">No users found.</p>
                    : users.map((u) => (
                        <UserCard
                          key={u.id}
                          user={u}
                          isSelf={u.username === currentUser?.username}
                          onEdit={() => openEdit(u)}
                          onDelete={() => handleDelete(u)}
                          onToggle={() => toggleMut.mutate(u)}
                        />
                      ))
                  }
                </div>
              )}

              {/* Policy notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2.5">
                <KeyRound size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  <strong>Password Policy:</strong> Passwords are managed exclusively by admins. Users cannot reset their own passwords.
                </p>
              </div>
            </div>

            {/* Sidebar legend */}
            <div><RoleLegend /></div>
          </div>
        </div>

        {/* Dialogs */}
        <UserFormDialog
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditTarget(null); }}
          editUser={editTarget}
          currentUsername={currentUser?.username ?? 'admin'}
        />
        <DeleteDialog
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget)}
          busy={deleteMut.isPending}
        />
      </main>
    </div>
  );
};

export default UserManagement;

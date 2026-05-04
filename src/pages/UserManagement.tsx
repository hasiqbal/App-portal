import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users, Plus, Pencil, Trash2, RefreshCw, Shield, Eye, EyeOff,
  Search, CheckCircle2, XCircle, Activity,
  UserCheck, UserX, Loader2,
  KeyRound, LogIn, LogOut, FileText, Edit3, ToggleLeft,
  ChevronDown, ChevronUp, Download, Clock, Filter,
} from 'lucide-react';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog';
import Sidebar from '#/components/layout/Sidebar';
import { invokeExternalFunction, supabaseAdmin } from '#/lib/supabase';
import { useAuth, logActivity } from '#/hooks/useAuth';
import { toast } from 'sonner';

async function fetchActivityLogs(): Promise<ActivityLog[]> {
  const { data, error } = await invokeExternalFunction<ActivityLog[]>('portal-auth', {
    action: 'listActivityLogs',
    limit: 500,
  });
  if (error) throw new Error(error);
  return Array.isArray(data) ? data : [];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortalUser {
  id: string;
  username: string;
  name: string;
  password: string;
  role: 'admin' | 'editor' | 'viewer';
  is_active: boolean;
  created_by: string | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

interface ActivityLog {
  id: string;
  username: string;
  user_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  { value: 'admin',  label: 'Admin',  desc: 'Full access — can manage users, settings, and all content', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'editor', label: 'Editor', desc: 'Can edit all content but cannot manage users or settings',   color: 'bg-blue-100 text-blue-700 border-blue-200' },
];

const ROLE_COLORS: Record<string, string> = {
  admin:  'bg-purple-100 text-purple-700 border-purple-200',
  editor: 'bg-blue-100 text-blue-700 border-blue-200',
  viewer: 'bg-slate-100 text-slate-600 border-slate-200',
};

const ROLE_AVATAR_BG: Record<string, string> = {
  admin:  '#7c3aed',
  editor: '#1d4ed8',
  viewer: '#475569',
};

// Action metadata
const ACTION_META: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  login:   { icon: <LogIn    size={13} />, color: '#059669', bg: '#d1fae5', label: 'Login'   },
  logout:  { icon: <LogOut   size={13} />, color: '#6b7280', bg: '#f3f4f6', label: 'Logout'  },
  create:  { icon: <Plus     size={13} />, color: '#2563eb', bg: '#dbeafe', label: 'Create'  },
  update:  { icon: <Edit3    size={13} />, color: '#d97706', bg: '#fef3c7', label: 'Update'  },
  delete:  { icon: <Trash2   size={13} />, color: '#dc2626', bg: '#fee2e2', label: 'Delete'  },
  toggle:  { icon: <ToggleLeft size={13} />, color: '#0891b2', bg: '#cffafe', label: 'Toggle' },
  reorder: { icon: <RefreshCw size={13} />, color: '#7c3aed', bg: '#ede9fe', label: 'Reorder' },
  send:    { icon: <Activity size={13} />,  color: '#ea580c', bg: '#ffedd5', label: 'Send'   },
  import:  { icon: <FileText size={13} />,  color: '#16a34a', bg: '#dcfce7', label: 'Import'  },
};

const CONTENT_ACTIONS = ['create', 'update', 'delete', 'toggle', 'reorder', 'import', 'send'];

function getActionMeta(action: string) {
  const key = action.toLowerCase();
  return ACTION_META[key] ?? { icon: <Activity size={13} />, color: '#6b7280', bg: '#f3f4f6', label: action };
}

function includesAnyText(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function isNotificationActivity(log: ActivityLog) {
  const action = (log.action ?? '').toLowerCase();
  const text = `${log.entity_type ?? ''} ${log.entity_label ?? ''} ${JSON.stringify(log.details ?? {})}`.toLowerCase();
  return action === 'send' || includesAnyText(text, ['notification', 'announcement', 'broadcast', 'push']);
}

function isPrayerActivity(log: ActivityLog) {
  const text = `${log.entity_type ?? ''} ${log.entity_label ?? ''} ${JSON.stringify(log.details ?? {})}`.toLowerCase();
  return includesAnyText(text, ['prayer', 'adhan', 'adhaan', 'jamaat', 'iqamah', 'salah', 'namaz']);
}

function getActivityBrief(log: ActivityLog) {
  const action = (log.action ?? '').toLowerCase();
  const entity = log.entity_label || log.entity_type || 'Item';

  if (action === 'login') return 'Signed in';
  if (action === 'logout') return 'Signed out';

  if (isNotificationActivity(log)) return 'Notification sent';

  if (isPrayerActivity(log) && ['update', 'edit', 'toggle', 'reorder'].includes(action)) {
    return 'Prayer time changed';
  }

  if (action === 'create') return `${entity} created`;
  if (action === 'update') return `${entity} updated`;
  if (action === 'delete') return `${entity} deleted`;
  if (action === 'toggle') return `${entity} toggled`;
  if (action === 'reorder') return `${entity} reordered`;
  if (action === 'import') return `${entity} imported`;
  if (action === 'send') return `${entity} sent`;

  return log.entity_label || `${getActionMeta(log.action).label} action`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function groupByDate(logs: ActivityLog[]): { date: string; logs: ActivityLog[] }[] {
  const groups: Record<string, ActivityLog[]> = {};
  for (const log of logs) {
    const d = new Date(log.created_at);
    const today    = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    let label: string;
    if (d.toDateString() === today.toDateString())     label = 'Today';
    else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
    else label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(log);
  }
  return Object.entries(groups).map(([date, logs]) => ({ date, logs }));
}

function toBriefActionText(actionCounts: Record<string, number>, maxItems = 3) {
  const ranked = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems);

  if (ranked.length === 0) return 'No actions';

  return ranked
    .map(([action, count]) => `${count} ${action}`)
    .join(' · ');
}

// ─── Export helper ────────────────────────────────────────────────────────────

function exportToCsv(logs: ActivityLog[]) {
  const headers = ['Timestamp', 'Username', 'Role', 'Action', 'Entity Type', 'Entity', 'IP'];
  const rows = logs.map((l) => [
    formatDateTime(l.created_at),
    l.username,
    l.user_role,
    l.action,
    l.entity_type,
    l.entity_label ?? l.entity_id ?? '',
    l.ip_address ?? '',
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Activity Log Panel ───────────────────────────────────────────────────────

type EventScope = 'all' | 'auth' | 'changes' | 'notifications' | 'prayer';

const ActivityLogPanel = ({
  logs,
  loading,
  onRefresh,
}: {
  logs: ActivityLog[];
  loading: boolean;
  onRefresh: () => void;
}) => {
  const [search,      setSearch]      = useState('');
  const [filterUser,  setFilterUser]  = useState('all');
  const [eventScope,  setEventScope]  = useState<EventScope>('all');
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [summarySelectedOnly, setSummarySelectedOnly] = useState(false);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(onRefresh, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, onRefresh]);

  const uniqueUsers = useMemo(() =>
    [...new Set(logs.map((l) => l.username))].sort(), [logs]);

  const scopedLogs = useMemo(() => {
    switch (eventScope) {
      case 'auth':
        return logs.filter((l) => ['login', 'logout'].includes((l.action ?? '').toLowerCase()));
      case 'changes':
        return logs.filter((l) => CONTENT_ACTIONS.includes((l.action ?? '').toLowerCase()));
      case 'notifications':
        return logs.filter((l) => isNotificationActivity(l));
      case 'prayer':
        return logs.filter((l) => isPrayerActivity(l));
      default:         return logs;
    }
  }, [logs, eventScope]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return scopedLogs.filter((l) => {
      const matchSearch = !q
        || l.username.toLowerCase().includes(q)
        || l.action.toLowerCase().includes(q)
        || (l.entity_label ?? '').toLowerCase().includes(q)
        || (l.entity_type  ?? '').toLowerCase().includes(q);
      const matchUser = filterUser === 'all' || l.username === filterUser;
      return matchSearch && matchUser;
    });
  }, [scopedLogs, search, filterUser]);

  const summaryLogs = useMemo(() => {
    if (!summarySelectedOnly || filterUser === 'all') return scopedLogs;
    return scopedLogs.filter((l) => l.username === filterUser);
  }, [scopedLogs, summarySelectedOnly, filterUser]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const userActionSummary = useMemo(() => {
    const byUser = new Map<string, {
      user_role: string;
      total: number;
      lastAt: string;
      latestAction: string;
      actions: Record<string, number>;
    }>();

    for (const log of summaryLogs) {
      const existing = byUser.get(log.username);
      const actionKey = (log.action || 'unknown').toLowerCase();

      if (!existing) {
        byUser.set(log.username, {
          user_role: log.user_role,
          total: 1,
          lastAt: log.created_at,
          latestAction: log.action,
          actions: { [actionKey]: 1 },
        });
        continue;
      }

      existing.total += 1;
      if (new Date(log.created_at).getTime() > new Date(existing.lastAt).getTime()) {
        existing.lastAt = log.created_at;
        existing.latestAction = log.action;
      }
      existing.actions[actionKey] = (existing.actions[actionKey] ?? 0) + 1;
    }

    return [...byUser.entries()]
      .map(([username, data]) => ({ username, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [summaryLogs]);

  // Stats
  const todayCount  = useMemo(() => {
    const today = new Date().toDateString();
    return logs.filter((l) => new Date(l.created_at).toDateString() === today).length;
  }, [logs]);

  const loginCount  = logs.filter((l) => (l.action ?? '').toLowerCase() === 'login').length;
  const activeUsers = new Set(logs.map((l) => l.username)).size;

  return (
    <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 border-b border-border bg-gradient-to-r from-[hsl(142_50%_97%)] to-white">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Activity size={16} style={{ color: 'hsl(var(--primary))' }} />
              Activity Log
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Full audit trail of all portal actions</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              title={autoRefresh ? 'Auto-refresh on (every 30s)' : 'Auto-refresh off'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                autoRefresh
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-white border-border text-muted-foreground hover:bg-muted/30'
              }`}
            >
              <Clock size={12} className={autoRefresh ? 'animate-pulse' : ''} />
              <span className="hidden sm:inline">{autoRefresh ? 'Live' : 'Paused'}</span>
            </button>
            <Button
              variant="outline" size="sm"
              onClick={() => filtered.length > 0 && exportToCsv(filtered)}
              disabled={filtered.length === 0}
              className="gap-1.5 text-xs"
            >
              <Download size={12} /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="gap-1.5">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        {/* Stats pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { label: 'Total events',   value: logs.length,  color: 'hsl(var(--primary))' },
            { label: 'Today',          value: todayCount,   color: '#059669' },
            { label: 'Logins',         value: loginCount,   color: '#2563eb' },
            { label: 'Active users',   value: activeUsers,  color: '#7c3aed' },
          ].map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 bg-white/80 shadow-sm"
            >
              <span className="text-sm font-bold" style={{ color: s.color }}>{s.value}</span>
              <span className="text-[11px] text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user, action, or what was done…"
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="relative">
            <Filter size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={eventScope}
              onChange={(e) => setEventScope(e.target.value as EventScope)}
              className="h-8 pl-7 pr-3 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
              title="Filter by event scope"
            >
              <option value="all">All events</option>
              <option value="auth">Auth only</option>
              <option value="notifications">Notifications</option>
              <option value="prayer">Prayer updates</option>
              <option value="changes">Content changes</option>
            </select>
          </div>
          <div className="relative">
            <Filter size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="h-8 pl-7 pr-3 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
            >
              <option value="all">All users</option>
              {uniqueUsers.map((u) => <option key={u} value={u}>@{u}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
          <Loader2 size={22} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
          <p className="text-sm">Loading activity logs…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
          <Activity size={32} className="opacity-15" />
          <div className="text-center">
            <p className="text-sm font-medium">
              {logs.length === 0 ? 'No activity recorded yet' : 'No logs match your filter'}
            </p>
            <p className="text-xs mt-1 opacity-70">
              {logs.length === 0
                ? 'Sign in or out to start generating activity events'
                : 'Try adjusting your search or filters'}
            </p>
          </div>
          {logs.length === 0 && (
            <Button size="sm" variant="outline" onClick={onRefresh} className="gap-2 mt-1">
              <RefreshCw size={12} /> Refresh
            </Button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border/40">
          {/* Brief per-user action summary */}
          <div className="px-5 py-3 bg-muted/10 border-b border-border/50">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-xs font-semibold text-foreground">User actions (brief)</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSummarySelectedOnly((v) => !v)}
                  className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                    summarySelectedOnly
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-background text-muted-foreground border-border'
                  }`}
                  title="Limit summary to selected user filter"
                >
                  {summarySelectedOnly ? 'Selected user only' : 'All users summary'}
                </button>
                <span className="text-[11px] text-muted-foreground">{userActionSummary.length} user(s)</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {userActionSummary.slice(0, 8).map((item) => (
                <div
                  key={item.username}
                  className="rounded-lg border border-border/70 bg-background px-3 py-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-foreground">@{item.username}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${ROLE_COLORS[item.user_role] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
                    >
                      {item.user_role}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{item.total} event(s)</span>
                  </div>
                  <p className="text-[11px] text-foreground/80 mt-1">{toBriefActionText(item.actions)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Latest: {getActionMeta(item.latestAction).label} · {timeAgo(item.lastAt)}
                  </p>
                </div>
              ))}
            </div>
            {userActionSummary.length > 8 && (
              <p className="text-[10px] text-muted-foreground mt-2">
                Showing top 8 users by activity. Use filters to narrow down further.
              </p>
            )}
          </div>

          {grouped.map(({ date, logs: dateLogs }) => (
            <div key={date}>
              {/* Date group header */}
              <div className="sticky top-0 z-10 px-5 py-2 bg-muted/30 backdrop-blur-sm border-b border-border/40">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border/60" />
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    {date}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">({dateLogs.length})</span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
              </div>

              {/* Log entries */}
              {dateLogs.map((log) => {
                const meta      = getActionMeta(log.action);
                const isExpanded = expanded === log.id;

                return (
                  <div
                    key={log.id}
                    className="hover:bg-muted/10 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : log.id)}
                      className="w-full px-5 py-3 flex items-start gap-3 text-left"
                    >
                      {/* Action icon bubble */}
                      <div
                        className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        {meta.icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* User avatar initial */}
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ background: ROLE_AVATAR_BG[log.user_role] ?? '#475569' }}
                          >
                            {log.username.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-bold text-foreground">@{log.username}</span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${ROLE_COLORS[log.user_role] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
                          >
                            {log.user_role}
                          </span>
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: meta.bg, color: meta.color }}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{getActivityBrief(log)}</p>
                      </div>

                      {/* Timestamp + expand chevron */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo(log.created_at)}</span>
                        {isExpanded
                          ? <ChevronUp  size={13} className="text-muted-foreground" />
                          : <ChevronDown size={13} className="text-muted-foreground" />}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-5 pb-4 pl-[60px]">
                        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
                            {[
                              { label: 'Summary',     value: getActivityBrief(log) },
                              { label: 'Timestamp',   value: formatDateTime(log.created_at) },
                              { label: 'Action',      value: log.action },
                              { label: 'Entity type', value: log.entity_type || '—' },
                              { label: 'Entity',      value: log.entity_label || log.entity_id || '—' },
                              ...(log.ip_address ? [{ label: 'IP address', value: log.ip_address }] : []),
                            ].map(({ label, value }) => (
                              <div key={label} className="flex gap-2">
                                <span className="text-muted-foreground w-24 shrink-0">{label}</span>
                                <span className="text-foreground/80 font-medium break-all">{value}</span>
                              </div>
                            ))}
                          </div>

                          {log.details && Object.keys(log.details).length > 0 && (
                            <div className="pt-2 border-t border-border">
                              <p className="text-[11px] font-semibold text-muted-foreground mb-1">Details</p>
                              <pre className="text-[10px] text-foreground/70 bg-background rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap border border-border/60">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Footer */}
          <div className="px-5 py-3 flex items-center justify-between text-xs text-muted-foreground bg-muted/10">
            <span>Showing {filtered.length} of {logs.length} total entries</span>
            {filtered.length > 0 && (
              <button
                onClick={() => exportToCsv(filtered)}
                className="flex items-center gap-1.5 text-primary font-semibold hover:underline"
              >
                <Download size={11} /> Export {filtered.length} rows
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── User Form Modal ──────────────────────────────────────────────────────────

const UserModal = ({
  open, user, currentAdminUsername, onClose, onSaved,
}: {
  open: boolean;
  user: PortalUser | null;
  currentAdminUsername: string;
  onClose: () => void;
  onSaved: (u: PortalUser) => void;
}) => {
  const isEdit = !!user;
  const [form, setForm] = useState({ username: '', name: '', password: '', role: 'editor' as PortalUser['role'], is_active: true });
  const [showPassword, setShowPassword] = useState(false);
  const [usernameChanged, setUsernameChanged] = useState(false);
  const [saving, setSaving] = useState(false);

  const [lastUser, setLastUser] = useState(user);
  if (user !== lastUser) {
    setLastUser(user);
    if (user) setForm({ username: user.username, name: user.name, password: '', role: user.role, is_active: user.is_active });
    else       setForm({ username: '', name: '', password: '', role: 'editor', is_active: true });
    setShowPassword(false);
    setUsernameChanged(false);
  }

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.username.trim()) { toast.error('Username is required.'); return; }
    if (!form.name.trim())     { toast.error('Name is required.'); return; }
    if (!isEdit && !form.password.trim()) { toast.error('Password is required.'); return; }
    if (form.password && form.password.length < 6) { toast.error('Password must be at least 6 characters.'); return; }

    setSaving(true);
    const newUsername = form.username.trim().toLowerCase().replace(/\s+/g, '_');

    try {
      const payload: Partial<PortalUser> = {
        username:  newUsername,
        name:      form.name.trim(),
        role:      form.role,
        is_active: form.is_active,
        ...(form.password.trim() ? { password: form.password } : {}),
      };

      if (isEdit) {
        const { data, error } = await supabaseAdmin
          .from('portal_users').update(payload).eq('id', user!.id).select().single();
        if (error) {
          if (error.code === '23505') throw new Error(`Username "${newUsername}" is already taken.`);
          throw error;
        }
        toast.success(`"${form.name.trim()}" updated.`);
        onSaved(data as PortalUser);
      } else {
        const { data, error } = await supabaseAdmin
          .from('portal_users').insert({ ...payload, password: form.password, created_by: currentAdminUsername }).select().single();
        if (error) {
          if (error.code === '23505') throw new Error(`Username "${newUsername}" is already taken.`);
          throw error;
        }
        toast.success(`User "${form.name.trim()}" created.`);
        onSaved(data as PortalUser);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-lg bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
              <Users size={14} className="text-[hsl(142_60%_32%)]" />
            </div>
            {isEdit ? `Edit — ${user?.name}` : 'Create New User'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Username *</Label>
              <Input
                value={form.username}
                onChange={(e) => {
                  set('username', e.target.value.toLowerCase().replace(/\s/g, '_'));
                  if (isEdit) setUsernameChanged(true);
                }}
                placeholder="e.g. editor_ali"
                autoFocus={!isEdit}
              />
              {isEdit && usernameChanged && form.username !== user?.username && (
                <p className="text-[10px] text-amber-600 font-medium">⚠ Login username will change to @{form.username || '…'}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Display Name *</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Abdullah Khan" autoFocus={isEdit} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{isEdit ? 'New Password' : 'Password *'}</Label>
            <div className="relative">
              <KeyRound size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder={isEdit ? 'Leave blank to keep current' : 'Minimum 6 characters'}
                className="pl-9 pr-9"
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold">Role *</Label>
            <div className="space-y-2">
              {ROLES.map((r) => (
                <button key={r.value} type="button" onClick={() => set('role', r.value as PortalUser['role'])}
                  className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                    form.role === r.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 hover:bg-muted/30'
                  }`}>
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${form.role === r.value ? 'border-primary bg-primary' : 'border-border'}`}>
                    {form.role === r.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{r.label}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${r.color}`}>{r.label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{r.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => set('is_active', !form.is_active)}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${form.is_active ? 'bg-emerald-500' : 'bg-border'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <div>
              <p className="text-sm font-medium">{form.is_active ? 'Active' : 'Inactive'}</p>
              <p className="text-[11px] text-muted-foreground">{form.is_active ? 'User can log in' : 'User cannot log in'}</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
            {saving ? <><Loader2 size={13} className="animate-spin mr-1" /> Saving…</> : isEdit ? 'Save Changes' : 'Create User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── User Card ────────────────────────────────────────────────────────────────

const UserCard = ({
  user, currentUsername, onEdit, onToggle, onDelete, onRoleChange, toggling, deleting, roleChanging,
}: {
  user: PortalUser;
  currentUsername: string;
  onEdit: (u: PortalUser) => void;
  onToggle: (u: PortalUser) => void;
  onDelete: (u: PortalUser) => void;
  onRoleChange: (u: PortalUser, role: PortalUser['role']) => void;
  toggling: string | null;
  deleting: string | null;
  roleChanging: string | null;
}) => {
  const isSelf = user.username === currentUsername;
  return (
    <div className={`rounded-xl border bg-white shadow-sm transition-all ${user.is_active ? 'border-border' : 'border-dashed border-border opacity-60'}`}>
      <div className="px-5 py-4 flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold text-white shrink-0"
          style={{ background: ROLE_AVATAR_BG[user.role] ?? '#475569' }}>
          {(user.name || user.username).charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">{user.name}</span>
            {isSelf && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">YOU</span>}
            {!user.is_active && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">Inactive</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">@{user.username}</p>
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground mr-0.5">Role:</span>
            {(['admin', 'editor'] as const).map((r) => (
              <button key={r}
                onClick={() => !isSelf && r !== user.role && onRoleChange(user, r)}
                disabled={isSelf || roleChanging === user.id}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                  user.role === r ? ROLE_COLORS[r] + ' shadow-sm' : 'border-border/60 text-muted-foreground/60 hover:border-border hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed'
                } ${r !== user.role && !isSelf ? 'cursor-pointer' : ''}`}>
                {roleChanging === user.id && r === user.role ? '…' : r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {user.last_login
              ? <span className="text-[11px] text-muted-foreground flex items-center gap-1"><LogIn size={10} /> {timeAgo(user.last_login)}</span>
              : <span className="text-[11px] text-muted-foreground">Never logged in</span>}
            {user.created_by && <span className="text-[11px] text-muted-foreground">by @{user.created_by}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onToggle(user)} disabled={toggling === user.id || isSelf}
            className="p-2 rounded-lg hover:bg-secondary/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {toggling === user.id ? <Loader2 size={14} className="animate-spin text-muted-foreground" />
              : user.is_active ? <UserCheck size={14} className="text-emerald-600" />
              : <UserX size={14} className="text-muted-foreground" />}
          </button>
          <button onClick={() => onEdit(user)} className="p-2 rounded-lg hover:bg-accent/10 transition-colors">
            <Pencil size={14} style={{ color: 'hsl(var(--accent))' }} />
          </button>
          <button onClick={() => onDelete(user)} disabled={deleting === user.id || isSelf}
            className="p-2 rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {deleting === user.id ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : <Trash2 size={14} className="text-destructive" />}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const UserManagement = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editUser,     setEditUser]     = useState<PortalUser | null>(null);
  const [search,       setSearch]       = useState('');
  const [filterRole,   setFilterRole]   = useState('all');
  const [toggling,     setToggling]     = useState<string | null>(null);
  const [deleting,     setDeleting]     = useState<string | null>(null);
  const [roleChanging, setRoleChanging] = useState<string | null>(null);

  // ── Users from external Supabase ──────────────────────────────────────────
  const { data: users = [], isFetching: usersFetching, refetch: refetchUsers } = useQuery({
    queryKey: ['portal-users'],
    queryFn: async () => {
      const { data, error } = await supabaseAdmin.from('portal_users').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as PortalUser[];
    },
  });

  // ── Activity logs from external Supabase ──────────────────────────────────
  const { data: logs = [], isFetching: logsFetching, refetch: refetchLogs } = useQuery({
    queryKey: ['activity-log-onspace'],
    queryFn: fetchActivityLogs,
    staleTime: 30_000,
  });

  const filteredUsers = useMemo(() => users.filter((u) => {
    const q = search.toLowerCase();
    return (!q || u.username.includes(q) || u.name.toLowerCase().includes(q))
      && (filterRole === 'all' || u.role === filterRole);
  }), [users, search, filterRole]);

  const stats = useMemo(() => ({
    total:  users.length,
    active: users.filter((u) => u.is_active).length,
    admins: users.filter((u) => u.role === 'admin').length,
    logins: logs.filter((l) => (l.action ?? '').toLowerCase() === 'login').length,
  }), [users, logs]);

  const openCreate = () => { setEditUser(null); setModalOpen(true); };
  const openEdit   = (u: PortalUser) => { setEditUser(u); setModalOpen(true); };

  const handleSaved = (saved: PortalUser) => {
    const action = editUser ? 'update' : 'create';
    const details: Record<string, unknown> = editUser
      ? {
          before: {
            username: editUser.username,
            name: editUser.name,
            role: editUser.role,
            is_active: editUser.is_active,
          },
          after: {
            username: saved.username,
            name: saved.name,
            role: saved.role,
            is_active: saved.is_active,
          },
        }
      : {
          username: saved.username,
          name: saved.name,
          role: saved.role,
          is_active: saved.is_active,
        };

    queryClient.setQueryData<PortalUser[]>(['portal-users'], (old = []) => {
      const exists = old.some((u) => u.id === saved.id);
      return exists ? old.map((u) => (u.id === saved.id ? saved : u)) : [saved, ...old];
    });
    void queryClient.invalidateQueries({ queryKey: ['portal-users'] });

    if (currentUser?.username) {
      void logActivity({
        username: currentUser.username,
        user_role: currentUser.role,
        action,
        entity_type: 'user',
        entity_id: saved.id,
        entity_label: `@${saved.username}`,
        details,
      });
    }

    setModalOpen(false);
    setEditUser(null);
    void refetchLogs();
  };

  const handleRoleChange = async (u: PortalUser, role: PortalUser['role']) => {
    if (u.username === currentUser?.username || u.role === role) return;
    setRoleChanging(u.id);
    const prev = u.role;
    queryClient.setQueryData<PortalUser[]>(['portal-users'], (old = []) =>
      old.map((x) => (x.id === u.id ? { ...x, role } : x)));
    try {
      const { data, error } = await supabaseAdmin.from('portal_users').update({ role }).eq('id', u.id).select().single();
      if (error) throw error;
      queryClient.setQueryData<PortalUser[]>(['portal-users'], (old = []) =>
        old.map((x) => (x.id === u.id ? data as PortalUser : x)));
      toast.success(`${u.name}'s role updated to ${role}.`);

      if (currentUser?.username) {
        void logActivity({
          username: currentUser.username,
          user_role: currentUser.role,
          action: 'update',
          entity_type: 'user',
          entity_id: u.id,
          entity_label: `@${u.username}`,
          details: {
            field: 'role',
            before: prev,
            after: role,
          },
        });
      }

      void refetchLogs();
    } catch {
      queryClient.setQueryData<PortalUser[]>(['portal-users'], (old = []) =>
        old.map((x) => (x.id === u.id ? { ...x, role: prev } : x)));
      toast.error('Failed to update role.');
    } finally {
      setRoleChanging(null);
    }
  };

  const handleToggle = async (u: PortalUser) => {
    if (u.username === currentUser?.username) return;
    setToggling(u.id);
    const newActive = !u.is_active;
    queryClient.setQueryData<PortalUser[]>(['portal-users'], (old = []) =>
      old.map((x) => (x.id === u.id ? { ...x, is_active: newActive } : x)));
    try {
      const { data, error } = await supabaseAdmin.from('portal_users').update({ is_active: newActive }).eq('id', u.id).select().single();
      if (error) throw error;
      queryClient.setQueryData<PortalUser[]>(['portal-users'], (old = []) =>
        old.map((x) => (x.id === u.id ? data as PortalUser : x)));
      toast.success(`${u.name} ${newActive ? 'activated' : 'deactivated'}.`);

      if (currentUser?.username) {
        void logActivity({
          username: currentUser.username,
          user_role: currentUser.role,
          action: 'toggle',
          entity_type: 'user',
          entity_id: u.id,
          entity_label: `@${u.username}`,
          details: {
            field: 'is_active',
            before: u.is_active,
            after: newActive,
          },
        });
      }

      void refetchLogs();
    } catch {
      queryClient.setQueryData<PortalUser[]>(['portal-users'], (old = []) =>
        old.map((x) => (x.id === u.id ? u : x)));
      toast.error('Failed to update user.');
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (u: PortalUser) => {
    if (u.username === currentUser?.username) return;
    if (!confirm(`Delete "${u.name}" (@${u.username})?\n\nThis cannot be undone.`)) return;
    setDeleting(u.id);
    queryClient.setQueryData<PortalUser[]>(['portal-users'], (old = []) => old.filter((x) => x.id !== u.id));
    try {
      const { error } = await supabaseAdmin.from('portal_users').delete().eq('id', u.id);
      if (error) throw error;
      toast.success(`User "${u.name}" deleted.`);

      if (currentUser?.username) {
        void logActivity({
          username: currentUser.username,
          user_role: currentUser.role,
          action: 'delete',
          entity_type: 'user',
          entity_id: u.id,
          entity_label: `@${u.username}`,
          details: {
            username: u.username,
            name: u.name,
            role: u.role,
            is_active: u.is_active,
          },
        });
      }

      void refetchLogs();
    } catch {
      queryClient.setQueryData<PortalUser[]>(['portal-users'], (old = []) => [u, ...old]);
      toast.error('Failed to delete user.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden pt-14 md:pt-0">
        {/* Banner */}
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <Users size={20} className="text-[hsl(142_60%_32%)]" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">User Management</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {stats.total} user{stats.total !== 1 ? 's' : ''} · {stats.active} active · {stats.admins} admin{stats.admins !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { refetchUsers(); refetchLogs(); }} disabled={usersFetching} className="gap-2">
                <RefreshCw size={14} className={usersFetching ? 'animate-spin' : ''} /> Refresh
              </Button>
              <Button size="sm" onClick={openCreate} className="gap-2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                <Plus size={14} /> Add User
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Users',   value: stats.total,  icon: <Users size={14} />,        accent: 'hsl(var(--primary))' },
              { label: 'Active',        value: stats.active, icon: <CheckCircle2 size={14} />, accent: '#10b981' },
              { label: 'Admins',        value: stats.admins, icon: <Shield size={14} />,       accent: '#7c3aed' },
              { label: 'Total Logins',  value: stats.logins, icon: <LogIn size={14} />,        accent: '#0ea5e9' },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-border bg-white px-4 py-3 flex items-center gap-3 shadow-sm">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${card.accent}18`, color: card.accent }}>{card.icon}</div>
                <div>
                  <p className="text-lg font-bold leading-none">{card.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{card.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Users */}
          <div>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users…" className="pl-9 h-9 text-sm" />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['all', 'admin', 'editor'] as const).map((r) => {
                  const count = r === 'all' ? users.length : users.filter((u) => u.role === r).length;
                  return (
                    <button key={r} onClick={() => setFilterRole(r)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        filterRole === r
                          ? r === 'all' ? 'border-transparent text-white' : `${ROLE_COLORS[r]} font-semibold`
                          : 'border-border bg-muted text-muted-foreground hover:bg-secondary'
                      }`}
                      style={filterRole === r && r === 'all' ? { background: 'hsl(var(--primary))' } : {}}>
                      {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground rounded-2xl border-2 border-dashed border-[hsl(140_20%_88%)] bg-white">
                <Users size={28} className="opacity-20" />
                <p className="text-sm">{users.length === 0 ? 'No users yet.' : 'No users match your filter.'}</p>
                {users.length === 0 && (
                  <Button size="sm" variant="outline" onClick={openCreate} className="gap-2"><Plus size={13} /> Add First User</Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filteredUsers.map((u) => (
                  <UserCard key={u.id} user={u} currentUsername={currentUser?.username ?? ''}
                    onEdit={openEdit} onToggle={handleToggle} onDelete={handleDelete}
                    onRoleChange={handleRoleChange} toggling={toggling} deleting={deleting} roleChanging={roleChanging} />
                ))}
              </div>
            )}
          </div>

          {/* Role Permissions Matrix */}
          <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-[hsl(var(--primary)/0.04)]">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Shield size={14} style={{ color: 'hsl(var(--primary))' }} /> Role Permissions
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Permission</th>
                    {ROLES.map((r) => (
                      <th key={r.value} className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full font-bold border ${r.color}`}>{r.label}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'View all content',           admin: true,  editor: true  },
                    { label: 'Edit adhkar & prayer times', admin: true,  editor: true  },
                    { label: 'Create announcements',       admin: true,  editor: true  },
                    { label: 'Send push notifications',    admin: true,  editor: true  },
                    { label: 'Manage sunnah reminders',    admin: true,  editor: true  },
                    { label: 'Import CSV data',            admin: true,  editor: true  },
                    { label: 'Access settings',            admin: true,  editor: false },
                    { label: 'Manage portal users',        admin: true,  editor: false },
                    { label: 'View activity logs',         admin: true,  editor: false },
                  ].map((perm, idx) => (
                    <tr key={perm.label} className={`border-b border-border/40 ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}>
                      <td className="px-5 py-2.5 font-medium text-foreground/80">{perm.label}</td>
                      {(['admin', 'editor'] as const).map((role) => (
                        <td key={role} className="px-4 py-2.5 text-center">
                          {perm[role]
                            ? <CheckCircle2 size={14} className="text-emerald-500 mx-auto" />
                            : <XCircle      size={14} className="text-red-200 mx-auto" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity Log */}
          <ActivityLogPanel logs={logs} loading={logsFetching} onRefresh={refetchLogs} />
        </div>
      </main>

      <UserModal
        open={modalOpen}
        user={editUser}
        currentAdminUsername={currentUser?.username ?? 'admin'}
        onClose={() => { setModalOpen(false); setEditUser(null); }}
        onSaved={handleSaved}
      />
    </div>
  );
};

export default UserManagement;

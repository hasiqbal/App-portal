import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  History, Filter, User, ChevronDown, RefreshCw,
  LogIn, LogOut, FileText, Bell, Trash2, Edit3,
  Plus, Upload, ToggleLeft, UserCog, Book, Clock
} from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import PageBanner from '@/components/layout/PageBanner';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { activityLogger, type ActivityLogEntry, type EntityType, type ActivityAction } from '@/services/activityLogService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTION_META: Record<ActivityAction, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  login:                      { label: 'Logged In',              color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   Icon: LogIn },
  logout:                     { label: 'Logged Out',             color: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200',   Icon: LogOut },
  adhkar_created:             { label: 'Dhikr Added',            color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     Icon: Plus },
  adhkar_updated:             { label: 'Dhikr Edited',           color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   Icon: Edit3 },
  adhkar_deleted:             { label: 'Dhikr Deleted',          color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       Icon: Trash2 },
  adhkar_group_created:       { label: 'Group Added',            color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     Icon: Plus },
  adhkar_group_updated:       { label: 'Group Edited',           color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   Icon: Edit3 },
  adhkar_group_deleted:       { label: 'Group Deleted',          color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       Icon: Trash2 },
  prayer_time_updated:        { label: 'Prayer Time Edited',     color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', Icon: Clock },
  prayer_times_csv_imported:  { label: 'CSV Imported',           color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', Icon: Upload },
  announcement_created:       { label: 'Announcement Added',     color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     Icon: Plus },
  announcement_updated:       { label: 'Announcement Edited',    color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   Icon: Edit3 },
  announcement_deleted:       { label: 'Announcement Deleted',   color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       Icon: Trash2 },
  sunnah_created:             { label: 'Sunnah Added',           color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200',     Icon: Plus },
  sunnah_updated:             { label: 'Sunnah Edited',          color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   Icon: Edit3 },
  sunnah_deleted:             { label: 'Sunnah Deleted',         color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       Icon: Trash2 },
  sunnah_group_created:       { label: 'Sunnah Group Added',     color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200',     Icon: Plus },
  sunnah_group_updated:       { label: 'Sunnah Group Edited',    color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   Icon: Edit3 },
  sunnah_group_deleted:       { label: 'Sunnah Group Deleted',   color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       Icon: Trash2 },
  push_notification_sent:     { label: 'Notification Sent',      color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', Icon: Bell },
  push_notification_scheduled:{ label: 'Notification Scheduled', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', Icon: Bell },
  push_notification_cancelled:{ label: 'Notification Cancelled', color: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200',   Icon: Bell },
  user_created:               { label: 'User Created',           color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   Icon: UserCog },
  user_updated:               { label: 'User Updated',           color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   Icon: UserCog },
  user_deleted:               { label: 'User Deleted',           color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       Icon: Trash2 },
  user_activated:             { label: 'User Activated',         color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   Icon: ToggleLeft },
  user_deactivated:           { label: 'User Deactivated',       color: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200',   Icon: ToggleLeft },
};

const ENTITY_LABELS: Record<EntityType, string> = {
  adhkar:            'Adhkar',
  adhkar_group:      'Adhkar Group',
  prayer_times:      'Prayer Times',
  announcement:      'Announcements',
  sunnah_reminder:   'Sunnah Reminders',
  sunnah_group:      'Sunnah Group',
  push_notification: 'Push Notifications',
  portal_user:       'User Management',
  auth:              'Authentication',
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Activity row ─────────────────────────────────────────────────────────────

const ActivityRow = ({ entry }: { entry: ActivityLogEntry }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = ACTION_META[entry.action] ?? {
    label: entry.action, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200', Icon: FileText,
  };
  const { Icon } = meta;
  const hasDetails = entry.details && Object.keys(entry.details).length > 0;

  const roleColor =
    entry.user_role === 'admin' ? 'text-purple-700 bg-purple-50 border-purple-200' :
    entry.user_role === 'editor' ? 'text-blue-700 bg-blue-50 border-blue-200' :
    'text-slate-600 bg-slate-50 border-slate-200';

  return (
    <div className={`bg-white rounded-xl border border-[hsl(140_20%_88%)] p-3 sm:p-4 transition-all ${expanded ? 'shadow-md' : 'shadow-sm'}`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${meta.bg}`}>
          <Icon size={14} className={meta.color} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color}`}>
                {meta.label}
              </span>
              {entry.entity_label && (
                <span className="text-xs font-medium text-[hsl(150_30%_18%)] truncate max-w-[200px]">
                  {entry.entity_label}
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0" title={formatDateTime(entry.created_at)}>
              {formatTime(entry.created_at)}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border ${roleColor}`}>
                {entry.username.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-[11px] text-muted-foreground">@{entry.username}</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${roleColor}`}>
              {entry.user_role}
            </span>
            <span className="text-[10px] text-muted-foreground/60">
              {ENTITY_LABELS[entry.entity_type] ?? entry.entity_type}
            </span>
          </div>
        </div>

        {/* Expand */}
        {hasDetails && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title="Show details"
          >
            <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Details expansion */}
      {expanded && hasDetails && (
        <div className="mt-3 ml-11 bg-muted/40 rounded-lg border border-border/60 p-2.5 overflow-x-auto">
          <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">
            {JSON.stringify(entry.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

// ─── Stats cards ──────────────────────────────────────────────────────────────

const LogStats = ({ entries }: { entries: ActivityLogEntry[] }) => {
  const today = new Date().toDateString();
  const todayCount = entries.filter((e) => new Date(e.created_at).toDateString() === today).length;
  const csvImports = entries.filter((e) => e.action === 'prayer_times_csv_imported').length;
  const notifications = entries.filter((e) => e.action === 'push_notification_sent').length;
  const contentChanges = entries.filter((e) =>
    ['adhkar_created','adhkar_updated','adhkar_deleted',
     'announcement_created','announcement_updated','announcement_deleted',
     'sunnah_created','sunnah_updated','sunnah_deleted'].includes(e.action)
  ).length;

  const stats = [
    { label: 'Total Events', value: entries.length,    color: 'text-[hsl(142_60%_28%)]', bg: 'bg-[hsl(142_50%_93%)]' },
    { label: 'Today',        value: todayCount,         color: 'text-blue-700',           bg: 'bg-blue-50' },
    { label: 'CSV Imports',  value: csvImports,         color: 'text-purple-700',         bg: 'bg-purple-50' },
    { label: 'Notifications',value: notifications,      color: 'text-violet-700',         bg: 'bg-violet-50' },
    { label: 'Content Edits',value: contentChanges,     color: 'text-amber-700',          bg: 'bg-amber-50' },
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

const ENTITY_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all',              label: 'All Activities' },
  { value: 'auth',             label: 'Authentication' },
  { value: 'prayer_times',     label: 'Prayer Times' },
  { value: 'adhkar',           label: 'Adhkar' },
  { value: 'announcement',     label: 'Announcements' },
  { value: 'sunnah_reminder',  label: 'Sunnah Reminders' },
  { value: 'push_notification','label': 'Push Notifications' },
  { value: 'portal_user',      label: 'User Management' },
];

const ActivityLog = () => {
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [userFilter, setUserFilter]     = useState<string>('all');

  const [tableReady, setTableReady] = useState<boolean | null>(null);

  const { data: entries = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['activity_log'],
    queryFn: async () => {
      const exists = await activityLogger.tableExists();
      setTableReady(exists);
      if (!exists) return [];
      return activityLogger.fetchRecent(200);
    },
    staleTime: 30_000,
  });

  // Derive unique usernames for filter dropdown
  const uniqueUsers = Array.from(new Set(entries.map((e) => e.username))).sort();

  const filtered = entries.filter((e) => {
    if (entityFilter !== 'all' && e.entity_type !== entityFilter) return false;
    if (userFilter !== 'all' && e.username !== userFilter) return false;
    return true;
  });

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />
      <main className="flex-1 md:pt-0 pt-14">
        <PageBanner
          icon={<History size={22} />}
          title="Activity Log"
          subtitle="Track all changes made to portal content, who made them, and when"
        />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-10 space-y-6">
          {/* Stats */}
          {entries.length > 0 && <LogStats entries={entries} />}

          {/* Filters + refresh */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
              <Filter size={12} />
              <span className="font-medium">Filter:</span>
            </div>

            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="h-8 text-xs w-[160px] border-[hsl(140_20%_88%)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {uniqueUsers.length > 1 && (
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="h-8 text-xs w-[140px] border-[hsl(140_20%_88%)]">
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All users</SelectItem>
                  {uniqueUsers.map((u) => (
                    <SelectItem key={u} value={u} className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <User size={10} /> @{u}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="ml-auto flex items-center gap-2">
              {filtered.length !== entries.length && (
                <span className="text-xs text-muted-foreground">
                  Showing {filtered.length} of {entries.length}
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 gap-1.5 text-xs border-[hsl(140_20%_88%)]"
              >
                <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Setup SQL banner — shown when table is missing */}
          {tableReady === false && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-amber-600 font-bold text-sm">⚠ Activity Log table not found on external Supabase</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                The <code className="bg-amber-100 px-1 rounded font-mono">activity_log</code> table needs to be created on your external Supabase database (<code className="bg-amber-100 px-1 rounded font-mono">lhaqqqatdztuijgdfdcf</code>). Run the SQL below in your Supabase Dashboard → SQL Editor:
              </p>
              <pre className="bg-white border border-amber-200 rounded-lg p-3 text-[10px] font-mono text-slate-700 overflow-x-auto whitespace-pre">{`-- Create activity_log table
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

-- Also insert editor/viewer users into portal_users
insert into portal_users (username, name, password, role, is_active, created_by)
values
  ('masjid_editor', 'Masjid Editor', 'editor123', 'editor', true, 'admin'),
  ('masjid_viewer', 'Masjid Viewer', 'viewer123', 'viewer', true, 'admin')
on conflict (username) do nothing;`}</pre>
              <Button size="sm" variant="outline" onClick={() => refetch()} className="border-amber-400 text-amber-700 hover:bg-amber-100">
                Check Again After Running SQL
              </Button>
            </div>
          )}

          {/* Log list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-[hsl(142_60%_35%)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <History size={40} className="mx-auto text-[hsl(142_30%_80%)]" />
              <p className="text-sm font-medium text-[hsl(150_30%_18%)]">
                {entries.length === 0 ? 'No activity recorded yet' : 'No entries match your filters'}
              </p>
              <p className="text-xs text-muted-foreground">
                {entries.length === 0
                  ? 'Actions like editing adhkar, importing prayer times, and sending push notifications will appear here.'
                  : 'Try clearing your filters.'}
              </p>
              {entries.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => { setEntityFilter('all'); setUserFilter('all'); }}>
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
              {filtered.length >= 200 && (
                <p className="text-xs text-center text-muted-foreground py-2">
                  Showing latest 200 entries. Use filters to narrow results.
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ActivityLog;

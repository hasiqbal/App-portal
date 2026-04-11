import { useState, useEffect } from 'react';
import { Database, RefreshCw, CheckCircle2, Table2, ExternalLink, Copy, Check } from 'lucide-react';
import { Button } from '#/components/ui/button';
import { Badge } from '#/components/ui/badge';
import Sidebar from '#/components/layout/Sidebar';
import { toast } from 'sonner';
import { supabase } from '#/lib/supabase';

const SUPABASE_URL = 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTkxMTksImV4cCI6MjA5MTE3NTExOX0.Z3MV96PflYqwoexwsoi7ma4yAO3og1juWWu9YWviLbU';
const REST_URL = `${SUPABASE_URL}/rest/v1`;

const TABLES: TableDef[] = [
  {
    name: 'adhkar',
    description: 'Islamic remembrances and supplications',
    columns: [
      { name: 'id', type: 'uuid', notes: 'Primary key' },
      { name: 'title', type: 'text', notes: 'English title' },
      { name: 'arabic_title', type: 'text', notes: 'Nullable — Arabic name' },
      { name: 'arabic', type: 'text', notes: 'Full Arabic text' },
      { name: 'transliteration', type: 'text', notes: 'Nullable' },
      { name: 'translation', type: 'text', notes: 'Nullable' },
      { name: 'reference', type: 'text', notes: 'Nullable' },
      { name: 'count', type: 'text', notes: 'Repetitions e.g. "3"' },
      { name: 'prayer_time', type: 'text', notes: 'Slug e.g. after-fajr' },
      { name: 'group_name', type: 'text', notes: 'Nullable' },
      { name: 'group_order', type: 'integer', notes: 'Nullable' },
      { name: 'display_order', type: 'integer', notes: 'Nullable' },
      { name: 'is_active', type: 'boolean', notes: 'Visible in app' },
      { name: 'description', type: 'text', notes: 'Nullable' },
      { name: 'file_url', type: 'text', notes: 'Nullable' },
      { name: 'created_at', type: 'timestamptz', notes: 'Auto-set' },
      { name: 'updated_at', type: 'timestamptz', notes: 'Auto-set' },
    ],
  },
  {
    name: 'prayer_times',
    description: 'Daily prayer times for the entire year',
    columns: [
      { name: 'id', type: 'uuid', notes: 'Primary key' },
      { name: 'month', type: 'integer', notes: '1–12' },
      { name: 'day', type: 'integer', notes: '1–31' },
      { name: 'date', type: 'text', notes: 'DD/MM/YYYY display string' },
      { name: 'fajr', type: 'time', notes: '' },
      { name: 'fajr_jamat', type: 'time', notes: 'Nullable' },
      { name: 'sunrise', type: 'time', notes: '' },
      { name: 'ishraq', type: 'time', notes: 'Nullable' },
      { name: 'zawaal', type: 'time', notes: 'Nullable' },
      { name: 'zuhr', type: 'time', notes: '' },
      { name: 'zuhr_jamat', type: 'time', notes: 'Nullable' },
      { name: 'asr', type: 'time', notes: '' },
      { name: 'asr_jamat', type: 'time', notes: 'Nullable' },
      { name: 'maghrib', type: 'time', notes: '' },
      { name: 'maghrib_jamat', type: 'time', notes: 'Nullable' },
      { name: 'isha', type: 'time', notes: '' },
      { name: 'isha_jamat', type: 'time', notes: 'Nullable' },
      { name: 'jumu_ah_1', type: 'time', notes: 'Nullable' },
      { name: 'jumu_ah_2', type: 'time', notes: 'Nullable' },
      { name: 'created_at', type: 'timestamptz', notes: 'Auto-set' },
      { name: 'updated_at', type: 'timestamptz', notes: 'Auto-set' },
    ],
  },
  {
    name: 'announcements',
    description: 'Masjid announcements displayed in the app',
    columns: [
      { name: 'id', type: 'uuid', notes: 'Primary key' },
      { name: 'title', type: 'text', notes: 'Announcement heading' },
      { name: 'body', type: 'text', notes: 'Nullable — HTML content' },
      { name: 'is_active', type: 'boolean', notes: 'Visible in app' },
      { name: 'display_order', type: 'integer', notes: 'Sort order' },
      { name: 'link_url', type: 'text', notes: 'Nullable' },
      { name: 'image_url', type: 'text', notes: 'Nullable' },
      { name: 'created_at', type: 'timestamptz', notes: 'Auto-set' },
      { name: 'updated_at', type: 'timestamptz', notes: 'Auto-set' },
    ],
  },
  {
    name: 'sunnah_reminders',
    description: 'Sunnah practices and reminders for the app',
    columns: [
      { name: 'id', type: 'uuid', notes: 'Primary key' },
      { name: 'title', type: 'text', notes: 'Short English title' },
      { name: 'arabic_title', type: 'text', notes: 'Nullable' },
      { name: 'arabic', type: 'text', notes: 'Nullable' },
      { name: 'transliteration', type: 'text', notes: 'Nullable' },
      { name: 'translation', type: 'text', notes: 'Nullable' },
      { name: 'description', type: 'text', notes: 'Nullable' },
      { name: 'reference', type: 'text', notes: 'Nullable' },
      { name: 'count', type: 'text', notes: 'Repetitions' },
      { name: 'category', type: 'text', notes: 'e.g. prayer, fasting' },
      { name: 'group_name', type: 'text', notes: 'Nullable' },
      { name: 'display_order', type: 'integer', notes: 'Sort order' },
      { name: 'is_active', type: 'boolean', notes: 'Visible in app' },
      { name: 'created_at', type: 'timestamptz', notes: 'Auto-set' },
      { name: 'updated_at', type: 'timestamptz', notes: 'Auto-set' },
    ],
  },
  {
    name: 'adhkar_groups',
    description: 'Group metadata for adhkar (icons, colors, badges)',
    columns: [
      { name: 'id', type: 'uuid', notes: 'Primary key' },
      { name: 'name', type: 'text', notes: 'Unique group name' },
      { name: 'prayer_time', type: 'text', notes: 'Nullable — slug' },
      { name: 'icon', type: 'text', notes: 'Emoji' },
      { name: 'icon_color', type: 'text', notes: 'Hex foreground' },
      { name: 'icon_bg_color', type: 'text', notes: 'Hex background' },
      { name: 'badge_text', type: 'text', notes: 'Nullable — pill label' },
      { name: 'badge_color', type: 'text', notes: 'Hex' },
      { name: 'description', type: 'text', notes: 'Nullable' },
      { name: 'display_order', type: 'integer', notes: 'Sort order' },
      { name: 'created_at', type: 'timestamptz', notes: 'Auto-set' },
    ],
  },
  {
    name: 'device_tokens',
    description: 'Expo push notification tokens from registered devices',
    columns: [
      { name: 'id', type: 'uuid', notes: 'Primary key' },
      { name: 'token', type: 'text', notes: 'Unique Expo push token' },
      { name: 'platform', type: 'text', notes: 'ios | android | unknown' },
      { name: 'app_version', type: 'text', notes: 'Nullable' },
      { name: 'device_model', type: 'text', notes: 'Nullable' },
      { name: 'is_active', type: 'boolean', notes: 'Active status' },
      { name: 'registered_at', type: 'timestamptz', notes: 'Auto-set' },
      { name: 'last_active', type: 'timestamptz', notes: 'Auto-set' },
    ],
  },
  {
    name: 'push_notifications',
    description: 'Push notification history and delivery stats',
    columns: [
      { name: 'id', type: 'uuid', notes: 'Primary key' },
      { name: 'title', type: 'text', notes: 'Notification title' },
      { name: 'body', type: 'text', notes: 'Notification message' },
      { name: 'image_url', type: 'text', notes: 'Nullable' },
      { name: 'link_url', type: 'text', notes: 'Nullable' },
      { name: 'audience', type: 'text', notes: 'all | active | new' },
      { name: 'status', type: 'text', notes: 'draft | sent | failed | scheduled' },
      { name: 'sent_at', type: 'timestamptz', notes: 'Nullable' },
      { name: 'recipient_count', type: 'integer', notes: 'Nullable' },
      { name: 'error_message', type: 'text', notes: 'Nullable' },
      { name: 'category', type: 'text', notes: 'prayer | event | general…' },
      { name: 'created_at', type: 'timestamptz', notes: 'Auto-set' },
    ],
  },
];

interface Column { name: string; type: string; notes: string; }
interface TableDef { name: string; description: string; columns: Column[]; }
interface TableStats { count: number | null; loading: boolean; error: boolean; }

const TYPE_COLORS: Record<string, string> = {
  uuid: 'bg-violet-100 text-violet-700',
  integer: 'bg-blue-100 text-blue-700',
  text: 'bg-emerald-100 text-emerald-700',
  time: 'bg-amber-100 text-amber-800',
  timestamptz: 'bg-gray-100 text-gray-600',
  boolean: 'bg-rose-100 text-rose-700',
};

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }} className="p-1 rounded hover:bg-white/20 transition-colors" title="Copy">
      {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
    </button>
  );
};

const CloudData = () => {
  const [stats, setStats] = useState<Record<string, TableStats>>({});
  const [expandedTable, setExpandedTable] = useState<string | null>('prayer_times');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStats = async () => {
    setIsRefreshing(true);
    await Promise.all(
      TABLES.map(async (t) => {
        setStats((prev) => ({ ...prev, [t.name]: { count: null, loading: true, error: false } }));
        try {
          const { count, error } = await supabase.from(t.name).select('*', { count: 'exact', head: true });
          if (error) throw error;
          setStats((prev) => ({ ...prev, [t.name]: { count: count ?? 0, loading: false, error: false } }));
        } catch {
          setStats((prev) => ({ ...prev, [t.name]: { count: null, loading: false, error: true } }));
        }
      })
    );
    setIsRefreshing(false);
    toast.success('Database stats refreshed');
  };

  useEffect(() => { loadStats(); }, []);

  const totalRows = Object.values(stats).reduce((sum, s) => sum + (s.count ?? 0), 0);

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden pt-14 md:pt-0">

        {/* Banner */}
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <Database size={20} className="text-[hsl(142_60%_32%)]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[hsl(150_30%_12%)]">Cloud Data</h1>
                <p className="text-xs text-muted-foreground mt-0.5">{TABLES.length} tables · {totalRows.toLocaleString()} total rows</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={loadStats} disabled={isRefreshing} className="gap-2">
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} /> Refresh Stats
            </Button>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-6 space-y-4">
          {/* Connection card */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: 'hsl(var(--primary))' }}>
            <div className="px-6 py-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Connected · Live</span>
                  </div>
                  <p className="text-[10px] font-semibold mb-2" style={{ color: 'hsl(var(--primary-foreground) / 0.6)' }}>Supabase Database</p>
                  <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                    <code className="text-xs font-mono text-white">{SUPABASE_URL}</code>
                    <CopyButton text={SUPABASE_URL} />
                  </div>
                </div>
                <a href={`${REST_URL}/`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors text-white whitespace-nowrap">
                  <ExternalLink size={12} /> API Docs
                </a>
              </div>
              <div className="mt-4">
                <p className="text-[10px] font-semibold mb-1.5" style={{ color: 'hsl(var(--primary-foreground) / 0.6)' }}>REST Base URL</p>
                <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                  <code className="text-xs font-mono text-white">{REST_URL}</code>
                  <CopyButton text={REST_URL} />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-[10px] font-semibold mb-1.5" style={{ color: 'hsl(var(--primary-foreground) / 0.6)' }}>Anon Key</p>
                <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                  <code className="text-xs font-mono text-white truncate max-w-xs">{SUPABASE_ANON_KEY.slice(0, 40)}…</code>
                  <CopyButton text={SUPABASE_ANON_KEY} />
                </div>
              </div>
            </div>
          </div>

          {/* Stats summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TABLES.slice(0, 4).map((t) => {
              const s = stats[t.name];
              return (
                <div key={t.name} className="bg-white rounded-xl border border-[hsl(140_20%_88%)] px-4 py-3">
                  <p className="text-2xl font-bold text-[hsl(150_30%_12%)] tabular-nums">
                    {s?.loading ? <span className="text-base text-muted-foreground animate-pulse">…</span> : s?.error ? <span className="text-sm text-destructive">Err</span> : (s?.count?.toLocaleString() ?? '—')}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{t.name}</p>
                </div>
              );
            })}
          </div>

          {/* Tables */}
          <div className="space-y-3">
            {TABLES.map((table) => {
              const s = stats[table.name];
              const isExpanded = expandedTable === table.name;
              return (
                <div key={table.name} className="rounded-2xl border border-[hsl(140_20%_88%)] bg-white shadow-sm overflow-hidden">
                  <button className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[hsl(142_50%_97%)] transition-colors" onClick={() => setExpandedTable(isExpanded ? null : table.name)}>
                    <div className="w-9 h-9 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                      <Table2 size={16} className="text-[hsl(142_60%_32%)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-bold font-mono text-[hsl(150_30%_12%)]">{table.name}</code>
                        <Badge variant="secondary" className="text-[10px] font-normal">{table.columns.length} columns</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{table.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {s?.loading ? <span className="text-xs text-muted-foreground animate-pulse">…</span> : s?.error ? <span className="text-xs text-destructive">Error</span> : <span className="text-xl font-bold tabular-nums text-[hsl(142_60%_32%)]">{s?.count?.toLocaleString() ?? '—'}</span>}
                      <p className="text-[10px] text-muted-foreground">rows</p>
                    </div>
                    <div className="text-muted-foreground ml-1 text-xs shrink-0">{isExpanded ? '▲' : '▼'}</div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[hsl(140_20%_88%)]">
                      <div className="px-5 py-3 border-b border-[hsl(140_20%_88%)] bg-[hsl(140_30%_97%)]">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">REST Endpoint</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-[hsl(150_30%_12%)]">{REST_URL}/{table.name}</code>
                          <button onClick={() => { navigator.clipboard.writeText(`${REST_URL}/${table.name}`); toast.success('Copied'); }} className="p-1 rounded hover:bg-[hsl(140_20%_88%)]"><Copy size={12} className="text-muted-foreground" /></button>
                        </div>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[hsl(140_20%_88%)] bg-[hsl(140_30%_97%)]">
                            <th className="px-5 py-2.5 text-left text-xs font-semibold text-muted-foreground">Column</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Type</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {table.columns.map((col, idx) => (
                            <tr key={col.name} className={`border-b border-[hsl(140_20%_88%)]/50 last:border-0 hover:bg-[hsl(142_50%_97%)] transition-colors ${idx % 2 === 0 ? '' : 'bg-[hsl(140_30%_97%)]/40'}`}>
                              <td className="px-5 py-2.5"><code className="text-xs font-mono font-semibold text-[hsl(150_30%_12%)]">{col.name}</code></td>
                              <td className="px-4 py-2.5"><span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${TYPE_COLORS[col.type] ?? 'bg-gray-100 text-gray-600'}`}>{col.type}</span></td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">{col.notes || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="px-5 py-3 border-t border-[hsl(140_20%_88%)] bg-[hsl(140_30%_97%)] flex items-center gap-3">
                        <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                        <p className="text-xs text-muted-foreground">RLS enabled · anon read/write policies active</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};

export default CloudData;

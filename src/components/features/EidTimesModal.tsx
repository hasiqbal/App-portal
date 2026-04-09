import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabaseAdmin } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Moon, Star, CheckCircle2, Trash2, AlertCircle, RefreshCw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EidType = 'eid_al_fitr' | 'eid_al_adha';

export interface EidPrayer {
  id?: string;
  eid_type: EidType;
  jamaat_number: number;
  time: string | null;
  is_active: boolean;
  notes?: string | null;
}

// ─── SQL setup (permanent, no year column) ────────────────────────────────────

export const EID_SQL_SETUP = `-- Run in your Supabase SQL Editor (lhaqqqatdztuijgdfdcf):
-- Drop old table if it exists with wrong schema
drop table if exists public.eid_prayers;

create table public.eid_prayers (
  id             uuid primary key default gen_random_uuid(),
  eid_type       text not null check (eid_type in ('eid_al_fitr', 'eid_al_adha')),
  jamaat_number  integer not null check (jamaat_number between 1 and 7),
  time           text,
  is_active      boolean not null default true,
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (eid_type, jamaat_number)
);

alter table public.eid_prayers enable row level security;

create policy "anon_select_eid_prayers"
  on public.eid_prayers for select to anon using (true);

create policy "auth_all_eid_prayers"
  on public.eid_prayers for all to authenticated using (true) with check (true);

create policy "service_all_eid_prayers"
  on public.eid_prayers for all to service_role using (true) with check (true);`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch all Eid prayers (permanent — no year filter).
 */
export async function fetchEidPrayers(): Promise<EidPrayer[]> {
  const { data, error } = await supabaseAdmin
    .from('eid_prayers')
    .select('*')
    .order('eid_type')
    .order('jamaat_number');

  if (error) {
    console.error('[eid_prayers] Fetch error:', error.message);
    return [];
  }
  return (data ?? []) as EidPrayer[];
}

/**
 * Save Eid jamaats for one Eid type (permanent, no year).
 * Clears empty entries, upserts filled ones.
 */
async function saveEidPrayers(
  eidType: EidType,
  times: string[],
): Promise<{ ok: boolean; saved: number; cleared: number; error?: string }> {
  let saved = 0;
  let cleared = 0;

  for (let i = 0; i < 7; i++) {
    const jamaat = i + 1;
    const rawTime = (times[i] ?? '').trim();

    if (!rawTime) {
      const { error } = await supabaseAdmin
        .from('eid_prayers')
        .delete()
        .eq('eid_type', eidType)
        .eq('jamaat_number', jamaat);
      if (!error) cleared++;
    } else {
      const { error } = await supabaseAdmin
        .from('eid_prayers')
        .upsert(
          {
            eid_type: eidType,
            jamaat_number: jamaat,
            time: rawTime,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'eid_type,jamaat_number' },
        );
      if (error) {
        return { ok: false, saved, cleared, error: error.message };
      }
      saved++;
    }
  }

  return { ok: true, saved, cleared };
}

// ─── Auto-create table attempt ────────────────────────────────────────────────

const EXT_URL         = 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const EXT_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU5OTExOSwiZXhwIjoyMDkxMTc1MTE5fQ.Dlt1Dkkh7WzUPLOVh1JgNU7h6u3m1PyttSlHuNxho4w';

async function tryAutoCreateTable(): Promise<{ ok: boolean; message: string }> {
  // Try Supabase SQL API endpoint (available in some Supabase versions)
  try {
    const endpoints = [
      `${EXT_URL}/rest/v1/rpc/exec_sql`,
      `${EXT_URL}/pg/query`,
      `${EXT_URL}/sql`,
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${EXT_SERVICE_KEY}`,
            'apikey': EXT_SERVICE_KEY,
          },
          body: JSON.stringify({ query: EID_SQL_SETUP }),
        });
        if (res.ok) return { ok: true, message: 'Table created automatically' };
      } catch { /* try next endpoint */ }
    }
    return { ok: false, message: 'Auto-create failed — please run SQL manually' };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

// ─── SQL Banner ───────────────────────────────────────────────────────────────

export const EidSqlBanner = ({ onDismiss, onRetry }: { onDismiss: () => void; onRetry?: () => void }) => {
  const [copied, setCopied] = useState(false);
  const [autoTrying, setAutoTrying] = useState(false);

  const handleAutoCreate = async () => {
    setAutoTrying(true);
    const result = await tryAutoCreateTable();
    setAutoTrying(false);
    if (result.ok) {
      toast.success('Table created! Try saving again.');
      onRetry?.();
    } else {
      toast.error('Auto-create failed. Please copy the SQL and run it manually in Supabase dashboard.');
    }
  };

  return (
    <div className="mx-2 sm:mx-0 mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-red-700">eid_prayers table missing</p>
          <p className="text-xs text-red-600 mt-1">
            Run this SQL once in your <strong>Supabase dashboard → SQL Editor</strong> (project: lhaqqqatdztuijgdfdcf):
          </p>
          <pre className="mt-2 p-3 bg-white border border-red-200 rounded-lg text-[10px] font-mono text-slate-700 overflow-x-auto max-h-40 whitespace-pre-wrap leading-relaxed">
            {EID_SQL_SETUP}
          </pre>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              onClick={() => { navigator.clipboard.writeText(EID_SQL_SETUP); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              {copied ? '✓ Copied!' : 'Copy SQL'}
            </button>
            <button
              onClick={handleAutoCreate}
              disabled={autoTrying}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-700 hover:bg-red-50 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              {autoTrying ? <><Loader2 size={10} className="animate-spin" /> Trying…</> : <><RefreshCw size={10} /> Auto-create</>}
            </button>
            <button onClick={onDismiss} className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Tab config ───────────────────────────────────────────────────────────────

const EID_TABS: { type: EidType; label: string; arabic: string; hijriDate: string; color: string; bg: string; border: string }[] = [
  {
    type:      'eid_al_fitr',
    label:     'Eid al-Fitr',
    arabic:    'عيد الفطر',
    hijriDate: '1 Shawwal',
    color:     '#15803d',
    bg:        'hsl(142 50% 96%)',
    border:    'hsl(142 50% 80%)',
  },
  {
    type:      'eid_al_adha',
    label:     'Eid al-Adha',
    arabic:    'عيد الأضحى',
    hijriDate: '10 Dhul Hijjah',
    color:     '#b45309',
    bg:        'hsl(38 80% 97%)',
    border:    'hsl(38 80% 78%)',
  },
];

// ─── Modal ────────────────────────────────────────────────────────────────────

interface EidTimesModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const EidTimesModal = ({ open, onClose, onSaved }: EidTimesModalProps) => {
  const [activeTab,    setActiveTab]    = useState<EidType>('eid_al_fitr');
  const [times,        setTimes]        = useState<Record<EidType, string[]>>({
    eid_al_fitr: Array(7).fill(''),
    eid_al_adha: Array(7).fill(''),
  });
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [tableError,   setTableError]   = useState(false);
  const [savedCounts,  setSavedCounts]  = useState<Record<EidType, number>>({ eid_al_fitr: 0, eid_al_adha: 0 });

  const loadTimes = async () => {
    setLoading(true);
    setSaved(false);
    setTableError(false);

    const { data, error } = await supabaseAdmin
      .from('eid_prayers')
      .select('*')
      .order('eid_type')
      .order('jamaat_number');

    if (error) {
      console.error('[eid_prayers] Load error:', error.message);
      if (
        error.message.includes('does not exist') ||
        error.message.includes('relation') ||
        error.message.includes('schema cache') ||
        error.message.includes('eid_prayers')
      ) {
        setTableError(true);
      }
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as EidPrayer[];
    const newTimes: Record<EidType, string[]> = {
      eid_al_fitr: Array(7).fill(''),
      eid_al_adha: Array(7).fill(''),
    };
    const counts: Record<EidType, number> = { eid_al_fitr: 0, eid_al_adha: 0 };

    for (const row of rows) {
      const idx = row.jamaat_number - 1;
      if (idx >= 0 && idx < 7) {
        newTimes[row.eid_type][idx] = row.time ?? '';
        if (row.time) counts[row.eid_type]++;
      }
    }

    setTimes(newTimes);
    setSavedCounts(counts);
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadTimes();
  }, [open]);

  const handleTimeChange = (eidType: EidType, idx: number, val: string) => {
    setTimes((prev) => {
      const next = { ...prev };
      next[eidType] = [...prev[eidType]];
      next[eidType][idx] = val;
      return next;
    });
    setSaved(false);
  };

  const clearAll = (eidType: EidType) => {
    setTimes((prev) => ({ ...prev, [eidType]: Array(7).fill('') }));
    setSaved(false);
  };

  const handleSave = async (eidType: EidType) => {
    setSaving(true);
    setSaved(false);
    const result = await saveEidPrayers(eidType, times[eidType]);
    setSaving(false);

    if (!result.ok) {
      if (
        result.error?.includes('does not exist') ||
        result.error?.includes('relation') ||
        result.error?.includes('schema cache') ||
        result.error?.includes('eid_prayers')
      ) {
        setTableError(true);
      }
      toast.error(`Save failed: ${result.error}`);
      return;
    }

    setSavedCounts((prev) => ({ ...prev, [eidType]: result.saved }));
    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
    onSaved?.();
    toast.success(
      `✓ ${EID_TABS.find(t => t.type === eidType)?.label} — ${result.saved} jamaat${result.saved !== 1 ? 's' : ''} saved permanently`
    );
  };

  const activeTabConfig = EID_TABS.find(t => t.type === activeTab)!;
  const filledCount = times[activeTab].filter(t => t.trim()).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg max-h-[92vh] overflow-y-auto mx-2 sm:mx-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: activeTabConfig.bg, border: `1.5px solid ${activeTabConfig.border}` }}
            >
              <Moon size={19} style={{ color: activeTabConfig.color }} />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-base font-bold text-[hsl(150_30%_12%)]">
                Eid Prayer Times
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanent times — set once, shown every year on Eid days
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Table error banner */}
        {tableError && (
          <EidSqlBanner
            onDismiss={() => setTableError(false)}
            onRetry={() => { setTableError(false); loadTimes(); }}
          />
        )}

        {/* Tabs */}
        <div className="flex rounded-xl border border-[hsl(140_20%_88%)] overflow-hidden bg-[hsl(140_20%_97%)] p-1 gap-1">
          {EID_TABS.map((tab) => {
            const count = savedCounts[tab.type];
            return (
              <button
                key={tab.type}
                onClick={() => setActiveTab(tab.type)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.type ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
                style={activeTab === tab.type ? { color: tab.color } : {}}
              >
                <Moon size={13} />
                <span>{tab.label}</span>
                {count > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: tab.color + '18', color: tab.color }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Eid info banner */}
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: activeTabConfig.bg, border: `1px solid ${activeTabConfig.border}` }}
        >
          <Star size={15} style={{ color: activeTabConfig.color }} />
          <div>
            <p className="text-xs font-bold" style={{ color: activeTabConfig.color }}>{activeTabConfig.label}</p>
            <p className="text-[11px]" style={{ color: activeTabConfig.color + 'aa' }}>
              Displayed on <strong>{activeTabConfig.hijriDate}</strong> every year · permanent setting
            </p>
          </div>
          <p className="ml-auto font-bold text-sm" style={{ color: activeTabConfig.color, fontFamily: 'serif' }} dir="rtl">
            {activeTabConfig.arabic}
          </p>
        </div>

        {/* Jamaat time inputs */}
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading saved times…</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Jamaat Times · {filledCount} set
              </p>
              {filledCount > 0 && (
                <button
                  onClick={() => clearAll(activeTab)}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 size={11} /> Clear all
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {Array.from({ length: 7 }, (_, i) => {
                const num = i + 1;
                const val = times[activeTab][i] ?? '';
                const isFilled = !!val.trim();

                return (
                  <div key={num} className="flex items-center gap-3">
                    {/* Number badge */}
                    <div className="w-20 shrink-0 flex items-center gap-2">
                      <span
                        className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: isFilled ? activeTabConfig.color + '18' : 'hsl(140 20% 94%)',
                          color: isFilled ? activeTabConfig.color : 'hsl(var(--muted-foreground))',
                        }}
                      >
                        {num}
                      </span>
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Jamaat {num}
                      </Label>
                    </div>

                    {/* Time input */}
                    <Input
                      value={val}
                      onChange={(e) => handleTimeChange(activeTab, i, e.target.value)}
                      placeholder={i === 0 ? 'e.g. 07:00' : 'optional'}
                      className={`font-mono text-sm h-9 flex-1 transition-all ${isFilled ? 'border-opacity-70' : ''}`}
                      style={isFilled ? { borderColor: activeTabConfig.border } : {}}
                    />

                    {/* Status */}
                    {isFilled ? (
                      <span className="text-[10px] font-semibold shrink-0" style={{ color: activeTabConfig.color }}>✓</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40 shrink-0">—</span>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] text-muted-foreground">
              Leave jamaats empty to hide them. Times in <strong>HH:MM</strong> 24-hour format.
              These are permanent — no year needed.
            </p>
          </div>
        )}

        {/* Save confirmation */}
        {saved && (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-700">Saved permanently</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {filledCount} jamaat{filledCount !== 1 ? 's' : ''} for {activeTabConfig.label} — shown every year on {activeTabConfig.hijriDate}.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="pt-1 gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose} className="border-[hsl(140_20%_88%)]">
            Close
          </Button>
          <Button
            onClick={() => handleSave(activeTab)}
            disabled={saving || loading || tableError}
            style={{ background: activeTabConfig.color, color: 'white' }}
          >
            {saving
              ? <><Loader2 size={13} className="animate-spin mr-1.5" />Saving…</>
              : <>Save {activeTabConfig.label}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EidTimesModal;
export type { EidTimesModalProps };

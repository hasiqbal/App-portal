import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import PrayerTimesTable from '@/components/features/PrayerTimesTable';
import EditPrayerTimeModal from '@/components/features/EditPrayerTimeModal';
import CsvImportModal from '@/components/features/CsvImportModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { fetchPrayerTimes, bulkUpdatePrayerTimes } from '@/lib/api';
import { PrayerTime, HijriCalendarEntry } from '@/types';
import { toast } from 'sonner';
import {
  Loader2, AlertCircle, RefreshCw,
  ChevronLeft, ChevronRight, Minus, Plus, CalendarCheck, Upload, Search, CalendarDays, Moon, Download, Database, CheckCircle2, XCircle, Zap,
} from 'lucide-react';
import { isBST } from '@/lib/dateUtils';
import { supabaseAdmin } from '@/lib/supabase';
import { SolarTimesCard } from '@/pages/Dashboard';

// ─── External Supabase config (same as supabase.ts) ───────────────────────────
const EXT_URL         = 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const EXT_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU5OTExOSwiZXhwIjoyMDkxMTc1MTE5fQ.Dlt1Dkkh7WzUPLOVh1JgNU7h6u3m1PyttSlHuNxho4w';

/**
 * Run raw SQL on the external Supabase via the pg REST SQL endpoint.
 * Requires service role key. Used only for schema migrations.
 */
async function runExternalSql(sql: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${EXT_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EXT_SERVICE_KEY}`,
        'apikey': EXT_SERVICE_KEY,
        'Prefer': 'resolution=ignore-duplicates',
      },
      body: JSON.stringify({ query: sql }),
    });
    // Try the SQL API endpoint
    const res2 = await fetch(`${EXT_URL}/pg/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EXT_SERVICE_KEY}`,
        'apikey': EXT_SERVICE_KEY,
      },
      body: JSON.stringify({ query: sql }),
    });
    if (res2.ok) return { ok: true };
    const text = await res2.text().catch(() => '');
    return { ok: false, error: text };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── Schema migration: ensure hijri_calendar has all required columns ─────────

let schemaMigrated = false; // run once per session

async function ensureHijriCalendarSchema(): Promise<{ ok: boolean; message: string }> {
  if (schemaMigrated) return { ok: true, message: 'Already checked' };

  // Step 1: probe the table — try a SELECT to see what columns exist
  const { data: probe, error: probeErr } = await supabaseAdmin
    .from('hijri_calendar')
    .select('*')
    .limit(1);

  console.log('[hijri_calendar] Schema probe:', { probe, probeErr });

  if (probeErr) {
    const msg = probeErr.message ?? '';
    // Table doesn't exist at all — we can't create it via supabaseAdmin (no DDL)
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return {
        ok: false,
        message: 'Table hijri_calendar does not exist. Run the SQL setup in your Supabase dashboard.',
      };
    }
    // Column missing — need ALTER TABLE
    if (msg.includes('column') || msg.includes('schema cache')) {
      console.warn('[hijri_calendar] Column missing, attempting to probe columns via empty insert...');
    }
  }

  // Step 2: detect which columns are present by attempting a minimal INSERT and observing errors
  const testEntry = {
    gregorian_year: 1900,
    gregorian_month: 1,
    gregorian_day: 1,
    gregorian_date: '01/01/1900',
    hijri_date: '__schema_test__',
  };

  const { error: insertErr } = await supabaseAdmin
    .from('hijri_calendar')
    .upsert(testEntry, { onConflict: 'gregorian_year,gregorian_month,gregorian_day' })
    .select();

  if (!insertErr) {
    // Clean up the test row
    await supabaseAdmin
      .from('hijri_calendar')
      .delete()
      .eq('gregorian_year', 1900)
      .eq('gregorian_month', 1)
      .eq('gregorian_day', 1);
    schemaMigrated = true;
    console.log('[hijri_calendar] ✓ Schema OK — all columns present');
    return { ok: true, message: 'Schema OK' };
  }

  const errMsg = insertErr.message ?? '';
  console.error('[hijri_calendar] Insert test failed:', errMsg);

  // Identify missing columns from the error message
  const missingCols: string[] = [];
  if (errMsg.includes('gregorian_year'))  missingCols.push('gregorian_year');
  if (errMsg.includes('gregorian_month')) missingCols.push('gregorian_month');
  if (errMsg.includes('gregorian_day'))   missingCols.push('gregorian_day');
  if (errMsg.includes('gregorian_date'))  missingCols.push('gregorian_date');
  if (errMsg.includes('hijri_date'))      missingCols.push('hijri_date');

  return {
    ok: false,
    message: missingCols.length > 0
      ? `Missing columns: ${missingCols.join(', ')}. Run the SQL fix in your Supabase dashboard.`
      : `Schema error: ${errMsg}`,
  };
}

// ─── Aladhan API — accurate Hijri dates, API only ─────────────────────────────

async function fetchHijriFromApi(
  year: number,
  month: number,
  day: number,
  offset = 0,
): Promise<{ hijri: string; gregorian: string }> {
  const shifted = new Date(year, month - 1, day + offset);
  const gDay    = String(shifted.getDate()).padStart(2, '0');
  const gMonth  = String(shifted.getMonth() + 1).padStart(2, '0');
  const gYear   = shifted.getFullYear();
  const dateStr = `${gDay}-${gMonth}-${gYear}`;

  const res = await fetch(`https://api.aladhan.com/v1/gToH/${dateStr}`);
  if (!res.ok) throw new Error(`Aladhan API ${res.status}: ${res.statusText}`);

  const json = await res.json();
  const h = json?.data?.hijri;
  if (!h) throw new Error('Aladhan API: unexpected response structure');

  return {
    hijri:     `${parseInt(h.day, 10)} ${h.month.en} ${h.year} AH`,
    gregorian: `${gYear}-${gMonth}-${gDay}`,
  };
}

// ─── Hijri Calendar DB helpers ────────────────────────────────────────────────

async function fetchHijriCalendarMonth(
  year: number,
  month: number,
): Promise<Map<number, HijriCalendarEntry>> {
  const { data, error } = await supabaseAdmin
    .from('hijri_calendar')
    .select('*')
    .eq('gregorian_year', year)
    .eq('gregorian_month', month);

  if (error) {
    console.error('[hijri_calendar] Fetch error:', error.message);
    return new Map();
  }

  const map = new Map<number, HijriCalendarEntry>();
  for (const row of (data ?? [])) {
    map.set(row.gregorian_day as number, row as HijriCalendarEntry);
  }
  console.log(`[hijri_calendar] Loaded ${map.size} entries for ${year}-${month}`);
  return map;
}

async function upsertHijriCalendarEntries(
  entries: Omit<HijriCalendarEntry, 'id' | 'created_at' | 'updated_at'>[],
): Promise<{ saved: number; errors: string[] }> {
  const errors: string[] = [];
  let saved = 0;

  for (const entry of entries) {
    const payload = {
      gregorian_year:  entry.gregorian_year,
      gregorian_month: entry.gregorian_month,
      gregorian_day:   entry.gregorian_day,
      gregorian_date:  entry.gregorian_date,
      hijri_date:      entry.hijri_date,
      updated_at:      new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('hijri_calendar')
      .upsert(payload, { onConflict: 'gregorian_year,gregorian_month,gregorian_day' });

    if (error) {
      errors.push(`Day ${entry.gregorian_day}: ${error.message}`);
      console.error(`[hijri_calendar ✗] Day ${entry.gregorian_day}:`, error.message);
    } else {
      saved++;
      console.log(`[hijri_calendar ✓] Day ${entry.gregorian_day}: ${entry.gregorian_date} → ${entry.hijri_date}`);
    }
  }

  return { saved, errors };
}

// ─── Hijri offset DB helpers ──────────────────────────────────────────────────

async function saveOffsetToDb(n: number): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabaseAdmin
      .from('masjid_settings')
      .upsert(
        { key: 'hijri_offset', value: String(n), label: 'Hijri Date Offset', category: 'preferences', updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
    if (error) { console.error('[HijriOffset] DB save failed:', error.message); return { ok: false }; }
    console.log('[HijriOffset] Saved to DB:', n);
    return { ok: true };
  } catch (e) {
    console.error('[HijriOffset] DB save error:', e);
    return { ok: false };
  }
}

async function loadOffsetFromDb(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin
      .from('masjid_settings')
      .select('value')
      .eq('key', 'hijri_offset')
      .maybeSingle();
    if (!error && data?.value != null) {
      const n = parseInt(data.value, 10);
      if (!isNaN(n)) return n;
    }
  } catch { /* ignore */ }
  return 0;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CURRENT_YEAR  = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const YEAR_RANGE: number[] = [];
for (let y = CURRENT_YEAR - 5; y <= CURRENT_YEAR + 10; y++) YEAR_RANGE.push(y);

function monthIsBST(year: number, month: number): boolean { return isBST(year, month, 15); }
function fridayCount(year: number, month: number): number {
  const lastDay = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) if (new Date(year, month - 1, d).getDay() === 5) count++;
  return count;
}

// ─── SQL setup banner ─────────────────────────────────────────────────────────

const SQL_SETUP = `-- Run this in your Supabase SQL Editor (lhaqqqatdztuijgdfdcf):
-- Step 1: Create table if it doesn't exist
create table if not exists public.hijri_calendar (
  id uuid primary key default gen_random_uuid(),
  gregorian_year  integer not null,
  gregorian_month integer not null,
  gregorian_day   integer not null,
  gregorian_date  text,
  hijri_date      text not null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (gregorian_year, gregorian_month, gregorian_day)
);

-- Step 2: Add missing columns if table already exists with different schema
alter table public.hijri_calendar add column if not exists gregorian_year  integer;
alter table public.hijri_calendar add column if not exists gregorian_month integer;
alter table public.hijri_calendar add column if not exists gregorian_day   integer;
alter table public.hijri_calendar add column if not exists gregorian_date  text;
alter table public.hijri_calendar add column if not exists hijri_date      text;
alter table public.hijri_calendar add column if not exists updated_at      timestamptz default now();

-- Step 3: Add unique constraint (ignore error if already exists)
alter table public.hijri_calendar
  add constraint if not exists hijri_calendar_unique_day
  unique (gregorian_year, gregorian_month, gregorian_day);

-- Step 4: Enable RLS
alter table public.hijri_calendar enable row level security;

create policy if not exists "anon_select_hijri_calendar"
  on public.hijri_calendar for select to anon using (true);

create policy if not exists "auth_all_hijri_calendar"
  on public.hijri_calendar for all to authenticated using (true) with check (true);

create policy if not exists "service_all_hijri_calendar"
  on public.hijri_calendar for all to service_role using (true) with check (true);`;

const DbSetupBanner = ({ onDismiss }: { onDismiss: () => void }) => {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(SQL_SETUP).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mx-2 sm:mx-0 mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <Database size={16} className="text-red-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-red-700">hijri_calendar table needs setup</p>
          <p className="text-xs text-red-600 mt-1">
            The table is missing required columns. Copy and run this SQL in your{' '}
            <strong>Supabase dashboard → SQL Editor</strong> (project: lhaqqqatdztuijgdfdcf):
          </p>
          <pre className="mt-2 p-3 bg-white border border-red-200 rounded-lg text-[10px] font-mono text-slate-700 overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed">
            {SQL_SETUP}
          </pre>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={copy}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              {copied ? '✓ Copied!' : 'Copy SQL'}
            </button>
            <button
              onClick={onDismiss}
              className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
            >
              Dismiss (after running SQL)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Jumu'ah year modal ───────────────────────────────────────────────────────

interface JumuahYearModalProps {
  open: boolean; onClose: () => void; year: number;
  queryClient: ReturnType<typeof useQueryClient>;
}

const JumuahYearModal = ({ open, onClose, year, queryClient }: JumuahYearModalProps) => {
  const [gmt1, setGmt1] = useState(''); const [gmt2, setGmt2] = useState('');
  const [bst1, setBst1] = useState(''); const [bst2, setBst2] = useState('');
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(() => new Set([1,2,3,4,5,6,7,8,9,10,11,12]));
  const [saving, setSaving] = useState(false); const [progress, setProgress] = useState('');

  const toggleMonth = (m: number) => setSelectedMonths((prev) => { const next = new Set(prev); if (next.has(m)) next.delete(m); else next.add(m); return next; });
  const toggleAll = () => selectedMonths.size === 12 ? setSelectedMonths(new Set()) : setSelectedMonths(new Set([1,2,3,4,5,6,7,8,9,10,11,12]));

  const handleApply = async () => {
    if (selectedMonths.size === 0) { toast.error('Select at least one month.'); return; }
    const gmtPayload = { jumu_ah_1: gmt1.trim() || null, jumu_ah_2: gmt2.trim() || null };
    const bstPayload = { jumu_ah_1: bst1.trim() || null, jumu_ah_2: bst2.trim() || null };
    if (!gmt1.trim() && !gmt2.trim() && !bst1.trim() && !bst2.trim()) { toast.error("Enter at least one Jumu'ah time."); return; }
    setSaving(true);
    let totalFridays = 0; const failedMonths: number[] = [];
    for (const month of Array.from(selectedMonths).sort((a, b) => a - b)) {
      const bst = monthIsBST(year, month);
      const payload = bst ? bstPayload : gmtPayload;
      if (!payload.jumu_ah_1 && !payload.jumu_ah_2) continue;
      setProgress(`Updating ${MONTHS_SHORT[month - 1]}…`);
      try {
        let rows = queryClient.getQueryData<PrayerTime[]>(['prayer_times', month]);
        if (!rows) { rows = await fetchPrayerTimes(month); queryClient.setQueryData(['prayer_times', month], rows); }
        const fridays = rows.filter((r) => new Date(year, month - 1, r.day).getDay() === 5);
        if (fridays.length === 0) continue;
        const updated = await bulkUpdatePrayerTimes(fridays.map((r) => r.id), payload);
        totalFridays += fridays.length;
        queryClient.setQueryData<PrayerTime[]>(['prayer_times', month], (old) => {
          if (!old) return old;
          const map = new Map(updated.map((r) => [r.id, r]));
          return old.map((r) => map.get(r.id) ?? r);
        });
      } catch { failedMonths.push(month); }
    }
    setSaving(false); setProgress('');
    if (failedMonths.length > 0) toast.error(`Failed for: ${failedMonths.map((m) => MONTHS_SHORT[m - 1]).join(', ')}`);
    else { toast.success(`Jumu'ah times set for ${totalFridays} Fridays across ${selectedMonths.size} months in ${year}.`); onClose(); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <CalendarCheck size={16} className="text-[hsl(142_60%_35%)]" />
            Set Jumu'ah Times — {year}
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">Set separate times for GMT (winter) and BST (summer) months.</p>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 uppercase">GMT</span>
              <span className="text-xs text-slate-500">Nov – Mar</span>
            </div>
            <div className="space-y-2">
              <div><Label className="text-xs text-slate-600">Jumu'ah 1</Label><Input value={gmt1} onChange={(e) => setGmt1(e.target.value)} placeholder="12:45" className="font-mono text-sm h-8 mt-1 bg-white" /></div>
              <div><Label className="text-xs text-slate-600">Jumu'ah 2</Label><Input value={gmt2} onChange={(e) => setGmt2(e.target.value)} placeholder="13:30" className="font-mono text-sm h-8 mt-1 bg-white" /></div>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-200 text-emerald-800 uppercase">BST</span>
              <span className="text-xs text-emerald-600">Apr – Oct</span>
            </div>
            <div className="space-y-2">
              <div><Label className="text-xs text-emerald-700">Jumu'ah 1</Label><Input value={bst1} onChange={(e) => setBst1(e.target.value)} placeholder="13:30" className="font-mono text-sm h-8 mt-1 bg-white" /></div>
              <div><Label className="text-xs text-emerald-700">Jumu'ah 2</Label><Input value={bst2} onChange={(e) => setBst2(e.target.value)} placeholder="14:30" className="font-mono text-sm h-8 mt-1 bg-white" /></div>
            </div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Apply to months</span>
            <button onClick={toggleAll} className="text-xs text-[hsl(142_60%_35%)] hover:underline font-medium">{selectedMonths.size === 12 ? 'Deselect all' : 'Select all'}</button>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {MONTHS_SHORT.map((abbr, i) => {
              const month = i + 1; const bst = monthIsBST(year, month); const isMixed = month === 3 || month === 10;
              const selected = selectedMonths.has(month); const fridays = fridayCount(year, month);
              return (
                <button key={month} onClick={() => toggleMonth(month)} title={`${MONTHS_FULL[i]} — ${fridays}F`}
                  className={`relative flex flex-col items-center py-2 px-1 rounded-lg border text-xs font-medium transition-all ${selected ? bst ? 'border-emerald-400 bg-emerald-100 text-emerald-800' : 'border-slate-400 bg-slate-200 text-slate-800' : 'border-border bg-card text-muted-foreground opacity-50'}`}>
                  {isMixed && <span className="absolute -top-1 -right-1 text-[9px]">⚡</span>}
                  <span className="font-semibold">{abbr}</span>
                  <span className="text-[9px] mt-0.5">{fridays}F</span>
                  <span className={`text-[8px] font-bold mt-0.5 ${bst ? 'text-emerald-600' : 'text-slate-500'}`}>{isMixed ? '⚡' : bst ? 'BST' : 'GMT'}</span>
                </button>
              );
            })}
          </div>
        </div>
        {saving && progress && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={13} className="animate-spin" />{progress}</div>}
        <DialogFooter className="gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleApply} disabled={saving || selectedMonths.size === 0} className="gap-2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
            {saving ? <><Loader2 size={13} className="animate-spin" /> Applying…</> : <>Apply to {selectedMonths.size} Month{selectedMonths.size !== 1 ? 's' : ''}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Prayer Times page ────────────────────────────────────────────────────────

const PrayerTimes = () => {
  const [selectedYear,    setSelectedYear]    = useState(CURRENT_YEAR);
  const [selectedMonth,   setSelectedMonth]   = useState(CURRENT_MONTH);
  const [editingRow,      setEditingRow]      = useState<PrayerTime | null>(null);
  const [jumuahModal,     setJumuahModal]     = useState(false);
  const [csvModal,        setCsvModal]        = useState(false);
  const [csvPreload,      setCsvPreload]      = useState<string | undefined>(undefined);
  const [hijriOffset,     setHijriOffset]     = useState<number>(0);
  const [populatingHijri,    setPopulatingHijri]    = useState(false);
  const [populatingAllMonths,   setPopulatingAllMonths]   = useState(false);
  const [populatingMissing,     setPopulatingMissing]     = useState(false);
  const [allMonthsProgress,     setAllMonthsProgress]     = useState('');
  const [exportingCsv,          setExportingCsv]          = useState(false);
  // Hijri offset save status: 'idle' | 'saving' | 'saved' | 'error'
  const [offsetStatus,          setOffsetStatus]          = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const offsetDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offsetStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [jumpInput,       setJumpInput]       = useState('');
  const [highlightDay,    setHighlightDay]    = useState<number | null>(null);
  const [searchParams,    setSearchParams]    = useSearchParams();
  const [schemaError,     setSchemaError]     = useState<string | null>(null);
  const [schemaChecked,   setSchemaChecked]   = useState(false);

  // Hijri calendar data: day → entry
  const [hijriCalendar, setHijriCalendar] = useState<Map<number, HijriCalendarEntry>>(new Map());
  const [hijriLoading,  setHijriLoading]  = useState(false);

  const queryClient = useQueryClient();

  // Handle CSV import from URL param
  useEffect(() => {
    if (searchParams.get('import') === '1') {
      const stored = sessionStorage.getItem('csv_import_payload');
      if (stored) { setCsvPreload(stored); sessionStorage.removeItem('csv_import_payload'); setCsvModal(true); }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Load Hijri offset from DB on mount
  useEffect(() => {
    loadOffsetFromDb().then((n) => setHijriOffset(n));
  }, []);

  // Check schema once on mount
  useEffect(() => {
    ensureHijriCalendarSchema().then((result) => {
      console.log('[Schema check]', result);
      if (!result.ok) {
        setSchemaError(result.message);
      }
      setSchemaChecked(true);
    });
  }, []);

  // Load Hijri calendar whenever year/month changes (only if schema is OK)
  useEffect(() => {
    if (!schemaChecked) return;
    if (schemaError) return;
    setHijriLoading(true);
    fetchHijriCalendarMonth(selectedYear, selectedMonth).then((map) => {
      setHijriCalendar(map);
      setHijriLoading(false);
    });
  }, [selectedYear, selectedMonth, schemaChecked, schemaError]);

  const changeOffset = (delta: number) => {
    setHijriOffset((prev) => {
      const next = Math.max(-30, Math.min(30, prev + delta));
      // Debounce DB save — wait 800ms after last click before saving
      if (offsetDebounceRef.current) clearTimeout(offsetDebounceRef.current);
      if (offsetStatusTimerRef.current) clearTimeout(offsetStatusTimerRef.current);
      setOffsetStatus('saving');
      offsetDebounceRef.current = setTimeout(async () => {
        const { ok } = await saveOffsetToDb(next);
        setOffsetStatus(ok ? 'saved' : 'error');
        // Auto-clear after 3 seconds
        offsetStatusTimerRef.current = setTimeout(() => setOffsetStatus('idle'), 3000);
      }, 800);
      return next;
    });
  };

  const handleResetOffset = () => {
    if (offsetDebounceRef.current) clearTimeout(offsetDebounceRef.current);
    if (offsetStatusTimerRef.current) clearTimeout(offsetStatusTimerRef.current);
    setHijriOffset(0);
    setOffsetStatus('saving');
    saveOffsetToDb(0).then(({ ok }) => {
      setOffsetStatus(ok ? 'saved' : 'error');
      offsetStatusTimerRef.current = setTimeout(() => setOffsetStatus('idle'), 3000);
    });
  };

  // ── Export Hijri CSV for selected year ─────────────────────────────────────
  const handleExportHijriCsv = async () => {
    setExportingCsv(true);
    try {
      const { data, error } = await supabaseAdmin
        .from('hijri_calendar')
        .select('gregorian_year, gregorian_month, gregorian_day, gregorian_date, hijri_date')
        .eq('gregorian_year', selectedYear)
        .order('gregorian_month', { ascending: true })
        .order('gregorian_day',   { ascending: true });

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        toast.error(`No Hijri calendar data found for ${selectedYear}. Use "Fill Month" or "Fill All ${selectedYear}" first.`);
        return;
      }

      const header = ['gregorian_day', 'gregorian_month', 'gregorian_year', 'gregorian_date', 'hijri_date'];
      const csvRows = [
        header,
        ...data.map((r) => [
          String(r.gregorian_day),
          String(r.gregorian_month),
          String(r.gregorian_year),
          r.gregorian_date ?? `${String(r.gregorian_day).padStart(2,'0')}/${String(r.gregorian_month).padStart(2,'0')}/${r.gregorian_year}`,
          r.hijri_date ?? '',
        ]),
      ];

      const csv = csvRows
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `hijri-calendar-${selectedYear}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${data.length} Hijri entries for ${selectedYear}`);
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExportingCsv(false);
    }
  };

  // ── Fill Missing Only: Aladhan API → skips days already in hijri_calendar ─
  const handleFillMissingOnly = async () => {
    if (schemaError) { toast.error('Fix the DB schema first (see the red banner above).'); return; }
    setPopulatingMissing(true);
    const toastId = 'fill-missing-hijri';

    // Step 1: Fetch all existing entries for the year from DB
    toast.loading(`Checking existing entries for ${selectedYear}…`, { id: toastId });
    const { data: existing, error: existErr } = await supabaseAdmin
      .from('hijri_calendar')
      .select('gregorian_month, gregorian_day')
      .eq('gregorian_year', selectedYear);

    if (existErr) {
      toast.error(`DB check failed: ${existErr.message}`, { id: toastId });
      setPopulatingMissing(false);
      return;
    }

    // Build a Set of keys already in DB: "month-day"
    const existingSet = new Set<string>((existing ?? []).map((r) => `${r.gregorian_month}-${r.gregorian_day}`));
    console.log(`[Fill Missing] ${existingSet.size} days already in DB for ${selectedYear}`);

    // Step 2: Build the list of missing days
    const missingDays: { month: number; day: number }[] = [];
    for (let month = 1; month <= 12; month++) {
      const lastDay = new Date(selectedYear, month, 0).getDate();
      for (let day = 1; day <= lastDay; day++) {
        if (!existingSet.has(`${month}-${day}`)) {
          missingDays.push({ month, day });
        }
      }
    }

    if (missingDays.length === 0) {
      toast.success(
        `✓ All days for ${selectedYear} already exist in hijri_calendar — nothing to fill!`,
        { id: toastId, duration: 5000 },
      );
      setPopulatingMissing(false);
      return;
    }

    toast.loading(
      `Skipping ${existingSet.size} existing · Fetching ${missingDays.length} missing days…`,
      { id: toastId },
    );

    // Step 3: Fetch only missing days from Aladhan API
    const newEntries: Omit<HijriCalendarEntry, 'id' | 'created_at' | 'updated_at'>[] = [];
    const apiFailed: string[] = [];

    for (let i = 0; i < missingDays.length; i++) {
      const { month, day } = missingDays[i];
      const monthName = MONTHS_SHORT[month - 1];
      setAllMonthsProgress(`${monthName} ${day} (${i + 1}/${missingDays.length})`);
      try {
        const result = await fetchHijriFromApi(selectedYear, month, day, hijriOffset);
        newEntries.push({
          gregorian_year:  selectedYear,
          gregorian_month: month,
          gregorian_day:   day,
          gregorian_date:  result.gregorian,
          hijri_date:      result.hijri,
        });
        console.log(`[Aladhan ✓] ${monthName} ${day}: ${result.gregorian} → ${result.hijri}`);
      } catch (e) {
        apiFailed.push(`${monthName} ${day}`);
        console.error(`[Aladhan ✗] ${monthName} ${day}:`, e);
      }
      toast.loading(
        `Fetching missing: ${i + 1}/${missingDays.length} · ${monthName} ${day}`,
        { id: toastId },
      );
      if (i < missingDays.length - 1) await new Promise((r) => setTimeout(r, 120));
    }

    if (newEntries.length === 0) {
      toast.error(
        apiFailed.length > 0
          ? `All ${apiFailed.length} API calls failed. Check connection.`
          : 'No new entries to save.',
        { id: toastId, duration: 6000 },
      );
      setPopulatingMissing(false);
      setAllMonthsProgress('');
      return;
    }

    // Step 4: Save new entries to DB
    toast.loading(`Saving ${newEntries.length} new dates to hijri_calendar…`, { id: toastId });
    const { saved, errors } = await upsertHijriCalendarEntries(newEntries);

    if (errors.length > 0) {
      if (errors[0].includes('schema cache') || errors[0].includes('column')) {
        setSchemaError(errors[0]);
        toast.error('DB schema error — see red banner.', { id: toastId, duration: 8000 });
      } else {
        toast.error(`Saved ${saved} but ${errors.length} errors: ${errors[0]}`, { id: toastId, duration: 8000 });
      }
    } else if (apiFailed.length > 0) {
      toast.warning(
        `✓ ${saved} new days saved · ${apiFailed.length} failed (API) · ${existingSet.size} already existed`,
        { id: toastId, duration: 6000 },
      );
    } else {
      toast.success(
        `✓ ${saved} missing days filled · ${existingSet.size} days already existed (skipped)`,
        { id: toastId, duration: 5000 },
      );
    }

    const updated = await fetchHijriCalendarMonth(selectedYear, selectedMonth);
    setHijriCalendar(updated);
    setAllMonthsProgress('');
    setPopulatingMissing(false);
  };

  // ── Fill All 12 Months: Aladhan API → hijri_calendar table ───────────────
  const handlePopulateAllMonths = async () => {
    if (schemaError) { toast.error('Fix the DB schema first (see the red banner above).'); return; }
    setPopulatingAllMonths(true);
    const toastId = 'fill-all-hijri';

    let totalDays = 0;
    for (let m = 1; m <= 12; m++) totalDays += new Date(selectedYear, m, 0).getDate();

    toast.loading(`Starting: fetching ${totalDays} days for ${selectedYear}…`, { id: toastId });

    const allEntries: Omit<HijriCalendarEntry, 'id' | 'created_at' | 'updated_at'>[] = [];
    const apiFailed: string[] = [];
    let processed = 0;

    for (let month = 1; month <= 12; month++) {
      const monthName = MONTHS_SHORT[month - 1];
      const lastDay = new Date(selectedYear, month, 0).getDate();

      for (let day = 1; day <= lastDay; day++) {
        setAllMonthsProgress(`${monthName} ${day}/${lastDay}`);
        try {
          const result = await fetchHijriFromApi(selectedYear, month, day, hijriOffset);
          allEntries.push({
            gregorian_year:  selectedYear,
            gregorian_month: month,
            gregorian_day:   day,
            gregorian_date:  result.gregorian,
            hijri_date:      result.hijri,
          });
          console.log(`[Aladhan ✓] ${monthName} ${day}: ${result.gregorian} → ${result.hijri}`);
        } catch (e) {
          apiFailed.push(`${monthName} ${day}`);
          console.error(`[Aladhan ✗] ${monthName} ${day}:`, e);
        }
        processed++;
        toast.loading(
          `Aladhan API: ${processed}/${totalDays} days · ${monthName} ${day}/${lastDay}`,
          { id: toastId },
        );
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    if (apiFailed.length > 0) {
      toast.loading(`API: ${allEntries.length} OK, ${apiFailed.length} failed. Saving…`, { id: toastId });
    }

    toast.loading(`Saving ${allEntries.length} dates to hijri_calendar table…`, { id: toastId });
    const { saved, errors } = await upsertHijriCalendarEntries(allEntries);

    if (errors.length > 0) {
      // Schema error — show banner
      if (errors[0].includes('schema cache') || errors[0].includes('column')) {
        setSchemaError(errors[0]);
        toast.error('DB schema error — see the red banner for the SQL fix.', { id: toastId, duration: 8000 });
      } else {
        toast.error(`Saved ${saved} days but ${errors.length} DB error(s): ${errors[0]}`, { id: toastId, duration: 8000 });
      }
    } else if (apiFailed.length > 0) {
      toast.warning(`${saved} days saved · ${apiFailed.length} days skipped (API failure)`, { id: toastId, duration: 6000 });
    } else {
      toast.success(`✓ All ${saved} days saved to hijri_calendar for all 12 months of ${selectedYear}`, { id: toastId, duration: 5000 });
    }

    const updated = await fetchHijriCalendarMonth(selectedYear, selectedMonth);
    setHijriCalendar(updated);
    setAllMonthsProgress('');
    setPopulatingAllMonths(false);
  };

  // ── Fill Dates: Aladhan API → hijri_calendar table ───────────────────────
  const handlePopulateHijriDates = async () => {
    if (schemaError) { toast.error('Fix the DB schema first (see the red banner above).'); return; }
    if (!data || data.length === 0) { toast.error('No prayer times loaded for this month.'); return; }
    setPopulatingHijri(true);
    const toastId = 'fill-hijri';

    toast.loading(`Fetching dates from Aladhan API… (0 / ${data.length})`, { id: toastId });
    const resolved: Omit<HijriCalendarEntry, 'id' | 'created_at' | 'updated_at'>[] = [];
    const apiFailed: number[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      try {
        const result = await fetchHijriFromApi(selectedYear, selectedMonth, row.day, hijriOffset);
        resolved.push({
          gregorian_year:  selectedYear,
          gregorian_month: selectedMonth,
          gregorian_day:   row.day,
          gregorian_date:  result.gregorian,
          hijri_date:      result.hijri,
        });
        console.log(`[Aladhan ✓] Day ${row.day}: ${result.gregorian} → ${result.hijri}`);
      } catch (e) {
        apiFailed.push(row.day);
        console.error(`[Aladhan ✗] Day ${row.day}:`, e);
      }
      toast.loading(`Fetching dates from Aladhan API… (${i + 1} / ${data.length})`, { id: toastId });
      if (i < data.length - 1) await new Promise((r) => setTimeout(r, 120));
    }

    if (apiFailed.length > 0) {
      toast.error(
        `Aladhan API failed for ${apiFailed.length} day(s): ${apiFailed.join(', ')}. Please retry.`,
        { id: toastId, duration: 7000 },
      );
      setPopulatingHijri(false);
      return;
    }

    toast.loading(`Saving ${resolved.length} dates to hijri_calendar table…`, { id: toastId });
    const { saved, errors } = await upsertHijriCalendarEntries(resolved);

    if (errors.length > 0) {
      if (errors[0].includes('schema cache') || errors[0].includes('column')) {
        setSchemaError(errors[0]);
        toast.error('DB schema error — see the red banner for the SQL fix.', { id: toastId, duration: 8000 });
      } else {
        toast.error(`${errors.length} DB write(s) failed: ${errors[0]}`, { id: toastId, duration: 8000 });
      }
    } else {
      toast.success(`✓ ${saved} days saved to hijri_calendar`, { id: toastId, duration: 4000 });
      const updated = await fetchHijriCalendarMonth(selectedYear, selectedMonth);
      setHijriCalendar(updated);
    }
    setPopulatingHijri(false);
  };

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['prayer_times', selectedMonth],
    queryFn: () => fetchPrayerTimes(selectedMonth),
    staleTime: 30_000,
  });

  const handleSaved = useCallback((updated: PrayerTime) => {
    queryClient.setQueryData<PrayerTime[]>(['prayer_times', selectedMonth], (old) =>
      old ? old.map((r) => (r.id === updated.id ? updated : r)) : old,
    );
    setEditingRow(null);
  }, [queryClient, selectedMonth]);

  const handleHijriSaved = useCallback((day: number, entry: HijriCalendarEntry) => {
    setHijriCalendar((prev) => new Map(prev).set(day, entry));
  }, []);

  const handleJumpToDay = () => {
    const day = parseInt(jumpInput.trim(), 10);
    if (isNaN(day) || day < 1 || day > 31) { setHighlightDay(null); return; }
    setHighlightDay(day);
    setTimeout(() => {
      const el = document.querySelector(`[data-day="${day}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    setTimeout(() => setHighlightDay(null), 3000);
  };

  const handleCsvImported = useCallback((updatedByMonth: Map<number, PrayerTime[]>) => {
    updatedByMonth.forEach((rows, m) => {
      if (rows.length > 0) {
        const sorted = [...rows].sort((a, b) => a.day - b.day);
        queryClient.setQueryData<PrayerTime[]>(['prayer_times', m], sorted);
      }
    });
    setCsvModal(false);
    updatedByMonth.forEach((_rows, m) => {
      queryClient.invalidateQueries({ queryKey: ['prayer_times', m] });
    });
  }, [queryClient]);

  const monthHasBSTChange = (m: number) => m === 3 || m === 10;
  const isBstMonth = isBST(selectedYear, selectedMonth, 15);

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 pt-14 md:pt-0 overflow-x-hidden">

        {/* ── Page Banner ── */}
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-0">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <CalendarDays size={20} className="text-[hsl(142_60%_32%)]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[hsl(150_30%_12%)]">Prayer Times</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {MONTHS_FULL[selectedMonth - 1]} {selectedYear} · {data?.length ?? 0} days ·{' '}
                  {isBstMonth
                    ? <span className="font-semibold text-[hsl(142_60%_32%)]">BST (UTC+1)</span>
                    : <span className="font-medium text-slate-500">GMT (UTC+0)</span>}
                  {monthHasBSTChange(selectedMonth) && <span className="ml-2 text-amber-600 font-medium">⚡ Clock change</span>}
                  {hijriLoading && <span className="ml-2 text-[#7c3aed]">· loading Hijri…</span>}
                  {!hijriLoading && hijriCalendar.size > 0 && (
                    <span className="ml-2 text-[#7c3aed]">· {hijriCalendar.size} Hijri dates</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:justify-end">
              {/* Hijri offset */}
              <div className="flex items-center gap-1 border border-[hsl(140_20%_88%)] rounded-lg px-2 py-1.5 bg-[hsl(140_30%_97%)]">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mr-1">Hijri</span>
                <button onClick={() => changeOffset(-1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-white transition-colors"><Minus size={10} /></button>
                <span className={`text-xs font-bold tabular-nums w-8 text-center ${hijriOffset === 0 ? 'text-muted-foreground' : hijriOffset > 0 ? 'text-emerald-600' : 'text-orange-500'}`}>
                  {hijriOffset > 0 ? `+${hijriOffset}` : hijriOffset === 0 ? '±0' : hijriOffset}
                </span>
                <button onClick={() => changeOffset(1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-white transition-colors"><Plus size={10} /></button>
                {hijriOffset !== 0 && (
                  <button onClick={handleResetOffset} className="ml-1 text-[9px] text-muted-foreground hover:text-foreground">
                    reset
                  </button>
                )}
                {/* Save status indicator */}
                {offsetStatus === 'saving' && (
                  <span className="ml-1 flex items-center gap-0.5">
                    <Loader2 size={9} className="animate-spin text-muted-foreground" />
                  </span>
                )}
                {offsetStatus === 'saved' && (
                  <span className="ml-1 flex items-center gap-0.5" title="Saved to database">
                    <CheckCircle2 size={10} className="text-emerald-500" />
                  </span>
                )}
                {offsetStatus === 'error' && (
                  <span className="ml-1 flex items-center gap-0.5" title="DB save failed">
                    <XCircle size={10} className="text-red-500" />
                  </span>
                )}
              </div>

              {/* Jump to day */}
              <div className="flex items-center gap-1 border border-[hsl(140_20%_88%)] rounded-lg px-2 py-1.5 bg-[hsl(140_30%_97%)]">
                <Search size={12} className="text-muted-foreground shrink-0" />
                <input
                  type="number" min={1} max={31} value={jumpInput}
                  onChange={(e) => setJumpInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleJumpToDay(); }}
                  placeholder="Day"
                  className="w-12 bg-transparent text-xs font-mono outline-none text-foreground placeholder:text-muted-foreground/60"
                />
                <button onClick={handleJumpToDay} className="text-[10px] font-semibold text-[hsl(142_60%_35%)] hover:underline">Go</button>
              </div>

              <Button variant="outline" size="sm" onClick={() => setCsvModal(true)} className="gap-2 border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)]">
                <Upload size={14} /> Import CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => setJumuahModal(true)} className="gap-2 border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)]">
                <CalendarCheck size={14} /> Set Jumu'ah
              </Button>

              {/* Fill Dates — current month only */}
              <Button
                variant="outline" size="sm"
                onClick={handlePopulateHijriDates}
                disabled={populatingHijri || populatingAllMonths || !data || data.length === 0 || !!schemaError}
                className="gap-2 border-[hsl(270_50%_75%)] text-[#7c3aed] hover:bg-[hsl(270_50%_97%)]"
                title={schemaError ? 'Fix DB schema first' : `Fetch Gregorian + Hijri dates from Aladhan API for this month`}
              >
                {populatingHijri ? <Loader2 size={14} className="animate-spin" /> : <Moon size={14} />}
                {populatingHijri ? 'Filling…' : 'Fill Month'}
              </Button>

              {/* Fill Missing Only — fast partial update */}
              <Button
                variant="outline" size="sm"
                onClick={handleFillMissingOnly}
                disabled={populatingMissing || populatingAllMonths || populatingHijri || !!schemaError}
                className="gap-2 border-[hsl(38_80%_65%)] bg-[hsl(38_80%_97%)] text-[hsl(38_70%_30%)] hover:bg-[hsl(38_80%_93%)] font-semibold"
                title={schemaError ? 'Fix DB schema first' : `Only fetch days not yet in hijri_calendar for ${selectedYear} — much faster than Fill All`}
              >
                {populatingMissing
                  ? <><Loader2 size={14} className="animate-spin" />{allMonthsProgress || 'Checking…'}</>
                  : <><Zap size={14} />Fill Missing</>}
              </Button>

              {/* Fill All Months — entire year */}
              <Button
                variant="outline" size="sm"
                onClick={handlePopulateAllMonths}
                disabled={populatingAllMonths || populatingHijri || populatingMissing || !!schemaError}
                className="gap-2 border-[hsl(270_60%_65%)] bg-[hsl(270_50%_97%)] text-[#6d28d9] hover:bg-[hsl(270_50%_93%)] font-semibold"
                title={schemaError ? 'Fix DB schema first' : `Fetch + overwrite Hijri dates for ALL 12 months of ${selectedYear}`}
              >
                {populatingAllMonths
                  ? <><Loader2 size={14} className="animate-spin" />{allMonthsProgress ? allMonthsProgress : 'Working…'}</>
                  : <><Moon size={14} />Fill All {selectedYear}</>
                }
              </Button>

              {/* Export Hijri CSV */}
              <Button
                variant="outline" size="sm"
                onClick={handleExportHijriCsv}
                disabled={exportingCsv || populatingAllMonths || populatingHijri}
                className="gap-2 border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)]"
                title={`Download all hijri_calendar entries for ${selectedYear} as CSV`}
              >
                {exportingCsv ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {exportingCsv ? 'Exporting…' : `Export ${selectedYear} CSV`}
              </Button>

              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
                <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
              </Button>
            </div>
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mr-1 shrink-0">Year</span>
            <button onClick={() => setSelectedYear((y) => Math.max(y - 1, YEAR_RANGE[0]))} className="w-6 h-6 flex items-center justify-center rounded border border-[hsl(140_20%_88%)] hover:bg-[hsl(140_30%_97%)]"><ChevronLeft size={12} /></button>
            <div className="flex items-center gap-1 flex-wrap">
              {YEAR_RANGE.map((y) => {
                const active = selectedYear === y; const isCurrent = y === CURRENT_YEAR;
                return (
                  <button key={y} onClick={() => setSelectedYear(y)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${active ? 'border-transparent text-white shadow-sm' : isCurrent ? 'border-[hsl(142_50%_75%)]' : 'border-[hsl(140_20%_88%)] bg-white text-muted-foreground hover:text-foreground'}`}
                    style={active ? { background: 'hsl(var(--primary))' } : {}}>
                    {y}{isCurrent && !active && <span className="ml-0.5 inline-block w-1 h-1 rounded-full bg-[hsl(142_60%_35%)] align-middle" />}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setSelectedYear((y) => Math.min(y + 1, YEAR_RANGE[YEAR_RANGE.length - 1]))} className="w-6 h-6 flex items-center justify-center rounded border border-[hsl(140_20%_88%)] hover:bg-[hsl(140_30%_97%)]"><ChevronRight size={12} /></button>
          </div>

          {/* Month selector */}
          <div className="flex items-center gap-1.5 flex-wrap pb-4 overflow-x-auto">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mr-1 shrink-0">Month</span>
            {MONTHS_SHORT.map((abbr, i) => {
              const month = i + 1; const active = selectedMonth === month;
              const isCurrent = month === CURRENT_MONTH && selectedYear === CURRENT_YEAR;
              const hasClock = monthHasBSTChange(month);
              return (
                <button key={month} onClick={() => setSelectedMonth(month)} title={hasClock ? 'Clock change month' : undefined}
                  className={`relative px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${active ? 'border-transparent text-white shadow-sm' : 'border-[hsl(140_20%_88%)] bg-white text-muted-foreground hover:text-foreground hover:border-[hsl(142_50%_75%)]'}`}
                  style={active ? { background: 'hsl(var(--primary))' } : {}}>
                  {abbr}
                  {hasClock && <span className="absolute -top-1 -right-1 text-[9px]">⚡</span>}
                  {isCurrent && !active && <span className="ml-1 inline-block w-1 h-1 rounded-full bg-[hsl(142_60%_35%)] align-middle" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 sm:px-8 py-2.5 bg-[hsl(140_30%_97%)] border-b border-[hsl(140_20%_88%)] flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-[#fef9ec] border border-amber-200" />Friday</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-[#eff6ff] border border-blue-200" />Today</span>
          <span className="flex items-center gap-1.5"><span className="inline-block px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[9px]">BST</span>Summer Time</span>
          <span className="flex items-center gap-1.5"><span className="inline-block px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[9px]">GMT</span>Winter Time</span>
          {hijriCalendar.size > 0 && (
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-[hsl(270_50%_95%)] border border-[hsl(270_50%_75%)]" /><span className="text-[#7c3aed]">Hijri from DB</span></span>
          )}
        </div>

        {/* Content */}
        <div className="px-2 sm:px-6 py-4 flex-1 overflow-x-auto">

          {/* DB Schema Error Banner */}
          {schemaError && (
            <DbSetupBanner onDismiss={() => {
              setSchemaError(null);
              schemaMigrated = false;
              ensureHijriCalendarSchema().then((r) => {
                if (!r.ok) setSchemaError(r.message);
                else {
                  fetchHijriCalendarMonth(selectedYear, selectedMonth).then(setHijriCalendar);
                }
              });
            }} />
          )}

          {isLoading && (
            <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
              <Loader2 size={20} className="animate-spin text-[hsl(142_60%_35%)]" />
              <span className="text-sm">Loading prayer times…</span>
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-sm text-destructive">
              <AlertCircle size={16} /> Failed to load data. Check connection and try refreshing.
            </div>
          )}
          {!isLoading && !isError && data && (
            <>
              <PrayerTimesTable
                data={data}
                year={selectedYear}
                hijriOffset={hijriOffset}
                hijriCalendar={hijriCalendar}
                onEdit={setEditingRow}
                highlightDay={highlightDay}
              />

              {selectedYear === CURRENT_YEAR && selectedMonth === CURRENT_MONTH && (() => {
                const today = new Date().getDate();
                const todayRow = data.find((r) => r.day === today);
                if (!todayRow) return null;
                return (
                  <div className="mt-4 max-w-2xl">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
                      Today's Solar Times
                    </p>
                    <SolarTimesCard
                      sunrise={todayRow.sunrise ?? null}
                      ishraq={todayRow.ishraq ?? null}
                      zawaal={todayRow.zawaal ?? null}
                    />
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </main>

      <JumuahYearModal open={jumuahModal} onClose={() => setJumuahModal(false)} year={selectedYear} queryClient={queryClient} />
      <EditPrayerTimeModal
        row={editingRow}
        year={selectedYear}
        hijriEntry={editingRow ? (hijriCalendar.get(editingRow.day) ?? null) : null}
        onClose={() => setEditingRow(null)}
        onSaved={handleSaved}
        onHijriSaved={handleHijriSaved}
      />
      <CsvImportModal
        open={csvModal}
        onClose={() => { setCsvModal(false); setCsvPreload(undefined); }}
        month={selectedMonth}
        monthName={MONTHS_FULL[selectedMonth - 1]}
        year={selectedYear}
        onImported={handleCsvImported}
        preloadedCsv={csvPreload}
      />
    </div>
  );
};

export default PrayerTimes;

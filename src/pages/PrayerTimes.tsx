import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '#/components/layout/Sidebar';
import PrayerTimesTable from '#/components/features/PrayerTimesTable';
import EditPrayerTimeModal from '#/components/features/EditPrayerTimeModal';
import CsvImportModal from '#/components/features/CsvImportModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Button } from '#/components/ui/button';
import { fetchPrayerTimes, bulkUpdatePrayerTimes, updatePrayerTime } from '#/lib/api';
import { PrayerTime, HijriCalendarEntry, PrayerTimeUpdate } from '#/types';
import { toast } from 'sonner';
import {
  Loader2, AlertCircle, RefreshCw,
  ChevronLeft, ChevronRight, Minus, Plus, CalendarCheck, Upload, Search, CalendarDays, Moon, Download, Database, CheckCircle2, XCircle, Zap, Star, SlidersHorizontal, MoreHorizontal,
} from 'lucide-react';
import { isBST } from '#/lib/dateUtils';
import { supabaseAdmin } from '#/lib/supabase';
import { SolarTimesCard } from '#/pages/Dashboard';
import EidTimesModal, { fetchEidPrayers, EidPrayer } from '#/components/features/EidTimesModal';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu';

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

/**
 * Fetch a SINGLE day's Hijri date (used for EditPrayerTimeModal).
 * Uses gToH endpoint + day-shift trick for offset.
 */
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

  const origDay   = String(day).padStart(2, '0');
  const origMonth = String(month).padStart(2, '0');

  return {
    hijri:     `${parseInt(h.day, 10)} ${h.month.en} ${h.year} AH`,
    gregorian: `${year}-${origMonth}-${origDay}`,
  };
}

/**
 * Fetch ALL days in a month from Aladhan's gToHCalendar endpoint.
 * Applies offset in-app by shifting Gregorian day lookup, because API adjustment
 * responses are inconsistent for some dates/endpoints.
 * Returns Map<day, { hijri, gregorian }>.
 */
async function fetchHijriMonthFromApi(
  year: number,
  month: number,
  offset = 0,
): Promise<Map<number, { hijri: string; gregorian: string }>> {
  const fetchMonthRaw = async (y: number, m: number) => {
    const url = `https://api.aladhan.com/v1/gToHCalendar/${m}/${y}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Aladhan API ${res.status}: ${res.statusText}`);
    const json = await res.json();
    if (!Array.isArray(json?.data)) throw new Error('Aladhan calendar API: unexpected response');
    return json.data as Array<{ gregorian?: { day?: string; month?: { number?: number }; year?: string }; hijri?: { day?: string; month?: { en?: string }; year?: string } }>;
  };

  const currentDate = new Date(year, month - 1, 1);
  const prevDate = new Date(year, month - 2, 1);
  const nextDate = new Date(year, month, 1);

  const [prevRaw, currentRaw, nextRaw] = await Promise.all([
    fetchMonthRaw(prevDate.getFullYear(), prevDate.getMonth() + 1),
    fetchMonthRaw(currentDate.getFullYear(), currentDate.getMonth() + 1),
    fetchMonthRaw(nextDate.getFullYear(), nextDate.getMonth() + 1),
  ]);

  const byGregorian = new Map<string, { hijri: string }>();
  const ingest = (rows: Array<{ gregorian?: { day?: string; month?: { number?: number }; year?: string }; hijri?: { day?: string; month?: { en?: string }; year?: string } }>) => {
    rows.forEach((entry) => {
      const gYear = parseInt(entry?.gregorian?.year ?? '0', 10);
      const gMonth = entry?.gregorian?.month?.number ?? 0;
      const gDay = parseInt(entry?.gregorian?.day ?? '0', 10);
      const h = entry?.hijri;
      if (!gYear || !gMonth || !gDay || !h?.day || !h?.year || !h?.month?.en) return;
      const key = `${gYear}-${String(gMonth).padStart(2, '0')}-${String(gDay).padStart(2, '0')}`;
      byGregorian.set(key, {
        hijri: `${parseInt(h.day, 10)} ${h.month.en} ${h.year} AH`,
      });
    });
  };

  ingest(prevRaw);
  ingest(currentRaw);
  ingest(nextRaw);

  const map = new Map<number, { hijri: string; gregorian: string }>();
  const lastDay = new Date(year, month, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const original = new Date(year, month - 1, day);
    const shifted = new Date(year, month - 1, day + offset);
    const shiftedKey = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`;
    const match = byGregorian.get(shiftedKey);
    if (!match) continue;

    map.set(day, {
      hijri: match.hijri,
      gregorian: `${original.getFullYear()}-${String(original.getMonth() + 1).padStart(2, '0')}-${String(original.getDate()).padStart(2, '0')}`,
    });
  }

  console.log(`[Aladhan Calendar ✓] ${year}-${month} offset=${offset}: ${map.size} days (app-shift)`);
  return map;
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
    const nowIso = new Date().toISOString();
    const payload = {
      key: 'hijri_offset',
      value: String(n),
      label: 'Hijri Date Offset',
      category: 'preferences',
      updated_at: nowIso,
    };

    const { data: existingRows, error: existingErr } = await supabaseAdmin
      .from('masjid_settings')
      .select('id')
      .eq('key', 'hijri_offset')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (existingErr) {
      console.error('[HijriOffset] Existing row check failed:', existingErr.message);
      return { ok: false };
    }

    if (existingRows && existingRows.length > 0) {
      const { error: updateErr } = await supabaseAdmin
        .from('masjid_settings')
        .update(payload)
        .eq('id', existingRows[0].id);
      if (updateErr) {
        console.error('[HijriOffset] DB update failed:', updateErr.message);
        return { ok: false };
      }
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('masjid_settings')
        .insert(payload);
      if (insertErr) {
        console.error('[HijriOffset] DB insert failed:', insertErr.message);
        return { ok: false };
      }
    }

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
      .select('value,updated_at')
      .eq('key', 'hijri_offset')
      .order('updated_at', { ascending: false })
      .limit(20);

    if (!error && Array.isArray(data) && data.length > 0) {
      for (const row of data) {
        const n = parseInt(String(row?.value ?? ''), 10);
        if (!isNaN(n)) return Math.max(-30, Math.min(30, n));
      }
    }
  } catch { /* ignore */ }
  return 0;
}

const HIJRI_OFFSET_STORAGE_KEY = 'prayer-times:hijri-offset';

function readOffsetFromStorage(): number | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(HIJRI_OFFSET_STORAGE_KEY);
    if (raw == null) return null;
    const n = parseInt(raw, 10);
    if (isNaN(n)) return null;
    return Math.max(-30, Math.min(30, n));
  } catch {
    return null;
  }
}

function writeOffsetToStorage(n: number): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(HIJRI_OFFSET_STORAGE_KEY, String(Math.max(-30, Math.min(30, n))));
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CURRENT_YEAR  = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

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
  const initialOffset = readOffsetFromStorage() ?? 0;
  const [selectedYear,    setSelectedYear]    = useState(CURRENT_YEAR);
  const [selectedMonth,   setSelectedMonth]   = useState(CURRENT_MONTH);
  const [editingRow,      setEditingRow]      = useState<PrayerTime | null>(null);
  const [jumuahModal,     setJumuahModal]     = useState(false);
  const [csvModal,        setCsvModal]        = useState(false);
  const [csvPreload,      setCsvPreload]      = useState<string | undefined>(undefined);
  const [hijriOffset,     setHijriOffset]     = useState<number>(initialOffset);
  const [populatingHijri,    setPopulatingHijri]    = useState(false);
  const [populatingAllMonths,   setPopulatingAllMonths]   = useState(false);
  const [populatingMissing,     setPopulatingMissing]     = useState(false);
  const [allMonthsProgress,     setAllMonthsProgress]     = useState('');
  const [exportingCsv,          setExportingCsv]          = useState(false);
  // Hijri offset save status: 'idle' | 'saving' | 'saved' | 'error'
  const [offsetStatus,          setOffsetStatus]          = useState<'idle'|'saving'|'saved'|'error'>('idle');
  // Track the offset at which hijri_calendar was last filled — warn user when they change offset but haven't re-filled
  const [loadedOffset,          setLoadedOffset]          = useState<number>(initialOffset);
  const [offsetDirty,           setOffsetDirty]           = useState(false);
  const [offsetReady,           setOffsetReady]           = useState(false);
  const [offsetChangedByUser,   setOffsetChangedByUser]   = useState(false);
  const hijriOffsetRef = useRef<number>(initialOffset);
  const offsetDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offsetStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [jumpInput,       setJumpInput]       = useState('');
  const [highlightDay,    setHighlightDay]    = useState<number | null>(null);
  const [searchParams,    setSearchParams]    = useSearchParams();
  const [schemaError,     setSchemaError]     = useState<string | null>(null);
  const [schemaChecked,   setSchemaChecked]   = useState(false);
  const [eidModal,        setEidModal]        = useState(false);
  const [eidPrayers,      setEidPrayers]      = useState<EidPrayer[]>([]);
  // Hijri preview: offset preview without writing to DB
  const [previewHijri,    setPreviewHijri]    = useState<Map<number, string>>(new Map());
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [previewOffset,   setPreviewOffset]   = useState<number | null>(null);
  const [todayHijriBase,  setTodayHijriBase]  = useState<string>('');
  const [todayHijriLoading, setTodayHijriLoading] = useState(false);
  const [yearInput,       setYearInput]       = useState<string>('');
  const [pendingPrayerChanges, setPendingPrayerChanges] = useState<Record<string, PrayerTimeUpdate>>({});
  const [savingPendingPrayerChanges, setSavingPendingPrayerChanges] = useState(false);
  const [showLegend,      setShowLegend]      = useState(true);
  const [showSolarCard,   setShowSolarCard]   = useState(true);
  const [showPreviewHint, setShowPreviewHint] = useState(true);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    let active = true;
    setOffsetReady(false);

    loadOffsetFromDb()
      .then((dbOffset) => {
        if (!active) return;
        const storedOffset = readOffsetFromStorage();
        const effectiveOffset = storedOffset ?? dbOffset;

        setHijriOffset(effectiveOffset);
        hijriOffsetRef.current = effectiveOffset;
        setLoadedOffset(effectiveOffset);
        writeOffsetToStorage(effectiveOffset);

        // If local value exists but DB is stale, update DB in the background.
        if (storedOffset != null && storedOffset !== dbOffset) {
          void saveOffsetToDb(storedOffset);
        }
      })
      .finally(() => {
        if (active) setOffsetReady(true);
      });

    return () => {
      active = false;
      if (offsetDebounceRef.current) {
        clearTimeout(offsetDebounceRef.current);
        offsetDebounceRef.current = null;
        // Persist immediately when leaving the page so quick navigation never loses offset.
        const latest = hijriOffsetRef.current;
        writeOffsetToStorage(latest);
        void saveOffsetToDb(latest);
      }
      if (offsetStatusTimerRef.current) {
        clearTimeout(offsetStatusTimerRef.current);
        offsetStatusTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    hijriOffsetRef.current = hijriOffset;
    writeOffsetToStorage(hijriOffset);
  }, [hijriOffset]);

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

  // Load Eid prayers once on mount (permanent — no year filter)
  useEffect(() => {
    fetchEidPrayers().then(setEidPrayers);
  }, []);

  // Baseline reference: today's Hijri date with NO offset, so staff can compare quickly.
  useEffect(() => {
    let active = true;
    const now = new Date();
    setTodayHijriLoading(true);
    fetchHijriFromApi(now.getFullYear(), now.getMonth() + 1, now.getDate(), 0)
      .then(({ hijri }) => {
        if (!active) return;
        setTodayHijriBase(hijri);
      })
      .catch(() => {
        if (!active) return;
        setTodayHijriBase('Unavailable');
      })
      .finally(() => {
        if (active) setTodayHijriLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // ── Auto-preview on offset or month/year change (1s debounce) ──────────────
  useEffect(() => {
    if (!offsetReady) return;
    if (!offsetChangedByUser) return;
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewHijri(new Map());
      try {
        const monthMap = await fetchHijriMonthFromApi(selectedYear, selectedMonth, hijriOffset);
        const preview = new Map<number, string>();
        monthMap.forEach(({ hijri }, day) => preview.set(day, hijri));
        setPreviewHijri(preview);
        setPreviewOffset(hijriOffset);
      } catch (e) {
        console.warn('[Preview] Auto-preview failed:', e);
      } finally {
        setPreviewLoading(false);
      }
    }, 1000);
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, [hijriOffset, selectedYear, selectedMonth, offsetReady, offsetChangedByUser]);

  // ── Manual preview helper (kept for clearPreview) ──────────────────────────
  const handlePreviewHijri = async () => {
    const effectiveOffset = hijriOffsetRef.current;
    setPreviewLoading(true);
    setPreviewHijri(new Map());
    try {
      const monthMap = await fetchHijriMonthFromApi(selectedYear, selectedMonth, effectiveOffset);
      const preview = new Map<number, string>();
      monthMap.forEach(({ hijri }, day) => preview.set(day, hijri));
      setPreviewHijri(preview);
      setPreviewOffset(effectiveOffset);
      toast.success(`Preview ready — ${preview.size} days with offset ${effectiveOffset > 0 ? '+' : ''}${effectiveOffset}. Click "Fill Month" to save to DB.`);
    } catch (e) {
      toast.error(`Preview failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const clearPreview = () => {
    setPreviewHijri(new Map());
    setPreviewOffset(null);
  };

  const changeOffset = (delta: number) => {
    setHijriOffset((prev) => {
      const next = Math.max(-30, Math.min(30, prev + delta));
      if (next === prev) return prev;
      setOffsetChangedByUser(true);
      hijriOffsetRef.current = next;
      // Debounce DB save — wait 800ms after last click before saving
      if (offsetDebounceRef.current) clearTimeout(offsetDebounceRef.current);
      if (offsetStatusTimerRef.current) clearTimeout(offsetStatusTimerRef.current);
      setOffsetStatus('saving');
      setOffsetDirty(true); // flag that offset changed — DB data may be stale
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
    hijriOffsetRef.current = 0;
    setOffsetChangedByUser(true);
    setHijriOffset(0);
    setOffsetDirty(loadedOffset !== 0); // dirty only if loaded offset wasn't 0
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
  // Uses monthly calendar endpoint (12 calls/year) for speed
  const handleFillMissingOnly = async () => {
    const effectiveOffset = hijriOffsetRef.current;
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

    // Step 3: Fetch only missing days using monthly calendar API (batch by month)
    const newEntries: Omit<HijriCalendarEntry, 'id' | 'created_at' | 'updated_at'>[] = [];
    const apiFailed: string[] = [];

    // Group missing days by month for batch fetching
    const byMonth = new Map<number, number[]>();
    for (const { month, day } of missingDays) {
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month)!.push(day);
    }

    let processedMonths = 0;
    for (const [month, days] of Array.from(byMonth.entries()).sort((a, b) => a[0] - b[0])) {
      const monthName = MONTHS_SHORT[month - 1];
      setAllMonthsProgress(`${monthName} (${processedMonths + 1}/${byMonth.size} months)`);
      toast.loading(`Fetching ${monthName} — ${days.length} missing days…`, { id: toastId });
      try {
        const monthMap = await fetchHijriMonthFromApi(selectedYear, month, effectiveOffset);
        for (const day of days) {
          const result = monthMap.get(day);
          if (result) {
            newEntries.push({
              gregorian_year:  selectedYear,
              gregorian_month: month,
              gregorian_day:   day,
              gregorian_date:  result.gregorian,
              hijri_date:      result.hijri,
            });
          } else {
            apiFailed.push(`${monthName} ${day}`);
          }
        }
      } catch (e) {
        days.forEach(d => apiFailed.push(`${monthName} ${d}`));
        console.error(`[Aladhan ✗] ${monthName}:`, e);
      }
      processedMonths++;
      if (processedMonths < byMonth.size) await new Promise((r) => setTimeout(r, 200));
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
    setLoadedOffset(effectiveOffset);
    setOffsetDirty(false);
    setAllMonthsProgress('');
    setPopulatingMissing(false);
  };

  // ── Fill All 12 Months: Aladhan API → hijri_calendar table ───────────────
  // Uses gToHCalendar (1 call/month = 12 calls total instead of 365)
  const handlePopulateAllMonths = async () => {
    const effectiveOffset = hijriOffsetRef.current;
    if (schemaError) { toast.error('Fix the DB schema first (see the red banner above).'); return; }
    setPopulatingAllMonths(true);
    const toastId = 'fill-all-hijri';

    toast.loading(`Fetching all 12 months for ${selectedYear} (offset ${effectiveOffset > 0 ? '+' : ''}${effectiveOffset})…`, { id: toastId });

    const allEntries: Omit<HijriCalendarEntry, 'id' | 'created_at' | 'updated_at'>[] = [];
    const apiFailed: string[] = [];

    for (let month = 1; month <= 12; month++) {
      const monthName = MONTHS_SHORT[month - 1];
      const lastDay = new Date(selectedYear, month, 0).getDate();
      setAllMonthsProgress(`${monthName} (${month}/12)`);
      toast.loading(`Fetching ${monthName} ${selectedYear}… (${month}/12)`, { id: toastId });
      try {
        const monthMap = await fetchHijriMonthFromApi(selectedYear, month, effectiveOffset);
        for (let day = 1; day <= lastDay; day++) {
          const result = monthMap.get(day);
          if (result) {
            allEntries.push({
              gregorian_year:  selectedYear,
              gregorian_month: month,
              gregorian_day:   day,
              gregorian_date:  result.gregorian,
              hijri_date:      result.hijri,
            });
          } else {
            apiFailed.push(`${monthName} ${day}`);
          }
        }
      } catch (e) {
        // fall back to per-day on API error for this month
        console.error(`[Aladhan Calendar ✗] ${monthName}:`, e);
        apiFailed.push(`${monthName} (whole month)`);
      }
      // Small pause between months to avoid rate limiting
      if (month < 12) await new Promise((r) => setTimeout(r, 200));
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
    setLoadedOffset(effectiveOffset);
    setOffsetDirty(false);
    setAllMonthsProgress('');
    setPopulatingAllMonths(false);
  };

  // ── Fill Dates: Aladhan API → hijri_calendar table (single month, batch call) ─
  const handlePopulateHijriDates = async () => {
    const effectiveOffset = hijriOffsetRef.current;
    if (schemaError) { toast.error('Fix the DB schema first (see the red banner above).'); return; }
    if (!data || data.length === 0) { toast.error('No prayer times loaded for this month.'); return; }
    setPopulatingHijri(true);
    clearPreview();
    const toastId = 'fill-hijri';
    const monthName = MONTHS_FULL[selectedMonth - 1];

    toast.loading(`Fetching ${monthName} from Aladhan API…`, { id: toastId });

    let monthMap: Map<number, { hijri: string; gregorian: string }>;
    try {
      monthMap = await fetchHijriMonthFromApi(selectedYear, selectedMonth, effectiveOffset);
    } catch (e) {
      toast.error(`Aladhan API failed: ${e instanceof Error ? e.message : String(e)}`, { id: toastId, duration: 7000 });
      setPopulatingHijri(false);
      return;
    }

    const resolved: Omit<HijriCalendarEntry, 'id' | 'created_at' | 'updated_at'>[] = [];
    const apiFailed: number[] = [];

    for (const row of data) {
      const result = monthMap.get(row.day);
      if (result) {
        resolved.push({
          gregorian_year:  selectedYear,
          gregorian_month: selectedMonth,
          gregorian_day:   row.day,
          gregorian_date:  result.gregorian,
          hijri_date:      result.hijri,
        });
      } else {
        apiFailed.push(row.day);
      }
    }

    if (apiFailed.length > 0) {
      toast.warning(`Missing ${apiFailed.length} days from API: ${apiFailed.join(', ')}`, { id: toastId, duration: 5000 });
    }

    toast.loading(`Saving ${resolved.length} dates to hijri_calendar…`, { id: toastId });
    const { saved, errors } = await upsertHijriCalendarEntries(resolved);

    if (errors.length > 0) {
      if (errors[0].includes('schema cache') || errors[0].includes('column')) {
        setSchemaError(errors[0]);
        toast.error('DB schema error — see the red banner for the SQL fix.', { id: toastId, duration: 8000 });
      } else {
        toast.error(`${errors.length} DB write(s) failed: ${errors[0]}`, { id: toastId, duration: 8000 });
      }
    } else {
      toast.success(`✓ ${saved} days saved to hijri_calendar for ${monthName}`, { id: toastId, duration: 4000 });
      const updated = await fetchHijriCalendarMonth(selectedYear, selectedMonth);
      setHijriCalendar(updated);
      setLoadedOffset(effectiveOffset);
      setOffsetDirty(false);
    }
    setPopulatingHijri(false);
  };

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['prayer_times', selectedMonth],
    queryFn: () => fetchPrayerTimes(selectedMonth),
    staleTime: 30_000,
  });

  const editablePrayerKeys: (keyof PrayerTimeUpdate)[] = [
    'fajr', 'fajr_jamat', 'sunrise', 'ishraq', 'zawaal',
    'zuhr', 'zuhr_jamat', 'asr', 'asr_jamat',
    'maghrib', 'maghrib_jamat', 'isha', 'isha_jamat',
    'jumu_ah_1', 'jumu_ah_2',
  ];

  const visibleData = useMemo(() => {
    if (!data) return data;
    return data.map((row) => {
      const pending = pendingPrayerChanges[row.id];
      return pending ? ({ ...row, ...pending } as PrayerTime) : row;
    });
  }, [data, pendingPrayerChanges]);

  const handleSaved = useCallback((updated: PrayerTime) => {
    const original = data?.find((r) => r.id === updated.id);
    if (!original) {
      setEditingRow(null);
      return;
    }

    const diff: PrayerTimeUpdate = {};
    editablePrayerKeys.forEach((key) => {
      const nextVal = (updated[key as keyof PrayerTime] as string | null) ?? null;
      const baseVal = (original[key as keyof PrayerTime] as string | null) ?? null;
      if (nextVal !== baseVal) {
        (diff as Record<string, string | null>)[key] = nextVal;
      }
    });

    setPendingPrayerChanges((prev) => {
      const next = { ...prev };
      if (Object.keys(diff).length === 0) delete next[updated.id];
      else next[updated.id] = diff;
      return next;
    });

    setHighlightDay(updated.day);
    setTimeout(() => setHighlightDay(null), 2500);
    setEditingRow(null);
  }, [data]);

  const pendingPrayerRowsCount = Object.keys(pendingPrayerChanges).length;
  const pendingPrayerCellCount = Object.values(pendingPrayerChanges)
    .reduce((sum, item) => sum + Object.keys(item).length, 0);

  const handleDiscardPendingPrayerChanges = () => {
    setPendingPrayerChanges({});
    toast.success('Discarded pending prayer time edits.');
  };

  const handleSavePendingPrayerChanges = async () => {
    const entries = Object.entries(pendingPrayerChanges);
    if (entries.length === 0) return;

    setSavingPendingPrayerChanges(true);
    const updatedRows: PrayerTime[] = [];
    const failedIds: string[] = [];

    for (const [id, payload] of entries) {
      try {
        const result = await updatePrayerTime(id, payload);
        if (result[0]) updatedRows.push(result[0]);
      } catch {
        failedIds.push(id);
      }
    }

    if (updatedRows.length > 0) {
      queryClient.setQueryData<PrayerTime[]>(['prayer_times', selectedMonth], (old) => {
        if (!old) return old;
        const map = new Map(updatedRows.map((row) => [row.id, row]));
        return old.map((row) => map.get(row.id) ?? row);
      });
    }

    setPendingPrayerChanges((prev) => {
      if (failedIds.length === 0) return {};
      const keep: Record<string, PrayerTimeUpdate> = {};
      failedIds.forEach((id) => {
        if (prev[id]) keep[id] = prev[id];
      });
      return keep;
    });

    if (failedIds.length === 0) {
      toast.success(`Saved ${updatedRows.length} day change(s).`);
    } else {
      toast.error(`Saved ${updatedRows.length}, but ${failedIds.length} failed. Please retry.`);
    }

    setSavingPendingPrayerChanges(false);
  };

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
  const offsetLabel = `${hijriOffset >= 0 ? '+' : ''}${hijriOffset}`;
  const previewDiffCount = data
    ? data.filter((row) => {
        const db = hijriCalendar.get(row.day)?.hijri_date;
        const pre = previewHijri.get(row.day);
        return !!pre && (!db || db !== pre);
      }).length
    : 0;
  const hasPendingPreview = previewHijri.size > 0 && previewDiffCount > 0;

  const goToPrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
      return;
    }
    setSelectedMonth((m) => m - 1);
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
      return;
    }
    setSelectedMonth((m) => m + 1);
  };

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

              <div className="flex items-center gap-2 flex-wrap rounded-xl border border-[hsl(270_45%_82%)] bg-[hsl(270_40%_97%)] px-2.5 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#7c3aed]">Hijri Tools</span>

                <div className="flex flex-col gap-0.5 rounded-lg px-2 py-1 bg-white border border-[hsl(270_35%_85%)]">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mr-1">Offset</span>
                    <button onClick={() => changeOffset(-1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-[hsl(270_40%_96%)] transition-colors"><Minus size={10} /></button>
                    <span className={`text-xs font-bold tabular-nums w-8 text-center ${hijriOffset === 0 ? 'text-muted-foreground' : hijriOffset > 0 ? 'text-emerald-600' : 'text-orange-500'}`}>
                      {hijriOffset > 0 ? `+${hijriOffset}` : hijriOffset === 0 ? '±0' : hijriOffset}
                    </span>
                    <button onClick={() => changeOffset(1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-[hsl(270_40%_96%)] transition-colors"><Plus size={10} /></button>
                    {hijriOffset !== 0 && (
                      <button onClick={handleResetOffset} className="ml-1 text-[9px] text-muted-foreground hover:text-foreground">
                        reset
                      </button>
                    )}
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
                  <div className="text-[9px] font-medium text-[#7c3aed]/75 leading-tight pl-[2px]">
                    Today (no offset): {todayHijriLoading ? 'Loading…' : (todayHijriBase || 'Unavailable')}
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      className={`gap-2 ${offsetDirty && hijriCalendar.size > 0 ? 'ring-2 ring-amber-400 ring-offset-1 shadow-md' : ''}`}
                      disabled={populatingHijri || populatingAllMonths || populatingMissing || !!schemaError}
                      title={schemaError ? 'Fix DB schema first' : `Fill Hijri dates using offset ${offsetLabel}`}
                    >
                      {(populatingHijri || populatingAllMonths || populatingMissing) ? <Loader2 size={14} className="animate-spin" /> : <Moon size={14} />}
                      Fill Hijri ({offsetLabel})
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuLabel>Fill Hijri</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handlePopulateHijriDates}
                      disabled={populatingHijri || populatingAllMonths || !data || data.length === 0 || !!schemaError}
                    >
                      <Moon size={14} className="mr-2" /> Fill Month ({MONTHS_FULL[selectedMonth - 1]})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handlePopulateAllMonths}
                      disabled={populatingAllMonths || populatingHijri || populatingMissing || !!schemaError}
                    >
                      <Moon size={14} className="mr-2" /> Fill Full Year {selectedYear}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleFillMissingOnly}
                      disabled={populatingMissing || populatingAllMonths || populatingHijri || !!schemaError}
                    >
                      <Zap size={14} className="mr-2" /> {populatingMissing ? 'Filling Missing…' : 'Fill Missing Days'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleExportHijriCsv}
                      disabled={exportingCsv || populatingAllMonths || populatingHijri}
                    >
                      {exportingCsv ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Download size={14} className="mr-2" />} Export Hijri CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Button variant="outline" size="sm" onClick={() => setCsvModal(true)} className="gap-2">
                <Upload size={14} /> Import
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <MoreHorizontal size={14} /> Advanced
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Advanced Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setJumuahModal(true)}>
                    <CalendarCheck size={14} className="mr-2" /> Set Jumu'ah
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEidModal(true)}>
                    <Star size={14} className="mr-2" /> Eid Times
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw size={14} className={`mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh Data
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <SlidersHorizontal size={14} /> View Options
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Display</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={showLegend}
                    onCheckedChange={(checked) => setShowLegend(checked === true)}
                  >
                    Show Legend
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={showSolarCard}
                    onCheckedChange={(checked) => setShowSolarCard(checked === true)}
                  >
                    Show Today's Solar Times
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={showPreviewHint}
                    onCheckedChange={(checked) => setShowPreviewHint(checked === true)}
                  >
                    Show Preview Banner
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Offset-changed warning */}
              {offsetDirty && hijriCalendar.size > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 animate-pulse">
                  <span className="text-[11px]">⚠️</span>
                  <span className="text-[10px] font-semibold">Offset changed — click <strong>Fill Month</strong> or <strong>Fill All {selectedYear}</strong> to apply new offset to DB</span>
                </div>
              )}

            </div>
          </div>

          {/* Month/year navigation */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest shrink-0">Navigate</span>
            <button
              onClick={goToPrevMonth}
              className="h-8 px-2.5 flex items-center justify-center rounded-lg border border-[hsl(140_20%_88%)] hover:bg-[hsl(140_30%_97%)] transition-colors text-xs font-semibold"
            >
              <ChevronLeft size={14} className="mr-1" /> Prev Month
            </button>

            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest shrink-0">Year</span>
            <button
              onClick={() => setSelectedYear((y) => y - 1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-[hsl(140_20%_88%)] hover:bg-[hsl(140_30%_97%)] transition-colors"
            ><ChevronLeft size={13} /></button>
            <input
              type="number"
              value={yearInput !== '' ? yearInput : selectedYear}
              onChange={(e) => setYearInput(e.target.value)}
              onBlur={() => {
                const n = parseInt(yearInput, 10);
                if (!isNaN(n) && n > 0) setSelectedYear(n);
                setYearInput('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const n = parseInt(yearInput, 10);
                  if (!isNaN(n) && n > 0) setSelectedYear(n);
                  setYearInput('');
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-20 text-center text-sm font-bold tabular-nums border border-[hsl(140_20%_88%)] rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-[hsl(142_60%_45%)] transition-all"
              style={{ color: selectedYear === CURRENT_YEAR ? 'hsl(142 60% 32%)' : 'hsl(150 30% 12%)' }}
            />
            {selectedYear === CURRENT_YEAR && (
              <span className="text-[10px] font-bold text-[hsl(142_60%_35%)] bg-[hsl(142_50%_93%)] px-1.5 py-0.5 rounded-full">Current</span>
            )}
            <button
              onClick={() => setSelectedYear((y) => y + 1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-[hsl(140_20%_88%)] hover:bg-[hsl(140_30%_97%)] transition-colors"
            ><ChevronRight size={13} /></button>
            {selectedYear !== CURRENT_YEAR && (
              <button
                onClick={() => setSelectedYear(CURRENT_YEAR)}
                className="text-[10px] font-medium px-2 py-1 rounded-lg border border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)] transition-colors"
              >Today's year</button>
            )}

            <button
              onClick={goToNextMonth}
              className="h-8 px-2.5 flex items-center justify-center rounded-lg border border-[hsl(140_20%_88%)] hover:bg-[hsl(140_30%_97%)] transition-colors text-xs font-semibold"
            >
              Next Month <ChevronRight size={14} className="ml-1" />
            </button>

            {hasPendingPreview && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved Hijri preview changes
              </span>
            )}
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
        {showLegend && (
          <div className="px-4 sm:px-8 py-2.5 bg-[hsl(140_30%_97%)] border-b border-[hsl(140_20%_88%)] flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-[#fef9ec] border border-amber-200" />Friday</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-[#eff6ff] border border-blue-200" />Today</span>
          <span className="flex items-center gap-1.5"><span className="inline-block px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[9px]">BST</span>Summer Time</span>
          <span className="flex items-center gap-1.5"><span className="inline-block px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[9px]">GMT</span>Winter Time</span>
          {hijriCalendar.size > 0 && (
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-[hsl(270_50%_95%)] border border-[hsl(270_50%_75%)]" /><span className="text-[#7c3aed]">Hijri from DB</span></span>
          )}
          </div>
        )}

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
              {/* Preview banner — auto-shown on offset change */}
              {(previewHijri.size > 0 || previewLoading) && showPreviewHint && (
                <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl border border-[#7c3aed]/25 bg-[hsl(270_30%_98%)]">
                  {previewLoading
                    ? <Loader2 size={13} className="animate-spin text-[#7c3aed] shrink-0" />
                    : <span className="text-sm shrink-0">👁</span>}
                  <span className="text-xs font-semibold text-[#7c3aed]">
                    {previewLoading
                      ? `Auto-previewing offset ${hijriOffset > 0 ? '+' : ''}${hijriOffset}…`
                      : `DB → Preview active for ${previewHijri.size} day(s) · ${previewDiffCount} day(s) will change`}
                  </span>
                  {!previewLoading && (
                    <button onClick={clearPreview} className="ml-auto text-[10px] font-medium text-[#7c3aed]/60 hover:text-[#7c3aed] transition-colors">✕ Clear</button>
                  )}
                </div>
              )}

              <PrayerTimesTable
                data={visibleData}
                year={selectedYear}
                hijriOffset={hijriOffset}
                hijriCalendar={hijriCalendar}
                previewHijri={previewHijri}
                pendingChanges={pendingPrayerChanges}
                eidPrayers={eidPrayers}
                onEdit={setEditingRow}
                highlightDay={highlightDay}
              />

              {showSolarCard && selectedYear === CURRENT_YEAR && selectedMonth === CURRENT_MONTH && (() => {
                const today = new Date().getDate();
                const todayRow = visibleData.find((r) => r.day === today);
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

        {hasPendingPreview && (
          <div className="sticky bottom-0 z-30 border-t border-amber-300 bg-amber-50/95 backdrop-blur px-4 sm:px-8 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold text-amber-800">
                You have preview-only Hijri changes for {previewDiffCount} day(s). Apply to save these dates to the database.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={clearPreview}>Discard Preview</Button>
                <Button
                  size="sm"
                  onClick={handlePopulateHijriDates}
                  disabled={populatingHijri || !!schemaError}
                  className="gap-2"
                >
                  {populatingHijri ? <Loader2 size={14} className="animate-spin" /> : <Moon size={14} />}
                  {populatingHijri ? 'Applying Hijri…' : `Apply Hijri (${offsetLabel})`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {pendingPrayerRowsCount > 0 && (
          <div className="sticky bottom-0 z-40 border-t border-amber-300 bg-amber-50/95 backdrop-blur px-4 sm:px-8 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold text-amber-800">
                {pendingPrayerCellCount} changes pending across {pendingPrayerRowsCount} day(s).
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleDiscardPendingPrayerChanges} disabled={savingPendingPrayerChanges}>
                  Discard
                </Button>
                <Button size="sm" onClick={handleSavePendingPrayerChanges} disabled={savingPendingPrayerChanges} className="gap-2">
                  {savingPendingPrayerChanges ? <Loader2 size={14} className="animate-spin" /> : null}
                  {savingPendingPrayerChanges ? 'Saving Changes…' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      <JumuahYearModal open={jumuahModal} onClose={() => setJumuahModal(false)} year={selectedYear} queryClient={queryClient} />
      <EditPrayerTimeModal
        row={editingRow}
        year={selectedYear}
        hijriEntry={editingRow ? (hijriCalendar.get(editingRow.day) ?? null) : null}
        deferSave
        onClose={() => setEditingRow(null)}
        onSaved={handleSaved}
        onHijriSaved={handleHijriSaved}
      />
      <EidTimesModal
        open={eidModal}
        onClose={() => setEidModal(false)}
        onSaved={() => fetchEidPrayers().then(setEidPrayers)}
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

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import PrayerTimesTable from '@/components/features/PrayerTimesTable';
import EditPrayerTimeModal from '@/components/features/EditPrayerTimeModal';
import CsvImportModal from '@/components/features/CsvImportModal';
import { fetchPrayerTimes, bulkUpdatePrayerTimes } from '@/lib/api';
import { PrayerTime } from '@/types';
import { toast } from 'sonner';
import {
  Loader2, AlertCircle, RefreshCw,
  ChevronLeft, ChevronRight, Minus, Plus, CalendarCheck, Upload, Search, CalendarDays,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { isBST } from '@/lib/dateUtils';
import { supabaseAdmin } from '@/lib/supabase';
import { SolarTimesCard } from '@/pages/Dashboard';

async function saveOffsetToDb(n: number) {
  try {
    const { error } = await supabaseAdmin
      .from('masjid_settings')
      .upsert(
        {
          key:      'hijri_offset',
          value:    String(n),
          label:    'Hijri Date Offset',
          category: 'preferences',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
    if (error) console.error('[HijriOffset] DB save failed:', error.message);
    else console.log('[HijriOffset] Saved to DB:', n);
  } catch (e) {
    console.error('[HijriOffset] DB save error:', e);
  }
}
async function loadOffsetFromDb(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin
      .from('masjid_settings')
      .select('value')
      .eq('key', 'hijri_offset')
      .maybeSingle();
    if (!error && data?.value !== null && data?.value !== undefined) {
      const n = parseInt(data.value, 10);
      if (!isNaN(n)) return n;
    }
  } catch { /* ignore */ }
  return 0;
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
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

const PrayerTimes = () => {
  const [selectedYear,  setSelectedYear]  = useState(CURRENT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [editingRow,    setEditingRow]    = useState<PrayerTime | null>(null);
  const [jumuahModal,   setJumuahModal]   = useState(false);
  const [csvModal,      setCsvModal]      = useState(false);
  const [csvPreload,    setCsvPreload]    = useState<string | undefined>(undefined);
  const [hijriOffset,   setHijriOffset]   = useState<number>(0);
  const [jumpInput,     setJumpInput]     = useState('');
  const [highlightDay,  setHighlightDay]  = useState<number | null>(null);
  const [searchParams, setSearchParams]   = useSearchParams();

  useEffect(() => {
    if (searchParams.get('import') === '1') {
      const stored = sessionStorage.getItem('csv_import_payload');
      if (stored) { setCsvPreload(stored); sessionStorage.removeItem('csv_import_payload'); setCsvModal(true); }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const changeOffset = (delta: number) => { setHijriOffset((prev) => { const next = Math.max(-30, Math.min(30, prev + delta)); saveOffsetToDb(next); return next; }); };

  // Load hijri offset from DB on mount
  useEffect(() => {
    loadOffsetFromDb().then((n) => setHijriOffset(n));
  }, []);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['prayer_times', selectedMonth],
    queryFn: () => fetchPrayerTimes(selectedMonth),
    staleTime: 30_000,
  });

  const handleSaved = useCallback((updated: PrayerTime) => {
    queryClient.setQueryData<PrayerTime[]>(['prayer_times', selectedMonth], (old) => old ? old.map((r) => (r.id === updated.id ? updated : r)) : old);
    setEditingRow(null);
  }, [queryClient, selectedMonth]);

  const handleJumpToDay = () => {
    const day = parseInt(jumpInput.trim(), 10);
    if (isNaN(day) || day < 1 || day > 31) { setHighlightDay(null); return; }
    setHighlightDay(day);
    setTimeout(() => { const el = document.querySelector(`[data-day="${day}"]`) as HTMLElement | null; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
    setTimeout(() => setHighlightDay(null), 3000);
  };

  const handleCsvImported = useCallback((updatedByMonth: Map<number, PrayerTime[]>) => {
    // The returned rows are already freshly fetched from DB inside
    // bulkUpdatePrayerTimesFromCsv. Write them directly into cache.
    updatedByMonth.forEach((rows, m) => {
      if (rows.length > 0) {
        const sorted = [...rows].sort((a, b) => a.day - b.day);
        queryClient.setQueryData<PrayerTime[]>(['prayer_times', m], sorted);
      }
    });
    // Close modal first so the table re-renders with updated cache immediately
    setCsvModal(false);
    // Then invalidate all affected months so next navigation triggers a re-fetch
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
                {hijriOffset !== 0 && <button onClick={() => { setHijriOffset(0); saveOffsetToDb(0); }} className="ml-1 text-[9px] text-muted-foreground hover:text-foreground">reset</button>}
              </div>

              {/* Jump to day */}
              <div className="flex items-center gap-1 border border-[hsl(140_20%_88%)] rounded-lg px-2 py-1.5 bg-[hsl(140_30%_97%)]">
                <Search size={12} className="text-muted-foreground shrink-0" />
                <input type="number" min={1} max={31} value={jumpInput} onChange={(e) => setJumpInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleJumpToDay(); }}
                  placeholder="Day" className="w-12 bg-transparent text-xs font-mono outline-none text-foreground placeholder:text-muted-foreground/60" />
                <button onClick={handleJumpToDay} className="text-[10px] font-semibold text-[hsl(142_60%_35%)] hover:underline">Go</button>
              </div>

              <Button variant="outline" size="sm" onClick={() => setCsvModal(true)} className="gap-2 border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)]">
                <Upload size={14} /> Import CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => setJumuahModal(true)} className="gap-2 border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)]">
                <CalendarCheck size={14} /> Set Jumu'ah
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
        </div>

        {/* Content */}
        <div className="px-2 sm:px-6 py-4 flex-1 overflow-x-auto">
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
              <PrayerTimesTable data={data} year={selectedYear} hijriOffset={hijriOffset} onEdit={setEditingRow} highlightDay={highlightDay} />

              {/* Solar Times card — shows today's values when viewing the current month */}
              {selectedYear === CURRENT_YEAR && selectedMonth === CURRENT_MONTH && (() => {
                const today = new Date().getDate();
                const todayRow = data.find(r => r.day === today);
                if (!todayRow) return null;
                return (
                  <div className="mt-4 max-w-2xl">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
                      Today’s Solar Times
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
      <EditPrayerTimeModal row={editingRow} onClose={() => setEditingRow(null)} onSaved={handleSaved} />
      <CsvImportModal open={csvModal} onClose={() => { setCsvModal(false); setCsvPreload(undefined); }}
        month={selectedMonth} monthName={MONTHS_FULL[selectedMonth - 1]} year={selectedYear}
        onImported={handleCsvImported} preloadedCsv={csvPreload} />
    </div>
  );
};

export default PrayerTimes;

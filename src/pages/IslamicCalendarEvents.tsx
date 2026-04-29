import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Pencil, Trash2, Search, CalendarDays, Loader2, AlertTriangle, Upload, ExternalLink, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Badge } from '#/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog';
import { Textarea } from '#/components/ui/textarea';
import Sidebar from '#/components/layout/Sidebar';
import IslamicCalendarEventModal from '#/components/features/IslamicCalendarEventModal';
import { fetchIslamicCalendarEvents, deleteIslamicCalendarEvent, upsertIslamicCalendarEvents, fetchAnnouncements } from '#/lib/api';
import type { IslamicCalendarEvent, IslamicCalendarEventType, Announcement } from '#/types';
import { toast } from 'sonner';

// ─── Constants ────────────────────────────────────────────────────────────────

const HIJRI_MONTH_NAMES = [
  '', 'Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani',
  'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', "Sha'ban",
  'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah',
];

const TYPE_LABELS: Record<IslamicCalendarEventType, string> = {
  important_date: 'Important Date',
  masjid_event: 'Masjid Event',
};

const TYPE_COLORS: Record<IslamicCalendarEventType, string> = {
  important_date: 'bg-amber-50 text-amber-700 border-amber-200',
  masjid_event: 'bg-blue-50 text-blue-700 border-blue-200',
};

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ─── Hijri parsing (for seed import) ─────────────────────────────────────────

const HIJRI_MONTH_ALIAS_TO_INDEX: Record<string, number> = {
  muharram:1,muharam:1,moharram:1,safar:2,rabialawwal:3,rabialthani:4,rabiulawwal:3,rabiulthani:4,
  rabialakhir:4,rabiulakhir:4,jumadaalawwal:5,jumadaalula:5,jumadaula:5,jumadaalulaa:5,
  jumadaalthani:6,jumadaalthania:6,jumadaalakhira:6,jumadaalakhirah:6,jumadaakhira:6,jumadaakhirah:6,
  rajab:7,shaban:8,shaaban:8,ramadan:9,shawwal:10,dhualqidah:11,dhulqidah:11,dhualqadah:11,
  dhulqadah:11,dhulqaadah:11,dhualqaadah:11,dhualhijjah:12,dhulhijjah:12,
};

type HijriParts = { day: number; month: number; year: number };

function normalizeHijriMonthKey(raw: string): string {
  return raw.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
}

function parseHijriDate(raw: string): HijriParts | null {
  const trimmed = (raw ?? '').trim();
  const m = trimmed.match(/(\d{1,2})\s+([A-Za-z'\u0600-\u06FF\u00C0-\u024F\s]+?)\s+(\d{3,4})\s*(?:A\.?H\.?|B\.?H\.?)/i);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = HIJRI_MONTH_ALIAS_TO_INDEX[normalizeHijriMonthKey(m[2])];
    const year = parseInt(m[3], 10);
    if (month && day >= 1 && day <= 30 && year > 0) return { day, month, year };
  }
  return null;
}

type IslamicSeedRow = {
  title: string; fieldLabel: string; region: string; notes: string;
  hijriDay: number; hijriMonth: number; originalHijriYear: number;
};

function parseIslamicSeedText(raw: string): { rows: IslamicSeedRow[]; skipped: number } {
  const rows: IslamicSeedRow[] = [];
  let skipped = 0;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('=') || trimmed.startsWith('-') || trimmed.endsWith(':')) continue;
    if (!trimmed.includes('|')) continue;
    const parts = trimmed.split('|').map((p) => p.trim());
    if (parts.length < 5) { skipped += 1; continue; }
    const [title, fieldLabel, hijriRaw, region, ...notesParts] = parts;
    if (/^name$/i.test(title) && /^field$/i.test(fieldLabel) && /full\s*hijri\s*date/i.test(hijriRaw)) continue;
    if (!title || !fieldLabel || !hijriRaw) { skipped += 1; continue; }
    if (!/\b(?:A\.?\s*H\.?|B\.?\s*H\.?)\b/i.test(hijriRaw)) { skipped += 1; continue; }
    const parsed = parseHijriDate(hijriRaw);
    if (!parsed) { skipped += 1; continue; }
    rows.push({ title, fieldLabel, region, notes: notesParts.join('|').trim(),
      hijriDay: parsed.day, hijriMonth: parsed.month, originalHijriYear: parsed.year });
  }
  return { rows, skipped };
}

// ─── Announcement event filter ────────────────────────────────────────────────

function isEventLikeType(value: string | null | undefined): boolean {
  const n = (value ?? '').trim().toLowerCase();
  if (!n) return false;
  if (n.includes('event')) return true;
  return ['jalsa','class','special','ramadan','eid','jumuah',"jumu'ah",'lecture','workshop','community','youth','funeral','nikah'].includes(n);
}

function eventFallsInMonth(ann: Announcement, year: number, month: number): boolean {
  if (ann.recurrence_type === 'weekly' || ann.recurrence_type === 'monthly') return true;
  if (ann.event_date) {
    const d = new Date(ann.event_date);
    if (!isNaN(d.getTime()) && d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month) return true;
  }
  return false;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const IslamicCalendarEvents = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<IslamicCalendarEventType | 'all'>('all');
  const [monthFilter, setMonthFilter] = useState<number>(0); // 0 = all
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IslamicCalendarEvent | null>(null);
  const [deleting, setDeleting] = useState<IslamicCalendarEvent | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Seed import
  const [seedImportOpen, setSeedImportOpen] = useState(false);
  const [seedText, setSeedText] = useState('');
  const [seedParsed, setSeedParsed] = useState<{ rows: IslamicSeedRow[]; skipped: number } | null>(null);
  const [seedImporting, setSeedImporting] = useState(false);

  // Masjid events view
  const now = new Date();
  const [masjidYear, setMasjidYear] = useState(now.getFullYear());
  const [masjidMonth, setMasjidMonth] = useState(now.getMonth() + 1);

  const { data: events = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['islamic-calendar-events'],
    queryFn: () => fetchIslamicCalendarEvents(),
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements'],
    queryFn: fetchAnnouncements,
    staleTime: 5 * 60 * 1000,
  });

  const masjidEvents = useMemo(() => {
    return announcements
      .filter((a) => a.is_active && isEventLikeType(a.type))
      .filter((a) => eventFallsInMonth(a, masjidYear, masjidMonth))
      .sort((a, b) => {
        const da = a.event_date ? new Date(a.event_date).getTime() : 0;
        const db = b.event_date ? new Date(b.event_date).getTime() : 0;
        return da - db;
      });
  }, [announcements, masjidYear, masjidMonth]);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = events;
    if (typeFilter !== 'all') list = list.filter((e) => e.event_type === typeFilter);
    if (monthFilter > 0) list = list.filter((e) => e.linked_hijri_month === monthFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.notes ?? '').toLowerCase().includes(q) ||
          (e.source_name ?? '').toLowerCase().includes(q) ||
          (e.field_label ?? '').toLowerCase().includes(q) ||
          (e.linked_hijri_label ?? '').toLowerCase().includes(q),
      );
    }
    // Sort by Hijri month then day
    return [...list].sort((a, b) => {
      if (a.linked_hijri_month !== b.linked_hijri_month) return a.linked_hijri_month - b.linked_hijri_month;
      return a.linked_hijri_day - b.linked_hijri_day;
    });
  }, [events, typeFilter, monthFilter, search]);

  // ── Grouped by Hijri month ─────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<number, IslamicCalendarEvent[]>();
    filtered.forEach((e) => {
      const bucket = map.get(e.linked_hijri_month) ?? [];
      bucket.push(e);
      map.set(e.linked_hijri_month, bucket);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [filtered]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleSaved = (saved: IslamicCalendarEvent) => {
    queryClient.invalidateQueries({ queryKey: ['islamic-calendar-events'] });
    setModalOpen(false);
    setEditing(null);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return;
    const row = events.find((e) => e.id === confirmDeleteId);
    setDeleting(row ?? null);
    try {
      await deleteIslamicCalendarEvent(confirmDeleteId);
      toast.success('Event deleted.');
      queryClient.invalidateQueries({ queryKey: ['islamic-calendar-events'] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete event.');
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  };

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (e: IslamicCalendarEvent) => { setEditing(e); setModalOpen(true); };

  const handleParseSeed = useCallback(() => {
    if (!seedText.trim()) return;
    setSeedParsed(parseIslamicSeedText(seedText));
  }, [seedText]);

  const handleConfirmSeedImport = async () => {
    if (!seedParsed || seedParsed.rows.length === 0) return;
    setSeedImporting(true);
    try {
      const payload = seedParsed.rows.map((row) => ({
        title: row.title,
        event_type: 'important_date' as IslamicCalendarEventType,
        field_label: row.fieldLabel || null,
        region: row.region || null,
        notes: row.notes || null,
        source_name: 'Seed Import',
        linked_hijri_day: row.hijriDay,
        linked_hijri_month: row.hijriMonth,
        linked_hijri_year: null,
        linked_hijri_label: `${row.hijriDay} ${HIJRI_MONTH_NAMES[row.hijriMonth] ?? ''}`,
        linked_gregorian_date: null,
        original_hijri_year: row.originalHijriYear,
        auto_delete_grace_days: 0,
        created_by: null,
      }));
      const imported = await upsertIslamicCalendarEvents(payload);
      toast.success(`Imported ${imported.length} event${imported.length !== 1 ? 's' : ''}.`);
      queryClient.invalidateQueries({ queryKey: ['islamic-calendar-events'] });
      setSeedImportOpen(false);
      setSeedText('');
      setSeedParsed(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setSeedImporting(false);
    }
  };

  const prevMasjidMonth = () => {
    if (masjidMonth === 1) { setMasjidMonth(12); setMasjidYear((y) => y - 1); }
    else setMasjidMonth((m) => m - 1);
  };
  const nextMasjidMonth = () => {
    if (masjidMonth === 12) { setMasjidMonth(1); setMasjidYear((y) => y + 1); }
    else setMasjidMonth((m) => m + 1);
  };

  // ── Month filter options (only months that have data) ─────────────────────
  const availableMonths = useMemo(() => {
    const monthSet = new Set(events.map((e) => e.linked_hijri_month));
    return Array.from(monthSet).sort((a, b) => a - b);
  }, [events]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 pt-14 md:pt-0 px-4 sm:px-8 py-4 sm:py-6 space-y-5 overflow-x-hidden">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-[hsl(142_60%_35%)]" />
              Islamic Calendar Events
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dates are stored by Hijri day &amp; month — automatically remapped each year via the Hijri calendar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setSeedText(''); setSeedParsed(null); setSeedImportOpen(true); }}
              className="gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Seed
            </Button>
            <Button
              size="sm"
              onClick={openAdd}
              className="bg-[hsl(142_60%_35%)] hover:bg-[hsl(142_60%_28%)] text-white gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Event
            </Button>
          </div>
        </div>

        {/* ── Stats strip ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg border border-border bg-white px-4 py-2.5 text-center min-w-[80px]">
            <p className="text-lg font-bold text-[hsl(150_30%_18%)]">{events.length}</p>
            <p className="text-[11px] text-muted-foreground">Total</p>
          </div>
          <div className="rounded-lg border border-border bg-white px-4 py-2.5 text-center min-w-[80px]">
            <p className="text-lg font-bold text-[hsl(150_30%_18%)]">
              {events.filter((e) => e.event_type === 'important_date').length}
            </p>
            <p className="text-[11px] text-muted-foreground">Important Dates</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700 flex items-center gap-1.5 max-w-xs">
            <span className="font-semibold">Masjid Events</span> (Jummah, programmes) are managed on the
            <a href="/announcements" className="underline font-semibold">Announcements</a> page.
          </div>
        </div>

        {/* ── Filters ───────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events…"
              className="pl-8 h-8 text-xs"
            />
          </div>

          {/* Type filter - important_date only; masjid_event entries are read-only legacy */}
          <div className="flex gap-1">
            {(['all', 'important_date'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t as IslamicCalendarEventType | 'all')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  typeFilter === t
                    ? 'bg-[hsl(142_60%_35%)] text-white border-[hsl(142_60%_35%)]'
                    : 'bg-white text-muted-foreground border-border hover:border-[hsl(142_60%_35%)]'
                }`}
              >
                {t === 'all' ? 'All' : 'Important Dates'}
              </button>
            ))}
          </div>

          {/* Month filter */}
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value={0}>All months</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>{m}. {HIJRI_MONTH_NAMES[m]}</option>
            ))}
          </select>

          {(search || typeFilter !== 'all' || monthFilter > 0) && (
            <button
              onClick={() => { setSearch(''); setTypeFilter('all'); setMonthFilter(0); }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* ── Content ───────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[hsl(142_60%_35%)]" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <AlertTriangle className="w-6 h-6 text-red-400" />
            <p className="text-sm">Failed to load events. <button onClick={() => refetch()} className="underline">Retry</button></p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <CalendarDays className="w-10 h-10 opacity-20" />
            <p className="text-sm">{search || typeFilter !== 'all' || monthFilter > 0 ? 'No events match your filters.' : 'No events yet. Add the first one.'}</p>
            {!search && typeFilter === 'all' && monthFilter === 0 && (
              <Button size="sm" onClick={openAdd} className="bg-[hsl(142_60%_35%)] text-white hover:bg-[hsl(142_60%_28%)]">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Event
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([monthNum, monthEvents]) => (
              <div key={monthNum}>
                {/* Month heading */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-[hsl(142_60%_35%)] uppercase tracking-wide">
                    {monthNum}. {HIJRI_MONTH_NAMES[monthNum]}
                  </span>
                  <span className="text-[11px] text-muted-foreground">({monthEvents.length})</span>
                  <div className="flex-1 border-t border-border" />
                </div>

                {/* Event rows */}
                <div className="rounded-xl border border-border bg-white overflow-hidden divide-y divide-border">
                  {monthEvents.map((ev) => (
                    <div key={ev.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group">
                      {/* Hijri day badge */}
                      <div className="w-9 h-9 rounded-lg bg-[hsl(142_60%_95%)] border border-[hsl(142_60%_80%)] flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-[hsl(142_60%_35%)]">{ev.linked_hijri_day}</span>
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-[hsl(150_30%_18%)] truncate">{ev.title}</span>
                          {ev.field_label && (
                            <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {ev.field_label}
                            </span>
                          )}
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${TYPE_COLORS[ev.event_type]}`}>
                            {TYPE_LABELS[ev.event_type]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-muted-foreground">{ev.linked_hijri_label ?? `${ev.linked_hijri_day} ${HIJRI_MONTH_NAMES[ev.linked_hijri_month]}`}</span>
                          <span className="text-[11px] text-muted-foreground">→ {ev.linked_gregorian_date ?? 'dynamic by month'}</span>
                          {ev.region && (
                            <span className="text-[11px] text-muted-foreground italic">{ev.region}</span>
                          )}
                          {ev.source_name && (
                            <span className="text-[11px] text-muted-foreground">· {ev.source_name}</span>
                          )}
                        </div>
                        {ev.notes && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{ev.notes}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => openEdit(ev)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(ev.id)}
                          className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Masjid Events (read-only reference) ─────────────────────────── */}
        <div className="border-t border-border pt-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4 text-blue-500" />
                Masjid Events
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Read-only view. Managed on the{' '}
                <a href="/announcements" className="underline text-[hsl(142_60%_35%)] hover:text-[hsl(142_60%_28%)]">Announcements</a> page.
              </p>
            </div>
            {/* Month/year navigator */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1">
              <button onClick={prevMasjidMonth} className="p-1 rounded hover:bg-muted transition-colors"><ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" /></button>
              <span className="text-xs font-semibold text-foreground min-w-[110px] text-center">{MONTHS_FULL[masjidMonth - 1]} {masjidYear}</span>
              <button onClick={nextMasjidMonth} className="p-1 rounded hover:bg-muted transition-colors"><ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /></button>
            </div>
          </div>

          {masjidEvents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center">
              <p className="text-xs text-muted-foreground">No events for {MONTHS_FULL[masjidMonth - 1]} {masjidYear}.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-white overflow-hidden divide-y divide-border">
              {masjidEvents.map((ann) => (
                <div key={ann.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{ann.title}</span>
                      {ann.type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">{ann.type}</span>}
                      {(ann.recurrence_type === 'weekly' || ann.recurrence_type === 'monthly') && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border capitalize">{ann.recurrence_type}</span>
                      )}
                    </div>
                    {ann.event_date && <p className="text-[11px] text-muted-foreground">{new Date(ann.event_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})}</p>}
                    {ann.start_time && <p className="text-[11px] text-muted-foreground">{ann.start_time}</p>}
                  </div>
                  <ExternalLink className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-1" />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Add / Edit modal ─────────────────────────────────────────────────── */}
      <IslamicCalendarEventModal
        open={modalOpen}
        event={editing}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSaved={handleSaved}
      />

      {/* ── Delete confirmation ───────────────────────────────────────────────── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl border border-border shadow-lg p-6 w-full max-w-sm mx-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">Delete event?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  "{events.find((e) => e.id === confirmDeleteId)?.title}" will be permanently removed.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)} disabled={!!deleting}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={!!deleting}
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Seed Import dialog ───────────────────────────────────────────────── */}
      <Dialog open={seedImportOpen} onOpenChange={(v) => { if (!seedImporting) { setSeedImportOpen(v); if (!v) { setSeedParsed(null); setSeedText(''); } } }}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-[hsl(142_60%_35%)]" />
              Import from Seed Text
            </DialogTitle>
            <p className="text-xs text-muted-foreground pt-0.5">
              Paste pipe-delimited seed rows: <code className="bg-muted px-1 rounded text-[10px]">Name | Field | 15 Muharram 1447 AH | Region | Notes</code>
            </p>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-1">
            <Textarea
              value={seedText}
              onChange={(e) => { setSeedText(e.target.value); setSeedParsed(null); }}
              placeholder="Paste seed text here…"
              className="font-mono text-xs h-40 resize-none"
            />

            {seedParsed && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{seedParsed.rows.length} row{seedParsed.rows.length !== 1 ? 's' : ''} parsed</span>
                  {seedParsed.skipped > 0 && <span className="text-xs text-amber-600">{seedParsed.skipped} skipped</span>}
                </div>
                <div className="rounded-lg border border-border bg-muted/20 divide-y divide-border max-h-52 overflow-y-auto">
                  {seedParsed.rows.map((row, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2">
                      <div className="w-7 h-7 rounded bg-[hsl(142_60%_95%)] border border-[hsl(142_60%_80%)] flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-[hsl(142_60%_35%)]">{row.hijriDay}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{row.title}</p>
                        <p className="text-[10px] text-muted-foreground">{HIJRI_MONTH_NAMES[row.hijriMonth]} · {row.fieldLabel}{row.region ? ` · ${row.region}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-1 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setSeedImportOpen(false)} disabled={seedImporting}>Cancel</Button>
            {!seedParsed ? (
              <Button size="sm" onClick={handleParseSeed} disabled={!seedText.trim()} className="gap-1.5 bg-[hsl(142_60%_35%)] hover:bg-[hsl(142_60%_28%)] text-white">
                <FileText className="w-3.5 h-3.5" />
                Parse
              </Button>
            ) : (
              <Button size="sm" onClick={handleConfirmSeedImport} disabled={seedImporting || seedParsed.rows.length === 0} className="gap-1.5 bg-[hsl(142_60%_35%)] hover:bg-[hsl(142_60%_28%)] text-white">
                {seedImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {seedImporting ? 'Importing…' : `Import ${seedParsed.rows.length} event${seedParsed.rows.length !== 1 ? 's' : ''}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default IslamicCalendarEvents;

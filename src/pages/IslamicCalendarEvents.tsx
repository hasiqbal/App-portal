import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Pencil, Trash2, Search, CalendarDays, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Badge } from '#/components/ui/badge';
import Sidebar from '#/components/layout/Sidebar';
import IslamicCalendarEventModal from '#/components/features/IslamicCalendarEventModal';
import { fetchIslamicCalendarEvents, deleteIslamicCalendarEvent } from '#/lib/api';
import type { IslamicCalendarEvent, IslamicCalendarEventType } from '#/types';
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

  const { data: events = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['islamic-calendar-events'],
    queryFn: () => fetchIslamicCalendarEvents(),
  });

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
          e.linked_hijri_label.toLowerCase().includes(q),
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

  // ── Month filter options (only months that have data) ─────────────────────
  const availableMonths = useMemo(() => {
    const monthSet = new Set(events.map((e) => e.linked_hijri_month));
    return Array.from(monthSet).sort((a, b) => a - b);
  }, [events]);

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />
      <main className="flex-1 min-w-0 p-6 space-y-5">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[hsl(150_30%_18%)] flex items-center gap-2">
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
          <div className="relative w-56">
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
                          <span className="text-[11px] text-muted-foreground">{ev.linked_hijri_label}</span>
                          <span className="text-[11px] text-muted-foreground">→ {ev.linked_gregorian_date}</span>
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
          <div className="bg-white rounded-xl border border-border shadow-lg p-6 w-full max-w-sm space-y-4">
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
    </div>
  );
};

export default IslamicCalendarEvents;

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  FileText,
  Globe2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import Sidebar from '#/components/layout/Sidebar';
import DhikrModal from '#/components/features/DhikrModal';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { deleteDhikr, fetchAdhkar, updateDhikr } from '#/lib/api';
import type { AdhkarContentType, Dhikr } from '#/types';
import { toast } from 'sonner';

type FilterMode = 'all' | 'qaseedah' | 'naat';

const SUPPORTED_TYPES: AdhkarContentType[] = ['qaseedah', 'naat'];
const QUERY_KEY = ['qaseedah-naat-entries'];

function typeLabel(type: AdhkarContentType | null | undefined): string {
  if (type === 'qaseedah') return 'Qaseedah';
  if (type === 'naat') return 'Naat';
  return 'Entry';
}

function sortEntries(rows: Dhikr[]): Dhikr[] {
  return [...rows].sort((a, b) => {
    const typeA = a.content_type ?? '';
    const typeB = b.content_type ?? '';
    const typeSort = typeA.localeCompare(typeB);
    if (typeSort !== 0) return typeSort;

    const groupSort = (a.group_name ?? '').localeCompare(b.group_name ?? '');
    if (groupSort !== 0) return groupSort;

    return (a.display_order ?? 9999) - (b.display_order ?? 9999);
  });
}

function isPdf(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.pdf([?#].*)?$/i.test(url);
}

export default function QaseedahNaats() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState<Dhikr | null>(null);
  const [createType, setCreateType] = useState<AdhkarContentType>('qaseedah');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const {
    data: entries = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery<Dhikr[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const rows = await fetchAdhkar(undefined, { contentTypes: SUPPORTED_TYPES });
      return sortEntries(rows);
    },
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return entries.filter((row) => {
      if (!SUPPORTED_TYPES.includes((row.content_type ?? 'adhkar') as AdhkarContentType)) {
        return false;
      }

      if (filterMode !== 'all' && row.content_type !== filterMode) {
        return false;
      }

      if (!needle) return true;

      const haystack = [
        row.title,
        row.arabic_title,
        row.group_name,
        row.translation,
        row.urdu_translation,
        row.reference,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [entries, filterMode, search]);

  const qaseedahCount = entries.filter((row) => row.content_type === 'qaseedah').length;
  const naatCount = entries.filter((row) => row.content_type === 'naat').length;

  const closeModal = () => {
    setModalOpen(false);
    setEditRow(null);
  };

  const openCreate = (type: AdhkarContentType) => {
    setCreateType(type);
    setEditRow(null);
    setModalOpen(true);
  };

  const openEdit = (row: Dhikr) => {
    setEditRow(row);
    setCreateType((row.content_type as AdhkarContentType) || 'qaseedah');
    setModalOpen(true);
  };

  const upsertEntry = (entry: Dhikr) => {
    queryClient.setQueryData<Dhikr[]>(QUERY_KEY, (old = []) => {
      const next = old.filter((row) => row.id !== entry.id);
      next.push(entry);
      return sortEntries(next);
    });
  };

  const handleSaved = (entry: Dhikr) => {
    upsertEntry(entry);
  };

  const handleFinalized = (tempId: string, real: Dhikr) => {
    queryClient.setQueryData<Dhikr[]>(QUERY_KEY, (old = []) => {
      const next = old.filter((row) => row.id !== tempId && row.id !== real.id);
      next.push(real);
      return sortEntries(next);
    });
  };

  const handleRevert = (tempId: string) => {
    queryClient.setQueryData<Dhikr[]>(QUERY_KEY, (old = []) =>
      old.filter((row) => row.id !== tempId)
    );
  };

  const handleUpdated = (entry: Dhikr) => {
    upsertEntry(entry);
  };

  const handleDelete = async (row: Dhikr) => {
    const ok = confirm(`Delete ${typeLabel(row.content_type)}: "${row.title}"?`);
    if (!ok) return;

    setDeletingId(row.id);
    const previous = queryClient.getQueryData<Dhikr[]>(QUERY_KEY) ?? [];

    queryClient.setQueryData<Dhikr[]>(QUERY_KEY, (old = []) =>
      old.filter((item) => item.id !== row.id)
    );

    try {
      await deleteDhikr(row.id);
      toast.success('Entry deleted.');
    } catch (error) {
      queryClient.setQueryData<Dhikr[]>(QUERY_KEY, previous);
      toast.error(error instanceof Error ? error.message : 'Failed to delete entry.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (row: Dhikr) => {
    setTogglingId(row.id);
    const previous = queryClient.getQueryData<Dhikr[]>(QUERY_KEY) ?? [];
    const nextState = !row.is_active;

    queryClient.setQueryData<Dhikr[]>(QUERY_KEY, (old = []) =>
      old.map((item) => (item.id === row.id ? { ...item, is_active: nextState } : item))
    );

    try {
      const updated = await updateDhikr(row.id, { is_active: nextState });
      upsertEntry(updated);
      toast.success(nextState ? 'Entry activated.' : 'Entry set inactive.');
    } catch (error) {
      queryClient.setQueryData<Dhikr[]>(QUERY_KEY, previous);
      toast.error(error instanceof Error ? error.message : 'Failed to update status.');
    } finally {
      setTogglingId(null);
    }
  };

  const modalType: AdhkarContentType =
    ((editRow?.content_type as AdhkarContentType | null) ?? createType) || 'qaseedah';

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden pt-14 md:pt-0">
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <BookOpen size={20} className="text-[hsl(142_60%_32%)]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[hsl(150_30%_12%)]">Qaseedahs and Naats</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {entries.length} entries · {qaseedahCount} qaseedahs · {naatCount} naats
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
                <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
              </Button>
              <Button size="sm" onClick={() => openCreate('qaseedah')} className="gap-2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                <Plus size={14} /> Add Qaseedah
              </Button>
              <Button size="sm" variant="outline" onClick={() => openCreate('naat')} className="gap-2 border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)]">
                <Plus size={14} /> Add Naat
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-5">
          <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 mb-5">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, Arabic, translation, Urdu..." className="pl-9 h-9 text-sm" />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => setFilterMode('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${filterMode === 'all' ? 'border-transparent text-white' : 'border-border bg-muted text-muted-foreground hover:bg-secondary'}`} style={filterMode === 'all' ? { background: 'hsl(var(--primary))' } : {}}>
                All ({entries.length})
              </button>
              <button onClick={() => setFilterMode('qaseedah')} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${filterMode === 'qaseedah' ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-border bg-muted text-muted-foreground hover:bg-secondary'}`}>
                Qaseedah ({qaseedahCount})
              </button>
              <button onClick={() => setFilterMode('naat')} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${filterMode === 'naat' ? 'border-sky-300 bg-sky-100 text-sky-800' : 'border-border bg-muted text-muted-foreground hover:bg-secondary'}`}>
                Naat ({naatCount})
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Loading entries...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 gap-3 text-muted-foreground rounded-2xl border-2 border-dashed border-[hsl(140_20%_88%)] bg-white">
              <BookOpen size={32} className="opacity-30" />
              <p className="text-sm">No qaseedah or naat entries match this filter.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((row) => {
                const itemType = row.content_type as AdhkarContentType | null;
                const isOpen = !!expanded[row.id];
                const urduText = (row.urdu_translation ?? '').trim();

                return (
                  <div key={row.id} className="rounded-xl border border-[hsl(140_20%_86%)] bg-white overflow-hidden">
                    <div className="px-4 py-3 flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
                        className="mt-0.5 w-6 h-6 rounded-md border border-border text-muted-foreground hover:bg-secondary"
                        title={isOpen ? 'Collapse' : 'Expand'}
                      >
                        {isOpen ? '-' : '+'}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-[hsl(150_30%_15%)]">{row.title}</h3>
                          <Badge className={itemType === 'naat' ? 'bg-sky-100 text-sky-800 border-sky-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}>
                            {typeLabel(itemType)}
                          </Badge>
                          <Badge variant={row.is_active ? 'default' : 'secondary'}>
                            {row.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>

                        {row.arabic_title ? (
                          <p className="text-sm text-muted-foreground mt-0.5" dir="rtl" style={{ fontFamily: 'serif' }}>
                            {row.arabic_title}
                          </p>
                        ) : null}

                        <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground flex-wrap">
                          <span>Prayer time: {row.prayer_time}</span>
                          {row.group_name ? <span>Group: {row.group_name}</span> : null}
                          {row.reference ? <span>Ref: {row.reference}</span> : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleToggleActive(row)} disabled={togglingId === row.id} className="p-1.5 rounded hover:bg-secondary/60 transition-colors" title={row.is_active ? 'Set inactive' : 'Set active'}>
                          {row.is_active ? <ToggleRight size={16} className="text-emerald-600" /> : <ToggleLeft size={16} className="text-muted-foreground" />}
                        </button>
                        <button onClick={() => openEdit(row)} className="p-1.5 rounded hover:bg-secondary/60 transition-colors" title="Edit entry">
                          <Pencil size={15} className="text-[hsl(142_60%_32%)]" />
                        </button>
                        <button onClick={() => void handleDelete(row)} disabled={deletingId === row.id} className="p-1.5 rounded hover:bg-destructive/10 transition-colors" title="Delete entry">
                          {deletingId === row.id ? <Loader2 size={15} className="animate-spin text-destructive" /> : <Trash2 size={15} className="text-destructive" />}
                        </button>
                      </div>
                    </div>

                    {isOpen ? (
                      <div className="px-5 pb-5 border-t border-[hsl(140_20%_92%)] bg-[hsl(140_20%_98%)] space-y-3">
                        {row.arabic ? (
                          <div className="pt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Arabic</p>
                            <p className="text-right leading-loose text-[1.15rem]" dir="rtl" style={{ fontFamily: 'serif' }}>{row.arabic}</p>
                          </div>
                        ) : null}

                        {row.transliteration ? (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Transliteration</p>
                            <p className="text-sm italic text-foreground/85 whitespace-pre-wrap">{row.transliteration}</p>
                          </div>
                        ) : null}

                        {row.translation ? (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">English</p>
                            <p className="text-sm text-foreground/85 whitespace-pre-wrap">{row.translation}</p>
                          </div>
                        ) : null}

                        {urduText ? (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Urdu</p>
                            <p className="text-sm text-right leading-loose whitespace-pre-wrap" dir="rtl" style={{ fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif" }}>{urduText}</p>
                          </div>
                        ) : null}

                        {row.file_url ? (
                          <div className="rounded-lg border border-[hsl(140_20%_88%)] bg-white px-3 py-2.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[hsl(150_30%_15%)]">{isPdf(row.file_url) ? 'PDF attachment' : 'Media attachment'}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{row.file_url}</p>
                            </div>
                            <a href={row.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-[hsl(142_50%_75%)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)] shrink-0">
                              {isPdf(row.file_url) ? <FileText size={12} /> : <Globe2 size={12} />} Open
                            </a>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <DhikrModal
        open={modalOpen}
        row={editRow}
        forcedContentType={modalType}
        defaultPrayerTime="general"
        titleOverride={editRow ? `Edit ${typeLabel(modalType)}` : modalType === 'naat' ? 'Add New Naat' : 'Add New Qaseedah'}
        onClose={closeModal}
        onSaved={handleSaved}
        onFinalized={handleFinalized}
        onRevert={handleRevert}
        onUpdated={handleUpdated}
      />
    </div>
  );
}

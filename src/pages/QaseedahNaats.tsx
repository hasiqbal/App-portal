import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronsUpDown,
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
  X,
} from 'lucide-react';
import Sidebar from '#/components/layout/Sidebar';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '#/components/ui/dialog';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Switch } from '#/components/ui/switch';
import { Textarea } from '#/components/ui/textarea';
import {
  createQaseedahNaatEntry,
  createQaseedahNaatGroup,
  deleteQaseedahNaatEntry,
  fetchQaseedahNaatEntries,
  fetchQaseedahNaatGroups,
  updateQaseedahNaatEntry,
} from '#/lib/api';
import { usePermissions } from '#/hooks/usePermissions';
import { PRAYER_TIME_LABELS, type QaseedahNaatEntry, type QaseedahNaatGroup, type QaseedahNaatType } from '#/types';
import { toast } from 'sonner';

type FilterMode = 'all' | 'qaseedah' | 'naat';
type EntryComposeMode = 'chapters' | 'bulk';

const SUPPORTED_TYPES: QaseedahNaatType[] = ['qaseedah', 'naat'];
const QUERY_KEY = ['qaseedah-naat-dedicated'];
const COUNT_PRESETS = ['1', '3', '7', '11', '33', '40', '100'];
const PRAYER_TIME_OPTIONS = [
  'general',
  'before-fajr',
  'after-fajr',
  'after-zuhr',
  'after-asr',
  'after-maghrib',
  'after-isha',
  'after-jumuah',
] as const;

type EditorFormState = {
  title: string;
  arabic_title: string;
  arabic: string;
  transliteration: string;
  translation: string;
  urdu_translation: string;
  reference: string;
  count: string;
  prayer_time: string;
  group_name: string;
  display_order: string;
  file_url: string;
  description: string;
  tafsir: string;
  bulk_lines: string;
  is_active: boolean;
};

const EMPTY_FORM: EditorFormState = {
  title: '',
  arabic_title: '',
  arabic: '',
  transliteration: '',
  translation: '',
  urdu_translation: '',
  reference: '',
  count: '1',
  prayer_time: 'general',
  group_name: '',
  display_order: '0',
  file_url: '',
  description: '',
  tafsir: '',
  bulk_lines: '',
  is_active: true,
};

type ParsedLineRow = {
  chapter: string;
  heading: string;
  arabic: string;
  transliteration: string;
  translation: string;
  urdu_translation: string;
};

type ChapterDraft = {
  id: string;
  title: string;
  arabic: string;
  transliteration: string;
  translation: string;
  urdu_translation: string;
};

const CHAPTER_PREFIX_REGEX = /^(?:#{1,6}\s*)?(?:chapter|chap)\b\s*[:-]?\s*(.*)$/i;

type ExistingSectionLike = {
  chapter?: unknown;
  heading?: unknown;
  arabic?: unknown;
  transliteration?: unknown;
  translation?: unknown;
  urdu_translation?: unknown;
};

function parseChapterMarker(rawLine: string): string | null {
  const normalized = rawLine.trim();
  if (!normalized) return null;

  const chapterMatch = normalized.match(CHAPTER_PREFIX_REGEX);
  if (chapterMatch) {
    const suffix = chapterMatch[1]?.trim();
    return suffix ? `Chapter ${suffix}` : normalized.replace(/^#{1,6}\s*/, '');
  }

  if (/^chapter\s+\d+$/i.test(normalized)) {
    return normalized;
  }

  return null;
}

function parseBulkLineColumns(rawLine: string): string[] {
  if (rawLine.includes('\t')) {
    return rawLine.split('\t').map((segment) => segment.trim());
  }

  if (rawLine.includes(',')) {
    return rawLine.split(',').map((segment) => segment.trim());
  }

  return [rawLine.trim()];
}

function parseBulkLines(rawInput: string): ParsedLineRow[] {
  const lines = rawInput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let currentChapter = 'Chapter 1';
  let lineInChapter = 0;

  return lines
    .map((line) => {
      const chapter = parseChapterMarker(line);
      if (chapter) {
        currentChapter = chapter;
        lineInChapter = 0;
        return null;
      }

      const columns = parseBulkLineColumns(line).filter((column) => column.length > 0);
      if (columns.length < 2) return null;

      lineInChapter += 1;
      const heading = `${currentChapter} · Line ${lineInChapter}`;

      if (columns.length === 2) {
        return {
          chapter: currentChapter,
          heading,
          arabic: columns[0],
          transliteration: '',
          translation: columns[1],
          urdu_translation: '',
        };
      }

      if (columns.length === 3) {
        return {
          chapter: currentChapter,
          heading,
          arabic: columns[0],
          transliteration: columns[1],
          translation: columns[2],
          urdu_translation: '',
        };
      }

      return {
        chapter: currentChapter,
        heading,
        arabic: columns[0],
        transliteration: columns[1],
        translation: columns[2],
        urdu_translation: columns.slice(3).join(' '),
      };
    })
    .filter((row): row is ParsedLineRow => Boolean(row));
}

function buildBulkLinesFromSections(sections: unknown): string {
  if (!Array.isArray(sections)) return '';

  const lines: string[] = [];
  let previousChapter = '';

  for (const rawSection of sections as ExistingSectionLike[]) {
    if (!rawSection || typeof rawSection !== 'object') continue;

    const chapter = typeof rawSection.chapter === 'string' && rawSection.chapter.trim().length > 0
      ? rawSection.chapter.trim()
      : 'Chapter 1';

    if (chapter !== previousChapter) {
      lines.push(chapter);
      previousChapter = chapter;
    }

    const arabic = typeof rawSection.arabic === 'string' ? rawSection.arabic.trim() : '';
    if (!arabic) continue;

    const transliteration = typeof rawSection.transliteration === 'string' ? rawSection.transliteration.trim() : '';
    const translation = typeof rawSection.translation === 'string' ? rawSection.translation.trim() : '';
    const urdu = typeof rawSection.urdu_translation === 'string' ? rawSection.urdu_translation.trim() : '';

    const columns = [arabic];
    if (transliteration || translation || urdu) columns.push(transliteration);
    if (translation || urdu) columns.push(translation);
    if (urdu) columns.push(urdu);

    lines.push(columns.join('\t'));
  }

  return lines.join('\n');
}

function createChapterDraft(title: string, seed = Date.now()): ChapterDraft {
  return {
    id: `chapter-${seed}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    arabic: '',
    transliteration: '',
    translation: '',
    urdu_translation: '',
  };
}

function buildChapterDraftsFromSections(sections: unknown): ChapterDraft[] {
  if (!Array.isArray(sections) || sections.length === 0) {
    return [createChapterDraft('Chapter 1')];
  }

  const chapterMap = new Map<string, ChapterDraft>();

  for (const rawSection of sections as ExistingSectionLike[]) {
    if (!rawSection || typeof rawSection !== 'object') continue;

    const chapterTitle = typeof rawSection.chapter === 'string' && rawSection.chapter.trim().length > 0
      ? rawSection.chapter.trim()
      : 'Chapter 1';

    if (!chapterMap.has(chapterTitle)) {
      chapterMap.set(chapterTitle, createChapterDraft(chapterTitle, chapterMap.size + 1));
    }

    const chapter = chapterMap.get(chapterTitle);
    if (!chapter) continue;

    const arabic = typeof rawSection.arabic === 'string' ? rawSection.arabic.trim() : '';
    const transliteration = typeof rawSection.transliteration === 'string' ? rawSection.transliteration.trim() : '';
    const translation = typeof rawSection.translation === 'string' ? rawSection.translation.trim() : '';
    const urdu = typeof rawSection.urdu_translation === 'string' ? rawSection.urdu_translation.trim() : '';

    if (arabic) chapter.arabic = chapter.arabic ? `${chapter.arabic}\n${arabic}` : arabic;
    if (transliteration) chapter.transliteration = chapter.transliteration ? `${chapter.transliteration}\n${transliteration}` : transliteration;
    if (translation) chapter.translation = chapter.translation ? `${chapter.translation}\n${translation}` : translation;
    if (urdu) chapter.urdu_translation = chapter.urdu_translation ? `${chapter.urdu_translation}\n${urdu}` : urdu;
  }

  const chapters = Array.from(chapterMap.values());
  return chapters.length > 0 ? chapters : [createChapterDraft('Chapter 1')];
}

function buildRowsFromChapterDrafts(chapters: ChapterDraft[]): ParsedLineRow[] {
  const rows: ParsedLineRow[] = [];

  for (const chapter of chapters) {
    const chapterTitle = chapter.title.trim() || 'Chapter 1';
    const arabicLines = chapter.arabic.split('\n').map((line) => line.trim());
    const translitLines = chapter.transliteration.split('\n').map((line) => line.trim());
    const englishLines = chapter.translation.split('\n').map((line) => line.trim());
    const urduLines = chapter.urdu_translation.split('\n').map((line) => line.trim());

    const lineCount = Math.max(arabicLines.length, translitLines.length, englishLines.length, urduLines.length);

    for (let index = 0; index < lineCount; index += 1) {
      const arabic = arabicLines[index] ?? '';
      const transliteration = translitLines[index] ?? '';
      const translation = englishLines[index] ?? '';
      const urdu = urduLines[index] ?? '';

      if (!arabic && !transliteration && !translation && !urdu) continue;

      rows.push({
        chapter: chapterTitle,
        heading: `${chapterTitle} · Line ${rows.filter((row) => row.chapter === chapterTitle).length + 1}`,
        arabic,
        transliteration,
        translation,
        urdu_translation: urdu,
      });
    }
  }

  return rows;
}

function typeLabel(type: QaseedahNaatType | null | undefined): string {
  if (type === 'qaseedah') return 'Qaseedah';
  if (type === 'naat') return 'Naat';
  return 'Entry';
}

function sortEntries(rows: QaseedahNaatEntry[]): QaseedahNaatEntry[] {
  return [...rows].sort((a, b) => {
    const typeA = a.content_type;
    const typeB = b.content_type;
    const typeSort = typeA.localeCompare(typeB);
    if (typeSort !== 0) return typeSort;

    const groupSort = a.group_name.localeCompare(b.group_name);
    if (groupSort !== 0) return groupSort;

    const displayOrderSort = a.display_order - b.display_order;
    if (displayOrderSort !== 0) return displayOrderSort;

    return a.title.localeCompare(b.title);
  });
}

function isPdf(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.pdf([?#].*)?$/i.test(url);
}

function formFromEntry(row: QaseedahNaatEntry): EditorFormState {
  return {
    title: row.title,
    arabic_title: row.arabic_title ?? '',
    arabic: row.arabic,
    transliteration: row.transliteration ?? '',
    translation: row.translation ?? '',
    urdu_translation: row.urdu_translation ?? '',
    reference: row.reference ?? '',
    count: row.count || '1',
    prayer_time: row.prayer_time || 'general',
    group_name: row.group_name || '',
    display_order: String(row.display_order ?? 0),
    file_url: row.file_url ?? '',
    description: row.description ?? '',
    tafsir: row.tafsir ?? '',
    bulk_lines: buildBulkLinesFromSections(row.sections),
    is_active: row.is_active,
  };
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function hasAnyCoreText(form: EditorFormState): boolean {
  return [
    form.arabic,
    form.transliteration,
    form.translation,
    form.urdu_translation,
    form.description,
    form.bulk_lines,
  ].some((field) => field.trim().length > 0);
}

export default function QaseedahNaats() {
  const queryClient = useQueryClient();
  const { canEdit, canDelete, role } = usePermissions();
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [groupFilterId, setGroupFilterId] = useState<string>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState<QaseedahNaatEntry | null>(null);
  const [createType, setCreateType] = useState<QaseedahNaatType>('qaseedah');
  const [form, setForm] = useState<EditorFormState>(EMPTY_FORM);
  const [groupMode, setGroupMode] = useState<'existing' | 'new'>('existing');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [countMode, setCountMode] = useState<'preset' | 'custom'>('preset');
  const [composeMode, setComposeMode] = useState<EntryComposeMode>('chapters');
  const [chapterDrafts, setChapterDrafts] = useState<ChapterDraft[]>([createChapterDraft('Chapter 1')]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery<{ groups: QaseedahNaatGroup[]; entries: QaseedahNaatEntry[] }>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const [groups, entries] = await Promise.all([
        fetchQaseedahNaatGroups({ contentTypes: SUPPORTED_TYPES }),
        fetchQaseedahNaatEntries({ contentTypes: SUPPORTED_TYPES }),
      ]);

      return {
        groups,
        entries: sortEntries(entries),
      };
    },
  });

  const groups = useMemo(() => data?.groups ?? [], [data?.groups]);
  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return entries.filter((row) => {
      if (!SUPPORTED_TYPES.includes(row.content_type)) {
        return false;
      }

      if (filterMode !== 'all' && row.content_type !== filterMode) {
        return false;
      }

      if (groupFilterId !== 'all' && row.group_id !== groupFilterId) {
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
  }, [entries, filterMode, search, groupFilterId]);

  const qaseedahCount = entries.filter((row) => row.content_type === 'qaseedah').length;
  const naatCount = entries.filter((row) => row.content_type === 'naat').length;

  const groupedRows = useMemo(() => {
    const groupsById = new Map(groups.map((group) => [group.id, group]));
    const grouped = new Map<string, { group: QaseedahNaatGroup | null; rows: QaseedahNaatEntry[] }>();

    for (const row of filtered) {
      const key = row.group_id;
      const existing = grouped.get(key);
      if (existing) {
        existing.rows.push(row);
        continue;
      }

      grouped.set(key, {
        group: groupsById.get(key) ?? null,
        rows: [row],
      });
    }

    return Array.from(grouped.values())
      .sort((left, right) => {
        const leftOrder = left.group?.display_order ?? 9999;
        const rightOrder = right.group?.display_order ?? 9999;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;

        const leftName = left.group?.name ?? left.rows[0]?.group_name ?? '';
        const rightName = right.group?.name ?? right.rows[0]?.group_name ?? '';
        return leftName.localeCompare(rightName);
      })
      .map((section) => ({
        ...section,
        rows: [...section.rows].sort((a, b) => a.display_order - b.display_order || a.title.localeCompare(b.title)),
      }));
  }, [filtered, groups]);

  const closeModal = () => {
    setModalOpen(false);
    setEditRow(null);
    setForm(EMPTY_FORM);
    setGroupMode('existing');
    setSelectedGroupId('');
    setCountMode('preset');
    setComposeMode('chapters');
    setChapterDrafts([createChapterDraft('Chapter 1')]);
  };

  const openCreate = (type: QaseedahNaatType) => {
    setCreateType(type);
    setEditRow(null);
    setForm({ ...EMPTY_FORM, group_name: '', prayer_time: 'general' });
    const defaultGroup = groups.find((group) => group.content_type === type);
    if (defaultGroup) {
      setGroupMode('existing');
      setSelectedGroupId(defaultGroup.id);
      setForm((prev) => ({ ...prev, group_name: defaultGroup.name }));
    } else {
      setGroupMode('new');
      setSelectedGroupId('');
    }
    setCountMode(COUNT_PRESETS.includes('1') ? 'preset' : 'custom');
    setComposeMode('chapters');
    setChapterDrafts([createChapterDraft('Chapter 1')]);
    setModalOpen(true);
  };

  const openEdit = (row: QaseedahNaatEntry) => {
    setEditRow(row);
    setCreateType(row.content_type);
    setForm(formFromEntry(row));
    setSelectedGroupId(row.group_id);
    setGroupMode('existing');
    setCountMode(COUNT_PRESETS.includes(row.count || '1') ? 'preset' : 'custom');
    setComposeMode(Array.isArray(row.sections) && row.sections.length > 0 ? 'chapters' : 'bulk');
    setChapterDrafts(buildChapterDraftsFromSections(row.sections));
    setModalOpen(true);
  };

  const addChapterDraft = () => {
    setChapterDrafts((prev) => [...prev, createChapterDraft(`Chapter ${prev.length + 1}`)]);
  };

  const removeChapterDraft = (chapterId: string) => {
    setChapterDrafts((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((chapter) => chapter.id !== chapterId);
      return next.length > 0 ? next : [createChapterDraft('Chapter 1')];
    });
  };

  const updateChapterDraft = (chapterId: string, patch: Partial<ChapterDraft>) => {
    setChapterDrafts((prev) => prev.map((chapter) => (
      chapter.id === chapterId ? { ...chapter, ...patch } : chapter
    )));
  };

  const handleDelete = async (row: QaseedahNaatEntry) => {
    const ok = confirm(`Delete ${typeLabel(row.content_type)}: "${row.title}"?`);
    if (!ok) return;

    setDeletingId(row.id);
    const previous = queryClient.getQueryData<{ groups: QaseedahNaatGroup[]; entries: QaseedahNaatEntry[] }>(QUERY_KEY);

    queryClient.setQueryData<{ groups: QaseedahNaatGroup[]; entries: QaseedahNaatEntry[] }>(QUERY_KEY, (old) => {
      if (!old) return old;
      return {
        ...old,
        entries: old.entries.filter((item) => item.id !== row.id),
      };
    });

    try {
      await deleteQaseedahNaatEntry(row.id);
      toast.success('Entry deleted.');
    } catch (error) {
      if (previous) queryClient.setQueryData(QUERY_KEY, previous);
      toast.error(error instanceof Error ? error.message : 'Failed to delete entry.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (row: QaseedahNaatEntry) => {
    setTogglingId(row.id);
    const previous = queryClient.getQueryData<{ groups: QaseedahNaatGroup[]; entries: QaseedahNaatEntry[] }>(QUERY_KEY);
    const nextState = !row.is_active;

    queryClient.setQueryData<{ groups: QaseedahNaatGroup[]; entries: QaseedahNaatEntry[] }>(QUERY_KEY, (old) => {
      if (!old) return old;
      return {
        ...old,
        entries: old.entries.map((item) => (
          item.id === row.id ? { ...item, is_active: nextState } : item
        )),
      };
    });

    try {
      await updateQaseedahNaatEntry(row.id, { is_active: nextState });
      toast.success(nextState ? 'Entry activated.' : 'Entry set inactive.');
    } catch (error) {
      if (previous) queryClient.setQueryData(QUERY_KEY, previous);
      toast.error(error instanceof Error ? error.message : 'Failed to update status.');
    } finally {
      setTogglingId(null);
    }
  };

  const resolveGroup = async (targetType: QaseedahNaatType, groupName: string) => {
    const normalizedName = groupName.trim();
    const existing = groups.find((group) => (
      group.content_type === targetType && normalizeText(group.name) === normalizeText(normalizedName)
    ));

    if (existing) return existing;

    const maxOrder = groups
      .filter((group) => group.content_type === targetType)
      .reduce((maxValue, group) => Math.max(maxValue, group.display_order ?? 0), 0);

    const created = await createQaseedahNaatGroup({
      name: normalizedName,
      content_type: targetType,
      legacy_group_name: null,
      description: null,
      icon: targetType === 'naat' ? '🎙️' : '📖',
      icon_color: '#ffffff',
      icon_bg_color: '#0f766e',
      badge_text: null,
      badge_color: '#0f766e',
      display_order: maxOrder + 10,
      is_active: true,
    });

    queryClient.setQueryData<{ groups: QaseedahNaatGroup[]; entries: QaseedahNaatEntry[] }>(QUERY_KEY, (old) => {
      if (!old) return old;
      return { ...old, groups: [...old.groups, created] };
    });

    return created;
  };

  const handleSave = async () => {
    if (!canEdit) return;

    const title = form.title.trim();
    if (!title) {
      toast.error('Title is required.');
      return;
    }

    const selectedGroupName = selectedGroupId
      ? (modalGroups.find((group) => group.id === selectedGroupId)?.name ?? '')
      : '';
    const groupName = (groupMode === 'existing' ? selectedGroupName : form.group_name).trim();
    if (!groupName) {
      toast.error('Group is required.');
      return;
    }

    const bulkRows = composeMode === 'bulk' && form.bulk_lines.trim().length > 0
      ? parseBulkLines(form.bulk_lines)
      : [];

    if (composeMode === 'bulk' && form.bulk_lines.trim().length > 0 && bulkRows.length === 0) {
      toast.error('Bulk paste format is invalid. Use one row per line with tab or comma separators.');
      return;
    }

    const chapterRows = composeMode === 'chapters'
      ? buildRowsFromChapterDrafts(chapterDrafts)
      : [];

    const structuredRows = composeMode === 'chapters' ? chapterRows : bulkRows;

    const hasText = structuredRows.length > 0 || hasAnyCoreText(form);
    if (!hasText && !form.file_url.trim()) {
      toast.error('Add chapter text, bulk text, or attachment before saving.');
      return;
    }

    setSaving(true);
    try {
      const targetType = editRow?.content_type ?? createType;
      const group = await resolveGroup(targetType, groupName);

      const parsedArabic = structuredRows.map((line) => line.arabic).filter(Boolean).join('\n');
      const parsedTransliteration = structuredRows.map((line) => line.transliteration).filter(Boolean).join('\n');
      const parsedTranslation = structuredRows.map((line) => line.translation).filter(Boolean).join('\n');
      const parsedUrdu = structuredRows.map((line) => line.urdu_translation).filter(Boolean).join('\n');

      const payload = {
        group_id: group.id,
        content_type: targetType,
        title,
        arabic_title: form.arabic_title.trim() || null,
        arabic: (parsedArabic || form.arabic.trim()) || '',
        transliteration: parsedTransliteration || form.transliteration.trim() || null,
        translation: parsedTranslation || form.translation.trim() || null,
        urdu_translation: parsedUrdu || form.urdu_translation.trim() || null,
        reference: form.reference.trim() || null,
        count: form.count.trim() || '1',
        prayer_time: form.prayer_time.trim() || 'general',
        display_order: Number(form.display_order) || 0,
        is_active: form.is_active,
        sections: structuredRows.length > 0
          ? structuredRows.map((line) => ({
            chapter: line.chapter,
            heading: line.heading,
            arabic: line.arabic,
            transliteration: line.transliteration || undefined,
            translation: line.translation || undefined,
            urdu_translation: line.urdu_translation || undefined,
          }))
          : editRow?.sections ?? null,
        file_url: form.file_url.trim() || null,
        description: form.description.trim() || null,
        tafsir: form.tafsir.trim() || null,
      };

      if (editRow) {
        await updateQaseedahNaatEntry(editRow.id, payload);
        toast.success('Entry updated.');
      } else {
        await createQaseedahNaatEntry(payload);
        toast.success(`${typeLabel(targetType)} created.`);
      }

      await refetch();
      closeModal();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Failed to save entry.');
    } finally {
      setSaving(false);
    }
  };

  const modalType: QaseedahNaatType = editRow?.content_type ?? createType;
  const modalGroups = groups.filter((group) => group.content_type === modalType);
  const roleLabel = role ? role[0].toUpperCase() + role.slice(1) : 'Guest';

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
                <p className="text-[11px] mt-1 text-muted-foreground flex items-center gap-1.5">
                  <Check size={11} className="text-emerald-600" />
                  Signed in as {roleLabel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
                <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
              </Button>
              <Button size="sm" onClick={() => openCreate('qaseedah')} disabled={!canEdit} className="gap-2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                <Plus size={14} /> Add Qaseedah
              </Button>
              <Button size="sm" variant="outline" onClick={() => openCreate('naat')} disabled={!canEdit} className="gap-2 border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)]">
                <Plus size={14} /> Add Naat
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-5">
          {isError ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5" />
                <div>
                  <p className="font-semibold">Failed to load qaseedah/naat content.</p>
                  <p className="text-xs mt-0.5">{error instanceof Error ? error.message : 'Unknown error'}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 mb-5">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, Arabic, translation, Urdu..." className="pl-9 h-9 text-sm" />
            </div>
            <div className="w-full sm:w-[260px]">
              <Label className="text-[11px] text-muted-foreground">Group</Label>
              <div className="relative mt-1">
                <select
                  value={groupFilterId}
                  onChange={(event) => setGroupFilterId(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 pr-8 text-sm"
                >
                  <option value="all">All Groups</option>
                  {groups
                    .filter((group) => filterMode === 'all' || group.content_type === filterMode)
                    .map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({typeLabel(group.content_type)})
                      </option>
                    ))}
                </select>
                <ChevronsUpDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
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
            <div className="space-y-3">
              {[1, 2, 3].map((skeleton) => (
                <div key={skeleton} className="rounded-xl border border-[hsl(140_20%_90%)] bg-white p-4 animate-pulse">
                  <div className="h-4 w-40 bg-[hsl(140_20%_90%)] rounded" />
                  <div className="h-3 w-64 bg-[hsl(140_20%_92%)] rounded mt-3" />
                  <div className="h-3 w-24 bg-[hsl(140_20%_92%)] rounded mt-2" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 gap-3 text-muted-foreground rounded-2xl border-2 border-dashed border-[hsl(140_20%_88%)] bg-white">
              <BookOpen size={32} className="opacity-30" />
              <p className="text-sm">No qaseedah or naat entries match this filter.</p>
              <p className="text-xs">Try a different search, filter, or group selection.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupedRows.map(({ group, rows }) => {
                const groupName = group?.name ?? rows[0]?.group_name ?? 'General';
                const groupType = group?.content_type ?? rows[0]?.content_type ?? 'qaseedah';
                const currentGroupId = group?.id ?? rows[0]?.group_id;
                const isGroupOpen = activeGroupId === currentGroupId;

                return (
                  <section key={group?.id ?? groupName} className="rounded-2xl border border-[hsl(140_20%_86%)] bg-white overflow-hidden">
                    <header className="px-4 py-3 border-b border-[hsl(140_20%_92%)] bg-[hsl(140_30%_98%)] flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-[hsl(150_30%_15%)] truncate">{groupName}</h2>
                        <p className="text-[11px] text-muted-foreground">{rows.length} entries</p>
                      </div>
                      <Badge className={groupType === 'naat' ? 'bg-sky-100 text-sky-800 border-sky-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}>
                        {typeLabel(groupType)}
                      </Badge>
                    </header>

                    {group?.description ? (
                      <div className="px-4 py-3 border-b border-[hsl(140_20%_92%)] bg-[hsl(140_20%_99%)] text-sm text-muted-foreground">
                        {group.description}
                      </div>
                    ) : null}

                    <div className="px-3 py-3 border-b border-[hsl(140_20%_92%)] bg-[hsl(140_20%_99%)] flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {isGroupOpen ? 'Showing group entries' : 'Home view: group only'}
                      </p>
                      {isGroupOpen ? (
                        <Button variant="outline" size="sm" onClick={() => setActiveGroupId(null)}>
                          Close Group
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => setActiveGroupId(currentGroupId)} className="gap-1.5" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                          Open Group
                        </Button>
                      )}
                    </div>

                    {isGroupOpen ? (
                      <div className="space-y-2 p-2">
                      {rows.map((row) => {
                        const isOpen = !!expanded[row.id];
                        const urduText = (row.urdu_translation ?? '').trim();

                        return (
                          <div key={row.id} className="rounded-xl border border-[hsl(140_20%_88%)] overflow-hidden">
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
                                  <Badge variant={row.is_active ? 'default' : 'secondary'}>
                                    {row.is_active ? 'Active' : 'Inactive'}
                                  </Badge>
                                </div>

                                {row.arabic_title ? (
                                  <p className="text-sm text-muted-foreground mt-0.5" dir="rtl" style={{ fontFamily: 'Noto Naskh Arabic, Scheherazade New, serif' }}>
                                    {row.arabic_title}
                                  </p>
                                ) : null}

                                <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground flex-wrap">
                                  <span>Prayer time: {row.prayer_time}</span>
                                  {row.reference ? <span>Ref: {row.reference}</span> : null}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleToggleActive(row)}
                                  disabled={!canEdit || togglingId === row.id}
                                  className="p-1.5 rounded hover:bg-secondary/60 transition-colors disabled:opacity-50"
                                  title={row.is_active ? 'Set inactive' : 'Set active'}
                                >
                                  {row.is_active ? <ToggleRight size={16} className="text-emerald-600" /> : <ToggleLeft size={16} className="text-muted-foreground" />}
                                </button>
                                <button
                                  onClick={() => openEdit(row)}
                                  disabled={!canEdit}
                                  className="p-1.5 rounded hover:bg-secondary/60 transition-colors disabled:opacity-50"
                                  title="Edit entry"
                                >
                                  <Pencil size={15} className="text-[hsl(142_60%_32%)]" />
                                </button>
                                {canDelete ? (
                                  <button
                                    onClick={() => void handleDelete(row)}
                                    disabled={deletingId === row.id}
                                    className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                                    title="Delete entry"
                                  >
                                    {deletingId === row.id ? <Loader2 size={15} className="animate-spin text-destructive" /> : <Trash2 size={15} className="text-destructive" />}
                                  </button>
                                ) : null}
                              </div>
                            </div>

                            {isOpen ? (
                              <div className="px-5 pb-5 border-t border-[hsl(140_20%_92%)] bg-[hsl(140_20%_98%)] space-y-3">
                                {row.description ? (
                                  <div className="pt-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Description</p>
                                    <p className="text-sm text-foreground/85 whitespace-pre-wrap">{row.description}</p>
                                  </div>
                                ) : null}

                                {row.arabic ? (
                                  <div className="pt-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Arabic</p>
                                    <p className="text-right leading-loose text-[1.15rem]" dir="rtl" style={{ fontFamily: 'Noto Naskh Arabic, Scheherazade New, serif' }}>{row.arabic}</p>
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
                                    <p className="text-sm text-right leading-loose whitespace-pre-wrap" dir="rtl" style={{ fontFamily: 'Noto Nastaliq Urdu, Jameel Noori Nastaleeq, serif' }}>{urduText}</p>
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
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen size={16} className="text-[hsl(142_60%_32%)]" />
              {editRow ? `Edit ${typeLabel(modalType)}` : `Add ${typeLabel(modalType)}`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Group</Label>
                <div className="space-y-2">
                  <select
                    value={groupMode}
                    onChange={(event) => setGroupMode(event.target.value as 'existing' | 'new')}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="existing">Select existing group</option>
                    <option value="new">Create new group</option>
                  </select>

                  {groupMode === 'existing' ? (
                    <select
                      value={selectedGroupId}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSelectedGroupId(value);
                        const selected = modalGroups.find((group) => group.id === value);
                        if (selected) {
                          setForm((prev) => ({ ...prev, group_name: selected.name }));
                        }
                      }}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Choose group</option>
                      {modalGroups.map((group) => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Input value={form.group_name} onChange={(event) => setForm((prev) => ({ ...prev, group_name: event.target.value }))} placeholder="e.g. Wird al Latif" />
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Entry title" />
              </div>
              <div className="space-y-1.5">
                <Label>Arabic Title</Label>
                <Input value={form.arabic_title} onChange={(event) => setForm((prev) => ({ ...prev, arabic_title: event.target.value }))} placeholder="العنوان" dir="rtl" />
              </div>
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input value={form.reference} onChange={(event) => setForm((prev) => ({ ...prev, reference: event.target.value }))} placeholder="Source reference" />
              </div>
              <div className="space-y-1.5">
                <Label>Count</Label>
                <div className="space-y-2">
                  <select
                    value={countMode}
                    onChange={(event) => setCountMode(event.target.value as 'preset' | 'custom')}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="preset">Select preset count</option>
                    <option value="custom">Custom count</option>
                  </select>
                  {countMode === 'preset' ? (
                    <select
                      value={COUNT_PRESETS.includes(form.count) ? form.count : '1'}
                      onChange={(event) => setForm((prev) => ({ ...prev, count: event.target.value }))}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {COUNT_PRESETS.map((count) => (
                        <option key={count} value={count}>{count} times</option>
                      ))}
                    </select>
                  ) : (
                    <Input value={form.count} onChange={(event) => setForm((prev) => ({ ...prev, count: event.target.value }))} placeholder="e.g. 41" />
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Display Order</Label>
                <Input value={form.display_order} onChange={(event) => setForm((prev) => ({ ...prev, display_order: event.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Prayer Time</Label>
                <select
                  value={form.prayer_time}
                  onChange={(event) => setForm((prev) => ({ ...prev, prayer_time: event.target.value }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {PRAYER_TIME_OPTIONS.map((prayerTime) => (
                    <option key={prayerTime} value={prayerTime}>
                      {PRAYER_TIME_LABELS[prayerTime] ?? prayerTime}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Content Input Mode</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setComposeMode('chapters')}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${composeMode === 'chapters' ? 'border-emerald-300 bg-emerald-50' : 'border-border bg-background hover:bg-secondary/50'}`}
                >
                  <p className="text-sm font-semibold text-[hsl(150_30%_15%)]">Manual Chapters</p>
                  <p className="text-xs text-muted-foreground">Create chapters individually with linked Arabic/English/Urdu line boxes.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setComposeMode('bulk')}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${composeMode === 'bulk' ? 'border-emerald-300 bg-emerald-50' : 'border-border bg-background hover:bg-secondary/50'}`}
                >
                  <p className="text-sm font-semibold text-[hsl(150_30%_15%)]">Bulk Paste</p>
                  <p className="text-xs text-muted-foreground">Paste all lines at once using tab/comma separators and chapter markers.</p>
                </button>
              </div>
            </div>

            {composeMode === 'chapters' ? (
              <div className="space-y-3 rounded-xl border border-[hsl(140_20%_88%)] bg-[hsl(140_25%_98%)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[hsl(150_30%_15%)]">Chapter Builder</p>
                    <p className="text-xs text-muted-foreground">Each line number across Arabic, Transliteration, English, and Urdu is linked together.</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addChapterDraft} className="gap-1.5">
                    <Plus size={13} /> Add Chapter
                  </Button>
                </div>

                <div className="space-y-3">
                  {chapterDrafts.map((chapter, index) => (
                    <div key={chapter.id} className="rounded-lg border border-[hsl(140_20%_86%)] bg-white p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={chapter.title}
                          onChange={(event) => updateChapterDraft(chapter.id, { title: event.target.value })}
                          placeholder={`Chapter ${index + 1}`}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeChapterDraft(chapter.id)}
                          disabled={chapterDrafts.length <= 1}
                          className="gap-1.5"
                        >
                          <Trash2 size={13} /> Remove
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Arabic (one line per verse)</Label>
                          <Textarea
                            value={chapter.arabic}
                            onChange={(event) => updateChapterDraft(chapter.id, { arabic: event.target.value })}
                            placeholder="Line 1\nLine 2\nLine 3"
                            rows={5}
                            dir="rtl"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Transliteration (optional)</Label>
                          <Textarea
                            value={chapter.transliteration}
                            onChange={(event) => updateChapterDraft(chapter.id, { transliteration: event.target.value })}
                            placeholder="Line 1\nLine 2\nLine 3"
                            rows={5}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>English (one line per verse)</Label>
                          <Textarea
                            value={chapter.translation}
                            onChange={(event) => updateChapterDraft(chapter.id, { translation: event.target.value })}
                            placeholder="Line 1\nLine 2\nLine 3"
                            rows={5}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Urdu (optional)</Label>
                          <Textarea
                            value={chapter.urdu_translation}
                            onChange={(event) => updateChapterDraft(chapter.id, { urdu_translation: event.target.value })}
                            placeholder="Line 1\nLine 2\nLine 3"
                            rows={5}
                            dir="rtl"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Bulk Paste Lines (Tab or Comma separated)</Label>
                <Textarea
                  value={form.bulk_lines}
                  onChange={(event) => setForm((prev) => ({ ...prev, bulk_lines: event.target.value }))}
                  placeholder={[
                    'Paste one row per line.',
                    'Add chapter lines like: Chapter 1, Chapter 2 (no separators).',
                    '2 columns: Arabic<TAB>English',
                    '3 columns: Arabic<TAB>Transliteration<TAB>English',
                    '4 columns: Arabic<TAB>Transliteration<TAB>English<TAB>Urdu',
                    'You can use commas instead of tabs.',
                  ].join('\n')}
                  rows={10}
                />
                <p className="text-[11px] text-muted-foreground">
                  On save, rows are split into chapter-aware lines for app formatting.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Attachment URL (PDF or image)</Label>
              <Input value={form.file_url} onChange={(event) => setForm((prev) => ({ ...prev, file_url: event.target.value }))} placeholder="https://..." />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Short description" rows={3} />
            </div>

            <div className="space-y-1.5">
              <Label>Tafsir / Notes</Label>
              <Textarea value={form.tafsir} onChange={(event) => setForm((prev) => ({ ...prev, tafsir: event.target.value }))} placeholder="Optional notes" rows={3} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[hsl(140_20%_88%)] px-3 py-2">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Only active entries are shown in public readers.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={closeModal} className="gap-1.5">
              <X size={14} /> Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving || !canEdit} className="gap-2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Saving...' : editRow ? 'Save Changes' : 'Create Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

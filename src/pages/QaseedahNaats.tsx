import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bold,
  BookOpen,
  Check,
  ChevronsUpDown,
  FileText,
  Globe2,
  GripVertical,
  Highlighter,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  updateQaseedahNaatGroup,
  updateQaseedahNaatEntry,
} from '#/lib/api';
import { usePermissions } from '#/hooks/usePermissions';
import { useArabicLineTools } from '#/hooks/useArabicLineTools';
import { PRAYER_TIME_LABELS, type QaseedahNaatEntry, type QaseedahNaatGroup, type QaseedahNaatType } from '#/types';
import { toast } from 'sonner';

type FilterMode = 'all' | 'qaseedah' | 'naat';
type EntryComposeMode = 'chapters' | 'bulk';

function wrapSelection(
  textarea: HTMLTextAreaElement,
  value: string,
  left: string,
  right: string,
  onChange: (next: string) => void,
) {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const selected = value.slice(start, end);
  const nextValue = `${value.slice(0, start)}${left}${selected}${right}${value.slice(end)}`;

  onChange(nextValue);

  requestAnimationFrame(() => {
    textarea.focus();
    const caretStart = start + left.length;
    const caretEnd = caretStart + selected.length;
    textarea.setSelectionRange(caretStart, caretEnd);
  });
}

function RichTextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const apply = (left: string, right: string) => {
    if (!ref.current) return;
    wrapSelection(ref.current, value, left, right, onChange);
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 rounded-md border border-[hsl(140_20%_90%)] bg-[hsl(140_25%_98%)] px-1.5 py-1">
        <button
          type="button"
          onClick={() => apply('**', '**')}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-foreground/80 hover:bg-white"
          title="Bold (wraps selection with **...**)"
        >
          <Bold size={13} /> Bold
        </button>
        <button
          type="button"
          onClick={() => apply('__', '__')}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-foreground/80 hover:bg-white"
          title="Underline (wraps selection with __...__)"
        >
          <Underline size={13} /> Underline
        </button>
        <button
          type="button"
          onClick={() => apply('==', '==')}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-foreground/80 hover:bg-white"
          title="Highlight (wraps selection with ==...==)"
        >
          <Highlighter size={13} /> Highlight
        </button>
        <span className="ml-auto text-[10px] text-muted-foreground pr-1">
          **bold** __underline__ ==highlight==
        </span>
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  );
}

// Generic sortable wrapper exposing drag handle props via render prop.
function SortableItem({
  id,
  children,
  className,
}: {
  id: string;
  children: (handle: { dragHandle: React.HTMLAttributes<HTMLElement>; isDragging: boolean }) => React.ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    position: 'relative',
    zIndex: isDragging ? 20 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ dragHandle: { ...attributes, ...listeners } as React.HTMLAttributes<HTMLElement>, isDragging })}
    </div>
  );
}

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

type PrimaryLanguage = 'auto' | 'arabic' | 'transliteration' | 'urdu' | 'english';
type SymbolSplitRule = { symbol: string; every: number };
type LineGrouping = 'auto' | '1' | '2' | '3' | '4';
type ManualSplitRule = { kind: 'symbol'; symbol: string; every: number } | { kind: 'lines'; every: number };
type BulkLanguageBlockKey = 'arabic' | 'transliteration' | 'english' | 'urdu';

type AlignmentStatus = {
  primaryKey: BulkLanguageBlockKey;
  counts: Record<BulkLanguageBlockKey, number>;
  issues: string[];
};

type AlignmentDetail = {
  key: BulkLanguageBlockKey;
  summary: string;
  missingAt: string[];
  extraCount: number;
  likelyCause?: string;
};

const BULK_SPLIT_PRESETS: Array<{ label: string; instruction: string }> = [
  { label: 'No manual split', instruction: '' },
  { label: 'Couplet (after 2 ۞)', instruction: 'after the second symbol: ۞' },
  { label: 'Single Line (after 1 ۞)', instruction: 'after the first symbol: ۞' },
  { label: 'Star Couplet (after 2 *)', instruction: 'after 2 symbols: *' },
  { label: 'Star Line (after 1 *)', instruction: 'after 1 symbol: *' },
];

const SPLIT_SYMBOL_CANDIDATES = ['۞', '٭', '*', '•', '✿', '❀', '◇', '◆', '✧', '⟡', '❁', '✽', '✦'];
const DECORATIVE_SPLIT_SYMBOLS = new Set(['۞', '٭', '✿', '❀', '◇', '◆', '✧', '⟡', '❁', '✽', '✦']);

type EditorFormState = {
  title: string;
  arabic_title: string;
  primary_language: PrimaryLanguage;
  font_scale_arabic: number;
  font_scale_transliteration: number;
  font_scale_english: number;
  font_scale_urdu: number;
  default_show_arabic: boolean;
  default_show_transliteration: boolean;
  default_show_english: boolean;
  default_show_urdu: boolean;
  bulk_split_instruction: string;
  bulk_line_grouping: LineGrouping;
  bulk_numbered_verse_continuation: boolean;
  bulk_arabic_lines: string;
  bulk_transliteration_lines: string;
  bulk_english_lines: string;
  bulk_urdu_lines: string;
  disable_auto_transliteration: boolean;
  disable_auto_arabic: boolean;
  disable_auto_english: boolean;
  disable_auto_urdu: boolean;
  disable_auto_title_arabic: boolean;
  disable_auto_title_english: boolean;
  disable_auto_title_urdu: boolean;
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
  is_active: boolean;
};

const EMPTY_FORM: EditorFormState = {
  title: '',
  arabic_title: '',
  primary_language: 'arabic',
  font_scale_arabic: 1,
  font_scale_transliteration: 1,
  font_scale_english: 1,
  font_scale_urdu: 1,
  default_show_arabic: true,
  default_show_transliteration: true,
  default_show_english: true,
  default_show_urdu: true,
  bulk_split_instruction: '',
  bulk_line_grouping: 'auto',
  bulk_numbered_verse_continuation: true,
  bulk_arabic_lines: '',
  bulk_transliteration_lines: '',
  bulk_english_lines: '',
  bulk_urdu_lines: '',
  disable_auto_transliteration: false,
  disable_auto_arabic: false,
  disable_auto_english: false,
  disable_auto_urdu: false,
  disable_auto_title_arabic: false,
  disable_auto_title_english: false,
  disable_auto_title_urdu: false,
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
  is_active: true,
};

type ParsedLineRow = {
  chapter: string;
  chapter_arabic?: string;
  chapter_urdu?: string;
  heading: string;
  arabic: string;
  transliteration: string;
  translation: string;
  urdu_translation: string;
};

type FixRow = ParsedLineRow & { id: string };

type ChapterDraft = {
  id: string;
  title: string;
  title_arabic: string;
  title_urdu: string;
  arabic: string;
  transliteration: string;
  translation: string;
  urdu_translation: string;
};

type ChorusDraft = {
  arabic: string;
  transliteration: string;
  translation: string;
  urdu_translation: string;
};

const EMPTY_CHORUS: ChorusDraft = {
  arabic: '',
  transliteration: '',
  translation: '',
  urdu_translation: '',
};

const CHORUS_MARKER = '__chorus__';
const SETTINGS_MARKER = '__settings__';

const LANGUAGE_LABELS: Record<BulkLanguageBlockKey, string> = {
  arabic: 'Arabic',
  transliteration: 'Transliteration',
  english: 'English',
  urdu: 'Urdu',
};

function toMeaningfulLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function blockCountsFromBulk(
  blocks: BulkLanguageBlocks,
  splitInstruction: string,
  lineGrouping: LineGrouping,
  numberedVerseContinuation: boolean,
): Record<BulkLanguageBlockKey, number> {
  return {
    arabic: toVerseOnlyLines(prepareBulkLanguageBlock(blocks.arabic, splitInstruction, lineGrouping, shouldApplyLineGroupingToLanguage('arabic'), 'arabic', numberedVerseContinuation)).length,
    transliteration: toVerseOnlyLines(prepareBulkLanguageBlock(blocks.transliteration, splitInstruction, lineGrouping, shouldApplyLineGroupingToLanguage('transliteration'), 'transliteration', numberedVerseContinuation)).length,
    english: toVerseOnlyLines(prepareBulkLanguageBlock(blocks.english, splitInstruction, lineGrouping, shouldApplyLineGroupingToLanguage('english'), 'english', numberedVerseContinuation)).length,
    urdu: toVerseOnlyLines(prepareBulkLanguageBlock(blocks.urdu, splitInstruction, lineGrouping, shouldApplyLineGroupingToLanguage('urdu'), 'urdu', numberedVerseContinuation)).length,
  };
}

function buildBulkAlignmentStatus(
  blocks: BulkLanguageBlocks,
  primaryLanguage: PrimaryLanguage,
  splitInstruction: string,
  lineGrouping: LineGrouping,
  numberedVerseContinuation: boolean,
): AlignmentStatus | null {
  const primaryKey = mapPrimaryLanguageToBlockKey(primaryLanguage);
  if (!primaryKey) return null;

  const counts = blockCountsFromBulk(blocks, splitInstruction, lineGrouping, numberedVerseContinuation);
  const primaryCount = counts[primaryKey];
  const issues: string[] = [];

  if (primaryCount === 0) {
    issues.push(`Primary language (${LANGUAGE_LABELS[primaryKey]}) has no verses.`);
  }

  (Object.keys(counts) as BulkLanguageBlockKey[]).forEach((key) => {
    if (key === primaryKey) return;
    if (counts[key] === 0) return;
    if (counts[key] !== primaryCount) {
      issues.push(
        `${LANGUAGE_LABELS[key]} has ${counts[key]} verses but primary has ${primaryCount}.`,
      );
    }
  });

  return { primaryKey, counts, issues };
}

function buildChapterAlignmentStatus(
  chapters: ChapterDraft[],
  primaryLanguage: PrimaryLanguage,
): AlignmentStatus | null {
  const primaryKey = mapPrimaryLanguageToBlockKey(primaryLanguage);
  if (!primaryKey) return null;

  const totals: Record<BulkLanguageBlockKey, number> = {
    arabic: 0,
    transliteration: 0,
    english: 0,
    urdu: 0,
  };
  const issues: string[] = [];

  chapters.forEach((chapter, chapterIndex) => {
    const chapterCounts: Record<BulkLanguageBlockKey, number> = {
      arabic: toMeaningfulLines(chapter.arabic).length,
      transliteration: toMeaningfulLines(chapter.transliteration).length,
      english: toMeaningfulLines(chapter.translation).length,
      urdu: toMeaningfulLines(chapter.urdu_translation).length,
    };

    totals.arabic += chapterCounts.arabic;
    totals.transliteration += chapterCounts.transliteration;
    totals.english += chapterCounts.english;
    totals.urdu += chapterCounts.urdu;

    const chapterLabel = chapter.title.trim() || `Chapter ${chapterIndex + 1}`;
    const primaryCount = chapterCounts[primaryKey];
    if (primaryCount === 0) {
      issues.push(`${chapterLabel}: primary language (${LANGUAGE_LABELS[primaryKey]}) has no verses.`);
      return;
    }

    (Object.keys(chapterCounts) as BulkLanguageBlockKey[]).forEach((key) => {
      if (key === primaryKey) return;
      if (chapterCounts[key] === 0) return;
      if (chapterCounts[key] !== primaryCount) {
        issues.push(
          `${chapterLabel}: ${LANGUAGE_LABELS[key]} has ${chapterCounts[key]} verses but primary has ${primaryCount}.`,
        );
      }
    });
  });

  return { primaryKey, counts: totals, issues };
}

function buildVerseLabelsFromPreparedPrimary(primaryPrepared: string): string[] {
  const lines = toBlockLines(primaryPrepared);
  const labels: string[] = [];
  let currentChapter = '';
  let verseInChapter = 0;
  let globalVerse = 0;

  lines.forEach((line) => {
    const chapter = parseChapterMarker(line);
    if (chapter) {
      currentChapter = chapter;
      verseInChapter = 0;
      return;
    }

    verseInChapter += 1;
    globalVerse += 1;
    labels.push(currentChapter ? `${currentChapter} · Verse ${verseInChapter}` : `Verse ${globalVerse}`);
  });

  return labels;
}

function inferLikelyGrouping(primaryCount: number, secondaryCount: number, currentGrouping: LineGrouping): string | undefined {
  if (secondaryCount <= 0 || primaryCount <= secondaryCount) return undefined;
  if (primaryCount % secondaryCount !== 0) return undefined;

  const ratio = primaryCount / secondaryCount;
  if (ratio < 2 || ratio > 4) return undefined;

  const suggested = String(ratio) as LineGrouping;
  if (currentGrouping === suggested) return undefined;
  return `Likely cause: one language appears grouped by multiple source lines. Try One-Step Verse Grouping: ${ratio} lines = 1 verse.`;
}

function buildBulkAlignmentDetails(
  blocks: BulkLanguageBlocks,
  primaryLanguage: PrimaryLanguage,
  splitInstruction: string,
  lineGrouping: LineGrouping,
  numberedVerseContinuation: boolean,
): AlignmentDetail[] {
  const primaryKey = mapPrimaryLanguageToBlockKey(primaryLanguage);
  if (!primaryKey) return [];

  const preparedBlocks: Record<BulkLanguageBlockKey, string> = {
    arabic: prepareBulkLanguageBlock(blocks.arabic, splitInstruction, lineGrouping, shouldApplyLineGroupingToLanguage('arabic'), 'arabic', numberedVerseContinuation),
    transliteration: prepareBulkLanguageBlock(blocks.transliteration, splitInstruction, lineGrouping, shouldApplyLineGroupingToLanguage('transliteration'), 'transliteration', numberedVerseContinuation),
    english: prepareBulkLanguageBlock(blocks.english, splitInstruction, lineGrouping, shouldApplyLineGroupingToLanguage('english'), 'english', numberedVerseContinuation),
    urdu: prepareBulkLanguageBlock(blocks.urdu, splitInstruction, lineGrouping, shouldApplyLineGroupingToLanguage('urdu'), 'urdu', numberedVerseContinuation),
  };

  const primaryLines = toVerseOnlyLines(preparedBlocks[primaryKey]);
  const primaryLabels = buildVerseLabelsFromPreparedPrimary(preparedBlocks[primaryKey]);
  const details: AlignmentDetail[] = [];

  (Object.keys(preparedBlocks) as BulkLanguageBlockKey[]).forEach((key) => {
    if (key === primaryKey) return;

    const secondaryLines = toVerseOnlyLines(preparedBlocks[key]);
    if (secondaryLines.length === 0) return;
    if (secondaryLines.length === primaryLines.length) return;

    const missingAt: string[] = [];
    for (let idx = secondaryLines.length; idx < primaryLines.length; idx += 1) {
      missingAt.push(primaryLabels[idx] ?? `Verse ${idx + 1}`);
    }

    const extraCount = Math.max(0, secondaryLines.length - primaryLines.length);
    const ratioHint = inferLikelyGrouping(primaryLines.length, secondaryLines.length, lineGrouping);

    details.push({
      key,
      summary: `${LANGUAGE_LABELS[key]} has ${secondaryLines.length} verses while primary has ${primaryLines.length}.`,
      missingAt,
      extraCount,
      likelyCause: ratioHint,
    });
  });

  return details;
}

function buildChapterAlignmentDetails(
  chapters: ChapterDraft[],
  primaryLanguage: PrimaryLanguage,
): AlignmentDetail[] {
  const primaryKey = mapPrimaryLanguageToBlockKey(primaryLanguage);
  if (!primaryKey) return [];

  const details: AlignmentDetail[] = [];

  chapters.forEach((chapter, chapterIndex) => {
    const chapterLabel = chapter.title.trim() || `Chapter ${chapterIndex + 1}`;
    const byKey: Record<BulkLanguageBlockKey, string[]> = {
      arabic: toMeaningfulLines(chapter.arabic),
      transliteration: toMeaningfulLines(chapter.transliteration),
      english: toMeaningfulLines(chapter.translation),
      urdu: toMeaningfulLines(chapter.urdu_translation),
    };

    const primaryLines = byKey[primaryKey];
    if (primaryLines.length === 0) return;

    (Object.keys(byKey) as BulkLanguageBlockKey[]).forEach((key) => {
      if (key === primaryKey) return;
      const secondaryLines = byKey[key];
      if (secondaryLines.length === 0) return;
      if (secondaryLines.length === primaryLines.length) return;

      const missingAt: string[] = [];
      for (let idx = secondaryLines.length; idx < primaryLines.length; idx += 1) {
        missingAt.push(`${chapterLabel} · Verse ${idx + 1}`);
      }

      const extraCount = Math.max(0, secondaryLines.length - primaryLines.length);
      details.push({
        key,
        summary: `${chapterLabel}: ${LANGUAGE_LABELS[key]} has ${secondaryLines.length} verses while primary has ${primaryLines.length}.`,
        missingAt,
        extraCount,
      });
    });
  });

  return details;
}

function extractAutoTranslationSettingsFromSections(sections: unknown): {
  primary_language: PrimaryLanguage;
  bulk_split_instruction: string;
  bulk_line_grouping: LineGrouping;
  bulk_numbered_verse_continuation: boolean;
  font_scale_arabic: number;
  font_scale_transliteration: number;
  font_scale_english: number;
  font_scale_urdu: number;
  disable_auto_transliteration: boolean;
  disable_auto_arabic: boolean;
  disable_auto_english: boolean;
  disable_auto_urdu: boolean;
  disable_auto_title_arabic: boolean;
  disable_auto_title_english: boolean;
  disable_auto_title_urdu: boolean;
} {
  const defaults = {
    primary_language: 'arabic' as PrimaryLanguage,
    bulk_split_instruction: '',
    bulk_line_grouping: 'auto' as LineGrouping,
    bulk_numbered_verse_continuation: true,
    font_scale_arabic: 1,
    font_scale_transliteration: 1,
    font_scale_english: 1,
    font_scale_urdu: 1,
    disable_auto_transliteration: false,
    disable_auto_arabic: false,
    disable_auto_english: false,
    disable_auto_urdu: false,
    disable_auto_title_arabic: false,
    disable_auto_title_english: false,
    disable_auto_title_urdu: false,
  };

  if (!Array.isArray(sections)) return defaults;

  for (const rawSection of sections as ExistingSectionLike[]) {
    if (!rawSection || typeof rawSection !== 'object') continue;
    const chapter = typeof rawSection.chapter === 'string' ? rawSection.chapter.trim() : '';
    if (chapter !== SETTINGS_MARKER) continue;

    const legacy = (rawSection as { disable_auto_translation?: unknown }).disable_auto_translation;
    const allDisabled = typeof legacy === 'boolean' ? legacy : false;
    const primaryLanguageRaw = (rawSection as { primary_language?: unknown }).primary_language;
    const splitInstruction = (rawSection as { manual_split_instruction?: unknown }).manual_split_instruction;
    const lineGroupingRaw = (rawSection as { line_grouping?: unknown }).line_grouping;
    const numberedContinuationRaw = (rawSection as { numbered_verse_continuation?: unknown }).numbered_verse_continuation;
    const lineGrouping: LineGrouping =
      lineGroupingRaw === '1'
      || lineGroupingRaw === '2'
      || lineGroupingRaw === '3'
      || lineGroupingRaw === '4'
      || lineGroupingRaw === 'auto'
        ? lineGroupingRaw
        : 'auto';
    const primaryLanguage: PrimaryLanguage =
      primaryLanguageRaw === 'arabic'
      || primaryLanguageRaw === 'transliteration'
      || primaryLanguageRaw === 'urdu'
      || primaryLanguageRaw === 'english'
      || primaryLanguageRaw === 'auto'
        ? primaryLanguageRaw
        : 'arabic';

    const clampScale = (value: unknown): number => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0.7, Math.min(1.8, Number(value.toFixed(2))));
      }
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return Math.max(0.7, Math.min(1.8, Number(parsed.toFixed(2))));
        }
      }
      return 1;
    };

    return {
      primary_language: primaryLanguage,
      bulk_split_instruction: typeof splitInstruction === 'string' ? splitInstruction : '',
      bulk_line_grouping: lineGrouping,
      bulk_numbered_verse_continuation: typeof numberedContinuationRaw === 'boolean' ? numberedContinuationRaw : true,
      font_scale_arabic: clampScale((rawSection as { font_scale_arabic?: unknown }).font_scale_arabic),
      font_scale_transliteration: clampScale((rawSection as { font_scale_transliteration?: unknown }).font_scale_transliteration),
      font_scale_english: clampScale((rawSection as { font_scale_english?: unknown }).font_scale_english),
      font_scale_urdu: clampScale((rawSection as { font_scale_urdu?: unknown }).font_scale_urdu),
      disable_auto_transliteration: typeof (rawSection as { disable_auto_transliteration?: unknown }).disable_auto_transliteration === 'boolean'
        ? Boolean((rawSection as { disable_auto_transliteration?: unknown }).disable_auto_transliteration)
        : allDisabled,
      disable_auto_arabic: typeof (rawSection as { disable_auto_arabic?: unknown }).disable_auto_arabic === 'boolean'
        ? Boolean((rawSection as { disable_auto_arabic?: unknown }).disable_auto_arabic)
        : allDisabled,
      disable_auto_english: typeof (rawSection as { disable_auto_english?: unknown }).disable_auto_english === 'boolean'
        ? Boolean((rawSection as { disable_auto_english?: unknown }).disable_auto_english)
        : allDisabled,
      disable_auto_urdu: typeof (rawSection as { disable_auto_urdu?: unknown }).disable_auto_urdu === 'boolean'
        ? Boolean((rawSection as { disable_auto_urdu?: unknown }).disable_auto_urdu)
        : allDisabled,
      disable_auto_title_arabic: typeof (rawSection as { disable_auto_title_arabic?: unknown }).disable_auto_title_arabic === 'boolean'
        ? Boolean((rawSection as { disable_auto_title_arabic?: unknown }).disable_auto_title_arabic)
        : allDisabled,
      disable_auto_title_english: typeof (rawSection as { disable_auto_title_english?: unknown }).disable_auto_title_english === 'boolean'
        ? Boolean((rawSection as { disable_auto_title_english?: unknown }).disable_auto_title_english)
        : allDisabled,
      disable_auto_title_urdu: typeof (rawSection as { disable_auto_title_urdu?: unknown }).disable_auto_title_urdu === 'boolean'
        ? Boolean((rawSection as { disable_auto_title_urdu?: unknown }).disable_auto_title_urdu)
        : allDisabled,
    };
  }

  return defaults;
}

function chorusHasContent(chorus: ChorusDraft): boolean {
  return (
    chorus.arabic.trim().length > 0 ||
    chorus.transliteration.trim().length > 0 ||
    chorus.translation.trim().length > 0 ||
    chorus.urdu_translation.trim().length > 0
  );
}

function extractChorusFromSections(sections: unknown): ChorusDraft {
  if (!Array.isArray(sections)) return { ...EMPTY_CHORUS };

  for (const rawSection of sections as ExistingSectionLike[]) {
    if (!rawSection || typeof rawSection !== 'object') continue;
    const chapter = typeof rawSection.chapter === 'string' ? rawSection.chapter.trim() : '';
    if (chapter !== CHORUS_MARKER) continue;

    return {
      arabic: typeof rawSection.arabic === 'string' ? rawSection.arabic : '',
      transliteration: typeof rawSection.transliteration === 'string' ? rawSection.transliteration : '',
      translation: typeof rawSection.translation === 'string' ? rawSection.translation : '',
      urdu_translation: typeof rawSection.urdu_translation === 'string' ? rawSection.urdu_translation : '',
    };
  }

  return { ...EMPTY_CHORUS };
}

const CHAPTER_PREFIX_REGEX = /^(?:#{1,6}\s*)?(chapter|chap|section|sec|باب|حصہ|سیکشن|فصل|جزء|قسم)(?=\s|[:\-،.]|$)\s*[:\-،.]?\s*(.*)$/iu;

function normalizeLocalizedDigits(value: string): string {
  return value
    // Arabic-Indic digits
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    // Eastern Arabic/Persian digits (used in Urdu)
    .replace(/[۰-۹]/g, (ch) => String(ch.charCodeAt(0) - 0x06F0));
}

function romanToInteger(value: string): number | null {
  const roman = value.toUpperCase();
  if (!/^[IVXLCDM]+$/.test(roman)) return null;

  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;

  for (let idx = 0; idx < roman.length; idx += 1) {
    const current = map[roman[idx]];
    const next = map[roman[idx + 1]];
    if (!current) return null;
    if (next && current < next) total -= current;
    else total += current;
  }

  return total > 0 ? total : null;
}

function normalizeHeadingSuffix(rawSuffix: string): string {
  const normalizedDigits = normalizeLocalizedDigits(rawSuffix).trim();
  if (!normalizedDigits) return '';

  const romanValue = romanToInteger(normalizedDigits);
  if (romanValue !== null) return String(romanValue);

  return normalizedDigits;
}

type ExistingSectionLike = {
  chapter?: unknown;
  chapter_arabic?: unknown;
  chapter_urdu?: unknown;
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
    const marker = chapterMatch[1]?.toLowerCase() ?? 'chapter';
    const suffix = normalizeHeadingSuffix(chapterMatch[2] ?? '');
    const isSection = marker === 'section' || marker === 'sec' || marker === 'حصہ' || marker === 'سیکشن' || marker === 'فصل';
    const label = isSection ? 'Section' : 'Chapter';
    return suffix ? `${label} ${suffix}` : label;
  }

  const normalizedStandalone = normalizeLocalizedDigits(normalized);
  if (/^(?:chapter|section)\s+[\divxlcdm]+$/i.test(normalizedStandalone)) {
    const [label, rawIndex] = normalizedStandalone.split(/\s+/, 2);
    const normalizedIndex = normalizeHeadingSuffix(rawIndex ?? '');
    return `${label[0].toUpperCase()}${label.slice(1).toLowerCase()} ${normalizedIndex}`.trim();
  }

  return null;
}

function parseBulkLineColumns(rawLine: string): string[] {
  return parseBulkLineColumnsWithDelimiter(rawLine, detectLineDelimiter(rawLine));
}

type BulkColumnDelimiter = '\t' | '||' | '|' | ';' | ',';

const BULK_COLUMN_DELIMITERS: BulkColumnDelimiter[] = ['\t', '||', '|', ';', ','];

function detectLineDelimiter(line: string): BulkColumnDelimiter | null {
  for (const delimiter of BULK_COLUMN_DELIMITERS) {
    if (delimiter === '\t' && line.includes('\t')) return delimiter;
    if (delimiter !== '\t' && line.includes(delimiter)) return delimiter;
  }
  return null;
}

function splitRespectingQuotes(value: string, delimiter: BulkColumnDelimiter): string[] {
  if (delimiter === '\t') {
    return value.split('\t').map((segment) => segment.trim());
  }

  const output: string[] = [];
  let token = '';
  let quote: '"' | '\'' | null = null;

  for (let idx = 0; idx < value.length; idx += 1) {
    const char = value[idx];

    if ((char === '"' || char === '\'') && (!quote || quote === char)) {
      quote = quote === char ? null : char;
      token += char;
      continue;
    }

    const matches = delimiter === '||'
      ? value.slice(idx, idx + 2) === '||'
      : char === delimiter;

    if (!quote && matches) {
      output.push(token.trim());
      token = '';
      if (delimiter === '||') idx += 1;
      continue;
    }

    token += char;
  }

  output.push(token.trim());
  return output;
}

function normalizeBulkColumn(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseBulkLineColumnsWithDelimiter(rawLine: string, delimiter: BulkColumnDelimiter | null): string[] {
  if (!delimiter) return [rawLine.trim()];
  return splitRespectingQuotes(rawLine, delimiter).map(normalizeBulkColumn);
}

function detectDominantBulkDelimiter(rawInput: string): BulkColumnDelimiter | null {
  const nonEmpty = rawInput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !parseChapterMarker(line));

  if (nonEmpty.length < 2) return null;

  let best: { delimiter: BulkColumnDelimiter; score: number; validLines: number } | null = null;

  for (const delimiter of BULK_COLUMN_DELIMITERS) {
    let validLines = 0;
    let score = 0;

    for (const line of nonEmpty) {
      const columns = parseBulkLineColumnsWithDelimiter(line, delimiter)
        .map((column) => column.trim())
        .filter(Boolean);

      if (columns.length >= 2 && columns.length <= 5) {
        validLines += 1;
        score += columns.length;
      }
    }

    if (validLines < 2) continue;

    const ratio = validLines / nonEmpty.length;
    if (ratio < 0.5) continue;

    const weightedScore = score + (ratio * 10);
    if (!best || weightedScore > best.score) {
      best = { delimiter, score: weightedScore, validLines };
    }
  }

  return best?.delimiter ?? null;
}

function shouldUseDelimitedMode(rawInput: string): boolean {
  return detectDominantBulkDelimiter(rawInput) !== null;
}

function detectScriptBucket(text: string): 'arabic' | 'latin' | 'other' {
  const arabicCount = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;

  if (arabicCount === 0 && latinCount === 0) return 'other';
  if (arabicCount >= latinCount * 1.5) return 'arabic';
  if (latinCount >= arabicCount * 1.5) return 'latin';
  if (arabicCount > latinCount) return 'arabic';
  if (latinCount > arabicCount) return 'latin';
  return 'other';
}

function isLikelyUrduText(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  const hasUrduLetters = /[ٹڈڑںےھہچژگپک]/.test(value);
  const hasQuranicDiacritics = /[\u064B-\u065F\u0670\u06D6-\u06ED]/.test(value);
  return hasUrduLetters && !hasQuranicDiacritics;
}

const NUMBER_WORD_MAP: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function parseManualSplitInstruction(instruction: string): ManualSplitRule | null {
  const normalized = instruction.trim().toLowerCase();
  if (!normalized) return null;

  const lineModeDigit = normalized.match(/\b(\d+)\s*lines?\s*(?:=|equals)\s*1\s*verse\b/);
  const lineModeEvery = normalized.match(/\b(?:every|after)\s*(\d+)\s*lines?\b/);
  if (lineModeDigit?.[1]) {
    const every = Number(lineModeDigit[1]);
    if (Number.isFinite(every) && every >= 1) return { kind: 'lines', every };
  }
  if (lineModeEvery?.[1]) {
    const every = Number(lineModeEvery[1]);
    if (Number.isFinite(every) && every >= 1) return { kind: 'lines', every };
  }

  const digitMatch = normalized.match(/\b(\d+)\b/);
  const wordMatch = normalized.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  const every = digitMatch
    ? Number(digitMatch[1])
    : (wordMatch ? NUMBER_WORD_MAP[wordMatch[1]] : 0);

  if (!Number.isFinite(every) || every < 1) return null;

  let symbol = '۞';
  const quotedSymbolMatch = instruction.match(/["'“”‘’]([^"'“”‘’])["'“”‘’]\s*symbol/i);
  if (quotedSymbolMatch?.[1]) {
    symbol = quotedSymbolMatch[1];
  } else {
    const explicitSymbolMatch = instruction.match(/symbol\s*[:=]\s*(\S)/i);
    if (explicitSymbolMatch?.[1]) symbol = explicitSymbolMatch[1];
  }

  return { kind: 'symbol', symbol, every };
}

function applySymbolSplitRule(rawInput: string, rule: SymbolSplitRule): string {
  const { symbol, every } = rule;
  const isStandaloneSymbolChunk = (value: string): boolean => {
    const compact = value.replace(/\s+/g, '');
    return compact.length > 0 && compact.split('').every((ch) => ch === symbol);
  };

  return rawInput
    .split('\n')
    .flatMap((rawLine) => {
      const line = rawLine.trim();
      if (!line) return [''];
      if (parseChapterMarker(line)) return [line];

      let count = 0;
      let chunk = '';
      const chunks: string[] = [];

      for (const ch of line) {
        chunk += ch;
        if (ch === symbol) {
          count += 1;
          if (count % every === 0) {
            if (chunk.trim()) chunks.push(chunk.trim());
            chunk = '';
          }
        }
      }

      if (chunk.trim()) chunks.push(chunk.trim());

      const cleaned = chunks.filter((part) => !isStandaloneSymbolChunk(part));
      return cleaned.length > 0 ? cleaned : [line];
    })
    .join('\n');
}

function applyManualSplitInstruction(rawInput: string, instruction: string): string {
  const parsed = parseManualSplitInstruction(instruction);
  if (!parsed) return rawInput;
  if (parsed.kind === 'lines') return applyLineGroupingRule(rawInput, parsed.every);
  return applySymbolSplitRule(rawInput, parsed);
}

function applyLineGroupingRule(rawInput: string, every: number): string {
  if (!Number.isFinite(every) || every <= 1) return rawInput;

  const output: string[] = [];
  let chunk: string[] = [];

  const flush = () => {
    if (chunk.length === 0) return;
    output.push(chunk.join(' ').replace(/\s+/g, ' ').trim());
    chunk = [];
  };

  rawInput
    .split('\n')
    .forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        // A whitespace-only line (e.g. one space) is an explicit manual
        // override that forces the current grouped verse to flush.
        // Truly empty lines are ignored.
        if (rawLine.length > 0) {
          flush();
        }
        return;
      }

      const chapter = parseChapterMarker(line);
      if (chapter) {
        flush();
        output.push(line);
        return;
      }

      chunk.push(line);
      if (chunk.length >= every) {
        flush();
      }
    });

  flush();
  return output.join('\n');
}

function inferSymbolSplitRule(rawInput: string): SymbolSplitRule | null {
  const lines = rawInput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !parseChapterMarker(line));

  if (lines.length < 2) return null;

  let best: { symbol: string; total: number; linesWith: number; linesWithAtLeastTwo: number } | null = null;

  for (const symbol of SPLIT_SYMBOL_CANDIDATES) {
    const counts = lines
      .map((line) => Array.from(line).filter((ch) => ch === symbol).length)
      .filter((count) => count > 0);

    if (counts.length < 2) continue;

    const total = counts.reduce((sum, count) => sum + count, 0);
    if (total < 4) continue;

    const linesWithAtLeastTwo = counts.filter((count) => count >= 2).length;
    const candidate = {
      symbol,
      total,
      linesWith: counts.length,
      linesWithAtLeastTwo,
    };

    if (!best) {
      best = candidate;
      continue;
    }

    if (candidate.total > best.total || (candidate.total === best.total && candidate.linesWith > best.linesWith)) {
      best = candidate;
    }
  }

  if (!best) return null;

  const every = DECORATIVE_SPLIT_SYMBOLS.has(best.symbol)
    ? 1
    : (best.linesWithAtLeastTwo >= Math.ceil(best.linesWith * 0.6) ? 2 : 1);
  return { symbol: best.symbol, every };
}

function resolvePrimaryField(primaryLanguage: PrimaryLanguage): 'arabic' | 'transliteration' | 'translation' | 'urdu_translation' {
  if (primaryLanguage === 'urdu') return 'urdu_translation';
  if (primaryLanguage === 'english') return 'translation';
  if (primaryLanguage === 'transliteration') return 'transliteration';
  return 'arabic';
}

function shouldTreatAsSameLanguageCouplet(
  left: string,
  right: string,
  primaryLanguage: PrimaryLanguage,
): boolean {
  if (!right.trim()) return false;
  if (primaryLanguage === 'auto') return false;

  const leftScript = detectScriptBucket(left);
  const rightScript = detectScriptBucket(right);
  if (leftScript === 'other' || rightScript === 'other') return false;
  if (leftScript !== rightScript) return false;

  if (primaryLanguage === 'urdu') return leftScript === 'arabic';
  if (primaryLanguage === 'arabic') return leftScript === 'arabic';
  return leftScript === 'latin';
}

const NUMBERED_VERSE_START_REGEX = /^\s*(?:(?:verse|ayah|aya|line)\s*)?(?:#\s*)?(?:\[\s*[0-9٠-٩۰-۹]{1,3}\s*\]|\(\s*[0-9٠-٩۰-۹]{1,3}\s*\)|[0-9٠-٩۰-۹]{1,3})\s*(?:[.)\-:]\s*|\s+)\S/iu;
const NUMBERED_VERSE_PREFIX_REGEX = /^\s*(?:(?:verse|ayah|aya|line)\s*)?(?:#\s*)?(?:\[\s*[0-9٠-٩۰-۹]{1,3}\s*\]|\(\s*[0-9٠-٩۰-۹]{1,3}\s*\)|[0-9٠-٩۰-۹]{1,3})\s*(?:[.)\-:]\s*|\s+)/iu;

function trimLeadingVerseNumber(line: string): string {
  return line.replace(NUMBERED_VERSE_PREFIX_REGEX, '').trim();
}

function isLikelySalwaatMarkerLine(line: string): boolean {
  return /[❁۞✽✦✧]/u.test(line);
}

function isLikelyNumberedTranslationLine(line: string): boolean {
  return NUMBERED_VERSE_START_REGEX.test(line);
}

function shouldMergeAsSalwaatVerse(
  stanza: string[],
  scripts: Array<'arabic' | 'latin' | 'other'>,
): boolean {
  if (stanza.length < 4 || !Number.isInteger(stanza.length / 2)) return false;

  const half = stanza.length / 2;
  const firstHalfScripts = scripts.slice(0, half);
  const secondHalfScripts = scripts.slice(half);

  const firstMostlyArabic = firstHalfScripts.filter((s) => s === 'arabic').length >= Math.max(1, Math.ceil(half * 0.75));
  const secondMostlyLatin = secondHalfScripts.filter((s) => s === 'latin').length >= Math.max(1, Math.ceil(half * 0.75));
  if (!firstMostlyArabic || !secondMostlyLatin) return false;

  const markerHits = stanza.slice(0, half).filter(isLikelySalwaatMarkerLine).length;
  const hasVerseMarkerPattern = markerHits >= Math.max(1, Math.ceil(half * 0.5));
  const hasNumberedTranslationStart = isLikelyNumberedTranslationLine(stanza[half] ?? '');

  return hasVerseMarkerPattern || hasNumberedTranslationStart;
}

function mergeAlternatingSalwaatRuns(
  stanza: string[],
  scripts: Array<'arabic' | 'latin' | 'other'>,
): Array<{ primary: string; secondary: string }> | null {
  type ScriptRun = {
    script: 'arabic' | 'latin';
    lines: string[];
  };

  const runs: ScriptRun[] = [];
  for (let idx = 0; idx < stanza.length; idx += 1) {
    const line = stanza[idx] ?? '';
    const script = scripts[idx] ?? 'other';

    // Keep punctuation/marker-only lines attached to the previous run.
    if (script === 'other') {
      if (runs.length > 0) runs[runs.length - 1].lines.push(line);
      continue;
    }

    const last = runs[runs.length - 1];
    if (last && last.script === script) {
      last.lines.push(line);
    } else {
      runs.push({ script, lines: [line] });
    }
  }

  if (runs.length < 4 || runs.length % 2 !== 0) return null;

  const pairs: Array<{ primary: string; secondary: string }> = [];
  let hasNumberedTranslation = false;
  let markerRichArabicRuns = 0;

  for (let idx = 0; idx < runs.length; idx += 2) {
    const urduRun = runs[idx];
    const englishRun = runs[idx + 1];
    if (!urduRun || !englishRun) return null;
    if (urduRun.script !== 'arabic' || englishRun.script !== 'latin') return null;

    const urduMarkerHits = urduRun.lines.filter(isLikelySalwaatMarkerLine).length;
    if (urduMarkerHits >= Math.max(1, Math.ceil(urduRun.lines.length * 0.5))) {
      markerRichArabicRuns += 1;
    }

    const englishLines = [...englishRun.lines];
    if (englishLines.length > 0 && isLikelyNumberedTranslationLine(englishLines[0])) {
      hasNumberedTranslation = true;
      englishLines[0] = trimLeadingVerseNumber(englishLines[0]);
    }

    const primary = urduRun.lines.map((line) => line.trim()).filter(Boolean).join('\n');
    const secondary = englishLines.map((line) => line.trim()).filter(Boolean).join('\n');
    if (!primary || !secondary) return null;

    pairs.push({ primary, secondary });
  }

  const hasStrongMarkerPattern = markerRichArabicRuns >= Math.max(1, Math.ceil(pairs.length * 0.5));
  if (!hasNumberedTranslation && !hasStrongMarkerPattern) return null;

  // This helper is for multi-pair alternating blocks. Single-pair blocks are handled earlier.
  if (pairs.length < 2) return null;

  return pairs.length > 0 ? pairs : null;
}

function parseBulkLinesAsStanzas(rawInput: string, primaryLanguage: PrimaryLanguage = 'auto'): ParsedLineRow[] {
  const lines = rawInput.split('\n');
  let currentChapter = '';
  let lineInChapter = 0;
  const rows: ParsedLineRow[] = [];

  let stanzaLines: string[] = [];

  const buildHeading = (chapter: string, lineNo: number): string => {
    const normalizedChapter = chapter.trim();
    if (!normalizedChapter) return `Line ${lineNo}`;
    return `${normalizedChapter} · Line ${lineNo}`;
  };

    const pushRow = (primaryRaw: string, secondaryRaw: string) => {
    const primary = primaryRaw.trim();
    const secondary = secondaryRaw.trim();
    if (!primary) return;

    const primaryField = primaryLanguage === 'auto'
      ? (detectScriptBucket(primary) === 'latin'
        ? 'translation'
        : (isLikelyUrduText(primary) ? 'urdu_translation' : 'arabic'))
      : resolvePrimaryField(primaryLanguage);
    const row: ParsedLineRow = {
      chapter: currentChapter,
      heading: '',
      arabic: '',
      transliteration: '',
      translation: '',
      urdu_translation: '',
    };

    lineInChapter += 1;
    row.heading = buildHeading(currentChapter, lineInChapter);

    if (shouldTreatAsSameLanguageCouplet(primary, secondary, primaryLanguage)) {
      const combined = secondary ? `${primary}\n${secondary}` : primary;
      row[primaryField] = combined;
      rows.push(row);
      return;
    }

    row[primaryField] = primary;

    if (secondary) {
      if (primaryField === 'urdu_translation') {
        if (detectScriptBucket(secondary) === 'latin') row.translation = secondary;
        else row.arabic = secondary;
      } else if (primaryField === 'translation') {
        if (detectScriptBucket(secondary) === 'arabic') row.urdu_translation = secondary;
        else row.transliteration = secondary;
      } else if (primaryField === 'transliteration') {
        if (detectScriptBucket(secondary) === 'arabic') row.urdu_translation = secondary;
        else row.translation = secondary;
      } else {
        row.translation = secondary;
      }
    }

    rows.push(row);
  };

  const flushStanza = () => {
    const stanza = stanzaLines
      .map((line) => line.trim())
      .filter(Boolean);

    stanzaLines = [];
    if (stanza.length === 0) return;

    if (stanza.length === 1) {
      pushRow(stanza[0], '');
      return;
    }

    if (stanza.length === 2) {
      pushRow(stanza[0], stanza[1]);
      return;
    }

    const pushAdjacentPairs = () => {
      for (let idx = 0; idx < stanza.length; idx += 2) {
        pushRow(stanza[idx] ?? '', stanza[idx + 1] ?? '');
      }
    };

    const scripts = stanza.map((line) => detectScriptBucket(line));

    // Salwaat.com style blocks often come as Urdu couplet lines first, then numbered English translation lines.
    // Merge each half into one verse row instead of zipping line-by-line.
    if (shouldMergeAsSalwaatVerse(stanza, scripts)) {
      const half = stanza.length / 2;
      const primaryCombined = stanza.slice(0, half).join('\n');
      const secondaryCombined = stanza
        .slice(half)
        .map((line, idx) => (idx === 0 ? trimLeadingVerseNumber(line) : line.trim()))
        .filter(Boolean)
        .join('\n');
      pushRow(primaryCombined, secondaryCombined);
      return;
    }

    // Salwaat.com often alternates as: Urdu couplet, English couplet, Urdu couplet, English couplet (no blank lines).
    // Merge each alternating run pair into a single verse row.
    const alternatingPairs = mergeAlternatingSalwaatRuns(stanza, scripts);
    if (alternatingPairs) {
      for (const pair of alternatingPairs) {
        pushRow(pair.primary, pair.secondary);
      }
      return;
    }

    // Pattern A/A.../B/B... with equal halves: zip rows while preserving first-language ordering.
    const half = stanza.length / 2;
    if (Number.isInteger(half)) {
      const firstHalf = scripts.slice(0, half).filter((script) => script !== 'other');
      const secondHalf = scripts.slice(half).filter((script) => script !== 'other');
      const firstMajor = firstHalf[0] ?? null;
      const secondMajor = secondHalf[0] ?? null;
      const firstUniform = firstMajor ? firstHalf.every((script) => script === firstMajor) : false;
      const secondUniform = secondMajor ? secondHalf.every((script) => script === secondMajor) : false;

      if (firstUniform && secondUniform && firstMajor !== secondMajor) {
        for (let idx = 0; idx < half; idx += 1) {
          pushRow(stanza[idx] ?? '', stanza[half + idx] ?? '');
        }
        return;
      }
    }

    // Fallback: always pair adjacent lines instead of collapsing everything into one row.
    pushAdjacentPairs();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushStanza();
      continue;
    }

    const chapter = parseChapterMarker(line);
    if (chapter) {
      flushStanza();
      currentChapter = chapter;
      lineInChapter = 0;
      continue;
    }

    const isReference = /^\[[^\]]+\]$/.test(line);
    if (isReference && stanzaLines.length > 0) {
      const lastIndex = stanzaLines.length - 1;
      stanzaLines[lastIndex] = `${stanzaLines[lastIndex]} ${line}`.trim();
      continue;
    }

    stanzaLines.push(line);
  }

  flushStanza();
  return rows;
}

function parseBulkLines(rawInput: string, splitInstruction?: string, primaryLanguage: PrimaryLanguage = 'auto'): ParsedLineRow[] {
  const dominantDelimiter = detectDominantBulkDelimiter(rawInput);
  const hasDelimiterColumns = dominantDelimiter !== null;
  if (!hasDelimiterColumns) {
    const prepared = (() => {
      const manual = splitInstruction?.trim() ?? '';
      if (manual) return applyManualSplitInstruction(rawInput, manual);

      const inferred = inferSymbolSplitRule(rawInput);
      return inferred ? applySymbolSplitRule(rawInput, inferred) : rawInput;
    })();

    return parseBulkLinesAsStanzas(prepared, primaryLanguage);
  }

  const lines = rawInput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let currentChapter = '';
  let lineInChapter = 0;

  const buildHeading = (chapter: string, lineNo: number): string => {
    const normalizedChapter = chapter.trim();
    if (!normalizedChapter) return `Line ${lineNo}`;
    return `${normalizedChapter} · Line ${lineNo}`;
  };

  return lines
    .map((line) => {
      const chapter = parseChapterMarker(line);
      if (chapter) {
        currentChapter = chapter;
        lineInChapter = 0;
        return null;
      }

      const columns = parseBulkLineColumnsWithDelimiter(line, dominantDelimiter).filter((column) => column.length > 0);
      if (columns.length < 2) return null;

      lineInChapter += 1;
      const heading = buildHeading(currentChapter, lineInChapter);

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

type BulkLanguageBlocks = {
  arabic: string;
  transliteration: string;
  english: string;
  urdu: string;
};

function mapPrimaryLanguageToBlockKey(primaryLanguage: PrimaryLanguage): BulkLanguageBlockKey | null {
  if (primaryLanguage === 'arabic') return 'arabic';
  if (primaryLanguage === 'transliteration') return 'transliteration';
  if (primaryLanguage === 'english') return 'english';
  if (primaryLanguage === 'urdu') return 'urdu';
  return null;
}

function mapBlockKeyToParsedField(key: BulkLanguageBlockKey): keyof ParsedLineRow {
  if (key === 'english') return 'translation';
  if (key === 'urdu') return 'urdu_translation';
  return key;
}

function shouldApplyLineGroupingToLanguage(key: BulkLanguageBlockKey): boolean {
  return key === 'arabic' || key === 'urdu';
}

function shouldCollapseNumberedVerseContinuations(key: BulkLanguageBlockKey): boolean {
  return key === 'english' || key === 'transliteration' || key === 'urdu';
}

function collapseNumberedVerseContinuations(rawInput: string): string {
  const lines = rawInput.split('\n');
  const output: string[] = [];
  let current = '';
  let currentFromNumber = false;

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) output.push(trimmed);
    current = '';
    currentFromNumber = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }

    if (parseChapterMarker(line)) {
      flush();
      output.push(line);
      continue;
    }

    if (isLikelyNumberedTranslationLine(line)) {
      flush();
      current = line;
      currentFromNumber = true;
      continue;
    }

    if (currentFromNumber) {
      current = `${current} ${line}`.replace(/\s+/g, ' ').trim();
      continue;
    }

    flush();
    output.push(line);
  }

  flush();
  return output.join('\n');
}

function prepareBulkLanguageBlock(
  text: string,
  splitInstruction?: string,
  lineGrouping: LineGrouping = 'auto',
  applyLineGrouping = true,
  key?: BulkLanguageBlockKey,
  numberedVerseContinuation = true,
): string {
  const raw = text.trim();
  if (!raw) return '';

  const manual = splitInstruction?.trim() ?? '';
  const groupedEvery = lineGrouping === 'auto' ? 0 : Number(lineGrouping);
  const hasExplicitGrouping = Number.isFinite(groupedEvery) && groupedEvery > 1;

  const splitApplied = (() => {
    if (manual) return applyManualSplitInstruction(raw, manual);
    // When explicit line grouping is selected (e.g. 2 lines = 1 verse),
    // keep source lines stable and skip heuristic symbol splitting.
    if (hasExplicitGrouping) return raw;
    const inferred = inferSymbolSplitRule(raw);
    return inferred ? applySymbolSplitRule(raw, inferred) : raw;
  })();

  const grouped = applyLineGrouping && Number.isFinite(groupedEvery) && groupedEvery > 1
    ? applyLineGroupingRule(splitApplied, groupedEvery)
    : splitApplied;

  if (numberedVerseContinuation && key && shouldCollapseNumberedVerseContinuations(key)) {
    return collapseNumberedVerseContinuations(grouped);
  }

  return grouped;
}

function toBlockLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function toVerseOnlyLines(raw: string): string[] {
  return toBlockLines(raw).filter((line) => !parseChapterMarker(line));
}

function parseBulkLanguageBlocks(
  blocks: BulkLanguageBlocks,
  primaryLanguage: PrimaryLanguage,
  splitInstruction?: string,
  lineGrouping: LineGrouping = 'auto',
  numberedVerseContinuation = true,
): ParsedLineRow[] {
  const preparedBlocks: Record<BulkLanguageBlockKey, string> = {
    arabic: prepareBulkLanguageBlock(blocks.arabic, splitInstruction, lineGrouping, shouldApplyLineGroupingToLanguage('arabic'), 'arabic', numberedVerseContinuation),
    transliteration: prepareBulkLanguageBlock(blocks.transliteration, splitInstruction, lineGrouping, shouldApplyLineGroupingToLanguage('transliteration'), 'transliteration', numberedVerseContinuation),
    english: prepareBulkLanguageBlock(blocks.english, splitInstruction, lineGrouping, shouldApplyLineGroupingToLanguage('english'), 'english', numberedVerseContinuation),
    urdu: prepareBulkLanguageBlock(blocks.urdu, splitInstruction, lineGrouping, shouldApplyLineGroupingToLanguage('urdu'), 'urdu', numberedVerseContinuation),
  };

  const requestedPrimary = mapPrimaryLanguageToBlockKey(primaryLanguage);
  const fallbackOrder: BulkLanguageBlockKey[] = ['english', 'transliteration', 'urdu', 'arabic'];
  const primaryKey = requestedPrimary
    ? (preparedBlocks[requestedPrimary].trim().length > 0 ? requestedPrimary : null)
    : fallbackOrder.find((key) => preparedBlocks[key].trim().length > 0);

  if (!primaryKey) return [];

  const primaryLines = toBlockLines(preparedBlocks[primaryKey]);
  const verseLinesByKey: Record<BulkLanguageBlockKey, string[]> = {
    arabic: toVerseOnlyLines(preparedBlocks.arabic),
    transliteration: toVerseOnlyLines(preparedBlocks.transliteration),
    english: toVerseOnlyLines(preparedBlocks.english),
    urdu: toVerseOnlyLines(preparedBlocks.urdu),
  };

  let currentChapter = '';
  let lineInChapter = 0;
  let verseIndex = 0;
  const rows: ParsedLineRow[] = [];

  const buildHeading = (chapter: string, lineNo: number): string => {
    const normalizedChapter = chapter.trim();
    if (!normalizedChapter) return `Line ${lineNo}`;
    return `${normalizedChapter} · Line ${lineNo}`;
  };

  for (const rawLine of primaryLines) {
    const line = rawLine.trim();
    if (!line) continue;

    const chapter = parseChapterMarker(line);
    if (chapter) {
      currentChapter = chapter;
      lineInChapter = 0;
      continue;
    }

    lineInChapter += 1;
    const row: ParsedLineRow = {
      chapter: currentChapter,
      heading: buildHeading(currentChapter, lineInChapter),
      arabic: '',
      transliteration: '',
      translation: '',
      urdu_translation: '',
    };

    const primaryField = mapBlockKeyToParsedField(primaryKey);
    row[primaryField] = line;

    for (const key of fallbackOrder) {
      if (key === primaryKey) continue;
      const field = mapBlockKeyToParsedField(key);
      row[field] = verseLinesByKey[key][verseIndex] ?? '';
    }

    rows.push(row);
    verseIndex += 1;
  }

  return rows;
}

function buildBulkLanguageBlocksFromSections(sections: unknown): BulkLanguageBlocks {
  if (!Array.isArray(sections)) {
    return { arabic: '', transliteration: '', english: '', urdu: '' };
  }

  // Preserve exact editor bulk box values (including intentionally-empty Arabic)
  // when available, instead of rehydrating from possibly auto-generated section rows.
  for (const rawSection of sections as ExistingSectionLike[]) {
    if (!rawSection || typeof rawSection !== 'object') continue;
    const chapter = typeof rawSection.chapter === 'string' ? rawSection.chapter.trim() : '';
    if (chapter !== SETTINGS_MARKER) continue;

    const lockArabic = Boolean((rawSection as { bulk_source_arabic_locked?: unknown }).bulk_source_arabic_locked);
    const lockTranslit = Boolean((rawSection as { bulk_source_transliteration_locked?: unknown }).bulk_source_transliteration_locked);
    const lockEnglish = Boolean((rawSection as { bulk_source_english_locked?: unknown }).bulk_source_english_locked);
    const lockUrdu = Boolean((rawSection as { bulk_source_urdu_locked?: unknown }).bulk_source_urdu_locked);
    const savedArabic = (rawSection as { bulk_source_arabic?: unknown }).bulk_source_arabic;
    const savedTranslit = (rawSection as { bulk_source_transliteration?: unknown }).bulk_source_transliteration;
    const savedEnglish = (rawSection as { bulk_source_english?: unknown }).bulk_source_english;
    const savedUrdu = (rawSection as { bulk_source_urdu?: unknown }).bulk_source_urdu;

    const hasSavedSources =
      lockArabic
      || lockTranslit
      || lockEnglish
      || lockUrdu
      || typeof savedArabic === 'string'
      || typeof savedTranslit === 'string'
      || typeof savedEnglish === 'string'
      || typeof savedUrdu === 'string';

    if (hasSavedSources) {
      return {
        arabic: lockArabic ? '' : (typeof savedArabic === 'string' ? savedArabic : ''),
        transliteration: lockTranslit ? '' : (typeof savedTranslit === 'string' ? savedTranslit : ''),
        english: lockEnglish ? '' : (typeof savedEnglish === 'string' ? savedEnglish : ''),
        urdu: lockUrdu ? '' : (typeof savedUrdu === 'string' ? savedUrdu : ''),
      };
    }
  }

  const arabicLines: string[] = [];
  const transliterationLines: string[] = [];
  const englishLines: string[] = [];
  const urduLines: string[] = [];

  for (const rawSection of sections as ExistingSectionLike[]) {
    if (!rawSection || typeof rawSection !== 'object') continue;

    const chapter = typeof rawSection.chapter === 'string' ? rawSection.chapter.trim() : '';
    if (chapter === CHORUS_MARKER || chapter === SETTINGS_MARKER) continue;

    const arabic = typeof rawSection.arabic === 'string' ? rawSection.arabic.trim() : '';
    const transliteration = typeof rawSection.transliteration === 'string' ? rawSection.transliteration.trim() : '';
    const translation = typeof rawSection.translation === 'string' ? rawSection.translation.trim() : '';
    const urdu = typeof rawSection.urdu_translation === 'string' ? rawSection.urdu_translation.trim() : '';

    if (arabic) arabicLines.push(arabic);
    if (transliteration) transliterationLines.push(transliteration);
    if (translation) englishLines.push(translation);
    if (urdu) urduLines.push(urdu);
  }

  return {
    arabic: arabicLines.join('\n'),
    transliteration: transliterationLines.join('\n'),
    english: englishLines.join('\n'),
    urdu: urduLines.join('\n'),
  };
}

function createChapterDraft(title: string, seed = Date.now()): ChapterDraft {
  return {
    id: `chapter-${seed}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    title_arabic: '',
    title_urdu: '',
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

    if (chapterTitle === CHORUS_MARKER || chapterTitle === SETTINGS_MARKER) continue;

    if (!chapterMap.has(chapterTitle)) {
      chapterMap.set(chapterTitle, createChapterDraft(chapterTitle, chapterMap.size + 1));
    }

    const chapter = chapterMap.get(chapterTitle);
    if (!chapter) continue;

    const chapterArabicTitle = typeof rawSection.chapter_arabic === 'string' ? rawSection.chapter_arabic.trim() : '';
    const chapterUrduTitle = typeof rawSection.chapter_urdu === 'string' ? rawSection.chapter_urdu.trim() : '';
    if (chapterArabicTitle && !chapter.title_arabic) chapter.title_arabic = chapterArabicTitle;
    if (chapterUrduTitle && !chapter.title_urdu) chapter.title_urdu = chapterUrduTitle;

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
    const chapterArabicTitle = chapter.title_arabic.trim();
    const chapterUrduTitle = chapter.title_urdu.trim();
    const arabicLines = toMeaningfulLines(chapter.arabic);
    const translitLines = toMeaningfulLines(chapter.transliteration);
    const englishLines = toMeaningfulLines(chapter.translation);
    const urduLines = toMeaningfulLines(chapter.urdu_translation);

    const lineCount = Math.max(arabicLines.length, translitLines.length, englishLines.length, urduLines.length);
    let firstRowForChapter = true;

    for (let index = 0; index < lineCount; index += 1) {
      const arabic = arabicLines[index] ?? '';
      const transliteration = translitLines[index] ?? '';
      const translation = englishLines[index] ?? '';
      const urdu = urduLines[index] ?? '';

      if (!arabic && !transliteration && !translation && !urdu) continue;

      rows.push({
        chapter: chapterTitle,
        chapter_arabic: firstRowForChapter && chapterArabicTitle ? chapterArabicTitle : undefined,
        chapter_urdu: firstRowForChapter && chapterUrduTitle ? chapterUrduTitle : undefined,
        heading: `${chapterTitle} · Line ${rows.filter((row) => row.chapter === chapterTitle).length + 1}`,
        arabic,
        transliteration,
        translation,
        urdu_translation: urdu,
      });
      firstRowForChapter = false;
    }
  }

  return rows;
}

function toFixRows(rows: ParsedLineRow[]): FixRow[] {
  return rows.map((row, index) => ({ ...row, id: `fix-${index}-${Math.random().toString(36).slice(2, 8)}` }));
}

function splitPrimaryText(value: string): { left: string; right: string } {
  const text = value.trim();
  if (!text) return { left: '', right: '' };

  const symbolMatch = text.match(/\s*[۞٭*•]\s*/u);
  if (symbolMatch && typeof symbolMatch.index === 'number') {
    const splitAt = symbolMatch.index + symbolMatch[0].length;
    return {
      left: text.slice(0, splitAt).trim(),
      right: text.slice(splitAt).trim(),
    };
  }

  const commaMatch = text.match(/[،,;:]\s*/u);
  if (commaMatch && typeof commaMatch.index === 'number') {
    const splitAt = commaMatch.index + commaMatch[0].length;
    return {
      left: text.slice(0, splitAt).trim(),
      right: text.slice(splitAt).trim(),
    };
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { left: text, right: '' };
  const midpoint = Math.ceil(words.length / 2);
  return {
    left: words.slice(0, midpoint).join(' ').trim(),
    right: words.slice(midpoint).join(' ').trim(),
  };
}

function fixRowsToBulkBlocks(rows: FixRow[], primaryLanguage: PrimaryLanguage): BulkLanguageBlocks {
  const primaryKey = mapPrimaryLanguageToBlockKey(primaryLanguage) ?? 'arabic';
  const primaryField = mapBlockKeyToParsedField(primaryKey);

  const primaryLines: string[] = [];
  const transliterationLines: string[] = [];
  const englishLines: string[] = [];
  const urduLines: string[] = [];

  let lastChapter = '';

  rows.forEach((row) => {
    const chapter = row.chapter.trim();
    if (chapter && chapter !== lastChapter) {
      primaryLines.push(chapter);
      lastChapter = chapter;
    }

    const primaryValue = (row[primaryField] as string | undefined)?.trim() ?? '';
    primaryLines.push(primaryValue);
    transliterationLines.push(row.transliteration ?? '');
    englishLines.push(row.translation ?? '');
    urduLines.push(row.urdu_translation ?? '');
  });

  return {
    arabic: primaryKey === 'arabic' ? primaryLines.join('\n') : rows.map((row) => row.arabic ?? '').join('\n'),
    transliteration: primaryKey === 'transliteration' ? primaryLines.join('\n') : transliterationLines.join('\n'),
    english: primaryKey === 'english' ? primaryLines.join('\n') : englishLines.join('\n'),
    urdu: primaryKey === 'urdu' ? primaryLines.join('\n') : urduLines.join('\n'),
  };
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
  const autoSettings = extractAutoTranslationSettingsFromSections(row.sections);
  const blocksFromSections = buildBulkLanguageBlocksFromSections(row.sections);
  const hasStructuredSections = Array.isArray(row.sections) && row.sections.length > 0;
  return {
    title: row.title,
    arabic_title: row.arabic_title ?? '',
    primary_language: autoSettings.primary_language === 'auto' ? 'arabic' : autoSettings.primary_language,
    font_scale_arabic: autoSettings.font_scale_arabic,
    font_scale_transliteration: autoSettings.font_scale_transliteration,
    font_scale_english: autoSettings.font_scale_english,
    font_scale_urdu: autoSettings.font_scale_urdu,
    bulk_split_instruction: autoSettings.bulk_split_instruction,
    bulk_line_grouping: autoSettings.bulk_line_grouping,
    bulk_numbered_verse_continuation: autoSettings.bulk_numbered_verse_continuation,
    bulk_arabic_lines: hasStructuredSections ? blocksFromSections.arabic : (row.arabic ?? ''),
    bulk_transliteration_lines: hasStructuredSections ? blocksFromSections.transliteration : (row.transliteration ?? ''),
    bulk_english_lines: hasStructuredSections ? blocksFromSections.english : (row.translation ?? ''),
    bulk_urdu_lines: hasStructuredSections ? blocksFromSections.urdu : (row.urdu_translation ?? ''),
    disable_auto_transliteration: autoSettings.disable_auto_transliteration,
    disable_auto_arabic: autoSettings.disable_auto_arabic,
    disable_auto_english: autoSettings.disable_auto_english,
    disable_auto_urdu: autoSettings.disable_auto_urdu,
    disable_auto_title_arabic: autoSettings.disable_auto_title_arabic,
    disable_auto_title_english: autoSettings.disable_auto_title_english,
    disable_auto_title_urdu: autoSettings.disable_auto_title_urdu,
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
    is_active: row.is_active,
  };
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function clampLanguageFontScale(value: number): number {
  return Math.max(0.7, Math.min(1.8, Number(value.toFixed(2))));
}

function hasAnyCoreText(form: EditorFormState): boolean {
  return [
    form.arabic,
    form.transliteration,
    form.translation,
    form.urdu_translation,
    form.description,
    form.bulk_arabic_lines,
    form.bulk_transliteration_lines,
    form.bulk_english_lines,
    form.bulk_urdu_lines,
  ].some((field) => field.trim().length > 0);
}

// ============================================================================
// UI HELPERS — section wrapper + app preview pane
// ============================================================================

function Section({
  title,
  description,
  icon,
  children,
  tone = 'default',
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'default' | 'accent' | 'amber';
}) {
  const toneClass =
    tone === 'accent'
      ? 'border-emerald-200 bg-emerald-50/40'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50/50'
        : 'border-[hsl(140_20%_88%)] bg-white';
  return (
    <section className={`rounded-xl border ${toneClass} p-4 space-y-3`}>
      <header className="flex items-start gap-2">
        {icon ? <div className="mt-0.5 text-[hsl(142_60%_32%)]">{icon}</div> : null}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[hsl(150_30%_15%)]">{title}</h3>
          {description ? (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          ) : null}
        </div>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

type PreviewLayers = { arabic: boolean; transliteration: boolean; english: boolean; urdu: boolean };

type PreviewVerse = {
  key: string;
  role: 'opening-chorus' | 'verse' | 'closing-chorus';
  chapterLabel?: string;
  verseNumber?: number;
  arabic: string;
  transliteration: string;
  translation: string;
  urdu: string;
};

function orderLanguages(primary: PrimaryLanguage): Array<'arabic' | 'transliteration' | 'english' | 'urdu'> {
  const all: Array<'arabic' | 'transliteration' | 'english' | 'urdu'> = ['arabic', 'transliteration', 'english', 'urdu'];
  if (primary === 'arabic' || primary === 'transliteration' || primary === 'urdu') {
    const key = primary === 'urdu' ? 'urdu' : primary;
    return [key, ...all.filter((k) => k !== key)];
  }
  if (primary === 'english') return ['english', 'arabic', 'transliteration', 'urdu'];
  return all;
}

function renderInlineFormatted(text: string): React.ReactNode {
  // Lightweight inline: **bold**, __underline__, ==highlight==
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|__[^_]+__|==[^=]+==)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) parts.push(<strong key={`b-${i++}`}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('__')) parts.push(<u key={`u-${i++}`}>{token.slice(2, -2)}</u>);
    else parts.push(<mark key={`h-${i++}`} className="bg-amber-100 px-0.5 rounded">{token.slice(2, -2)}</mark>);
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function PreviewVerseCard({
  verse,
  primary,
  layers,
  isPoem,
  disableArabic,
  disableTransliteration,
  disableEnglish,
  disableUrdu,
}: {
  verse: PreviewVerse;
  primary: PrimaryLanguage;
  layers: PreviewLayers;
  isPoem: boolean;
  disableArabic: boolean;
  disableTransliteration: boolean;
  disableEnglish: boolean;
  disableUrdu: boolean;
}) {
  const order = orderLanguages(primary);
  const isChorus = verse.role !== 'verse';
  const label = verse.role === 'opening-chorus'
    ? 'Opening Chorus'
    : verse.role === 'closing-chorus'
      ? 'Closing Chorus'
      : verse.verseNumber ? `Verse ${verse.verseNumber}` : 'Verse';

  const blocks: Record<'arabic' | 'transliteration' | 'english' | 'urdu', React.ReactNode> = {
    arabic: layers.arabic && !disableArabic && verse.arabic ? (
      <p key="arabic" dir="rtl" className="font-arabic text-right text-[22px] leading-[2] text-[hsl(150_30%_15%)]">
        {renderInlineFormatted(verse.arabic)}
      </p>
    ) : null,
    transliteration: layers.transliteration && !disableTransliteration && verse.transliteration ? (
      <p key="transliteration" className="italic text-[15px] leading-relaxed text-[hsl(150_25%_25%)]">
        {renderInlineFormatted(verse.transliteration)}
      </p>
    ) : null,
    english: layers.english && !disableEnglish && verse.translation ? (
      <p key="english" className="text-[14px] leading-relaxed text-[hsl(150_20%_28%)]">
        {renderInlineFormatted(verse.translation)}
      </p>
    ) : null,
    urdu: layers.urdu && !disableUrdu && verse.urdu ? (
      <p key="urdu" dir="rtl" className="font-urdu text-right text-[18px] leading-[1.9] text-[hsl(150_20%_25%)]">
        {renderInlineFormatted(verse.urdu)}
      </p>
    ) : null,
  };

  const anyVisible = order.some((k) => blocks[k]);
  if (!anyVisible) return null;

  const chorusClasses = isChorus
    ? 'border-[#d4af37]/40 bg-gradient-to-br from-[#fdf6e3]/80 to-[#f5e9c9]/50'
    : 'border-[hsl(140_20%_88%)] bg-white';

  return (
    <div className={`rounded-lg border ${chorusClasses} p-3 space-y-2`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] uppercase tracking-wider font-semibold ${isChorus ? 'text-[#8a6a18]' : 'text-[hsl(142_60%_32%)]'}`}>
          {label}
        </span>
        {!isPoem && verse.chapterLabel && !isChorus ? (
          <span className="text-[10px] text-muted-foreground truncate max-w-[60%]">{verse.chapterLabel}</span>
        ) : null}
      </div>
      {order.map((k) => blocks[k])}
    </div>
  );
}

function EntryPreviewPane({
  form,
  chorusDraft,
  chapterDrafts,
  composeMode,
  modalType,
}: {
  form: EditorFormState;
  chorusDraft: ChorusDraft;
  chapterDrafts: ChapterDraft[];
  composeMode: EntryComposeMode;
  modalType: QaseedahNaatType;
}) {
  const [layers, setLayers] = useState<PreviewLayers>({ arabic: true, transliteration: true, english: true, urdu: true });
  const [isPoem, setIsPoem] = useState(false);

  const rows: ParsedLineRow[] = useMemo(() => {
    try {
      if (composeMode === 'chapters') {
        return buildRowsFromChapterDrafts(chapterDrafts);
      }
      const split = form.bulk_split_instruction.trim();
      const hasAny = [form.bulk_arabic_lines, form.bulk_transliteration_lines, form.bulk_english_lines, form.bulk_urdu_lines]
        .some((v) => v.trim().length > 0);
      if (!hasAny) return [];
      return parseBulkLanguageBlocks(
        {
          arabic: form.bulk_arabic_lines,
          transliteration: form.bulk_transliteration_lines,
          english: form.bulk_english_lines,
          urdu: form.bulk_urdu_lines,
        },
        form.primary_language,
        split,
        form.bulk_line_grouping,
        form.bulk_numbered_verse_continuation,
      );
    } catch {
      return [];
    }
  }, [composeMode, chapterDrafts, form.bulk_split_instruction, form.bulk_line_grouping, form.bulk_numbered_verse_continuation, form.primary_language, form.bulk_arabic_lines, form.bulk_transliteration_lines, form.bulk_english_lines, form.bulk_urdu_lines]);

  // Group rows by chapter preserving order
  const chapters = useMemo(() => {
    const result: Array<{ title: string; titleArabic?: string; titleUrdu?: string; verses: PreviewVerse[] }> = [];
    let current: { title: string; titleArabic?: string; titleUrdu?: string; verses: PreviewVerse[] } | null = null;
    let verseCounter = 0;
    rows.forEach((row, idx) => {
      const chTitle = row.chapter?.trim() || '';
      if (!current || current.title !== chTitle) {
        current = {
          title: chTitle,
          titleArabic: row.chapter_arabic,
          titleUrdu: row.chapter_urdu,
          verses: [],
        };
        result.push(current);
        verseCounter = 0;
      }
      verseCounter += 1;
      const arabicText = (row.arabic || '').trim();
      const urduText = (row.urdu_translation || '').trim();
      const shouldTreatArabicAsUrdu = !urduText && isLikelyUrduText(arabicText);
      current.verses.push({
        key: `v-${idx}`,
        role: 'verse',
        chapterLabel: chTitle,
        verseNumber: verseCounter,
        arabic: shouldTreatArabicAsUrdu ? '' : row.arabic,
        transliteration: row.transliteration,
        translation: row.translation,
        urdu: shouldTreatArabicAsUrdu ? row.arabic : row.urdu_translation,
      });
    });
    return result;
  }, [rows]);

  const hasChorus = chorusHasContent(chorusDraft);
  const chorusVerse = (role: 'opening-chorus' | 'closing-chorus'): PreviewVerse => ({
    key: role,
    role,
    arabic: chorusDraft.arabic,
    transliteration: chorusDraft.transliteration,
    translation: chorusDraft.translation,
    urdu: chorusDraft.urdu_translation,
  });

  const verseTotal = chapters.reduce((sum, c) => sum + c.verses.length, 0);
  const isEmpty = verseTotal === 0 && !hasChorus && !form.title.trim() && !form.arabic_title.trim();

  const typePill = modalType === 'qaseedah'
    ? { label: 'Qaseedah', bg: 'bg-emerald-100', text: 'text-emerald-800' }
    : { label: 'Naat', bg: 'bg-amber-100', text: 'text-amber-800' };

  return (
    <div className="rounded-xl border border-[hsl(140_20%_88%)] bg-white overflow-hidden">
      {/* Phone frame header */}
      <div className="flex items-center justify-between gap-2 bg-[hsl(150_30%_12%)] px-3 py-2 text-white">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-[10px] uppercase tracking-widest text-white/70 ml-1.5">App preview</span>
        </div>
        <span className="text-[10px] text-white/60">{verseTotal} verses</span>
      </div>

      {/* Reading preferences bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[hsl(140_20%_92%)] bg-[hsl(140_25%_97%)] px-3 py-2">
        {([
          ['arabic', 'ع'],
          ['transliteration', 'Aa'],
          ['english', 'EN'],
          ['urdu', 'اُ'],
        ] as const).map(([key, label]) => {
          const active = layers[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${active
                ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                : 'border-[hsl(140_20%_88%)] bg-white text-muted-foreground'}`}
              title={`Toggle ${key}`}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setIsPoem((p) => !p)}
          className={`ml-auto rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${isPoem
            ? 'border-amber-300 bg-amber-100 text-amber-800'
            : 'border-[hsl(140_20%_88%)] bg-white text-muted-foreground'}`}
          title="Toggle poem mode (hides chapter labels)"
        >
          Poem mode
        </button>
      </div>

      {/* Content (phone-like frame) */}
      <div className="max-h-[640px] overflow-y-auto bg-[hsl(140_25%_98%)] px-3 py-4 space-y-4">
        {isEmpty ? (
          <div className="rounded-lg border border-dashed border-[hsl(140_20%_86%)] bg-white p-6 text-center text-xs text-muted-foreground">
            Start adding a title, chapters, or bulk text to see a live preview.
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="rounded-lg border border-[#d4af37]/30 bg-white p-3 text-center space-y-2">
              <div className="text-[10px] tracking-[0.25em] text-[#8a6a18]">﹏ ۞ ﹏</div>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${typePill.bg} ${typePill.text}`}>
                {typePill.label}
              </span>
              {form.title ? (
                <h2 className="text-lg font-semibold text-[hsl(150_30%_15%)]" style={{ fontFamily: 'Georgia, serif' }}>
                  {form.title}
                </h2>
              ) : null}
              {form.arabic_title ? (
                <p dir="rtl" className="font-arabic text-[22px] text-[hsl(150_30%_15%)]">
                  {form.arabic_title}
                </p>
              ) : null}
              {form.reference ? (
                <p className="text-[11px] text-muted-foreground italic">{form.reference}</p>
              ) : null}
              <div className="text-[10px] tracking-[0.25em] text-[#8a6a18]">﹏ ۞ ﹏</div>
            </div>

            {/* Opening chorus */}
            {hasChorus ? (
              <PreviewVerseCard
                verse={chorusVerse('opening-chorus')}
                primary={form.primary_language}
                layers={layers}
                isPoem={isPoem}
                disableArabic={form.disable_auto_arabic}
                disableTransliteration={form.disable_auto_transliteration}
                disableEnglish={form.disable_auto_english}
                disableUrdu={form.disable_auto_urdu}
              />
            ) : null}

            {/* Chapters */}
            {chapters.map((chapter, idx) => (
              <div key={`ch-${idx}`} className="space-y-2">
                {!isPoem && chapter.title ? (
                  <div className="rounded-lg border border-[#d4af37]/30 bg-[#fdf6e3]/60 p-2 text-center">
                    <p className="text-[10px] tracking-[0.2em] text-[#8a6a18]">﹏ CHAPTER ﹏</p>
                    <p className="text-sm font-semibold text-[hsl(150_30%_15%)]" style={{ fontFamily: 'Georgia, serif' }}>
                      {chapter.title}
                    </p>
                    {chapter.titleArabic ? (
                      <p dir="rtl" className="font-arabic text-base text-[hsl(150_30%_15%)]">{chapter.titleArabic}</p>
                    ) : null}
                    {chapter.titleUrdu ? (
                      <p dir="rtl" className="font-urdu text-sm text-[hsl(150_30%_15%)]">{chapter.titleUrdu}</p>
                    ) : null}
                  </div>
                ) : null}
                {chapter.verses.map((verse) => (
                  <PreviewVerseCard
                    key={verse.key}
                    verse={verse}
                    primary={form.primary_language}
                    layers={layers}
                    isPoem={isPoem}
                    disableArabic={form.disable_auto_arabic}
                    disableTransliteration={form.disable_auto_transliteration}
                    disableEnglish={form.disable_auto_english}
                    disableUrdu={form.disable_auto_urdu}
                  />
                ))}
                {hasChorus && idx < chapters.length - 1 ? (
                  <PreviewVerseCard
                    verse={chorusVerse('closing-chorus')}
                    primary={form.primary_language}
                    layers={layers}
                    isPoem={isPoem}
                    disableArabic={form.disable_auto_arabic}
                    disableTransliteration={form.disable_auto_transliteration}
                    disableEnglish={form.disable_auto_english}
                    disableUrdu={form.disable_auto_urdu}
                  />
                ) : null}
              </div>
            ))}

            {/* Closing chorus */}
            {hasChorus && chapters.length > 0 ? (
              <PreviewVerseCard
                verse={chorusVerse('closing-chorus')}
                primary={form.primary_language}
                layers={layers}
                isPoem={isPoem}
                disableArabic={form.disable_auto_arabic}
                disableTransliteration={form.disable_auto_transliteration}
                disableEnglish={form.disable_auto_english}
                disableUrdu={form.disable_auto_urdu}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default function QaseedahNaats() {
  const queryClient = useQueryClient();
  const { canEdit, canDelete, role } = usePermissions();
  const { convertManyArabicLines, converting: convertingArabicLines } = useArabicLineTools();
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
  const [composeMode, setComposeMode] = useState<EntryComposeMode>('bulk');
  const [editorTab, setEditorTab] = useState<'input' | 'fix' | 'preview'>('input');
  const [chapterDrafts, setChapterDrafts] = useState<ChapterDraft[]>([createChapterDraft('Chapter 1')]);
  const [chorusDraft, setChorusDraft] = useState<ChorusDraft>({ ...EMPTY_CHORUS });
  const [fixRows, setFixRows] = useState<FixRow[]>([]);
  const [fixDirty, setFixDirty] = useState(false);
  const [expandedFixRows, setExpandedFixRows] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [autoFillMode, setAutoFillMode] = useState<'transliteration' | 'english' | 'both' | null>(null);

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

  const alignmentStatus = useMemo<AlignmentStatus | null>(() => {
    if (composeMode === 'bulk') {
      return buildBulkAlignmentStatus(
        {
          arabic: form.bulk_arabic_lines,
          transliteration: form.bulk_transliteration_lines,
          english: form.bulk_english_lines,
          urdu: form.bulk_urdu_lines,
        },
        form.primary_language,
        form.bulk_split_instruction.trim(),
        form.bulk_line_grouping,
        form.bulk_numbered_verse_continuation,
      );
    }

    return buildChapterAlignmentStatus(chapterDrafts, form.primary_language);
  }, [
    composeMode,
    form.bulk_arabic_lines,
    form.bulk_transliteration_lines,
    form.bulk_english_lines,
    form.bulk_urdu_lines,
    form.bulk_split_instruction,
    form.bulk_line_grouping,
    form.bulk_numbered_verse_continuation,
    form.primary_language,
    chapterDrafts,
  ]);

  const alignmentDetails = useMemo<AlignmentDetail[]>(() => {
    if (composeMode === 'bulk') {
      return buildBulkAlignmentDetails(
        {
          arabic: form.bulk_arabic_lines,
          transliteration: form.bulk_transliteration_lines,
          english: form.bulk_english_lines,
          urdu: form.bulk_urdu_lines,
        },
        form.primary_language,
        form.bulk_split_instruction.trim(),
        form.bulk_line_grouping,
        form.bulk_numbered_verse_continuation,
      );
    }

    return buildChapterAlignmentDetails(chapterDrafts, form.primary_language);
  }, [
    composeMode,
    form.bulk_arabic_lines,
    form.bulk_transliteration_lines,
    form.bulk_english_lines,
    form.bulk_urdu_lines,
    form.bulk_split_instruction,
    form.bulk_line_grouping,
    form.bulk_numbered_verse_continuation,
    form.primary_language,
    chapterDrafts,
  ]);

  const parsedBulkRows = useMemo<ParsedLineRow[]>(() => {
    if (composeMode !== 'bulk') return [];
    const hasBulkInput = [
      form.bulk_arabic_lines,
      form.bulk_transliteration_lines,
      form.bulk_english_lines,
      form.bulk_urdu_lines,
    ].some((field) => field.trim().length > 0);
    if (!hasBulkInput) return [];

    return parseBulkLanguageBlocks(
      {
        arabic: form.bulk_arabic_lines,
        transliteration: form.bulk_transliteration_lines,
        english: form.bulk_english_lines,
        urdu: form.bulk_urdu_lines,
      },
      form.primary_language,
      form.bulk_split_instruction.trim(),
      form.bulk_line_grouping,
      form.bulk_numbered_verse_continuation,
    );
  }, [
    composeMode,
        form.bulk_line_grouping,
    form.bulk_numbered_verse_continuation,
    form.bulk_arabic_lines,
    form.bulk_transliteration_lines,
    form.bulk_english_lines,
    form.bulk_urdu_lines,
    form.bulk_split_instruction,
    form.primary_language,
  ]);

  useEffect(() => {
    if (!modalOpen || composeMode !== 'bulk' || fixDirty) return;
    const nextRows = toFixRows(parsedBulkRows);
    setFixRows(nextRows);
    setExpandedFixRows(() => Object.fromEntries(nextRows.map((row) => [row.id, true])));
  }, [modalOpen, composeMode, parsedBulkRows, fixDirty]);

  const closeModal = () => {
    setModalOpen(false);
    setEditRow(null);
    setForm(EMPTY_FORM);
    setGroupMode('existing');
    setSelectedGroupId('');
    setCountMode('preset');
    setComposeMode('bulk');
    setEditorTab('input');
    setChapterDrafts([createChapterDraft('Chapter 1')]);
    setChorusDraft({ ...EMPTY_CHORUS });
    setFixRows([]);
    setFixDirty(false);
    setExpandedFixRows({});
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
    setComposeMode('bulk');
    setEditorTab('input');
    setChapterDrafts([createChapterDraft('Chapter 1')]);
    setChorusDraft({ ...EMPTY_CHORUS });
    setFixRows([]);
    setFixDirty(false);
    setExpandedFixRows({});
    setModalOpen(true);
  };

  const openEdit = (row: QaseedahNaatEntry) => {
    setEditRow(row);
    setCreateType(row.content_type);
    setForm(formFromEntry(row));
    setSelectedGroupId(row.group_id);
    setGroupMode('existing');
    setCountMode(COUNT_PRESETS.includes(row.count || '1') ? 'preset' : 'custom');
    setComposeMode('bulk');
    setEditorTab('input');
    setChapterDrafts(buildChapterDraftsFromSections(row.sections));
    setChorusDraft(extractChorusFromSections(row.sections));
    setFixRows([]);
    setFixDirty(false);
    setExpandedFixRows({});
    setModalOpen(true);
  };

  const addChapterDraft = () => {
    setChapterDrafts((prev) => [...prev, createChapterDraft(`Chapter ${prev.length + 1}`)]);
  };

  const moveChapterDraft = (chapterId: string, direction: 'up' | 'down') => {
    setChapterDrafts((prev) => {
      const index = prev.findIndex((chapter) => chapter.id === chapterId);
      if (index < 0) return prev;

      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const next = [...prev];
      const [current] = next.splice(index, 1);
      next.splice(targetIndex, 0, current);
      return next;
    });
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

  const applyGroupingToBulkTextBoxes = (nextGrouping: LineGrouping) => {
    const groupedEvery = nextGrouping === 'auto' ? 0 : Number(nextGrouping);

    setForm((prev) => {
      if (!Number.isFinite(groupedEvery) || groupedEvery <= 1) {
        return { ...prev, bulk_line_grouping: nextGrouping };
      }

      return {
        ...prev,
        bulk_line_grouping: nextGrouping,
        bulk_arabic_lines: applyLineGroupingRule(prev.bulk_arabic_lines, groupedEvery),
        bulk_transliteration_lines: prev.bulk_transliteration_lines,
        bulk_english_lines: prev.bulk_english_lines,
        bulk_urdu_lines: applyLineGroupingRule(prev.bulk_urdu_lines, groupedEvery),
      };
    });

    if (Number.isFinite(groupedEvery) && groupedEvery > 1) {
      toast.success(`Applied ${groupedEvery} lines = 1 verse to Arabic and Urdu boxes.`);
    }
  };

  const applyTwoLinesToOneBulk = () => {
    applyGroupingToBulkTextBoxes('2');
  };

  const autoFillBulkFromArabic = async (target: 'transliteration' | 'english' | 'both') => {
    const splitInstruction = form.bulk_split_instruction.trim();
    const preparedArabic = prepareBulkLanguageBlock(
      form.bulk_arabic_lines,
      splitInstruction,
      form.bulk_line_grouping,
      shouldApplyLineGroupingToLanguage('arabic'),
      'arabic',
      form.bulk_numbered_verse_continuation,
    );

    const preparedArabicLines = toBlockLines(preparedArabic);
    const arabicVerseLines = preparedArabicLines.filter((line) => !parseChapterMarker(line));

    if (arabicVerseLines.length === 0) {
      toast.error('Add Arabic verses first. Auto-fill uses Arabic as the source.');
      return;
    }

    const hasExistingTarget = (
      (target === 'transliteration' && form.bulk_transliteration_lines.trim().length > 0)
      || (target === 'english' && form.bulk_english_lines.trim().length > 0)
      || (target === 'both' && (form.bulk_transliteration_lines.trim().length > 0 || form.bulk_english_lines.trim().length > 0))
    );

    if (hasExistingTarget) {
      const confirmed = window.confirm('Replace existing auto-fill target text with new verse-aligned output from Arabic?');
      if (!confirmed) return;
    }

    setAutoFillMode(target);
    try {
      const converted = await convertManyArabicLines(arabicVerseLines, { silent: true });

      const existingTransliteration = toVerseOnlyLines(prepareBulkLanguageBlock(
        form.bulk_transliteration_lines,
        splitInstruction,
        form.bulk_line_grouping,
        shouldApplyLineGroupingToLanguage('transliteration'),
        'transliteration',
        form.bulk_numbered_verse_continuation,
      ));
      const existingEnglish = toVerseOnlyLines(prepareBulkLanguageBlock(
        form.bulk_english_lines,
        splitInstruction,
        form.bulk_line_grouping,
        shouldApplyLineGroupingToLanguage('english'),
        'english',
        form.bulk_numbered_verse_continuation,
      ));

      const transliterationOutput: string[] = [];
      const englishOutput: string[] = [];
      let verseIndex = 0;

      for (const line of preparedArabicLines) {
        if (parseChapterMarker(line)) {
          transliterationOutput.push(line);
          englishOutput.push(line);
          continue;
        }

        const lineResult = converted[verseIndex] ?? null;
        const transliteration = lineResult?.transliteration?.trim() || existingTransliteration[verseIndex] || '';
        const translation = lineResult?.translation?.trim() || existingEnglish[verseIndex] || '';

        transliterationOutput.push(transliteration);
        englishOutput.push(translation);
        verseIndex += 1;
      }

      setForm((prev) => ({
        ...prev,
        bulk_transliteration_lines: target === 'transliteration' || target === 'both'
          ? transliterationOutput.join('\n')
          : prev.bulk_transliteration_lines,
        bulk_english_lines: target === 'english' || target === 'both'
          ? englishOutput.join('\n')
          : prev.bulk_english_lines,
      }));

      const successCount = converted.filter((item) => item && (item.translation || item.transliteration)).length;
      if (successCount === 0) {
        toast.error('Auto-fill could not generate results.');
      } else if (successCount < arabicVerseLines.length) {
        toast.warning(`Auto-fill completed with partial results (${successCount}/${arabicVerseLines.length}).`);
      } else {
        toast.success('Auto-fill completed for all verses.');
      }
    } finally {
      setAutoFillMode(null);
    }
  };

  const normalizeAlignmentToPrimary = () => {
    const primaryKey = mapPrimaryLanguageToBlockKey(form.primary_language);
    if (!primaryKey || !alignmentStatus) return;

    if (composeMode === 'bulk') {
      const splitInstruction = form.bulk_split_instruction.trim();
      const prepared: Record<BulkLanguageBlockKey, string[]> = {
        arabic: toVerseOnlyLines(prepareBulkLanguageBlock(form.bulk_arabic_lines, splitInstruction, form.bulk_line_grouping, shouldApplyLineGroupingToLanguage('arabic'), 'arabic', form.bulk_numbered_verse_continuation)),
        transliteration: toVerseOnlyLines(prepareBulkLanguageBlock(form.bulk_transliteration_lines, splitInstruction, form.bulk_line_grouping, shouldApplyLineGroupingToLanguage('transliteration'), 'transliteration', form.bulk_numbered_verse_continuation)),
        english: toVerseOnlyLines(prepareBulkLanguageBlock(form.bulk_english_lines, splitInstruction, form.bulk_line_grouping, shouldApplyLineGroupingToLanguage('english'), 'english', form.bulk_numbered_verse_continuation)),
        urdu: toVerseOnlyLines(prepareBulkLanguageBlock(form.bulk_urdu_lines, splitInstruction, form.bulk_line_grouping, shouldApplyLineGroupingToLanguage('urdu'), 'urdu', form.bulk_numbered_verse_continuation)),
      };
      const targetCount = prepared[primaryKey].length;

      (Object.keys(prepared) as BulkLanguageBlockKey[]).forEach((key) => {
        if (key === primaryKey) return;
        if (prepared[key].length === 0) return;
        if (prepared[key].length > targetCount) {
          prepared[key] = prepared[key].slice(0, targetCount);
          return;
        }
        while (prepared[key].length < targetCount) {
          prepared[key].push('');
        }
      });

      setForm((prev) => ({
        ...prev,
        bulk_arabic_lines: prepared.arabic.join('\n'),
        bulk_transliteration_lines: prepared.transliteration.join('\n'),
        bulk_english_lines: prepared.english.join('\n'),
        bulk_urdu_lines: prepared.urdu.join('\n'),
      }));
      toast.success('Normalized bulk rows to match primary verse count.');
      return;
    }

    setChapterDrafts((prev) => prev.map((chapter, index) => {
      const chapterLabel = chapter.title.trim() || `Chapter ${index + 1}`;
      const rowsByKey: Record<BulkLanguageBlockKey, string[]> = {
        arabic: toMeaningfulLines(chapter.arabic),
        transliteration: toMeaningfulLines(chapter.transliteration),
        english: toMeaningfulLines(chapter.translation),
        urdu: toMeaningfulLines(chapter.urdu_translation),
      };
      const targetCount = rowsByKey[primaryKey].length;

      if (targetCount === 0) return chapter;

      (Object.keys(rowsByKey) as BulkLanguageBlockKey[]).forEach((key) => {
        if (key === primaryKey) return;
        if (rowsByKey[key].length === 0) return;
        if (rowsByKey[key].length > targetCount) {
          rowsByKey[key] = rowsByKey[key].slice(0, targetCount);
          return;
        }
        while (rowsByKey[key].length < targetCount) {
          rowsByKey[key].push('');
        }
      });

      return {
        ...chapter,
        title: chapterLabel,
        arabic: rowsByKey.arabic.join('\n'),
        transliteration: rowsByKey.transliteration.join('\n'),
        translation: rowsByKey.english.join('\n'),
        urdu_translation: rowsByKey.urdu.join('\n'),
      };
    }));
    toast.success('Normalized chapter verse rows to match primary language.');
  };

  const applyFixRowsToBulkInput = () => {
    const nextBlocks = fixRowsToBulkBlocks(fixRows, form.primary_language);
    setForm((prev) => ({
      ...prev,
      bulk_arabic_lines: nextBlocks.arabic,
      bulk_transliteration_lines: nextBlocks.transliteration,
      bulk_english_lines: nextBlocks.english,
      bulk_urdu_lines: nextBlocks.urdu,
    }));
    setFixDirty(false);
    toast.success('Fix workspace changes applied to bulk input.');
  };

  const resetFixRowsFromInput = () => {
    const nextRows = toFixRows(parsedBulkRows);
    setFixRows(nextRows);
    setExpandedFixRows(() => Object.fromEntries(nextRows.map((row) => [row.id, true])));
    setFixDirty(false);
  };

  const updateFixRow = (id: string, patch: Partial<ParsedLineRow>) => {
    setFixRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setFixDirty(true);
  };

  const toggleFixRowExpanded = (id: string) => {
    setExpandedFixRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setAllFixRowsExpanded = (expanded: boolean) => {
    setExpandedFixRows(() => Object.fromEntries(fixRows.map((row) => [row.id, expanded])));
  };

  const moveFixRow = (id: string, direction: 'up' | 'down') => {
    setFixRows((prev) => {
      const index = prev.findIndex((row) => row.id === id);
      if (index < 0) return prev;
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      return arrayMove(prev, index, target);
    });
    setFixDirty(true);
  };

  const deleteFixRow = (id: string) => {
    setFixRows((prev) => prev.filter((row) => row.id !== id));
    setExpandedFixRows((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setFixDirty(true);
  };

  const insertFixRowBelow = (id: string) => {
    const newId = `fix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setFixRows((prev) => {
      const index = prev.findIndex((row) => row.id === id);
      if (index < 0) return prev;
      const source = prev[index];
      const blank: FixRow = {
        id: newId,
        chapter: source.chapter,
        chapter_arabic: source.chapter_arabic,
        chapter_urdu: source.chapter_urdu,
        heading: source.heading,
        arabic: '',
        transliteration: '',
        translation: '',
        urdu_translation: '',
      };
      const next = [...prev];
      next.splice(index + 1, 0, blank);
      return next;
    });
    setExpandedFixRows((state) => ({ ...state, [newId]: true }));
    setFixDirty(true);
  };

  const mergeFixRowWithNext = (id: string) => {
    setFixRows((prev) => {
      const index = prev.findIndex((row) => row.id === id);
      if (index < 0 || index >= prev.length - 1) return prev;

      const current = prev[index];
      const nextRow = prev[index + 1];
      const join = (left: string, right: string) => [left.trim(), right.trim()].filter(Boolean).join(' ');

      const merged: FixRow = {
        ...current,
        arabic: join(current.arabic, nextRow.arabic),
        transliteration: join(current.transliteration, nextRow.transliteration),
        translation: join(current.translation, nextRow.translation),
        urdu_translation: join(current.urdu_translation, nextRow.urdu_translation),
      };

      const copy = [...prev];
      copy.splice(index, 2, merged);
      return copy;
    });
    setFixDirty(true);
  };

  const splitFixRow = (id: string) => {
    const primaryKey = mapPrimaryLanguageToBlockKey(form.primary_language) ?? 'arabic';
    const primaryField = mapBlockKeyToParsedField(primaryKey);
    const secondId = `fix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setFixRows((prev) => {
      const index = prev.findIndex((row) => row.id === id);
      if (index < 0) return prev;
      const row = prev[index];
      const primaryValue = String(row[primaryField] ?? '');
      const { left, right } = splitPrimaryText(primaryValue);
      if (!right) return prev;

      const first: FixRow = { ...row, [primaryField]: left };
      const second: FixRow = {
        ...row,
        id: secondId,
        heading: row.heading,
        [primaryField]: right,
      };

      if (primaryField !== 'arabic') second.arabic = '';
      if (primaryField !== 'transliteration') second.transliteration = '';
      if (primaryField !== 'translation') second.translation = '';
      if (primaryField !== 'urdu_translation') second.urdu_translation = '';

      const next = [...prev];
      next.splice(index, 1, first, second);
      return next;
    });
    setExpandedFixRows((state) => ({ ...state, [id]: true, [secondId]: true }));
    setFixDirty(true);
  };

  const handleFixRowDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFixRows((prev) => {
      const oldIndex = prev.findIndex((row) => row.id === active.id);
      const newIndex = prev.findIndex((row) => row.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    setFixDirty(true);
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

  // Persist a new display order for a set of groups. Optimistically updates
  // the React-Query cache and reverts on error.
  const persistGroupOrder = async (orderedGroups: QaseedahNaatGroup[]) => {
    const previous = queryClient.getQueryData<{ groups: QaseedahNaatGroup[]; entries: QaseedahNaatEntry[] }>(QUERY_KEY);
    queryClient.setQueryData<{ groups: QaseedahNaatGroup[]; entries: QaseedahNaatEntry[] }>(QUERY_KEY, (old) => {
      if (!old) return old;
      const byId = new Map(orderedGroups.map((g, i) => [g.id, i]));
      return {
        ...old,
        groups: old.groups.map((g) => (byId.has(g.id) ? { ...g, display_order: byId.get(g.id)! } : g)),
      };
    });
    try {
      await Promise.all(
        orderedGroups.map((group, index) =>
          group.display_order === index
            ? Promise.resolve()
            : updateQaseedahNaatGroup(group.id, { display_order: index }),
        ),
      );
    } catch (error) {
      if (previous) queryClient.setQueryData(QUERY_KEY, previous);
      toast.error(error instanceof Error ? error.message : 'Failed to reorder groups.');
    }
  };

  // Persist a new display order for the entries of a group. Optimistic update.
  const persistEntryOrder = async (orderedEntries: QaseedahNaatEntry[]) => {
    const previous = queryClient.getQueryData<{ groups: QaseedahNaatGroup[]; entries: QaseedahNaatEntry[] }>(QUERY_KEY);
    queryClient.setQueryData<{ groups: QaseedahNaatGroup[]; entries: QaseedahNaatEntry[] }>(QUERY_KEY, (old) => {
      if (!old) return old;
      const byId = new Map(orderedEntries.map((e, i) => [e.id, i]));
      return {
        ...old,
        entries: old.entries.map((e) => (byId.has(e.id) ? { ...e, display_order: byId.get(e.id)! } : e)),
      };
    });
    try {
      await Promise.all(
        orderedEntries.map((entry, index) =>
          entry.display_order === index
            ? Promise.resolve()
            : updateQaseedahNaatEntry(entry.id, { display_order: index }),
        ),
      );
    } catch (error) {
      if (previous) queryClient.setQueryData(QUERY_KEY, previous);
      toast.error(error instanceof Error ? error.message : 'Failed to reorder entries.');
    }
  };

  const handleGroupDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = groupedRows.map((section) => section.group).filter((g): g is QaseedahNaatGroup => !!g);
    const oldIndex = current.findIndex((g) => g.id === active.id);
    const newIndex = current.findIndex((g) => g.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(current, oldIndex, newIndex);
    void persistGroupOrder(reordered);
  };

  const handleEntryDragEnd = (rows: QaseedahNaatEntry[]) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(rows, oldIndex, newIndex);
    void persistEntryOrder(reordered);
  };

  const handleChapterDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setChapterDrafts((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id);
      const newIndex = prev.findIndex((c) => c.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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

    const manualSplitInstruction = form.bulk_split_instruction.trim();

    if (form.primary_language === 'auto') {
      toast.error('Select an explicit primary language before saving.');
      return;
    }

    if (composeMode === 'bulk' && fixDirty) {
      toast.error('Apply Fix Workspace changes before saving.');
      return;
    }

    if (
      composeMode === 'bulk'
      && manualSplitInstruction.length > 0
      && !parseManualSplitInstruction(manualSplitInstruction)
    ) {
      toast.error('Manual split instruction not understood. Example: after the second symbol');
      return;
    }

    const hasBulkInput = [
      form.bulk_arabic_lines,
      form.bulk_transliteration_lines,
      form.bulk_english_lines,
      form.bulk_urdu_lines,
    ].some((field) => field.trim().length > 0);

    const bulkRows = composeMode === 'bulk' && hasBulkInput
      ? parseBulkLanguageBlocks(
        {
          arabic: form.bulk_arabic_lines,
          transliteration: form.bulk_transliteration_lines,
          english: form.bulk_english_lines,
          urdu: form.bulk_urdu_lines,
        },
        form.primary_language,
        manualSplitInstruction,
        form.bulk_line_grouping,
        form.bulk_numbered_verse_continuation,
      )
      : [];

    if (alignmentStatus && alignmentStatus.issues.length > 0) {
      toast.error(`Alignment warning (save allowed): ${alignmentStatus.issues[0]}`);
    }

    if (composeMode === 'bulk' && hasBulkInput && bulkRows.length === 0) {
      toast.error('Bulk language blocks could not be parsed. Ensure each language box has one verse per line.');
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
      const isBulkLanguageMode = composeMode === 'bulk';
      const explicitBulkArabic = form.bulk_arabic_lines.trim();

      const payload = {
        group_id: group.id,
        content_type: targetType,
        title,
        arabic_title: form.arabic_title.trim() || null,
        arabic: (isBulkLanguageMode ? explicitBulkArabic : (parsedArabic || form.arabic.trim())) || '',
        transliteration: parsedTransliteration || form.transliteration.trim() || null,
        translation: parsedTranslation || form.translation.trim() || null,
        urdu_translation: parsedUrdu || form.urdu_translation.trim() || null,
        reference: form.reference.trim() || null,
        count: form.count.trim() || '1',
        prayer_time: form.prayer_time.trim() || 'general',
        display_order: Number(form.display_order) || 0,
        is_active: form.is_active,
        sections: structuredRows.length > 0
          ? (() => {
            const chapterSections = structuredRows.map((line) => ({
              chapter: line.chapter.trim() || undefined,
              chapter_arabic: line.chapter_arabic,
              chapter_urdu: line.chapter_urdu,
              heading: line.heading,
              arabic: line.arabic,
              transliteration: line.transliteration || undefined,
              translation: line.translation || undefined,
              urdu_translation: line.urdu_translation || undefined,
            }));

            if (chorusHasContent(chorusDraft)) {
              return [
                {
                  chapter: CHORUS_MARKER,
                  heading: 'Chorus',
                  arabic: chorusDraft.arabic.trim(),
                  transliteration: chorusDraft.transliteration.trim() || undefined,
                  translation: chorusDraft.translation.trim() || undefined,
                  urdu_translation: chorusDraft.urdu_translation.trim() || undefined,
                },
                {
                  chapter: SETTINGS_MARKER,
                  heading: 'Settings',
                  arabic: '-',
                  primary_language: form.primary_language,
                  font_scale_arabic: form.font_scale_arabic,
                  font_scale_transliteration: form.font_scale_transliteration,
                  font_scale_english: form.font_scale_english,
                  font_scale_urdu: form.font_scale_urdu,
                  line_grouping: form.bulk_line_grouping,
                  numbered_verse_continuation: form.bulk_numbered_verse_continuation,
                  manual_split_instruction: form.bulk_split_instruction.trim() || undefined,
                  bulk_source_arabic: form.bulk_arabic_lines,
                  bulk_source_arabic_locked: form.bulk_arabic_lines.trim().length === 0,
                  bulk_source_transliteration: form.bulk_transliteration_lines,
                  bulk_source_transliteration_locked: form.bulk_transliteration_lines.trim().length === 0,
                  bulk_source_english: form.bulk_english_lines,
                  bulk_source_english_locked: form.bulk_english_lines.trim().length === 0,
                  bulk_source_urdu: form.bulk_urdu_lines,
                  bulk_source_urdu_locked: form.bulk_urdu_lines.trim().length === 0,
                  disable_auto_translation: false,
                  disable_auto_transliteration: false,
                  disable_auto_arabic: false,
                  disable_auto_english: false,
                  disable_auto_urdu: false,
                  disable_auto_title_arabic: false,
                  disable_auto_title_english: false,
                  disable_auto_title_urdu: false,
                },
                ...chapterSections,
              ];
            }

            return [
              {
                chapter: SETTINGS_MARKER,
                heading: 'Settings',
                arabic: '-',
                primary_language: form.primary_language,
                font_scale_arabic: form.font_scale_arabic,
                font_scale_transliteration: form.font_scale_transliteration,
                font_scale_english: form.font_scale_english,
                font_scale_urdu: form.font_scale_urdu,
                line_grouping: form.bulk_line_grouping,
                numbered_verse_continuation: form.bulk_numbered_verse_continuation,
                manual_split_instruction: form.bulk_split_instruction.trim() || undefined,
                bulk_source_arabic: form.bulk_arabic_lines,
                bulk_source_arabic_locked: form.bulk_arabic_lines.trim().length === 0,
                bulk_source_transliteration: form.bulk_transliteration_lines,
                bulk_source_transliteration_locked: form.bulk_transliteration_lines.trim().length === 0,
                bulk_source_english: form.bulk_english_lines,
                bulk_source_english_locked: form.bulk_english_lines.trim().length === 0,
                bulk_source_urdu: form.bulk_urdu_lines,
                bulk_source_urdu_locked: form.bulk_urdu_lines.trim().length === 0,
                disable_auto_translation: false,
                disable_auto_transliteration: false,
                disable_auto_arabic: false,
                disable_auto_english: false,
                disable_auto_urdu: false,
                disable_auto_title_arabic: false,
                disable_auto_title_english: false,
                disable_auto_title_urdu: false,
              },
              ...chapterSections,
            ];
          })()
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
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden pt-14 md:pt-0">
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <BookOpen size={20} className="text-[hsl(142_60%_32%)]" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Qaseedahs and Naats</h1>
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
              <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
                <SortableContext
                  items={groupedRows.map(({ group, rows }) => group?.id ?? rows[0]?.group_id ?? '')}
                  strategy={verticalListSortingStrategy}
                >
              {groupedRows.map(({ group, rows }) => {
                const groupName = group?.name ?? rows[0]?.group_name ?? 'General';
                const groupType = group?.content_type ?? rows[0]?.content_type ?? 'qaseedah';
                const currentGroupId = group?.id ?? rows[0]?.group_id;
                const isGroupOpen = activeGroupId === currentGroupId;

                return (
                  <SortableItem key={group?.id ?? groupName} id={currentGroupId ?? groupName}>
                    {({ dragHandle, isDragging }) => (
                  <section className={`rounded-2xl border bg-white overflow-hidden ${isDragging ? 'border-[hsl(142_55%_55%)] shadow-lg ring-2 ring-[hsl(142_55%_55%/0.35)]' : 'border-[hsl(140_20%_86%)]'}`}>
                    <header className="px-4 py-3 border-b border-[hsl(140_20%_92%)] bg-[hsl(140_30%_98%)] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          {...dragHandle}
                          disabled={!canEdit}
                          className="shrink-0 touch-none cursor-grab active:cursor-grabbing text-muted-foreground/70 hover:text-foreground transition-colors p-1 rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Drag to reorder group"
                          aria-label="Drag to reorder group"
                        >
                          <GripVertical size={15} />
                        </button>
                        <div className="min-w-0">
                          <h2 className="text-sm font-semibold text-[hsl(150_30%_15%)] truncate">{groupName}</h2>
                          <p className="text-[11px] text-muted-foreground">{rows.length} entries</p>
                        </div>
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
                      <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleEntryDragEnd(rows)}>
                        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                      {rows.map((row) => {
                        const isOpen = !!expanded[row.id];
                        const urduText = (row.urdu_translation ?? '').trim();

                        return (
                          <SortableItem key={row.id} id={row.id}>
                            {({ dragHandle, isDragging }) => (
                          <div className={`rounded-xl border overflow-hidden ${isDragging ? 'border-[hsl(142_55%_55%)] shadow-md ring-2 ring-[hsl(142_55%_55%/0.3)] bg-white' : 'border-[hsl(140_20%_88%)]'}`}>
                            <div className="px-4 py-3 flex items-start gap-3">
                              <button
                                type="button"
                                {...dragHandle}
                                disabled={!canEdit}
                                className="mt-0.5 shrink-0 touch-none cursor-grab active:cursor-grabbing text-muted-foreground/70 hover:text-foreground transition-colors p-1 rounded hover:bg-secondary/60 disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Drag to reorder entry"
                                aria-label="Drag to reorder entry"
                              >
                                <GripVertical size={14} />
                              </button>
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
                            )}
                          </SortableItem>
                        );
                      })}
                        </SortableContext>
                      </DndContext>
                      </div>
                    ) : null}
                  </section>
                    )}
                  </SortableItem>
                );
              })}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      </main>

      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="w-[100vw] sm:w-[98vw] max-w-[98vw] h-[100dvh] sm:h-[92vh] sm:max-h-[92vh] p-0 gap-0 overflow-hidden rounded-none sm:rounded-lg flex flex-col">
          <DialogHeader className="border-b border-[hsl(140_20%_90%)] bg-white px-5 py-3">
            <DialogTitle className="flex items-center gap-2">
              <BookOpen size={16} className="text-[hsl(142_60%_32%)]" />
              {editRow ? `Edit ${typeLabel(modalType)}` : `Add ${typeLabel(modalType)}`}
              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                {typeLabel(modalType)}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="border-b border-[hsl(140_20%_90%)] bg-[hsl(140_25%_98%)] px-5 py-2.5">
            <div className="inline-flex items-center rounded-lg border border-[hsl(140_20%_86%)] bg-white p-1">
              {([
                ['input', 'Input'],
                ['fix', 'Fix'],
                ['preview', 'Preview'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEditorTab(value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${editorTab === value
                    ? 'bg-emerald-600 text-white'
                    : 'text-muted-foreground hover:bg-[hsl(140_20%_96%)]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
            <div className="min-h-0 overflow-y-auto px-5 py-5">
          <div className={`space-y-4 ${editorTab === 'input' ? '' : 'hidden'}`}>
            <Section
              title="Basics"
              description="Title, group, and how the entry is shown in lists."
              icon={<FileText size={14} />}
            >
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

            <div className="mt-3 space-y-2 rounded-lg border border-[hsl(145_32%_82%)] bg-[hsl(145_45%_97%)] p-3">
              <div>
                <p className="text-sm font-semibold text-[hsl(150_32%_20%)]">Display Font Sizes (App / TV)</p>
                <p className="text-xs text-muted-foreground">Set default text size per language for this entry.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Arabic</Label>
                  <Input
                    type="number"
                    min={0.7}
                    max={1.8}
                    step={0.1}
                    value={form.font_scale_arabic}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      font_scale_arabic: clampLanguageFontScale(Number(event.target.value || 1)),
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Transliteration</Label>
                  <Input
                    type="number"
                    min={0.7}
                    max={1.8}
                    step={0.1}
                    value={form.font_scale_transliteration}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      font_scale_transliteration: clampLanguageFontScale(Number(event.target.value || 1)),
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">English</Label>
                  <Input
                    type="number"
                    min={0.7}
                    max={1.8}
                    step={0.1}
                    value={form.font_scale_english}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      font_scale_english: clampLanguageFontScale(Number(event.target.value || 1)),
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Urdu</Label>
                  <Input
                    type="number"
                    min={0.7}
                    max={1.8}
                    step={0.1}
                    value={form.font_scale_urdu}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      font_scale_urdu: clampLanguageFontScale(Number(event.target.value || 1)),
                    }))}
                  />
                </div>
              </div>
            </div>
            </Section>

            <Section
              title="Content"
              description="Choose how you'd like to enter the verses, then fill in the chapters or paste in bulk."
              icon={<BookOpen size={14} />}
            >
            <div className="space-y-1.5">
              <Label>Content Input Mode</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setComposeMode('bulk')}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${composeMode === 'bulk' ? 'border-emerald-300 bg-emerald-50' : 'border-border bg-background hover:bg-secondary/50'}`}
                >
                  <p className="text-sm font-semibold text-[hsl(150_30%_15%)]">Bulk Paste (Primary)</p>
                  <p className="text-xs text-muted-foreground">Paste all lines at once, then fix quickly using grouping + Fix Workspace.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setComposeMode('chapters')}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${composeMode === 'chapters' ? 'border-emerald-300 bg-emerald-50' : 'border-border bg-background hover:bg-secondary/50'}`}
                >
                  <p className="text-sm font-semibold text-[hsl(150_30%_15%)]">Manual Chapters (Secondary)</p>
                  <p className="text-xs text-muted-foreground">Use only when needed for chapter-by-chapter manual entry.</p>
                </button>
              </div>
            </div>

            {composeMode === 'chapters' ? (
              <div className="space-y-3 rounded-xl border border-[hsl(140_20%_88%)] bg-[hsl(140_25%_98%)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[hsl(150_30%_15%)]">Chapter Builder</p>
                    <p className="text-xs text-muted-foreground">Each line number across Arabic, Transliteration, English, and Urdu is linked together. Drag the handle on the left to reorder chapters.</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addChapterDraft} className="gap-1.5">
                    <Plus size={13} /> Add Chapter
                  </Button>
                </div>

                <div className="space-y-3">
                  <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleChapterDragEnd}>
                    <SortableContext items={chapterDrafts.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  {chapterDrafts.map((chapter, index) => (
                    <SortableItem key={chapter.id} id={chapter.id}>
                      {({ dragHandle, isDragging }) => (
                    <div className={`rounded-lg border bg-white p-3 space-y-3 ${isDragging ? 'border-[hsl(142_55%_55%)] shadow-md ring-2 ring-[hsl(142_55%_55%/0.3)]' : 'border-[hsl(140_20%_86%)]'}`}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          {...dragHandle}
                          className="shrink-0 touch-none cursor-grab active:cursor-grabbing text-muted-foreground/70 hover:text-foreground transition-colors p-1.5 rounded hover:bg-secondary/60"
                          title="Drag to reorder chapter"
                          aria-label="Drag to reorder chapter"
                        >
                          <GripVertical size={15} />
                        </button>
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
                          <Label className="text-xs">Chapter Title — Arabic (optional, overrides auto-translation)</Label>
                          <Input
                            value={chapter.title_arabic}
                            onChange={(event) => updateChapterDraft(chapter.id, { title_arabic: event.target.value })}
                            placeholder="الباب الأول ..."
                            dir="rtl"
                            className="font-arabic text-lg text-right"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Chapter Title — Urdu (optional, overrides auto-translation)</Label>
                          <Input
                            value={chapter.title_urdu}
                            onChange={(event) => updateChapterDraft(chapter.id, { title_urdu: event.target.value })}
                            placeholder="باب اول ..."
                            dir="rtl"
                            className="font-urdu text-lg text-right"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5 md:col-span-2">
                          <Label>Arabic (one line per verse)</Label>
                          <Textarea
                            value={chapter.arabic}
                            onChange={(event) => updateChapterDraft(chapter.id, { arabic: event.target.value })}
                            placeholder="Line 1\nLine 2\nLine 3"
                            rows={10}
                            dir="rtl"
                            className="font-arabic text-xl leading-loose text-right w-full"
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
                        <div className="space-y-1.5 md:col-span-2">
                          <Label>Urdu (optional)</Label>
                          <Textarea
                            value={chapter.urdu_translation}
                            onChange={(event) => updateChapterDraft(chapter.id, { urdu_translation: event.target.value })}
                            placeholder="Line 1\nLine 2\nLine 3"
                            rows={5}
                            dir="rtl"
                            className="font-urdu text-lg leading-loose text-right w-full"
                          />
                        </div>
                      </div>
                    </div>
                      )}
                    </SortableItem>
                  ))}
                    </SortableContext>
                  </DndContext>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-[hsl(140_20%_88%)] bg-[hsl(140_25%_98%)] p-3">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Arabic (one line per verse)</Label>
                    <Textarea
                      value={form.bulk_arabic_lines}
                      onChange={(event) => setForm((prev) => ({ ...prev, bulk_arabic_lines: event.target.value }))}
                      placeholder="Line 1\nLine 2\nLine 3"
                      rows={7}
                      dir="rtl"
                      className="font-arabic text-xl leading-loose text-right w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Transliteration</Label>
                    <Textarea
                      value={form.bulk_transliteration_lines}
                      onChange={(event) => setForm((prev) => ({ ...prev, bulk_transliteration_lines: event.target.value }))}
                      placeholder="Line 1\nLine 2\nLine 3"
                      rows={5}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>English</Label>
                    <Textarea
                      value={form.bulk_english_lines}
                      onChange={(event) => setForm((prev) => ({ ...prev, bulk_english_lines: event.target.value }))}
                      placeholder="Line 1\nLine 2\nLine 3"
                      rows={5}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Urdu</Label>
                    <Textarea
                      value={form.bulk_urdu_lines}
                      onChange={(event) => setForm((prev) => ({ ...prev, bulk_urdu_lines: event.target.value }))}
                      placeholder="Line 1\nLine 2\nLine 3"
                      rows={6}
                      dir="rtl"
                      className="font-urdu text-lg leading-loose text-right w-full"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground md:col-span-2">
                    Smart parsing is built into this mode: chapter markers are read from your primary language box, and split rules can auto-break decorative verse separators.
                  </p>
                  <p className="text-[11px] text-muted-foreground md:col-span-2">
                    Primary Language in App decides which block anchors verses. Other language blocks are aligned by line number.
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">One-Step Verse Grouping</Label>
                  <select
                    value={form.bulk_line_grouping}
                    onChange={(event) => applyGroupingToBulkTextBoxes(event.target.value as LineGrouping)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="auto">Auto (keep source line-by-line)</option>
                    <option value="1">1 line = 1 verse</option>
                    <option value="2">2 lines = 1 verse</option>
                    <option value="3">3 lines = 1 verse</option>
                    <option value="4">4 lines = 1 verse</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Fast setting for cases like "2 lines = 1 verse". Applied to Arabic and Urdu boxes only.
                  </p>
                  <div className="pt-1">
                    <Button type="button" size="sm" variant="outline" onClick={applyTwoLinesToOneBulk}>
                      Merge 2 Lines -&gt; 1 Verse (Arabic + Urdu)
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between rounded-md border border-[hsl(140_20%_88%)] bg-white px-2.5 py-2">
                    <div>
                      <p className="text-xs font-medium text-[hsl(150_30%_15%)]">Numbered translation continuation</p>
                      <p className="text-[11px] text-muted-foreground">When enabled, lines like "2. ..." or "Verse 2:" keep absorbing following lines until the next number.</p>
                    </div>
                    <Switch
                      checked={form.bulk_numbered_verse_continuation}
                      onCheckedChange={(checked) => setForm((prev) => ({ ...prev, bulk_numbered_verse_continuation: checked }))}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Turn this off when the source format is irregular and you want full manual line control.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void autoFillBulkFromArabic('transliteration')}
                      disabled={!canEdit || convertingArabicLines}
                      className="gap-1.5"
                    >
                      {convertingArabicLines && autoFillMode === 'transliteration' ? <Loader2 size={13} className="animate-spin" /> : null}
                      Auto-fill Transliteration
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void autoFillBulkFromArabic('english')}
                      disabled={!canEdit || convertingArabicLines}
                      className="gap-1.5"
                    >
                      {convertingArabicLines && autoFillMode === 'english' ? <Loader2 size={13} className="animate-spin" /> : null}
                      Auto-fill English
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void autoFillBulkFromArabic('both')}
                      disabled={!canEdit || convertingArabicLines}
                      className="gap-1.5"
                    >
                      {convertingArabicLines && autoFillMode === 'both' ? <Loader2 size={13} className="animate-spin" /> : null}
                      Auto-fill Both
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Uses Arabic verse parsing (same as preview/app alignment) so each generated line maps to the correct verse.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Override tip: add a line that contains only spaces to force a verse break for a single ayah.
                  </p>

                  <p className="text-[11px] text-muted-foreground">
                    Bulk mode ordering rule: chapters appear in app in the same order as your heading lines in this paste box.
                  </p>

                  <Label className="text-xs">Manual Verse Split Instruction (Advanced, Optional)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {BULK_SPLIT_PRESETS.map((preset) => {
                      const active = form.bulk_split_instruction.trim() === preset.instruction;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, bulk_split_instruction: preset.instruction }))}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${active
                            ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                            : 'border-[hsl(140_20%_88%)] bg-white text-muted-foreground hover:bg-[hsl(140_25%_97%)]'}`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <Input
                    value={form.bulk_split_instruction}
                    onChange={(event) => setForm((prev) => ({ ...prev, bulk_split_instruction: event.target.value }))}
                    placeholder="after the second symbol"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Applies to all language boxes (Arabic, Transliteration, English, Urdu). Examples: after the second symbol, after 2 symbols, 2 lines = 1 verse.
                  </p>
                </div>
              </div>
            )}

            {alignmentStatus ? (
              <div className={`rounded-xl border p-3 space-y-2 ${alignmentStatus.issues.length > 0 ? 'border-amber-300 bg-amber-50/60' : 'border-emerald-300 bg-emerald-50/60'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[hsl(150_30%_15%)]">Alignment Status</p>
                    <p className="text-xs text-muted-foreground">
                      Primary language: {LANGUAGE_LABELS[alignmentStatus.primaryKey]}. Secondary language counts are recommended to match this verse count.
                    </p>
                  </div>
                  {alignmentStatus.issues.length > 0 ? (
                    <Button type="button" size="sm" variant="outline" onClick={normalizeAlignmentToPrimary}>
                      Normalize Rows
                    </Button>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(Object.keys(alignmentStatus.counts) as BulkLanguageBlockKey[]).map((key) => (
                    <div key={key} className="rounded-md border border-[hsl(140_20%_88%)] bg-white px-2 py-1.5">
                      <p className="text-[11px] text-muted-foreground">{LANGUAGE_LABELS[key]}</p>
                      <p className="text-sm font-semibold text-[hsl(150_30%_15%)]">{alignmentStatus.counts[key]} verses</p>
                    </div>
                  ))}
                </div>

                {alignmentStatus.issues.length > 0 ? (
                  <ul className="space-y-1">
                    {alignmentStatus.issues.slice(0, 4).map((issue) => (
                      <li key={issue} className="text-xs text-amber-900">• {issue}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-emerald-800">All enabled language rows are aligned.</p>
                )}

                {alignmentDetails.length > 0 ? (
                  <div className="space-y-2 rounded-lg border border-amber-200 bg-white/70 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-amber-900">Exact mismatch locations</p>
                      {composeMode === 'bulk' ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditorTab('fix')}>
                          Open Fix Tab
                        </Button>
                      ) : null}
                    </div>

                    {alignmentDetails.slice(0, 3).map((detail) => (
                      <div key={`${detail.key}-${detail.summary}`} className="rounded-md border border-amber-200 bg-amber-50/40 p-2">
                        <p className="text-xs font-semibold text-amber-900">{detail.summary}</p>
                        {detail.missingAt.length > 0 ? (
                          <p className="mt-1 text-xs text-amber-900">
                            Missing at: {detail.missingAt.slice(0, 6).join(', ')}
                            {detail.missingAt.length > 6 ? ` (+${detail.missingAt.length - 6} more)` : ''}
                          </p>
                        ) : null}
                        {detail.extraCount > 0 ? (
                          <p className="mt-1 text-xs text-amber-900">
                            Extra verses after primary ends: {detail.extraCount}
                          </p>
                        ) : null}
                        {detail.likelyCause ? (
                          <p className="mt-1 text-xs text-amber-800">{detail.likelyCause}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            </Section>

            <Section
              title="Chorus (Optional)"
              description="If provided, the chorus is shown at the start and end of every chapter (e.g. Qaseedah Burdah). Leave blank to disable."
              icon={<Highlighter size={14} />}
              tone="amber"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Chorus — Arabic</Label>
                  <Textarea
                    value={chorusDraft.arabic}
                    onChange={(event) => setChorusDraft((prev) => ({ ...prev, arabic: event.target.value }))}
                    placeholder="مَولَايَ صَلِّ وَسَلِّمْ..."
                    rows={4}
                    dir="rtl"
                    className="font-arabic text-xl leading-loose text-right w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Chorus — Transliteration</Label>
                  <Textarea
                    value={chorusDraft.transliteration}
                    onChange={(event) => setChorusDraft((prev) => ({ ...prev, transliteration: event.target.value }))}
                    placeholder="Mawlāyā ṣalli wa sallim..."
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Chorus — English</Label>
                  <Textarea
                    value={chorusDraft.translation}
                    onChange={(event) => setChorusDraft((prev) => ({ ...prev, translation: event.target.value }))}
                    placeholder="O my Master, send blessings..."
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Chorus — Urdu</Label>
                  <Textarea
                    value={chorusDraft.urdu_translation}
                    onChange={(event) => setChorusDraft((prev) => ({ ...prev, urdu_translation: event.target.value }))}
                    placeholder="اے میرے مولا..."
                    rows={3}
                    dir="rtl"
                    className="font-urdu text-lg leading-loose text-right w-full"
                  />
                </div>
              </div>
            </Section>

            <Section
              title="Language Priority"
              description="Select the main language for verse anchoring and app display order."
              icon={<Globe2 size={14} />}
            >
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Primary Language in App</Label>
                <select
                  value={form.primary_language}
                  onChange={(event) => setForm((prev) => ({
                    ...prev,
                    primary_language: event.target.value as PrimaryLanguage,
                  }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="arabic">Arabic</option>
                  <option value="transliteration">Transliteration</option>
                  <option value="urdu">Urdu</option>
                  <option value="english">English</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Primary language is required and used as the source of truth for verse alignment.
                </p>
              </div>
              <div className="rounded-md border border-[hsl(140_20%_90%)] bg-[hsl(140_25%_98%)] px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Portal authoring is explicit: no language or title auto-fill is applied. Enter each language line manually or through bulk parse and correction.
                </p>
              </div>
            </div>
            </Section>

            <Section
              title="Notes & Attachment"
              description="Optional description, tafsir/notes, and a downloadable file."
              icon={<Pencil size={14} />}
            >
            <div className="space-y-1.5">
              <Label>Attachment URL (PDF or image)</Label>
              <Input value={form.file_url} onChange={(event) => setForm((prev) => ({ ...prev, file_url: event.target.value }))} placeholder="https://..." />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <RichTextArea
                value={form.description}
                onChange={(next) => setForm((prev) => ({ ...prev, description: next }))}
                placeholder="Short description"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tafsir / Notes</Label>
              <RichTextArea
                value={form.tafsir}
                onChange={(next) => setForm((prev) => ({ ...prev, tafsir: next }))}
                placeholder="Optional notes"
                rows={5}
              />
            </div>
            </Section>

            <Section
              title="Publishing"
              description="Control whether this entry is visible in the app."
              icon={<ToggleRight size={14} />}
            >
            <div className="flex items-center justify-between rounded-lg border border-[hsl(140_20%_88%)] px-3 py-2">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Only active entries are shown in public readers.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))} />
            </div>
            </Section>

            {/* Mobile-only inline preview (input tab only) */}
            <div className="lg:hidden space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-px flex-1 bg-[hsl(140_20%_88%)]" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Preview</span>
                <span className="h-px flex-1 bg-[hsl(140_20%_88%)]" />
              </div>
              <EntryPreviewPane
                form={form}
                chorusDraft={chorusDraft}
                chapterDrafts={chapterDrafts}
                composeMode={composeMode}
                modalType={modalType}
              />
            </div>
          </div>

          {editorTab === 'fix' ? (
            <div className="space-y-4">
              <Section
                title="Fix Workspace"
                description="Quickly correct parse mistakes: split, merge, reorder, and edit aligned rows before saving."
                icon={<BookOpen size={14} />}
                tone="accent"
              >
                {composeMode !== 'bulk' ? (
                  <div className="rounded-lg border border-[hsl(140_20%_88%)] bg-[hsl(140_25%_98%)] p-3 text-sm text-muted-foreground">
                    Fix Workspace is optimized for Bulk mode parsing corrections. Switch Content Input Mode to Bulk to use split/merge row tools.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 rounded-lg border border-[hsl(140_20%_88%)] bg-[hsl(140_25%_98%)] p-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">One-Step Verse Grouping</Label>
                        <select
                          value={form.bulk_line_grouping}
                          onChange={(event) => applyGroupingToBulkTextBoxes(event.target.value as LineGrouping)}
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="auto">Auto (keep source line-by-line)</option>
                          <option value="1">1 line = 1 verse</option>
                          <option value="2">2 lines = 1 verse</option>
                          <option value="3">3 lines = 1 verse</option>
                          <option value="4">4 lines = 1 verse</option>
                        </select>
                        <p className="text-[11px] text-muted-foreground">
                          Set this once to instantly parse patterns like 2 lines = 1 verse. Then fine-tune only problem rows.
                        </p>
                        <div className="pt-1">
                          <Button type="button" size="sm" variant="outline" onClick={applyTwoLinesToOneBulk}>
                            Merge 2 Lines -&gt; 1 Verse (Arabic + Urdu)
                          </Button>
                        </div>
                        <div className="mt-2 flex items-center justify-between rounded-md border border-[hsl(140_20%_88%)] bg-white px-2.5 py-2">
                          <div>
                            <p className="text-xs font-medium text-[hsl(150_30%_15%)]">Numbered translation continuation</p>
                            <p className="text-[11px] text-muted-foreground">Use this for numbered source text. Disable if source formatting is inconsistent.</p>
                          </div>
                          <Switch
                            checked={form.bulk_numbered_verse_continuation}
                            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, bulk_numbered_verse_continuation: checked }))}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void autoFillBulkFromArabic('transliteration')}
                            disabled={!canEdit || convertingArabicLines}
                            className="gap-1.5"
                          >
                            {convertingArabicLines && autoFillMode === 'transliteration' ? <Loader2 size={13} className="animate-spin" /> : null}
                            Auto-fill Transliteration
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void autoFillBulkFromArabic('english')}
                            disabled={!canEdit || convertingArabicLines}
                            className="gap-1.5"
                          >
                            {convertingArabicLines && autoFillMode === 'english' ? <Loader2 size={13} className="animate-spin" /> : null}
                            Auto-fill English
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <Button type="button" size="sm" variant="outline" onClick={() => setAllFixRowsExpanded(true)}>
                          Expand All
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setAllFixRowsExpanded(false)}>
                          Collapse All
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" onClick={applyFixRowsToBulkInput} disabled={!fixDirty}>
                        Apply Fixes
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={resetFixRowsFromInput}>
                        Reset From Input
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {fixDirty ? 'Unapplied changes present.' : 'Fix rows are synced with bulk input.'}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[hsl(140_20%_88%)] bg-white overflow-hidden">
                      <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-[hsl(140_20%_90%)] bg-[hsl(140_25%_98%)]">
                        Drag rows using the handle, then expand a row to edit full verse text in all languages.
                      </div>

                      <div className="max-h-[54vh] overflow-y-auto">
                        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleFixRowDragEnd}>
                          <SortableContext items={fixRows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
                            {fixRows.map((row, index) => (
                              <SortableItem key={row.id} id={row.id} className="border-b border-[hsl(140_20%_92%)] last:border-b-0">
                                {({ dragHandle }) => (
                                  <div className="p-3 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        {...dragHandle}
                                        className="rounded border border-[hsl(140_20%_88%)] p-1.5 hover:bg-[hsl(140_20%_95%)]"
                                        title="Drag row"
                                      >
                                        <GripVertical size={13} />
                                      </button>
                                      <span className="inline-flex items-center rounded-full bg-[hsl(140_25%_94%)] px-2 py-0.5 text-xs font-semibold text-[hsl(150_30%_20%)]">
                                        Verse {index + 1}
                                      </span>
                                      <Input
                                        value={row.chapter}
                                        onChange={(event) => updateFixRow(row.id, { chapter: event.target.value })}
                                        placeholder="Chapter"
                                        className="h-8 w-[220px]"
                                      />
                                      <Button type="button" variant="outline" size="sm" onClick={() => toggleFixRowExpanded(row.id)}>
                                        {expandedFixRows[row.id] ? 'Hide Full' : 'Show Full'}
                                      </Button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                      <div className="rounded-md border border-[hsl(140_20%_90%)] bg-[hsl(140_25%_98%)] p-2">
                                        <p className="font-semibold text-muted-foreground mb-1">Arabic Preview</p>
                                        <p dir="rtl" className="font-arabic text-base leading-loose text-right whitespace-pre-wrap line-clamp-2">{row.arabic || '—'}</p>
                                      </div>
                                      <div className="rounded-md border border-[hsl(140_20%_90%)] bg-[hsl(140_25%_98%)] p-2">
                                        <p className="font-semibold text-muted-foreground mb-1">Urdu Preview</p>
                                        <p dir="rtl" className="font-urdu text-base leading-loose text-right whitespace-pre-wrap line-clamp-2">{row.urdu_translation || '—'}</p>
                                      </div>
                                      <div className="rounded-md border border-[hsl(140_20%_90%)] bg-[hsl(140_25%_98%)] p-2">
                                        <p className="font-semibold text-muted-foreground mb-1">Transliteration Preview</p>
                                        <p className="whitespace-pre-wrap line-clamp-2">{row.transliteration || '—'}</p>
                                      </div>
                                      <div className="rounded-md border border-[hsl(140_20%_90%)] bg-[hsl(140_25%_98%)] p-2">
                                        <p className="font-semibold text-muted-foreground mb-1">English Preview</p>
                                        <p className="whitespace-pre-wrap line-clamp-2">{row.translation || '—'}</p>
                                      </div>
                                    </div>

                                    {expandedFixRows[row.id] ? (
                                      <div className="grid grid-cols-1 gap-3 pt-1">
                                        <div className="space-y-1">
                                          <Label className="text-xs">Arabic (full verse)</Label>
                                          <Textarea
                                            value={row.arabic}
                                            onChange={(event) => updateFixRow(row.id, { arabic: event.target.value })}
                                            rows={5}
                                            dir="rtl"
                                            className="min-h-[120px] font-arabic text-xl leading-loose text-right"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">Transliteration (full verse)</Label>
                                          <Textarea
                                            value={row.transliteration}
                                            onChange={(event) => updateFixRow(row.id, { transliteration: event.target.value })}
                                            rows={4}
                                            className="min-h-[96px]"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">English (full verse)</Label>
                                          <Textarea
                                            value={row.translation}
                                            onChange={(event) => updateFixRow(row.id, { translation: event.target.value })}
                                            rows={4}
                                            className="min-h-[96px]"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">Urdu (full verse)</Label>
                                          <Textarea
                                            value={row.urdu_translation}
                                            onChange={(event) => updateFixRow(row.id, { urdu_translation: event.target.value })}
                                            rows={5}
                                            dir="rtl"
                                            className="min-h-[120px] font-urdu text-xl leading-loose text-right"
                                          />
                                        </div>
                                      </div>
                                    ) : null}

                                    <div className="flex flex-wrap items-center gap-1">
                                      <Button type="button" variant="outline" size="sm" onClick={() => moveFixRow(row.id, 'up')}>Up</Button>
                                      <Button type="button" variant="outline" size="sm" onClick={() => moveFixRow(row.id, 'down')}>Down</Button>
                                      <Button type="button" variant="outline" size="sm" onClick={() => splitFixRow(row.id)}>Split</Button>
                                      <Button type="button" variant="outline" size="sm" onClick={() => mergeFixRowWithNext(row.id)}>Merge Next</Button>
                                      <Button type="button" variant="outline" size="sm" onClick={() => insertFixRowBelow(row.id)}>Insert</Button>
                                      <Button type="button" variant="outline" size="sm" onClick={() => deleteFixRow(row.id)} className="text-destructive">Delete</Button>
                                    </div>
                                  </div>
                                )}
                              </SortableItem>
                            ))}
                          </SortableContext>
                        </DndContext>
                      </div>
                    </div>
                  </div>
                )}
              </Section>
            </div>
          ) : null}

          {editorTab === 'preview' ? (
            <div className="space-y-3">
              <EntryPreviewPane
                form={form}
                chorusDraft={chorusDraft}
                chapterDrafts={chapterDrafts}
                composeMode={composeMode}
                modalType={modalType}
              />
            </div>
          ) : null}
            </div>
            <aside className="hidden lg:flex flex-col min-h-0 border-l border-[hsl(140_20%_90%)] bg-[hsl(140_25%_98%)]">
              <div className="px-4 py-4 overflow-y-auto">
                {editorTab === 'preview' ? (
                  <div className="rounded-lg border border-[hsl(140_20%_90%)] bg-white p-4 text-sm text-muted-foreground">
                    Preview is shown in the main pane.
                  </div>
                ) : (
                  <EntryPreviewPane
                    form={form}
                    chorusDraft={chorusDraft}
                    chapterDrafts={chapterDrafts}
                    composeMode={composeMode}
                    modalType={modalType}
                  />
                )}
              </div>
            </aside>
          </div>

          <DialogFooter className="gap-2 border-t border-[hsl(140_20%_90%)] bg-white px-5 py-3">
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

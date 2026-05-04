import { Fragment, useRef, useState } from 'react';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Textarea } from '#/components/ui/textarea';
import type { GuideNoteVariant } from './guidePreviewUtils';
import { blockKindDefaults, blockKindMeta, type BlockDraftPayload, type BlockKind } from './blockEditorShared';

export type { BlockKind, BlockDraftPayload } from './blockEditorShared';

export type BlockDraft = {
  block_order: number;
  kind: BlockKind;
  payload: BlockDraftPayload;
};

const NOTE_VARIANTS: { value: GuideNoteVariant; label: string; swatch: string }[] = [
  { value: 'note', label: 'Note', swatch: 'bg-slate-200' },
  { value: 'tip', label: 'Tip', swatch: 'bg-lime-200' },
  { value: 'important', label: 'Important', swatch: 'bg-amber-200' },
  { value: 'reminder', label: 'Reminder', swatch: 'bg-sky-200' },
  { value: 'safety', label: 'Safety', swatch: 'bg-emerald-200' },
  { value: 'warning', label: 'Warning', swatch: 'bg-rose-200' },
  { value: 'hanafi', label: 'Hanafi Note', swatch: 'bg-indigo-200' },
  { value: 'fasting', label: 'Fasting Note', swatch: 'bg-orange-200' },
  { value: 'key', label: 'Key Reminder', swatch: 'bg-yellow-200' },
];

const RECITATION_FLAG_SUGGESTIONS = [
  'Fardh',
  'Wajib',
  'Sunnah',
  'Sunnah Muakkadah',
  'Mustahab',
  'Makruh',
] as const;

const ARABIC_KEYBOARD_ROWS = [
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج', 'د'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['ئ', 'ء', 'ؤ', 'ر', 'لا', 'ى', 'ة', 'و', 'ز', 'ظ'],
  ['َ', 'ُ', 'ِ', 'ّ', 'ْ', 'ً', 'ٌ', 'ٍ', 'ٓ', 'ٰ'],
] as const;

type Props = {
  block: BlockDraft;
  onChange: (next: BlockDraft) => void;
  disabled?: boolean;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item : ''));
  }
  return [];
}

function normalizedToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function hasUserEnteredContent(block: BlockDraft): boolean {
  if (block.kind === 'text') {
    return asString(block.payload.text).trim().length > 0;
  }

  if (block.kind === 'action') {
    const label = normalizedToken(asString(block.payload.label));
    return asString(block.payload.text).trim().length > 0 || (label.length > 0 && label !== 'action');
  }

  if (block.kind === 'note') {
    return asString(block.payload.text).trim().length > 0;
  }

  const label = normalizedToken(asString(block.payload.label));
  const hasArabic = asStringArray(block.payload.arabic).some((line) => line.trim().length > 0);
  const hasTransliteration = asStringArray(block.payload.transliteration).some((line) => line.trim().length > 0);
  const hasMeaning = asStringArray(block.payload.meaning).some((line) => line.trim().length > 0);
  const flagsFromArray = asStringArray(block.payload.flags);
  const flagsFromString = asString(block.payload.flags)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const hasFlags = [...flagsFromArray, ...flagsFromString].some((line) => line.trim().length > 0);

  return (
    hasArabic
    || hasTransliteration
    || hasMeaning
    || hasFlags
    || asString(block.payload.intro).trim().length > 0
    || asString(block.payload.repeat).trim().length > 0
    || asString(block.payload.source).trim().length > 0
    || (label.length > 0 && label !== 'recite')
  );
}

export function BlockEditor({ block, onChange, disabled }: Props) {
  const setPayload = (patch: BlockDraftPayload) => {
    onChange({ ...block, payload: { ...block.payload, ...patch } });
  };

  const setKind = (kind: BlockKind) => {
    if (kind === block.kind) return;

    if (hasUserEnteredContent(block)) {
      const confirmed = window.confirm('Changing block type will replace the current block fields. Continue?');
      if (!confirmed) return;
    }

    onChange({ ...block, kind, payload: blockKindDefaults(kind) });
  };

  const meta = blockKindMeta(block.kind);

  return (
    <div className={`rounded-lg border p-3 space-y-3 ${meta.accent}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded ${meta.badge}`}>
            {meta.title}
          </span>
          <span className="text-[11px] text-muted-foreground">{meta.hint}</span>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-[11px] text-muted-foreground">Type</Label>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={block.kind}
            disabled={disabled}
            onChange={(event) => setKind(event.target.value as BlockKind)}
          >
            <option value="text">Text paragraph</option>
            <option value="action">Action</option>
            <option value="note">Highlighted note</option>
            <option value="recitation">Recitation</option>
          </select>
        </div>
      </div>

      {block.kind === 'text' ? (
        <div>
          <Label className="text-xs">Body text</Label>
          <Textarea
            rows={3}
            className="mt-1 min-h-[80px]"
            value={asString(block.payload.text)}
            disabled={disabled}
            onChange={(event) => setPayload({ text: event.target.value })}
            placeholder="Plain paragraph rendered as body text in the app."
          />
        </div>
      ) : null}

      {block.kind === 'action' ? (
        <div className="grid gap-2 md:grid-cols-[160px_minmax(0,1fr)]">
          <div>
            <Label className="text-xs">Label (optional)</Label>
            <Input
              value={asString(block.payload.label)}
              disabled={disabled}
              onChange={(event) => setPayload({ label: event.target.value })}
              placeholder="Action"
            />
          </div>
          <div>
            <Label className="text-xs">Instruction</Label>
            <Textarea
              rows={2}
              className="mt-1 min-h-[68px]"
              value={asString(block.payload.text)}
              disabled={disabled}
              onChange={(event) => setPayload({ text: event.target.value })}
              placeholder={`What the user should do, e.g. "Face the Ka'bah and raise both hands to the ears."`}
            />
          </div>
        </div>
      ) : null}

      {block.kind === 'note' ? (
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Variant</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {NOTE_VARIANTS.map((variant) => {
                const active = asString(block.payload.variant) === variant.value;
                return (
                  <button
                    key={variant.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => setPayload({ variant: variant.value })}
                    className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] ${active ? 'border-[hsl(142_60%_32%)] bg-[hsl(142_50%_95%)] text-[hsl(142_60%_22%)]' : 'border-input bg-background text-muted-foreground'}`}
                  >
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${variant.swatch}`} />
                    {variant.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label className="text-xs">Note text</Label>
            <Textarea
              rows={3}
              className="mt-1 min-h-[80px]"
              value={asString(block.payload.text)}
              disabled={disabled}
              onChange={(event) => setPayload({ text: event.target.value })}
              placeholder="The text shown inside the coloured callout."
            />
          </div>
        </div>
      ) : null}

      {block.kind === 'recitation' ? (
        <RecitationFields
          payload={block.payload}
          setPayload={setPayload}
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}

function RecitationFields({
  payload,
  setPayload,
  disabled,
}: {
  payload: BlockDraftPayload;
  setPayload: (patch: BlockDraftPayload) => void;
  disabled?: boolean;
}) {
  const arabicInputRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const [activeArabicLine, setActiveArabicLine] = useState(0);
  const [showArabicKeyboard, setShowArabicKeyboard] = useState(false);

  const arabic = asStringArray(payload.arabic);
  const transliteration = asStringArray(payload.transliteration);
  const meaning = asStringArray(payload.meaning);
  const rawFlags = Array.isArray(payload.flags)
    ? payload.flags.map((flag) => (typeof flag === 'string' ? flag : ''))
    : typeof payload.flags === 'string'
      ? payload.flags.split(/[\n,]/)
      : [];
  const flags = rawFlags.map((flag) => flag.trim()).filter((flag) => flag.length > 0);

  const ensureLen = (list: string[], len: number): string[] => {
    if (list.length >= len) return list;
    return [...list, ...Array(len - list.length).fill('')];
  };

  const updateLine = (
    field: 'arabic' | 'transliteration' | 'meaning',
    lineIndex: number,
    value: string,
  ) => {
    const base = field === 'arabic' ? arabic : field === 'transliteration' ? transliteration : meaning;
    const targetLen = Math.max(base.length, lineIndex + 1);
    const next = ensureLen(base, targetLen).map((item, idx) => (idx === lineIndex ? value : item));
    setPayload({ [field]: next });
  };

  const addLine = () => {
    const len = Math.max(arabic.length, transliteration.length, meaning.length) + 1;
    setPayload({
      arabic: ensureLen(arabic, len),
      transliteration: ensureLen(transliteration, len),
      meaning: ensureLen(meaning, len),
    });
  };

  const removeLine = (lineIndex: number) => {
    setPayload({
      arabic: arabic.filter((_, idx) => idx !== lineIndex),
      transliteration: transliteration.filter((_, idx) => idx !== lineIndex),
      meaning: meaning.filter((_, idx) => idx !== lineIndex),
    });
  };

  const lineCount = Math.max(arabic.length, transliteration.length, meaning.length, 1);

  const normalizeFlags = (raw: string[]): string[] => {
    const seen = new Set<string>();
    const normalized: string[] = [];
    raw.forEach((item) => {
      const trimmed = item.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push(trimmed);
    });
    return normalized;
  };

  const updateFlagsFromInput = (value: string) => {
    const parsed = value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    setPayload({ flags: normalizeFlags(parsed) });
  };

  const toggleSuggestedFlag = (flag: string) => {
    const exists = flags.some((item) => item.toLowerCase() === flag.toLowerCase());
    if (exists) {
      setPayload({ flags: flags.filter((item) => item.toLowerCase() !== flag.toLowerCase()) });
      return;
    }
    setPayload({ flags: normalizeFlags([...flags, flag]) });
  };

  const insertArabicAtCaret = (token: string) => {
    const normalizedLine = Math.min(Math.max(activeArabicLine, 0), Math.max(lineCount - 1, 0));
    const target = arabicInputRefs.current[normalizedLine];
    const fallbackText = arabic[normalizedLine] ?? '';

    if (!target) {
      updateLine('arabic', normalizedLine, `${fallbackText}${token}`);
      return;
    }

    const start = target.selectionStart ?? fallbackText.length;
    const end = target.selectionEnd ?? fallbackText.length;
    const next = `${fallbackText.slice(0, start)}${token}${fallbackText.slice(end)}`;

    updateLine('arabic', normalizedLine, next);

    window.requestAnimationFrame(() => {
      const refreshed = arabicInputRefs.current[normalizedLine];
      if (!refreshed) return;
      const caret = start + token.length;
      refreshed.focus();
      refreshed.setSelectionRange(caret, caret);
    });
  };

  const backspaceArabicAtCaret = () => {
    const normalizedLine = Math.min(Math.max(activeArabicLine, 0), Math.max(lineCount - 1, 0));
    const target = arabicInputRefs.current[normalizedLine];
    const fallbackText = arabic[normalizedLine] ?? '';

    if (!target) {
      if (!fallbackText) return;
      updateLine('arabic', normalizedLine, fallbackText.slice(0, -1));
      return;
    }

    const start = target.selectionStart ?? fallbackText.length;
    const end = target.selectionEnd ?? fallbackText.length;

    if (start !== end) {
      const next = `${fallbackText.slice(0, start)}${fallbackText.slice(end)}`;
      updateLine('arabic', normalizedLine, next);
      window.requestAnimationFrame(() => {
        const refreshed = arabicInputRefs.current[normalizedLine];
        if (!refreshed) return;
        refreshed.focus();
        refreshed.setSelectionRange(start, start);
      });
      return;
    }

    if (start <= 0) return;
    const next = `${fallbackText.slice(0, start - 1)}${fallbackText.slice(start)}`;
    updateLine('arabic', normalizedLine, next);
    window.requestAnimationFrame(() => {
      const refreshed = arabicInputRefs.current[normalizedLine];
      if (!refreshed) return;
      const caret = start - 1;
      refreshed.focus();
      refreshed.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-3">
        <div>
          <Label className="text-xs">Label (optional)</Label>
          <Input
            data-no-drag="true"
            value={asString(payload.label)}
            disabled={disabled}
            onChange={(event) => setPayload({ label: event.target.value })}
            placeholder='e.g. "Recite:"'
          />
        </div>
        <div>
          <Label className="text-xs">Repeat (optional)</Label>
          <Input
            data-no-drag="true"
            value={asString(payload.repeat)}
            disabled={disabled}
            onChange={(event) => setPayload({ repeat: event.target.value })}
            placeholder='e.g. "×3"'
          />
        </div>
        <div>
          <Label className="text-xs">Source (optional)</Label>
          <Input
            data-no-drag="true"
            value={asString(payload.source)}
            disabled={disabled}
            onChange={(event) => setPayload({ source: event.target.value })}
            placeholder={`e.g. "Qur'an 3:97"`}
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Intro (optional)</Label>
        <Textarea
          data-no-drag="true"
          rows={2}
          className="mt-1 min-h-[56px]"
          value={asString(payload.intro)}
          disabled={disabled}
          onChange={(event) => setPayload({ intro: event.target.value })}
          placeholder="Short lead-in text shown above the label."
        />
      </div>

      <div>
        <Label className="text-xs">Flags (optional)</Label>
        <Input
          data-no-drag="true"
          className="mt-1"
          value={flags.join(', ')}
          disabled={disabled}
          onChange={(event) => updateFlagsFromInput(event.target.value)}
          placeholder="Comma separated, e.g. Wajib, Sunnah"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {RECITATION_FLAG_SUGGESTIONS.map((flag) => {
            const active = flags.some((item) => item.toLowerCase() === flag.toLowerCase());
            return (
              <button
                key={flag}
                type="button"
                disabled={disabled}
                onClick={() => toggleSuggestedFlag(flag)}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${active ? 'border-[hsl(142_60%_32%)] bg-[hsl(142_50%_95%)] text-[hsl(142_60%_22%)]' : 'border-input bg-background text-muted-foreground'}`}
              >
                {flag}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border bg-white/60 p-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
            Recitation lines
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => setShowArabicKeyboard((prev) => !prev)}
              disabled={disabled}
            >
              {showArabicKeyboard ? 'Hide Arabic Keyboard' : 'Arabic Keyboard'}
            </Button>
            <Button size="sm" variant="outline" onClick={addLine} disabled={disabled}>
              Add line
            </Button>
          </div>
        </div>
        <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[11px] font-semibold text-muted-foreground">
          <span>Arabic</span>
          <span>Transliteration</span>
          <span>Meaning</span>
          <span />
        </div>
        {Array.from({ length: lineCount }).map((_, lineIndex) => (
          <Fragment key={`line-${lineIndex}`}>
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground md:hidden">Arabic</span>
                <Textarea
                data-no-drag="true"
                ref={(element) => {
                  arabicInputRefs.current[lineIndex] = element;
                }}
                dir="rtl"
                lang="ar"
                rows={3}
                className="min-h-[84px] font-['Scheherazade_New',_'Amiri',_serif] text-base leading-8"
                value={arabic[lineIndex] ?? ''}
                disabled={disabled}
                onFocus={() => setActiveArabicLine(lineIndex)}
                onChange={(event) => updateLine('arabic', lineIndex, event.target.value)}
                placeholder="بِسْمِ اللَّهِ"
              />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground md:hidden">Transliteration</span>
                <Textarea
                data-no-drag="true"
                rows={3}
                className="min-h-[84px]"
                value={transliteration[lineIndex] ?? ''}
                disabled={disabled}
                onChange={(event) => updateLine('transliteration', lineIndex, event.target.value)}
                placeholder="Bismillah"
              />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground md:hidden">Meaning</span>
                <Textarea
                data-no-drag="true"
                rows={3}
                className="min-h-[84px]"
                value={meaning[lineIndex] ?? ''}
                disabled={disabled}
                onChange={(event) => updateLine('meaning', lineIndex, event.target.value)}
                placeholder="In the name of Allah"
              />
              </div>
              <div className="flex items-start justify-end md:pt-1">
                <Button
                size="sm"
                variant="ghost"
                disabled={disabled || lineCount <= 1}
                onClick={() => removeLine(lineIndex)}
                title="Remove line"
              >
                ×
              </Button>
              </div>
            </div>
          </Fragment>
        ))}
        {showArabicKeyboard ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-2 space-y-1" data-no-drag="true">
            <p className="text-[11px] text-emerald-900">Click to insert into the focused Arabic line.</p>
            {ARABIC_KEYBOARD_ROWS.map((row, rowIndex) => (
              <div key={`ar-row-${rowIndex}`} className="flex flex-wrap gap-1">
                {row.map((key) => (
                  <button
                    key={`ar-key-${rowIndex}-${key}`}
                    type="button"
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertArabicAtCaret(key)}
                    className="min-w-9 rounded border border-emerald-300 bg-white px-2 py-1 text-base leading-none text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {key}
                  </button>
                ))}
                {rowIndex === ARABIC_KEYBOARD_ROWS.length - 1 ? (
                  <>
                    <button
                      type="button"
                      disabled={disabled}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertArabicAtCaret(' ')}
                      className="rounded border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      Space
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={backspaceArabicAtCaret}
                      className="rounded border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      Backspace
                    </button>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          Leave transliteration empty to let the app auto-transliterate at render time.
        </p>
      </div>
    </div>
  );
}

import { Fragment } from 'react';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Textarea } from '#/components/ui/textarea';
import type { GuideNoteVariant } from './guidePreviewUtils';

export type BlockKind = 'text' | 'action' | 'note' | 'recitation';

export type BlockDraftPayload = Record<string, unknown>;

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

const KIND_META: Record<BlockKind, { title: string; hint: string; accent: string; badge: string }> = {
  text: {
    title: 'Text paragraph',
    hint: 'Plain instructional prose rendered as body text.',
    accent: 'border-slate-200 bg-white',
    badge: 'bg-slate-100 text-slate-700',
  },
  action: {
    title: 'Action',
    hint: 'A "do this" instruction with an optional label (e.g. "Action", "Next").',
    accent: 'border-emerald-200 bg-emerald-50/40',
    badge: 'bg-emerald-100 text-emerald-800',
  },
  note: {
    title: 'Highlighted note',
    hint: 'A coloured callout. Choose a variant (Tip, Warning, Hanafi, etc.).',
    accent: 'border-amber-200 bg-amber-50/40',
    badge: 'bg-amber-100 text-amber-800',
  },
  recitation: {
    title: 'Recitation',
    hint: 'Arabic lines with optional transliteration and meaning, plus repeat count.',
    accent: 'border-emerald-300 bg-emerald-50/60',
    badge: 'bg-emerald-100 text-emerald-800',
  },
};

export function blockKindMeta(kind: BlockKind) {
  return KIND_META[kind];
}

export function blockKindDefaults(kind: BlockKind): BlockDraftPayload {
  switch (kind) {
    case 'text':
      return { text: '' };
    case 'action':
      return { label: 'Action', text: '' };
    case 'note':
      return { variant: 'note', text: '' };
    case 'recitation':
      return { label: 'Recite:', arabic: [''], transliteration: [''], meaning: [''] };
    default:
      return {};
  }
}

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

export function BlockEditor({ block, onChange, disabled }: Props) {
  const setPayload = (patch: BlockDraftPayload) => {
    onChange({ ...block, payload: { ...block.payload, ...patch } });
  };

  const setKind = (kind: BlockKind) => {
    onChange({ ...block, kind, payload: blockKindDefaults(kind) });
  };

  const meta = KIND_META[block.kind];

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
  const arabic = asStringArray(payload.arabic);
  const transliteration = asStringArray(payload.transliteration);
  const meaning = asStringArray(payload.meaning);

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

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-3">
        <div>
          <Label className="text-xs">Label (optional)</Label>
          <Input
            value={asString(payload.label)}
            disabled={disabled}
            onChange={(event) => setPayload({ label: event.target.value })}
            placeholder='e.g. "Recite:"'
          />
        </div>
        <div>
          <Label className="text-xs">Repeat (optional)</Label>
          <Input
            value={asString(payload.repeat)}
            disabled={disabled}
            onChange={(event) => setPayload({ repeat: event.target.value })}
            placeholder='e.g. "×3"'
          />
        </div>
        <div>
          <Label className="text-xs">Source (optional)</Label>
          <Input
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
          rows={2}
          className="mt-1 min-h-[56px]"
          value={asString(payload.intro)}
          disabled={disabled}
          onChange={(event) => setPayload({ intro: event.target.value })}
          placeholder="Short lead-in text shown above the label."
        />
      </div>

      <div className="rounded-md border bg-white/60 p-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
            Recitation lines
          </span>
          <Button size="sm" variant="outline" onClick={addLine} disabled={disabled}>
            Add line
          </Button>
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1 text-[11px] font-semibold text-muted-foreground">
          <span>Arabic</span>
          <span>Transliteration</span>
          <span>Meaning</span>
          <span />
        </div>
        {Array.from({ length: lineCount }).map((_, lineIndex) => (
          <Fragment key={`line-${lineIndex}`}>
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1">
              <Input
                dir="rtl"
                lang="ar"
                className="font-['Scheherazade_New',_'Amiri',_serif] text-base"
                value={arabic[lineIndex] ?? ''}
                disabled={disabled}
                onChange={(event) => updateLine('arabic', lineIndex, event.target.value)}
                placeholder="بِسْمِ اللَّهِ"
              />
              <Input
                value={transliteration[lineIndex] ?? ''}
                disabled={disabled}
                onChange={(event) => updateLine('transliteration', lineIndex, event.target.value)}
                placeholder="Bismillah"
              />
              <Input
                value={meaning[lineIndex] ?? ''}
                disabled={disabled}
                onChange={(event) => updateLine('meaning', lineIndex, event.target.value)}
                placeholder="In the name of Allah"
              />
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
          </Fragment>
        ))}
        <p className="text-[11px] text-muted-foreground">
          Leave transliteration empty to let the app auto-transliterate at render time.
        </p>
      </div>
    </div>
  );
}

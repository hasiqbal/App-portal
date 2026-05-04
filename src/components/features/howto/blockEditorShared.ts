import type { GuideNoteVariant } from './guidePreviewUtils';

export type BlockKind = 'text' | 'action' | 'note' | 'recitation';

export type BlockDraftPayload = Record<string, unknown>;

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
      return { variant: 'note' as GuideNoteVariant, text: '' };
    case 'recitation':
      return { label: 'Recite:', arabic: [''], transliteration: [''], meaning: [''], flags: [] };
    default:
      return {};
  }
}
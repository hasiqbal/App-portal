export type GuideNoteVariant =
  | 'note'
  | 'tip'
  | 'important'
  | 'reminder'
  | 'safety'
  | 'warning'
  | 'hanafi'
  | 'fasting'
  | 'key';

export type PreviewGuideBlock =
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'action';
      label?: string;
      text: string;
    }
  | {
      kind: 'note';
      variant: GuideNoteVariant;
      text: string;
    }
  | {
      kind: 'recitation';
      label?: string;
      intro?: string;
      arabic: string[];
      transliteration?: string[];
      meaning?: string[];
      repeat?: string;
      source?: string;
    };

export const ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const ARABIC_SEGMENT_MATCH_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF][\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s\u0640\u064B-\u065F\u0670\u06D6-\u06ED]*/g;

const GUIDANCE_PREFIX_REGEX = /^(Note|Tip|Important|Reminder|Safety|Warning|Hanafi note|Fasting note|Key reminder)\s*:\s*/i;

const ARABIC_TO_LATIN: Record<string, string> = {
  ا: 'a', أ: 'a', إ: 'i', آ: 'aa', ٱ: 'a', ء: "'", ؤ: "'u", ئ: "'i",
  ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh', د: 'd', ذ: 'dh', ر: 'r',
  ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: "'", غ: 'gh',
  ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', ة: 'h', و: 'w', ي: 'y',
  ى: 'a', ـ: '',
};

const TASHKEEL_TO_LATIN: Record<string, string> = {
  '\u064B': 'an',
  '\u064C': 'un',
  '\u064D': 'in',
  '\u064E': 'a',
  '\u064F': 'u',
  '\u0650': 'i',
  '\u0652': '',
  '\u0670': 'a',
};

export const hasArabic = (text: string) => ARABIC_CHAR_REGEX.test(text);

export const stripArabicDiacritics = (text: string) =>
  text.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');

const splitLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const variantFor = (rawLabel: string): GuideNoteVariant => {
  const lower = rawLabel.toLowerCase();
  if (lower.startsWith('hanafi')) return 'hanafi';
  if (lower.startsWith('fasting')) return 'fasting';
  if (lower.startsWith('key')) return 'key';
  if (lower === 'warning') return 'warning';
  if (lower === 'safety') return 'safety';
  if (lower === 'important') return 'important';
  if (lower === 'reminder') return 'reminder';
  if (lower === 'tip') return 'tip';
  return 'note';
};

const extractArabicSegments = (text: string) => {
  const matches = text.match(ARABIC_SEGMENT_MATCH_REGEX) ?? [];
  return matches.map((match) => match.trim()).filter(Boolean);
};

const transliterateArabic = (text: string) => {
  const normalizedArabic = stripArabicDiacritics(text).replace(/\s+/g, ' ').trim();
  if (normalizedArabic === 'الله أكبر' || normalizedArabic === 'الله اكبر') {
    return 'allahu akbar';
  }

  let out = '';
  let prevLatin = '';

  for (const ch of Array.from(text)) {
    if (ch === 'ّ') {
      out += prevLatin;
      continue;
    }
    if (ch === ' ') {
      out += ' ';
      prevLatin = '';
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(TASHKEEL_TO_LATIN, ch)) {
      out += TASHKEEL_TO_LATIN[ch] ?? '';
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(ARABIC_TO_LATIN, ch)) {
      const latin = ARABIC_TO_LATIN[ch] ?? '';
      out += latin;
      prevLatin = latin;
      continue;
    }
    if (/[.,;:!?()\[\]{}"'\-]/.test(ch)) {
      out += ch;
    }
  }

  return out.replace(/\s+/g, ' ').trim();
};

export const transliterationFromText = (text: string): string | null => {
  const segments = extractArabicSegments(text);
  const translits = segments.map((segment) => transliterateArabic(segment)).filter(Boolean);
  if (translits.length === 0) return null;
  return translits.join(' | ');
};

interface LabeledSections {
  intro: string;
  arabic: string;
  transliteration: string;
  translation: string;
}

const splitLabeledSections = (text: string): LabeledSections => {
  const normalized = text.replace(/\r/g, '');
  const matcher = /(^|\n)\s*(Dua|Arabic|Transliteration|Translation)\s*:\s*/gi;
  const markers: { label: string; start: number; contentStart: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(normalized)) !== null) {
    const label = (match[2] ?? '').toLowerCase();
    const start = (match.index ?? 0) + (match[1]?.length ?? 0);
    markers.push({ label, start, contentStart: matcher.lastIndex });
  }

  if (markers.length === 0) {
    return { intro: normalized.trim(), arabic: '', transliteration: '', translation: '' };
  }

  const sections: LabeledSections = {
    intro: normalized.slice(0, markers[0].start).trim(),
    arabic: '',
    transliteration: '',
    translation: '',
  };

  for (let index = 0; index < markers.length; index += 1) {
    const current = markers[index];
    const next = markers[index + 1];
    const body = normalized.slice(current.contentStart, next ? next.start : normalized.length).trim();
    if (current.label === 'dua' || current.label === 'arabic') {
      sections.arabic = body;
    } else if (current.label === 'transliteration') {
      sections.transliteration = body;
    } else if (current.label === 'translation') {
      sections.translation = body;
    }
  }

  return sections;
};

const deriveLabel = (intro: string): { label: string | null; body: string } => {
  const trimmed = intro.trim();
  if (!trimmed) return { label: null, body: '' };

  if (/[:：]$/.test(trimmed) && trimmed.length <= 80 && !/\n/.test(trimmed)) {
    return { label: trimmed.replace(/[:：]\s*$/, '').trim(), body: '' };
  }

  const match = trimmed.match(/^([\s\S]*?)(?:(?:^|\n|\.\s+)([^\n.]{1,70}):)\s*$/);
  if (match) {
    return { label: match[2].trim(), body: match[1].trim() };
  }

  return { label: null, body: trimmed };
};

const buildRecitationFromLabeled = (text: string): PreviewGuideBlock | null => {
  const sections = splitLabeledSections(text);
  if (!sections.arabic || (!sections.translation && !sections.transliteration)) return null;

  const arabic = splitLines(sections.arabic);
  if (arabic.length === 0) return null;

  const transliteration = splitLines(sections.transliteration);
  const meaning = splitLines(sections.translation);
  const { label, body } = deriveLabel(sections.intro);

  return {
    kind: 'recitation',
    label: label ?? undefined,
    intro: body || undefined,
    arabic,
    transliteration: transliteration.length > 0 ? transliteration : undefined,
    meaning: meaning.length > 0 ? meaning : undefined,
  };
};

const buildRecitationFromFenced = (content: string): PreviewGuideBlock => ({
  kind: 'recitation',
  arabic: splitLines(content),
});

const buildRecitationFromTrailingArabic = (text: string): { block: PreviewGuideBlock; leadingText?: string } | null => {
  const match = text.match(/^([\s\S]*?:)\s*([\s\S]+)$/);
  if (!match) return null;
  const [, leading, tail] = match;
  if (!hasArabic(tail) || /[A-Za-z]/.test(tail) || tail.length <= 34) return null;

  const { label, body } = deriveLabel(leading);
  return {
    block: { kind: 'recitation', label: label ?? undefined, arabic: splitLines(tail) },
    leadingText: body || undefined,
  };
};

const buildRecitationFromInlineCue = (text: string): { block: PreviewGuideBlock; leadingText?: string } | null => {
  if (!hasArabic(text) || !/:/.test(text) || !/(say|recite|read|dhikr|dua|du'a|tasbih|takbir|tasmiyah)/i.test(text)) {
    return null;
  }

  const segments = text.match(ARABIC_SEGMENT_MATCH_REGEX)?.map((segment) => segment.trim()).filter(Boolean) ?? [];
  if (segments.length === 0) return null;
  const arabicChars = segments.join('').replace(/\s+/g, '').length;
  if (arabicChars < 6) return null;

  const firstSegment = segments[0];
  const firstIndex = text.indexOf(firstSegment);
  if (firstIndex <= 0 || text.length > 260 || /\n\s*\n/.test(text)) return null;

  const leading = text.slice(0, firstIndex).trim();
  const { label, body } = deriveLabel(leading);
  return {
    block: { kind: 'recitation', label: label ?? undefined, arabic: segments },
    leadingText: body || undefined,
  };
};

export const parseDetailToBlocks = (detail: string): PreviewGuideBlock[] => {
  const blocks: PreviewGuideBlock[] = [];
  const pieces = detail.split(/```([\s\S]*?)```/g);

  pieces.forEach((piece, index) => {
    const isFenced = index % 2 === 1;
    if (isFenced) {
      if (piece.trim()) blocks.push(buildRecitationFromFenced(piece));
      return;
    }

    const text = piece.trim();
    if (!text) return;

    const guidanceMatch = text.match(GUIDANCE_PREFIX_REGEX);
    if (guidanceMatch && !/\n\s*\n/.test(text)) {
      const label = guidanceMatch[1];
      const body = text.slice(guidanceMatch[0].length).trim();
      if (body) {
        blocks.push({ kind: 'note', variant: variantFor(label), text: body });
        return;
      }
    }

    const labeled = buildRecitationFromLabeled(text);
    if (labeled) {
      blocks.push(labeled);
      return;
    }

    const trailing = buildRecitationFromTrailingArabic(text);
    if (trailing) {
      if (trailing.leadingText) blocks.push({ kind: 'text', text: trailing.leadingText });
      blocks.push(trailing.block);
      return;
    }

    const inlineCue = buildRecitationFromInlineCue(text);
    if (inlineCue) {
      if (inlineCue.leadingText) blocks.push({ kind: 'text', text: inlineCue.leadingText });
      blocks.push(inlineCue.block);
      return;
    }

    const paragraphs = text.split(/\n\s*\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
    if (paragraphs.length > 1) {
      paragraphs.forEach((paragraph) => {
        const matchedGuidance = paragraph.match(GUIDANCE_PREFIX_REGEX);
        if (matchedGuidance) {
          const label = matchedGuidance[1];
          const body = paragraph.slice(matchedGuidance[0].length).trim();
          if (body) {
            blocks.push({ kind: 'note', variant: variantFor(label), text: body });
            return;
          }
        }
        blocks.push({ kind: 'text', text: paragraph });
      });
      return;
    }

    blocks.push({ kind: 'text', text });
  });

  return blocks;
};
import { parseDetailToBlocks, transliterationFromText, type GuideNoteVariant, type PreviewGuideBlock } from './guidePreviewUtils';

type PreviewLanguage = 'en' | 'ur';

type PreviewImage = {
  image_url: string;
  caption?: string;
  source?: string;
};

type PreviewStep = {
  step: number;
  title: string;
  detail?: string;
  blocks?: PreviewGuideBlock[];
  images?: PreviewImage[];
};

type PreviewSection = {
  heading: string;
  steps: PreviewStep[];
};

const NOTE_LABELS: Record<GuideNoteVariant, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  reminder: 'Reminder',
  safety: 'Safety',
  warning: 'Warning',
  hanafi: 'Hanafi Note',
  fasting: 'Fasting Note',
  key: 'Key Reminder',
};

const NOTE_STYLES: Record<GuideNoteVariant, { container: string; body: string }> = {
  note: { container: 'border-slate-300 bg-slate-50 text-slate-700 p-3.5', body: 'text-sm leading-6' },
  tip: { container: 'border-lime-300 bg-lime-50 text-lime-800 p-2.5', body: 'text-xs leading-5' },
  important: { container: 'border-amber-300 bg-amber-50 text-amber-800 p-3.5', body: 'text-sm leading-6' },
  reminder: { container: 'border-sky-300 bg-sky-50 text-sky-800 p-3', body: 'text-[13px] leading-6' },
  safety: { container: 'border-emerald-300 bg-emerald-50 text-emerald-800 p-3', body: 'text-[13px] leading-6' },
  warning: { container: 'border-rose-300 bg-rose-50 text-rose-800 p-3.5', body: 'text-sm leading-6' },
  hanafi: { container: 'border-indigo-300 bg-indigo-50 text-indigo-800 p-2.5', body: 'text-xs leading-5' },
  fasting: { container: 'border-orange-300 bg-orange-50 text-orange-800 p-2.5', body: 'text-xs leading-5' },
  key: { container: 'border-yellow-300 bg-yellow-50 text-yellow-800 p-2.5', body: 'text-xs leading-5' },
};

function recitationFlags(block: Extract<PreviewGuideBlock, { kind: 'recitation' }>): string[] {
  const badges: string[] = [];

  if (block.repeat?.trim()) {
    badges.push(`Repeat: ${block.repeat.trim()}`);
  }

  if (block.source?.trim()) {
    badges.push(`Source: ${block.source.trim()}`);
  }

  const customFlags = Array.isArray(block.flags)
    ? block.flags
    : typeof (block as { flags?: unknown }).flags === 'string'
      ? ((block as { flags?: string }).flags ?? '').split(/[\n,]/)
      : [];

  customFlags.forEach((flag) => {
    const trimmed = flag.trim();
    if (!trimmed) return;
    if (!badges.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      badges.push(trimmed);
    }
  });

  return badges;
}

function renderBlock(block: PreviewGuideBlock, index: number, previewLanguage: PreviewLanguage) {
  if (block.kind === 'recitation') {
    const badges = recitationFlags(block);

    return (
      <div key={`block-${index}`} className="overflow-hidden rounded-md border border-emerald-200 bg-emerald-50/60">
        <div className="border-b border-emerald-200/70 px-4 py-3">
          {block.label ? <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">{block.label}</p> : null}
          {block.intro ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{block.intro}</p> : null}
        </div>
        <div className="space-y-2 px-4 py-4 text-center">
          {block.arabic.map((line, lineIndex) => (
            <p
              key={`arabic-${lineIndex}`}
              className="text-[clamp(1.65rem,2.8vw,2.15rem)] leading-[1.95] text-slate-900 [text-wrap:balance]"
            >
              {line}
            </p>
          ))}
        </div>
        {block.transliteration?.length ? (
          <div className="border-t border-emerald-200/70 bg-white/45 px-4 py-3">
            {block.transliteration.map((line, lineIndex) => (
              <p key={`trans-${lineIndex}`} className="w-full break-words px-1 text-center text-sm italic leading-7 text-slate-600">
                {line}
              </p>
            ))}
          </div>
        ) : null}
        {block.meaning?.length ? (
          <div className="border-t border-emerald-200/70 px-4 py-3">
            {block.meaning.map((line, lineIndex) => (
              <p key={`meaning-${lineIndex}`} className="text-sm leading-7 text-slate-700">{line}</p>
            ))}
          </div>
        ) : null}
        {badges.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-t border-emerald-200/70 px-4 py-3">
            {badges.map((badge, badgeIndex) => (
              <span
                key={`recitation-badge-${badgeIndex}`}
                className="rounded-full border border-emerald-300 bg-emerald-100/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (block.kind === 'note') {
    const style = NOTE_STYLES[block.variant];

    return (
      <div key={`block-${index}`} className={`rounded-lg border-l-4 ${style.container}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]">{NOTE_LABELS[block.variant]}</p>
        <p className={`mt-1 whitespace-pre-wrap ${style.body}`}>{block.text}</p>
      </div>
    );
  }

  if (block.kind === 'action') {
    return (
      <div key={`block-${index}`} className="rounded-lg border border-slate-200 bg-white p-3">
        {block.label ? <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{block.label}</p> : null}
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{block.text}</p>
      </div>
    );
  }

  const autoTransliteration = previewLanguage === 'en' ? transliterationFromText(block.text) : null;
  return (
    <div key={`block-${index}`} className="space-y-1">
      <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{block.text}</p>
      {autoTransliteration ? <p className="text-xs italic text-slate-500">{autoTransliteration}</p> : null}
    </div>
  );
}

export function HowToGuidePreview({
  title,
  subtitle,
  intro,
  notes,
  accentColor,
  previewLanguage = 'en',
  sections,
}: {
  title: string;
  subtitle?: string;
  intro?: string;
  notes?: string[];
  accentColor?: string;
  previewLanguage?: PreviewLanguage;
  sections: PreviewSection[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-100 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">App Preview</p>
        <h3 className="mt-2 text-xl font-bold text-slate-900">{title || 'Untitled Guide'}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>

      {intro ? (
        <div className="mt-4 rounded-xl border-l-4 bg-slate-50 p-4" style={{ borderLeftColor: accentColor || '#2e7d32' }}>
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{intro}</p>
        </div>
      ) : null}

      {notes && notes.length > 0 ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Guide Notes</p>
          <ul className="mt-2 space-y-2">
            {notes.map((note, index) => (
              <li key={`guide-note-${index}`} className="list-inside list-disc whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 space-y-5">
        {sections.map((section, sectionIndex) => (
          <section key={`section-${sectionIndex}`} className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg bg-slate-100 px-4 py-3">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accentColor || '#2e7d32' }} />
              <h4 className="text-sm font-semibold text-slate-800">{section.heading}</h4>
            </div>

            <div className="space-y-3">
              {section.steps.map((step) => {
                const resolvedBlocks = step.blocks && step.blocks.length > 0 ? step.blocks : parseDetailToBlocks(step.detail ?? '');
                return (
                  <div key={`step-${sectionIndex}-${step.step}`} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: accentColor || '#2e7d32' }}>
                        {step.step}
                      </div>
                      <div className="min-w-0 flex-1 space-y-3">
                        <h5 className="text-sm font-semibold text-slate-900">{step.title}</h5>
                        <div className="space-y-3">
                          {resolvedBlocks.map((block, blockIndex) => renderBlock(block, blockIndex, previewLanguage))}
                        </div>
                        {step.images && step.images.length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {step.images.map((image, imageIndex) => (
                              <div key={`image-${imageIndex}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                {image.image_url ? (
                                  <img
                                    src={image.image_url}
                                    alt={image.caption || 'Step visual'}
                                    className="h-40 w-full rounded-md border border-slate-200 bg-white object-cover"
                                    loading="lazy"
                                  />
                                ) : null}
                                {image.caption ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{image.caption}</p> : null}
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  {image.source ? <p className="text-xs text-slate-500">Source: {image.source}</p> : <span />}
                                  {image.image_url ? (
                                    <a
                                      href={image.image_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs font-medium text-emerald-700 underline underline-offset-2"
                                    >
                                      Open
                                    </a>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
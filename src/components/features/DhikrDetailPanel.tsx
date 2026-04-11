import { X, Pencil, Trash2, BookOpen, Hash, Clock, Users, AlignLeft, Link2, ImageIcon } from 'lucide-react';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Dhikr, PRAYER_TIME_LABELS } from '#/types';

interface DhikrDetailPanelProps {
  dhikr: Dhikr | null;
  onClose: () => void;
  onEdit: (dhikr: Dhikr) => void;
  onDelete: (dhikr: Dhikr) => void;
}

const MetaRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
    <div className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground font-medium mb-0.5">{label}</p>
      <div className="text-sm font-medium break-words" style={{ color: 'hsl(var(--foreground))' }}>{value}</div>
    </div>
  </div>
);

const DhikrDetailPanel = ({ dhikr, onClose, onEdit, onDelete }: DhikrDetailPanelProps) => {
  const isOpen = !!dhikr;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Slide-out panel */}
      <aside
        className={`fixed top-0 right-0 h-full z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          width: 'min(520px, 92vw)',
          background: 'hsl(var(--background))',
          borderLeft: '1px solid hsl(var(--border))',
        }}
      >
        {dhikr && (
          <>
            {/* Header */}
            <div
              className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border shrink-0"
              style={{ background: 'hsl(var(--primary))' }}
            >
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold leading-snug" style={{ color: 'hsl(var(--primary-foreground))' }}>
                  {dhikr.title}
                </h2>
                {dhikr.arabic_title && (
                  <p
                    className="text-sm mt-1 font-arabic leading-relaxed"
                    dir="rtl"
                    style={{ color: 'hsl(var(--primary-foreground) / 0.75)', fontFamily: 'serif' }}
                  >
                    {dhikr.arabic_title}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge
                    variant="secondary"
                    className="text-xs bg-white/20 text-white border-white/30"
                  >
                    {PRAYER_TIME_LABELS[dhikr.prayer_time] ?? dhikr.prayer_time}
                  </Badge>
                  <Badge
                    variant={dhikr.is_active ? 'default' : 'secondary'}
                    className={`text-xs ${dhikr.is_active ? 'bg-emerald-500/80 text-white' : 'bg-white/20 text-white/70'}`}
                  >
                    {dhikr.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors shrink-0 mt-0.5"
                aria-label="Close panel"
              >
                <X size={16} style={{ color: 'hsl(var(--primary-foreground))' }} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Arabic text block */}
              <div
                className="rounded-xl p-5 border border-border"
                style={{ background: 'hsl(var(--muted) / 0.4)' }}
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <BookOpen size={12} />
                  Arabic Text
                </p>
                <p
                  className="text-2xl leading-loose text-right font-arabic"
                  dir="rtl"
                  style={{ fontFamily: 'serif', color: 'hsl(var(--foreground))' }}
                >
                  {dhikr.arabic}
                </p>
              </div>

              {/* Transliteration */}
              {dhikr.transliteration && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlignLeft size={12} />
                    Transliteration
                  </p>
                  <p
                    className="text-sm leading-relaxed italic"
                    style={{ color: 'hsl(var(--foreground) / 0.8)' }}
                  >
                    {dhikr.transliteration}
                  </p>
                </div>
              )}

              {/* Description */}
              {dhikr.description && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlignLeft size={12} />
                    Description
                  </p>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'hsl(var(--foreground) / 0.85)' }}
                  >
                    {dhikr.description}
                  </p>
                </div>
              )}

              {/* Translation */}
              {dhikr.translation && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlignLeft size={12} />
                    Translation
                  </p>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'hsl(var(--foreground) / 0.85)' }}
                  >
                    {dhikr.translation}
                  </p>
                </div>
              )}

              {/* Urdu Translation */}
              {dhikr.urdu_translation && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlignLeft size={12} />
                    Urdu Translation
                  </p>
                  <p
                    className="text-base leading-loose text-right"
                    dir="rtl"
                    style={{ color: 'hsl(var(--foreground) / 0.85)', fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif", lineHeight: '2.4' }}
                  >
                    {dhikr.urdu_translation}
                  </p>
                </div>
              )}

              {/* File / Image attachment */}
              {dhikr.file_url && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ImageIcon size={12} />
                    Attached Image / File
                  </p>
                  {/\.(jpg|jpeg|png|webp|gif)$/i.test(dhikr.file_url) ? (
                    <a href={dhikr.file_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={dhikr.file_url}
                        alt="Attached"
                        className="rounded-xl border border-border w-full object-contain hover:opacity-90 transition-opacity"
                        style={{ maxHeight: 220 }}
                      />
                    </a>
                  ) : (
                    <a
                      href={dhikr.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline break-all"
                    >
                      <ImageIcon size={14} />
                      {dhikr.file_url}
                    </a>
                  )}
                </div>
              )}

              {/* Metadata */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border" style={{ background: 'hsl(var(--muted) / 0.4)' }}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</p>
                </div>
                <div className="px-4">
                  <MetaRow
                    icon={<Hash size={14} />}
                    label="Count / Repetitions"
                    value={<span className="font-mono text-base font-bold" style={{ color: 'hsl(var(--accent))' }}>×{dhikr.count}</span>}
                  />
                  <MetaRow
                    icon={<Clock size={14} />}
                    label="Prayer Time"
                    value={PRAYER_TIME_LABELS[dhikr.prayer_time] ?? dhikr.prayer_time}
                  />
                  {dhikr.group_name && (
                    <MetaRow
                      icon={<Users size={14} />}
                      label="Group"
                      value={
                        <span>
                          {dhikr.group_name}
                          {dhikr.group_order != null && (
                            <span className="ml-2 text-xs text-muted-foreground font-normal">(order: {dhikr.group_order})</span>
                          )}
                        </span>
                      }
                    />
                  )}
                  {dhikr.reference && (
                    <MetaRow
                      icon={<Link2 size={14} />}
                      label="Reference"
                      value={dhikr.reference}
                    />
                  )}
                  <MetaRow
                    icon={<Hash size={14} />}
                    label="Display Order"
                    value={dhikr.display_order ?? '—'}
                  />
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div
              className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0"
              style={{ background: 'hsl(var(--card))' }}
            >
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => onDelete(dhikr)}
              >
                <Trash2 size={13} />
                Delete
              </Button>
              <Button
                size="sm"
                className="gap-2"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                onClick={() => onEdit(dhikr)}
              >
                <Pencil size={13} />
                Edit Dhikr
              </Button>
            </div>
          </>
        )}
      </aside>
    </>
  );
};

export default DhikrDetailPanel;

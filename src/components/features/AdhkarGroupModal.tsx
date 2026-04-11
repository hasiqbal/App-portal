import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Textarea } from '#/components/ui/textarea';
import { AdhkarGroup, GROUP_ICON_OPTIONS, GROUP_COLOR_PRESETS, ADHKAR_PRAYER_TIME_CATEGORIES, PRAYER_TIME_LABELS } from '#/types';
import { createAdhkarGroup, updateAdhkarGroup } from '#/lib/api';
import { supabase, supabaseAdmin, onspaceCloud } from '#/lib/supabase';
import { toast } from 'sonner';
import { Upload, X, Loader2, ImageIcon, Image, Database } from 'lucide-react';

// ─── Helper: is the icon value a URL (image) or an emoji/text? ────────────────
export function isIconUrl(icon: string | null | undefined): boolean {
  if (!icon) return false;
  return icon.startsWith('http') || icon.startsWith('/');
}

// ─── Shared icon renderer ─────────────────────────────────────────────────────
export function GroupIconDisplay({
  icon, bg, size = 32, className = '',
}: {
  icon: string; bg: string; size?: number; className?: string;
}) {
  const style: React.CSSProperties = {
    width: size, height: size, background: bg,
    borderRadius: Math.round(size * 0.25),
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden',
  };
  if (isIconUrl(icon)) {
    return (
      <div style={style} className={className}>
        <img src={icon} alt="group icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return (
    <div style={{ ...style, fontSize: size * 0.55 }} className={className}>
      {icon}
    </div>
  );
}

// ─── SQL setup banner (bg_image_url column missing on external Supabase) ─────
const BG_IMAGE_SQL = `-- Run in your Supabase SQL Editor (project: lhaqqqatdztuijgdfdcf):
ALTER TABLE public.adhkar_groups ADD COLUMN IF NOT EXISTS bg_image_url text;`;

const BgImageSetupBanner = ({ onDismiss }: { onDismiss: () => void }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 mb-3">
      <div className="flex items-start gap-2">
        <Database size={14} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-amber-800">Background image column needs setup</p>
          <p className="text-[10px] text-amber-700 mt-0.5">
            Run this SQL in <strong>Supabase dashboard → SQL Editor</strong> (project: lhaqqqatdztuijgdfdcf), then save again:
          </p>
          <pre className="mt-1.5 p-2 bg-white border border-amber-200 rounded text-[10px] font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
            {BG_IMAGE_SQL}
          </pre>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => { navigator.clipboard.writeText(BG_IMAGE_SQL); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="text-[11px] font-semibold px-2.5 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
              {copied ? '✓ Copied!' : 'Copy SQL'}
            </button>
            <button onClick={onDismiss} className="text-[11px] text-amber-600 hover:text-amber-800 transition-colors">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Upload an image to the OnSpace Cloud adhkar-images bucket. */
async function uploadToOnspaceBucket(file: File, folder: string): Promise<string> {
  const ext  = file.name.split('.').pop() ?? 'jpg';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await onspaceCloud.storage
    .from('adhkar-images')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: urlData } = onspaceCloud.storage
    .from('adhkar-images')
    .getPublicUrl(path);

  if (!urlData?.publicUrl) throw new Error('Could not get public URL after upload');
  console.log('[Upload ✓] Uploaded to OnSpace bucket:', urlData.publicUrl);
  return urlData.publicUrl;
}

/** Sync group metadata to external backend via Edge Function (bypasses CORS). */
async function syncGroupToExternal(
  groupName: string,
  payload: Record<string, unknown>,
  oldGroupName?: string,
  newPrayerTime?: string,
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('sync-group', {
    body: { groupName, payload, oldGroupName, newPrayerTime },
  });
  if (error) {
    console.warn('[AdhkarGroupModal] Edge Function sync failed (non-critical):', error?.message ?? error);
    return null;
  }
  return data;
}

interface AdhkarGroupModalProps {
  open: boolean;
  group: AdhkarGroup | null;
  existingGroups?: AdhkarGroup[];
  onClose: () => void;
  onSaved: (group: AdhkarGroup, oldName?: string, oldPrayerTime?: string) => void;
  onMergeInto?: (sourceGroupName: string, targetGroup: AdhkarGroup, sourceGroupId?: string) => Promise<void>;
}

const EMPTY = {
  name: '',
  prayer_time: 'after-fajr' as string,
  icon: '☪️',
  icon_color: '#ffffff',
  icon_bg_color: '#6366f1',
  badge_text: '',
  badge_color: '#6366f1',
  description: '',
  display_order: '0',
  bg_image_url: '',
};

type FormState = typeof EMPTY;

// ─── Reusable image upload zone ───────────────────────────────────────────────
// Uses a transparent overlay input instead of programmatic .click() — works
// reliably inside Dialog components across all browsers.
const UploadZone = ({
  uploading, dragOver, onDragOver, onDragLeave, onDrop, onChange, icon: Icon, label, hint, disabled = false,
}: {
  uploading: boolean;
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon: React.ElementType;
  label: string;
  hint: string;
  disabled?: boolean;
}) => (
  <div
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
    className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all py-5 px-3 overflow-hidden ${
      dragOver ? 'border-primary bg-primary/5' : 'border-[hsl(140_20%_82%)] hover:border-[hsl(142_50%_65%)] hover:bg-[hsl(142_50%_97%)]'
    } ${uploading || disabled ? 'opacity-70 cursor-default' : 'cursor-pointer'}`}
  >
    {uploading ? (
      <>
        <Loader2 size={20} className="animate-spin text-[hsl(142_60%_35%)]" />
        <span className="text-xs text-muted-foreground">Uploading…</span>
      </>
    ) : (
      <>
        <Icon size={18} className="text-[hsl(142_60%_35%)]" />
        <span className="text-xs font-semibold text-[hsl(150_30%_18%)]">{label}</span>
        <span className="text-[10px] text-muted-foreground text-center">{hint}</span>
      </>
    )}
    {/* Full-area transparent file input — fires the native file picker on click.
        This is more reliable than programmatic .click() inside Dialog portals. */}
    {!uploading && !disabled && (
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={onChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        tabIndex={-1}
        aria-hidden="true"
      />
    )}
  </div>
);

const AdhkarGroupModal = ({ open, group, existingGroups = [], onClose, onSaved, onMergeInto }: AdhkarGroupModalProps) => {
  const [form, setForm]     = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [bgColMissing, setBgColMissing] = useState(false);
  const [nameDropOpen, setNameDropOpen] = useState(false);
  const [nameSearch, setNameSearch]     = useState('');
  const nameDropRef = useRef<HTMLDivElement>(null);

  // Upload states
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [uploadingBg,   setUploadingBg]   = useState(false);
  const [dragOverIcon,  setDragOverIcon]  = useState(false);
  const [dragOverBg,    setDragOverBg]    = useState(false);

  const isEdit           = !!group?.id || !!group?.name;
  const originalName     = group?.name ?? '';
  const originalPrayerTime = group?.prayer_time ?? '';
  const mergeTargets     = existingGroups.filter((g) => g.name !== originalName);

  const initializedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      initializedForRef.current = null;
      setBgColMissing(false);
      return;
    }
    const key = group ? (group.id ?? group.name) : '__new__';
    if (initializedForRef.current === key) return;
    initializedForRef.current = key;
    if (group) {
      setForm({
        name:          group.name,
        prayer_time:   group.prayer_time ?? 'after-fajr',
        icon:          group.icon ?? EMPTY.icon,
        icon_color:    group.icon_color ?? EMPTY.icon_color,
        icon_bg_color: group.icon_bg_color ?? EMPTY.icon_bg_color,
        badge_text:    group.badge_text ?? '',
        badge_color:   group.badge_color ?? EMPTY.badge_color,
        description:   group.description ?? '',
        display_order: String(group.display_order ?? 0),
        bg_image_url:  (group as AdhkarGroup & { bg_image_url?: string | null }).bg_image_url ?? '',
      });
    } else {
      setForm(EMPTY);
    }
  }, [group, open]);

  // Close name dropdown on outside click
  useEffect(() => {
    if (!nameDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (nameDropRef.current && !nameDropRef.current.contains(e.target as Node)) {
        setNameDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [nameDropOpen]);

  const set = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: val })), []);

  // ── Image upload handler ───────────────────────────────────────────────────
  const uploadImage = async (
    file: File,
    folder: string,
    setLoading: (v: boolean) => void,
    onSuccess: (url: string) => void,
  ) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (JPG, PNG, WebP, GIF)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be smaller than 10 MB');
      return;
    }
    setLoading(true);
    try {
      const url = await uploadToOnspaceBucket(file, folder);
      onSuccess(url);
      toast.success('Image uploaded — save the group to apply.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      console.error('[Upload ✗]', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleIconFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadImage(file, 'group-icons', setUploadingIcon, (url) => set('icon', url));
    e.target.value = '';
  };

  const handleBgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadImage(file, 'group-backgrounds', setUploadingBg, (url) => set('bg_image_url', url));
    e.target.value = '';
  };

  const handleIconDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOverIcon(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadImage(file, 'group-icons', setUploadingIcon, (url) => set('icon', url));
  };

  const handleBgDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOverBg(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadImage(file, 'group-backgrounds', setUploadingBg, (url) => set('bg_image_url', url));
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Group name is required.'); return; }
    setSaving(true);
    const newName = form.name.trim();
    const bgUrl   = form.bg_image_url?.trim() || null;

    const basePayload = {
      name:          newName,
      prayer_time:   form.prayer_time || null,
      icon:          form.icon,
      icon_color:    form.icon_color,
      icon_bg_color: form.icon_bg_color,
      badge_text:    form.badge_text?.trim() || null,
      badge_color:   form.badge_color,
      description:   form.description?.trim() || null,
      display_order: Number(form.display_order) || 0,
    };

    try {
      const hasRealId = !!group?.id && !group.id.startsWith('__');
      const isRename  = isEdit && newName !== originalName;
      const targetExisting = isRename
        ? existingGroups.find((g) => g.name === newName && g.id !== group?.id)
        : null;

      if (targetExisting && onMergeInto) {
        await onMergeInto(originalName, targetExisting, hasRealId ? group!.id : undefined);
        setSaving(false);
        return;
      }

      let saved: AdhkarGroup;
      let bgSavedInMain = false;

      try {
        const payloadWithBg = { ...basePayload, bg_image_url: bgUrl };
        saved = hasRealId
          ? await updateAdhkarGroup(group!.id, payloadWithBg)
          : await createAdhkarGroup(payloadWithBg);
        bgSavedInMain = true;
      } catch (firstErr) {
        const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        if (errMsg.includes('bg_image_url') || (errMsg.includes('schema cache') && errMsg.includes('adhkar_groups'))) {
          console.warn('[AdhkarGroupModal] bg_image_url column missing, retrying without it:', errMsg);
          setBgColMissing(true);
          saved = hasRealId
            ? await updateAdhkarGroup(group!.id, basePayload)
            : await createAdhkarGroup(basePayload);
        } else {
          throw firstErr;
        }
      }

      if (!bgSavedInMain && bgUrl && saved.id && !bgColMissing) {
        const { error: bgErr } = await supabaseAdmin
          .from('adhkar_groups')
          .update({ bg_image_url: bgUrl })
          .eq('id', saved.id);
        if (bgErr) {
          console.warn('[AdhkarGroupModal] bg_image_url patch failed:', bgErr.message);
          setBgColMissing(true);
        } else {
          saved = { ...saved, bg_image_url: bgUrl } as AdhkarGroup;
        }
      }

      if (bgSavedInMain && bgUrl) {
        saved = { ...saved, bg_image_url: bgUrl } as AdhkarGroup;
      }

      const nameChanged = isEdit && newName !== originalName;
      const timeChanged = isEdit && (form.prayer_time || null) !== (originalPrayerTime || null);

      const externalPayload: Record<string, unknown> = {
        description:   basePayload.description ?? null,
        icon:          basePayload.icon,
        icon_color:    basePayload.icon_color,
        icon_bg_color: basePayload.icon_bg_color,
        badge_text:    basePayload.badge_text ?? null,
        badge_color:   basePayload.badge_color,
        display_order: basePayload.display_order ?? 0,
        prayer_time:   basePayload.prayer_time ?? null,
        bg_image_url:  bgUrl,
      };

      syncGroupToExternal(
        newName,
        externalPayload,
        nameChanged ? originalName : undefined,
        timeChanged ? (form.prayer_time || undefined) : undefined,
      ).catch((err) => console.warn('[AdhkarGroupModal] External sync (non-critical):', err?.message ?? err));

      if (bgColMissing && bgUrl) {
        toast.warning('Group saved — run the SQL above to enable background images, then save again.');
      } else if (isEdit) {
        toast.success(timeChanged
          ? `Group updated · entries will move to ${PRAYER_TIME_LABELS[form.prayer_time ?? ''] ?? form.prayer_time ?? 'new section'}.`
          : 'Group updated.');
      } else {
        toast.success('Group created.');
      }

      onSaved(saved, nameChanged ? originalName : undefined, originalPrayerTime || undefined);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to save group: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const preview = {
    icon:    form.icon,
    iconBg:  form.icon_bg_color,
    badge:   form.badge_text,
    badgeBg: form.badge_color,
    name:    form.name || 'Group Name',
    desc:    form.description || 'Group description appears here.',
    bgImg:   form.bg_image_url,
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto border-[hsl(140_20%_88%)]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[hsl(150_30%_12%)] flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
              <span className="text-sm">{isIconUrl(form.icon) ? '🖼' : form.icon}</span>
            </div>
            {isEdit ? 'Edit Group' : 'New Group'}
          </DialogTitle>
        </DialogHeader>

        {bgColMissing && <BgImageSetupBanner onDismiss={() => setBgColMissing(false)} />}

        {/* ── Live preview card ── */}
        <div
          className="rounded-xl p-4 border border-border flex items-start gap-4 overflow-hidden relative"
          style={{ background: preview.bgImg ? 'transparent' : '#1a2233', minHeight: 88 }}
        >
          {preview.bgImg && (
            <>
              <img src={preview.bgImg} alt="background" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'brightness(0.45)' }} />
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.35)' }} />
            </>
          )}
          {!preview.bgImg && <div className="absolute inset-0 rounded-xl" style={{ background: '#1a2233' }} />}
          <div className="relative z-10 flex items-start gap-4 w-full">
            <GroupIconDisplay icon={preview.icon || '☪️'} bg={preview.iconBg} size={48} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-bold text-base">{preview.name}</span>
                {preview.badge && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ background: preview.badgeBg }}>
                    {preview.badge}
                  </span>
                )}
              </div>
              <p className="text-sm mt-0.5" style={{ color: '#94a3b8' }}>{preview.desc}</p>
              {preview.bgImg && (
                <span className="text-[10px] font-semibold text-white/60 flex items-center gap-1 mt-1">
                  <Image size={10} /> Background image active
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5 pt-1">
          {/* Name + Prayer Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Group Name *</Label>
              <div className="relative" ref={nameDropRef}>
                <div className="flex gap-1">
                  <Input
                    value={form.name}
                    onChange={(e) => { set('name', e.target.value); setNameSearch(e.target.value); }}
                    onFocus={() => setNameDropOpen(true)}
                    placeholder="e.g. Wird al-Latif"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => { setNameSearch(''); setNameDropOpen((v) => !v); }}
                    className="px-2 rounded-md border border-input bg-background hover:bg-secondary transition-colors text-muted-foreground text-xs"
                    title="Browse existing groups"
                  >▾</button>
                </div>
                {nameDropOpen && mergeTargets.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    <div className="px-2 py-1.5 border-b border-border bg-muted/40">
                      <input
                        type="text"
                        value={nameSearch}
                        onChange={(e) => setNameSearch(e.target.value)}
                        placeholder="Search groups…"
                        className="w-full text-xs px-2 py-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    {mergeTargets
                      .filter((g) => !nameSearch || g.name.toLowerCase().includes(nameSearch.toLowerCase()))
                      .map((g) => (
                        <button key={g.id ?? g.name} type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/60 flex items-center gap-2 transition-colors"
                          onClick={() => { set('name', g.name); setNameDropOpen(false); setNameSearch(''); }}>
                          <span className="text-base">{isIconUrl(g.icon) ? '🖼' : (g.icon ?? '📋')}</span>
                          <span className="font-medium text-foreground">{g.name}</span>
                          {g.prayer_time && (
                            <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{PRAYER_TIME_LABELS[g.prayer_time] ?? g.prayer_time}</span>
                          )}
                        </button>
                      ))}
                    {mergeTargets.filter((g) => !nameSearch || g.name.toLowerCase().includes(nameSearch.toLowerCase())).length === 0 && (
                      <p className="px-3 py-2.5 text-xs text-muted-foreground text-center">No groups match</p>
                    )}
                  </div>
                )}
              </div>
              {isEdit && existingGroups.some((g) => g.name === form.name && g.name !== originalName) && (
                <p className="text-[11px] text-amber-600 font-medium mt-0.5">
                  ⚠ This name already exists — saving will <strong>merge</strong> "{originalName}" into "{form.name}".
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Default Prayer Time</Label>
              <select
                value={form.prayer_time}
                onChange={(e) => set('prayer_time', e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ADHKAR_PRAYER_TIME_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{PRAYER_TIME_LABELS[cat] ?? cat}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground leading-snug">📌 Default for new entries.</p>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Short description shown under the group title…"
              className="min-h-[60px] text-sm"
            />
          </div>

          {/* ── Icon section ── */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Group Icon</Label>

            <div className="flex items-center gap-3">
              <GroupIconDisplay icon={form.icon || '☪️'} bg={form.icon_bg_color} size={52} />
              {isIconUrl(form.icon) && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1"><ImageIcon size={11} /> Custom image</span>
                  <button type="button" onClick={() => set('icon', '☪️')}
                    className="flex items-center gap-1 text-[11px] text-destructive hover:underline">
                    <X size={11} /> Remove · use emoji
                  </button>
                </div>
              )}
            </div>

            <UploadZone
              uploading={uploadingIcon}
              dragOver={dragOverIcon}
              onDragOver={(e) => { e.preventDefault(); setDragOverIcon(true); }}
              onDragLeave={() => setDragOverIcon(false)}
              onDrop={handleIconDrop}
              onChange={handleIconFileChange}
              icon={Upload}
              label="Upload photo or logo as icon"
              hint="Click or drag & drop · JPG, PNG, WebP, GIF · max 10 MB"
            />

            {!isIconUrl(form.icon) && (
              <>
                <p className="text-[10px] text-muted-foreground font-medium">Or pick an Islamic icon:</p>
                <div className="flex flex-wrap gap-2">
                  {GROUP_ICON_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => set('icon', opt.value)}
                      title={opt.label}
                      className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all border-2 ${
                        form.icon === opt.value ? 'border-primary scale-110 shadow-md' : 'border-transparent hover:border-border'
                      }`}
                      style={{ background: form.icon === opt.value ? form.icon_bg_color : 'hsl(var(--muted))' }}
                    >
                      {opt.value}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Background Image section ── */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">
              Card Background Image
              <span className="ml-2 text-[10px] font-normal text-muted-foreground">(optional)</span>
            </Label>

            {form.bg_image_url && (
              <div className="relative w-full h-20 rounded-xl overflow-hidden border border-border">
                <img src={form.bg_image_url} alt="background preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-end p-2 justify-between" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)' }}>
                  <span className="text-[10px] font-bold text-white">Background preview</span>
                  <button type="button" onClick={() => set('bg_image_url', '')}
                    className="flex items-center gap-1 text-[11px] text-white/80 hover:text-white bg-black/40 rounded px-1.5 py-0.5">
                    <X size={10} /> Remove
                  </button>
                </div>
              </div>
            )}

            <UploadZone
              uploading={uploadingBg}
              dragOver={dragOverBg}
              onDragOver={(e) => { e.preventDefault(); setDragOverBg(true); }}
              onDragLeave={() => setDragOverBg(false)}
              onDrop={handleBgDrop}
              onChange={handleBgFileChange}
              icon={Image}
              label={form.bg_image_url ? 'Replace background image' : 'Upload background image'}
              hint="Islamic pattern, geometric art, masjid photo · JPG, PNG, WebP · max 10 MB"
            />
          </div>

          {/* Icon background color */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Icon Background Color</Label>
            <div className="flex items-center gap-3 flex-wrap">
              {GROUP_COLOR_PRESETS.map((p) => (
                <button key={p.bg} type="button" onClick={() => set('icon_bg_color', p.bg)} title={p.label}
                  className={`w-8 h-8 rounded-full transition-all border-2 ${
                    form.icon_bg_color === p.bg ? 'border-foreground scale-110 shadow-md' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ background: p.bg }}
                />
              ))}
              <div className="flex items-center gap-2 ml-2">
                <Label className="text-xs text-muted-foreground">Custom</Label>
                <input type="color" value={form.icon_bg_color}
                  onChange={(e) => set('icon_bg_color', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-input" />
              </div>
            </div>
          </div>

          {/* Badge */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Badge Text</Label>
              <Input value={form.badge_text} onChange={(e) => set('badge_text', e.target.value)} placeholder="e.g. Morning Sunnah" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Badge Color</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {GROUP_COLOR_PRESETS.slice(0, 6).map((p) => (
                  <button key={p.bg} type="button" onClick={() => set('badge_color', p.bg)} title={p.label}
                    className={`w-7 h-7 rounded-full transition-all border-2 ${
                      form.badge_color === p.bg ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ background: p.bg }} />
                ))}
                <input type="color" value={form.badge_color}
                  onChange={(e) => set('badge_color', e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border border-input" />
              </div>
            </div>
          </div>

          {/* Display order */}
          <div className="space-y-1.5 w-32">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Display Order</Label>
            <Input type="number" min={0} value={form.display_order}
              onChange={(e) => set('display_order', e.target.value)} placeholder="0" />
          </div>
        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="border-[hsl(140_20%_88%)]">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || uploadingIcon || uploadingBg}
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
            {saving ? 'Saving…' : uploadingIcon || uploadingBg ? 'Uploading…' : isEdit ? 'Save Changes' : 'Create Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdhkarGroupModal;

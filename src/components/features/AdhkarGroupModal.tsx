import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AdhkarGroup, GROUP_ICON_OPTIONS, GROUP_COLOR_PRESETS, ADHKAR_PRAYER_TIME_CATEGORIES, PRAYER_TIME_LABELS } from '@/types';
import { createAdhkarGroup, updateAdhkarGroup } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

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
  console.log('[AdhkarGroupModal] External group synced via Edge Function:', groupName, data);
  return data;
}

interface AdhkarGroupModalProps {
  open: boolean;
  group: AdhkarGroup | null;
  onClose: () => void;
  /** Called with the saved group + the old name/prayerTime so the parent can update cached entries */
  onSaved: (group: AdhkarGroup, oldName?: string, oldPrayerTime?: string) => void;
}

const EMPTY = {
  name: '',
  prayer_time: 'after-fajr' as string,
  icon: '⭐',
  icon_color: '#ffffff',
  icon_bg_color: '#6366f1',
  badge_text: '',
  badge_color: '#6366f1',
  description: '',
  display_order: '0',
};

type FormState = typeof EMPTY;

const AdhkarGroupModal = ({ open, group, onClose, onSaved }: AdhkarGroupModalProps) => {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const isEdit = !!group?.id || !!group?.name;
  const originalName = group?.name ?? '';
  const originalPrayerTime = group?.prayer_time ?? '';
  // When launched from App View with only a name (no real id), treat as create

  // Use a ref to track the last group id/name we initialized for, so reference
  // changes in the cache don't re-trigger a form reset mid-edit.
  const initializedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset tracker when modal closes so next open always re-initializes
      initializedForRef.current = null;
      return;
    }
    const key = group ? (group.id ?? group.name) : '__new__';
    if (initializedForRef.current === key) return; // already initialized — don't overwrite
    initializedForRef.current = key;
    if (group) {
      setForm({
        name: group.name,
        prayer_time: group.prayer_time ?? 'after-fajr',
        icon: group.icon ?? EMPTY.icon,
        icon_color: group.icon_color ?? EMPTY.icon_color,
        icon_bg_color: group.icon_bg_color ?? EMPTY.icon_bg_color,
        badge_text: group.badge_text ?? '',
        badge_color: group.badge_color ?? EMPTY.badge_color,
        description: group.description ?? '',
        display_order: String(group.display_order ?? 0),
      });
    } else {
      setForm(EMPTY);
    }
  }, [group, open]);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Group name is required.'); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      prayer_time: form.prayer_time || null,
      icon: form.icon,
      icon_color: form.icon_color,
      icon_bg_color: form.icon_bg_color,
      badge_text: form.badge_text?.trim() || null,
      badge_color: form.badge_color,
      description: form.description?.trim() || null,
      display_order: Number(form.display_order) || 0,
    };
    try {
      const hasRealId = !!group?.id && !group.id.startsWith('__');
      const saved = hasRealId
        ? await updateAdhkarGroup(group!.id, payload)
        : await createAdhkarGroup(payload);

      // Sync to external backend via Edge Function (bypasses CORS; handles cascade rename + group metadata)
      const nameChanged = isEdit && payload.name !== originalName;
      const timeChanged = isEdit && payload.prayer_time !== originalPrayerTime;

      const externalPayload: Record<string, unknown> = {
        description: payload.description ?? null,
        icon: payload.icon,
        icon_color: payload.icon_color,
        icon_bg_color: payload.icon_bg_color,
        badge_text: payload.badge_text ?? null,
        badge_color: payload.badge_color,
        display_order: payload.display_order ?? 0,
        prayer_time: payload.prayer_time ?? null,
      };

      // Fire-and-forget: pass oldGroupName so the edge function can cascade rename adhkar entries
      syncGroupToExternal(payload.name!, externalPayload, nameChanged ? originalName : undefined, timeChanged ? payload.prayer_time ?? undefined : undefined)
        .then((result) => {
          const cascaded = (result as Record<string, unknown>)?.cascadedEntries;
          if (typeof cascaded === 'number' && cascaded > 0) {
            console.log(`[AdhkarGroupModal] Cascaded ${cascaded} adhkar entries on external backend.`);
          }
        })
        .catch((err) => console.warn('[AdhkarGroupModal] External sync (non-critical):', err?.message ?? err));

      if (isEdit) {
        // Always pass originalPrayerTime so the parent can detect and cascade changes
        toast.success(timeChanged
          ? `Group updated · entries will move to ${PRAYER_TIME_LABELS[payload.prayer_time ?? ''] ?? payload.prayer_time ?? 'new section'}.`
          : 'Group updated.');
        onSaved(saved, nameChanged ? originalName : undefined, originalPrayerTime || undefined);
      } else {
        toast.success('Group created.');
        onSaved(saved);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Live preview
  const preview = {
    icon: form.icon,
    iconBg: form.icon_bg_color,
    badge: form.badge_text,
    badgeBg: form.badge_color,
    name: form.name || 'Group Name',
    desc: form.description || 'Group description appears here.',
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto border-[hsl(140_20%_88%)]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[hsl(150_30%_12%)] flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
              <span className="text-sm">{form.icon}</span>
            </div>
            {isEdit ? 'Edit Group' : 'New Group'}
          </DialogTitle>
        </DialogHeader>

        {/* Live preview card */}
        <div
          className="rounded-xl p-4 border border-border flex items-start gap-4"
          style={{ background: '#1a2233' }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: preview.iconBg }}
          >
            {preview.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-bold text-base">{preview.name}</span>
              {preview.badge && (
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                  style={{ background: preview.badgeBg }}
                >
                  {preview.badge}
                </span>
              )}
            </div>
            <p className="text-sm mt-0.5" style={{ color: '#94a3b8' }}>{preview.desc}</p>
          </div>
        </div>

        <div className="space-y-5 pt-1">
          {/* Name + Prayer Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Group Name *</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Wird al-Latif" />
            </div>
            <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Prayer Time</Label>
              <select
                value={form.prayer_time}
                onChange={(e) => set('prayer_time', e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ADHKAR_PRAYER_TIME_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{PRAYER_TIME_LABELS[cat] ?? cat}</option>
                ))}
              </select>
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

          {/* Icon picker */}
          <div className="space-y-2">
          <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Icon</Label>
            <div className="flex flex-wrap gap-2">
              {GROUP_ICON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('icon', opt.value)}
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
          </div>

          {/* Icon background color */}
          <div className="space-y-2">
          <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Icon Background Color</Label>
            <div className="flex items-center gap-3 flex-wrap">
              {GROUP_COLOR_PRESETS.map((p) => (
                <button
                  key={p.bg}
                  type="button"
                  onClick={() => set('icon_bg_color', p.bg)}
                  title={p.label}
                  className={`w-8 h-8 rounded-full transition-all border-2 ${
                    form.icon_bg_color === p.bg ? 'border-foreground scale-110 shadow-md' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ background: p.bg }}
                />
              ))}
              <div className="flex items-center gap-2 ml-2">
                <Label className="text-xs text-muted-foreground">Custom</Label>
                <input
                  type="color"
                  value={form.icon_bg_color}
                  onChange={(e) => set('icon_bg_color', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-input"
                />
              </div>
            </div>
          </div>

          {/* Badge */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Badge Text</Label>
              <Input
                value={form.badge_text}
                onChange={(e) => set('badge_text', e.target.value)}
                placeholder="e.g. Morning Sunnah"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Badge Color</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {GROUP_COLOR_PRESETS.slice(0, 6).map((p) => (
                  <button
                    key={p.bg}
                    type="button"
                    onClick={() => set('badge_color', p.bg)}
                    title={p.label}
                    className={`w-7 h-7 rounded-full transition-all border-2 ${
                      form.badge_color === p.bg ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ background: p.bg }}
                  />
                ))}
                <input
                  type="color"
                  value={form.badge_color}
                  onChange={(e) => set('badge_color', e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border border-input"
                />
              </div>
            </div>
          </div>

          {/* Display order */}
          <div className="space-y-1.5 w-32">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Display Order</Label>
            <Input
              type="number"
              min={0}
              value={form.display_order}
              onChange={(e) => set('display_order', e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="border-[hsl(140_20%_88%)]">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdhkarGroupModal;

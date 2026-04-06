import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AdhkarGroup, GROUP_ICON_OPTIONS, GROUP_COLOR_PRESETS, PRAYER_TIME_CATEGORIES, PRAYER_TIME_LABELS } from '@/types';
import { createAdhkarGroup, updateAdhkarGroup } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

/** Sync group metadata to external backend via Edge Function (bypasses CORS). */
async function syncGroupToExternal(
  groupName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.functions.invoke('sync-group', {
    body: { groupName, payload },
  });
  if (error) {
    console.warn('[AdhkarGroupModal] Edge Function sync failed (non-critical):', error?.message ?? error);
  } else {
    console.log('[AdhkarGroupModal] External group synced via Edge Function:', groupName);
  }
}

/** Bulk-update group_name and/or prayer_time on all adhkar entries that match oldGroupName */
async function cascadeGroupRename(
  oldName: string,
  newName: string,
  oldPrayerTime: string | null | undefined,
  newPrayerTime: string | null | undefined,
): Promise<number> {
  const patch: Record<string, string> = {};
  if (newName !== oldName) patch.group_name = newName;
  if (newPrayerTime && newPrayerTime !== oldPrayerTime) patch.prayer_time = newPrayerTime;
  if (Object.keys(patch).length === 0) return 0;

  const res = await fetch(
    `${EXT_BASE}/adhkar?group_name=eq.${encodeURIComponent(oldName)}`,
    { method: 'PATCH', headers: EXT_HEADERS, body: JSON.stringify(patch) },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cascade update failed: ${res.status} — ${body}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows.length : 0;
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
  prayer_time: 'after-fajr',
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

  useEffect(() => {
    if (group) {
      setForm({
        name: group.name,
        prayer_time: group.prayer_time ?? 'after-fajr',
        // Use defaults for fields that may be missing (e.g. when opened from app-view card with only name)
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

      // Always sync metadata to the external backend (description, icon, badge, etc.)
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
      syncGroupToExternal(payload.name!, externalPayload)
        .then(() => console.log('[AdhkarGroupModal] External group synced:', payload.name))
        .catch((err) => {
          // Best-effort sync — log silently, don't interrupt the user
          console.warn('[AdhkarGroupModal] External sync skipped (non-critical):', err?.message ?? err);
        });

      // If name or prayer time changed, cascade-update all matching adhkar entries
      if (isEdit) {
        const nameChanged = payload.name !== originalName;
        const timeChanged = payload.prayer_time !== originalPrayerTime;
        if (hasRealId && (nameChanged || timeChanged)) {
          try {
            const count = await cascadeGroupRename(
              originalName,
              payload.name,
              originalPrayerTime,
              payload.prayer_time ?? undefined,
            );
            toast.success(
              `Group updated · ${count} entr${count === 1 ? 'y' : 'ies'} moved to ${PRAYER_TIME_LABELS[payload.prayer_time ?? ''] ?? payload.prayer_time ?? 'new section'}.`,
            );
          } catch (cascadeErr) {
            console.error('[AdhkarGroupModal] Cascade rename failed:', cascadeErr);
            toast.warning('Group saved, but some entries may not have updated. Refresh to check.');
          }
          onSaved(saved, originalName, originalPrayerTime);
        } else {
          toast.success('Group updated.');
          onSaved(saved);
        }
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
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
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
              <Label>Group Name *</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Wird al-Latif" />
            </div>
            <div className="space-y-1.5">
              <Label>Prayer Time</Label>
              <select
                value={form.prayer_time}
                onChange={(e) => set('prayer_time', e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {PRAYER_TIME_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{PRAYER_TIME_LABELS[cat] ?? cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Short description shown under the group title…"
              className="min-h-[60px] text-sm"
            />
          </div>

          {/* Icon picker */}
          <div className="space-y-2">
            <Label>Icon</Label>
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
            <Label>Icon Background Color</Label>
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
              <Label>Badge Text</Label>
              <Input
                value={form.badge_text}
                onChange={(e) => set('badge_text', e.target.value)}
                placeholder="e.g. Morning Sunnah"
              />
            </div>
            <div className="space-y-2">
              <Label>Badge Color</Label>
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
            <Label>Display Order</Label>
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
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
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

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { SunnahReminder, SUNNAH_CATEGORIES, SUNNAH_CATEGORY_LABELS } from '@/types';
import { createSunnahReminder, updateSunnahReminder } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, ImagePlus, Trash2, ExternalLink, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const BASE_SUNNAH_URL = 'https://ucpmwygyuvbfehjpucpm.backend.onspace.ai/rest/v1/sunnah_reminders';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjcG13eWd5dXZiZmVoanB1Y3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDgxMTksImV4cCI6MjA1OTQyNDExOX0.i8tlNr0s9g7D7VhWKUFxXBwU_YhWEarUOBsmCIi-lEA';

interface SunnahReminderModalProps {
  open: boolean;
  row: SunnahReminder | null;
  presetGroup?: { name: string; category: string } | null;
  onClose: () => void;
  onSaved: (reminder: SunnahReminder) => void;
  onFinalized?: (tempId: string, real: SunnahReminder) => void;
  onRevert?: (tempId: string) => void;
  /** Called when the user chooses "Save Changes" (update in-place, no new entry) */
  onUpdated?: (reminder: SunnahReminder) => void;
}

const EMPTY = {
  title: '',
  arabic_title: '',
  arabic: '',
  transliteration: '',
  translation: '',
  description: '',
  reference: '',
  count: '1',
  category: 'general',
  group_name: '',
  group_order: '' as number | string,
  display_order: '' as number | string,
  is_active: true,
  file_url: '',
};

type FormState = typeof EMPTY;

const SunnahReminderModal = ({
  open, row, presetGroup, onClose, onSaved, onFinalized, onRevert, onUpdated,
}: SunnahReminderModalProps) => {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!row;
  const [existingGroups, setExistingGroups] = useState<string[]>([]);
  const [groupOrderMap, setGroupOrderMap] = useState<Record<string, number | null>>({});
  const [showGroupInput, setShowGroupInput] = useState(false);
  const groupInputRef = useRef<HTMLInputElement>(null);

  // Fetch group names from the external backend (not supabase local)
  useEffect(() => {
    if (!open) return;
    fetch(`${BASE_SUNNAH_URL}?select=group_name,group_order&order=group_name.asc`, {
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    })
      .then((r) => r.json())
      .then((rows: { group_name: string | null; group_order: number | null }[]) => {
        const orderMap: Record<string, number | null> = {};
        rows.forEach((r) => {
          if (r.group_name && !(r.group_name in orderMap)) orderMap[r.group_name] = r.group_order;
        });
        setExistingGroups(Object.keys(orderMap).sort());
        setGroupOrderMap(orderMap);
      })
      .catch((e) => console.error('Failed to load sunnah group names:', e));
  }, [open]);

  useEffect(() => {
    if (row) {
      setForm({
        title: row.title, arabic_title: row.arabic_title ?? '', arabic: row.arabic ?? '',
        transliteration: row.transliteration ?? '', translation: row.translation ?? '',
        description: row.description ?? '', reference: row.reference ?? '',
        count: row.count, category: row.category, group_name: row.group_name ?? '',
        group_order: row.group_order ?? '', display_order: row.display_order ?? '',
        is_active: row.is_active, file_url: row.file_url ?? '',
      });
      setShowGroupInput(false);
    } else {
      setForm({
        ...EMPTY,
        ...(presetGroup ? { group_name: presetGroup.name, category: presetGroup.category } : {}),
      });
      setShowGroupInput(false);
      setUploadingImage(false);
    }
  }, [row, open, presetGroup]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const buildPayload = () => ({
    title: form.title.trim(),
    arabic_title: form.arabic_title?.trim() || null,
    arabic: form.arabic?.trim() || null,
    transliteration: form.transliteration?.trim() || null,
    translation: form.translation?.trim() || null,
    description: form.description?.trim() || null,
    reference: form.reference?.trim() || null,
    count: form.count || '1',
    category: form.category,
    group_name: form.group_name?.trim() || null,
    group_order: form.group_order !== '' ? Number(form.group_order) : 0,
    display_order: form.display_order !== '' ? Number(form.display_order) : 0,
    is_active: form.is_active,
    file_url: form.file_url?.trim() || null,
  });

  // ── Save as New Copy: creates a new entry, original stays intact ──────────
  const handleSaveAsCopy = () => {
    if (!form.title.trim()) { toast.error('Title is required.'); return; }
    const payload = buildPayload();
    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const optimistic: SunnahReminder = { id: tempId, ...payload, created_at: now, updated_at: now };
    onSaved(optimistic);
    createSunnahReminder(payload)
      .then((real) => {
        onFinalized?.(tempId, real);
        toast.success(isEdit ? 'Saved as new entry — original preserved.' : 'Reminder added.');
      })
      .catch(() => {
        onRevert?.(tempId);
        toast.error('Failed to save. Entry removed.');
      });
  };

  // ── Save Changes: updates the existing entry in-place ────────────────────
  const handleSaveChanges = () => {
    if (!row?.id) return;
    if (!form.title.trim()) { toast.error('Title is required.'); return; }
    const payload = buildPayload();
    const optimistic: SunnahReminder = { ...row, ...payload, updated_at: new Date().toISOString() };
    onUpdated?.(optimistic);
    updateSunnahReminder(row.id, payload)
      .then((real) => {
        onUpdated?.(real);
        toast.success('Changes saved.');
      })
      .catch(() => {
        onUpdated?.(row); // revert to original
        toast.error('Failed to save changes.');
      });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto border-[hsl(140_20%_88%)]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <span className="text-sm">⭐</span>
              </div>
              {isEdit ? 'Edit Sunnah Reminder' : 'Add Sunnah Reminder'}
            {isEdit && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1">
                <Copy size={9} /> saves as new copy
              </span>
            )}
          </DialogTitle>
          {isEdit && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Saving will create a <strong>new separate entry</strong> with your changes. The original remains unchanged.
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sr-title" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Title * <span className="text-muted-foreground font-normal">(required)</span></Label>
              <Input id="sr-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Miswak before Prayer" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sr-arabic-title" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Arabic Title</Label>
              <Input id="sr-arabic-title" value={form.arabic_title} onChange={(e) => set('arabic_title', e.target.value)}
                placeholder="السواك" dir="rtl" className="text-right" style={{ fontFamily: 'serif' }} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sr-arabic" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Arabic Text <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea id="sr-arabic" value={form.arabic} onChange={(e) => set('arabic', e.target.value)}
              placeholder="Optional Arabic text or hadith..." className="text-right leading-[2.6] min-h-[80px]"
              dir="rtl" style={{ fontFamily: '"Scheherazade New", serif', fontSize: '1.2rem' }} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sr-translit" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Transliteration</Label>
            <Textarea id="sr-translit" value={form.transliteration} onChange={(e) => set('transliteration', e.target.value)}
              placeholder="As-siwāku maṭharatun lil-fami..." className="min-h-[56px] text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sr-translation" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Translation</Label>
            <Textarea id="sr-translation" value={form.translation} onChange={(e) => set('translation', e.target.value)}
              placeholder="The Miswak is purifying for the mouth..." className="min-h-[56px] text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sr-desc" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Description / Explanation</Label>
            <Textarea id="sr-desc" value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder="Explain the sunnah, its benefits, or how to perform it..." className="min-h-[70px] text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sr-category" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Category *</Label>
              <select id="sr-category" value={form.category} onChange={(e) => set('category', e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring">
                {SUNNAH_CATEGORIES.map((cat) => <option key={cat} value={cat}>{SUNNAH_CATEGORY_LABELS[cat] ?? cat}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sr-count" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Count / Repetitions</Label>
              <Input id="sr-count" value={form.count} onChange={(e) => set('count', e.target.value)} placeholder="e.g. 3 or daily" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5 col-span-1">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Group Name</Label>
              {!showGroupInput ? (
                <select value={form.group_name}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setShowGroupInput(true); set('group_name', '');
                      setTimeout(() => groupInputRef.current?.focus(), 50);
                    } else {
                      set('group_name', e.target.value);
                      if (e.target.value && e.target.value in groupOrderMap) {
                        const o = groupOrderMap[e.target.value];
                        set('group_order', o !== null ? o : '');
                      }
                    }
                  }}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— None —</option>
                  {existingGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                  <option value="__new__">+ Add new group…</option>
                </select>
              ) : (
                <div className="flex gap-1.5">
                  <Input ref={groupInputRef} value={form.group_name} onChange={(e) => set('group_name', e.target.value)}
                    placeholder="New group name…" className="flex-1" />
                  <button type="button" onClick={() => { setShowGroupInput(false); if (!existingGroups.includes(form.group_name as string)) set('group_name', ''); }}
                    className="px-2 h-9 rounded-md border border-input text-xs text-muted-foreground hover:bg-secondary" title="Back">↩</button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Group Order</Label>
              <Input type="number" min={1} value={form.group_order} onChange={(e) => set('group_order', e.target.value)} placeholder="e.g. 10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Display Order</Label>
              <Input type="number" min={1} value={form.display_order} onChange={(e) => set('display_order', e.target.value)} placeholder="e.g. 10" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sr-ref" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Reference</Label>
            <Input id="sr-ref" value={form.reference} onChange={(e) => set('reference', e.target.value)}
              placeholder="e.g. Bukhari 245 or Sunan Abu Dawud 46" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Image / File URL</Label>
              {form.file_url && (
                <a href={form.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                  <ExternalLink size={11} /> Preview
                </a>
              )}
            </div>
            {form.file_url && (
              <div className="relative w-full rounded-xl overflow-hidden border border-border bg-muted/30 flex items-center justify-center" style={{ maxHeight: 160 }}>
                <img src={form.file_url} alt="Attached" className="object-contain w-full" style={{ maxHeight: 160 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <button type="button" onClick={() => set('file_url', '')}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-destructive/90 text-white hover:bg-destructive shadow" title="Remove">
                  <Trash2 size={12} />
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <Input value={form.file_url} onChange={(e) => set('file_url', e.target.value)} placeholder="https://... or upload" className="flex-1 text-sm" />
              <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] text-xs font-medium hover:bg-[hsl(142_50%_95%)] transition-colors disabled:opacity-50 shrink-0">
                {uploadingImage ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                {uploadingImage ? 'Uploading…' : 'Upload'}
              </button>
              <input ref={imageInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingImage(true);
                  const ext = file.name.split('.').pop() ?? 'jpg';
                  const path = `adhkar/${crypto.randomUUID()}.${ext}`;
                  const { data, error } = await supabase.storage.from('adhkar-images').upload(path, file, { contentType: file.type, upsert: false });
                  setUploadingImage(false);
                  if (error || !data) { toast.error('Upload failed: ' + (error?.message ?? 'Unknown')); return; }
                  const { data: urlData } = supabase.storage.from('adhkar-images').getPublicUrl(data.path);
                  set('file_url', urlData.publicUrl);
                  toast.success('Image uploaded.');
                  if (imageInputRef.current) imageInputRef.current.value = '';
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Switch id="sr-active" checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} />
            <Label htmlFor="sr-active" className="cursor-pointer">Active (visible in app)</Label>
          </div>
        </div>

        <DialogFooter className="pt-2 gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} className="border-[hsl(140_20%_88%)]">Cancel</Button>
          {isEdit && (
            <Button
              variant="outline"
              onClick={() => { handleSaveAsCopy(); onClose(); }}
              className="gap-1.5 border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)]"
            >
              <Copy size={13} /> Save as New Copy
            </Button>
          )}
          <Button
            onClick={() => { isEdit ? handleSaveChanges() : handleSaveAsCopy(); onClose(); }}
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            {isEdit ? 'Save Changes' : 'Add Reminder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SunnahReminderModal;

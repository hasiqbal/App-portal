import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '#/components/ui/dialog';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Textarea } from '#/components/ui/textarea';
import { Switch } from '#/components/ui/switch';
import { createDonationOptionWithStripe, updateDonationOption } from '#/lib/api';
import type { DonationFrequency, DonationOption } from '#/types';
import { toast } from 'sonner';

interface DonationOptionModalProps {
  open: boolean;
  option: DonationOption | null;
  onClose: () => void;
  onSaved: (option: DonationOption) => void;
}

type FormState = {
  title: string;
  subtitle: string;
  frequency: DonationFrequency;
  amount_minor: string;
  currency: string;
  is_custom: boolean;
  tags: string;
  is_active: boolean;
  is_featured: boolean;
  is_pinned: boolean;
  pin_order: string;
  display_order: string;
  global_order: string;
  campaign_label: string;
  campaign_copy: string;
  promo_start_at: string;
  promo_end_at: string;
  price_slot: string;
  stripe_price_id: string;
  stripe_product_id: string;
};

const TAG_PRESETS = ['Masjid Rebuild', 'General', 'Sadaqah', 'Zakat', 'Emergency Appeal', 'Ramadan'];

const EMPTY_FORM: FormState = {
  title: '',
  subtitle: '',
  frequency: 'one-off',
  amount_minor: '',
  currency: 'GBP',
  is_custom: false,
  tags: '',
  is_active: true,
  is_featured: false,
  is_pinned: false,
  pin_order: '0',
  display_order: '0',
  global_order: '0',
  campaign_label: '',
  campaign_copy: '',
  promo_start_at: '',
  promo_end_at: '',
  price_slot: '',
  stripe_price_id: '',
  stripe_product_id: '',
};

function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

function toIsoOrNull(localInput: string): string | null {
  if (!localInput.trim()) return null;
  const parsed = new Date(localInput);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

const DonationOptionModal = ({ open, option, onClose, onSaved }: DonationOptionModalProps) => {
  const isEdit = !!option;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;

    if (!option) {
      setForm(EMPTY_FORM);
      return;
    }

    setForm({
      title: option.title,
      subtitle: option.subtitle ?? '',
      frequency: option.frequency,
      amount_minor: option.amount_minor !== null ? String(option.amount_minor) : '',
      currency: option.currency ?? 'GBP',
      is_custom: option.is_custom,
      tags: (option.tags ?? []).join(', '),
      is_active: option.is_active,
      is_featured: option.is_featured,
      is_pinned: option.is_pinned,
      pin_order: String(option.pin_order ?? 0),
      display_order: String(option.display_order ?? 0),
      global_order: String(option.global_order ?? 0),
      campaign_label: option.campaign_label ?? '',
      campaign_copy: option.campaign_copy ?? '',
      promo_start_at: toLocalInputValue(option.promo_start_at),
      promo_end_at: toLocalInputValue(option.promo_end_at),
      price_slot: option.price_slot !== null ? String(option.price_slot) : '',
      stripe_price_id: option.stripe_price_id ?? '',
      stripe_product_id: option.stripe_product_id ?? '',
    });
  }, [open, option]);

  const selectedTags = useMemo(() => parseTags(form.tags), [form.tags]);

  const toggleTag = (tag: string) => {
    setForm((prev) => {
      const tags = parseTags(prev.tags);
      const hasTag = tags.includes(tag);
      const nextTags = hasTag ? tags.filter((value) => value !== tag) : [...tags, tag];
      return { ...prev, tags: nextTags.join(', ') };
    });
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required.');
      return;
    }

    if (!form.is_custom) {
      const parsedAmount = Number(form.amount_minor);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        toast.error('Amount (minor units) must be greater than 0 for fixed options.');
        return;
      }
    }

    if (form.price_slot.trim()) {
      const slot = Number(form.price_slot);
      if (!Number.isInteger(slot) || slot < 1 || slot > 9) {
        toast.error('Price slot must be a number from 1 to 9.');
        return;
      }
    }

    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      frequency: form.frequency,
      amount_minor: form.is_custom ? null : Number(form.amount_minor),
      currency: (form.currency.trim() || 'GBP').toUpperCase(),
      is_custom: form.is_custom,
      tags: parseTags(form.tags),
      is_active: form.is_active,
      is_featured: form.is_featured,
      is_pinned: form.is_pinned,
      pin_order: Number(form.pin_order) || 0,
      display_order: Number(form.display_order) || 0,
      global_order: Number(form.global_order) || 0,
      campaign_label: form.campaign_label.trim() || null,
      campaign_copy: form.campaign_copy.trim() || null,
      promo_start_at: toIsoOrNull(form.promo_start_at),
      promo_end_at: toIsoOrNull(form.promo_end_at),
      price_slot: form.price_slot.trim() ? Number(form.price_slot) : null,
      stripe_price_id: form.stripe_price_id.trim() || null,
      stripe_product_id: form.stripe_product_id.trim() || null,
    };

    setSaving(true);
    try {
      const saved = option
        ? await updateDonationOption(option.id, payload)
        : await createDonationOptionWithStripe(payload);

      onSaved(saved);
      toast.success(option ? 'Donation option updated.' : 'Donation option created and linked to Stripe.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save donation option.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto border-[hsl(140_20%_88%)]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[hsl(150_30%_18%)]">
            {isEdit ? 'Edit Donation Option' : 'Create Donation Option'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Title *</Label>
              <Input value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="e.g. £25 monthly" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Frequency</Label>
              <select
                value={form.frequency}
                onChange={(e) => setField('frequency', e.target.value as DonationFrequency)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="one-off">One-off</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Subtitle</Label>
            <Textarea
              value={form.subtitle}
              onChange={(e) => setField('subtitle', e.target.value)}
              placeholder="Short helper text for the card"
              className="min-h-[60px]"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.is_custom} onCheckedChange={(value) => setField('is_custom', value)} />
            <Label className="text-sm">Custom amount option (no fixed amount)</Label>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Amount (minor)</Label>
              <Input
                type="number"
                min={0}
                value={form.amount_minor}
                disabled={form.is_custom}
                onChange={(e) => setField('amount_minor', e.target.value)}
                placeholder="e.g. 2500"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Currency</Label>
              <Input value={form.currency} onChange={(e) => setField('currency', e.target.value.toUpperCase())} maxLength={3} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Price Slot (1-9)</Label>
              <Input
                type="number"
                min={1}
                max={9}
                value={form.price_slot}
                onChange={(e) => setField('price_slot', e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Global Order</Label>
              <Input
                type="number"
                min={0}
                value={form.global_order}
                onChange={(e) => setField('global_order', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Stripe Price ID</Label>
              <Input
                value={form.stripe_price_id}
                onChange={(e) => setField('stripe_price_id', e.target.value)}
                placeholder="price_..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Stripe Product ID</Label>
              <Input
                value={form.stripe_product_id}
                onChange={(e) => setField('stripe_product_id', e.target.value)}
                placeholder="prod_..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Tags (comma-separated, free text)</Label>
            <Input
              value={form.tags}
              onChange={(e) => setField('tags', e.target.value)}
              placeholder="Masjid Rebuild, Sadaqah"
            />
            <div className="flex flex-wrap gap-2">
              {TAG_PRESETS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      active
                        ? 'bg-[hsl(142_50%_92%)] text-[hsl(142_60%_28%)] border-[hsl(142_35%_75%)]'
                        : 'bg-white text-muted-foreground border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Pin Order</Label>
              <Input type="number" min={0} value={form.pin_order} onChange={(e) => setField('pin_order', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Section Order</Label>
              <Input
                type="number"
                min={0}
                value={form.display_order}
                onChange={(e) => setField('display_order', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Campaign Label</Label>
              <Input value={form.campaign_label} onChange={(e) => setField('campaign_label', e.target.value)} placeholder="e.g. Recommended" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Campaign Copy</Label>
            <Textarea
              value={form.campaign_copy}
              onChange={(e) => setField('campaign_copy', e.target.value)}
              placeholder="Optional promotional text"
              className="min-h-[52px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Promo Start (Europe/London)</Label>
              <Input type="datetime-local" value={form.promo_start_at} onChange={(e) => setField('promo_start_at', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Promo End (Europe/London)</Label>
              <Input type="datetime-local" value={form.promo_end_at} onChange={(e) => setField('promo_end_at', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_active} onCheckedChange={(value) => setField('is_active', value)} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_featured} onCheckedChange={(value) => setField('is_featured', value)} />
              Featured
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_pinned} onCheckedChange={(value) => setField('is_pinned', value)} />
              Pinned
            </label>
          </div>
        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Option'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DonationOptionModal;

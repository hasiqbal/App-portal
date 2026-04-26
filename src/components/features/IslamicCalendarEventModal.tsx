import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '#/components/ui/dialog';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Textarea } from '#/components/ui/textarea';
import { createIslamicCalendarEvent, updateIslamicCalendarEvent } from '#/lib/api';
import type { IslamicCalendarEvent, IslamicCalendarEventType } from '#/types';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '#/lib/supabase';

// ─── Hijri month reference ────────────────────────────────────────────────────

const HIJRI_MONTHS: { value: number; label: string }[] = [
  { value: 1,  label: 'Muharram'         },
  { value: 2,  label: 'Safar'            },
  { value: 3,  label: 'Rabi al-Awwal'   },
  { value: 4,  label: 'Rabi al-Thani'   },
  { value: 5,  label: 'Jumada al-Awwal' },
  { value: 6,  label: 'Jumada al-Thani' },
  { value: 7,  label: 'Rajab'           },
  { value: 8,  label: "Sha'ban"         },
  { value: 9,  label: 'Ramadan'         },
  { value: 10, label: 'Shawwal'         },
  { value: 11, label: "Dhu al-Qi'dah"  },
  { value: 12, label: 'Dhu al-Hijjah'  },
];

const HIJRI_DAYS = Array.from({ length: 30 }, (_, i) => i + 1);

// ─── Types ────────────────────────────────────────────────────────────────────

interface IslamicCalendarEventModalProps {
  open: boolean;
  event: IslamicCalendarEvent | null;
  onClose: () => void;
  onSaved: (event: IslamicCalendarEvent) => void;
}

type FormState = {
  title: string;
  event_type: IslamicCalendarEventType;
  hijri_day: string;
  hijri_month: string;
  field_label: string;
  region: string;
  notes: string;
  source_name: string;
  auto_delete_grace_days: string;
};

const EMPTY_FORM: FormState = {
  title: '',
  event_type: 'important_date',
  hijri_day: '1',
  hijri_month: '1',
  field_label: '',
  region: '',
  notes: '',
  source_name: '',
  auto_delete_grace_days: '3',
};

// ─── Component ────────────────────────────────────────────────────────────────

const IslamicCalendarEventModal = ({ open, event, onClose, onSaved }: IslamicCalendarEventModalProps) => {
  const isEdit = !!event;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [resolvedGregorianDate, setResolvedGregorianDate] = useState<string | null>(null);
  const [resolvedHijriYear, setResolvedHijriYear] = useState<number | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!event) {
      setForm(EMPTY_FORM);
      setResolvedGregorianDate(null);
      setResolvedHijriYear(null);
      setLookupError(null);
      return;
    }
    setForm({
      title: event.title,
      event_type: event.event_type,
      hijri_day: String(event.linked_hijri_day),
      hijri_month: String(event.linked_hijri_month),
      field_label: event.field_label ?? '',
      region: event.region ?? '',
      notes: event.notes ?? '',
      source_name: event.source_name ?? '',
      auto_delete_grace_days: String(event.auto_delete_grace_days ?? 3),
    });
    setResolvedGregorianDate(event.linked_gregorian_date);
    setResolvedHijriYear(event.linked_hijri_year);
    setLookupError(null);
  }, [event, open]);

  const set = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear resolved date when day/month changes
    if (field === 'hijri_day' || field === 'hijri_month') {
      setResolvedGregorianDate(null);
      setResolvedHijriYear(null);
      setLookupError(null);
    }
  };

  // ── Lookup Gregorian date from hijri_calendar table ─────────────────────────
  const handleLookup = async () => {
    const day = parseInt(form.hijri_day);
    const month = parseInt(form.hijri_month);
    if (!day || !month || day < 1 || day > 30 || month < 1 || month > 12) {
      setLookupError('Enter a valid Hijri day (1–30) and month.');
      return;
    }

    setLookingUp(true);
    setLookupError(null);
    setResolvedGregorianDate(null);
    setResolvedHijriYear(null);

    try {
      // Get all rows for the current Gregorian year to find the Hijri day/month match
      const currentYear = new Date().getFullYear();
      const { data, error } = await supabase
        .from('hijri_calendar')
        .select('gregorian_date,hijri_date')
        .eq('gregorian_year', currentYear)
        .order('gregorian_date', { ascending: true });

      if (error || !data) {
        setLookupError('Could not reach the Hijri calendar database.');
        return;
      }

      // Parse each row's hijri_date and find a match for day+month
      let matched: { gregorian_date: string; hijri_date: string } | null = null;
      for (const row of data as { gregorian_date: string; hijri_date: string }[]) {
        const m = row.hijri_date.match(/^(\d+)\s+(.+?)\s+(\d{4})\s+AH/);
        if (!m) continue;
        const rowDay = parseInt(m[1]);
        // Map month name to number
        const monthName = m[2].toLowerCase().trim();
        const rowMonth = HIJRI_MONTHS.findIndex(
          (hm) => hm.label.toLowerCase() === monthName
        ) + 1;
        if (rowDay === day && rowMonth === month) {
          matched = row;
          break;
        }
      }

      if (!matched) {
        setLookupError(`No match found for day ${day} of ${HIJRI_MONTHS[month - 1]?.label} in ${currentYear}. The Hijri calendar may not cover this date.`);
        return;
      }

      // Extract Hijri year from matched hijri_date string
      const yearMatch = matched.hijri_date.match(/(\d{4})\s+AH/);
      const hijriYear = yearMatch ? parseInt(yearMatch[1]) : currentYear;

      setResolvedGregorianDate(matched.gregorian_date);
      setResolvedHijriYear(hijriYear);
    } catch {
      setLookupError('Lookup failed. Please try again.');
    } finally {
      setLookingUp(false);
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required.');
      return;
    }
    const day = parseInt(form.hijri_day);
    const month = parseInt(form.hijri_month);
    if (!day || day < 1 || day > 30) {
      toast.error('Hijri day must be between 1 and 30.');
      return;
    }
    if (!month || month < 1 || month > 12) {
      toast.error('Hijri month must be between 1 and 12.');
      return;
    }
    if (!resolvedGregorianDate || !resolvedHijriYear) {
      toast.error('Look up the Gregorian date before saving.');
      return;
    }

    const monthLabel = HIJRI_MONTHS[month - 1]?.label ?? `Month ${month}`;
    const hijriLabel = `${day} ${monthLabel} ${resolvedHijriYear} AH`;

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        event_type: form.event_type,
        linked_hijri_day: day,
        linked_hijri_month: month,
        linked_hijri_year: resolvedHijriYear,
        linked_hijri_label: hijriLabel,
        linked_gregorian_date: resolvedGregorianDate,
        field_label: form.field_label.trim() || null,
        region: form.region.trim() || null,
        notes: form.notes.trim() || null,
        source_name: form.source_name.trim() || null,
        auto_delete_grace_days: parseInt(form.auto_delete_grace_days) || 3,
      };

      let saved: IslamicCalendarEvent;
      if (isEdit) {
        saved = await updateIslamicCalendarEvent(event!.id, payload);
        toast.success('Event updated.');
      } else {
        saved = await createIslamicCalendarEvent(payload);
        toast.success('Event added.');
      }
      onSaved(saved);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save event.');
    } finally {
      setSaving(false);
    }
  };

  const monthLabel = HIJRI_MONTHS[parseInt(form.hijri_month) - 1]?.label ?? '';
  const hijriPreview = resolvedGregorianDate
    ? `${form.hijri_day} ${monthLabel} ${resolvedHijriYear} AH → ${resolvedGregorianDate}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Islamic Calendar Event' : 'Add Islamic Calendar Event'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Mawlid al-Nabi, Eid al-Adha"
            />
          </div>

          {/* Event type */}
          <div className="space-y-1.5">
            <Label>Event Type</Label>
            <div className="flex gap-2">
              {(['important_date', 'masjid_event'] as IslamicCalendarEventType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('event_type', t)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    form.event_type === t
                      ? 'bg-[hsl(142_60%_35%)] text-white border-[hsl(142_60%_35%)]'
                      : 'bg-white text-muted-foreground border-border hover:border-[hsl(142_60%_35%)]'
                  }`}
                >
                  {t === 'important_date' ? 'Important Date' : 'Masjid Event'}
                </button>
              ))}
            </div>
          </div>

          {/* Hijri Date picker */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Hijri Date
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Month <span className="text-red-500">*</span></Label>
                <select
                  value={form.hijri_month}
                  onChange={(e) => set('hijri_month', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {HIJRI_MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>{m.value}. {m.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Day <span className="text-red-500">*</span></Label>
                <select
                  value={form.hijri_day}
                  onChange={(e) => set('hijri_day', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {HIJRI_DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Lookup button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLookup}
              disabled={lookingUp}
              className="w-full"
            >
              {lookingUp
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Looking up…</>
                : <><Search className="w-3.5 h-3.5 mr-1.5" />Look Up Gregorian Date</>
              }
            </Button>

            {/* Result */}
            {hijriPreview && (
              <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800 font-medium">
                ✓ {hijriPreview}
              </div>
            )}
            {lookupError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {lookupError}
              </div>
            )}
          </div>

          {/* Field label */}
          <div className="space-y-1.5">
            <Label>Field Label <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              value={form.field_label}
              onChange={(e) => set('field_label', e.target.value)}
              placeholder="e.g. Urs, Wiladat, Battle"
            />
          </div>

          {/* Source name */}
          <div className="space-y-1.5">
            <Label>Source Name <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              value={form.source_name}
              onChange={(e) => set('source_name', e.target.value)}
              placeholder="e.g. Islamic History"
            />
          </div>

          {/* Region */}
          <div className="space-y-1.5">
            <Label>Region <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              value={form.region}
              onChange={(e) => set('region', e.target.value)}
              placeholder="e.g. Global, UK, South Asia"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Additional details…"
              rows={2}
            />
          </div>

          {/* Auto-delete grace days */}
          <div className="space-y-1.5">
            <Label>Auto-delete grace days</Label>
            <Input
              type="number"
              min={0}
              max={30}
              value={form.auto_delete_grace_days}
              onChange={(e) => set('auto_delete_grace_days', e.target.value)}
              className="w-24"
            />
            <p className="text-[11px] text-muted-foreground">
              Days after the Gregorian date before this row is auto-removed (0–30).
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !resolvedGregorianDate}
            className="bg-[hsl(142_60%_35%)] hover:bg-[hsl(142_60%_28%)] text-white"
          >
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : isEdit ? 'Save Changes' : 'Add Event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default IslamicCalendarEventModal;

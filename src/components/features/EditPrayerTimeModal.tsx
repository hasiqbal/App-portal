import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { PrayerTime, PrayerTimeUpdate, HijriCalendarEntry } from '#/types';
import { updatePrayerTime } from '#/lib/api';
import { supabaseAdmin } from '#/lib/supabase';
import { toast } from 'sonner';
import { Minus, Plus, Clock, Moon } from 'lucide-react';


interface EditPrayerTimeModalProps {
  row: PrayerTime | null;
  year: number;
  hijriEntry: HijriCalendarEntry | null;
  onClose: () => void;
  onSaved: (updated: PrayerTime) => void;
  onHijriSaved: (day: number, entry: HijriCalendarEntry) => void;
}

/**
 * Fetch accurate Hijri date from Aladhan API (path format).
 * Throws on failure — no local fallback, API only.
 */
async function fetchHijriFromApi(year: number, month: number, day: number): Promise<{ hijri: string; gregorian: string }> {
  const gDay   = String(day).padStart(2, '0');
  const gMonth = String(month).padStart(2, '0');
  const gregStr = `${gDay}-${gMonth}-${year}`;
  const res = await fetch(`https://api.aladhan.com/v1/gToH/${gregStr}`);
  if (!res.ok) throw new Error(`Aladhan API error ${res.status}`);
  const json = await res.json();
  const h = json?.data?.hijri;
  if (!h) throw new Error('Unexpected API response');
  return {
    hijri: `${parseInt(h.day, 10)} ${h.month.en} ${h.year} AH`,
    gregorian: `${year}-${gMonth}-${gDay}`,
  };
}

/**
 * Save Hijri date for a specific day to the hijri_calendar table.
 * Single upsert — no double-call fallback (faster saves).
 */
async function saveHijriToDb(
  year: number,
  month: number,
  day: number,
  hijriDate: string,
  gregorianDate: string,
): Promise<HijriCalendarEntry | null> {
  const entry = {
    gregorian_year:  year,
    gregorian_month: month,
    gregorian_day:   day,
    gregorian_date:  gregorianDate,
    hijri_date:      hijriDate,
    updated_at:      new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('hijri_calendar')
    .upsert(entry, { onConflict: 'gregorian_year,gregorian_month,gregorian_day' })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[hijri_calendar] Save error:', error.message);
    // Provide helpful context for schema errors
    if (error.message.includes('schema cache') || error.message.includes('column')) {
      console.error(
        '[hijri_calendar] Schema error — run the SQL setup in your Supabase dashboard.\n',
        'Required columns: gregorian_year, gregorian_month, gregorian_day, gregorian_date, hijri_date',
      );
    }
    return null;
  }

  return data as HijriCalendarEntry;
}

const FIELDS: { key: keyof PrayerTimeUpdate; label: string; group: string }[] = [
  { key: 'fajr',          label: 'Fajr',          group: 'start' },
  { key: 'fajr_jamat',    label: 'Fajr Jamaat',    group: 'jamat' },
  { key: 'sunrise',       label: 'Sunrise',        group: 'start' },
  { key: 'ishraq',        label: 'Ishraq',         group: 'start' },
  { key: 'zawaal',        label: 'Zawaal',         group: 'start' },
  { key: 'zuhr',          label: 'Zuhr',           group: 'start' },
  { key: 'zuhr_jamat',    label: 'Zuhr Jamaat',    group: 'jamat' },
  { key: 'asr',           label: 'Asr',            group: 'start' },
  { key: 'asr_jamat',     label: 'Asr Jamaat',     group: 'jamat' },
  { key: 'maghrib',       label: 'Maghrib',        group: 'start' },
  { key: 'maghrib_jamat', label: 'Maghrib Jamaat', group: 'jamat' },
  { key: 'isha',          label: 'Isha',           group: 'start' },
  { key: 'isha_jamat',    label: 'Isha Jamaat',    group: 'jamat' },
  { key: 'jumu_ah_1',     label: "Jumu'ah 1",      group: 'jumuah' },
  { key: 'jumu_ah_2',     label: "Jumu'ah 2",      group: 'jumuah' },
];

// ─── Time stepper helper ──────────────────────────────────────────────────────

function adjustTime(time: string, deltaMinutes: number): string {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time.trim())) return time;
  const [h, m] = time.trim().split(':').map(Number);
  const totalMinutes = h * 60 + m + deltaMinutes;
  const clamped = ((totalMinutes % 1440) + 1440) % 1440;
  const nh = Math.floor(clamped / 60);
  const nm = clamped % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

// ─── TimeField ────────────────────────────────────────────────────────────────

interface TimeFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

const TimeField = ({ label, value, onChange }: TimeFieldProps) => {
  const canStep = !!value && /^\d{1,2}:\d{2}$/.test(value.trim());

  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">{label}</Label>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(adjustTime(value, -1))}
          disabled={!canStep}
          className="w-7 h-9 flex items-center justify-center rounded-md border border-[hsl(140_20%_88%)] bg-white hover:bg-[hsl(142_50%_95%)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          title="Subtract 1 minute"
        >
          <Minus size={11} className="text-[hsl(142_60%_32%)]" />
        </button>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="HH:MM"
          className="font-mono text-sm h-9 text-center min-w-0 border-[hsl(140_20%_88%)] focus:border-[hsl(142_50%_70%)]"
        />
        <button
          type="button"
          onClick={() => onChange(adjustTime(value, +1))}
          disabled={!canStep}
          className="w-7 h-9 flex items-center justify-center rounded-md border border-[hsl(140_20%_88%)] bg-white hover:bg-[hsl(142_50%_95%)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          title="Add 1 minute"
        >
          <Plus size={11} className="text-[hsl(142_60%_32%)]" />
        </button>
      </div>
    </div>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const EditPrayerTimeModal = ({ row, year, hijriEntry, onClose, onSaved, onHijriSaved }: EditPrayerTimeModalProps) => {
  const [form, setForm] = useState<Record<string, string>>({});
  const [hijriDateStr,  setHijriDateStr]  = useState('');
  const [gregorianStr,  setGregorianStr]  = useState('');
  const [saving,        setSaving]        = useState(false);
  const [fillingHijri,  setFillingHijri]  = useState(false);

  useEffect(() => {
    if (row) {
      const initial: Record<string, string> = {};
      FIELDS.forEach(({ key }) => {
        initial[key] = (row[key as keyof PrayerTime] as string | null) ?? '';
      });
      setForm(initial);

      // Pre-fill Hijri from the passed hijriEntry (loaded from hijri_calendar table)
      setHijriDateStr(hijriEntry?.hijri_date ?? '');
      setGregorianStr(hijriEntry?.gregorian_date ?? '');
    }
  }, [row, hijriEntry]);

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const autoFillHijri = async () => {
    if (!row) return;
    setFillingHijri(true);
    try {
      const result = await fetchHijriFromApi(year, row.month, row.day);
      setHijriDateStr(result.hijri);
      setGregorianStr(result.gregorian);
      console.log(`[Aladhan] Day ${row.day}: ${result.gregorian} → ${result.hijri}`);
    } catch (e) {
      console.error('[Aladhan] Auto-fill failed:', e);
      toast.error('Aladhan API request failed. Check connection and try again.');
    } finally {
      setFillingHijri(false);
    }
  };

  const handleSave = async () => {
    if (!row) return;
    setSaving(true);
    try {
      // Build prayer time payload
      const payload: PrayerTimeUpdate = {};
      FIELDS.forEach(({ key }) => {
        const val = (form[key] ?? '').trim();
        (payload as Record<string, string | null>)[key] = val === '' ? null : val;
      });

      // Build hijri payload (if provided)
      const hijriTrimmed = hijriDateStr.trim();
      const gregTrimmed  = gregorianStr.trim();
      const gStr = gregTrimmed || (() => {
        const gDay   = String(row.day).padStart(2, '0');
        const gMonth = String(row.month).padStart(2, '0');
        return `${year}-${gMonth}-${gDay}`;
      })();

      // Run prayer time save + hijri save in PARALLEL for speed
      const [prayerResult, hijriResult] = await Promise.all([
        updatePrayerTime(row.id, payload),
        hijriTrimmed
          ? saveHijriToDb(year, row.month, row.day, hijriTrimmed, gStr)
          : Promise.resolve(null),
      ]);

      const updated = prayerResult[0] ?? { ...row, ...payload };
      onSaved(updated as PrayerTime);

      if (hijriTrimmed) {
        if (hijriResult) {
          onHijriSaved(row.day, hijriResult);
          toast.success(`Day ${row.day} saved — prayer times + Hijri date updated`);
        } else {
          toast.warning(
            `Prayer times saved, but Hijri date write failed. ` +
            `Check the hijri_calendar table schema in your Supabase dashboard.`
          );
        }
      } else {
        toast.success(`Day ${row.day} updated successfully`);
      }
    } catch {
      toast.error('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const startFields  = FIELDS.filter(f => f.group === 'start');
  const jamatFields  = FIELDS.filter(f => f.group === 'jamat');
  const jumuahFields = FIELDS.filter(f => f.group === 'jumuah');

  return (
    <Dialog open={!!row} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-2xl max-h-[92vh] overflow-y-auto mx-2 sm:mx-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
              <Clock size={17} className="text-[hsl(142_60%_32%)]" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-[hsl(150_30%_12%)]">
                Edit Prayer Times — {row ? `${MONTHS[(row.month ?? 1) - 1]} ${row.day}` : ''}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Times in HH:MM (24-hour). Use +/− to nudge by 1 minute.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Starting times */}
          <div className="rounded-xl border border-[hsl(140_20%_88%)] overflow-hidden">
            <div className="px-4 py-2.5 bg-[hsl(142_30%_97%)] border-b border-[hsl(140_20%_88%)]">
              <p className="text-xs font-bold text-[hsl(142_60%_32%)] uppercase tracking-wider">Starting Times</p>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {startFields.map(({ key, label }) => (
                <TimeField key={key} label={label} value={form[key] ?? ''} onChange={(v) => handleChange(key, v)} />
              ))}
            </div>
          </div>

          {/* Jamaat times */}
          <div className="rounded-xl border border-[hsl(140_20%_88%)] overflow-hidden">
            <div className="px-4 py-2.5 bg-[hsl(142_30%_97%)] border-b border-[hsl(140_20%_88%)]">
              <p className="text-xs font-bold text-[hsl(142_60%_32%)] uppercase tracking-wider">Jamaat Times</p>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {jamatFields.map(({ key, label }) => (
                <TimeField key={key} label={label} value={form[key] ?? ''} onChange={(v) => handleChange(key, v)} />
              ))}
            </div>
          </div>

          {/* Jumu'ah times */}
          <div className="rounded-xl border border-[hsl(140_20%_88%)] overflow-hidden">
            <div className="px-4 py-2.5 bg-[hsl(142_30%_97%)] border-b border-[hsl(140_20%_88%)]">
              <p className="text-xs font-bold text-[hsl(0_60%_45%)] uppercase tracking-wider">Jumu'ah Times <span className="text-[10px] font-normal text-muted-foreground normal-case">(Fridays only)</span></p>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {jumuahFields.map(({ key, label }) => (
                <TimeField key={key} label={label} value={form[key] ?? ''} onChange={(v) => handleChange(key, v)} />
              ))}
            </div>
          </div>

          {/* Hijri date — stored in hijri_calendar table */}
          <div className="rounded-xl border border-[hsl(210_30%_88%)] overflow-hidden">
            <div className="px-4 py-2.5 bg-[hsl(210_30%_97%)] border-b border-[hsl(210_30%_88%)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon size={13} className="text-[#7c3aed]" />
                <p className="text-xs font-bold text-[#7c3aed] uppercase tracking-wider">Hijri Date</p>
                <span className="text-[10px] text-muted-foreground normal-case font-normal">
                  {hijriEntry ? '✓ from hijri_calendar DB' : '– not yet saved'}
                </span>
              </div>
              <button
                type="button"
                onClick={autoFillHijri}
                disabled={fillingHijri}
                className="text-[10px] font-semibold text-[#7c3aed] hover:underline flex items-center gap-1 disabled:opacity-50"
              >
                {fillingHijri ? 'Fetching…' : 'Auto-fill (Aladhan API)'}
              </button>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div>
                <Label className="text-xs font-semibold text-[hsl(150_30%_18%)] mb-1.5 block">Hijri Date</Label>
                <Input
                  value={hijriDateStr}
                  onChange={(e) => setHijriDateStr(e.target.value)}
                  placeholder="e.g. 5 Shawwal 1447 AH"
                  className="font-mono text-sm h-9 border-[hsl(210_30%_80%)] focus:border-[#7c3aed]"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-[hsl(150_30%_18%)] mb-1.5 block">Gregorian Date</Label>
                <Input
                  value={gregorianStr}
                  onChange={(e) => setGregorianStr(e.target.value)}
                  placeholder="e.g. 03/04/2026"
                  className="font-mono text-sm h-9 border-[hsl(210_30%_80%)] focus:border-[#7c3aed]"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Saved to the <strong>hijri_calendar</strong> table (separate from prayer_times).
                "Auto-fill" fetches from Aladhan API for accurate Islamic calendar dates.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2 gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose} disabled={saving} className="border-[hsl(140_20%_88%)]">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditPrayerTimeModal;

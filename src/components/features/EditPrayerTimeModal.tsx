import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PrayerTime, PrayerTimeUpdate } from '@/types';
import { updatePrayerTime } from '@/lib/api';
import { toast } from 'sonner';
import { Minus, Plus, Clock } from 'lucide-react';

interface EditPrayerTimeModalProps {
  row: PrayerTime | null;
  onClose: () => void;
  onSaved: (updated: PrayerTime) => void;
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

const EditPrayerTimeModal = ({ row, onClose, onSaved }: EditPrayerTimeModalProps) => {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) {
      const initial: Record<string, string> = {};
      FIELDS.forEach(({ key }) => {
        initial[key] = (row[key as keyof PrayerTime] as string | null) ?? '';
      });
      setForm(initial);
    }
  }, [row]);

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!row) return;
    setSaving(true);
    try {
      const payload: PrayerTimeUpdate = {};
      FIELDS.forEach(({ key }) => {
        const val = (form[key] ?? '').trim();
        (payload as Record<string, string | null>)[key] = val === '' ? null : val;
      });
      const result = await updatePrayerTime(row.id, payload);
      const updated = result[0] ?? { ...row, ...payload };
      toast.success(`Day ${row.day} updated successfully`);
      onSaved(updated as PrayerTime);
    } catch (err) {
      console.error('Save error:', err);
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

import { useState } from 'react';
import { PrayerTime, HijriCalendarEntry, PrayerTimeUpdate } from '#/types';
import { Pencil, ChevronDown, ChevronRight, Star } from 'lucide-react';
import { getDayInfo } from '#/lib/dateUtils';
import { EidPrayer, EidType } from '#/components/features/EidTimesModal';

interface PrayerTimesTableProps {
  data: PrayerTime[];
  year: number;
  hijriOffset: number;
  hijriCalendar: Map<number, HijriCalendarEntry>;
  previewHijri?: Map<number, string>;
  pendingChanges?: Record<string, PrayerTimeUpdate>;
  eidPrayers: EidPrayer[];
  onEdit: (row: PrayerTime) => void;
  highlightDay?: number | null;
}

// ─── Eid detection from Hijri date string ──────────────────────────────────────
function detectEidType(hijriDate: string | undefined): EidType | null {
  if (!hijriDate) return null;

  const match = hijriDate.match(/^(\d{1,2})\s+(.+?)\s+\d{4}\s*AH$/i);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const monthKey = match[2]
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  if (day === 1 && monthKey === 'shawwal') return 'eid_al_fitr';
  if (day === 10 && monthKey.includes('hijj')) return 'eid_al_adha';
  return null;
}

// ─── Eid config ────────────────────────────────────────────────────────────────
const EID_CONFIG = {
  eid_al_fitr: {
    label:  'Eid al-Fitr',
    arabic: 'عيد الفطر',
    color:  '#15803d',
    bg:     '#f0fdf4',
    border: '#86efac',
    badge:  'bg-emerald-100 text-emerald-800',
  },
  eid_al_adha: {
    label:  'Eid al-Adha',
    arabic: 'عيد الأضحى',
    color:  '#b45309',
    bg:     '#fffbeb',
    border: '#fcd34d',
    badge:  'bg-amber-100 text-amber-800',
  },
};

// ─── Eid times display panel ───────────────────────────────────────────────────
const EidTimesDisplay = ({ eidType, eidPrayers }: { eidType: EidType; eidPrayers: EidPrayer[] }) => {
  const cfg = EID_CONFIG[eidType];
  const times = eidPrayers
    .filter(e => e.eid_type === eidType && e.time)
    .sort((a, b) => a.jamaat_number - b.jamaat_number);

  return (
    <div className="rounded-xl px-3 py-2.5 border mt-1" style={{ background: cfg.bg, borderColor: cfg.border }}>
      <div className="flex items-center gap-2 mb-2">
        <Star size={12} style={{ color: cfg.color }} />
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: cfg.color }}>{cfg.label}</span>
        <span className="ml-auto text-sm font-bold" style={{ color: cfg.color, fontFamily: 'serif' }} dir="rtl">{cfg.arabic}</span>
      </div>
      {times.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">No jamaats set — use the "Eid Times" button to add prayer times</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {times.map((e) => (
            <div key={e.jamaat_number} className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1 border" style={{ borderColor: cfg.border }}>
              <span className="text-[10px] font-bold" style={{ color: cfg.color }}>J{e.jamaat_number}</span>
              <span className="text-[13px] font-bold tabular-nums" style={{ color: cfg.color }}>{e.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Stacked cell (desktop) ────────────────────────────────────────────────────
const StackedCell = ({ start, jamat, alwaysShowBoth = false, editedStart = false, editedJamat = false }: {
  start: string | null;
  jamat: string | null | undefined;
  alwaysShowBoth?: boolean;
  editedStart?: boolean;
  editedJamat?: boolean;
}) => {
  const showSecond = alwaysShowBoth || jamat !== undefined;
  const edited = editedStart || editedJamat;
  return (
    <td className="px-1.5 py-2 text-center align-middle border-r border-border/10 last:border-r-0">
      <div className={`flex flex-col items-center gap-0.5 leading-none rounded-md px-1 py-1 ${edited ? 'bg-amber-50 border border-amber-200' : ''}`}>
        <span className="tabular-nums text-[12px] font-semibold py-0.5" style={{ color: start ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / 0.35)' }}>
          {start ?? '—'}
        </span>
        {showSecond && (
          <>
            <span className="tabular-nums text-[9px] py-0.5 font-medium text-muted-foreground" style={{ color: jamat ? 'hsl(var(--muted-foreground))' : 'hsl(var(--muted-foreground) / 0.35)' }}>
              J: {jamat ?? '—'}
            </span>
          </>
        )}
      </div>
    </td>
  );
};

// ─── Single cell (desktop) ─────────────────────────────────────────────────────
const SingleCell = ({ value, edited = false }: { value: string | null; edited?: boolean }) => (
  <td className="px-1.5 py-3 text-center border-r border-border/10 last:border-r-0">
    <span className={`tabular-nums text-[12px] font-semibold rounded-md px-1.5 py-1 inline-block ${edited ? 'bg-amber-50 border border-amber-200' : ''}`} style={{ color: value ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / 0.3)' }}>
      {value ?? '—'}
    </span>
  </td>
);

// ─── Hijri cell (DB + optional preview) ───────────────────────────────────────
const HijriCell = ({ hijriEntry, previewDate }: {
  hijriEntry: HijriCalendarEntry | undefined;
  previewDate?: string;
}) => {
  const fromDb = !!hijriEntry?.hijri_date;
  const hasPreview = !!previewDate;
  const parseHijri = (raw: string) => raw.match(/^(\d+)\s+(.+?)\s+(\d{4})\s*AH$/i);
  const isDiff = fromDb && hasPreview && hijriEntry!.hijri_date !== previewDate;

  return (
    <td className="px-2 py-2 border-r border-border/10 min-w-[88px]">
      {/* DB value */}
      {fromDb && (() => {
        const raw = hijriEntry!.hijri_date;
        const parts = parseHijri(raw);
        return parts ? (
          <div className="flex flex-col leading-tight gap-px">
            <div className="flex items-baseline gap-1">
              <span className="text-[14px] font-extrabold tabular-nums text-[#7c3aed] leading-none">{parts[1]}</span>
              <span className="text-[11px] font-bold text-[#7c3aed] leading-none whitespace-nowrap">{parts[2]}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-semibold text-[#7c3aed]/65 tabular-nums">{parts[3]} AH</span>
              <span className="text-[7px] font-bold bg-[#7c3aed]/12 text-[#7c3aed] px-1 py-px rounded">DB</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col leading-tight gap-px">
            <span className="text-[11px] font-semibold text-[#7c3aed] whitespace-nowrap leading-tight">{raw}</span>
            <span className="text-[7px] font-bold bg-[#7c3aed]/12 text-[#7c3aed] px-1 py-px rounded w-fit">DB</span>
          </div>
        );
      })()}

      {/* No DB, no preview */}
      {!fromDb && !hasPreview && (
        <div className="flex flex-col items-start leading-tight gap-px">
          <span className="text-[12px] text-muted-foreground/35 font-medium">—</span>
          <span className="text-[8px] text-muted-foreground/30 font-medium">No data</span>
        </div>
      )}

      {/* Preview value */}
      {hasPreview && (() => {
        const parts = parseHijri(previewDate!);
        return (
          <div className={`flex flex-col leading-tight gap-px ${fromDb ? 'mt-1.5 pt-1.5 border-t border-dashed border-[#7c3aed]/20' : ''}`}>
            {parts ? (
              <>
                {fromDb && isDiff && <span className="text-[8px] font-semibold text-amber-600">→ Preview</span>}
                {!fromDb && <span className="text-[8px] font-semibold text-amber-600">Preview</span>}
                <div className="flex items-baseline gap-1">
                  <span className={`text-[13px] font-bold tabular-nums leading-none ${isDiff ? 'text-amber-600' : 'text-[#7c3aed]/60'}`}>{parts[1]}</span>
                  <span className={`text-[10px] font-semibold leading-none whitespace-nowrap ${isDiff ? 'text-amber-500' : 'text-[#7c3aed]/50'}`}>{parts[2]}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-[8px] tabular-nums ${isDiff ? 'text-amber-500' : 'text-[#7c3aed]/40'}`}>{parts[3]} AH</span>
                  <span className={`text-[7px] font-bold px-1 py-px rounded border border-dashed ${
                    isDiff ? 'border-amber-300 text-amber-600 bg-amber-50' : 'border-[#7c3aed]/30 text-[#7c3aed]/60'
                  }`}>{isDiff ? 'PREVIEW' : 'MATCH'}</span>
                </div>
              </>
            ) : (
              <span className="text-[10px] text-[#7c3aed]/60 italic">{previewDate}</span>
            )}
          </div>
        );
      })()}
    </td>
  );
};

// ─── Prayer definitions ────────────────────────────────────────────────────────
const PRAYERS = [
  { key: 'fajr',    label: 'Fajr',     startKey: 'fajr',      jamatKey: 'fajr_jamat',    subLabel: '(start / jamaat)' },
  { key: 'sunrise', label: 'Sunrise',  startKey: 'sunrise',   jamatKey: null,            subLabel: null },
  { key: 'ishraq',  label: 'Ishraq',   startKey: 'ishraq',    jamatKey: null,            subLabel: null },
  { key: 'zawaal',  label: 'Zawaal',   startKey: 'zawaal',    jamatKey: null,            subLabel: null },
  { key: 'zuhr',    label: 'Zuhr',     startKey: 'zuhr',      jamatKey: 'zuhr_jamat',    subLabel: '(start / jamaat)' },
  { key: 'asr',     label: 'Asr',      startKey: 'asr',       jamatKey: 'asr_jamat',     subLabel: '(start / jamaat)' },
  { key: 'maghrib', label: 'Maghrib',  startKey: 'maghrib',   jamatKey: 'maghrib_jamat', subLabel: '(start / jamaat)' },
  { key: 'isha',    label: 'Isha',     startKey: 'isha',      jamatKey: 'isha_jamat',    subLabel: '(start / jamaat)' },
  { key: 'jumuah',  label: "Jumu'ah", startKey: 'jumu_ah_1', jamatKey: 'jumu_ah_2',     subLabel: '(1st / 2nd)' },
] as const;

const EXPANDED_PRAYERS = [
  { key: 'fajr_jamat',    label: 'Fajr Jamaat' },
  { key: 'sunrise',       label: 'Sunrise' },
  { key: 'ishraq',        label: 'Ishraq' },
  { key: 'zawaal',        label: 'Zawaal' },
  { key: 'zuhr',          label: 'Zuhr' },
  { key: 'zuhr_jamat',    label: 'Zuhr Jamaat' },
  { key: 'asr',           label: 'Asr' },
  { key: 'asr_jamat',     label: 'Asr Jamaat' },
  { key: 'maghrib_jamat', label: 'Maghrib Jamaat' },
  { key: 'isha_jamat',    label: 'Isha Jamaat' },
  { key: 'jumu_ah_1',     label: "Jumu'ah 1" },
  { key: 'jumu_ah_2',     label: "Jumu'ah 2" },
] as const;

// ─── Mobile card row ───────────────────────────────────────────────────────────
const MobileRow = ({
  row, year, month, hijriOffset, hijriEntry, previewDate, eidPrayers, isToday, isHighlighted, onEdit,
}: {
  row: PrayerTime;
  year: number;
  month: number;
  hijriOffset: number;
  hijriEntry: HijriCalendarEntry | undefined;
  previewDate?: string;
  eidPrayers: EidPrayer[];
  isToday: boolean;
  isHighlighted: boolean;
  onEdit: (r: PrayerTime) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const info    = getDayInfo(year, month, row.day, hijriOffset);
  const eidType = detectEidType(hijriEntry?.hijri_date);
  const eidCfg  = eidType ? EID_CONFIG[eidType] : null;

  let cardStyle: React.CSSProperties = {};
  let borderCls = 'border-border/20';
  if (isHighlighted) {
    borderCls = 'border-[hsl(142_60%_55%)]';
    cardStyle = { background: 'hsl(142 50% 95%)' };
  } else if (eidCfg) {
    borderCls = 'border-2';
    cardStyle = { background: eidCfg.bg, borderColor: eidCfg.border };
  } else if (info.isClockChange) {
    cardStyle = { background: '#fffbeb' };
    borderCls = 'border-amber-400';
  } else if (info.isFriday) {
    cardStyle = { background: '#fef9ec' };
    borderCls = 'border-amber-300';
  } else if (isToday) {
    cardStyle = { background: '#eff6ff' };
    borderCls = 'border-blue-300';
  }

  const hijriFromDb  = !!hijriEntry?.hijri_date;
  const hijriParts   = hijriEntry?.hijri_date?.match(/^(\d+)\s+(.+?)\s+(\d{4})\s*AH$/i);
  const previewParts = previewDate?.match(/^(\d+)\s+(.+?)\s+(\d{4})\s*AH$/i);
  const previewDiffers = !!(previewDate && hijriEntry?.hijri_date && previewDate !== hijriEntry.hijri_date);

  return (
    <div
      data-day={row.day}
      className={`rounded-xl border ${borderCls} overflow-hidden transition-all duration-200 ${isHighlighted ? 'ring-2 ring-[hsl(142_60%_55%/0.4)]' : ''}`}
      style={cardStyle}
    >
      {/* ── Summary row ── */}
      <div className="flex items-center gap-1.5 px-2.5 py-2">

        {/* Day number */}
        <div className="w-10 shrink-0">
          <div className="text-base font-extrabold tabular-nums leading-none"
            style={{ color: eidCfg ? eidCfg.color : info.isFriday ? '#d97706' : isToday ? '#2563eb' : 'hsl(150 30% 12%)' }}>
            {row.day}
          </div>
          <div className="text-[9px] font-bold uppercase"
            style={{ color: eidCfg ? eidCfg.color + 'aa' : info.isFriday ? '#f59e0b' : isToday ? '#3b82f6' : 'hsl(var(--muted-foreground))' }}>
            {info.shortName}
          </div>
          {eidCfg && <div className="text-[7px] font-bold mt-0.5 flex items-center gap-0.5" style={{ color: eidCfg.color }}><Star size={7} /> Eid</div>}
          {!eidCfg && info.isFriday && <div className="text-[7px] font-bold text-amber-600 mt-0.5">Jumu'ah</div>}
          {!eidCfg && isToday && !info.isFriday && <div className="text-[7px] font-bold text-blue-500 mt-0.5">Today</div>}
        </div>

        {/* TZ badge */}
        <span className={`shrink-0 text-[7px] font-bold px-1 py-0.5 rounded ${info.isBST ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {info.timezone}
        </span>

        {/* 5 main prayer times */}
        <div className="flex-1 grid grid-cols-5 gap-0.5 min-w-0">
          {[
            { label: 'Fajr', value: row.fajr, jamat: row.fajr_jamat },
            { label: 'Zuhr', value: row.zuhr, jamat: row.zuhr_jamat },
            { label: 'Asr', value: row.asr, jamat: row.asr_jamat },
            { label: 'Maghrib', value: row.maghrib, jamat: row.maghrib_jamat },
            { label: 'Isha', value: row.isha, jamat: row.isha_jamat },
          ].map(({ label, value, jamat }) => (
            <div key={label} className="text-center flex flex-col items-center">
              <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-wide">{label}</div>
              <div className="text-[11px] font-bold tabular-nums leading-tight" style={{ color: value ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / 0.4)' }}>
                {value ?? '—'}
              </div>
              {jamat && <div className="text-[10px] tabular-nums leading-tight text-muted-foreground">J: {jamat}</div>}
            </div>
          ))}
        </div>

        {/* Jumu'ah on Fridays */}
        {info.isFriday && row.jumu_ah_1 && (
          <div className="shrink-0 flex flex-col text-center">
            <div className="text-[8px] font-bold text-[#0e7490] uppercase">J1</div>
            <div className="text-[11px] font-bold tabular-nums text-[#0e7490]">{row.jumu_ah_1}</div>
            {row.jumu_ah_2 && <div className="text-[10px] tabular-nums text-[#0e7490]/70">{row.jumu_ah_2}</div>}
          </div>
        )}

        {/* Hijri mini-badge + preview + Eid badge */}
        <div className="shrink-0 flex flex-col items-end text-right gap-0.5">
          {hijriFromDb && hijriParts ? (
            <>
              <div className="flex items-baseline gap-0.5">
                <span className="text-[11px] font-extrabold tabular-nums text-[#7c3aed] leading-none">{hijriParts[1]}</span>
                <span className="text-[9px] font-semibold text-[#7c3aed] leading-none">{hijriParts[2].split(' ')[0]}</span>
              </div>
              <span className="text-[8px] font-bold bg-[#7c3aed]/10 text-[#7c3aed] px-0.5 rounded">DB</span>
            </>
          ) : (
            <span className="text-[9px] text-muted-foreground/40 italic">—</span>
          )}
          {/* Preview badge */}
          {previewDate && previewParts && (
            <div className={`flex flex-col items-end gap-px mt-0.5 pt-0.5 border-t border-dashed ${previewDiffers ? 'border-amber-300' : 'border-[#7c3aed]/20'}`}>
              <div className="flex items-baseline gap-0.5">
                <span className={`text-[10px] font-bold tabular-nums leading-none ${previewDiffers ? 'text-amber-600' : 'text-[#7c3aed]/55'}`}>{previewParts[1]}</span>
                <span className={`text-[8px] font-semibold leading-none ${previewDiffers ? 'text-amber-500' : 'text-[#7c3aed]/45'}`}>{previewParts[2].split(' ')[0]}</span>
              </div>
              <span className={`text-[7px] font-bold px-0.5 rounded border border-dashed ${previewDiffers ? 'border-amber-300 text-amber-600' : 'border-[#7c3aed]/30 text-[#7c3aed]/50'}`}>
                {previewDiffers ? '△Pre' : '✓Pre'}
              </span>
            </div>
          )}
          {eidCfg && (
            <span className="text-[8px] font-bold px-1 py-px rounded" style={{ background: eidCfg.color + '18', color: eidCfg.color }}>
              ★ EID
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onEdit(row); }} className="p-1.5 rounded-lg hover:bg-[hsl(142_50%_93%)] transition-colors" title="Edit">
            <Pencil size={13} className="text-[hsl(142_60%_32%)]" />
          </button>
          <button onClick={() => setExpanded(e => !e)} className="p-1.5 rounded-lg hover:bg-[hsl(140_20%_93%)] transition-colors" title={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronRight size={13} className="text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div className="border-t border-border/10 px-3 py-3 grid grid-cols-2 gap-x-4 gap-y-2 bg-[hsl(142_30%_97%)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground">Fajr Jamaat</span>
            <span className="text-xs font-bold tabular-nums" style={{ color: row.fajr_jamat ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / 0.4)' }}>{row.fajr_jamat ?? '—'}</span>
          </div>
          {EXPANDED_PRAYERS.filter(p => p.key !== 'fajr_jamat').map(({ key, label }) => {
            const val = (row[key as keyof PrayerTime] as string | null) ?? null;
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
                <span className="text-xs font-bold tabular-nums" style={{ color: val ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / 0.4)' }}>{val ?? '—'}</span>
              </div>
            );
          })}

          {/* Hijri + Preview detail */}
          <div className="col-span-2 mt-1 pt-2 border-t border-border/10 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#7c3aed] uppercase tracking-wide flex items-center gap-1">
                Hijri Date
                {hijriFromDb && <span className="text-[7px] font-bold bg-[#7c3aed]/10 text-[#7c3aed] px-0.5 py-px rounded">DB</span>}
              </span>
              {hijriFromDb
                ? <span className="text-xs font-bold text-[#7c3aed]">{hijriEntry!.hijri_date}</span>
                : <span className="text-xs text-muted-foreground/50 italic">No Hijri data — use Fill Month</span>}
            </div>
            {hijriEntry?.gregorian_date && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground">Gregorian (stored)</span>
                <span className="text-xs text-foreground/60 font-mono">{hijriEntry.gregorian_date}</span>
              </div>
            )}
            {/* Preview row */}
            {previewDate && (
              <div className={`flex items-center justify-between rounded px-2 py-1 border border-dashed ${
                previewDiffers ? 'border-amber-300 bg-amber-50' : 'border-[#7c3aed]/25 bg-[#7c3aed]/5'
              }`}>
                <span className={`text-[10px] font-bold ${previewDiffers ? 'text-amber-700' : 'text-[#7c3aed]/70'}`}>
                  👁 Preview {previewDiffers && <span className="text-amber-500">(△ will change)</span>}
                </span>
                <span className={`text-xs font-semibold ${previewDiffers ? 'text-amber-700' : 'text-[#7c3aed]/70'}`}>{previewDate}</span>
              </div>
            )}
          </div>

          {/* Eid prayer times */}
          {eidType && (
            <div className="col-span-2">
              <EidTimesDisplay eidType={eidType} eidPrayers={eidPrayers} />
            </div>
          )}

          {info.isClockChange && (
            <div className="col-span-2 text-[10px] font-bold text-amber-700 flex items-center gap-1">
              ⚡ {info.clockChangeLabel}
            </div>
          )}

          <button
            onClick={() => onEdit(row)}
            className="col-span-2 mt-1 text-xs font-semibold py-1.5 rounded-lg border border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)] transition-colors"
          >
            Edit All Times for Day {row.day}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Main table component ──────────────────────────────────────────────────────
const PrayerTimesTable = ({
  data, year, hijriOffset, hijriCalendar, previewHijri = new Map(), pendingChanges = {}, eidPrayers, onEdit, highlightDay,
}: PrayerTimesTableProps) => {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm rounded-xl border border-border/20 bg-white">
        No prayer times found for this month.
      </div>
    );
  }

  const month = data[0]?.month ?? new Date().getMonth() + 1;
  const today = new Date();
  const hijriCount   = data.filter(r => !!hijriCalendar.get(r.day)?.hijri_date).length;
  const previewCount = previewHijri.size;
  const diffCount    = previewCount > 0
    ? data.filter(r => {
        const db = hijriCalendar.get(r.day)?.hijri_date;
        const pre = previewHijri.get(r.day);
        return pre && db && db !== pre;
      }).length
    : 0;

  return (
    <>
      {/* ── Hijri coverage bar ── */}
      {data.length > 0 && (
        <div className="mb-3 flex items-center gap-3 px-1 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#7c3aed]/60 shrink-0">Hijri coverage</span>
            <div className="flex-1 h-1.5 rounded-full bg-[#7c3aed]/10 overflow-hidden">
              <div className="h-full rounded-full bg-[#7c3aed] transition-all duration-500" style={{ width: `${Math.round((hijriCount / data.length) * 100)}%` }} />
            </div>
            <span className="text-[10px] font-bold tabular-nums text-[#7c3aed] shrink-0">{hijriCount}/{data.length}</span>
            {hijriCount === data.length && <span className="text-[9px] font-bold text-emerald-600 shrink-0">Complete</span>}
            {hijriCount === 0 && <span className="text-[9px] font-medium text-muted-foreground/60 shrink-0">Use Fill Month to populate</span>}
          </div>
          {previewCount > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#7c3aed]/70 border border-dashed border-[#7c3aed]/30 rounded-lg px-2 py-1 bg-[#7c3aed]/5">
              <span>DB → Preview: {previewCount} days</span>
              {diffCount > 0 && <span className="text-amber-600 font-bold">· {diffCount} pending</span>}
            </div>
          )}
        </div>
      )}

      {/* ── Mobile layout ── */}
      <div className="md:hidden space-y-2">
        {data.map((row) => {
          const isToday = year === today.getFullYear() && month === today.getMonth() + 1 && row.day === today.getDate();
          return (
            <MobileRow
              key={row.id}
              row={row}
              year={year}
              month={month}
              hijriOffset={hijriOffset}
              hijriEntry={hijriCalendar.get(row.day)}
              previewDate={previewHijri.get(row.day)}
              eidPrayers={eidPrayers}
              isToday={isToday}
              isHighlighted={highlightDay === row.day}
              onEdit={onEdit}
            />
          );
        })}
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden md:block rounded-xl border border-border/20 overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse table-fixed" style={{ minWidth: '700px' }}>
            <colgroup>
              <col style={{ width: '58px' }} />
              <col style={{ width: previewCount > 0 ? '112px' : '88px' }} />
              <col style={{ width: '32px' }} />
              {PRAYERS.map((p) => (
                <col key={p.key} style={{ width: p.jamatKey ? '60px' : '48px' }} />
              ))}
              <col style={{ width: '26px' }} />
            </colgroup>

            <thead>
              <tr className="border-b border-border/15" style={{ background: 'hsl(142_30%_97%)' }}>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-r border-border/10">Date</th>
                <th className="px-2 py-2 text-left border-r border-border/10">
                  <div className="flex flex-col gap-px">
                    <span className="text-[10px] font-bold text-[#7c3aed] uppercase tracking-wide">Hijri</span>
                    <span className="text-[8px] font-medium text-[#7c3aed]/50">
                      {hijriCount}/{data.length} stored
                      {previewCount > 0 && <> · <span className="text-amber-600">{diffCount} △ preview</span></>}
                    </span>
                  </div>
                </th>
                <th className="px-1 py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-r border-border/10">TZ</th>
                {PRAYERS.map((p) => (
                  <th
                    key={p.key}
                    className="py-2 text-center border-r border-border/10 last:border-r-0"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[11px] font-semibold text-foreground">{p.label}</span>
                      {p.subLabel && <span className="text-[8px] text-muted-foreground/70 font-medium leading-none">{p.subLabel}</span>}
                    </div>
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>

            <tbody>
              {data.map((row, idx) => {
                const info        = getDayInfo(year, month, row.day, hijriOffset);
                const hijriEntry  = hijriCalendar.get(row.day);
                const previewDate = previewHijri.get(row.day);
                const eidType     = detectEidType(hijriEntry?.hijri_date);
                const eidCfg      = eidType ? EID_CONFIG[eidType] : null;
                const isToday     = year === today.getFullYear() && month === today.getMonth() + 1 && row.day === today.getDate();
                const isHighlighted = highlightDay === row.day;

                let rowStyle: React.CSSProperties = {};
                if (isHighlighted) {
                  rowStyle = { background: 'hsl(142 50% 95%)', borderLeft: '3px solid hsl(142 60% 45%)' };
                } else if (eidCfg) {
                  rowStyle = { background: eidCfg.bg, borderLeft: `3px solid ${eidCfg.color}` };
                } else if (info.isClockChange) {
                  rowStyle = { background: '#fff8ec', borderLeft: '3px solid #f59e0b' };
                } else if (info.isFriday) {
                  rowStyle = { background: '#fef9ec' };
                } else if (isToday) {
                  rowStyle = { background: '#eff6ff' };
                } else {
                  rowStyle = { background: idx % 2 === 0 ? '#ffffff' : 'hsl(142 25% 98.5%)' };
                }

                const pending = pendingChanges[row.id] ?? {};

                return eidType && eidCfg ? (
                  <>
                    <tr key={row.id} data-day={row.day} className="border-t border-border/10 cursor-pointer group" style={rowStyle} onClick={() => onEdit(row)}>
                      <td className="px-2 py-2 border-r border-border/10">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-extrabold text-base tabular-nums leading-none" style={{ color: eidCfg.color }}>{row.day}</span>
                          <span className="text-[10px] font-semibold" style={{ color: eidCfg.color + 'aa' }}>{info.shortName}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Star size={8} style={{ color: eidCfg.color }} />
                          <span className="text-[8px] font-bold leading-none" style={{ color: eidCfg.color }}>{eidCfg.label}</span>
                        </div>
                      </td>
                      <HijriCell hijriEntry={hijriEntry} previewDate={previewDate} />
                      <td className="px-1 py-2 text-center border-r border-border/10">
                        <span className={`inline-block px-1 py-0.5 rounded text-[8px] font-bold tracking-wide ${info.isBST ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{info.timezone}</span>
                      </td>
                      {PRAYERS.map((p) => p.jamatKey ? (
                        <StackedCell
                          key={p.key}
                          start={(row[p.startKey as keyof PrayerTime] as string | null) ?? null}
                          jamat={(row[p.jamatKey as keyof PrayerTime] as string | null) ?? null}
                          editedStart={p.startKey in pending}
                          editedJamat={p.jamatKey in pending}
                          alwaysShowBoth
                        />
                      ) : (
                        <SingleCell key={p.key} value={(row[p.startKey as keyof PrayerTime] as string | null) ?? null} edited={p.startKey in pending} />
                      ))}
                      <td className="px-1 py-2 text-center">
                        <button onClick={(e) => { e.stopPropagation(); onEdit(row); }} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[hsl(142_50%_93%)] transition-all">
                          <Pencil size={11} className="text-[hsl(142_60%_32%)]" />
                        </button>
                      </td>
                    </tr>
                    <tr key={`${row.id}-eid`} style={{ background: eidCfg.bg }}>
                      <td colSpan={PRAYERS.length + 4} className="px-4 pb-2 pt-0">
                        <div className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-2 border" style={{ borderColor: eidCfg.border }}>
                          <Star size={12} style={{ color: eidCfg.color }} />
                          <span className="text-[11px] font-bold" style={{ color: eidCfg.color }}>Eid Prayer Jamaats:</span>
                          {eidPrayers.filter(e => e.eid_type === eidType && e.time).length === 0 ? (
                            <span className="text-[10px] text-muted-foreground italic">No times set — click "Eid Times" to add</span>
                          ) : (
                            eidPrayers.filter(e => e.eid_type === eidType && e.time).sort((a, b) => a.jamaat_number - b.jamaat_number).map(e => (
                              <span key={e.jamaat_number} className="text-[12px] font-bold tabular-nums px-2.5 py-1 rounded-lg" style={{ background: eidCfg.color + '15', color: eidCfg.color }}>
                                J{e.jamaat_number} · {e.time}
                              </span>
                            ))
                          )}
                          <span className="ml-auto text-sm font-bold" style={{ color: eidCfg.color, fontFamily: 'serif' }} dir="rtl">{eidCfg.arabic}</span>
                        </div>
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr key={row.id} data-day={row.day} className="border-t border-border/10 hover:brightness-[0.98] transition-all cursor-pointer group" style={rowStyle} onClick={() => onEdit(row)}>
                    <td className="px-2 py-2 border-r border-border/10">
                      <div className="flex items-baseline gap-1.5">
                        <span className={`font-extrabold text-base tabular-nums leading-none ${info.isFriday ? 'text-amber-600' : isToday ? 'text-blue-600' : 'text-[hsl(150_30%_12%)]'}`}>{row.day}</span>
                        <span className={`text-[10px] font-semibold ${info.isFriday ? 'text-amber-500' : isToday ? 'text-blue-500' : 'text-muted-foreground'}`}>{info.shortName}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        {info.isFriday && <span className="text-[8px] font-bold text-amber-600 leading-none">Jumu'ah</span>}
                        {isToday && !info.isFriday && <span className="text-[8px] font-bold text-blue-500 leading-none">Today</span>}
                        {info.isClockChange && <span className="text-[8px] font-bold text-amber-700 leading-none">⚡ {info.clockChangeLabel}</span>}
                      </div>
                    </td>
                    <HijriCell hijriEntry={hijriEntry} previewDate={previewDate} />
                    <td className="px-1 py-2 text-center border-r border-border/10">
                      <span className={`inline-block px-1 py-0.5 rounded text-[8px] font-bold tracking-wide ${info.isBST ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{info.timezone}</span>
                      {info.isClockChange && <div className="text-[8px] text-amber-600 font-bold mt-0.5">⚡</div>}
                    </td>
                    {PRAYERS.map((p) => p.jamatKey ? (
                      <StackedCell
                        key={p.key}
                        start={(row[p.startKey as keyof PrayerTime] as string | null) ?? null}
                        jamat={(row[p.jamatKey as keyof PrayerTime] as string | null) ?? null}
                        editedStart={p.startKey in pending}
                        editedJamat={p.jamatKey in pending}
                        alwaysShowBoth
                      />
                    ) : (
                      <SingleCell key={p.key} value={(row[p.startKey as keyof PrayerTime] as string | null) ?? null} edited={p.startKey in pending} />
                    ))}
                    <td className="px-1 py-2 text-center">
                      <button onClick={(e) => { e.stopPropagation(); onEdit(row); }} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[hsl(142_50%_93%)] transition-all">
                        <Pencil size={11} className="text-[hsl(142_60%_32%)]" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default PrayerTimesTable;

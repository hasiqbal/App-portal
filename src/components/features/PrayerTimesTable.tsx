import { useState } from 'react';
import { PrayerTime, HijriCalendarEntry } from '@/types';
import { Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { getDayInfo } from '@/lib/dateUtils';

interface PrayerTimesTableProps {
  data: PrayerTime[];
  year: number;
  hijriOffset: number;
  hijriCalendar: Map<number, HijriCalendarEntry>;
  onEdit: (row: PrayerTime) => void;
  highlightDay?: number | null;
}

// ─── Stacked cell (desktop) ────────────────────────────────────────────────────
const StackedCell = ({
  start,
  jamat,
  color,
  alwaysShowBoth = false,
}: {
  start: string | null;
  jamat: string | null | undefined;
  color: string;
  alwaysShowBoth?: boolean;
}) => {
  const showSecond = alwaysShowBoth || jamat !== undefined;
  return (
    <td className="px-1.5 py-0 text-center align-middle border-r border-border/20 last:border-r-0">
      <div className="flex flex-col items-center gap-0 leading-none">
        <span
          className="tabular-nums text-[11px] font-semibold py-1"
          style={{ color: start ? color : 'hsl(var(--muted-foreground) / 0.35)' }}
        >
          {start ?? '—'}
        </span>
        {showSecond && (
          <>
            <div className="w-full h-px" style={{ background: color + '30' }} />
            <span
              className="tabular-nums text-[11px] py-1"
              style={{ color: jamat ? color + 'cc' : 'hsl(var(--muted-foreground) / 0.35)' }}
            >
              {jamat ?? '—'}
            </span>
          </>
        )}
      </div>
    </td>
  );
};

// ─── Single cell (desktop) ─────────────────────────────────────────────────────
const SingleCell = ({ value, color }: { value: string | null; color: string }) => (
  <td className="px-1.5 py-2 text-center border-r border-border/20 last:border-r-0">
    <span
      className="tabular-nums text-[11px] font-semibold"
      style={{ color: value ? color : 'hsl(var(--muted-foreground) / 0.3)' }}
    >
      {value ?? '—'}
    </span>
  </td>
);

// ─── Prayer definitions ────────────────────────────────────────────────────────
const PRAYERS = [
  { key: 'fajr',    label: 'Fajr',    color: '#2563eb', startKey: 'fajr',       jamatKey: 'fajr_jamat',    subLabel: 'start / jamaat' },
  { key: 'sunrise', label: 'Sunrise', color: '#0369a1', startKey: 'sunrise',    jamatKey: null,            subLabel: null             },
  { key: 'ishraq',  label: 'Ishraq',  color: '#075985', startKey: 'ishraq',     jamatKey: null,            subLabel: null             },
  { key: 'zawaal',  label: 'Zawaal',  color: '#0f766e', startKey: 'zawaal',     jamatKey: null,            subLabel: null             },
  { key: 'zuhr',    label: 'Zuhr',    color: '#7c6d00', startKey: 'zuhr',       jamatKey: 'zuhr_jamat',    subLabel: 'start / jamaat' },
  { key: 'asr',     label: 'Asr',     color: '#16a34a', startKey: 'asr',        jamatKey: 'asr_jamat',     subLabel: 'start / jamaat' },
  { key: 'maghrib', label: 'Maghrib', color: '#b91c1c', startKey: 'maghrib',    jamatKey: 'maghrib_jamat', subLabel: 'start / jamaat' },
  { key: 'isha',    label: 'Isha',    color: '#7c3aed', startKey: 'isha',       jamatKey: 'isha_jamat',    subLabel: 'start / jamaat' },
  { key: 'jumuah',  label: "Jumu'ah", color: '#0e7490', startKey: 'jumu_ah_1',  jamatKey: 'jumu_ah_2',     subLabel: '1st / 2nd'      },
] as const;

// Extended rows (all prayers) shown in mobile expand panel
const EXPANDED_PRAYERS = [
  { key: 'fajr_jamat',    label: 'Fajr Jamaat',    color: '#2563eb' },
  { key: 'sunrise',       label: 'Sunrise',        color: '#0369a1' },
  { key: 'ishraq',        label: 'Ishraq',         color: '#075985' },
  { key: 'zawaal',        label: 'Zawaal',         color: '#0f766e' },
  { key: 'zuhr',          label: 'Zuhr',           color: '#7c6d00' },
  { key: 'zuhr_jamat',    label: 'Zuhr Jamaat',    color: '#7c6d00' },
  { key: 'asr',           label: 'Asr',            color: '#16a34a' },
  { key: 'asr_jamat',     label: 'Asr Jamaat',     color: '#16a34a' },
  { key: 'maghrib_jamat', label: 'Maghrib Jamaat', color: '#b91c1c' },
  { key: 'isha_jamat',    label: 'Isha Jamaat',    color: '#7c3aed' },
  { key: 'jumu_ah_1',     label: "Jumu'ah 1",      color: '#0e7490' },
  { key: 'jumu_ah_2',     label: "Jumu'ah 2",      color: '#0e7490' },
] as const;

// ─── Mobile card row ───────────────────────────────────────────────────────────
const MobileRow = ({
  row,
  year,
  month,
  hijriOffset,
  hijriEntry,
  isToday,
  isHighlighted,
  onEdit,
}: {
  row: PrayerTime;
  year: number;
  month: number;
  hijriOffset: number;
  hijriEntry: HijriCalendarEntry | undefined;
  isToday: boolean;
  isHighlighted: boolean;
  onEdit: (r: PrayerTime) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const info = getDayInfo(year, month, row.day, hijriOffset);

  let cardBg = 'bg-white';
  let borderAccent = 'border-[hsl(140_20%_88%)]';
  if (isHighlighted) {
    cardBg = 'bg-[hsl(142_50%_95%)]';
    borderAccent = 'border-[hsl(142_60%_55%)]';
  } else if (info.isClockChange) {
    cardBg = 'bg-amber-50';
    borderAccent = 'border-amber-400';
  } else if (info.isFriday) {
    cardBg = 'bg-[hsl(50_100%_97%)]';
    borderAccent = 'border-amber-300';
  } else if (isToday) {
    cardBg = 'bg-blue-50';
    borderAccent = 'border-blue-300';
  }

  // Resolve Hijri text: prefer DB value, fall back to computed
  const hijriText = hijriEntry?.hijri_date
    ?? `${info.hijri.day} ${info.hijri.monthName} ${info.hijri.year} AH`;
  const hijriFromDb = !!hijriEntry?.hijri_date;

  return (
    <div
      data-day={row.day}
      className={`rounded-xl border ${borderAccent} ${cardBg} overflow-hidden transition-all duration-200 ${isHighlighted ? 'ring-2 ring-[hsl(142_60%_55%/0.4)]' : ''}`}
    >
      {/* ── Summary row ── */}
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        {/* Day info */}
        <div className="w-10 shrink-0">
          <div className={`text-base font-extrabold tabular-nums leading-none ${info.isFriday ? 'text-amber-600' : isToday ? 'text-blue-600' : 'text-[hsl(150_30%_12%)]'}`}>
            {row.day}
          </div>
          <div className={`text-[9px] font-bold uppercase ${info.isFriday ? 'text-amber-500' : isToday ? 'text-blue-500' : 'text-muted-foreground'}`}>
            {info.shortName}
          </div>
          {info.isFriday && <div className="text-[7px] font-bold text-amber-600 mt-0.5">Jumu'ah</div>}
          {isToday && !info.isFriday && <div className="text-[7px] font-bold text-blue-500 mt-0.5">Today</div>}
        </div>

        {/* TZ badge */}
        <span className={`shrink-0 text-[7px] font-bold px-1 py-0.5 rounded ${info.isBST ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {info.timezone}
        </span>

        {/* Key prayer times — all 5 always visible */}
        <div className="flex-1 grid grid-cols-5 gap-0.5 min-w-0">
          {[
            { label: 'Fajr',    value: row.fajr,    jamat: row.fajr_jamat,    color: '#2563eb' },
            { label: 'Zuhr',    value: row.zuhr,    jamat: row.zuhr_jamat,    color: '#7c6d00' },
            { label: 'Asr',     value: row.asr,     jamat: row.asr_jamat,     color: '#16a34a' },
            { label: 'Maghrib', value: row.maghrib,  jamat: row.maghrib_jamat, color: '#b91c1c' },
            { label: 'Isha',    value: row.isha,     jamat: row.isha_jamat,    color: '#7c3aed' },
          ].map(({ label, value, jamat, color }) => (
            <div key={label} className="text-center flex flex-col items-center">
              <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-wide">{label}</div>
              <div className="text-[11px] font-bold tabular-nums leading-tight" style={{ color: value ? color : 'hsl(var(--muted-foreground) / 0.4)' }}>
                {value ?? '—'}
              </div>
              {jamat && (
                <div className="text-[10px] tabular-nums leading-tight" style={{ color: color + 'aa' }}>
                  {jamat}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Jumu'ah indicator on Fridays */}
        {info.isFriday && row.jumu_ah_1 && (
          <div className="shrink-0 flex flex-col text-center">
            <div className="text-[8px] font-bold text-[#0e7490] uppercase">J1</div>
            <div className="text-[11px] font-bold tabular-nums text-[#0e7490]">{row.jumu_ah_1}</div>
            {row.jumu_ah_2 && <div className="text-[10px] tabular-nums text-[#0e7490]/70">{row.jumu_ah_2}</div>}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(row); }}
            className="p-1.5 rounded-lg hover:bg-[hsl(142_50%_93%)] transition-colors"
            title="Edit"
          >
            <Pencil size={13} className="text-[hsl(142_60%_32%)]" />
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-1.5 rounded-lg hover:bg-[hsl(140_20%_93%)] transition-colors"
            title={expanded ? 'Collapse' : 'Expand all times'}
          >
            {expanded ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronRight size={13} className="text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div className="border-t border-[hsl(140_20%_88%)] px-3 py-3 grid grid-cols-2 gap-x-4 gap-y-2 bg-[hsl(142_30%_97%)]">
          {/* Fajr Jamaat always first */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground">Fajr Jamaat</span>
            <span className="text-xs font-bold tabular-nums" style={{ color: row.fajr_jamat ? '#2563eb' : 'hsl(var(--muted-foreground) / 0.4)' }}>{row.fajr_jamat ?? '—'}</span>
          </div>
          {EXPANDED_PRAYERS.filter(p => p.key !== 'fajr_jamat').map(({ key, label, color }) => {
            const val = (row[key as keyof PrayerTime] as string | null) ?? null;
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
                <span className="text-xs font-bold tabular-nums" style={{ color: val ? color : 'hsl(var(--muted-foreground) / 0.4)' }}>
                  {val ?? '—'}
                </span>
              </div>
            );
          })}
          {/* Hijri — from DB if available */}
          <div className="col-span-2 flex items-center justify-between pt-1 border-t border-[hsl(140_20%_88%)]">
            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
              Hijri
              {hijriFromDb && <span className="text-[8px] text-[#7c3aed] font-bold">DB</span>}
            </span>
            <span className={`text-xs font-medium ${hijriFromDb ? 'text-[#7c3aed]' : 'text-foreground/70'}`}>
              {hijriText}
            </span>
          </div>
          {hijriEntry?.gregorian_date && (
            <div className="col-span-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground">Gregorian</span>
              <span className="text-xs text-foreground/60 font-mono">{hijriEntry.gregorian_date}</span>
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
const PrayerTimesTable = ({ data, year, hijriOffset, hijriCalendar, onEdit, highlightDay }: PrayerTimesTableProps) => {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm rounded-xl border border-[hsl(140_20%_88%)] bg-white">
        No prayer times found for this month.
      </div>
    );
  }

  const month = data[0]?.month ?? new Date().getMonth() + 1;
  const today = new Date();

  return (
    <>
      {/* ── Mobile layout (< md) ── */}
      <div className="md:hidden space-y-2">
        {data.map((row) => {
          const isToday =
            year === today.getFullYear() &&
            month === today.getMonth() + 1 &&
            row.day === today.getDate();
          return (
            <MobileRow
              key={row.id}
              row={row}
              year={year}
              month={month}
              hijriOffset={hijriOffset}
              hijriEntry={hijriCalendar.get(row.day)}
              isToday={isToday}
              isHighlighted={highlightDay === row.day}
              onEdit={onEdit}
            />
          );
        })}
      </div>

      {/* ── Desktop layout (≥ md) ── */}
      <div className="hidden md:block rounded-xl border border-[hsl(140_20%_88%)] overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse table-fixed" style={{ minWidth: '700px' }}>
            <colgroup>
              <col style={{ width: '58px' }} />
              <col style={{ width: '76px' }} />
              <col style={{ width: '32px' }} />
              {PRAYERS.map((p) => (
                <col key={p.key} style={{ width: p.jamatKey ? '60px' : '48px' }} />
              ))}
              <col style={{ width: '26px' }} />
            </colgroup>

            <thead>
              <tr className="border-b-2 border-[hsl(140_20%_88%)]" style={{ background: 'hsl(142_30%_97%)' }}>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-r border-[hsl(140_20%_88%)]">
                  Date
                </th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-r border-[hsl(140_20%_88%)]">
                  Hijri
                </th>
                <th className="px-1 py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-r border-[hsl(140_20%_88%)]">
                  TZ
                </th>
                {PRAYERS.map((p) => (
                  <th key={p.key} className="py-2 text-center border-r border-[hsl(140_20%_88%)] last:border-r-0">
                    <div className="flex flex-col items-center gap-0.5">
                      <span
                        className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: p.color + '1a', color: p.color }}
                      >
                        {p.label}
                      </span>
                      {p.subLabel && (
                        <span className="text-[8px] text-muted-foreground/60 font-normal leading-none">
                          {p.subLabel}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>

            <tbody>
              {data.map((row, idx) => {
                const info = getDayInfo(year, month, row.day, hijriOffset);
                const hijriEntry = hijriCalendar.get(row.day);
                const isToday =
                  year === today.getFullYear() &&
                  month === today.getMonth() + 1 &&
                  row.day === today.getDate();
                const isHighlighted = highlightDay === row.day;

                let rowBg: string;
                let borderLeft = '';
                if (isHighlighted) {
                  rowBg = 'hsl(142 50% 95%)';
                  borderLeft = '3px solid hsl(142 60% 45%)';
                } else if (info.isClockChange) {
                  rowBg = '#fff8ec';
                  borderLeft = '3px solid #f59e0b';
                } else if (info.isFriday) {
                  rowBg = '#fef9ec';
                } else if (isToday) {
                  rowBg = '#eff6ff';
                } else {
                  rowBg = idx % 2 === 0 ? '#ffffff' : 'hsl(142 25% 98.5%)';
                }

                // Resolve Hijri display: prefer DB, fall back to computed
                const hijriFromDb = !!hijriEntry?.hijri_date;

                return (
                  <tr
                    key={row.id}
                    data-day={row.day}
                    className="border-t border-[hsl(140_20%_90%)] hover:brightness-[0.97] transition-all cursor-pointer group"
                    style={{ background: rowBg, borderLeft }}
                    onClick={() => onEdit(row)}
                  >
                    {/* Date */}
                    <td className="px-2 py-1.5 border-r border-[hsl(140_20%_88%)]">
                      <div className="flex items-baseline gap-1.5">
                        <span className={`font-extrabold text-base tabular-nums leading-none ${info.isFriday ? 'text-amber-600' : isToday ? 'text-blue-600' : 'text-[hsl(150_30%_12%)]'}`}>
                          {row.day}
                        </span>
                        <span className={`text-[10px] font-semibold ${info.isFriday ? 'text-amber-500' : isToday ? 'text-blue-500' : 'text-muted-foreground'}`}>
                          {info.shortName}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        {info.isFriday && <span className="text-[8px] font-bold text-amber-600 leading-none">Jumu'ah</span>}
                        {isToday && !info.isFriday && <span className="text-[8px] font-bold text-blue-500 leading-none">Today</span>}
                        {info.isClockChange && <span className="text-[8px] font-bold text-amber-700 leading-none">⚡ {info.clockChangeLabel}</span>}
                      </div>
                    </td>

                    {/* Hijri — from hijri_calendar DB or local computed */}
                    <td className="px-2 py-1.5 border-r border-[hsl(140_20%_88%)]">
                      {hijriFromDb ? (
                        <div className="flex flex-col leading-tight">
                          <span className="text-[11px] font-semibold text-[#7c3aed] whitespace-nowrap">
                            {hijriEntry!.hijri_date}
                          </span>
                          {hijriEntry!.gregorian_date && (
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {hijriEntry!.gregorian_date}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col leading-tight">
                          <span className="text-[11px] font-semibold text-foreground/55 tabular-nums whitespace-nowrap italic">
                            {info.hijri.day} {info.hijri.monthName.split(' ').slice(0, 2).join(' ')}
                          </span>
                          <span className="text-[9px] text-muted-foreground/60 tabular-nums italic">
                            {info.hijri.year} AH ~
                          </span>
                        </div>
                      )}
                    </td>

                    {/* TZ */}
                    <td className="px-1 py-1.5 text-center border-r border-[hsl(140_20%_88%)]">
                      <span className={`inline-block px-1 py-0.5 rounded text-[8px] font-bold tracking-wide ${info.isBST ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {info.timezone}
                      </span>
                      {info.isClockChange && <div className="text-[8px] text-amber-600 font-bold mt-0.5">⚡</div>}
                    </td>

                    {/* Prayer columns */}
                    {PRAYERS.map((p) =>
                      p.jamatKey ? (
                        <StackedCell
                          key={p.key}
                          start={(row[p.startKey as keyof PrayerTime] as string | null) ?? null}
                          jamat={(row[p.jamatKey as keyof PrayerTime] as string | null) ?? null}
                          color={p.color}
                          alwaysShowBoth
                        />
                      ) : (
                        <SingleCell
                          key={p.key}
                          value={(row[p.startKey as keyof PrayerTime] as string | null) ?? null}
                          color={p.color}
                        />
                      )
                    )}

                    {/* Edit */}
                    <td className="px-1 py-1.5 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[hsl(142_50%_93%)] transition-all"
                        title="Edit"
                      >
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

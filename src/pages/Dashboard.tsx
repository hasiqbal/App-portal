import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Sidebar from '#/components/layout/Sidebar';
import { fetchPrayerTimes, fetchAdhkar, fetchAnnouncements, fetchAdhkarGroups } from '#/lib/api';
import {
  CalendarDays, BookOpen, Bell, Clock, ChevronRight,
  Star, BellRing, Sunrise, Sunset, Moon, ChevronDown,
} from 'lucide-react';
import masjidPhoto from '#/assets/masjid-photo.png';
import { supabaseAdmin } from '#/lib/supabase';
import masjidLogo from '#/assets/masjid-logo.png';
import { fetchEidPrayers, EidPrayer, EidType } from '#/components/features/EidTimesModal';
import { isBST, gregorianToHijri } from '#/lib/dateUtils';
import { PrayerTime } from '#/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function toSeconds(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(':').map(Number);
  const h = parts[0], m = parts[1], s = parts[2] ?? 0;
  if (isNaN(h) || isNaN(m)) return null;
  return h * 3600 + m * 60 + s;
}

function toMinutes(timeStr: string | null | undefined): number | null {
  const s = toSeconds(timeStr);
  return s === null ? null : Math.floor(s / 60);
}

function monthIsBstByMidMonth(year: number, month: number): boolean {
  return isBST(year, month, 15);
}

function getDominantJumuahPair(rows: PrayerTime[]): { first: string | null; second: string | null } {
  const freq = new Map<string, { first: string | null; second: string | null; count: number }>();
  rows.forEach((row) => {
    const first = row.jumu_ah_1 ?? null;
    const second = row.jumu_ah_2 ?? null;
    if (!first && !second) return;
    const key = `${first ?? ''}|${second ?? ''}`;
    const existing = freq.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    freq.set(key, { first, second, count: 1 });
  });

  let best: { first: string | null; second: string | null; count: number } | null = null;
  freq.forEach((item) => {
    if (!best || item.count > best.count) best = item;
  });

  return { first: best?.first ?? null, second: best?.second ?? null };
}

const YearSpecialTimesBlocks = ({
  gmtTimes,
  bstTimes,
  eidPrayers,
}: {
  gmtTimes: { first: string | null; second: string | null };
  bstTimes: { first: string | null; second: string | null };
  eidPrayers: EidPrayer[];
}) => {
  const fitrTimes = eidPrayers
    .filter((e) => e.eid_type === 'eid_al_fitr' && e.time)
    .sort((a, b) => a.jamaat_number - b.jamaat_number);
  const adhaTimes = eidPrayers
    .filter((e) => e.eid_type === 'eid_al_adha' && e.time)
    .sort((a, b) => a.jamaat_number - b.jamaat_number);

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Star size={15} className="text-[hsl(142_60%_35%)]" />
          <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">Yearly Jumu'ah & Eid Times</h2>
        </div>
        <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
      </div>

      <div className="rounded-xl border border-[hsl(140_20%_88%)] bg-[hsl(142_45%_97%)] px-2.5 sm:px-3 py-2 space-y-2">
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap text-[12px] sm:text-[13px]">
          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-[hsl(142_55%_92%)] text-[hsl(142_60%_30%)] font-bold uppercase text-[10px]">Jumu'ah GMT</span>
          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-white border border-[hsl(140_20%_88%)] font-bold tabular-nums">J1 {gmtTimes.first ?? '—'}</span>
          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-white border border-[hsl(140_20%_88%)] font-bold tabular-nums">J2 {gmtTimes.second ?? '—'}</span>

          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-cyan-100 text-cyan-700 font-bold uppercase text-[10px]">Jumu'ah BST</span>
          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-white border border-[hsl(140_20%_88%)] font-bold tabular-nums">J1 {bstTimes.first ?? '—'}</span>
          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-white border border-[hsl(140_20%_88%)] font-bold tabular-nums">J2 {bstTimes.second ?? '—'}</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap text-[12px] sm:text-[13px]">
          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-bold uppercase text-[10px]">Eid al-Fitr</span>
          {fitrTimes.length === 0 ? (
            <span className="inline-flex items-center px-2 py-1 rounded-lg bg-white/70 border border-[hsl(140_20%_88%)] text-muted-foreground">No times</span>
          ) : (
            fitrTimes.map((entry) => (
              <span key={`fitr-${entry.jamaat_number}`} className="inline-flex items-center px-2 py-1 rounded-lg bg-white border border-[hsl(140_20%_88%)] font-bold tabular-nums">
                J{entry.jamaat_number} {entry.time}
              </span>
            ))
          )}

          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-amber-100 text-amber-700 font-bold uppercase text-[10px]">Eid al-Adha</span>
          {adhaTimes.length === 0 ? (
            <span className="inline-flex items-center px-2 py-1 rounded-lg bg-white/70 border border-[hsl(140_20%_88%)] text-muted-foreground">No times</span>
          ) : (
            adhaTimes.map((entry) => (
              <span key={`adha-${entry.jamaat_number}`} className="inline-flex items-center px-2 py-1 rounded-lg bg-white border border-[hsl(140_20%_88%)] font-bold tabular-nums">
                J{entry.jamaat_number} {entry.time}
              </span>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

function detectEidTypeFromHijriDate(hijriDate: string | null | undefined): EidType | null {
  if (!hijriDate) return null;
  const match = hijriDate.match(/^(\d{1,2})\s+(.+?)\s+\d{4}\s*AH$/i);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const monthKey = normalizeDashboardHijriMonthKey(match[2]);

  if (day === 1 && monthKey === 'shawwal') return 'eid_al_fitr';
  if (day === 10 && monthKey.includes('hijj')) return 'eid_al_adha';
  return null;
}

const DASH_EID_CONFIG: Record<EidType, { label: string; arabic: string; color: string; bg: string; border: string }> = {
  eid_al_fitr: {
    label: 'Eid al-Fitr',
    arabic: 'عيد الفطر',
    color: '#15803d',
    bg: '#f0fdf4',
    border: '#86efac',
  },
  eid_al_adha: {
    label: 'Eid al-Adha',
    arabic: 'عيد الأضحى',
    color: '#b45309',
    bg: '#fffbeb',
    border: '#fcd34d',
  },
};

type DashboardHijriParts = {
  day: number;
  monthKey: string;
  year: number;
};

type KeyHijriDateSpec = {
  label: string;
  day: number;
  monthKeys: string[];
};

type HijriCalendarLookupRow = {
  gregorian_year: number;
  gregorian_month: number;
  gregorian_day: number;
  hijri_date: string;
};

const DASHBOARD_KEY_HIJRI_DATES: KeyHijriDateSpec[] = [
  { label: '10 Muharram', day: 10, monthKeys: ['muharram'] },
  { label: '1 Ramadan', day: 1, monthKeys: ['ramadan'] },
  { label: '1 Shawwal', day: 1, monthKeys: ['shawwal'] },
  { label: '1 Dhu al-Hijjah', day: 1, monthKeys: ['dhualhijjah', 'dhulhijjah'] },
  { label: '9 Dhu al-Hijjah', day: 9, monthKeys: ['dhualhijjah', 'dhulhijjah'] },
  { label: '12 Rabi ul Awwal', day: 12, monthKeys: ['rabiulawwal', 'rabialawwal'] },
];

function normalizeDashboardHijriMonthKey(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseDashboardHijriDate(hijriDate: string | null | undefined): DashboardHijriParts | null {
  if (!hijriDate) return null;
  const match = hijriDate.match(/^(\d{1,2})\s+(.+?)\s+(\d{4})\s*AH$/i);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const year = parseInt(match[3], 10);
  if (!day || !year) return null;

  return {
    day,
    monthKey: normalizeDashboardHijriMonthKey(match[2]),
    year,
  };
}

function formatDashboardGregorianDate(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const KeyHijriDatesCard = ({ rows }: { rows: Array<{ label: string; hijriDate: string | null; gregorianDate: string | null }> }) => (
  <section>
    <div className="flex items-center gap-3 mb-3">
      <div className="flex items-center gap-2">
        <CalendarDays size={15} className="text-[hsl(142_60%_35%)]" />
        <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">Key Hijri Dates</h2>
      </div>
      <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
      {rows.map((row) => (
        <div key={row.label} className="rounded-xl border border-[hsl(140_20%_88%)] bg-white px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[hsl(142_60%_35%)]">{row.label}</p>
          <p className="text-sm font-semibold text-[hsl(150_30%_12%)] mt-1">{row.gregorianDate ?? 'Not found'}</p>
          <p className="text-xs text-muted-foreground mt-1">{row.hijriDate ?? 'No matching Hijri date in calendar'}</p>
        </div>
      ))}
    </div>
  </section>
);

// ─── Today's Prayer Cards ─────────────────────────────────────────────────────

interface PrayerRow {
  label: string;
  start: string | null;
  jamat?: string | null;
  color: string;
  showJamat: boolean;
  emoji: string;
}

const TodayPrayerCards = ({
  rows,
  todayDateLabel,
  todayHijriLabel,
}: {
  rows: PrayerRow[];
  todayDateLabel: string;
  todayHijriLabel: string;
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const isCurrentPrayer = (row: PrayerRow, nextRow?: PrayerRow) => {
    const startMins = toMinutes(row.start);
    const nextMins = toMinutes(nextRow?.start ?? null);
    if (startMins === null) return false;
    if (nextMins === null) return currentMins >= startMins;
    return currentMins >= startMins && currentMins < nextMins;
  };

  // Main 5 prayers in compact rows
  const mainRows = rows.filter(r => ['Fajr', 'Zuhr', 'Asr', 'Maghrib', 'Isha'].includes(r.label));
  // Solar reference times in a single compact pill row
  const solarRows = rows.filter(r => ['Sunrise', 'Ishrāq', 'Zawāal'].includes(r.label));

  return (
    <div className="rounded-xl border border-[hsl(140_20%_88%)] bg-white overflow-hidden">
      <button
        type="button"
        className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border-b border-[hsl(140_20%_90%)] bg-[hsl(140_25%_97%)] flex items-center gap-2 text-left"
        onClick={() => setCollapsed((value) => !value)}
      >
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[hsl(142_60%_30%)] text-white text-[8px] sm:text-[9px] font-bold uppercase tracking-wider">
          Today
        </span>
        <span className="text-[10px] sm:text-[11px] font-semibold text-[hsl(150_30%_20%)] truncate">{todayDateLabel}</span>
        <span className="hidden sm:inline text-[10px] text-muted-foreground ml-auto truncate">{todayHijriLabel}</span>
        <ChevronDown size={14} className={`text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`} />
      </button>

      {!collapsed && <div className="p-1.5 sm:p-2 space-y-1.5 sm:space-y-2">
        <div>
          <p className="px-1 text-[8px] sm:text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Prayer Times</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">
            {mainRows.map((row, idx) => {
              const isCurrent = isCurrentPrayer(row, mainRows[idx + 1]);
              return (
                <div
                  key={row.label}
                  className="rounded-md border p-1.5 sm:p-2 bg-white min-h-[74px] sm:min-h-[80px]"
                  style={{
                    borderColor: isCurrent ? row.color + '66' : 'hsl(140 20% 88%)',
                    background: isCurrent ? row.color + '0e' : 'white',
                  }}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-[11px] leading-none">{row.emoji}</span>
                    <p
                      className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide truncate leading-none"
                      style={{ color: isCurrent ? row.color : 'hsl(150 30% 25%)' }}
                    >
                      {row.label}
                    </p>
                    {isCurrent && (
                      <span
                        className="ml-auto inline-flex items-center text-[7px] font-bold px-1 py-0 rounded-full text-white leading-none"
                        style={{ background: row.color }}
                      >
                        NOW
                      </span>
                    )}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <div>
                      <p className="text-[7px] font-semibold uppercase tracking-wide text-muted-foreground leading-none">Start</p>
                      <p
                        className="text-[16px] sm:text-[18px] font-extrabold tabular-nums leading-none mt-0.5"
                        style={{ color: row.start ? (isCurrent ? row.color : 'hsl(150 30% 12%)') : 'hsl(var(--muted-foreground) / 0.3)' }}
                      >
                        {row.start ?? '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[7px] font-semibold uppercase tracking-wide text-muted-foreground leading-none">Jamāʿat</p>
                      <p
                        className="text-[16px] sm:text-[18px] font-bold tabular-nums leading-none mt-0.5"
                        style={{ color: row.jamat ? row.color + 'cc' : 'hsl(var(--muted-foreground) / 0.3)' }}
                      >
                        {row.jamat ?? '—'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {solarRows.length > 0 && (
          <div>
            <p className="px-1 text-[8px] sm:text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Solar Reference</p>
            <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
              {solarRows.map((row) => {
                return (
                  <div
                    key={`solar-${row.label}`}
                    className="rounded-md border px-2 py-1.5 sm:px-2.5 sm:py-1.5 flex items-center justify-between gap-2 bg-white"
                    style={{
                      borderColor: 'hsl(140 20% 88%)',
                      background: 'white',
                    }}
                  >
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span className="text-[11px] leading-none">{row.emoji}</span>
                      <span
                        className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide truncate"
                        style={{ color: 'hsl(150 30% 25%)' }}
                      >
                        {row.label}
                      </span>
                    </div>
                    <span
                      className="text-[14px] sm:text-[16px] font-extrabold tabular-nums leading-none"
                      style={{ color: row.start ? 'hsl(150 30% 12%)' : 'hsl(var(--muted-foreground) / 0.3)' }}
                    >
                      {row.start ?? '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>}

    </div>
  );
};

// ─── Solar Times Card (Sunrise / Ishraq / Zawaal) ─────────────────────────────
// (Also exported for use in PrayerTimes page)
export const SolarTimesCard = ({
  sunrise, ishraq, zawaal,
}: { sunrise: string | null; ishraq: string | null; zawaal: string | null }) => {
  const items = [
    {
      icon: Sunrise,
      label: 'Sunrise',
      desc: 'Sun rises above horizon',
      value: sunrise,
      color: '#dc8a10',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      textColor: 'text-amber-700',
    },
    {
      icon: Sunrise,
      label: 'Ishrāq',
      desc: 'Recommended prayer time (~20 min after sunrise)',
      value: ishraq,
      color: '#0891b2',
      bg: 'bg-sky-50',
      border: 'border-sky-200',
      textColor: 'text-sky-700',
    },
    {
      icon: Sunset,
      label: 'Zawāal',
      desc: 'Solar noon — sun at zenith',
      value: zawaal,
      color: '#7c3aed',
      bg: 'bg-violet-50',
      border: 'border-violet-200',
      textColor: 'text-violet-700',
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-[hsl(140_20%_88%)] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-2.5 sm:px-3 py-1.5 sm:py-2 border-b border-[hsl(140_20%_90%)] bg-[hsl(47_100%_97%)] flex items-center gap-1.5">
        <Moon size={11} className="text-amber-500" />
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-amber-700">Solar Times Today</span>
        <span className="hidden sm:inline text-[9px] text-amber-600/70 font-medium ml-auto">Non-prayer reference times</span>
      </div>
      {/* Three columns */}
      <div className="grid grid-cols-3 divide-x divide-[hsl(140_20%_90%)]">
        {items.map(({ icon: Icon, label, desc, value, color, bg, border, textColor }) => (
          <div key={label} className={`${bg} px-1.5 sm:px-2 py-1.5 sm:py-2 flex flex-col items-center text-center gap-0.5`}>
            <div
              className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: color + '20', border: `1.5px solid ${color}30` }}
            >
              <Icon size={11} style={{ color }} />
            </div>
            <p className={`text-[10px] sm:text-[11px] font-bold leading-none ${textColor}`}>{label}</p>
            <p
              className="text-[22px] sm:text-2xl font-extrabold tabular-nums leading-none shrink-0"
              style={{ color: value ? color : 'hsl(var(--muted-foreground) / 0.3)' }}
            >
              {value ?? '—'}
            </p>
            <p className="text-[8px] text-muted-foreground leading-none line-clamp-1">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

const StatCard = ({
  icon: Icon,
  label,
  value,
  sub,
  to,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  to: string;
}) => (
  <Link
    to={to}
    className="group bg-white rounded-2xl border border-[hsl(140_20%_90%)] p-3.5 sm:p-4 hover:shadow-md hover:border-[hsl(142_50%_75%)] transition-all duration-200 overflow-hidden flex flex-col gap-2.5"
  >
    <div className="flex items-start justify-between">
      <div className="w-9 h-9 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center">
        <Icon size={16} className="text-[hsl(142_60%_32%)]" />
      </div>
      <ChevronRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
    </div>
    <div>
      <div className="text-2xl sm:text-3xl font-extrabold tabular-nums text-[hsl(150_30%_12%)]">{value}</div>
      <div className="text-xs sm:text-sm font-semibold mt-0.5 text-[hsl(150_30%_18%)]">{label}</div>
      {sub && <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  </Link>
);

// ─── Hijri Date Display ───────────────────────────────────────────────────────

function getFallbackHijriDate(offsetDays = 0): string {
  const shifted = new Date();
  shifted.setDate(shifted.getDate() + offsetDays);
  const hijri = gregorianToHijri(
    shifted.getFullYear(),
    shifted.getMonth() + 1,
    shifted.getDate()
  );
  return `${hijri.full} AH`;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const isFriday = now.getDay() === 5;
  const dayName = DAYS[now.getDay()];

  // ── Hijri offset from DB ───────────────────────────────────────────────────
  const [hijriOffset, setHijriOffset] = useState<number>(0);
  const hijriOffsetFetched = useRef(false);
  useEffect(() => {
    if (hijriOffsetFetched.current) return;
    hijriOffsetFetched.current = true;
    supabaseAdmin
      .from('masjid_settings')
      .select('value')
      .eq('key', 'hijri_offset')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value !== null && data?.value !== undefined) {
          const n = parseInt(data.value, 10);
          if (!isNaN(n)) setHijriOffset(n);
        }
      });
  }, []);

  const { data: prayerTimes = [] } = useQuery({
    queryKey: ['prayer_times', month],
    queryFn: () => fetchPrayerTimes(month),
    staleTime: 300_000,
  });

  const { data: adhkar = [] } = useQuery({
    queryKey: ['adhkar'],
    queryFn: () => fetchAdhkar(),
    staleTime: 300_000,
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements'],
    queryFn: fetchAnnouncements,
    staleTime: 300_000,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['adhkar-groups'],
    queryFn: fetchAdhkarGroups,
    staleTime: 300_000,
  });

  const { data: yearPrayerTimes = [] } = useQuery({
    queryKey: ['prayer-times-year-snapshot', now.getFullYear()],
    queryFn: async () => {
      const months = await Promise.all(Array.from({ length: 12 }, (_, i) => fetchPrayerTimes(i + 1)));
      return months.flat();
    },
    staleTime: 300_000,
  });

  const { data: eidPrayers = [] } = useQuery({
    queryKey: ['eid-prayers-dashboard'],
    queryFn: fetchEidPrayers,
    staleTime: 300_000,
  });

  const { data: todayHijriDate = null } = useQuery({
    queryKey: ['dashboard-today-hijri', now.getFullYear(), month, day],
    queryFn: async () => {
      const { data, error } = await supabaseAdmin
        .from('hijri_calendar')
        .select('hijri_date')
        .eq('gregorian_year', now.getFullYear())
        .eq('gregorian_month', month)
        .eq('gregorian_day', day)
        .maybeSingle();
      if (error) return null;
      return (data?.hijri_date as string | null) ?? null;
    },
    staleTime: 300_000,
  });

  const { data: keyHijriCalendarRows = [] } = useQuery({
    queryKey: ['dashboard-key-hijri-dates', now.getFullYear(), now.getFullYear() + 1],
    queryFn: async () => {
      const { data, error } = await supabaseAdmin
        .from('hijri_calendar')
        .select('gregorian_year, gregorian_month, gregorian_day, hijri_date')
        .gte('gregorian_year', now.getFullYear())
        .lte('gregorian_year', now.getFullYear() + 1)
        .order('gregorian_year', { ascending: true })
        .order('gregorian_month', { ascending: true })
        .order('gregorian_day', { ascending: true });
      if (error) return [] as HijriCalendarLookupRow[];
      return (data ?? []) as HijriCalendarLookupRow[];
    },
    staleTime: 300_000,
  });

  const todayRow = prayerTimes.find((r) => r.day === day);
  const activeAnnouncements = announcements.filter((a) => a.is_active);
  const activeAdhkar = adhkar.filter((a) => a.is_active);

  const jumuahRows = yearPrayerTimes.filter((row) => {
    const date = new Date(now.getFullYear(), row.month - 1, row.day);
    return date.getDay() === 5;
  });
  const gmtJumuahRows = jumuahRows.filter((row) => !monthIsBstByMidMonth(now.getFullYear(), row.month));
  const bstJumuahRows = jumuahRows.filter((row) => monthIsBstByMidMonth(now.getFullYear(), row.month));
  const gmtTimes = getDominantJumuahPair(gmtJumuahRows);
  const bstTimes = getDominantJumuahPair(bstJumuahRows);

  // Full prayer rows for the cards
  const prayerRows: PrayerRow[] = [
    { label: 'Fajr',    start: todayRow?.fajr    ?? null, jamat: todayRow?.fajr_jamat,    color: '#2563eb', showJamat: true,  emoji: '🌙' },
    { label: 'Sunrise', start: todayRow?.sunrise ?? null, jamat: null,                     color: '#dc8a10', showJamat: false, emoji: '🌅' },
    { label: 'Ishrāq',  start: todayRow?.ishraq  ?? null, jamat: null,                     color: '#0891b2', showJamat: false, emoji: '🌤️' },
    { label: 'Zawāal',  start: todayRow?.zawaal  ?? null, jamat: null,                     color: '#7c3aed', showJamat: false, emoji: '☀️' },
    { label: 'Zuhr',    start: todayRow?.zuhr     ?? null, jamat: todayRow?.zuhr_jamat,    color: '#b45309', showJamat: true,  emoji: '☀️' },
    { label: 'Asr',     start: todayRow?.asr      ?? null, jamat: todayRow?.asr_jamat,     color: '#15803d', showJamat: true,  emoji: '🌤️' },
    { label: 'Maghrib', start: todayRow?.maghrib   ?? null, jamat: todayRow?.maghrib_jamat, color: '#b91c1c', showJamat: true,  emoji: '🌅' },
    { label: 'Isha',    start: todayRow?.isha      ?? null, jamat: todayRow?.isha_jamat,    color: '#7c3aed', showJamat: true,  emoji: '🌙' },
  ];

  const hijriDate = todayHijriDate ?? getFallbackHijriDate(hijriOffset);
  const todayEidType = detectEidTypeFromHijriDate(hijriDate);
  const todayEidConfig = todayEidType ? DASH_EID_CONFIG[todayEidType] : null;
  const todayEidTimes = todayEidType
    ? eidPrayers
        .filter((e) => e.eid_type === todayEidType && e.time)
        .sort((a, b) => a.jamaat_number - b.jamaat_number)
    : [];
  const keyHijriDates = useMemo(() => {
    const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return DASHBOARD_KEY_HIJRI_DATES.map((spec) => {
      const matches = keyHijriCalendarRows.filter((row) => {
        const parsed = parseDashboardHijriDate(row.hijri_date);
        return !!parsed && parsed.day === spec.day && spec.monthKeys.includes(parsed.monthKey);
      });

      const upcoming = matches.find((row) => new Date(row.gregorian_year, row.gregorian_month - 1, row.gregorian_day).getTime() >= todayTime);
      const chosen = upcoming ?? matches[0] ?? null;

      return {
        label: spec.label,
        hijriDate: chosen?.hijri_date ?? null,
        gregorianDate: chosen
          ? formatDashboardGregorianDate(chosen.gregorian_year, chosen.gregorian_month, chosen.gregorian_day)
          : null,
      };
    });
  }, [keyHijriCalendarRows, now]);

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />

      <main className="flex-1 min-w-0 pt-14 md:pt-0 overflow-x-hidden">

        {/* ── Hero Banner ── */}
        <div className="relative h-52 sm:h-60 overflow-hidden">
          <img
            src={masjidPhoto}
            alt="Jami' Masjid Noorani"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(142_65%_12%/0.93)] via-[hsl(142_55%_16%/0.75)] to-[hsl(142_40%_20%/0.30)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[hsl(142_65%_12%/0.5)] to-transparent" />

          <div className="relative h-full flex items-end px-6 sm:px-10 pb-6">
            <div className="flex items-end gap-5">
              <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-white/90 backdrop-blur items-center justify-center shadow-lg shrink-0 mb-0.5">
                <img src={masjidLogo} alt="JMN" className="w-10 h-10 object-contain" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-300 mb-1" dir="rtl">
                  بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                </p>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight drop-shadow">
                  Jami' Masjid Noorani
                </h1>
                <p className="text-sm text-green-200 mt-0.5">
                  Admin Portal · {dayName}, {MONTHS_FULL[now.getMonth()]} {now.getDate()}, {now.getFullYear()}
                </p>
                <p className="text-xs text-green-300/80 mt-0.5">{hijriDate}</p>
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <Link
                    to="/prayer-times"
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-[hsl(142_60%_28%)] hover:bg-green-50 transition-all shadow"
                  >
                    <CalendarDays size={13} /> Prayer Times
                  </Link>
                  <Link
                    to="/adhkar"
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white/15 backdrop-blur text-white border border-white/30 hover:bg-white/25 transition-all"
                  >
                    <BookOpen size={13} /> Adhkar
                  </Link>
                  <Link
                    to="/notifications"
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white/15 backdrop-blur text-white border border-white/30 hover:bg-white/25 transition-all"
                  >
                    <BellRing size={13} /> Notifications
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-5 sm:py-6 space-y-5 sm:space-y-6 max-w-5xl">

          {/* ── Today's Prayer Times ── */}
          <section>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-[hsl(142_60%_35%)]" />
                <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">
                  Today's Prayer Times
                  {isFriday && (
                    <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                      Jumu'ah Today
                    </span>
                  )}
                </h2>
              </div>
              <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
              <Link to="/prayer-times" className="text-xs font-medium text-[hsl(142_60%_35%)] hover:underline flex items-center gap-1">
                Edit <ChevronRight size={11} />
              </Link>
            </div>

            {todayRow ? (
              <div className="space-y-1.5 sm:space-y-2">
                <TodayPrayerCards
                  rows={prayerRows}
                  todayDateLabel={`${dayName}, ${MONTHS_FULL[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`}
                  todayHijriLabel={hijriDate}
                />

                {(isFriday || (todayEidType && todayEidConfig)) && (
                  <div
                    className="rounded-xl border px-2.5 sm:px-3 py-1.5 sm:py-2"
                    style={{
                      background: todayEidConfig ? 'hsl(50 100% 98%)' : 'hsl(50 100% 97%)',
                      borderColor: todayEidConfig ? (todayEidConfig.border ?? 'hsl(45 90% 82%)') : 'hsl(45 90% 82%)',
                    }}
                  >
                    <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1">Special Prayers</div>
                    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
                      {isFriday && (
                        <>
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-1 rounded-lg bg-amber-100 text-amber-700 border border-amber-200">
                            <span>🕌</span>
                            Jumu'ah
                          </span>
                          {todayRow.jumu_ah_1 && (
                            <span className="inline-flex items-center gap-1 text-[12px] font-bold tabular-nums px-2 py-1 rounded-lg bg-white border border-amber-200 text-amber-700">
                              J1 {todayRow.jumu_ah_1}
                            </span>
                          )}
                          {todayRow.jumu_ah_2 && (
                            <span className="inline-flex items-center gap-1 text-[12px] font-bold tabular-nums px-2 py-1 rounded-lg bg-white border border-amber-200 text-amber-700">
                              J2 {todayRow.jumu_ah_2}
                            </span>
                          )}
                          {!todayRow.jumu_ah_1 && !todayRow.jumu_ah_2 && (
                            <span className="text-xs text-amber-600/50">Times not set</span>
                          )}
                        </>
                      )}

                      {todayEidType && todayEidConfig && (
                        <>
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-1 rounded-lg border"
                            style={{ background: todayEidConfig.color + '12', color: todayEidConfig.color, borderColor: todayEidConfig.border }}>
                            <Star size={10} />
                            {todayEidConfig.label}
                          </span>
                          {todayEidTimes.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No Eid times set</span>
                          ) : (
                            todayEidTimes.map((entry) => (
                              <span
                                key={`today-eid-${entry.eid_type}-${entry.jamaat_number}`}
                                className="inline-flex items-center gap-1 text-[12px] font-bold tabular-nums px-2 py-1 rounded-lg border"
                                style={{ background: todayEidConfig.color + '15', color: todayEidConfig.color, borderColor: todayEidConfig.border }}
                              >
                                J{entry.jamaat_number} {entry.time}
                              </span>
                            ))
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-dashed border-[hsl(140_20%_88%)] rounded-xl px-5 py-6 text-sm text-muted-foreground text-center">
                No prayer times found for today.{' '}
                <Link to="/prayer-times" className="text-[hsl(142_60%_35%)] hover:underline font-medium">
                  Add them →
                </Link>
              </div>
            )}
          </section>

          <YearSpecialTimesBlocks
            gmtTimes={gmtTimes}
            bstTimes={bstTimes}
            eidPrayers={eidPrayers}
          />

          <KeyHijriDatesCard rows={keyHijriDates} />

          {/* ── Stats ── */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">Overview</h2>
              <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <StatCard icon={CalendarDays} label="Prayer Days" value={prayerTimes.length} sub={`${MONTHS_FULL[now.getMonth()]} ${now.getFullYear()}`} to="/prayer-times" />
              <StatCard icon={BookOpen} label="Active Adhkar" value={activeAdhkar.length} sub={`${groups.length} groups`} to="/adhkar" />
              <StatCard icon={Bell} label="Live Announcements" value={activeAnnouncements.length} sub={`${announcements.length} total`} to="/announcements" />
              <StatCard icon={Star} label="Adhkar Groups" value={groups.length} sub={`${adhkar.length} entries`} to="/adhkar" />
            </div>
          </section>

          {/* ── Latest Announcements ── */}
          {announcements.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Bell size={15} className="text-[hsl(142_60%_35%)]" />
                  <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">Latest Announcements</h2>
                </div>
                <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
                <Link to="/announcements" className="text-xs font-medium text-[hsl(142_60%_35%)] hover:underline flex items-center gap-1">
                  Manage <ChevronRight size={11} />
                </Link>
              </div>
              <div className="space-y-2 max-w-3xl">
                {announcements.slice(0, 3).map((a) => {
                  const plainBody = a.body ? a.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : null;
                  return (
                    <div
                      key={a.id}
                      className={`bg-white rounded-xl border px-4 py-3 flex items-start gap-3 transition-all hover:shadow-sm ${
                        a.is_active ? 'border-[hsl(140_20%_90%)]' : 'border-dashed border-[hsl(140_15%_88%)] opacity-60'
                      }`}
                    >
                      <div className={`shrink-0 w-2 h-2 rounded-full mt-2 ${a.is_active ? 'bg-green-400' : 'bg-slate-300'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[hsl(150_30%_12%)]">{a.title}</p>
                        {plainBody && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{plainBody}</p>}
                      </div>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        a.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {a.is_active ? 'LIVE' : 'OFF'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Quick Actions ── */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">Quick Actions</h2>
              <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { to: '/prayer-times', label: 'Import Prayer Times CSV', icon: CalendarDays },
                { to: '/adhkar',       label: 'Add New Dhikr',           icon: BookOpen     },
                { to: '/announcements', label: 'Post Announcement',       icon: Bell         },
                { to: '/notifications', label: 'Send Notification',       icon: BellRing     },
              ].map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[hsl(140_20%_88%)] bg-white text-sm font-medium text-[hsl(150_30%_18%)] hover:border-[hsl(142_50%_70%)] hover:bg-[hsl(142_50%_97%)] transition-all"
                >
                  <Icon size={14} className="text-[hsl(142_60%_35%)]" />
                  {label}
                </Link>
              ))}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
};

export default Dashboard;

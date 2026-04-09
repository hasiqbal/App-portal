import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import { fetchPrayerTimes, fetchAdhkar, fetchAnnouncements, fetchAdhkarGroups } from '@/lib/api';
import {
  CalendarDays, BookOpen, Bell, Clock, ChevronRight,
  Star, BellRing, Timer, Sunrise, Sunset, Moon,
} from 'lucide-react';
import masjidPhoto from '@/assets/masjid-photo.png';
import { supabaseAdmin } from '@/lib/supabase';
import masjidLogo from '@/assets/masjid-logo.png';

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

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Now';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2,'0')}s`;
  return `${s}s`;
}

// ─── Next Prayer Countdown ────────────────────────────────────────────────────

interface PrayerEntry {
  label: string;
  startTime: string | null;
  jamatTime?: string | null;
  color: string;
}

type CountdownPhase = 'to-start' | 'to-jamat' | 'in-jamat';

interface CountdownState {
  next: PrayerEntry & { secsToStart: number };
  phase: CountdownPhase;
  secsRemaining: number;
  phaseLabel: string;
}

function computeCountdown(prayers: PrayerEntry[], nowSecs: number): CountdownState | null {
  const entries = prayers
    .filter((p) => p.startTime)
    .map((p) => ({
      ...p,
      startSecs: toSeconds(p.startTime) ?? 0,
      jamatSecs: toSeconds(p.jamatTime) ?? null,
    }));

  // Check if we're currently between start and jamat of any prayer
  for (const e of entries) {
    if (e.jamatSecs !== null && nowSecs >= e.startSecs && nowSecs < e.jamatSecs) {
      return {
        next: { ...e, secsToStart: 0 },
        phase: 'to-jamat',
        secsRemaining: e.jamatSecs - nowSecs,
        phaseLabel: 'Until Jamāʿat',
      };
    }
    if (e.jamatSecs !== null && nowSecs >= e.jamatSecs && nowSecs < e.jamatSecs + 300) {
      return {
        next: { ...e, secsToStart: 0 },
        phase: 'in-jamat',
        secsRemaining: 0,
        phaseLabel: 'Jamāʿat Now',
      };
    }
  }

  // Otherwise find next upcoming prayer by start time
  const upcoming = entries
    .filter((e) => e.startSecs > nowSecs)
    .sort((a, b) => a.startSecs - b.startSecs);

  if (!upcoming.length) return null;
  const next = upcoming[0];
  return {
    next: { ...next, secsToStart: next.startSecs - nowSecs },
    phase: 'to-start',
    secsRemaining: next.startSecs - nowSecs,
    phaseLabel: 'Until Start',
  };
}

const NextPrayerCountdown = ({ prayers }: { prayers: PrayerEntry[] }) => {
  const [nowSecs, setNowSecs] = useState(() => {
    const n = new Date();
    return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
  });

  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowSecs(n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const state = computeCountdown(prayers, nowSecs);
  if (!state) return null;

  const { next, phase, secsRemaining, phaseLabel } = state;

  const bgColor = phase === 'in-jamat'
    ? 'linear-gradient(135deg, hsl(25 100% 96%), hsl(25 80% 98%))'
    : 'linear-gradient(135deg, hsl(142 50% 96%), hsl(142 40% 98%))';
  const borderColor = phase === 'in-jamat' ? 'hsl(25 80% 82%)' : 'hsl(142 40% 82%)';
  const countdownColor = phase === 'in-jamat' ? '#ea580c' : next.color;

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-4 border"
      style={{ background: bgColor, borderColor }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: countdownColor + '22', border: `1.5px solid ${countdownColor}33` }}
      >
        <Timer size={18} style={{ color: countdownColor }} className={phase === 'in-jamat' ? 'animate-pulse' : ''} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {phase === 'to-start' ? 'Next Prayer' : phase === 'to-jamat' ? next.label + ' — In Progress' : next.label}
        </p>
        <p className="text-sm font-extrabold text-[hsl(150_30%_12%)]">
          {phase === 'in-jamat' ? 'Jamāʿat in progress' : next.label}
        </p>
        {phase === 'to-start' && next.jamatTime && (
          <p className="text-[11px] text-muted-foreground">Jamāʿat at {next.jamatTime}</p>
        )}
        {phase === 'to-jamat' && (
          <p className="text-[11px] text-muted-foreground">Started at {next.startTime}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        {phase === 'in-jamat' ? (
          <p className="text-sm font-extrabold px-2 py-1 rounded-lg bg-orange-100 text-orange-600">Jamāʿat Now</p>
        ) : (
          <>
            <p className="text-2xl font-extrabold tabular-nums" style={{ color: countdownColor }}>
              {formatCountdown(secsRemaining)}
            </p>
            <p className="text-[10px] text-muted-foreground">{phaseLabel}</p>
          </>
        )}
      </div>
    </div>
  );
};

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
  isFriday,
  jumuah1,
  jumuah2,
}: {
  rows: PrayerRow[];
  isFriday: boolean;
  jumuah1: string | null;
  jumuah2: string | null;
}) => {
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const isCurrentPrayer = (row: PrayerRow, nextRow?: PrayerRow) => {
    const startMins = toMinutes(row.start);
    const nextMins = toMinutes(nextRow?.start ?? null);
    if (startMins === null) return false;
    if (nextMins === null) return currentMins >= startMins;
    return currentMins >= startMins && currentMins < nextMins;
  };

  // Main 5 prayer rows only (not sunrise/ishraq/zawaal — those are in solar card)
  const mainRows = rows.filter(r => ['Fajr','Zuhr','Asr','Maghrib','Isha'].includes(r.label));

  return (
    <div className="space-y-3">
      {/* 5 prayer cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {mainRows.map((row, idx) => {
          const isCurrent = isCurrentPrayer(row, mainRows[idx + 1]);
          return (
            <div
              key={row.label}
              className={`relative rounded-2xl border overflow-hidden transition-all ${
                isCurrent
                  ? 'shadow-md ring-2'
                  : 'bg-white border-[hsl(140_20%_88%)] hover:shadow-sm'
              }`}
              style={isCurrent ? {
                background: row.color + '0f',
                borderColor: row.color + '55',
                ringColor: row.color + '30',
              } : {}}
            >
              {isCurrent && (
                <div
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: row.color }}
                />
              )}
              <div className="px-3 py-3.5 flex flex-col items-center text-center gap-1.5">
                {/* Emoji icon */}
                <span className="text-xl">{row.emoji}</span>

                {/* Label */}
                <p
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: isCurrent ? row.color : 'hsl(150 30% 25%)' }}
                >
                  {row.label}
                  {isCurrent && (
                    <span
                      className="ml-1 inline-flex items-center text-[8px] font-bold px-1 py-0.5 rounded-full text-white"
                      style={{ background: row.color }}
                    >
                      NOW
                    </span>
                  )}
                </p>

                {/* Start time */}
                <p
                  className="text-2xl font-extrabold tabular-nums leading-none"
                  style={{ color: row.start ? (isCurrent ? row.color : 'hsl(150 30% 12%)') : 'hsl(var(--muted-foreground) / 0.3)' }}
                >
                  {row.start ?? '—'}
                </p>

                {/* Jamaat time */}
                {row.showJamat && (
                  <div className="flex flex-col items-center">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Jamāʿat</p>
                    <p
                      className="text-sm font-bold tabular-nums"
                      style={{ color: row.jamat ? row.color + 'cc' : 'hsl(var(--muted-foreground) / 0.3)' }}
                    >
                      {row.jamat ?? '—'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Jumu'ah card — only on Fridays */}
      {isFriday && (
        <div className="rounded-2xl border border-amber-300 bg-[hsl(50_100%_97%)] px-4 py-3.5 flex items-center gap-4">
          <span className="text-2xl shrink-0">🕌</span>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Jumu'ah — Friday Prayer</p>
            <div className="flex items-center gap-5 mt-1">
              {jumuah1 && (
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-amber-500 uppercase">1st Khutbah</span>
                  <span className="text-xl font-extrabold tabular-nums text-amber-700">{jumuah1}</span>
                </div>
              )}
              {jumuah2 && (
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-amber-500 uppercase">2nd Khutbah</span>
                  <span className="text-xl font-extrabold tabular-nums text-amber-700">{jumuah2}</span>
                </div>
              )}
              {!jumuah1 && !jumuah2 && (
                <span className="text-sm text-amber-600/50">Times not set</span>
              )}
            </div>
          </div>
        </div>
      )}
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
    <div className="bg-white rounded-2xl border border-[hsl(140_20%_88%)] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[hsl(140_20%_90%)] bg-[hsl(47_100%_97%)] flex items-center gap-2">
        <Moon size={13} className="text-amber-500" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-amber-700">Solar Times Today</span>
        <span className="text-[10px] text-amber-600/70 font-medium ml-auto">Non-prayer reference times</span>
      </div>
      {/* Three columns */}
      <div className="grid grid-cols-3 divide-x divide-[hsl(140_20%_90%)]">
        {items.map(({ icon: Icon, label, desc, value, color, bg, border, textColor }) => (
          <div key={label} className={`${bg} px-3 py-4 flex flex-col items-center text-center gap-1.5`}>
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center mb-1"
              style={{ background: color + '20', border: `1.5px solid ${color}30` }}
            >
              <Icon size={16} style={{ color }} />
            </div>
            <p className={`text-xs font-bold ${textColor}`}>{label}</p>
            <p
              className="text-xl font-extrabold tabular-nums"
              style={{ color: value ? color : 'hsl(var(--muted-foreground) / 0.3)' }}
            >
              {value ?? '—'}
            </p>
            <p className="text-[9px] text-muted-foreground leading-tight">{desc}</p>
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
    className="group bg-white rounded-2xl border border-[hsl(140_20%_90%)] p-5 hover:shadow-md hover:border-[hsl(142_50%_75%)] transition-all duration-200 overflow-hidden flex flex-col gap-3"
  >
    <div className="flex items-start justify-between">
      <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center">
        <Icon size={18} className="text-[hsl(142_60%_32%)]" />
      </div>
      <ChevronRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
    </div>
    <div>
      <div className="text-3xl font-extrabold tabular-nums text-[hsl(150_30%_12%)]">{value}</div>
      <div className="text-sm font-semibold mt-0.5 text-[hsl(150_30%_18%)]">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  </Link>
);

// ─── Hijri Date Display ───────────────────────────────────────────────────────

const HIJRI_MONTHS = [
  'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Akhir",
  'Jumada al-Ula', 'Jumada al-Akhira', 'Rajab', "Sha'ban",
  'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah',
];

function getSimpleHijriDate(offsetDays = 0): string {
  // Simple approximate Hijri date for display purposes
  // Based on epoch difference; accurate within ±1 day
  const gregorianDate = new Date();
  // Apply offset by shifting the date used for calculation
  gregorianDate.setDate(gregorianDate.getDate() + offsetDays);
  const epochDiff = 1948438.5; // Julian day of Hijri epoch
  const jd = gregorianDate.getTime() / 86400000 + 2440587.5;
  const daysSinceEpoch = jd - epochDiff;
  const yearsSinceEpoch = daysSinceEpoch / 354.367;
  const hijriYear = Math.floor(yearsSinceEpoch) + 1;
  const daysInYear = (yearsSinceEpoch - Math.floor(yearsSinceEpoch)) * 354.367;
  const monthIdx = Math.min(Math.floor(daysInYear / 29.5), 11);
  const hijriDay = Math.floor(daysInYear % 29.5) + 1;
  return `${hijriDay} ${HIJRI_MONTHS[monthIdx]} ${hijriYear} AH`;
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

  const todayRow = prayerTimes.find((r) => r.day === day);
  const activeAnnouncements = announcements.filter((a) => a.is_active);
  const activeAdhkar = adhkar.filter((a) => a.is_active);

  // Full prayer rows for the cards
  const prayerRows: PrayerRow[] = [
    { label: 'Fajr',    start: todayRow?.fajr    ?? null, jamat: todayRow?.fajr_jamat,    color: '#2563eb', showJamat: true,  emoji: '🌙' },
    { label: 'Zuhr',    start: todayRow?.zuhr     ?? null, jamat: todayRow?.zuhr_jamat,    color: '#b45309', showJamat: true,  emoji: '☀️' },
    { label: 'Asr',     start: todayRow?.asr      ?? null, jamat: todayRow?.asr_jamat,     color: '#15803d', showJamat: true,  emoji: '🌤️' },
    { label: 'Maghrib', start: todayRow?.maghrib   ?? null, jamat: todayRow?.maghrib_jamat, color: '#b91c1c', showJamat: true,  emoji: '🌅' },
    { label: 'Isha',    start: todayRow?.isha      ?? null, jamat: todayRow?.isha_jamat,    color: '#7c3aed', showJamat: true,  emoji: '🌙' },
  ];

  // Prayers for next-prayer countdown (main 5 + Ishraq)
  const countdownPrayers: PrayerEntry[] = prayerRows
    .filter((r) => ['Fajr','Ishraq','Zuhr','Asr','Maghrib','Isha'].includes(r.label))
    .map((r) => ({
      label: r.label,
      startTime: r.start,
      jamatTime: r.jamat,
      color: r.color,
    }));

  const hijriDate = getSimpleHijriDate(hijriOffset);

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

        <div className="px-4 sm:px-8 py-6 space-y-7 max-w-5xl">

          {/* ── Today's Prayer Times ── */}
          <section>
            <div className="flex items-center gap-3 mb-3">
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
              <div className="space-y-3">
                {/* Next prayer countdown */}
                <NextPrayerCountdown prayers={countdownPrayers} />

                {/* Individual prayer cards */}
                <TodayPrayerCards
                  rows={prayerRows}
                  isFriday={isFriday}
                  jumuah1={todayRow.jumu_ah_1 ?? null}
                  jumuah2={todayRow.jumu_ah_2 ?? null}
                />
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

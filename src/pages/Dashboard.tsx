import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import { fetchPrayerTimes, fetchAdhkar, fetchAnnouncements, fetchAdhkarGroups } from '@/lib/api';
import {
  CalendarDays, BookOpen, Bell, Clock, ChevronRight,
  Star, BellRing, Timer, Sunrise,
} from 'lucide-react';
import masjidPhoto from '@/assets/masjid-photo.png';
import masjidLogo from '@/assets/masjid-logo.png';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function toMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function formatCountdown(mins: number): string {
  if (mins <= 0) return 'Now';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Next Prayer Countdown ────────────────────────────────────────────────────

interface PrayerEntry {
  label: string;
  startTime: string | null;
  jamatTime?: string | null;
  color: string;
}

const NextPrayerCountdown = ({ prayers }: { prayers: PrayerEntry[] }) => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  // Find the next prayer by start time
  const upcoming = prayers
    .filter((p) => p.startTime)
    .map((p) => ({ ...p, mins: toMinutes(p.startTime) ?? 0 }))
    .filter((p) => p.mins > currentMins)
    .sort((a, b) => a.mins - b.mins);

  const next = upcoming[0];
  if (!next) return null;

  const minsUntil = next.mins - currentMins;

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-4 border"
      style={{
        background: `linear-gradient(135deg, hsl(142 50% 96%), hsl(142 40% 98%))`,
        borderColor: 'hsl(142 40% 82%)',
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: next.color + '22', border: `1.5px solid ${next.color}33` }}
      >
        <Timer size={18} style={{ color: next.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Next Prayer</p>
        <p className="text-sm font-extrabold text-[hsl(150_30%_12%)]">{next.label}</p>
        {next.jamatTime && (
          <p className="text-[11px] text-muted-foreground">Jamāʿat at {next.jamatTime}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-2xl font-extrabold tabular-nums" style={{ color: next.color }}>
          {formatCountdown(minsUntil)}
        </p>
        <p className="text-[10px] text-muted-foreground">{next.startTime}</p>
      </div>
    </div>
  );
};

// ─── Today's Full Prayer Times Table ─────────────────────────────────────────

interface PrayerRow {
  label: string;
  start: string | null;
  jamat?: string | null;
  color: string;
  showJamat: boolean;
}

const TodayPrayerTable = ({
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

  return (
    <div className="bg-white rounded-2xl border border-[hsl(140_20%_88%)] overflow-hidden shadow-sm">
      {/* Table header */}
      <div className="grid grid-cols-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 py-2 border-b border-[hsl(140_20%_90%)] bg-[hsl(142_30%_97%)]">
        <span>Prayer</span>
        <span className="text-center">Start Time</span>
        <span className="text-right">Jamāʿat</span>
      </div>

      <div className="divide-y divide-[hsl(140_20%_93%)]">
        {rows.map((row, idx) => {
          const isCurrent = isCurrentPrayer(row, rows[idx + 1]);
          return (
            <div
              key={row.label}
              className={`grid grid-cols-3 items-center px-4 py-3 transition-colors ${
                isCurrent
                  ? 'bg-[hsl(142_50%_96%)] border-l-4 border-[hsl(142_60%_40%)]'
                  : 'hover:bg-[hsl(140_20%_97%)]'
              }`}
            >
              {/* Prayer name */}
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${isCurrent ? 'animate-pulse' : ''}`}
                  style={{ background: row.color }}
                />
                <span
                  className={`text-sm font-bold ${isCurrent ? 'text-[hsl(142_60%_28%)]' : 'text-[hsl(150_30%_18%)]'}`}
                >
                  {row.label}
                </span>
                {isCurrent && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[hsl(142_60%_35%)] text-white">
                    NOW
                  </span>
                )}
              </div>

              {/* Start time */}
              <div className="text-center">
                <span
                  className={`text-base font-extrabold tabular-nums ${
                    row.start ? (isCurrent ? 'text-[hsl(142_60%_28%)]' : 'text-[hsl(150_30%_12%)]') : 'text-muted-foreground/40'
                  }`}
                >
                  {row.start ?? '—'}
                </span>
              </div>

              {/* Jamaat */}
              <div className="text-right">
                {row.showJamat ? (
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      row.jamat ? 'text-[hsl(150_30%_30%)]' : 'text-muted-foreground/30'
                    }`}
                  >
                    {row.jamat ?? '—'}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground/40 italic">—</span>
                )}
              </div>
            </div>
          );
        })}

        {/* Jumu'ah row — only on Fridays */}
        {isFriday && (
          <div className="grid grid-cols-3 items-center px-4 py-3 bg-[hsl(50_100%_97%)] border-l-4 border-amber-400">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span className="text-sm font-bold text-amber-700">Jumu'ah</span>
            </div>
            <div className="text-center col-span-2 flex items-center justify-center gap-3">
              {jumuah1 && (
                <span className="flex flex-col items-center">
                  <span className="text-[10px] text-amber-600 font-semibold">1st</span>
                  <span className="text-base font-extrabold tabular-nums text-amber-700">{jumuah1}</span>
                </span>
              )}
              {jumuah2 && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="flex flex-col items-center">
                    <span className="text-[10px] text-amber-600 font-semibold">2nd</span>
                    <span className="text-base font-extrabold tabular-nums text-amber-700">{jumuah2}</span>
                  </span>
                </>
              )}
              {!jumuah1 && !jumuah2 && (
                <span className="text-sm text-muted-foreground/40">Not set</span>
              )}
            </div>
          </div>
        )}
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

function getSimpleHijriDate(): string {
  // Simple approximate Hijri date for display purposes
  // Based on epoch difference; accurate within ±1 day
  const gregorianDate = new Date();
  const epochDiff = 1948438.5; // Julian day of Hijri epoch
  const jd = gregorianDate.getTime() / 86400000 + 2440587.5;
  const daysSinceEpoch = jd - epochDiff;
  const yearsSinceEpoch = daysSinceEpoch / 354.367;
  const hijriYear = Math.floor(yearsSinceEpoch) + 1;
  const daysInYear = (yearsSinceEpoch - Math.floor(yearsSinceEpoch)) * 354.367;
  const hijriMonths = [
    'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Akhir",
    'Jumada al-Ula', 'Jumada al-Akhira', 'Rajab', "Sha'ban",
    'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah',
  ];
  const monthIdx = Math.min(Math.floor(daysInYear / 29.5), 11);
  const hijriDay = Math.floor(daysInYear % 29.5) + 1;
  return `${hijriDay} ${hijriMonths[monthIdx]} ${hijriYear} AH`;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const isFriday = now.getDay() === 5;
  const dayName = DAYS[now.getDay()];

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

  // Full prayer rows for the table
  const prayerRows: PrayerRow[] = [
    { label: 'Fajr',    start: todayRow?.fajr    ?? null, jamat: todayRow?.fajr_jamat,    color: '#2563eb', showJamat: true },
    { label: 'Sunrise', start: todayRow?.sunrise  ?? null, jamat: null,                    color: '#0369a1', showJamat: false },
    { label: 'Ishraq',  start: todayRow?.ishraq   ?? null, jamat: null,                    color: '#0891b2', showJamat: false },
    { label: 'Zawaal',  start: todayRow?.zawaal   ?? null, jamat: null,                    color: '#0f766e', showJamat: false },
    { label: 'Zuhr',    start: todayRow?.zuhr     ?? null, jamat: todayRow?.zuhr_jamat,    color: '#854d0e', showJamat: true },
    { label: 'Asr',     start: todayRow?.asr      ?? null, jamat: todayRow?.asr_jamat,     color: '#15803d', showJamat: true },
    { label: 'Maghrib', start: todayRow?.maghrib   ?? null, jamat: todayRow?.maghrib_jamat, color: '#b91c1c', showJamat: true },
    { label: 'Isha',    start: todayRow?.isha      ?? null, jamat: todayRow?.isha_jamat,    color: '#7c3aed', showJamat: true },
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

  const hijriDate = getSimpleHijriDate();

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

                {/* Full times table */}
                <TodayPrayerTable
                  rows={prayerRows}
                  isFriday={isFriday}
                  jumuah1={todayRow.jumu_ah_1 ?? null}
                  jumuah2={todayRow.jumu_ah_2 ?? null}
                />

                {/* Sunrise / Ishraq quick pills */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white rounded-xl border border-[hsl(140_20%_88%)] px-4 py-2.5 flex items-center gap-3">
                    <Sunrise size={15} className="text-[#0369a1] shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase">Sunrise</p>
                      <p className="text-sm font-extrabold tabular-nums text-[hsl(150_30%_12%)]">
                        {todayRow.sunrise ?? '—'}
                      </p>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-[hsl(140_20%_88%)] px-4 py-2.5 flex items-center gap-3">
                    <Sunrise size={15} className="text-[#0891b2] shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase">Ishraq</p>
                      <p className="text-sm font-extrabold tabular-nums text-[hsl(150_30%_12%)]">
                        {todayRow.ishraq ?? '—'}
                      </p>
                    </div>
                  </div>
                </div>
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

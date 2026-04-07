import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import { fetchPrayerTimes, fetchAdhkar, fetchAnnouncements, fetchAdhkarGroups } from '@/lib/api';
import { CalendarDays, BookOpen, Bell, Clock, ChevronRight, Star, BellRing } from 'lucide-react';
import masjidPhoto from '@/assets/masjid-photo.jpg';
import masjidLogo from '@/assets/masjid-logo.png';

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const StatCard = ({
  icon: Icon,
  label,
  value,
  sub,
  to,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  to: string;
  accent: string;
}) => (
  <Link
    to={to}
    className="group bg-white rounded-2xl border border-[hsl(140_20%_90%)] p-5 hover:shadow-md hover:border-[hsl(142_50%_75%)] transition-all duration-200 overflow-hidden flex flex-col gap-3"
  >
    <div className="flex items-start justify-between">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
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

const PrayerPill = ({ label, time, jamat, color }: { label: string; time: string | null; jamat?: string | null; color: string }) => (
  <div className="bg-white rounded-xl border border-[hsl(140_20%_90%)] px-3 py-3 text-center hover:shadow-sm hover:border-[hsl(142_50%_75%)] transition-all">
    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color }}>{label}</p>
    <p className={`text-base font-extrabold tabular-nums ${time ? 'text-[hsl(150_30%_12%)]' : 'text-muted-foreground'}`}>
      {time ?? '—'}
    </p>
    {jamat && (
      <p className="text-[10px] text-muted-foreground mt-0.5">Jamāʿat {jamat}</p>
    )}
  </div>
);

const Dashboard = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

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

  const todayPrayers = [
    { label: 'Fajr',    time: todayRow?.fajr    ?? null, jamat: todayRow?.fajr_jamat,    color: '#1d4ed8' },
    { label: 'Sunrise', time: todayRow?.sunrise  ?? null, jamat: null,                    color: '#0369a1' },
    { label: 'Zuhr',    time: todayRow?.zuhr     ?? null, jamat: todayRow?.zuhr_jamat,    color: '#15803d' },
    { label: 'Asr',     time: todayRow?.asr      ?? null, jamat: todayRow?.asr_jamat,     color: '#16a34a' },
    { label: 'Maghrib', time: todayRow?.maghrib   ?? null, jamat: todayRow?.maghrib_jamat, color: '#b91c1c' },
    { label: 'Isha',    time: todayRow?.isha      ?? null, jamat: todayRow?.isha_jamat,    color: '#7c3aed' },
  ];

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />

      <main className="flex-1 min-w-0 pt-14 md:pt-0 overflow-x-hidden">

        {/* ── Hero Banner — masjid photo with overlay ── */}
        <div className="relative h-56 sm:h-64 overflow-hidden">
          {/* Background photo */}
          <img
            src={masjidPhoto}
            alt="Jami' Masjid Noorani"
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Gradient overlay — dark-to-transparent left, green tint */}
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(142_65%_12%/0.92)] via-[hsl(142_55%_16%/0.75)] to-[hsl(142_40%_20%/0.35)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[hsl(142_65%_12%/0.5)] to-transparent" />

          {/* Content */}
          <div className="relative h-full flex items-end px-6 sm:px-10 pb-7">
            <div className="flex items-end gap-5">
              {/* Logo mark */}
              <div className="hidden sm:flex w-16 h-16 rounded-2xl bg-white/90 backdrop-blur items-center justify-center shadow-lg shrink-0 mb-1">
                <img src={masjidLogo} alt="JMN" className="w-12 h-12 object-contain" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-300 mb-1">
                  بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                </p>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight drop-shadow">
                  Jami' Masjid Noorani
                </h1>
                <p className="text-sm text-green-200 mt-1">
                  Admin Management Portal — {MONTHS_FULL[now.getMonth()]} {now.getFullYear()}
                </p>
                <div className="flex items-center gap-2 flex-wrap mt-4">
                  <Link
                    to="/prayer-times"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white text-[hsl(142_60%_28%)] hover:bg-green-50 transition-all shadow"
                  >
                    <CalendarDays size={14} />
                    Prayer Times
                  </Link>
                  <Link
                    to="/adhkar"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white/15 backdrop-blur text-white border border-white/30 hover:bg-white/25 transition-all"
                  >
                    <BookOpen size={14} />
                    Manage Adhkar
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-6 space-y-8">

          {/* ── Today's Prayer Times ── */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-[hsl(142_60%_35%)]" />
                <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">Today's Prayer Times</h2>
              </div>
              <span className="text-xs text-muted-foreground">
                {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
              <Link to="/prayer-times" className="text-xs font-medium text-[hsl(142_60%_35%)] hover:underline flex items-center gap-1">
                Edit <ChevronRight size={11} />
              </Link>
            </div>

            {todayRow ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {todayPrayers.map((p) => (
                  <PrayerPill key={p.label} {...p} />
                ))}
              </div>
            ) : (
              <div className="bg-white border border-dashed border-[hsl(140_20%_88%)] rounded-xl px-5 py-4 text-sm text-muted-foreground text-center">
                No prayer times found for today.{' '}
                <Link to="/prayer-times" className="text-[hsl(142_60%_35%)] hover:underline font-medium">Add them →</Link>
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
              <StatCard icon={CalendarDays} label="Prayer Days Loaded" value={prayerTimes.length} sub={`${MONTHS_FULL[now.getMonth()]} ${now.getFullYear()}`} to="/prayer-times" accent="bg-[hsl(142_50%_93%)]" />
              <StatCard icon={BookOpen} label="Active Adhkar" value={activeAdhkar.length} sub={`${adhkar.length} total · ${groups.length} groups`} to="/adhkar" accent="bg-[hsl(142_50%_93%)]" />
              <StatCard icon={Bell} label="Live Announcements" value={activeAnnouncements.length} sub={`${announcements.length} total`} to="/announcements" accent="bg-[hsl(142_50%_93%)]" />
              <StatCard icon={Star} label="Adhkar Groups" value={groups.length} sub={`${adhkar.length} entries across groups`} to="/adhkar" accent="bg-[hsl(142_50%_93%)]" />
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
                {announcements.slice(0, 3).map((a) => (
                  <div
                    key={a.id}
                    className={`bg-white rounded-xl border px-4 py-3 flex items-start gap-3 transition-all hover:shadow-sm ${
                      a.is_active ? 'border-[hsl(140_20%_90%)]' : 'border-dashed border-[hsl(140_15%_88%)] opacity-60'
                    }`}
                  >
                    <div className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${a.is_active ? 'bg-green-400' : 'bg-slate-300'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[hsl(150_30%_12%)]">{a.title}</p>
                      {a.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.body}</p>}
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      a.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {a.is_active ? 'LIVE' : 'OFF'}
                    </span>
                  </div>
                ))}
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
                { to: '/adhkar',       label: 'Add New Dhikr Entry',     icon: BookOpen     },
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

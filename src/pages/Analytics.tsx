import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import { fetchPrayerTimes, fetchAdhkar, fetchAnnouncements, fetchSunnahReminders } from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  BarChart2, BookOpen, Bell, Star, CalendarDays,
  TrendingUp, Users, CheckCircle2,
} from 'lucide-react';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const PRAYER_COLORS: Record<string, string> = {
  fajr: '#2563eb',
  zuhr: '#854d0e',
  asr: '#15803d',
  maghrib: '#b91c1c',
  isha: '#7c3aed',
};

// ─── Metric Card ──────────────────────────────────────────────────────────────

const MetricCard = ({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  accent = 'text-[hsl(142_60%_32%)]',
  bg = 'bg-[hsl(142_50%_93%)]',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  trend?: string;
  accent?: string;
  bg?: string;
}) => (
  <div className="bg-white rounded-2xl border border-[hsl(140_20%_88%)] p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
        <Icon size={18} className={accent} />
      </div>
      {trend && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
          <TrendingUp size={9} /> {trend}
        </span>
      )}
    </div>
    <div>
      <div className="text-3xl font-extrabold tabular-nums text-[hsl(150_30%_12%)]">{value}</div>
      <div className="text-sm font-semibold mt-0.5 text-[hsl(150_30%_18%)]">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  </div>
);

// ─── Analytics Page ───────────────────────────────────────────────────────────

const Analytics = () => {
  const now = new Date();
  const month = now.getMonth() + 1;

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

  const { data: sunnah = [] } = useQuery({
    queryKey: ['sunnah-reminders'],
    queryFn: fetchSunnahReminders,
    staleTime: 300_000,
  });

  // ── Adhkar by prayer time ──────────────────────────────────────────────────
  const prayerTimeGroups: Record<string, number> = {};
  adhkar.forEach((d) => {
    prayerTimeGroups[d.prayer_time] = (prayerTimeGroups[d.prayer_time] ?? 0) + 1;
  });
  const adhkarChartData = Object.entries(prayerTimeGroups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({
      name: name.replace('after-', 'A. ').replace('before-', 'B. '),
      count,
    }));

  // ── Active vs inactive dhikr ───────────────────────────────────────────────
  const activeAdhkar = adhkar.filter((d) => d.is_active).length;
  const inactiveAdhkar = adhkar.length - activeAdhkar;

  const pieData = [
    { name: 'Active', value: activeAdhkar, fill: '#22c55e' },
    { name: 'Inactive', value: inactiveAdhkar, fill: '#e5e7eb' },
  ];

  // ── Prayer time coverage for current month ─────────────────────────────────
  // Check how many days have all 5 prayers set
  const completeDays = prayerTimes.filter(
    (r) => r.fajr && r.zuhr && r.asr && r.maghrib && r.isha
  ).length;
  const incompleteDays = prayerTimes.length - completeDays;

  // ── Jamaat coverage ────────────────────────────────────────────────────────
  const jamaatCoverage = [
    { name: 'Fajr',    set: prayerTimes.filter((r) => r.fajr_jamat).length },
    { name: 'Zuhr',    set: prayerTimes.filter((r) => r.zuhr_jamat).length },
    { name: 'Asr',     set: prayerTimes.filter((r) => r.asr_jamat).length },
    { name: 'Maghrib', set: prayerTimes.filter((r) => r.maghrib_jamat).length },
    { name: 'Isha',    set: prayerTimes.filter((r) => r.isha_jamat).length },
  ];

  const totalDays = prayerTimes.length;
  const jamaatChartData = jamaatCoverage.map((p) => ({
    ...p,
    missing: totalDays - p.set,
    pct: totalDays > 0 ? Math.round((p.set / totalDays) * 100) : 0,
  }));

  // ── Sunnah category breakdown ──────────────────────────────────────────────
  const sunnahCategories: Record<string, number> = {};
  sunnah.forEach((s) => {
    sunnahCategories[s.category] = (sunnahCategories[s.category] ?? 0) + 1;
  });
  const sunnahChartData = Object.entries(sunnahCategories)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const SUNNAH_COLORS = ['#0d9488','#f97316','#f59e0b','#6366f1','#22c55e','#8b5cf6','#0ea5e9','#f43f5e','#84cc16','#6b7280'];

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />
      <main className="flex-1 min-w-0 pt-14 md:pt-0 overflow-x-hidden">

        {/* Banner */}
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
              <BarChart2 size={20} className="text-[hsl(142_60%_32%)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[hsl(150_30%_12%)]">Analytics & Insights</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Content coverage, completion rates, and data health for {MONTHS_SHORT[now.getMonth()]} {now.getFullYear()}
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-6 space-y-8 max-w-5xl">

          {/* ── Key Metrics ── */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">Content Summary</h2>
              <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={CalendarDays} label="Prayer Days" value={prayerTimes.length} sub={`${completeDays} complete · ${incompleteDays} partial`} />
              <MetricCard icon={BookOpen} label="Adhkar Entries" value={adhkar.length} sub={`${activeAdhkar} active`} accent="text-blue-600" bg="bg-blue-50" />
              <MetricCard icon={Star} label="Sunnah Reminders" value={sunnah.length} sub={`${sunnah.filter(s => s.is_active).length} active`} accent="text-amber-600" bg="bg-amber-50" />
              <MetricCard icon={Bell} label="Announcements" value={announcements.length} sub={`${announcements.filter(a => a.is_active).length} live`} accent="text-rose-600" bg="bg-rose-50" />
            </div>
          </section>

          {/* ── Prayer Time Jamaat Coverage ── */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">Jamāʿat Coverage — {MONTHS_SHORT[now.getMonth()]}</h2>
              <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
              <Link to="/prayer-times" className="text-xs text-[hsl(142_60%_35%)] hover:underline font-medium">
                Manage →
              </Link>
            </div>
            <div className="bg-white rounded-2xl border border-[hsl(140_20%_88%)] p-5 shadow-sm">
              {totalDays === 0 ? (
                <div className="flex items-center justify-center h-28 text-sm text-muted-foreground">
                  No prayer times loaded for this month.
                </div>
              ) : (
                <>
                  <div className="space-y-3 mb-5">
                    {jamaatChartData.map((prayer) => (
                      <div key={prayer.name} className="flex items-center gap-3">
                        <span
                          className="text-xs font-bold w-16 shrink-0"
                          style={{ color: PRAYER_COLORS[prayer.name.toLowerCase()] }}
                        >
                          {prayer.name}
                        </span>
                        <div className="flex-1 h-3 rounded-full bg-[hsl(140_20%_93%)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${prayer.pct}%`,
                              background: PRAYER_COLORS[prayer.name.toLowerCase()],
                            }}
                          />
                        </div>
                        <span className="text-xs font-bold tabular-nums w-10 text-right" style={{ color: PRAYER_COLORS[prayer.name.toLowerCase()] }}>
                          {prayer.pct}%
                        </span>
                        <span className="text-xs text-muted-foreground w-24 shrink-0">
                          {prayer.set}/{totalDays} days set
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 pt-3 border-t border-[hsl(140_20%_88%)]">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">{completeDays}</strong> of {totalDays} days have all 5 prayer start times set · {incompleteDays > 0 && <span className="text-amber-600">{incompleteDays} days incomplete</span>}
                    </p>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ── Two column charts ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Adhkar by prayer time */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">Adhkar by Prayer Time</h2>
                <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
              </div>
              <div className="bg-white rounded-2xl border border-[hsl(140_20%_88%)] p-5 shadow-sm">
                {adhkarChartData.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No adhkar data.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={adhkarChartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={64} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(140 20% 88%)' }}
                        cursor={{ fill: 'hsl(142 50% 97%)' }}
                      />
                      <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="hsl(142 60% 40%)" label={{ position: 'right', fontSize: 10 }} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            {/* Active vs Inactive dhikr + Sunnah breakdown */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">Content Status</h2>
                <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
              </div>
              <div className="bg-white rounded-2xl border border-[hsl(140_20%_88%)] p-5 shadow-sm">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Adhkar Active vs Inactive</p>
                {adhkar.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">No adhkar data.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}

                <div className="mt-3 pt-3 border-t border-[hsl(140_20%_88%)]">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sunnah by Category</p>
                  {sunnahChartData.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No sunnah data.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {sunnahChartData.map((s, i) => (
                        <span
                          key={s.name}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                          style={{ background: SUNNAH_COLORS[i % SUNNAH_COLORS.length] }}
                        >
                          {s.name} ({s.value})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* ── Data Health ── */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">Data Health Checks</h2>
              <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  label: 'Adhkar with Arabic text',
                  count: adhkar.filter((d) => d.arabic?.trim()).length,
                  total: adhkar.length,
                  color: '#2563eb',
                },
                {
                  label: 'Adhkar with transliteration',
                  count: adhkar.filter((d) => d.transliteration?.trim()).length,
                  total: adhkar.length,
                  color: '#7c3aed',
                },
                {
                  label: 'Adhkar with reference',
                  count: adhkar.filter((d) => d.reference?.trim()).length,
                  total: adhkar.length,
                  color: '#0891b2',
                },
                {
                  label: 'Sunnah with translation',
                  count: sunnah.filter((s) => s.translation?.trim()).length,
                  total: sunnah.length,
                  color: '#f59e0b',
                },
                {
                  label: 'Announcements with poster',
                  count: announcements.filter((a) => a.image_url).length,
                  total: announcements.length,
                  color: '#b91c1c',
                },
                {
                  label: 'Prayer days with Fajr Jamāʿat',
                  count: prayerTimes.filter((r) => r.fajr_jamat).length,
                  total: totalDays,
                  color: '#15803d',
                },
              ].map(({ label, count, total, color }) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={label} className="bg-white rounded-xl border border-[hsl(140_20%_88%)] px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-[hsl(150_30%_18%)]">{label}</span>
                      <span className="text-xs font-bold tabular-nums" style={{ color }}>
                        {count}/{total}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[hsl(140_20%_93%)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{pct}% complete</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Device Engagement placeholder ── */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">Community Reach</h2>
              <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
              <Link to="/notifications" className="text-xs text-[hsl(142_60%_35%)] hover:underline font-medium">
                Send notification →
              </Link>
            </div>
            <div className="bg-white rounded-2xl border border-[hsl(140_20%_88%)] p-6 flex items-center gap-5 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <Users size={22} className="text-[hsl(142_60%_32%)]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[hsl(150_30%_12%)]">Push Notification Reach</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Device token registration stats appear here once your mobile app is connected and users have granted push notification permissions.
                </p>
              </div>
              <Link
                to="/notifications"
                className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] text-xs font-medium hover:bg-[hsl(142_50%_95%)] transition-colors"
              >
                <BellRing size={13} /> View
              </Link>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
};

export default Analytics;

import { useState } from 'react';
import { CalendarDays, BookOpen, Database, Bell, Menu, X, Home, FileSpreadsheet, Star } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/',               icon: Home,         label: 'Dashboard'    },
  { to: '/prayer-times',   icon: CalendarDays, label: 'Prayer Times' },
  { to: '/adhkar',         icon: BookOpen,     label: 'Adhkar'       },
  { to: '/announcements',  icon: Bell,         label: 'Announcements'},
  { to: '/cloud-data',       icon: Database,         label: 'Cloud Data'   },
  { to: '/sunnah-reminders', icon: Star,             label: 'Sunnah Reminders' },
  { to: '/excel-converter',  icon: FileSpreadsheet,  label: 'Excel → CSV'  },
];

// Crescent + Star SVG mark (Islamic geometric)
const MasjidMark = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Crescent */}
    <path
      d="M20 6C13.373 6 8 11.373 8 18C8 24.627 13.373 30 20 30C22.8 30 25.36 29.04 27.38 27.42C25.6 27.8 23.72 27.6 22 26.74C17.56 24.52 15.6 19.2 17.82 14.76C19.06 12.28 21.3 10.6 23.8 9.96C25.48 9.52 27.24 9.58 28.86 10.12C26.72 7.64 23.52 6 20 6Z"
      fill="hsl(40 55% 46%)"
    />
    {/* Star */}
    <path
      d="M31 8L31.9 10.8L34.8 10.8L32.5 12.4L33.4 15.2L31 13.6L28.6 15.2L29.5 12.4L27.2 10.8L30.1 10.8Z"
      fill="hsl(40 55% 46%)"
    />
  </svg>
);

const NavContent = ({ onNavClick }: { onNavClick?: () => void }) => (
  <div className="flex flex-col h-full">
    {/* ── Logo / Brand ── */}
    <div className="sidebar-pattern px-5 pt-7 pb-6 border-b border-[hsl(var(--sidebar-border))]">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[hsl(150_40%_16%)]">
          <MasjidMark size={36} />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-[13px] leading-tight text-[hsl(var(--sidebar-accent-foreground))] truncate">
            Jami' Masjid
          </p>
          <p className="font-extrabold text-[15px] leading-tight tracking-wide text-[hsl(40_55%_52%)]">
            Noorani
          </p>
        </div>
      </div>
      <p className="text-[10px] font-medium tracking-widest uppercase text-[hsl(var(--sidebar-foreground))] opacity-60">
        Admin Portal
      </p>
    </div>

    {/* ── Navigation ── */}
    <nav className="flex-1 px-3 pt-5 pb-2 space-y-0.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-3 text-[hsl(var(--sidebar-foreground))] opacity-50">
        Management
      </p>
      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavClick}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all relative ${
              isActive
                ? 'nav-active-glow bg-[hsl(var(--sidebar-accent))] text-[hsl(40_60%_58%)]'
                : 'text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                size={15}
                className={isActive ? 'text-[hsl(40_60%_58%)]' : 'opacity-70'}
              />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>

    {/* ── Footer ── */}
    <div className="px-5 py-4 border-t border-[hsl(var(--sidebar-border))] mt-auto">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
        <span className="text-[11px] font-semibold text-emerald-400">Live</span>
      </div>
      <p className="text-[10px] text-[hsl(var(--sidebar-foreground))] opacity-50">
        OnSpace Cloud · v2
      </p>
    </div>
  </div>
);

const Sidebar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 border-b shadow-sm"
        style={{ background: 'hsl(var(--sidebar-background))', borderColor: 'hsl(var(--sidebar-border))' }}
      >
        <div className="flex items-center gap-2.5">
          <MasjidMark size={28} />
          <div>
            <p className="font-bold text-xs leading-tight text-[hsl(var(--sidebar-accent-foreground))]">Jami' Masjid</p>
            <p className="font-extrabold text-sm leading-tight text-[hsl(40_55%_52%)]">Noorani</p>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors"
          aria-label="Open menu"
        >
          <Menu size={20} className="text-[hsl(var(--sidebar-accent-foreground))]" />
        </button>
      </div>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative z-10 w-60 min-h-full flex flex-col shadow-2xl"
            style={{ background: 'hsl(var(--sidebar-background))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors"
              aria-label="Close"
            >
              <X size={15} className="text-[hsl(var(--sidebar-foreground))]" />
            </button>
            <NavContent onNavClick={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden md:flex w-48 min-h-screen flex-col shrink-0"
        style={{ background: 'hsl(var(--sidebar-background))' }}
      >
        <NavContent />
      </aside>
    </>
  );
};

export default Sidebar;

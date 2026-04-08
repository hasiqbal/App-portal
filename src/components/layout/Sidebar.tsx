
import { useState } from 'react';
import { CalendarDays, BookOpen, Database, Bell, BellRing, Menu, X, Home, FileSpreadsheet, Star, BarChart2, LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import masjidLogo from '@/assets/masjid-logo.png';

const NAV_ITEMS = [
  { to: '/',                 icon: Home,           label: 'Dashboard'        },
  { to: '/prayer-times',    icon: CalendarDays,   label: 'Prayer Times'     },
  { to: '/adhkar',          icon: BookOpen,       label: 'Adhkar'           },
  { to: '/announcements',   icon: Bell,           label: 'Announcements'    },
  { to: '/sunnah-reminders',icon: Star,           label: 'Sunnah Reminders' },
  { to: '/notifications',   icon: BellRing,       label: 'Notifications'    },
  { to: '/analytics',       icon: BarChart2,      label: 'Analytics'        },
  { to: '/cloud-data',      icon: Database,       label: 'Cloud Data'       },
  { to: '/excel-converter', icon: FileSpreadsheet,label: 'Excel → CSV'      },
];

const LogoBrand = () => (
  <div className="sidebar-pattern px-4 pt-5 pb-4 border-b border-[hsl(var(--sidebar-border))]">
    <div className="flex items-center gap-3">
      <img
        src={masjidLogo}
        alt="Jami' Masjid Noorani"
        className="w-12 h-12 object-contain shrink-0"
      />
      <div className="min-w-0">
        <p className="font-bold text-[13px] leading-tight text-[hsl(142_55%_28%)] truncate">
          Jami' Masjid Noorani
        </p>
        <p className="text-[10px] font-semibold tracking-widest uppercase text-[hsl(var(--muted-foreground))] mt-0.5">
          Admin Portal
        </p>
      </div>
    </div>
  </div>
);

const NavContent = ({ onNavClick }: { onNavClick?: () => void }) => (
  <div className="flex flex-col h-full">
    <LogoBrand />

    {/* Navigation */}
    <nav className="flex-1 px-2 pt-4 pb-2 space-y-0.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-2 text-[hsl(var(--muted-foreground))]">
        Management
      </p>
      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavClick}
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all relative ${
              isActive
                ? 'nav-active-glow bg-[hsl(142_50%_95%)] text-[hsl(142_60%_28%)]'
                : 'text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                size={15}
                className={isActive ? 'text-[hsl(142_60%_32%)]' : 'opacity-60'}
              />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>

    {/* Footer */}
    <SidebarFooter onNavClick={onNavClick} />
  </div>
);

const SidebarFooter = ({ onNavClick }: { onNavClick?: () => void }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
    onNavClick?.();
  };

  return (
    <div className="px-4 py-4 border-t border-[hsl(var(--sidebar-border))] mt-auto">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" />
        <span className="text-[11px] font-semibold text-green-600">Live</span>
      </div>
      {user && (
        <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate mb-2">{user.email}</p>
      )}
      <button
        onClick={handleSignOut}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-200 transition-colors text-xs font-medium"
        title="Sign out"
      >
        <LogOut size={13} />
        Sign Out
      </button>
    </div>
  );
};

const MobileBrand = () => (
  <div className="flex items-center gap-2.5">
    <img src={masjidLogo} alt="JMN" className="w-9 h-9 object-contain" />
    <div>
      <p className="font-bold text-xs leading-tight text-[hsl(142_55%_28%)]">Jami' Masjid Noorani</p>
      <p className="text-[9px] font-semibold tracking-widest uppercase text-[hsl(var(--muted-foreground))]">Admin Portal</p>
    </div>
  </div>
);

const Sidebar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 border-b shadow-sm bg-white"
        style={{ borderColor: 'hsl(var(--sidebar-border))' }}
      >
        <MobileBrand />
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-[hsl(142_50%_95%)] transition-colors"
          aria-label="Open menu"
        >
          <Menu size={20} className="text-[hsl(142_55%_28%)]" />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative z-10 w-60 min-h-full flex flex-col shadow-2xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-[hsl(142_50%_95%)] transition-colors"
              aria-label="Close"
            >
              <X size={15} className="text-[hsl(var(--muted-foreground))]" />
            </button>
            <NavContent onNavClick={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex w-52 min-h-screen flex-col shrink-0 border-r shadow-sm bg-white"
        style={{ borderColor: 'hsl(var(--sidebar-border))' }}
      >
        <NavContent />
      </aside>
    </>
  );
};

export default Sidebar;

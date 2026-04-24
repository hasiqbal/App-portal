import { useState } from 'react';
import {
  CalendarDays, BookOpen, Database, Bell, BellRing,
  Menu, X, Home, FileSpreadsheet, Star, FileText, FolderTree,
  LogOut, Settings2, Users,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '#/hooks/useAuth';
import { usePermissions } from '#/hooks/usePermissions';
import masjidLogo from '#/assets/masjid-logo.png';

// ─── Navigation config ────────────────────────────────────────────────────────

const ALL_NAV_ITEMS = [
  { to: '/',                  icon: Home,            label: 'Dashboard',        adminOnly: false },
  { to: '/prayer-times',      icon: CalendarDays,    label: 'Prayer Times',     adminOnly: false },
  { to: '/adhkar',            icon: BookOpen,        label: 'Adhkar',           adminOnly: false },
  { to: '/qaseedah-naats',    icon: FileText,        label: 'Qaseedahs & Naats',  adminOnly: false },
  { to: '/howto-guides',      icon: FolderTree,      label: 'How-To Guides',    adminOnly: false },
  { to: '/announcements',     icon: Bell,            label: 'Announcements',    adminOnly: false },
  { to: '/donation-options',  icon: Star,            label: 'Donation Options', adminOnly: false, requiresEdit: true },
  { to: '/sunnah-reminders',  icon: Star,            label: 'Sunnah Reminders', adminOnly: false },
  { to: '/notifications',     icon: BellRing,        label: 'Notifications',    adminOnly: false },

  { to: '/users',             icon: Users,           label: 'User Management',  adminOnly: true  },
  { to: '/settings',          icon: Settings2,       label: 'Settings',         adminOnly: true  },
  { to: '/cloud-data',        icon: Database,        label: 'Cloud Data',       adminOnly: true  },
  { to: '/excel-converter',   icon: FileSpreadsheet, label: 'Excel → CSV',      adminOnly: false },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

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
          Jami&apos; Masjid Noorani
        </p>
        <p className="text-[10px] font-semibold tracking-widest uppercase text-[hsl(var(--muted-foreground))] mt-0.5">
          Admin Portal
        </p>
      </div>
    </div>
  </div>
);

const SignOutButton = ({ onSignOut }: { onSignOut: () => void }) => (
  <button
    onClick={onSignOut}
    className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-200 transition-colors font-medium w-full px-3 py-2 text-xs"
    title="Sign out"
  >
    <LogOut size={13} />
    Sign Out
  </button>
);

const SidebarFooter = ({ onNavClick }: { onNavClick?: () => void }) => {
  const { user, signOut } = useAuth();
  const { role } = usePermissions();
  const navigate = useNavigate();

  const ROLE_LABELS: Record<string, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
  const ROLE_COLORS: Record<string, string> = {
    admin: 'text-purple-600 bg-purple-50 border-purple-200',
    editor: 'text-blue-600 bg-blue-50 border-blue-200',
    viewer: 'text-slate-500 bg-slate-50 border-slate-200',
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
    onNavClick?.();
  };

  return (
    <div className="px-4 py-4 border-t border-[hsl(var(--sidebar-border))] mt-auto space-y-2">
      {/* Live indicator */}
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" />
        <span className="text-[11px] font-semibold text-green-600">Live</span>
      </div>

      {/* Logged in user + role badge */}
      {user && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate">
            <span className="font-semibold">{user.name || user.username}</span>
          </p>
          {role && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${ROLE_COLORS[role]}`}>
              {ROLE_LABELS[role]}
            </span>
          )}
        </div>
      )}

      {/* Sign out button — always visible */}
      <SignOutButton onSignOut={handleSignOut} />
    </div>
  );
};

const NavContent = ({ onNavClick }: { onNavClick?: () => void }) => {
  const { isAdmin, canEdit } = usePermissions();
  const visibleItems = ALL_NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.requiresEdit && !canEdit) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <LogoBrand />

      <nav className="flex-1 px-2 pt-4 pb-2 space-y-0.5 overflow-y-auto">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-2 text-[hsl(var(--muted-foreground))]">
          Management
        </p>
        {visibleItems.map(({ to, icon: Icon, label, adminOnly }) => (
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
                <Icon size={15} className={isActive ? 'text-[hsl(142_60%_32%)]' : 'opacity-60'} />
                <span className="flex-1">{label}</span>
                {adminOnly && (
                  <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-purple-100 text-purple-600 uppercase tracking-wide">
                    Admin
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <SidebarFooter onNavClick={onNavClick} />
    </div>
  );
};

// ─── Mobile brand strip ───────────────────────────────────────────────────────

const MobileBrand = () => (
  <div className="flex items-center gap-2.5">
    <img src={masjidLogo} alt="JMN" className="w-9 h-9 object-contain" />
    <div>
      <p className="font-bold text-xs leading-tight text-[hsl(142_55%_28%)]">Jami&apos; Masjid Noorani</p>
      <p className="text-[9px] font-semibold tracking-widest uppercase text-[hsl(var(--muted-foreground))]">
        Admin Portal
      </p>
    </div>
  </div>
);

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const Sidebar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 border-b shadow-sm bg-white"
        style={{ borderColor: 'hsl(var(--sidebar-border))' }}
      >
        <MobileBrand />

        <div className="flex items-center gap-2">
          {/* Sign-out always visible on mobile top bar */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-xs font-medium"
            title="Sign out"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>

          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-[hsl(142_50%_95%)] transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} className="text-[hsl(142_55%_28%)]" />
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex"
          onClick={() => setMobileOpen(false)}
        >
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

      {/* ── Desktop sidebar ── */}
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

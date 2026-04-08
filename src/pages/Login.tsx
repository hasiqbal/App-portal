import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Lock, User, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import masjidLogo from '@/assets/masjid-logo.png';
import masjidPhoto from '@/assets/masjid-photo.png';
import { useAuth } from '@/hooks/useAuth';

// Credential check — falls back to localStorage override set by Settings page
const CRED_KEY = '__jmn_admin_creds__';
const DEFAULT_CREDENTIALS: Record<string, string> = { admin: 'admin' };

function getCredentials(): Record<string, string> {
  try {
    const stored = localStorage.getItem(CRED_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return DEFAULT_CREDENTIALS;
}

const Login = () => {
  const navigate = useNavigate();
  const { localLogin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { toast.error('Please enter your username.'); return; }
    if (!password) { toast.error('Please enter your password.'); return; }

    setLoading(true);

    // Simulate a brief loading state for UX
    await new Promise((r) => setTimeout(r, 400));

    const expectedPassword = getCredentials()[username.trim().toLowerCase()];
    if (!expectedPassword || expectedPassword !== password) {
      toast.error('Invalid username or password.');
      setLoading(false);
      return;
    }

    localLogin(username.trim());
    toast.success(`Welcome, ${username}!`);
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* ── Left panel — photo hero ── */}
      <div className="relative hidden md:flex md:w-1/2 lg:w-3/5 overflow-hidden">
        <img
          src={masjidPhoto}
          alt="Jami' Masjid Noorani"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(142_65%_12%/0.88)] via-[hsl(142_55%_18%/0.72)] to-[hsl(142_40%_25%/0.45)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(142_70%_10%/0.6)] to-transparent" />

        <div className="relative flex flex-col justify-between h-full px-10 py-12">
          {/* Logo + name */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/90 backdrop-blur flex items-center justify-center shadow-lg">
              <img src={masjidLogo} alt="JMN" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <p className="font-extrabold text-white text-lg leading-tight">Jami' Masjid Noorani</p>
              <p className="text-green-200 text-xs font-semibold tracking-widest uppercase mt-0.5">Admin Portal</p>
            </div>
          </div>

          {/* Arabic Bismillah + quote */}
          <div className="max-w-md">
            <p className="text-4xl text-white/90 leading-loose text-right mb-4" style={{ fontFamily: 'serif' }} dir="rtl">
              بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
            </p>
            <p className="text-green-100 text-sm leading-relaxed font-medium">
              "And establish prayer and give zakah, and whatever good you put forward for yourselves — you will find it with Allah."
            </p>
            <p className="text-green-300 text-xs mt-2">— Quran 2:110</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {['Prayer Times', 'Adhkar', 'Announcements', 'Notifications'].map((f) => (
                <span key={f} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/15 backdrop-blur text-white border border-white/20">
                  {f}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-green-200/60 text-xs">Team JMN · Built with dedication for the community</p>
          </div>
        </div>
      </div>

      {/* ── Right panel — login form ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-[hsl(140_30%_97%)]">
        {/* Mobile logo */}
        <div className="md:hidden flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-md flex items-center justify-center mb-3 border border-[hsl(140_20%_88%)]">
            <img src={masjidLogo} alt="JMN" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="font-extrabold text-[hsl(150_30%_12%)] text-xl">Jami' Masjid Noorani</h1>
          <p className="text-xs text-muted-foreground mt-1 tracking-wider uppercase">Admin Portal</p>
        </div>

        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl border border-[hsl(140_20%_88%)] shadow-sm px-7 py-8">
            {/* Header */}
            <div className="mb-6">
              <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center mb-3">
                <Lock size={18} className="text-[hsl(142_60%_32%)]" />
              </div>
              <h2 className="text-xl font-extrabold text-[hsl(150_30%_12%)]">Sign In</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Access the JMN admin management portal
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Username */}
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs font-semibold text-[hsl(150_30%_18%)]">
                  Username
                </Label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className="pl-9 border-[hsl(140_20%_88%)] focus:border-[hsl(142_50%_70%)]"
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold text-[hsl(150_30%_18%)]">
                  Password
                </Label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9 pr-9 border-[hsl(140_20%_88%)] focus:border-[hsl(142_50%_70%)]"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full gap-2 mt-2"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              >
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Signing in…</>
                  : 'Sign In'}
              </Button>
            </form>
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-5 leading-relaxed">
            This portal is restricted to authorised Team JMN administrators only.
            <br />Contact your admin if you need access.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

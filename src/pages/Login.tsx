import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import masjidLogo from '@/assets/masjid-logo.png';
import masjidPhoto from '@/assets/masjid-photo.png';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'otp'>('login');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { toast.error('Please enter your email.'); return; }
    if (mode === 'login' && !password) { toast.error('Please enter your password.'); return; }
    setLoading(true);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      toast.success('Welcome back!');
      navigate('/', { replace: true });
    } else {
      if (!otpSent) {
        // Send OTP
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: false },
        });
        if (error) {
          toast.error(error.message);
          setLoading(false);
          return;
        }
        setOtpSent(true);
        toast.success('A one-time code has been sent to your email.');
        setLoading(false);
      } else {
        // Verify OTP
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: otp.trim(),
          type: 'email',
        });
        if (error) {
          toast.error(error.message);
          setLoading(false);
          return;
        }
        toast.success('Signed in successfully.');
        navigate('/', { replace: true });
      }
    }
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
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(142_65%_12%/0.88)] via-[hsl(142_55%_18%/0.72)] to-[hsl(142_40%_25%/0.45)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(142_70%_10%/0.6)] to-transparent" />

        {/* Content overlay */}
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
              {['Prayer Times','Adhkar','Announcements','Notifications'].map((f) => (
                <span key={f} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/15 backdrop-blur text-white border border-white/20">
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Bottom */}
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
          {/* Card */}
          <div className="bg-white rounded-2xl border border-[hsl(140_20%_88%)] shadow-sm px-7 py-8">
            {/* Header */}
            <div className="mb-6">
              <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center mb-3">
                <Lock size={18} className="text-[hsl(142_60%_32%)]" />
              </div>
              <h2 className="text-xl font-extrabold text-[hsl(150_30%_12%)]">
                {mode === 'login' ? 'Sign In' : 'Passwordless Login'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {mode === 'login'
                  ? 'Access the JMN admin management portal'
                  : otpSent
                  ? `Enter the 4-digit code sent to ${email}`
                  : 'We\'ll email you a one-time login code'}
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-[hsl(150_30%_18%)]">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@masjid.com"
                    className="pl-9 border-[hsl(140_20%_88%)] focus:border-[hsl(142_50%_70%)]"
                    disabled={otpSent}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              {mode === 'login' && (
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
              )}

              {mode === 'otp' && otpSent && (
                <div className="space-y-1.5">
                  <Label htmlFor="otp" className="text-xs font-semibold text-[hsl(150_30%_18%)]">
                    One-Time Code
                  </Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="0000"
                    className="font-mono text-center text-lg tracking-[0.5em] border-[hsl(140_20%_88%)] focus:border-[hsl(142_50%_70%)]"
                    autoFocus
                  />
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full gap-2 mt-2"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              >
                {loading ? (
                  <><Loader2 size={14} className="animate-spin" /> Signing in…</>
                ) : mode === 'login' ? (
                  <>Sign In</>
                ) : otpSent ? (
                  <>Verify Code</>
                ) : (
                  <>Send Code</>
                )}
              </Button>
            </form>

            {/* Mode switcher */}
            <div className="mt-5 pt-4 border-t border-[hsl(140_20%_88%)]">
              <button
                type="button"
                onClick={() => { setMode(mode === 'login' ? 'otp' : 'login'); setOtpSent(false); setOtp(''); }}
                className="w-full text-xs text-center text-muted-foreground hover:text-[hsl(142_60%_32%)] transition-colors"
              >
                {mode === 'login'
                  ? 'Sign in without a password →'
                  : '← Back to password sign in'}
              </button>
            </div>
          </div>

          {/* Footer note */}
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

import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { toast } from 'sonner';
import { Settings2, MapPin, Phone, Globe, Share2, Clock, Save, Loader2, RefreshCw, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Setting {
  key: string;
  value: string | null;
  label: string;
  category: string;
}

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES: { key: string; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'info',        label: 'Masjid Info',   icon: MapPin,    color: 'hsl(142 60% 32%)' },
  { key: 'contact',     label: 'Contact',       icon: Phone,     color: '#0891b2'           },
  { key: 'social',      label: 'Social Media',  icon: Share2,    color: '#6366f1'           },
  { key: 'prayers',     label: 'Prayer Config', icon: Clock,     color: '#b91c1c'           },
  { key: 'preferences', label: 'Preferences',   icon: Settings2, color: '#0f766e'           },
];

// ─── Settings Section ─────────────────────────────────────────────────────────

const SettingsSection = ({
  category,
  settings,
  pending,
  onChange,
}: {
  category: (typeof CATEGORIES)[0];
  settings: Setting[];
  pending: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) => {
  const Icon = category.icon;

  return (
    <div className="bg-white rounded-2xl border border-[hsl(140_20%_88%)] shadow-sm overflow-hidden">
      <div
        className="px-5 py-4 border-b border-[hsl(140_20%_88%)] flex items-center gap-3"
        style={{ background: `${category.color}0a` }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${category.color}18`, color: category.color }}
        >
          <Icon size={15} />
        </div>
        <h3 className="text-sm font-bold" style={{ color: category.color }}>
          {category.label}
        </h3>
      </div>
      <div className="px-5 py-4 space-y-4">
        {settings.map((s) => (
          <div key={s.key} className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">{s.label}</Label>
            <Input
              value={pending[s.key] ?? s.value ?? ''}
              onChange={(e) => onChange(s.key, e.target.value)}
              placeholder={`Enter ${s.label.toLowerCase()}…`}
              className="border-[hsl(140_20%_88%)] focus:border-[hsl(142_50%_70%)] text-sm h-9"
              type={s.key === 'email' ? 'email' : s.key.includes('url') || s.key.includes('website') || s.key.includes('facebook') || s.key.includes('instagram') || s.key.includes('youtube') ? 'url' : 'text'}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Password Change Card ─────────────────────────────────────────────────────

const PasswordChangeCard = () => {
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hard-coded credential store key matches Login.tsx logic
  const CRED_KEY = '__jmn_admin_creds__';

  const handleSave = async () => {
    if (!current || !newPass || !confirm) { toast.error('Please fill in all fields.'); return; }
    if (newPass !== confirm) { toast.error('New passwords do not match.'); return; }
    if (newPass.length < 4) { toast.error('Password must be at least 4 characters.'); return; }

    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));

    // Validate current password against the same credential store used by Login
    // The Login page uses a CREDENTIALS const — here we mirror it via localStorage override
    const stored = localStorage.getItem(CRED_KEY);
    let creds: Record<string, string> = { admin: 'admin' };
    try { if (stored) creds = JSON.parse(stored); } catch { /* ok */ }

    const adminPass = creds['admin'];
    if (current !== adminPass) {
      toast.error('Current password is incorrect.');
      setSaving(false);
      return;
    }

    creds['admin'] = newPass;
    localStorage.setItem(CRED_KEY, JSON.stringify(creds));
    toast.success('Password updated successfully.');
    setCurrent(''); setNewPass(''); setConfirm('');
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-[hsl(140_20%_88%)] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[hsl(140_20%_88%)] flex items-center gap-3 bg-red-50">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-red-100">
          <Lock size={15} className="text-red-600" />
        </div>
        <h3 className="text-sm font-bold text-red-700">Change Admin Password</h3>
      </div>
      <div className="px-5 py-4 space-y-4">
        {[
          { id: 'cur', label: 'Current Password', val: current, set: setCurrent, show: showCurrent, toggle: () => setShowCurrent(v => !v) },
          { id: 'new', label: 'New Password',     val: newPass,  set: setNewPass,  show: showNew,     toggle: () => setShowNew(v => !v) },
          { id: 'con', label: 'Confirm New Password', val: confirm, set: setConfirm, show: showNew, toggle: () => setShowNew(v => !v) },
        ].map((f) => (
          <div key={f.id} className="space-y-1.5">
            <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">{f.label}</Label>
            <div className="relative">
              <Input
                type={f.show ? 'text' : 'password'}
                value={f.val}
                onChange={(e) => f.set(e.target.value)}
                placeholder="••••••••"
                className="pr-9 border-[hsl(140_20%_88%)] focus:border-[hsl(142_50%_70%)] text-sm h-9"
              />
              <button
                type="button"
                onClick={f.toggle}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {f.show ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>
        ))}
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !current || !newPass || !confirm}
          className="gap-2 w-full"
          variant="destructive"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
          {saving ? 'Updating…' : 'Update Password'}
        </Button>
      </div>
    </div>
  );
};

// ─── Settings Page ────────────────────────────────────────────────────────────

const Settings = () => {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('masjid_settings').select('*').order('category').order('key');
    if (error) { toast.error('Failed to load settings.'); }
    else { setSettings(data as Setting[]); }
    setLoading(false);
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleChange = (key: string, val: string) => {
    setPending((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    if (Object.keys(pending).length === 0) { toast.info('No changes to save.'); return; }
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(pending).map(([key, value]) =>
          supabaseAdmin.from('masjid_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
        )
      );
      // Keep localStorage in sync for hijri_offset
      if (pending['hijri_offset'] !== undefined) {
        try { localStorage.setItem('hijri_offset', pending['hijri_offset']); } catch { /* noop */ }
      }
      // Update local state
      setSettings((prev) => prev.map((s) => (pending[s.key] !== undefined ? { ...s, value: pending[s.key] } : s)));
      setPending({});
      toast.success('Settings saved.');
    } catch {
      toast.error('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const hasPending = Object.keys(pending).length > 0;

  // Group by category
  const grouped = CATEGORIES.map((cat) => ({
    category: cat,
    settings: settings.filter((s) => s.category === cat.key),
  })).filter((g) => g.settings.length > 0);

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        {/* Banner */}
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <Settings2 size={20} className="text-[hsl(142_60%_32%)]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[hsl(150_30%_12%)]">Portal Settings</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Masjid information, contact details, and admin preferences
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchSettings} disabled={loading} className="gap-2">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
              </Button>
              {hasPending && (
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-2"
                  style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? 'Saving…' : `Save Changes (${Object.keys(pending).length})`}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-6 max-w-3xl">
          {loading ? (
            <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
              <Loader2 size={20} className="animate-spin text-[hsl(142_60%_35%)]" />
              <span className="text-sm">Loading settings…</span>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Unsaved changes banner */}
              {hasPending && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <p className="text-xs font-medium text-amber-700 flex-1">
                    You have {Object.keys(pending).length} unsaved change{Object.keys(pending).length !== 1 ? 's' : ''}
                  </p>
                  <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2 h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white">
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save Now
                  </Button>
                </div>
              )}

              {/* Setting sections by category */}
              {grouped.map(({ category, settings: catSettings }) => (
                <SettingsSection
                  key={category.key}
                  category={category}
                  settings={catSettings}
                  pending={pending}
                  onChange={handleChange}
                />
              ))}

              {/* Password change */}
              <PasswordChangeCard />

              {/* Info note */}
              <div className="rounded-xl border border-[hsl(140_20%_88%)] bg-[hsl(142_30%_97%)] px-4 py-3">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Note:</strong> Settings are stored in the database and used throughout the portal.
                  The Hijri offset adjusts how Hijri dates are displayed (positive = add days, negative = subtract).
                  Password changes take effect immediately for the current session.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Settings;

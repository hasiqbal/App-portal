import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Send, Clock, CheckCircle2, XCircle, RefreshCw, Trash2,
  Users, Image as ImageIcon, Link2, ChevronDown, ChevronUp,
  AlertCircle, Smartphone, Megaphone, Search, Filter, Upload, X,
  RotateCcw, Bookmark, BookmarkCheck, Calendar, Tag, LayoutGrid,
  Layers, ChevronRight, Star, Moon, Zap, Heart, Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import Sidebar from '@/components/layout/Sidebar';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PushNotification {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  link_url: string | null;
  audience: string;
  category: string;
  status: 'draft' | 'sent' | 'failed' | 'scheduled';
  sent_at: string | null;
  scheduled_for: string | null;
  recipient_count: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface Template {
  id: string;
  label: string;
  icon: string;
  category: string;
  title: string;
  body: string;
  builtIn?: boolean;
}

interface ComposeData {
  title: string;
  body: string;
  imageUrl: string;
  linkUrl: string;
  audience: string;
  category: string;
  scheduledFor: string;
  scheduleEnabled: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AUDIENCE_OPTIONS = [
  { value: 'all',    label: 'All Users',    desc: 'Every registered device' },
  { value: 'active', label: 'Active Users', desc: 'Active in last 30 days' },
  { value: 'new',    label: 'New Users',    desc: 'Joined in last 7 days' },
];

const CATEGORIES = [
  { value: 'prayer',      label: 'Prayer',      color: 'bg-emerald-100 text-emerald-700 border-emerald-200',  dot: 'bg-emerald-500' },
  { value: 'event',       label: 'Event',       color: 'bg-blue-100 text-blue-700 border-blue-200',           dot: 'bg-blue-500'    },
  { value: 'general',     label: 'General',     color: 'bg-gray-100 text-gray-600 border-gray-200',           dot: 'bg-gray-400'    },
  { value: 'ramadan',     label: 'Ramadan',     color: 'bg-violet-100 text-violet-700 border-violet-200',     dot: 'bg-violet-500'  },
  { value: 'eid',         label: 'Eid',         color: 'bg-amber-100 text-amber-700 border-amber-200',        dot: 'bg-amber-500'   },
  { value: 'fundraising', label: 'Fundraising', color: 'bg-rose-100 text-rose-700 border-rose-200',           dot: 'bg-rose-500'    },
];

const BUILT_IN_TEMPLATES: Template[] = [
  {
    id: 'bt-jummah', label: "Jumu'ah Reminder", icon: '🕌', category: 'prayer', builtIn: true,
    title: "Jumu'ah Mubarak — Friday Prayer Today",
    body: "Join us for Jumu'ah Salah today. First khutbah at 1:00 PM, second at 1:15 PM. Doors open at 12:45 PM. Please arrive early. Jazakallah khayran.",
  },
  {
    id: 'bt-eid-fitr', label: 'Eid ul-Fitr', icon: '🌙', category: 'eid', builtIn: true,
    title: 'Eid Mubarak — Eid ul-Fitr Salah',
    body: 'Taqabbal Allahu Minna wa Minkum. Eid ul-Fitr Salah will be held at 8:30 AM and 9:30 AM. Please bring your prayer mat. May Allah accept our fasts and prayers.',
  },
  {
    id: 'bt-eid-adha', label: 'Eid ul-Adha', icon: '🐑', category: 'eid', builtIn: true,
    title: 'Eid Mubarak — Eid ul-Adha Salah',
    body: 'Eid ul-Adha Salah will be held at 8:00 AM and 9:15 AM. May Allah accept your sacrifice and grant you all barakah on this blessed day.',
  },
  {
    id: 'bt-taraweeh', label: 'Taraweeh Start', icon: '⭐', category: 'ramadan', builtIn: true,
    title: 'Ramadan Mubarak — Taraweeh Begins Tonight',
    body: 'Taraweeh prayers begin tonight after Isha. Please join us for this blessed month. May Allah enable us to observe Ramadan with full iman and devotion.',
  },
  {
    id: 'bt-prayer-change', label: 'Prayer Time Change', icon: '🕐', category: 'prayer', builtIn: true,
    title: 'Prayer Time Update',
    body: 'Please note updated prayer jamaat times effective from this Sunday. Check the app for the latest schedule. Jazakallah khayran for your patience.',
  },
  {
    id: 'bt-event', label: 'General Event', icon: '📅', category: 'event', builtIn: true,
    title: 'Upcoming Event at Jami Masjid Noorani',
    body: 'We have an important event coming up at the masjid. Please share this with family and friends. More details available at the masjid notice board.',
  },
];

const statusConfig: Record<string, { label: string; icon: React.ReactNode; class: string; dot: string }> = {
  sent:      { label: 'Sent',      icon: <CheckCircle2 size={11} />, class: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  failed:    { label: 'Failed',    icon: <XCircle size={11} />,      class: 'bg-red-100 text-red-700 border-red-200',             dot: 'bg-red-500'    },
  draft:     { label: 'Draft',     icon: <Clock size={11} />,         class: 'bg-gray-100 text-gray-600 border-gray-200',          dot: 'bg-gray-400'   },
  scheduled: { label: 'Scheduled', icon: <Calendar size={11} />,      class: 'bg-blue-100 text-blue-700 border-blue-200',          dot: 'bg-blue-500'   },
};

const EMPTY_COMPOSE: ComposeData = {
  title: '', body: '', imageUrl: '', linkUrl: '',
  audience: 'all', category: 'general', scheduledFor: '', scheduleEnabled: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getCategoryMeta(value: string) {
  return CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[2];
}

// ─── Image Gallery Modal ──────────────────────────────────────────────────────

interface GalleryImage { name: string; url: string; path: string; }

const ImageGalleryModal = ({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) => {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.storage.from('adhkar-images').list('notifications', {
        limit: 100, sortBy: { column: 'created_at', order: 'desc' },
      });
      if (data) {
        const imgs = data
          .filter((f) => f.name !== '.emptyFolderPlaceholder' && f.metadata)
          .map((f) => {
            const path = `notifications/${f.name}`;
            const { data: u } = supabase.storage.from('adhkar-images').getPublicUrl(path);
            return { name: f.name, url: u.publicUrl, path };
          });
        setImages(imgs);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-bold text-foreground">Image Gallery</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{images.length} images · select to use</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={15} className="text-muted-foreground" />
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
              <RefreshCw size={16} className="animate-spin" /> Loading gallery…
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <ImageIcon size={32} className="opacity-20" />
              <p className="text-sm">No images uploaded yet. Upload one from the compose form.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {images.map((img) => (
                <button
                  key={img.path}
                  type="button"
                  onClick={() => setSelected(img.url)}
                  className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                    selected === img.url
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                  {selected === img.url && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                      <CheckCircle2 size={24} className="text-white drop-shadow" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-muted-foreground">{selected ? 'Image selected' : 'Click an image to select it'}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!selected} onClick={() => { if (selected) { onSelect(selected); onClose(); } }}>
              Use Image
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Templates Panel ──────────────────────────────────────────────────────────

const TemplatesPanel = ({
  onUse,
  savedTemplates,
  onDelete,
}: {
  onUse: (t: Template) => void;
  savedTemplates: Template[];
  onDelete: (id: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const allTemplates = [...BUILT_IN_TEMPLATES, ...savedTemplates];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 border-b border-border flex items-center justify-between text-left hover:bg-muted/20 transition-colors"
        style={{ background: expanded ? 'hsl(var(--primary) / 0.04)' : undefined }}
      >
        <div className="flex items-center gap-2">
          <Bookmark size={14} style={{ color: 'hsl(var(--primary))' }} />
          <span className="text-sm font-bold text-foreground">Templates</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
            {allTemplates.length}
          </span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="divide-y divide-border/60">
          {allTemplates.map((t) => {
            const cat = getCategoryMeta(t.category);
            return (
              <div key={t.id} className="px-4 py-3 flex items-start gap-3 hover:bg-muted/10 transition-colors group">
                <span className="text-xl mt-0.5 shrink-0">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <p className="text-xs font-semibold text-foreground leading-snug">{t.label}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${cat.color}`}>{cat.label}</span>
                    {t.builtIn && <span className="text-[9px] text-muted-foreground">Built-in</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{t.body}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!t.builtIn && (
                    <button
                      onClick={() => onDelete(t.id)}
                      className="p-1 rounded hover:bg-destructive/10 transition-colors"
                      title="Delete template"
                    >
                      <Trash2 size={11} className="text-destructive/60" />
                    </button>
                  )}
                  <button
                    onClick={() => onUse(t)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors"
                    style={{ background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
                  >
                    Use <ChevronRight size={9} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Compose Panel ────────────────────────────────────────────────────────────

const ComposePanel = ({
  initialData,
  onSent,
  onSaveTemplate,
}: {
  initialData?: Partial<ComposeData>;
  onSent: (notif: PushNotification) => void;
  onSaveTemplate: (t: Omit<Template, 'id'>) => void;
}) => {
  const [form, setForm] = useState<ComposeData>({ ...EMPTY_COMPOSE, ...initialData });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialData) {
      setForm((f) => ({ ...f, ...initialData }));
      if (initialData.imageUrl || initialData.linkUrl) setShowAdvanced(true);
    }
  }, [initialData]);

  const set = useCallback(<K extends keyof ComposeData>(k: K, v: ComposeData[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  }, []);

  const isValid = form.title.trim().length > 0 && form.body.trim().length > 0;
  const titleRemaining = 65 - form.title.length;
  const bodyRemaining = 240 - form.body.length;

  const handleImageUpload = async (file: File) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) { toast.error('Only JPG, PNG, WebP, and GIF are supported.'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10 MB.'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `notifications/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('adhkar-images').upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: u } = supabase.storage.from('adhkar-images').getPublicUrl(path);
      set('imageUrl', u.publicUrl);
      setShowAdvanced(true);
      toast.success('Image uploaded.');
    } catch (e) {
      toast.error(`Upload failed: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const buildPayload = () => ({
    title: form.title.trim(),
    body: form.body.trim(),
    image_url: form.imageUrl.trim() || null,
    link_url: form.linkUrl.trim() || null,
    audience: form.audience,
    category: form.category,
  });

  const saveToDb = async (status: PushNotification['status'], extra?: Record<string, unknown>) => {
    const { data, error } = await supabase.from('push_notifications').insert({
      ...buildPayload(), status,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      scheduled_for: (form.scheduleEnabled && form.scheduledFor) ? new Date(form.scheduledFor).toISOString() : null,
      recipient_count: status === 'sent' ? 0 : null,
      ...extra,
    }).select().single();
    if (error) throw error;
    return data as PushNotification;
  };

  const handleSend = async () => {
    if (!isValid) return;
    setSending(true);
    try {
      if (form.scheduleEnabled && form.scheduledFor) {
        const saved = await saveToDb('scheduled');
        onSent(saved);
        toast.success('Notification scheduled. It will be sent when OneSignal is connected and the time arrives.');
      } else {
        await new Promise((r) => setTimeout(r, 600));
        const saved = await saveToDb('sent');
        onSent(saved);
        toast.success('Notification sent! (OneSignal not yet connected — saved to history.)');
      }
      setForm(EMPTY_COMPOSE);
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!isValid) return;
    setSavingDraft(true);
    try {
      const saved = await saveToDb('draft');
      onSent(saved);
      toast.success('Draft saved.');
      setForm(EMPTY_COMPOSE);
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSaveTemplate = () => {
    if (!isValid) return;
    const cat = getCategoryMeta(form.category);
    onSaveTemplate({
      label: form.title.slice(0, 40),
      icon: '💬',
      category: form.category,
      title: form.title.trim(),
      body: form.body.trim(),
    });
    toast.success('Template saved.');
  };

  const catMeta = getCategoryMeta(form.category);

  return (
    <>
      {showGallery && (
        <ImageGalleryModal
          onSelect={(url) => { set('imageUrl', url); setShowAdvanced(true); }}
          onClose={() => setShowGallery(false)}
        />
      )}

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center gap-3"
          style={{ background: 'hsl(var(--primary) / 0.06)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'hsl(var(--primary))' }}>
            <Bell size={17} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Compose Notification</h2>
            <p className="text-xs text-muted-foreground">Delivered to app users when OneSignal is connected.</p>
          </div>
        </div>

        {/* OneSignal banner */}
        <div className="mx-6 mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-800">OneSignal not yet connected</p>
            <p className="text-xs text-amber-700 mt-0.5">Notifications save to history but won't deliver until credentials are configured. See Setup Guide.</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Category */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Tag size={12} /> Category</Label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => set('category', cat.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    form.category === cat.value ? cat.color + ' shadow-sm' : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="notif-title">Title <span className="text-destructive">*</span></Label>
              <span className={`text-[11px] tabular-nums ${titleRemaining < 10 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                {titleRemaining} left
              </span>
            </div>
            <Input
              id="notif-title"
              value={form.title}
              onChange={(e) => set('title', e.target.value.slice(0, 65))}
              placeholder="e.g. Jumu'ah Reminder — Friday Prayer"
              className="text-sm"
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="notif-body">Message <span className="text-destructive">*</span></Label>
              <span className={`text-[11px] tabular-nums ${bodyRemaining < 20 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                {bodyRemaining} left
              </span>
            </div>
            <Textarea
              id="notif-body"
              value={form.body}
              onChange={(e) => set('body', e.target.value.slice(0, 240))}
              placeholder="e.g. Join us for Jumu'ah Salah at 1:15 PM. Doors open at 12:45 PM."
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          {/* Audience */}
          <div className="space-y-2">
            <Label>Audience</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {AUDIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('audience', opt.value)}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-all ${
                    form.audience === opt.value
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  <p className={`text-xs font-semibold ${form.audience === opt.value ? 'text-primary' : 'text-foreground'}`}>{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Advanced options (image, link, schedule)
          </button>

          {showAdvanced && (
            <div className="space-y-4 pl-4 border-l-2 border-border">
              {/* Image */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><ImageIcon size={12} /> Image <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <div className="flex gap-2">
                  <Input
                    value={form.imageUrl}
                    onChange={(e) => set('imageUrl', e.target.value)}
                    placeholder="https://…/image.jpg"
                    className="text-sm flex-1"
                  />
                  {form.imageUrl && (
                    <button type="button" onClick={() => set('imageUrl', '')} className="px-2 rounded-md border border-input hover:bg-destructive/10 transition-colors shrink-0" title="Remove">
                      <X size={14} className="text-destructive/70" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowGallery(true)}
                    className="flex items-center gap-1.5 px-3 h-9 rounded-md border border-input bg-background hover:bg-muted transition-colors text-xs font-medium shrink-0"
                    title="Select from gallery"
                  >
                    <LayoutGrid size={12} /> Gallery
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 h-9 rounded-md border border-input bg-background hover:bg-muted transition-colors text-xs font-medium shrink-0 disabled:opacity-60"
                    title="Upload from device"
                  >
                    {uploading ? <><RefreshCw size={12} className="animate-spin" /> …</> : <><Upload size={12} /> Upload</>}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
                </div>
                {form.imageUrl && (
                  <div className="flex items-center gap-2 mt-1.5 px-2 py-1.5 rounded-lg border border-border bg-muted/30">
                    <img src={form.imageUrl} alt="" className="w-10 h-10 rounded object-cover border border-border shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <p className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">{form.imageUrl}</p>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">Upload, browse gallery, or paste a URL. Recommended: 1440×720px.</p>
              </div>

              {/* Link */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Link2 size={12} /> Deep Link / URL <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Input
                  value={form.linkUrl}
                  onChange={(e) => set('linkUrl', e.target.value)}
                  placeholder="https://example.com or myapp://screen"
                  className="text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Opens when the user taps the notification.</p>
              </div>

              {/* Scheduled send */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => set('scheduleEnabled', !form.scheduleEnabled)}
                    className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${form.scheduleEnabled ? 'bg-primary' : 'bg-border'}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${form.scheduleEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                  <Label className="flex items-center gap-1.5 cursor-pointer" onClick={() => set('scheduleEnabled', !form.scheduleEnabled)}>
                    <Calendar size={12} /> Schedule for later
                  </Label>
                </div>
                {form.scheduleEnabled && (
                  <Input
                    type="datetime-local"
                    value={form.scheduledFor}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={(e) => set('scheduledFor', e.target.value)}
                    className="text-sm"
                  />
                )}
              </div>
            </div>
          )}

          {/* Preview */}
          {(form.title || form.body) && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
                <Smartphone size={12} className="text-muted-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Preview</span>
                <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${catMeta.color}`}>{catMeta.label}</span>
              </div>
              <div className="px-4 py-3 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-primary/10">
                  <span className="text-lg">🕌</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground leading-snug">{form.title || 'Notification title'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{form.body || 'Notification body will appear here.'}</p>
                  {form.scheduleEnabled && form.scheduledFor && (
                    <p className="text-[10px] text-blue-600 mt-1 flex items-center gap-1">
                      <Calendar size={9} /> Scheduled for {new Date(form.scheduledFor).toLocaleString()}
                    </p>
                  )}
                </div>
                {form.imageUrl && (
                  <div className="w-12 h-12 rounded-lg border border-border overflow-hidden shrink-0 bg-muted">
                    <img src={form.imageUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={!isValid || savingDraft || sending} className="gap-2">
                {savingDraft ? <RefreshCw size={13} className="animate-spin" /> : <Clock size={13} />} Save Draft
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSaveTemplate} disabled={!isValid} className="gap-2 text-muted-foreground text-xs">
                <BookmarkCheck size={12} /> Save as Template
              </Button>
            </div>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!isValid || sending || savingDraft || (form.scheduleEnabled && !form.scheduledFor)}
              className="gap-2 px-5"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
            >
              {sending
                ? <><RefreshCw size={13} className="animate-spin" /> Sending…</>
                : form.scheduleEnabled
                ? <><Calendar size={13} /> Schedule</>
                : <><Send size={13} /> Send Notification</>}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

// ─── History Row ─────────────────────────────────────────────────────────────

const HistoryRow = ({
  notif,
  onDelete,
  onResend,
}: {
  notif: PushNotification;
  onDelete: (id: string) => void;
  onResend: (notif: PushNotification) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[notif.status] ?? statusConfig.draft;
  const cat = getCategoryMeta(notif.category ?? 'general');

  return (
    <div className="border-b border-border/60 last:border-0">
      <div
        className="px-4 py-3.5 flex items-start gap-3 hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <p className="text-sm font-semibold text-foreground leading-snug truncate max-w-xs">{notif.title}</p>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${cat.color}`}>{cat.label}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">{notif.body}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.class}`}>
                {cfg.icon} {cfg.label}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                {notif.status === 'scheduled' && notif.scheduled_for
                  ? new Date(notif.scheduled_for).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                  : timeAgo(notif.sent_at ?? notif.created_at)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Users size={10} /> {AUDIENCE_OPTIONS.find((o) => o.value === notif.audience)?.label ?? notif.audience}
            </span>
            {notif.status === 'sent' && notif.recipient_count !== null && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Smartphone size={10} /> {notif.recipient_count.toLocaleString()} device{notif.recipient_count !== 1 ? 's' : ''}
              </span>
            )}
            {notif.image_url && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><ImageIcon size={10} /> image</span>}
            {notif.link_url && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Link2 size={10} /> link</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onResend(notif)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors hover:bg-primary/10"
            style={{ color: 'hsl(var(--primary))' }}
            title={notif.status === 'draft' ? 'Continue editing' : 'Resend / edit'}
          >
            <RotateCcw size={11} />
            {notif.status === 'draft' ? 'Edit' : 'Resend'}
          </button>
          <button onClick={() => onDelete(notif.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors" title="Delete">
            <Trash2 size={13} className="text-destructive/60 hover:text-destructive" />
          </button>
          {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-7 pb-4">
          <div className="rounded-xl border border-border overflow-hidden text-xs">
            <div className="px-4 py-2 bg-muted/30 border-b border-border">
              <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Full details</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {[
                { label: 'Title',     value: notif.title },
                { label: 'Message',   value: notif.body  },
                { label: 'Audience',  value: AUDIENCE_OPTIONS.find((o) => o.value === notif.audience)?.label ?? notif.audience },
                { label: 'Category',  value: getCategoryMeta(notif.category ?? 'general').label },
                ...(notif.scheduled_for ? [{ label: 'Scheduled', value: new Date(notif.scheduled_for).toLocaleString() }] : []),
                ...(notif.sent_at ? [{ label: 'Sent at', value: new Date(notif.sent_at).toLocaleString() }] : []),
                { label: 'Created',   value: new Date(notif.created_at).toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-3">
                  <span className="text-muted-foreground w-20 shrink-0">{label}</span>
                  <span className="text-foreground leading-relaxed">{value}</span>
                </div>
              ))}
              {notif.image_url && (
                <div className="flex gap-3">
                  <span className="text-muted-foreground w-20 shrink-0">Image</span>
                  <div className="flex items-start gap-2">
                    <img src={notif.image_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-border" />
                    <a href={notif.image_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all text-[10px] mt-1">{notif.image_url}</a>
                  </div>
                </div>
              )}
              {notif.link_url && (
                <div className="flex gap-3">
                  <span className="text-muted-foreground w-20 shrink-0">Link</span>
                  <a href={notif.link_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{notif.link_url}</a>
                </div>
              )}
              {notif.error_message && (
                <div className="flex gap-3">
                  <span className="text-muted-foreground w-20 shrink-0">Error</span>
                  <span className="text-destructive">{notif.error_message}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Stats Cards ─────────────────────────────────────────────────────────────

const StatsRow = ({ notifications }: { notifications: PushNotification[] }) => {
  const sent = notifications.filter((n) => n.status === 'sent').length;
  const scheduled = notifications.filter((n) => n.status === 'scheduled').length;
  const drafts = notifications.filter((n) => n.status === 'draft').length;
  const totalDevices = notifications.reduce((acc, n) => acc + (n.recipient_count ?? 0), 0);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[
        { label: 'Total Sent',      value: sent,                     icon: <Send size={14} />,       accent: 'hsl(var(--primary))' },
        { label: 'Devices Reached', value: totalDevices.toLocaleString(), icon: <Smartphone size={14} />, accent: '#0ea5e9'         },
        { label: 'Drafts',          value: drafts,                   icon: <Clock size={14} />,      accent: '#f59e0b'             },
        { label: 'Scheduled',       value: scheduled,                icon: <Calendar size={14} />,   accent: '#6366f1'             },
      ].map((card) => (
        <div key={card.label} className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${card.accent}18`, color: card.accent }}>
            {card.icon}
          </div>
          <div>
            <p className="text-lg font-bold text-foreground leading-none">{card.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Setup Guide ─────────────────────────────────────────────────────────────

const SetupGuide = () => (
  <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
    <div className="px-5 py-4 border-b border-border" style={{ background: 'hsl(var(--primary) / 0.04)' }}>
      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
        <Megaphone size={15} style={{ color: 'hsl(var(--primary))' }} />
        Setup Guide — OneSignal
      </h3>
      <p className="text-xs text-muted-foreground mt-0.5">Steps to enable live push delivery</p>
    </div>
    <div className="px-5 py-4 space-y-4">
      {[
        { step: '1', title: 'Create a free OneSignal account', desc: 'Go to onesignal.com → New App → configure Android/iOS platform.' },
        { step: '2', title: 'Get App ID & REST API Key',       desc: 'OneSignal Dashboard → Settings → Keys & IDs. Copy both values.' },
        { step: '3', title: 'Add credentials to portal',       desc: 'Add ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY as Edge Function secrets.' },
        { step: '4', title: 'Integrate SDK in mobile app',     desc: 'Install the OneSignal SDK in the mobile app — ~15 minutes. Device tokens register automatically.' },
        { step: '5', title: "You're live!",                    desc: 'Notifications will be delivered instantly to all registered devices.' },
      ].map((item) => (
        <div key={item.step} className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5"
            style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}>
            {item.step}
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">{item.title}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

const SAVED_TEMPLATES_KEY = 'notif_saved_templates';

const Notifications = () => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [composeData, setComposeData] = useState<Partial<ComposeData> | undefined>(undefined);
  const [savedTemplates, setSavedTemplates] = useState<Template[]>(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_TEMPLATES_KEY) ?? '[]'); } catch { return []; }
  });
  const queryClient = useQueryClient();

  const { data: notifications = [], isFetching, refetch } = useQuery({
    queryKey: ['push-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase.from('push_notifications').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as PushNotification[];
    },
  });

  const handleSent = (notif: PushNotification) => {
    queryClient.setQueryData<PushNotification[]>(['push-notifications'], (old = []) => [notif, ...old]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this notification from history?')) return;
    queryClient.setQueryData<PushNotification[]>(['push-notifications'], (old = []) => old.filter((n) => n.id !== id));
    const { error } = await supabase.from('push_notifications').delete().eq('id', id);
    if (error) { toast.error('Failed to delete.'); refetch(); }
    else toast.success('Deleted from history.');
  };

  const handleResend = (notif: PushNotification) => {
    setComposeData({
      title: notif.title,
      body: notif.body,
      imageUrl: notif.image_url ?? '',
      linkUrl: notif.link_url ?? '',
      audience: notif.audience,
      category: notif.category ?? 'general',
      scheduleEnabled: false,
      scheduledFor: '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.info('Notification loaded into compose form.');
  };

  const handleUseTemplate = (t: Template) => {
    setComposeData({ title: t.title, body: t.body, category: t.category });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.info(`Template "${t.label}" loaded.`);
  };

  const handleSaveTemplate = (t: Omit<Template, 'id'>) => {
    const newT: Template = { ...t, id: `saved-${Date.now()}` };
    const updated = [newT, ...savedTemplates];
    setSavedTemplates(updated);
    localStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(updated));
  };

  const handleDeleteTemplate = (id: string) => {
    const updated = savedTemplates.filter((t) => t.id !== id);
    setSavedTemplates(updated);
    localStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(updated));
    toast.success('Template removed.');
  };

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      const matchStatus = statusFilter === 'all' || n.status === statusFilter;
      const matchCat = categoryFilter === 'all' || (n.category ?? 'general') === categoryFilter;
      const q = search.toLowerCase();
      const matchSearch = !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
      return matchStatus && matchCat && matchSearch;
    });
  }, [notifications, statusFilter, categoryFilter, search]);

  // Category breakdown for history header
  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    notifications.forEach((n) => { const c = n.category ?? 'general'; counts[c] = (counts[c] ?? 0) + 1; });
    return counts;
  }, [notifications]);

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <Sidebar />

      <main className="flex-1 p-4 sm:p-8 overflow-x-auto pt-[4.5rem] md:pt-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>Push Notifications</h1>
            <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Compose, schedule and track notifications to all app users · {notifications.length} in history
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2 self-start">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="mb-6">
          <StatsRow notifications={notifications} />
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
          {/* Left */}
          <div className="space-y-6 min-w-0">
            <ComposePanel
              key={JSON.stringify(composeData)}
              initialData={composeData}
              onSent={handleSent}
              onSaveTemplate={handleSaveTemplate}
            />

            {/* History */}
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Layers size={14} style={{ color: 'hsl(var(--primary))' }} />
                    Notification History
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{notifications.length}</span>
                  </h3>
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-7 h-8 text-xs w-36" />
                  </div>
                </div>

                {/* Status filter */}
                <div className="flex items-center gap-1 flex-wrap mb-2">
                  <Filter size={11} className="text-muted-foreground mr-0.5" />
                  {(['all', 'sent', 'scheduled', 'draft', 'failed'] as const).map((f) => {
                    const count = f === 'all' ? notifications.length : notifications.filter((n) => n.status === f).length;
                    return (
                      <button
                        key={f}
                        onClick={() => setStatusFilter(f)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                          statusFilter === f ? 'border-primary bg-primary/8 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Category filter */}
                <div className="flex items-center gap-1 flex-wrap">
                  <Tag size={11} className="text-muted-foreground mr-0.5" />
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${categoryFilter === 'all' ? 'border-primary bg-primary/8 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted'}`}
                  >
                    All categories
                  </button>
                  {CATEGORIES.filter((c) => (catCounts[c.value] ?? 0) > 0).map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setCategoryFilter(c.value)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${categoryFilter === c.value ? c.color + ' shadow-sm' : 'border-border bg-background text-muted-foreground hover:bg-muted'}`}
                    >
                      {c.label} ({catCounts[c.value] ?? 0})
                    </button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Bell size={32} className="opacity-20" />
                  <p className="text-sm">
                    {notifications.length === 0
                      ? 'No notifications yet. Compose your first one above.'
                      : 'No results match your filter.'}
                  </p>
                </div>
              ) : (
                <div>
                  {filtered.map((notif) => (
                    <HistoryRow key={notif.id} notif={notif} onDelete={handleDelete} onResend={handleResend} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-5">
            <TemplatesPanel
              onUse={handleUseTemplate}
              savedTemplates={savedTemplates}
              onDelete={handleDeleteTemplate}
            />
            <SetupGuide />

            {/* Writing tips */}
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">Writing Tips</h3>
              </div>
              <div className="px-5 py-4 space-y-3">
                {[
                  { icon: '✍️', tip: "Keep titles under 50 characters — they get truncated on lock screens." },
                  { icon: '📢', tip: "Lead with the most important info in the first sentence." },
                  { icon: '⏰', tip: "Send Jumu'ah and Taraweeh notices at least 2 hours early." },
                  { icon: '🌙', tip: "Avoid sending between 10pm and 6am to respect quiet hours." },
                  { icon: '🖼️', tip: "Rich images (1440×720px) significantly increase tap-through rates." },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.tip}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Notifications;

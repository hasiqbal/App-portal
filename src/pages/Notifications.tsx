import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Send, Clock, CheckCircle2, XCircle, RefreshCw, Trash2,
  Users, Image as ImageIcon, Link2, ChevronDown, ChevronUp,
  Smartphone, Megaphone, Search, Filter, Upload, X,
  RotateCcw, Bookmark, Calendar, Tag, LayoutGrid,
  Layers, ChevronRight, Code2, Copy, CircleAlert, Eye,
  Sparkles,
} from 'lucide-react';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Textarea } from '#/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs';
import Sidebar from '#/components/layout/Sidebar';
import { invokeExternalFunction, onspaceCloud, supabase } from '#/lib/supabase';
import { toast } from 'sonner';
import { useUrduTranslation } from '#/hooks/useUrduTranslation';
import { usePermissions } from '#/hooks/usePermissions';
import { notificationAutomationService } from '#/services/notificationService';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface PushNotification {
  id: string;
  title: string;
  body: string;
  urdu_body?: string | null;
  image_url: string | null;
  link_url: string | null;
  payload_json?: Record<string, unknown> | null;
  format_version?: string | null;
  cta_label?: string | null;
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

interface DeviceToken {
  id: string;
  token: string;
  platform: string;
  app_version: string | null;
  device_model: string | null;
  is_active: boolean;
  registered_at: string;
  last_active: string;
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
  urduBody: string;
  imageUrl: string;
  linkUrl: string;
  audience: string;
  category: string;
  scheduledFor: string;
  scheduleEnabled: boolean;
}

interface NotificationAutomation {
  id: string;
  name: string;
  enabled: boolean;
  schedule_type: 'one_time' | 'daily' | 'weekly' | 'prayer';
  schedule_timezone: string;
  one_time_at: string | null;
  next_run_at: string | null;
  recurrence_days: number[];
  prayer_names: string[];
  title: string;
  body: string;
  urdu_body: string | null;
  image_url: string | null;
  link_url: string | null;
  cta_label: string | null;
  audience: string;
  category: string;
  run_count: number;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface NotificationAutomationEvent {
  id: string;
  automation_id: string | null;
  notification_id: string | null;
  scheduled_for: string | null;
  processed_at: string | null;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  recipient_count: number | null;
  error_message: string | null;
  payload_json: Record<string, unknown>;
  created_at: string;
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const PRAYER_OPTIONS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

const BUILT_IN_TEMPLATES: Template[] = [
  {
    id: 'bt-jummah', label: "Jumu'ah Reminder", icon: 'JM', category: 'prayer', builtIn: true,
    title: "Jumu'ah Mubarak - Friday Prayer Today",
    body: "Join us for Jumu'ah Salah today. First khutbah at 1:00 PM, second at 1:15 PM. Doors open at 12:45 PM. Please arrive early. Jazakallah khayran.",
  },
  {
    id: 'bt-eid-fitr', label: 'Eid ul-Fitr', icon: 'EF', category: 'eid', builtIn: true,
    title: 'Eid Mubarak - Eid ul-Fitr Salah',
    body: 'Taqabbal Allahu Minna wa Minkum. Eid ul-Fitr Salah will be held at 8:30 AM and 9:30 AM. Please bring your prayer mat. May Allah accept our fasts and prayers.',
  },
  {
    id: 'bt-eid-adha', label: 'Eid ul-Adha', icon: 'EA', category: 'eid', builtIn: true,
    title: 'Eid Mubarak - Eid ul-Adha Salah',
    body: 'Eid ul-Adha Salah will be held at 8:00 AM and 9:15 AM. May Allah accept your sacrifice and grant you all barakah on this blessed day.',
  },
  {
    id: 'bt-taraweeh', label: 'Taraweeh Start', icon: 'TR', category: 'ramadan', builtIn: true,
    title: 'Ramadan Mubarak - Taraweeh Begins Tonight',
    body: 'Taraweeh prayers begin tonight after Isha. Please join us for this blessed month. May Allah enable us to observe Ramadan with full iman and devotion.',
  },
  {
    id: 'bt-prayer-change', label: 'Prayer Time Change', icon: 'PT', category: 'prayer', builtIn: true,
    title: 'Prayer Time Update',
    body: 'Please note updated prayer jamaat times effective from this Sunday. Check the app for the latest schedule. Jazakallah khayran for your patience.',
  },
  {
    id: 'bt-event', label: 'General Event', icon: 'GE', category: 'event', builtIn: true,
    title: 'Upcoming Event at Jami Masjid Noorani',
    body: 'We have an important event coming up at the masjid. Please share this with family and friends. More details available at the masjid notice board.',
  },
];

const statusConfig: Record<string, { label: string; icon: React.ReactNode; class: string; dot: string }> = {
  sent:      { label: 'Sent',      icon: <CheckCircle2 size={11} />, class: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  failed:    { label: 'Failed',    icon: <XCircle size={11} />,      class: 'bg-red-100 text-red-700 border-red-200',             dot: 'bg-red-500'    },
  draft:     { label: 'Draft',     icon: <Clock size={11} />,        class: 'bg-gray-100 text-gray-600 border-gray-200',          dot: 'bg-gray-400'   },
  scheduled: { label: 'Scheduled', icon: <Calendar size={11} />,     class: 'bg-blue-100 text-blue-700 border-blue-200',          dot: 'bg-blue-500'   },
};

const automationEventStatusStyles: Record<NotificationAutomationEvent['status'], string> = {
  sent: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  queued: 'bg-blue-100 text-blue-700 border-blue-200',
  skipped: 'bg-amber-100 text-amber-700 border-amber-200',
};

const EMPTY_COMPOSE: ComposeData = {
  title: '', body: '', urduBody: '', imageUrl: '', linkUrl: '',
  audience: 'all', category: 'general', scheduledFor: '', scheduleEnabled: false,
};

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Unexpected network error. Please refresh and try again.';
}

function buildNextRunAt(
  scheduleType: NotificationAutomation['schedule_type'],
  oneTimeAt: string,
  scheduleTime: string,
  recurrenceDays: number[],
): string | null {
  const now = new Date();

  if (scheduleType === 'one_time') {
    if (!oneTimeAt) return null;
    const parsed = new Date(oneTimeAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }

  if (scheduleType === 'prayer') {
    return null;
  }

  const [hRaw, mRaw] = scheduleTime.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;

  if (scheduleType === 'daily') {
    const candidate = new Date(now);
    candidate.setHours(h, m, 0, 0);
    if (candidate <= now) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.toISOString();
  }

  const selectedDays = recurrenceDays.length > 0 ? recurrenceDays : [now.getDay()];
  for (let step = 0; step < 14; step += 1) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + step);
    candidate.setHours(h, m, 0, 0);
    if (selectedDays.includes(candidate.getDay()) && candidate > now) {
      return candidate.toISOString();
    }
  }

  return null;
}

type AutomationDraft = {
  id?: string;
  name: string;
  enabled: boolean;
  scheduleType: NotificationAutomation['schedule_type'];
  oneTimeAt: string;
  scheduleTime: string;
  recurrenceDays: number[];
  prayerNames: string[];
  title: string;
  body: string;
  urduBody: string;
  audience: string;
  category: string;
};

const EMPTY_AUTOMATION_DRAFT: AutomationDraft = {
  name: '',
  enabled: true,
  scheduleType: 'daily',
  oneTimeAt: '',
  scheduleTime: '13:00',
  recurrenceDays: [5],
  prayerNames: ['dhuhr'],
  title: '',
  body: '',
  urduBody: '',
  audience: 'all',
  category: 'general',
};

// â”€â”€â”€ Urdu Auto-Translate Button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const UrduAutoTranslateBtn = ({ sourceText, onResult }: { sourceText: string; onResult: (v: string) => void }) => {
  const { translateToUrdu, translating } = useUrduTranslation();

  const handleClick = async () => {
    if (!sourceText.trim()) { toast.error('No English text to translate.'); return; }
    const urdu = await translateToUrdu(sourceText.trim());
    if (!urdu) return;
    onResult(urdu);
    toast.success('Urdu translation generated.');
  };

  return (
    <button type="button" disabled={translating} onClick={handleClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-violet-300 text-violet-700 text-[11px] font-semibold hover:bg-violet-50 disabled:opacity-50 transition-colors">
      {translating ? <><RefreshCw size={11} className="animate-spin" /> Translating...</> : <>Auto-translate</>}
    </button>
  );
};

// â”€â”€â”€ Image Gallery Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface GalleryImage { name: string; url: string; path: string; }

const ImageGalleryModal = ({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) => {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await onspaceCloud.storage.from('adhkar-images').list('notifications', {
        limit: 100, sortBy: { column: 'created_at', order: 'desc' },
      });
      if (data) {
        const imgs = data
          .filter((f) => f.name !== '.emptyFolderPlaceholder' && f.metadata)
          .map((f) => {
            const path = `notifications/${f.name}`;
            const { data: u } = onspaceCloud.storage.from('adhkar-images').getPublicUrl(path);
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
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-bold text-foreground">Image Gallery</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{images.length} images - select to use</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={15} className="text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
              <RefreshCw size={16} className="animate-spin" /> Loading gallery...
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
                    selected === img.url ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
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

// â”€â”€â”€ Templates Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TemplatesPanel = ({
  onUse,
}: {
  onUse: (t: Template) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const allTemplates = BUILT_IN_TEMPLATES;

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

// â”€â”€â”€ Compose Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ComposePanel = ({
  initialData,
  onSent,
  onRefetchHistory,
}: {
  initialData?: Partial<ComposeData>;
  onSent: (notif: PushNotification) => void;
  onRefetchHistory: () => void;
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
      const { error } = await onspaceCloud.storage.from('adhkar-images').upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: u } = onspaceCloud.storage.from('adhkar-images').getPublicUrl(path);
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

  const buildDbPayload = () => ({
    title: form.title.trim(),
    body: form.body.trim(),
    urdu_body: form.urduBody.trim() || null,
    image_url: form.imageUrl.trim() || null,
    link_url: form.linkUrl.trim() || null,
    payload_json: {
      formatVersion: 'v1',
      hasImage: Boolean(form.imageUrl.trim()),
      hasUrl: Boolean(form.linkUrl.trim()),
      hasUrdu: Boolean(form.urduBody.trim()),
    },
    audience: form.audience,
    category: form.category,
  });

  const saveToDb = async (status: PushNotification['status'], extra?: Record<string, unknown>) => {
    const { data, error } = await supabase.from('push_notifications').insert({
      ...buildDbPayload(),
      status,
      sent_at: null,
      scheduled_for: (form.scheduleEnabled && form.scheduledFor) ? new Date(form.scheduledFor).toISOString() : null,
      recipient_count: null,
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
        // Save as scheduled â€” no immediate delivery
        const saved = await saveToDb('scheduled');
        onSent(saved);
        toast.success('Notification scheduled.');
        setForm(EMPTY_COMPOSE);
        return;
      }

      // 1. Insert the notification record as 'draft' to get an ID
      const draft = await saveToDb('draft');
      onSent(draft);

      // 2. Call the Edge Function to deliver via Expo
      const { data, error } = await invokeExternalFunction<{
        sent?: number;
        total?: number;
        errors?: string[];
      }>('send-notification-formatted', {
        notificationId: draft.id,
        title: form.title.trim(),
        body: form.body.trim(),
        urduBody: form.urduBody.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        linkUrl: form.linkUrl.trim() || undefined,
        audience: form.audience,
        category: form.category,
        formatVersion: 'v1',
      });

      if (error) {
        const errorMessage = typeof error === 'string' ? error : 'Unknown error';
        toast.error(`Send failed: ${errorMessage}`);
        // Mark as failed in DB
        await supabase.from('push_notifications').update({ status: 'failed', error_message: errorMessage }).eq('id', draft.id);
      } else {
        const sent: number = data?.sent ?? 0;
        const total: number = data?.total ?? 0;
        if (sent === 0 && total === 0) {
          toast.warning('Sent - but no registered devices found yet. Install the app and grant notification permission first.');
        } else if (sent === total) {
          toast.success(`Delivered to ${sent.toLocaleString()} device${sent !== 1 ? 's' : ''}.`);
        } else {
          toast.success(`Delivered to ${sent} of ${total} devices. Check history for details.`);
        }
        setForm(EMPTY_COMPOSE);
      }

      // 3. Refetch history to show updated recipient_count and status
      setTimeout(() => onRefetchHistory(), 800);

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
        <div className="px-6 py-4 border-b border-border flex items-center gap-3" style={{ background: 'hsl(var(--primary) / 0.06)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'hsl(var(--primary))' }}>
            <Bell size={17} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Compose Notification</h2>
            <p className="text-xs text-muted-foreground">Sent instantly via Expo Push to all registered devices.</p>
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
              placeholder="e.g. Jumu'ah Reminder - Friday Prayer"
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

          {/* Urdu body */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="notif-urdu-body" className="flex items-center gap-1.5">Urdu Message <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <UrduAutoTranslateBtn sourceText={form.body || form.title} onResult={(v) => set('urduBody', v)} />
            </div>
            <Textarea
              id="notif-urdu-body"
              value={form.urduBody}
              onChange={(e) => set('urduBody', e.target.value)}
              placeholder="Write Urdu message here..."
              dir="rtl"
              rows={2}
              className="text-sm resize-none text-right"
              style={{ fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif", lineHeight: '2.4' }}
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
                <div className="flex gap-2 flex-wrap">
                  <Input
                    value={form.imageUrl}
                    onChange={(e) => set('imageUrl', e.target.value)}
                    placeholder="https://.../image.jpg"
                    className="text-sm flex-1 min-w-0"
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
                  >
                    <LayoutGrid size={12} /> Gallery
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 h-9 rounded-md border border-input bg-background hover:bg-muted transition-colors text-xs font-medium shrink-0 disabled:opacity-60"
                  >
                    {uploading ? <><RefreshCw size={12} className="animate-spin" /> ...</> : <><Upload size={12} /> Upload</>}
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
                <p className="text-[11px] text-muted-foreground">Recommended: 1440x720px (2:1). Android shows banner; iOS shows thumbnail.</p>
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
                  <span className="text-[11px] font-bold">JM</span>
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
            </div>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!isValid || sending || savingDraft || (form.scheduleEnabled && !form.scheduledFor)}
              className="gap-2 px-5"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
            >
              {sending
                ? <><RefreshCw size={13} className="animate-spin" /> Sending...</>
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

// â”€â”€â”€ History Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const HistoryRow = ({
  notif,
  onDelete,
  onLoad,
  canDelete,
  canEdit,
}: {
  notif: PushNotification;
  onDelete: (id: string) => void;
  onLoad: (notif: PushNotification) => void;
  canDelete: boolean;
  canEdit: boolean;
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
              <span className={`flex items-center gap-1 text-[10px] font-semibold ${notif.recipient_count > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                <Smartphone size={10} />
                {notif.recipient_count > 0
                  ? `${notif.recipient_count.toLocaleString()} device${notif.recipient_count !== 1 ? 's' : ''} reached`
                  : 'No devices reached'}
              </span>
            )}
            {notif.image_url && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><ImageIcon size={10} /> image</span>}
            {notif.link_url && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Link2 size={10} /> link</span>}
          </div>
          {/* Error message inline */}
          {notif.error_message && (
            <p className="mt-1 text-[10px] text-red-500 leading-relaxed line-clamp-1" title={notif.error_message}>
              Warning: {notif.error_message}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onLoad(notif)}
            disabled={!canEdit}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors hover:bg-primary/10"
            style={{ color: 'hsl(var(--primary))' }}
            title={notif.status === 'draft' ? 'Continue editing' : 'Load into compose'}
          >
            <RotateCcw size={11} />
            {notif.status === 'draft' ? 'Edit' : 'Load'}
          </button>
          <button
            onClick={() => onDelete(notif.id)}
            disabled={!canDelete}
            className="p-1.5 rounded hover:bg-destructive/10 transition-colors disabled:opacity-40"
            title="Delete"
          >
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
                ...(notif.urdu_body ? [{ label: 'Urdu', value: notif.urdu_body }] : []),
                { label: 'Audience',  value: AUDIENCE_OPTIONS.find((o) => o.value === notif.audience)?.label ?? notif.audience },
                { label: 'Category',  value: getCategoryMeta(notif.category ?? 'general').label },
                ...(notif.format_version ? [{ label: 'Format', value: notif.format_version }] : []),
                ...(notif.recipient_count !== null ? [{ label: 'Delivered', value: `${notif.recipient_count.toLocaleString()} device${notif.recipient_count !== 1 ? 's' : ''}` }] : []),
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
                  <span className="text-destructive leading-relaxed">{notif.error_message}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// â”€â”€â”€ Scheduled Queue Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ScheduledQueuePanel = ({
  scheduled,
  onCancel,
  onSendNow,
  canManage,
}: {
  scheduled: PushNotification[];
  onCancel: (ids: string[]) => Promise<void>;
  onSendNow: (notif: PushNotification) => void;
  canManage: boolean;
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cancellingAll, setCancellingAll] = useState(false);
  const [expanded, setExpanded] = useState(true);

  if (scheduled.length === 0) return null;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(scheduled.map((n) => n.id)));
  const clearSel = () => setSelected(new Set());

  const handleBulkCancel = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Cancel ${selected.size} scheduled notification${selected.size !== 1 ? 's' : ''}?`)) return;
    setCancellingAll(true);
    await onCancel(Array.from(selected));
    setSelected(new Set());
    setCancellingAll(false);
  };

  const sorted = [...scheduled].sort((a, b) =>
    new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime()
  );

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 border-b border-blue-200 flex items-center justify-between text-left hover:bg-blue-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-blue-600" />
          <span className="text-sm font-bold text-blue-800">Scheduled Queue</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-200 text-blue-800">{scheduled.length}</span>
          {selected.size > 0 && <span className="text-[10px] font-semibold text-blue-600">{selected.size} selected</span>}
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {selected.size > 0 && (
            <button
              onClick={handleBulkCancel}
              disabled={cancellingAll || !canManage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 transition-colors border border-red-200 disabled:opacity-60"
            >
              {cancellingAll ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
              Cancel {selected.size}
            </button>
          )}
          {expanded ? <ChevronUp size={14} className="text-blue-600" /> : <ChevronDown size={14} className="text-blue-600" />}
        </div>
      </button>

      {expanded && (
        <>
          <div className="px-5 py-2 border-b border-blue-200/60 flex items-center gap-3 bg-blue-50">
            <button onClick={selected.size === scheduled.length ? clearSel : selectAll} className="text-[11px] font-semibold text-blue-700 hover:text-blue-900">
              {selected.size === scheduled.length ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-blue-300">|</span>
            <button onClick={clearSel} className="text-[11px] text-blue-500 hover:text-blue-700">Clear</button>
            <span className="text-[11px] text-blue-500 ml-auto">Sorted by scheduled time</span>
          </div>

          <div className="divide-y divide-blue-200/40">
            {sorted.map((notif) => {
              const isSelected = selected.has(notif.id);
              const scheduledDate = new Date(notif.scheduled_for!);
              const isOverdue = scheduledDate < new Date();
              const cat = getCategoryMeta(notif.category ?? 'general');
              return (
                <div
                  key={notif.id}
                  className={`px-4 py-3.5 flex items-start gap-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-100' : 'hover:bg-blue-50'}`}
                  onClick={() => toggleSelect(notif.id)}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-blue-300 bg-white'}`}>
                    {isSelected && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <p className="text-sm font-semibold text-blue-900 leading-snug truncate max-w-xs">{notif.title}</p>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${cat.color}`}>{cat.label}</span>
                          {isOverdue && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">Overdue</span>}
                        </div>
                        <p className="text-[11px] text-blue-700/70 line-clamp-1">{notif.body}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onSendNow(notif)}
                          disabled={!canManage}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-200 disabled:opacity-60"
                        >
                          <Send size={10} /> Edit & Send
                        </button>
                        <button onClick={async () => onCancel([notif.id])} disabled={!canManage} className="p-1.5 rounded hover:bg-red-100 disabled:opacity-50">
                          <Trash2 size={12} className="text-red-500" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Calendar size={10} className="text-blue-500" />
                      <span className="text-[10px] font-semibold text-blue-700">
                        {scheduledDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at {scheduledDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[10px] text-blue-500">- {isOverdue ? 'was ' : ''}{timeAgo(notif.scheduled_for!)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Users size={9} className="text-blue-400" />
                      <span className="text-[10px] text-blue-600">{AUDIENCE_OPTIONS.find((o) => o.value === notif.audience)?.label ?? notif.audience}</span>
                      {notif.image_url && <><ImageIcon size={9} className="text-blue-400" /><span className="text-[10px] text-blue-500">image</span></>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selected.size === 0 && scheduled.length > 1 && (
            <div className="px-5 py-3 border-t border-blue-200/60 flex items-center justify-between">
              <p className="text-[11px] text-blue-600">Select items to bulk-cancel</p>
              <button
                onClick={async () => {
                  if (!confirm(`Cancel ALL ${scheduled.length} scheduled notifications?`)) return;
                  setCancellingAll(true);
                  await onCancel(scheduled.map((n) => n.id));
                  setCancellingAll(false);
                }}
                disabled={cancellingAll || !canManage}
                className="text-[11px] font-semibold text-red-600 hover:text-red-800 disabled:opacity-60 flex items-center gap-1"
              >
                {cancellingAll ? <RefreshCw size={10} className="animate-spin" /> : <Trash2 size={10} />}
                Cancel all {scheduled.length}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// â”€â”€â”€ Automations Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const AutomationsPanel = ({
  automations,
  events,
  canEdit,
  onSave,
  onToggle,
  onDelete,
}: {
  automations: NotificationAutomation[];
  events: NotificationAutomationEvent[];
  canEdit: boolean;
  onSave: (draft: AutomationDraft) => Promise<void>;
  onToggle: (automation: NotificationAutomation) => Promise<void>;
  onDelete: (automation: NotificationAutomation) => Promise<void>;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AutomationDraft>(EMPTY_AUTOMATION_DRAFT);

  const setDraftField = useCallback(<K extends keyof AutomationDraft>(key: K, value: AutomationDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleWeekday = (day: number) => {
    setDraft((prev) => {
      const exists = prev.recurrenceDays.includes(day);
      return {
        ...prev,
        recurrenceDays: exists
          ? prev.recurrenceDays.filter((value) => value !== day)
          : [...prev.recurrenceDays, day].sort((a, b) => a - b),
      };
    });
  };

  const togglePrayer = (prayer: string) => {
    setDraft((prev) => {
      const exists = prev.prayerNames.includes(prayer);
      return {
        ...prev,
        prayerNames: exists
          ? prev.prayerNames.filter((value) => value !== prayer)
          : [...prev.prayerNames, prayer],
      };
    });
  };

  const submit = async () => {
    if (!canEdit) return;
    if (!draft.name.trim() || !draft.title.trim() || !draft.body.trim()) {
      toast.error('Rule name, title, and body are required.');
      return;
    }

    setSaving(true);
    try {
      await onSave(draft);
      setDraft(EMPTY_AUTOMATION_DRAFT);
      toast.success('Automation rule saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save automation rule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 border-b border-amber-200 flex items-center justify-between text-left hover:bg-amber-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-amber-700" />
          <span className="text-sm font-bold text-amber-900">Automations</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">{automations.length}</span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-amber-700" /> : <ChevronDown size={14} className="text-amber-700" />}
      </button>

      {expanded && (
        <div className="px-5 py-4 space-y-4">
          <p className="text-[11px] text-amber-900/80 leading-relaxed">
            Automated sends run in Europe/London timezone. Prayer-linked rules use live prayer times and compute the next run automatically after each execution.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Rule name</Label>
              <Input value={draft.name} onChange={(e) => setDraftField('name', e.target.value)} placeholder="e.g. Jumuah weekly" disabled={!canEdit || saving} />
            </div>
            <div className="space-y-1.5">
              <Label>Schedule mode</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={draft.scheduleType}
                onChange={(e) => setDraftField('scheduleType', e.target.value as AutomationDraft['scheduleType'])}
                disabled={!canEdit || saving}
              >
                <option value="one_time">One-time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="prayer">Prayer-linked</option>
              </select>
            </div>
          </div>

          {draft.scheduleType === 'one_time' && (
            <div className="space-y-1.5">
              <Label>Send at</Label>
              <Input type="datetime-local" value={draft.oneTimeAt} onChange={(e) => setDraftField('oneTimeAt', e.target.value)} disabled={!canEdit || saving} />
            </div>
          )}

          {(draft.scheduleType === 'daily' || draft.scheduleType === 'weekly') && (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label>Clock time</Label>
                <Input type="time" value={draft.scheduleTime} onChange={(e) => setDraftField('scheduleTime', e.target.value)} disabled={!canEdit || saving} />
              </div>
              {draft.scheduleType === 'weekly' && (
                <div className="space-y-1.5">
                  <Label>Weekdays</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAY_OPTIONS.map((day) => {
                      const selected = draft.recurrenceDays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleWeekday(day.value)}
                          disabled={!canEdit || saving}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                            selected
                              ? 'bg-primary/10 border-primary text-primary'
                              : 'bg-background border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {draft.scheduleType === 'prayer' && (
            <div className="space-y-2">
              <Label>Prayers</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRAYER_OPTIONS.map((prayer) => {
                  const selected = draft.prayerNames.includes(prayer);
                  return (
                    <button
                      key={prayer}
                      type="button"
                      onClick={() => togglePrayer(prayer)}
                      disabled={!canEdit || saving}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                        selected
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-background border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {prayer}
                    </button>
                  );
                })}
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-100/60 px-2.5 py-2 text-[11px] text-amber-900/90 leading-relaxed">
                Choose one or more prayers. The scheduler looks up each selected prayer in <span className="font-semibold">prayer_times</span> and always advances to the next valid prayer slot.
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={draft.title} onChange={(e) => setDraftField('title', e.target.value)} disabled={!canEdit || saving} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={draft.audience}
                onChange={(e) => setDraftField('audience', e.target.value)}
                disabled={!canEdit || saving}
              >
                {AUDIENCE_OPTIONS.map((audience) => (
                  <option key={audience.value} value={audience.value}>
                    {audience.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={draft.category}
                onChange={(e) => setDraftField('category', e.target.value)}
                disabled={!canEdit || saving}
              >
                {CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea value={draft.body} rows={2} onChange={(e) => setDraftField('body', e.target.value)} disabled={!canEdit || saving} />
          </div>
          <div className="space-y-1.5">
            <Label>Body (Urdu, optional)</Label>
            <Textarea value={draft.urduBody} rows={2} onChange={(e) => setDraftField('urduBody', e.target.value)} disabled={!canEdit || saving} />
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={submit} disabled={!canEdit || saving} className="gap-2">
              {saving ? <RefreshCw size={12} className="animate-spin" /> : <Clock size={12} />} Save Rule
            </Button>
            {!canEdit && <p className="text-[11px] text-muted-foreground">Read-only for your role.</p>}
          </div>

          <div className="rounded-xl border border-amber-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-amber-100 text-xs font-bold text-amber-800">Existing rules</div>
            {automations.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-muted-foreground">No automation rules yet. Create one above to schedule daily, weekly, or prayer-linked sends.</p>
            ) : (
              <div className="divide-y divide-amber-100 bg-amber-50/30">
                {automations.slice(0, 20).map((automation) => (
                  <div key={automation.id} className="px-3 py-3 flex items-start justify-between gap-3 hover:bg-amber-50 transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <p className="text-xs font-semibold text-foreground truncate max-w-[220px]">{automation.name}</p>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-700 border border-slate-200">
                          {automation.schedule_type}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${getCategoryMeta(automation.category).color}`}>
                          {getCategoryMeta(automation.category).label}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        next {automation.next_run_at ? new Date(automation.next_run_at).toLocaleString('en-GB') : 'not scheduled'} - runs {automation.run_count}
                      </p>
                      {automation.last_error && <p className="text-[10px] text-red-600 truncate mt-0.5">last error: {automation.last_error}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggle(automation)}
                        disabled={!canEdit}
                        className={`px-2.5 py-1 rounded text-[10px] font-semibold border transition-colors ${automation.enabled ? 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'} disabled:opacity-50`}
                      >
                        {automation.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(automation)}
                        disabled={!canEdit}
                        className="p-1 rounded hover:bg-red-100 disabled:opacity-50"
                        title="Delete automation"
                      >
                        <Trash2 size={11} className="text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-border text-xs font-bold text-foreground">Recent automation events</div>
            {events.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-muted-foreground">No automation events yet. Events appear after the scheduler runs (every minute) or after a manual processor run.</p>
            ) : (
              <div className="divide-y divide-border/60 max-h-64 overflow-y-auto">
                {events.map((event) => (
                  <div key={event.id} className="px-3 py-2.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-1.5 py-0.5 rounded-full border font-semibold uppercase tracking-wide text-[10px] ${automationEventStatusStyles[event.status]}`}>
                        {event.status}
                      </span>
                      <span className="text-muted-foreground">{timeAgo(event.created_at)}</span>
                    </div>
                    <p className="text-muted-foreground mt-1">
                      recipients: {event.recipient_count ?? 0} - {event.notification_id ? `notification ${event.notification_id.slice(0, 8)}` : 'automation-only event'}
                    </p>
                    {event.error_message && <p className="text-red-600 mt-0.5">{event.error_message}</p>}
                    <details className="mt-1.5 rounded-md border border-border/70 bg-muted/20">
                      <summary className="list-none cursor-pointer px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                        <Eye size={11} /> View details
                      </summary>
                      <div className="px-2.5 pb-2.5 space-y-1.5">
                        <p className="text-[10px] text-muted-foreground">event id: {event.id}</p>
                        <p className="text-[10px] text-muted-foreground">scheduled for: {event.scheduled_for ? new Date(event.scheduled_for).toLocaleString('en-GB') : 'n/a'}</p>
                        <pre className="text-[10px] leading-relaxed bg-background border border-border rounded-md p-2 overflow-x-auto font-mono text-foreground whitespace-pre">
                          {JSON.stringify(event.payload_json ?? {}, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// â”€â”€â”€ Stats Cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const StatsRow = ({ notifications, deviceCount }: { notifications: PushNotification[]; deviceCount: number }) => {
  const sent = notifications.filter((n) => n.status === 'sent').length;
  const scheduled = notifications.filter((n) => n.status === 'scheduled').length;
  const drafts = notifications.filter((n) => n.status === 'draft').length;
  const totalDevices = notifications.reduce((acc, n) => acc + (n.recipient_count ?? 0), 0);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[
        { label: 'Total Sent',      value: sent,                          icon: <Send size={14} />,       accent: 'hsl(var(--primary))' },
        { label: 'Total Delivered', value: totalDevices.toLocaleString(), icon: <CheckCircle2 size={14} />, accent: '#10b981'           },
        { label: 'Registered Devices', value: deviceCount,               icon: <Smartphone size={14} />, accent: '#0ea5e9'             },
        { label: 'Scheduled',       value: scheduled + drafts,            icon: <Calendar size={14} />,   accent: '#6366f1'             },
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

// â”€â”€â”€ Expo Setup Guide â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CODE_SNIPPET = `// In your Expo/React Native app (e.g. App.tsx)
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function registerForPushNotifications() {
  if (!Device.isDevice) return; // real device only

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  const token = (await Notifications.getExpoPushTokenAsync({
    projectId: 'YOUR_EXPO_PROJECT_ID', // from app.json
  })).data;

  // Upsert token into Supabase
  await supabase.from('device_tokens').upsert({
    token,
    platform: Platform.OS,          // 'ios' or 'android'
    app_version: Application.nativeApplicationVersion,
    last_active: new Date().toISOString(),
  }, { onConflict: 'token' });
}

// Call on app start:
useEffect(() => { registerForPushNotifications(); }, []);`;

const ExpoSetupGuide = () => {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(CODE_SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border" style={{ background: 'hsl(var(--primary) / 0.04)' }}>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Megaphone size={15} style={{ color: 'hsl(var(--primary))' }} />
          Mobile App Setup - Expo Push
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">Add this to your React Native app to register devices</p>
      </div>
      <div className="px-5 py-4 space-y-4">
        {[
          {
            step: '1', title: 'Install packages',
            desc: 'Run in your Expo project:',
            code: 'npx expo install expo-notifications expo-device expo-application',
          },
          {
            step: '2', title: 'Get your Expo Project ID',
            desc: 'Find it in app.json under extra.eas.projectId, or run: npx expo whoami',
          },
          {
            step: '3', title: 'Register tokens on app start',
            desc: 'Add the token registration code to your app. Tap "Show code" below.',
          },
          {
            step: '4', title: 'Tokens appear automatically',
            desc: 'Once the app runs on a real device and permission is granted, tokens show in "Registered Devices" above.',
          },
          {
            step: '5', title: "You're live!",
            desc: 'Click Send Notification in the portal. Expo routes it to iOS APNs and Android FCM automatically.',
          },
        ].map((item) => (
          <div key={item.step} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5"
              style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}>
              {item.step}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">{item.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
              {item.code && (
                <code className="mt-1.5 block text-[10px] bg-muted/60 border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground break-all">
                  {item.code}
                </code>
              )}
            </div>
          </div>
        ))}

        {/* Code snippet toggle */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowCode((v) => !v)}
            className="flex items-center gap-2 text-xs font-medium transition-colors hover:text-foreground"
            style={{ color: 'hsl(var(--primary))' }}
          >
            <Code2 size={13} />
            {showCode ? 'Hide code' : 'Show registration code'}
            {showCode ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showCode && (
            <div className="mt-2 relative">
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-background/80 border border-border hover:bg-muted transition-colors z-10"
              >
                <Copy size={10} />
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <pre className="text-[10px] leading-relaxed bg-muted/40 border border-border rounded-xl p-4 overflow-x-auto font-mono text-foreground whitespace-pre">
                {CODE_SNIPPET}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// â”€â”€â”€ Devices Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DevicesPanel = ({ tokens, errorMessage }: { tokens: DeviceToken[]; errorMessage?: string | null }) => {
  const [expanded, setExpanded] = useState(false);
  const active = tokens.filter((t) => t.is_active);
  const ios = active.filter((t) => t.platform === 'ios').length;
  const android = active.filter((t) => t.platform === 'android').length;
  const other = active.length - ios - android;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 border-b border-border flex items-center justify-between text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Smartphone size={14} style={{ color: 'hsl(var(--primary))' }} />
          <span className="text-sm font-bold text-foreground">Registered Devices</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
            {active.length}
          </span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>

      {!expanded && (
        <div className="px-5 py-3 flex items-center gap-4">
          {[
            { label: 'iOS', count: ios, color: 'text-blue-600' },
            { label: 'Android', count: android, color: 'text-emerald-600' },
            ...(other > 0 ? [{ label: 'Other', count: other, color: 'text-muted-foreground' }] : []),
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className={`text-sm font-bold ${item.color}`}>{item.count}</span>
              <span className="text-[11px] text-muted-foreground">{item.label}</span>
            </div>
          ))}
          {active.length === 0 && (
            <p className="text-xs text-muted-foreground">No active devices yet. Open the app on a real phone and accept notification permission.</p>
          )}
        </div>
      )}

      {expanded && (
        <div>
          {errorMessage && (
            <div className="mx-5 mt-4 mb-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-start gap-2">
              <CircleAlert size={14} className="text-red-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-red-700 leading-relaxed">Unable to refresh devices right now. {errorMessage}</p>
            </div>
          )}
          {/* Summary row */}
          <div className="px-5 py-3 border-b border-border/60 flex items-center gap-4 bg-muted/10">
            {[
              { label: 'iOS', count: ios, color: 'text-blue-600' },
              { label: 'Android', count: android, color: 'text-emerald-600' },
              { label: 'Inactive', count: tokens.length - active.length, color: 'text-muted-foreground' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1">
                <span className={`text-sm font-bold ${item.color}`}>{item.count}</span>
                <span className="text-[11px] text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>

          {tokens.length === 0 ? (
            <div className="px-5 py-6 text-center space-y-2">
              <p className="text-xs text-muted-foreground">No devices registered yet.</p>
              <p className="text-[11px] text-muted-foreground">Quick check: install app on a physical device, allow push permission, and keep the app open for 10-15 seconds.</p>
              <p className="text-[11px] text-muted-foreground">Then press refresh to confirm token sync.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40 max-h-60 overflow-y-auto">
              {tokens.slice(0, 50).map((t) => (
                <div key={t.id} className={`px-4 py-2.5 flex items-center gap-3 ${!t.is_active ? 'opacity-40' : ''}`}>
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        t.platform === 'ios' ? 'bg-blue-100 text-blue-700' :
                        t.platform === 'android' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{t.platform}</span>
                      {t.app_version && <span className="text-[10px] text-muted-foreground">v{t.app_version}</span>}
                      {t.device_model && <span className="text-[10px] text-muted-foreground truncate">{t.device_model}</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">{t.token.slice(0, 40)}...</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{timeAgo(t.last_active)}</span>
                </div>
              ))}
              {tokens.length > 50 && (
                <div className="px-4 py-2 text-center text-[10px] text-muted-foreground">
                  + {tokens.length - 50} more devices
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const Notifications = () => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [composeData, setComposeData] = useState<Partial<ComposeData> | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<string>('compose');
  const queryClient = useQueryClient();
  const { canEdit, canDelete, role } = usePermissions();

  const {
    data: notifications = [],
    isFetching,
    refetch,
    isError: notificationsQueryError,
    error: notificationsError,
  } = useQuery({
    queryKey: ['push-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase.from('push_notifications').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as PushNotification[];
    },
  });

  const {
    data: deviceTokens = [],
    isError: deviceTokensQueryError,
    error: deviceTokensError,
  } = useQuery({
    queryKey: ['device-tokens'],
    queryFn: async () => {
      const { data, error } = await supabase.from('device_tokens').select('*').order('last_active', { ascending: false });
      if (error) throw error;
      return data as DeviceToken[];
    },
    refetchInterval: 30000, // refresh every 30s
  });

  const {
    data: automations = [],
    refetch: refetchAutomations,
    isError: automationsQueryError,
    error: automationsError,
  } = useQuery({
    queryKey: ['notification-automations'],
    queryFn: () => notificationAutomationService.getAll(),
  });

  const {
    data: automationEvents = [],
    refetch: refetchAutomationEvents,
    isError: automationEventsQueryError,
    error: automationEventsError,
  } = useQuery({
    queryKey: ['notification-automation-events'],
    queryFn: () => notificationAutomationService.getRecentEvents(40),
    refetchInterval: 30000,
  });

  const handleSent = (notif: PushNotification) => {
    queryClient.setQueryData<PushNotification[]>(['push-notifications'], (old = []) => [notif, ...old]);
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) {
      toast.error('Your role is read-only for deleting notifications.');
      return;
    }
    if (!confirm('Delete this notification from history?')) return;
    queryClient.setQueryData<PushNotification[]>(['push-notifications'], (old = []) => old.filter((n) => n.id !== id));
    const { error } = await supabase.from('push_notifications').delete().eq('id', id);
    if (error) { toast.error('Failed to delete.'); refetch(); }
    else toast.success('Deleted from history.');
  };

  const handleLoadIntoCompose = (notif: PushNotification) => {
    if (!canEdit) {
      toast.error('Your role is read-only for composing notifications.');
      return;
    }
    setComposeData({
      title: notif.title,
      body: notif.body,
      urduBody: notif.urdu_body ?? '',
      imageUrl: notif.image_url ?? '',
      linkUrl: notif.link_url ?? '',
      audience: notif.audience,
      category: notif.category ?? 'general',
      scheduleEnabled: false,
      scheduledFor: '',
    });
    setActiveTab('compose');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.info('Notification loaded into compose form.');
  };

  const handleUseTemplate = (t: Template) => {
    if (!canEdit) {
      toast.error('Your role is read-only for composing notifications.');
      return;
    }
    setComposeData({ title: t.title, body: t.body, category: t.category });
    setActiveTab('compose');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.info(`Template "${t.label}" loaded.`);
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

  const scheduledNotifs = notifications.filter((n) => n.status === 'scheduled');

  const handleBulkCancel = async (ids: string[]) => {
    if (!canEdit) {
      toast.error('Your role is read-only for schedule updates.');
      return;
    }
    queryClient.setQueryData<PushNotification[]>(['push-notifications'], (old = []) =>
      old.filter((n) => !ids.includes(n.id))
    );
    await Promise.all(ids.map((id) => supabase.from('push_notifications').delete().eq('id', id)));
    toast.success(`Cancelled ${ids.length} scheduled notification${ids.length !== 1 ? 's' : ''}.`);
    setTimeout(() => refetch(), 500);
  };

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    notifications.forEach((n) => { const c = n.category ?? 'general'; counts[c] = (counts[c] ?? 0) + 1; });
    return counts;
  }, [notifications]);

  const activeDeviceCount = deviceTokens.filter((t) => t.is_active).length;

  const queryErrors = [
    notificationsQueryError ? `History failed to load: ${getErrorMessage(notificationsError)}` : null,
    deviceTokensQueryError ? `Devices failed to load: ${getErrorMessage(deviceTokensError)}` : null,
    automationsQueryError ? `Automation rules failed to load: ${getErrorMessage(automationsError)}` : null,
    automationEventsQueryError ? `Automation events failed to load: ${getErrorMessage(automationEventsError)}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  const handleSaveAutomation = async (draft: AutomationDraft) => {
    if (!canEdit) {
      toast.error('Your role is read-only for automation changes.');
      return;
    }

    const nextRunAt = buildNextRunAt(
      draft.scheduleType,
      draft.oneTimeAt,
      draft.scheduleTime,
      draft.recurrenceDays,
    );

    if (draft.scheduleType === 'one_time' && !nextRunAt) {
      throw new Error('Please provide a valid one-time date and time.');
    }

    if ((draft.scheduleType === 'daily' || draft.scheduleType === 'weekly') && !nextRunAt) {
      throw new Error('Please provide a valid schedule time.');
    }

    if (draft.scheduleType === 'prayer' && draft.prayerNames.length === 0) {
      throw new Error('Select at least one prayer for prayer-linked automation.');
    }

    const payload = {
      name: draft.name.trim(),
      enabled: draft.enabled,
      schedule_type: draft.scheduleType,
      schedule_timezone: 'Europe/London',
      one_time_at: draft.scheduleType === 'one_time' ? nextRunAt : null,
      next_run_at: draft.scheduleType === 'prayer' ? (nextRunAt ?? new Date().toISOString()) : nextRunAt,
      recurrence_days: draft.scheduleType === 'weekly' ? draft.recurrenceDays : [],
      prayer_names: draft.scheduleType === 'prayer' ? draft.prayerNames : [],
      title: draft.title.trim(),
      body: draft.body.trim(),
      urdu_body: draft.urduBody.trim() || null,
      image_url: null,
      link_url: null,
      cta_label: null,
      audience: draft.audience,
      category: draft.category,
    };

    await notificationAutomationService.create(payload);

    await Promise.all([refetchAutomations(), refetchAutomationEvents()]);
  };

  const handleToggleAutomation = async (automation: NotificationAutomation) => {
    if (!canEdit) {
      toast.error('Your role is read-only for automation changes.');
      return;
    }

    const enableNext = !automation.enabled;
    if (!confirm(`${enableNext ? 'Enable' : 'Disable'} automation "${automation.name}"?`)) {
      return;
    }

    toast.info(`${enableNext ? 'Enabling' : 'Disabling'} automation...`);
    await notificationAutomationService.setEnabled(automation.id, !automation.enabled);
    toast.success(`Automation ${!automation.enabled ? 'enabled' : 'disabled'}.`);
    await refetchAutomations();
  };

  const handleDeleteAutomation = async (automation: NotificationAutomation) => {
    if (!canEdit) {
      toast.error('Your role is read-only for automation changes.');
      return;
    }
    if (!confirm(`Delete automation rule "${automation.name}"?`)) return;

    toast.info('Deleting automation...');
    await notificationAutomationService.delete(automation.id);
    toast.success('Automation deleted.');
    await refetchAutomations();
  };

  const composeCard = canEdit ? (
    <ComposePanel
      key={JSON.stringify(composeData)}
      initialData={composeData}
      onSent={handleSent}
      onRefetchHistory={refetch}
    />
  ) : (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-bold text-foreground">Compose</h3>
      </div>
      <div className="px-5 py-5 text-sm text-muted-foreground">
        Your current role is read-only. You can review history and delivery stats, but cannot create or send notifications.
      </div>
    </div>
  );

  const tabTriggerClass =
    'gap-1.5 flex-1 min-w-[7rem] data-[state=active]:bg-[hsl(142_50%_93%)] data-[state=active]:text-[hsl(142_60%_24%)] data-[state=active]:shadow-sm';

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />

      <main className="flex-1 min-w-0 overflow-x-hidden pt-14 md:pt-0">
        {/* Header banner */}
        <div className="relative overflow-hidden border-b border-[hsl(140_20%_88%)]">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(142_50%_96%)] via-white to-[hsl(142_40%_98%)]" />
          <div className="relative px-4 sm:px-8 pt-7 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[hsl(142_60%_32%)] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Bell size={20} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-[hsl(150_30%_12%)] tracking-tight">Push Notifications</h1>
                  <p className="text-xs text-muted-foreground mt-1">
                    Compose, schedule and automate push messages to the masjid community.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-[hsl(140_20%_88%)] text-[10px] font-semibold text-[hsl(150_30%_18%)]">
                      <Smartphone size={10} /> {activeDeviceCount} device{activeDeviceCount !== 1 ? 's' : ''}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-[hsl(140_20%_88%)] text-[10px] font-semibold text-[hsl(150_30%_18%)]">
                      <Send size={10} /> {notifications.length} in history
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-[hsl(140_20%_88%)] text-[10px] font-semibold text-muted-foreground">
                      Role: {role ?? 'none'}{canEdit ? ' - editable' : ' - read-only'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start">
                {canEdit && (
                  <Button
                    size="sm"
                    onClick={() => setActiveTab('compose')}
                    className="gap-2 bg-[hsl(142_60%_32%)] hover:bg-[hsl(142_60%_28%)] text-white"
                  >
                    <Send size={13} /> New notification
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
                  <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-5 space-y-5">
          {queryErrors.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 text-red-700">
                <CircleAlert size={14} />
                <p className="text-xs font-semibold">Some dashboard data failed to load</p>
              </div>
              {queryErrors.map((message, index) => (
                <p key={`${message}-${index}`} className="text-[11px] text-red-700/90 leading-relaxed">{message}</p>
              ))}
            </div>
          )}

          <StatsRow notifications={notifications} deviceCount={activeDeviceCount} />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full h-auto flex flex-wrap gap-1 bg-white border border-[hsl(140_20%_88%)] p-1 rounded-xl text-muted-foreground">
              <TabsTrigger value="compose" className={tabTriggerClass}>
                <Send size={13} /> Compose
              </TabsTrigger>
              <TabsTrigger value="history" className={tabTriggerClass}>
                <Layers size={13} /> History
                <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted/70 text-muted-foreground">{notifications.length}</span>
              </TabsTrigger>
              <TabsTrigger value="scheduled" className={tabTriggerClass}>
                <Calendar size={13} /> Scheduled
                {scheduledNotifs.length > 0 && (
                  <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{scheduledNotifs.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="automations" className={tabTriggerClass}>
                <Clock size={13} /> Automations
                {automations.length > 0 && (
                  <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{automations.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="devices" className={tabTriggerClass}>
                <Smartphone size={13} /> Devices &amp; Setup
              </TabsTrigger>
            </TabsList>

            {/* â”€â”€ Compose tab â”€â”€ */}
            <TabsContent value="compose" className="mt-5 space-y-5 focus-visible:outline-none">
              {canEdit && (
                <div className="rounded-2xl border border-border bg-card shadow-sm px-4 py-3">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Sparkles size={13} className="text-[hsl(142_60%_32%)]" />
                    <span className="text-xs font-semibold text-foreground">Quick templates</span>
                    <span className="text-[11px] text-muted-foreground">One click to pre-fill the form</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1.5 -mx-1 px-1">
                    {BUILT_IN_TEMPLATES.map((t) => {
                      const cat = getCategoryMeta(t.category);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleUseTemplate(t)}
                          className="group shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-[hsl(140_20%_88%)] bg-white hover:border-[hsl(142_50%_70%)] hover:bg-[hsl(142_50%_96%)] transition-all text-left"
                          title={t.title}
                        >
                          <span className="text-lg leading-none">{t.icon}</span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-foreground leading-tight whitespace-nowrap">{t.label}</p>
                            <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${cat.color}`}>{cat.label}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 min-w-0">
                <div className="min-w-0">{composeCard}</div>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-card shadow-sm px-5 py-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Smartphone size={13} className="text-[hsl(142_60%_32%)]" />
                      <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Reach</h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Your message will be delivered to{' '}
                      <span className="font-semibold text-foreground">{activeDeviceCount.toLocaleString()}</span> registered device{activeDeviceCount !== 1 ? 's' : ''} via Expo Push (iOS APNs + Android FCM).
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('devices')}
                      className="mt-2 text-[11px] font-semibold text-[hsl(142_60%_32%)] hover:text-[hsl(142_60%_24%)] inline-flex items-center gap-0.5"
                    >
                      Manage devices <ChevronRight size={10} />
                    </button>
                  </div>

                  <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                      <Sparkles size={13} className="text-[hsl(142_60%_32%)]" />
                      <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Writing tips</h3>
                    </div>
                    <div className="px-5 py-4 space-y-3">
                      {[
                        { icon: '1.', tip: 'Keep titles under 50 characters - they get truncated on lock screens.' },
                        { icon: '2.', tip: 'Lead with the most important info in the first sentence.' },
                        { icon: '3.', tip: "Send Jumu'ah and Taraweeh notices at least 2 hours early." },
                        { icon: '4.', tip: 'Avoid sending between 10pm and 6am to respect quiet hours.' },
                        { icon: '5.', tip: 'Rich images (1440x720px) significantly increase tap-through rates.' },
                      ].map((item, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
                          <p className="text-xs text-muted-foreground leading-relaxed">{item.tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <TemplatesPanel onUse={handleUseTemplate} />
                </div>
              </div>
            </TabsContent>

            {/* â”€â”€ History tab â”€â”€ */}
            <TabsContent value="history" className="mt-5 space-y-5 focus-visible:outline-none">
              <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Layers size={14} style={{ color: 'hsl(var(--primary))' }} />
                      Notification History
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{notifications.length}</span>
                    </h3>
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search title or body..."
                        className="pl-7 h-8 text-xs w-56"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-wrap">
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

                  <div className="flex items-center gap-1 flex-wrap">
                    <Tag size={11} className="text-muted-foreground mr-0.5" />
                    <button
                      onClick={() => setCategoryFilter('all')}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                        categoryFilter === 'all' ? 'border-primary bg-primary/8 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      All categories
                    </button>
                    {CATEGORIES.filter((c) => (catCounts[c.value] ?? 0) > 0).map((c) => (
                      <button
                        key={c.value}
                        onClick={() => setCategoryFilter(c.value)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                          categoryFilter === c.value ? c.color + ' shadow-sm' : 'border-border bg-background text-muted-foreground hover:bg-muted'
                        }`}
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
                        ? 'No notifications yet. Compose your first one.'
                        : 'No results match your filter.'}
                    </p>
                    {canEdit && notifications.length === 0 && (
                      <Button size="sm" onClick={() => setActiveTab('compose')} className="gap-2">
                        <Send size={12} /> Compose
                      </Button>
                    )}
                  </div>
                ) : (
                  <div>
                    {filtered.map((notif) => (
                      <HistoryRow
                        key={notif.id}
                        notif={notif}
                        onDelete={handleDelete}
                        onLoad={handleLoadIntoCompose}
                        canDelete={canDelete}
                        canEdit={canEdit}
                      />
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* â”€â”€ Scheduled tab â”€â”€ */}
            <TabsContent value="scheduled" className="mt-5 space-y-5 focus-visible:outline-none">
              {scheduledNotifs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[hsl(140_20%_85%)] bg-white px-6 py-14 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[hsl(142_50%_93%)] flex items-center justify-center">
                    <Calendar size={22} className="text-[hsl(142_60%_32%)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">No notifications scheduled</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Schedule a future send from the Compose tab - it will appear here until it fires.
                    </p>
                  </div>
                  {canEdit && (
                    <Button size="sm" onClick={() => setActiveTab('compose')} className="gap-2 mt-1">
                      <Send size={12} /> Compose
                    </Button>
                  )}
                </div>
              ) : (
                <ScheduledQueuePanel
                  scheduled={scheduledNotifs}
                  onCancel={handleBulkCancel}
                  onSendNow={handleLoadIntoCompose}
                  canManage={canEdit}
                />
              )}
            </TabsContent>

            {/* â”€â”€ Automations tab â”€â”€ */}
            <TabsContent value="automations" className="mt-5 space-y-5 focus-visible:outline-none">
              <AutomationsPanel
                automations={automations}
                events={automationEvents}
                canEdit={canEdit}
                onSave={handleSaveAutomation}
                onToggle={handleToggleAutomation}
                onDelete={handleDeleteAutomation}
              />
            </TabsContent>

            {/* â”€â”€ Devices & Setup tab â”€â”€ */}
            <TabsContent value="devices" className="mt-5 space-y-5 focus-visible:outline-none">
              <DevicesPanel
                tokens={deviceTokens}
                errorMessage={deviceTokensQueryError ? getErrorMessage(deviceTokensError) : null}
              />
              <ExpoSetupGuide />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Notifications;

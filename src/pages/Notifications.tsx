import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Send, Clock, CheckCircle2, XCircle, RefreshCw, Trash2,
  Users, Image as ImageIcon, Link2, ChevronDown, ChevronUp,
  AlertCircle, Smartphone, Megaphone, Search, Filter,
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
  status: 'draft' | 'sent' | 'failed';
  sent_at: string | null;
  recipient_count: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'All Users', description: 'Every registered device' },
  { value: 'active', label: 'Active Users', description: 'Users active in the last 30 days' },
  { value: 'new', label: 'New Users', description: 'Joined in the last 7 days' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; icon: React.ReactNode; class: string }> = {
  sent:   { label: 'Sent',   icon: <CheckCircle2 size={12} />, class: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  failed: { label: 'Failed', icon: <XCircle size={12} />,     class: 'bg-red-100 text-red-700 border-red-200'             },
  draft:  { label: 'Draft',  icon: <Clock size={12} />,        class: 'bg-gray-100 text-gray-600 border-gray-200'          },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Compose Panel ────────────────────────────────────────────────────────────

const ComposePanel = ({ onSent }: { onSent: (notif: PushNotification) => void }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [audience, setAudience] = useState('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const isValid = title.trim().length > 0 && body.trim().length > 0;
  const titleRemaining = 65 - title.length;
  const bodyRemaining = 240 - body.length;

  const saveToHistory = async (status: 'sent' | 'draft' | 'failed', extra?: Partial<PushNotification>) => {
    const { data, error } = await supabase.from('push_notifications').insert({
      title: title.trim(),
      body: body.trim(),
      image_url: imageUrl.trim() || null,
      link_url: linkUrl.trim() || null,
      audience,
      status,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      recipient_count: status === 'sent' ? 0 : null, // placeholder — real count comes from OneSignal
      ...extra,
    }).select().single();
    if (error) throw error;
    return data as PushNotification;
  };

  const handleSend = async () => {
    if (!isValid) return;
    setSending(true);
    try {
      // ── Placeholder: OneSignal send will go here ──────────────────────────
      // When OneSignal is configured, replace this block with:
      //
      //   const { data } = await supabase.functions.invoke('send-push-notification', {
      //     body: { title, body, imageUrl, linkUrl, audience },
      //   });
      //   const saved = await saveToHistory('sent', { recipient_count: data.recipients });
      //
      // For now, we simulate a send and save to history:
      await new Promise((r) => setTimeout(r, 800)); // simulate network delay
      const saved = await saveToHistory('sent', { recipient_count: 0 });
      onSent(saved);
      toast.success('Notification sent! (OneSignal not yet connected — history saved.)');
      setTitle(''); setBody(''); setImageUrl(''); setLinkUrl(''); setAudience('all');
    } catch (err) {
      toast.error(`Failed to send: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!isValid) return;
    setSavingDraft(true);
    try {
      const saved = await saveToHistory('draft');
      onSent(saved);
      toast.success('Draft saved.');
      setTitle(''); setBody(''); setImageUrl(''); setLinkUrl('');
    } catch (err) {
      toast.error(`Failed to save draft: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center gap-3"
        style={{ background: 'hsl(var(--primary) / 0.06)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'hsl(var(--primary))' }}>
          <Bell size={17} className="text-white" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">Compose Notification</h2>
          <p className="text-xs text-muted-foreground">Message will be sent to all app users when OneSignal is connected.</p>
        </div>
      </div>

      {/* OneSignal not connected banner */}
      <div className="mx-6 mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
        <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-amber-800">OneSignal not yet connected</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Notifications will be saved to history but not delivered until OneSignal credentials are configured.
            See the setup guide in the top-right panel.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="px-6 py-5 space-y-5">
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
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 65))}
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
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 240))}
            placeholder="e.g. Join us for Jumu'ah Salah at 1:15 PM. Doors open at 12:45 PM. Jazakallah khayran."
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
                onClick={() => setAudience(opt.value)}
                className={`px-3 py-2.5 rounded-xl border text-left transition-all ${
                  audience === opt.value
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/40 hover:bg-muted/50'
                }`}
              >
                <p className={`text-xs font-semibold ${audience === opt.value ? 'text-primary' : 'text-foreground'}`}>
                  {opt.label}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{opt.description}</p>
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
          Advanced options (image, link)
        </button>

        {showAdvanced && (
          <div className="space-y-4 pl-4 border-l-2 border-border">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><ImageIcon size={12} /> Image URL <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">Displayed as a rich notification banner on supported devices.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Link2 size={12} /> Deep Link / URL <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com or myapp://screen"
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">Opens this URL when the user taps the notification.</p>
            </div>
          </div>
        )}

        {/* Preview */}
        {(title || body) && (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
              <Smartphone size={12} className="text-muted-foreground" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Preview</span>
            </div>
            <div className="px-4 py-3 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-primary/10">
                <span className="text-lg">🕌</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground leading-snug">{title || 'Notification title'}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body || 'Notification body will appear here.'}</p>
              </div>
              {imageUrl && (
                <div className="w-12 h-12 rounded-lg border border-border overflow-hidden shrink-0 bg-muted">
                  <img src={imageUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={!isValid || savingDraft || sending}
            className="gap-2"
          >
            {savingDraft ? <RefreshCw size={13} className="animate-spin" /> : <Clock size={13} />}
            Save Draft
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!isValid || sending || savingDraft}
            className="gap-2 px-5"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            {sending ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
            {sending ? 'Sending…' : 'Send Notification'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── History Row ─────────────────────────────────────────────────────────────

const HistoryRow = ({
  notif, onDelete,
}: {
  notif: PushNotification;
  onDelete: (id: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[notif.status] ?? statusConfig.draft;

  return (
    <div className="border-b border-border/60 last:border-0">
      <div
        className="px-4 py-3.5 flex items-start gap-3 hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Status dot */}
        <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
          notif.status === 'sent' ? 'bg-emerald-500' :
          notif.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
        }`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-snug truncate max-w-sm">{notif.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{notif.body}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.class}`}>
                {cfg.icon} {cfg.label}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                {timeAgo(notif.sent_at ?? notif.created_at)}
              </span>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
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
            onClick={() => onDelete(notif.id)}
            className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
            title="Delete"
          >
            <Trash2 size={13} className="text-destructive/60 hover:text-destructive" />
          </button>
          {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-7 pb-4 space-y-3">
          <div className="rounded-xl border border-border overflow-hidden text-xs">
            <div className="px-4 py-2 bg-muted/30 border-b border-border">
              <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Full notification</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex gap-3">
                <span className="text-muted-foreground w-20 shrink-0">Title</span>
                <span className="text-foreground font-medium">{notif.title}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-muted-foreground w-20 shrink-0">Message</span>
                <span className="text-foreground leading-relaxed">{notif.body}</span>
              </div>
              {notif.image_url && (
                <div className="flex gap-3">
                  <span className="text-muted-foreground w-20 shrink-0">Image</span>
                  <a href={notif.image_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{notif.image_url}</a>
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
              <div className="flex gap-3">
                <span className="text-muted-foreground w-20 shrink-0">Created</span>
                <span className="text-foreground">{new Date(notif.created_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}
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
        {
          step: '1',
          title: 'Create a free OneSignal account',
          desc: 'Go to onesignal.com → New App → configure Android/iOS platform.',
        },
        {
          step: '2',
          title: 'Get your App ID & REST API Key',
          desc: 'OneSignal Dashboard → Settings → Keys & IDs. Copy both values.',
        },
        {
          step: '3',
          title: 'Add credentials to this portal',
          desc: 'Ask the portal developer to add ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY as Edge Function secrets.',
        },
        {
          step: '4',
          title: 'Integrate OneSignal SDK in the mobile app',
          desc: 'The mobile dev installs OneSignal SDK — takes ~15 minutes. Device tokens are registered automatically.',
        },
        {
          step: '5',
          title: 'You\'re live!',
          desc: 'Notifications sent from this page will be delivered to all registered devices instantly.',
        },
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

// ─── Stats Cards ─────────────────────────────────────────────────────────────

const StatsRow = ({ notifications }: { notifications: PushNotification[] }) => {
  const sent = notifications.filter((n) => n.status === 'sent').length;
  const failed = notifications.filter((n) => n.status === 'failed').length;
  const drafts = notifications.filter((n) => n.status === 'draft').length;
  const totalDevices = notifications.reduce((acc, n) => acc + (n.recipient_count ?? 0), 0);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[
        { label: 'Total Sent', value: sent, icon: <Send size={14} />, accent: 'hsl(var(--primary))' },
        { label: 'Devices Reached', value: totalDevices.toLocaleString(), icon: <Smartphone size={14} />, accent: '#0ea5e9' },
        { label: 'Drafts', value: drafts, icon: <Clock size={14} />, accent: '#f59e0b' },
        { label: 'Failed', value: failed, icon: <XCircle size={14} />, accent: '#ef4444' },
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

// ─── Main Page ────────────────────────────────────────────────────────────────

const Notifications = () => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: notifications = [], isFetching, refetch } = useQuery({
    queryKey: ['push-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('push_notifications')
        .select('*')
        .order('created_at', { ascending: false });
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
    if (error) {
      toast.error('Failed to delete notification.');
      refetch();
    } else {
      toast.success('Deleted from history.');
    }
  };

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      const matchStatus = statusFilter === 'all' || n.status === statusFilter;
      const q = search.toLowerCase();
      const matchSearch = !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [notifications, statusFilter, search]);

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <Sidebar />

      <main className="flex-1 p-4 sm:p-8 overflow-x-auto pt-[4.5rem] md:pt-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>Push Notifications</h1>
            <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Compose and send notifications to app users · {notifications.length} in history
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2 self-start">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="mb-6">
          <StatsRow notifications={notifications} />
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
          {/* Left column */}
          <div className="space-y-6 min-w-0">
            <ComposePanel onSent={handleSent} />

            {/* History */}
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Clock size={14} style={{ color: 'hsl(var(--primary))' }} />
                  Notification History
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Search */}
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search…"
                      className="pl-7 h-8 text-xs w-36"
                    />
                  </div>
                  {/* Status filter */}
                  <div className="flex items-center gap-1">
                    <Filter size={11} className="text-muted-foreground" />
                    {(['all', 'sent', 'draft', 'failed'] as const).map((f) => {
                      const count = f === 'all' ? notifications.length : notifications.filter((n) => n.status === f).length;
                      return (
                        <button
                          key={f}
                          onClick={() => setStatusFilter(f)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                            statusFilter === f
                              ? 'border-primary bg-primary/8 text-primary'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Bell size={32} className="opacity-20" />
                  <p className="text-sm">
                    {notifications.length === 0
                      ? 'No notifications sent yet. Compose your first one above.'
                      : 'No results match your filter.'}
                  </p>
                </div>
              ) : (
                <div>
                  {filtered.map((notif) => (
                    <HistoryRow key={notif.id} notif={notif} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-5">
            <SetupGuide />

            {/* Quick tips */}
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">Writing Tips</h3>
              </div>
              <div className="px-5 py-4 space-y-3">
                {[
                  { icon: '✍️', tip: 'Keep titles under 50 characters — they get truncated on lock screens.' },
                  { icon: '📢', tip: 'Lead with the most important information in the first sentence.' },
                  { icon: '⏰', tip: 'Send time-sensitive notices (Jumu\'ah, Taraweeh) at least 2 hours early.' },
                  { icon: '🌙', tip: 'Avoid sending between 10pm and 6am to respect quiet hours.' },
                  { icon: '🔗', tip: 'Add a deep link to take users directly to the relevant app screen.' },
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

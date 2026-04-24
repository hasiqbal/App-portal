
import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '#/lib/api';
import { Announcement, AnnouncementPayload } from '#/types';
import Sidebar from '#/components/layout/Sidebar';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Loader2, AlertCircle, RefreshCw,
  Bell, BellOff, GripVertical, ToggleLeft, ToggleRight, Link2, ExternalLink,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Type, Palette, ImagePlus, X, Eye,
  EyeOff,
  Users, Clock3,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay, DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TipTapUnderline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { supabaseAdmin } from '#/lib/supabase';
import { useUrduTranslation } from '#/hooks/useUrduTranslation';
import { Extension } from '@tiptap/core';

const FONT_SIZES = ['12px','14px','16px','18px','20px','24px','28px','32px','40px'];
const TEXT_COLORS = ['#000000','#1a1a2e','#374151','#6b7280','#dc2626','#ea580c','#d97706','#16a34a','#0284c7','#7c3aed','#db2777','#0f766e','#ffffff','#f8fafc','#fef3c7','#dbeafe'];
const ANNOUNCEMENTS_EVENTS_BUCKET = (import.meta.env.VITE_ANNOUNCEMENTS_EVENTS_BUCKET ?? '').trim();
const ANNOUNCEMENT_TYPE_OPTIONS = ['Urgent', 'Jalsa', 'Public Safety', 'Class', 'Special', 'Ramadan', 'Eid', 'Jumuah', 'Lecture', 'Workshop', 'Community', 'Youth', 'Funeral', 'Nikah'];

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{ types: this.options.types, attributes: { fontSize: { default: null, parseHTML: (el) => el.style.fontSize || null, renderHTML: (attrs) => { if (!attrs.fontSize) return {}; return { style: `font-size: ${attrs.fontSize}` }; } } } }];
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }: { chain: () => { setMark: (m: string, a: Record<string, unknown>) => { run: () => boolean } } }) => {
        return chain().setMark('textStyle', { fontSize }).run();
      },
    };
  },
});

const RichTextEditor = ({ content, onChange }: { content: string; onChange: (html: string) => void }) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), TipTapUnderline, TextAlign.configure({ types: ['heading', 'paragraph'] }), TextStyle, Color, FontSize],
    content: content || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: { attributes: { class: 'min-h-[140px] px-4 py-3 text-sm leading-relaxed focus:outline-none' } },
  });
  if (!editor) return null;
  const ToolBtn = ({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
    <button type="button" onMouseDown={(e) => { e.preventDefault(); onClick(); }} title={title}
      className={`w-7 h-7 flex items-center justify-center rounded transition-colors text-sm ${active ? 'bg-[hsl(142_50%_93%)] text-[hsl(142_60%_28%)]' : 'text-muted-foreground hover:bg-[hsl(140_20%_94%)] hover:text-foreground'}`}>
      {children}
    </button>
  );
  const Divider = () => <div className="w-px h-5 bg-[hsl(140_20%_88%)] mx-0.5 shrink-0" />;
  return (
    <div className="rounded-xl border border-[hsl(140_20%_88%)] overflow-hidden focus-within:ring-2 focus-within:ring-[hsl(142_60%_35%/0.3)] focus-within:border-[hsl(142_50%_70%)]">
      <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-[hsl(140_20%_88%)] bg-[hsl(140_30%_97%)]">
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold"><Bold size={13} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><Italic size={13} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline"><Underline size={13} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough"><span className="text-xs font-bold line-through">S</span></ToolBtn>
        <Divider />
        <div className="relative">
          <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowSizePicker((v) => !v); setShowColorPicker(false); }}
            className="flex items-center gap-1 px-1.5 h-7 rounded text-xs text-muted-foreground hover:bg-[hsl(140_20%_94%)] hover:text-foreground">
            <Type size={12} /><span className="text-[11px]">Size</span>
          </button>
          {showSizePicker && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[hsl(140_20%_88%)] rounded-lg shadow-lg p-1 min-w-[90px]">
              {FONT_SIZES.map((size) => (
                <button key={size} type="button" onMouseDown={(e) => { e.preventDefault(); (editor.chain().focus() as ReturnType<typeof editor.chain> & { setFontSize: (size: string) => unknown }).setFontSize(size).run(); setShowSizePicker(false); }}
                  className="w-full text-left px-2 py-1 text-xs hover:bg-[hsl(142_50%_95%)] rounded" style={{ fontSize: size }}>{size}</button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowColorPicker((v) => !v); setShowSizePicker(false); }}
            className="flex items-center gap-1 px-1.5 h-7 rounded text-xs text-muted-foreground hover:bg-[hsl(140_20%_94%)] hover:text-foreground">
            <Palette size={12} /><span className="text-[11px]">Colour</span>
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[hsl(140_20%_88%)] rounded-lg shadow-lg p-2" style={{ minWidth: 160 }}>
              <div className="grid grid-cols-8 gap-1">
                {TEXT_COLORS.map((color) => (
                  <button key={color} type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(color).run(); setShowColorPicker(false); }}
                    className="w-5 h-5 rounded border border-border/50 hover:scale-110 transition-transform" style={{ background: color }} />
                ))}
              </div>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetColor().run(); setShowColorPicker(false); }} className="mt-1.5 w-full text-[11px] text-muted-foreground hover:text-foreground">Reset colour</button>
            </div>
          )}
        </div>
        <Divider />
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="H1"><span className="text-[11px] font-bold">H1</span></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="H2"><span className="text-[11px] font-bold">H2</span></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="H3"><span className="text-[11px] font-bold">H3</span></ToolBtn>
        <Divider />
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Left"><AlignLeft size={13} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Centre"><AlignCenter size={13} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Right"><AlignRight size={13} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify"><AlignJustify size={13} /></ToolBtn>
        <Divider />
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list"><List size={13} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list"><ListOrdered size={13} /></ToolBtn>
        <Divider />
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().clearNodes().unsetAllMarks().run(); }} className="px-1.5 h-7 flex items-center rounded text-[11px] text-muted-foreground hover:bg-[hsl(140_20%_94%)]">Clear</button>
      </div>
      <EditorContent editor={editor} className="prose prose-sm max-w-none" />
    </div>
  );
};

const EMPTY_FORM = { title: '', type: '', urdu_title: '', body: '', urdu_body: '', tag: false, lead_names: '', urdu_lead_names: '', start_time: '', link_url: '', image_url: '', is_active: true, display_order: 0 };

type TimeSlotDraft = {
  start: string;
  end: string;
};

function splitAnnouncementTimeEntries(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s*\|\s*|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseTimeSlots(value: string | null | undefined): TimeSlotDraft[] {
  const entries = splitAnnouncementTimeEntries(value);
  const slots = entries.map((entry) => {
    const rangeMatch = entry.match(/^(.*?)\s*[-\u2013]\s*(.*?)$/);
    if (!rangeMatch) {
      return { start: entry, end: '' };
    }
    return {
      start: rangeMatch[1].trim(),
      end: rangeMatch[2].trim(),
    };
  });
  return slots.length > 0 ? slots : [{ start: '', end: '' }];
}

function serializeTimeSlots(slots: TimeSlotDraft[]): string {
  return slots
    .map((slot) => {
      const start = slot.start.trim();
      const end = slot.end.trim();
      if (!start && !end) return '';
      if (start && end) return `${start} - ${end}`;
      return start || end;
    })
    .filter((entry) => entry.length > 0)
    .join(' | ');
}

function formatSimpleTimeForDisplay(value: string): string {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const hour24 = Number(match[1]);
  const minute = match[2];
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${meridiem}`;
}

function sanitizeAnnouncementHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((node) => node.remove());
  doc.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        return;
      }
      if ((name === 'href' || name === 'src') && /^javascript:/i.test(value)) {
        el.removeAttribute(attr.name);
        return;
      }
      if (name === 'style' && /(expression\s*\(|javascript:|url\s*\()/i.test(value)) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return doc.body.innerHTML;
}

const AnnouncementLivePreview = ({
  title,
  body,
  imageUrl,
  linkUrl,
  type,
  leadNames,
  startTime,
}: {
  title: string;
  body: string;
  imageUrl: string;
  linkUrl: string;
  type: string;
  leadNames: string;
  startTime: string;
}) => {
  const previewHtml = sanitizeAnnouncementHtml(body).trim();
  const formattedStartTimes = splitAnnouncementTimeEntries(startTime).map(formatSimpleTimeForDisplay);

  return (
    <div className="mx-auto w-full max-w-[320px] rounded-[2.4rem] bg-[#0f0f0f] p-2 shadow-[0_22px_42px_rgba(0,0,0,0.22)]">
      <div className="overflow-hidden rounded-[2rem] border border-[#202020] bg-[#f2f2f7]">
        <div className="flex justify-center py-2 bg-[#0f0f0f]">
          <div className="h-6 w-24 rounded-full bg-[#1b1b1b]" />
        </div>

        <div className="bg-white px-4 py-3 border-b border-[#e5e5ea] flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#f2f2f7] flex items-center justify-center">
            <Bell size={12} className="text-[#1c1c1e]" />
          </div>
          <span className="text-[13px] font-bold text-[#1c1c1e]">Announcements</span>
        </div>

        <div className="px-3 py-3 min-h-[470px] bg-[#f2f2f7]">
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#e5e5ea]">
            {imageUrl ? (
              <div className="w-full overflow-hidden max-h-[180px]">
                <img
                  src={imageUrl}
                  alt="Poster"
                  className="w-full object-cover max-h-[180px]"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            ) : (
              <div className="h-[96px] w-full bg-[#f2f2f7] flex flex-col items-center justify-center gap-1 text-[#aeaeb2]">
                <ImagePlus size={20} />
                <span className="text-[10px]">No poster</span>
              </div>
            )}

            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                <span className="text-[10px] font-bold text-[#34c759] uppercase tracking-wide">JMN</span>
                <span className="text-[10px] text-[#aeaeb2]">
                  {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                {type ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#fff4f2] text-[#c2410c] border border-[#fdba74]">{type}</span> : null}
              </div>

              <h3 className="font-bold text-[#1c1c1e] leading-snug mb-2 text-[15px]">
                {title || <span className="text-[#aeaeb2] italic">Announcement title...</span>}
              </h3>

              {previewHtml ? (
                <div
                  className="text-[#3c3c43] leading-relaxed text-[13px] [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-bold [&_em]:italic [&_u]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:mb-1 [&_h1]:text-[17px] [&_h1]:font-bold [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:text-[14px] [&_h3]:font-semibold"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <p className="text-[#aeaeb2] italic text-[13px]">No description...</p>
              )}

              {(leadNames || formattedStartTimes.length > 0) ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {leadNames ? <span className="text-[11px] text-[#6b7280]">{leadNames}</span> : null}
                  {formattedStartTimes.map((timeEntry) => (
                    <span key={timeEntry} className="text-[11px] text-[#6b7280]">{timeEntry}</span>
                  ))}
                </div>
              ) : null}

              {linkUrl ? (
                <div className="mt-3 pt-3 border-t border-[#e5e5ea]">
                  <div className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 bg-[#34c759]">
                    <ExternalLink size={12} className="text-white" />
                    <span className="text-white font-semibold text-[13px]">More Info</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex justify-center py-2 bg-[#f2f2f7]">
          <div className="w-28 h-1 rounded-full bg-[#1c1c1e]/20" />
        </div>
      </div>
    </div>
  );
};

const AnnouncementModal = ({ item, open, onClose, onSaved }: { item: Announcement | null; open: boolean; onClose: () => void; onSaved: (a: Announcement) => void }) => {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [timeSlots, setTimeSlots] = useState<TimeSlotDraft[]>([{ start: '', end: '' }]);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const { translateToUrdu, translating: translatingUrdu } = useUrduTranslation();

  const handleTranslateUrdu = async () => {
    const rawBody = form.body ? form.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const src = rawBody || form.title || '';
    if (!src.trim()) { toast.error('No English text to translate.'); return; }
    const urdu = await translateToUrdu(src);
    if (!urdu) return;
    setForm((prev) => ({ ...prev, urdu_body: urdu }));
    toast.success('Urdu translation generated.');
  };

  const handleTranslateUrduTitle = async () => {
    const src = form.title?.trim() || '';
    if (!src) { toast.error('No English title to translate.'); return; }
    const urdu = await translateToUrdu(src);
    if (!urdu) return;
    setForm((prev) => ({ ...prev, urdu_title: urdu }));
    toast.success('Urdu title generated.');
  };

  const handleTranslateUrduGuests = async () => {
    const src = form.lead_names?.trim() || '';
    if (!src) { toast.error('No English guest/teacher names to translate.'); return; }
    const urdu = await translateToUrdu(src);
    if (!urdu) return;
    setForm((prev) => ({ ...prev, urdu_lead_names: urdu }));
    toast.success('Urdu guest names generated.');
  };
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [lastItem, setLastItem] = useState(item);
  if (item !== lastItem) {
    setLastItem(item);
    setForm(item ? { title: item.title, type: (item as Announcement & { type?: string | null }).type ?? '', urdu_title: (item as Announcement & { urdu_title?: string | null }).urdu_title ?? '', body: item.body ?? '', urdu_body: (item as Announcement & { urdu_body?: string | null }).urdu_body ?? '', tag: Boolean((item as Announcement & { tag?: boolean | null }).tag), lead_names: (item as Announcement & { lead_names?: string | null }).lead_names ?? '', urdu_lead_names: (item as Announcement & { urdu_lead_names?: string | null }).urdu_lead_names ?? '', start_time: (item as Announcement & { start_time?: string | null }).start_time ?? '', link_url: item.link_url ?? '', image_url: item.image_url ?? '', is_active: item.is_active, display_order: item.display_order } : { ...EMPTY_FORM });
    setTimeSlots(parseTimeSlots((item as Announcement & { start_time?: string | null } | null)?.start_time ?? ''));
    setShowMobilePreview(false);
  }

  const set = <K extends keyof typeof EMPTY_FORM>(k: K, v: (typeof EMPTY_FORM)[K]) => setForm((prev) => ({ ...prev, [k]: v }));
  const updateTimeSlot = (index: number, key: keyof TimeSlotDraft, value: string) => {
    setTimeSlots((prev) => prev.map((slot, slotIndex) => (slotIndex === index ? { ...slot, [key]: value } : slot)));
  };
  const addTimeSlot = () => {
    setTimeSlots((prev) => [...prev, { start: '', end: '' }]);
  };
  const removeTimeSlot = (index: number) => {
    setTimeSlots((prev) => {
      if (prev.length <= 1) return [{ start: '', end: '' }];
      return prev.filter((_, slotIndex) => slotIndex !== index);
    });
  };
  const serializedStartTime = serializeTimeSlots(timeSlots);

  const handleUpload = async (file: File) => {
    if (!ANNOUNCEMENTS_EVENTS_BUCKET) {
      toast.error('Missing VITE_ANNOUNCEMENTS_EVENTS_BUCKET in .env');
      return;
    }
    setUploadingImage(true);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `announcements/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabaseAdmin.storage
      .from(ANNOUNCEMENTS_EVENTS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    setUploadingImage(false);
    if (error || !data) { toast.error('Upload failed: ' + (error?.message ?? 'Unknown')); return; }
    const { data: urlData } = supabaseAdmin.storage
      .from(ANNOUNCEMENTS_EVENTS_BUCKET)
      .getPublicUrl(data.path);
    set('image_url', urlData.publicUrl);
    toast.success('Poster uploaded.');
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!form.title?.trim()) { toast.error('Title is required.'); return; }
    setSaving(true);
    try {
      const payload: Partial<AnnouncementPayload> = { title: form.title.trim(), type: form.type?.trim() || null, urdu_title: form.urdu_title?.trim() || null, body: form.body?.trim() || null, urdu_body: (form as typeof EMPTY_FORM & { urdu_body?: string }).urdu_body?.trim() || null, tag: Boolean(form.tag), lead_names: form.lead_names?.trim() || null, urdu_lead_names: form.urdu_lead_names?.trim() || null, start_time: serializedStartTime || null, link_url: form.link_url?.trim() || null, image_url: form.image_url?.trim() || null, is_active: form.is_active ?? true, display_order: Number(form.display_order) || 0 } as Partial<AnnouncementPayload>;
      const saved = item ? await updateAnnouncement(item.id, payload) : await createAnnouncement(payload);
      toast.success(item ? 'Announcement updated.' : 'Announcement created.');
      onSaved(saved);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to save.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[100vw] sm:w-[98vw] max-w-[98vw] h-[100dvh] sm:h-[92vh] sm:max-h-[92vh] overflow-hidden p-0 rounded-none sm:rounded-lg flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-[hsl(140_20%_92%)] bg-gradient-to-r from-[hsl(142_55%_28%)] via-[hsl(152_50%_32%)] to-[hsl(168_48%_36%)] text-white">
          <DialogTitle className="text-sm sm:text-base font-bold flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/20 ring-1 ring-white/30 flex items-center justify-center shrink-0">
              <Bell size={15} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate">{item ? 'Edit Announcement' : 'New Announcement'}</p>
              <p className="text-[11px] text-white/85 mt-1 hidden sm:block">Live preview mirrors how this announcement renders in the app.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="lg:hidden gap-1 bg-white/10 border-white/25 text-white hover:bg-white/20 hover:text-white h-8"
              onClick={() => setShowMobilePreview((value) => !value)}
            >
              {showMobilePreview ? <EyeOff size={14} /> : <Eye size={14} />} {showMobilePreview ? 'Editor' : 'Preview'}
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_390px] h-full min-h-0 overflow-hidden">
            <div className={`${showMobilePreview ? 'hidden' : 'block'} lg:block min-h-0 overflow-y-auto px-4 sm:px-6 py-4 border-r border-[hsl(140_20%_92%)]`}>
              <div className="space-y-5 pb-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Title <span className="text-destructive">*</span></Label>
              <Input value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Ramadan Timetable Now Available" className="h-9" autoFocus />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Urdu Title <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <button type="button" disabled={translatingUrdu} onClick={handleTranslateUrduTitle}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-violet-300 text-violet-700 text-[11px] font-semibold hover:bg-violet-50 disabled:opacity-50 transition-colors">
                  {translatingUrdu ? <><Loader2 size={11} className="animate-spin" /> Translating…</> : <>🌐 Auto-translate title</>}
                </button>
              </div>
              <Input
                value={form.urdu_title ?? ''}
                onChange={(e) => set('urdu_title', e.target.value)}
                placeholder="اردو عنوان یہاں لکھیں…"
                dir="rtl"
                className="h-9 text-sm text-right"
                style={{ fontFamily: "'UrduNastaliq', 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif" }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Description (English)</Label>
              <RichTextEditor content={form.body ?? ''} onChange={(html) => set('body', html)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => set('tag', true)}
                  className={`px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${form.tag ? 'border-[hsl(142_55%_45%)] bg-[hsl(142_60%_94%)] text-[hsl(142_65%_28%)]' : 'border-[hsl(140_20%_88%)] bg-white text-muted-foreground hover:bg-[hsl(140_25%_96%)]'}`}
                >
                  Event
                </button>
                <button
                  type="button"
                  onClick={() => set('tag', false)}
                  className={`px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${!form.tag ? 'border-[hsl(142_55%_45%)] bg-[hsl(142_60%_94%)] text-[hsl(142_65%_28%)]' : 'border-[hsl(140_20%_88%)] bg-white text-muted-foreground hover:bg-[hsl(140_25%_96%)]'}`}
                >
                  Announcement
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">Event saves tag as true. Announcement saves tag as false.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Tag Type <span className="text-muted-foreground font-normal text-xs">(updates type column)</span></Label>
              <div className="flex flex-wrap gap-2">
                {ANNOUNCEMENT_TYPE_OPTIONS.map((option) => {
                  const active = (form.type ?? '').toLowerCase() === option.toLowerCase();
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => set('type', option)}
                      className={`px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors ${active ? 'border-[hsl(8_70%_50%)] bg-[hsl(8_90%_95%)] text-[hsl(8_80%_40%)]' : 'border-[hsl(140_20%_88%)] bg-white text-muted-foreground hover:bg-[hsl(140_25%_96%)]'}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              <Input
                value={form.type ?? ''}
                onChange={(e) => set('type', e.target.value)}
                placeholder="Custom type (e.g. Family Program)"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Leading Teacher / Guest Speakers <span className="text-muted-foreground font-normal text-xs">(optional, comma-separated)</span></Label>
              <Input
                value={form.lead_names ?? ''}
                onChange={(e) => set('lead_names', e.target.value)}
                placeholder="e.g. Sheikh Abdullah, Mufti Ahmad"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Urdu Guest / Teacher Names <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <button type="button" disabled={translatingUrdu} onClick={handleTranslateUrduGuests}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-violet-300 text-violet-700 text-[11px] font-semibold hover:bg-violet-50 disabled:opacity-50 transition-colors">
                  {translatingUrdu ? <><Loader2 size={11} className="animate-spin" /> Translating…</> : <>🌐 Auto-translate guests</>}
                </button>
              </div>
              <Input
                value={form.urdu_lead_names ?? ''}
                onChange={(e) => set('urdu_lead_names', e.target.value)}
                placeholder="مہمان یا استاد کے نام…"
                dir="rtl"
                className="h-9 text-sm text-right"
                style={{ fontFamily: "'UrduNastaliq', 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif" }}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Event Time Slots <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <button
                  type="button"
                  onClick={addTimeSlot}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] text-[11px] font-semibold hover:bg-[hsl(142_50%_95%)] transition-colors"
                >
                  <Plus size={11} /> Add slot
                </button>
              </div>
              <div className="space-y-2">
                {timeSlots.map((slot, slotIndex) => (
                  <div key={`time-slot-${slotIndex}`} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <Input
                      value={slot.start}
                      onChange={(e) => updateTimeSlot(slotIndex, 'start', e.target.value)}
                      placeholder="Start (e.g. 1:30 PM)"
                      className="h-9 text-sm"
                    />
                    <Input
                      value={slot.end}
                      onChange={(e) => updateTimeSlot(slotIndex, 'end', e.target.value)}
                      placeholder="End (e.g. 2:15 PM)"
                      className="h-9 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeTimeSlot(slotIndex)}
                      className="w-9 h-9 rounded-lg border border-[hsl(140_20%_88%)] text-muted-foreground hover:bg-[hsl(140_25%_96%)] hover:text-foreground flex items-center justify-center"
                      aria-label="Remove time slot"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Add one row per event session. Example: 1:30 PM - 2:15 PM | 2:30 PM - 3:15 PM</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Urdu Description <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <button type="button" disabled={translatingUrdu} onClick={handleTranslateUrdu}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-violet-300 text-violet-700 text-[11px] font-semibold hover:bg-violet-50 disabled:opacity-50 transition-colors">
                  {translatingUrdu ? <><Loader2 size={11} className="animate-spin" /> Translating…</> : <>🌐 Auto-translate</>}
                </button>
              </div>
              <textarea
                value={(form as typeof EMPTY_FORM).urdu_body ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, urdu_body: e.target.value }))}
                placeholder="اردو تفصیل یہاں لکھیں…"
                dir="rtl"
                rows={3}
                className="w-full rounded-xl border border-[hsl(140_20%_88%)] bg-background px-4 py-3 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[hsl(142_60%_35%/0.3)] focus:border-[hsl(142_50%_70%)] resize-none"
                style={{ fontFamily: "'UrduNastaliq', 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif", lineHeight: '2.4' }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5"><ImagePlus size={13} className="text-muted-foreground" />Event Poster / Image<span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              {form.image_url ? (
                <div className="relative rounded-xl overflow-hidden border border-[hsl(140_20%_88%)] bg-muted/30" style={{ maxHeight: 260 }}>
                  <img src={form.image_url} alt="Poster preview" className="w-full object-contain" style={{ maxHeight: 260 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <button type="button" onClick={() => set('image_url', '')} className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 shadow"><X size={14} /></button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[hsl(140_20%_88%)] bg-[hsl(140_30%_97%)] py-8 cursor-pointer hover:border-[hsl(142_50%_70%)] hover:bg-[hsl(142_50%_97%)] transition-colors" onClick={() => imageInputRef.current?.click()}>
                  {uploadingImage ? <><Loader2 size={20} className="animate-spin text-muted-foreground" /><p className="text-xs text-muted-foreground">Uploading…</p></> : <><ImagePlus size={24} className="text-muted-foreground/50" /><p className="text-xs text-muted-foreground">Click to upload a poster</p><p className="text-[11px] text-muted-foreground/60">JPG, PNG, WebP up to 10MB</p></>}
                </div>
              )}
              <div className="flex gap-2">
                <Input value={form.image_url ?? ''} onChange={(e) => set('image_url', e.target.value)} placeholder="Or paste a public image URL…" className="flex-1 text-sm h-9" />
                <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] text-xs font-medium hover:bg-[hsl(142_50%_95%)] transition-colors disabled:opacity-50 shrink-0">
                  {uploadingImage ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}{uploadingImage ? 'Uploading…' : 'Upload'}
                </button>
              </div>
              <input ref={imageInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUpload(file); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5"><Link2 size={13} className="text-muted-foreground" />More Info URL<span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input value={form.link_url ?? ''} onChange={(e) => set('link_url', e.target.value)} placeholder="https://example.com/announcement" type="url" className="h-9 text-sm" />
            </div>
            <div className="flex items-end gap-4">
              <div className="space-y-1.5 w-28">
                <Label className="text-sm font-medium">Display Order</Label>
                <Input type="number" value={form.display_order ?? 0} onChange={(e) => set('display_order', parseInt(e.target.value) || 0)} className="h-9 font-mono text-sm" min={0} />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-sm font-medium">Status</Label>
                <button type="button" onClick={() => set('is_active', !form.is_active)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all w-full ${form.is_active ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                  {form.is_active ? <><ToggleRight size={16} className="text-emerald-500" />Active — visible in app</> : <><ToggleLeft size={16} className="text-slate-400" />Inactive — hidden</>}
                </button>
              </div>
            </div>
              </div>
            </div>

            <aside className={`${showMobilePreview ? 'block' : 'hidden'} lg:block min-h-0 overflow-y-auto bg-gradient-to-b from-[hsl(140_30%_98%)] to-white`}>
              <div className="sticky top-0 z-10 border-b border-[hsl(140_20%_92%)] bg-white/95 backdrop-blur px-4 py-2 flex items-center gap-2">
                <Eye size={14} className="text-[hsl(142_60%_32%)]" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(142_30%_30%)]">Live preview</p>
                  <p className="text-[10px] text-muted-foreground">Mirrors how the app renders this announcement.</p>
                </div>
              </div>
              <div className="p-4">
                <AnnouncementLivePreview
                  title={form.title ?? ''}
                  body={form.body ?? ''}
                  imageUrl={form.image_url ?? ''}
                  linkUrl={form.link_url ?? ''}
                  type={form.type ?? ''}
                  leadNames={form.lead_names ?? ''}
                  startTime={serializedStartTime}
                />
              </div>
            </aside>
          </div>
        </div>

        <DialogFooter className="px-4 sm:px-6 py-3 border-t border-[hsl(140_20%_92%)] bg-white"> {/* This was the missing closing tag */}
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {item ? 'Save Changes' : 'Create Announcement'}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AnnouncementCard = ({ item, onEdit, onToggle, onDelete, isDragOverlay }: { item: Announcement; onEdit: (a: Announcement) => void; onToggle: (a: Announcement) => void; onDelete: (a: Announcement) => void; isDragOverlay?: boolean }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try { await deleteAnnouncement(item.id); toast.success('Deleted.'); onDelete(item); } catch { toast.error('Failed.'); } finally { setDeleting(false); }
  };

  const handleToggle = async () => {
    setToggling(true);
    try { const updated = await updateAnnouncement(item.id, { is_active: !item.is_active }); toast.success(updated.is_active ? 'Activated.' : 'Deactivated.'); onToggle(updated); } catch { toast.error('Failed.'); } finally { setToggling(false); }
  };

  const plainBody = item.body ? item.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : null;
  const formattedTimeEntries = splitAnnouncementTimeEntries(item.start_time).map(formatSimpleTimeForDisplay);
  const formattedStartTime = formattedTimeEntries.length === 0
    ? null
    : formattedTimeEntries.length === 1
      ? formattedTimeEntries[0]
      : `${formattedTimeEntries[0]} +${formattedTimeEntries.length - 1} more`;

  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className={`group rounded-2xl border overflow-hidden transition-all bg-white ${isDragOverlay ? 'shadow-xl border-[hsl(142_50%_70%)] rotate-1' : item.is_active ? 'border-[hsl(140_20%_88%)] hover:border-[hsl(142_50%_70%)] hover:shadow-sm' : 'border-dashed border-[hsl(140_15%_88%)] opacity-60'}`}>
      {item.image_url && (
        <div className="w-full overflow-hidden" style={{ maxHeight: 180 }}>
          <img src={item.image_url} alt={item.title} className="w-full object-cover" style={{ maxHeight: 180 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}
      <div className="flex items-start gap-3 px-5 py-4">
        <button {...attributes} {...listeners} className="shrink-0 mt-1 touch-none cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground transition-colors p-0.5 rounded" tabIndex={-1}>
          <GripVertical size={14} />
        </button>
        <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5 ${item.is_active ? 'bg-[hsl(142_50%_93%)]' : 'bg-muted'}`}>
          {item.is_active ? <Bell size={14} className="text-[hsl(142_60%_32%)]" /> : <BellOff size={14} className="text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm leading-snug text-[hsl(150_30%_12%)]">{item.title}</h3>
            <div className="shrink-0 flex items-center gap-1">
              {item.type && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[hsl(8_90%_95%)] text-[hsl(8_80%_40%)] border border-[hsl(8_60%_85%)]">{item.type}</span>}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {item.is_active ? 'LIVE' : 'OFF'}
              </span>
            </div>
          </div>
          {plainBody && <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{plainBody}</p>}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {item.lead_names && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Users size={10} /> {item.lead_names}</span>}
            {formattedStartTime && <span className="text-[11px] text-muted-foreground flex items-center gap-1" title={formattedTimeEntries.join(' | ')}><Clock3 size={10} /> {formattedStartTime}</span>}
            {item.image_url && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><ImagePlus size={10} /> Poster</span>}
            {item.link_url && <a href={item.link_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] font-medium text-[hsl(142_60%_35%)] hover:underline"><ExternalLink size={10} /> More Info</a>}
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-1.5">Order: {item.display_order} · Updated {new Date(item.updated_at).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={handleToggle} disabled={toggling} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[hsl(140_20%_94%)] transition-colors disabled:opacity-40">
            {toggling ? <Loader2 size={13} className="animate-spin text-muted-foreground" /> : item.is_active ? <ToggleRight size={15} className="text-emerald-600" /> : <ToggleLeft size={15} className="text-muted-foreground" />}
          </button>
          <button onClick={() => onEdit(item)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[hsl(140_20%_94%)] transition-colors"><Pencil size={13} className="text-muted-foreground" /></button>
          <button onClick={handleDelete} disabled={deleting} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-40">
            {deleting ? <Loader2 size={13} className="animate-spin text-muted-foreground" /> : <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />}
          </button>
        </div>
      </div>
    </div>
  );
};

const Announcements = () => {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<Announcement[], Error>({ queryKey: ['announcements'], queryFn: fetchAnnouncements, staleTime: 60_000 });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (a: Announcement) => { setEditing(a); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const handleSaved = useCallback((saved: Announcement) => {
    queryClient.setQueryData<Announcement[]>(['announcements'], (old) => { if (!old) return [saved]; const exists = old.some((a) => a.id === saved.id); return exists ? old.map((a) => (a.id === saved.id ? saved : a)) : [saved, ...old]; });
    closeModal();
  }, [queryClient]);

  const handleToggle = (updated: Announcement) => queryClient.setQueryData<Announcement[]>(['announcements'], (old) => old ? old.map((a) => (a.id === updated.id ? updated : a)) : old);
  const handleDelete = (deleted: Announcement) => queryClient.setQueryData<Announcement[]>(['announcements'], (old) => old ? old.filter((a) => a.id !== deleted.id) : old);

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id || !data) return;
    const oldIndex = data.findIndex((a) => a.id === active.id);
    const newIndex = data.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(data, oldIndex, newIndex);
    const withNewOrders = reordered.map((a, i) => ({ ...a, display_order: (i + 1) * 10 }));
    queryClient.setQueryData<Announcement[]>(['announcements'], withNewOrders);
    const changed = withNewOrders.filter((a, i) => a.display_order !== data[i]?.display_order);
    try { await Promise.all(changed.map((a) => updateAnnouncement(a.id, { display_order: a.display_order }))); } catch { toast.error('Failed to save order.'); queryClient.setQueryData(['announcements'], data); }
  };

  const activeItem = activeId ? (data ?? []).find((a) => a.id === activeId) : null;

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 pt-14 md:pt-0">
        {/* Banner */}
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <Bell size={20} className="text-[hsl(142_60%_32%)]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[hsl(150_30%_12%)]">Announcements</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data ? `${data.filter((a) => a.is_active).length} live · ${data.filter((a) => !a.is_active).length} inactive · drag to reorder` : 'Manage app announcements'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
                <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
              </Button>
              <Button size="sm" onClick={openNew} className="gap-2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                <Plus size={14} /> New Announcement
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-8 py-6 flex-1 max-w-3xl">
          {isLoading && <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground"><Loader2 size={20} className="animate-spin text-[hsl(142_60%_35%)]" /><span className="text-sm">Loading…</span></div>}
          {isError && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-sm text-destructive">
              <AlertCircle size={16} />
              <div className="flex flex-col gap-0.5">
                <span>Failed to load. Try refreshing.</span>
                {error?.message && <span className="text-xs opacity-80">{error.message}</span>}
              </div>
            </div>
          )}
          {!isLoading && !isError && data && (
            data.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground rounded-2xl border-2 border-dashed border-[hsl(140_20%_88%)] bg-white">
                <Bell size={32} className="opacity-20" />
                <p className="text-sm">No announcements yet.</p>
                <Button size="sm" onClick={openNew} variant="outline" className="gap-2"><Plus size={13} /> Create first announcement</Button>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
                <SortableContext items={data.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {data.map((a) => <AnnouncementCard key={a.id} item={a} onEdit={openEdit} onToggle={handleToggle} onDelete={handleDelete} />)}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeItem && <AnnouncementCard item={activeItem} onEdit={() => {}} onToggle={() => {}} onDelete={() => {}} isDragOverlay />}
                </DragOverlay>
              </DndContext>
            )
          )}
        </div>
      </main>
      <AnnouncementModal open={modalOpen} item={editing} onClose={closeModal} onSaved={handleSaved} />
    </div>
  );
};

export default Announcements;


import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/lib/api';
import { Announcement, AnnouncementPayload } from '@/types';
import Sidebar from '@/components/layout/Sidebar';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Loader2, AlertCircle, RefreshCw,
  Bell, BellOff, GripVertical, ToggleLeft, ToggleRight, Link2, ExternalLink,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Type, Palette, ImagePlus, X, Smartphone, Eye,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { supabase } from '@/lib/supabase';
import { Extension } from '@tiptap/core';

const FONT_SIZES = ['12px','14px','16px','18px','20px','24px','28px','32px','40px'];
const TEXT_COLORS = ['#000000','#1a1a2e','#374151','#6b7280','#dc2626','#ea580c','#d97706','#16a34a','#0284c7','#7c3aed','#db2777','#0f766e','#ffffff','#f8fafc','#fef3c7','#dbeafe'];

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{ types: this.options.types, attributes: { fontSize: { default: null, parseHTML: (el) => el.style.fontSize || null, renderHTML: (attrs) => { if (!attrs.fontSize) return {}; return { style: `font-size: ${attrs.fontSize}` }; } } } }];
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }: { chain: () => unknown }) => {
        return (chain() as ReturnType<typeof chain> & { setMark: (m: string, a: Record<string, unknown>) => unknown }).setMark('textStyle', { fontSize });
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

const EMPTY_FORM = { title: '', body: '', urdu_body: '', link_url: '', image_url: '', is_active: true, display_order: 0 };

// ─── Phone Preview Modal ──────────────────────────────────────────────────────

const AnnouncementPreviewModal = ({
  open,
  onClose,
  title,
  body,
  imageUrl,
  linkUrl,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  imageUrl: string;
  linkUrl: string;
}) => {
  if (!open) return null;
  const plainBody = body ? body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
        {/* Label */}
        <div className="flex items-center gap-2">
          <Smartphone size={14} className="text-white/70" />
          <span className="text-white/70 text-xs font-medium">Mobile App Preview</span>
          <button onClick={onClose} className="ml-2 text-white/50 hover:text-white p-1 rounded-lg">
            <X size={14} />
          </button>
        </div>

        {/* Phone Frame */}
        <div
          className="relative flex flex-col rounded-[2.5rem] shadow-2xl overflow-hidden"
          style={{
            width: 320,
            background: '#0f0f0f',
            border: '8px solid #1a1a1a',
            boxShadow: '0 0 0 2px #333, 0 32px 64px rgba(0,0,0,0.7)',
          }}
        >
          {/* Notch / Dynamic Island */}
          <div className="flex justify-center pt-3 pb-2 bg-[#0f0f0f]">
            <div className="w-24 h-6 rounded-full bg-[#1a1a1a] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-[#2a2a2a] mr-1" />
              <div className="w-3 h-3 rounded-full bg-[#222]" />
            </div>
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pb-1 bg-[#f2f2f7]">
            <span className="text-[10px] font-semibold text-black">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <div className="flex items-center gap-1">
              <div className="flex gap-0.5">
                {[3,5,7,9,11].map((h) => (
                  <div key={h} className="w-0.5 rounded-full bg-black" style={{ height: h }} />
                ))}
              </div>
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                <path d="M7 2C8.9 2 10.6 2.8 11.8 4.1L13 2.8C11.4 1 9.3 0 7 0C4.7 0 2.6 1 1 2.8L2.2 4.1C3.4 2.8 5.1 2 7 2Z" fill="black" />
                <path d="M7 5C8.1 5 9.1 5.4 9.8 6.1L11 4.9C10 3.8 8.6 3 7 3C5.4 3 4 3.8 3 4.9L4.2 6.1C4.9 5.4 5.9 5 7 5Z" fill="black" />
                <circle cx="7" cy="8" r="1.5" fill="black" />
              </svg>
              <svg width="25" height="12" viewBox="0 0 25 12">
                <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="black" strokeOpacity="0.35" />
                <rect x="2" y="2" width="18" height="8" rx="2" fill="black" />
                <path d="M23 4.5V7.5A1.5 1.5 0 000 4.5v3" stroke="black" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* App Screen */}
          <div className="bg-[#f2f2f7] flex flex-col" style={{ minHeight: 520, maxHeight: 560, overflowY: 'auto' }}>
            {/* App nav bar */}
            <div className="bg-white px-4 py-3 border-b border-[#e5e5ea] flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#f2f2f7] flex items-center justify-center">
                <Bell size={12} className="text-[#1c1c1e]" />
              </div>
              <span className="text-[13px] font-bold text-[#1c1c1e]">Announcements</span>
            </div>

            {/* Announcement Card */}
            <div className="m-3 bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: '1px solid #e5e5ea' }}>
              {/* Poster image */}
              {imageUrl ? (
                <div className="w-full overflow-hidden" style={{ maxHeight: 180 }}>
                  <img
                    src={imageUrl}
                    alt="Poster"
                    className="w-full object-cover"
                    style={{ maxHeight: 180 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div className="w-full flex items-center justify-center bg-[#f2f2f7]" style={{ height: 100 }}>
                  <div className="flex flex-col items-center gap-1">
                    <ImagePlus size={22} className="text-[#aeaeb2]" />
                    <span className="text-[10px] text-[#aeaeb2]">No poster</span>
                  </div>
                </div>
              )}

              <div className="px-4 py-3">
                {/* Date chip */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] font-bold text-[#34c759] uppercase tracking-wide">JMN</span>
                  <span className="text-[10px] text-[#aeaeb2]">
                    {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>

                {/* Title */}
                <h3
                  className="font-bold text-[#1c1c1e] leading-snug mb-2"
                  style={{ fontSize: 15 }}
                >
                  {title || <span className="text-[#aeaeb2] italic">Announcement title…</span>}
                </h3>

                {/* Body */}
                {plainBody ? (
                  <p className="text-[#3c3c43] leading-relaxed" style={{ fontSize: 13 }}>
                    {plainBody}
                  </p>
                ) : (
                  <p className="text-[#aeaeb2] italic" style={{ fontSize: 13 }}>No description…</p>
                )}

                {/* Link button */}
                {linkUrl && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid #e5e5ea' }}>
                    <div
                      className="flex items-center justify-center gap-1.5 rounded-xl py-2.5"
                      style={{ background: '#34c759' }}
                    >
                      <ExternalLink size={12} className="text-white" />
                      <span className="text-white font-semibold" style={{ fontSize: 13 }}>More Info</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Placeholder next card */}
            <div className="mx-3 mb-3 bg-white rounded-2xl px-4 py-3 opacity-30" style={{ border: '1px solid #e5e5ea' }}>
              <div className="w-2/3 h-2 rounded-full bg-[#aeaeb2] mb-2" />
              <div className="w-full h-1.5 rounded-full bg-[#e5e5ea] mb-1.5" />
              <div className="w-4/5 h-1.5 rounded-full bg-[#e5e5ea]" />
            </div>
          </div>

          {/* Home indicator */}
          <div className="flex justify-center py-2 bg-[#f2f2f7]">
            <div className="w-28 h-1 rounded-full bg-[#1c1c1e]/20" />
          </div>
        </div>
      </div>
    </div>
  );
};

const AnnouncementModal = ({ item, open, onClose, onSaved }: { item: Announcement | null; open: boolean; onClose: () => void; onSaved: (a: Announcement) => void }) => {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [translatingUrdu, setTranslatingUrdu] = useState(false);

  const handleTranslateUrdu = async () => {
    const rawBody = form.body ? form.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const src = rawBody || form.title || '';
    if (!src.trim()) { toast.error('No English text to translate.'); return; }
    setTranslatingUrdu(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-urdu', { body: { text: src } });
      if (error || !(data as { urdu?: string })?.urdu) { toast.error('Translation failed.'); return; }
      setForm((prev) => ({ ...prev, urdu_body: (data as { urdu: string }).urdu }));
      toast.success('Urdu translation generated.');
    } catch { toast.error('Translation error.'); } finally { setTranslatingUrdu(false); }
  };
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [lastItem, setLastItem] = useState(item);
  if (item !== lastItem) {
    setLastItem(item);
    setForm(item ? { title: item.title, body: item.body ?? '', urdu_body: (item as Announcement & { urdu_body?: string | null }).urdu_body ?? '', link_url: item.link_url ?? '', image_url: item.image_url ?? '', is_active: item.is_active, display_order: item.display_order } : { ...EMPTY_FORM });
  }

  const set = <K extends keyof typeof EMPTY_FORM>(k: K, v: (typeof EMPTY_FORM)[K]) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleUpload = async (file: File) => {
    setUploadingImage(true);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `announcements/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage.from('adhkar-images').upload(path, file, { contentType: file.type, upsert: false });
    setUploadingImage(false);
    if (error || !data) { toast.error('Upload failed: ' + (error?.message ?? 'Unknown')); return; }
    const { data: urlData } = supabase.storage.from('adhkar-images').getPublicUrl(data.path);
    set('image_url', urlData.publicUrl);
    toast.success('Poster uploaded.');
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!form.title?.trim()) { toast.error('Title is required.'); return; }
    setSaving(true);
    try {
      const payload: Partial<AnnouncementPayload> = { title: form.title.trim(), body: form.body?.trim() || null, urdu_body: (form as typeof EMPTY_FORM & { urdu_body?: string }).urdu_body?.trim() || null, link_url: form.link_url?.trim() || null, image_url: form.image_url?.trim() || null, is_active: form.is_active ?? true, display_order: Number(form.display_order) || 0 } as Partial<AnnouncementPayload>;
      const saved = item ? await updateAnnouncement(item.id, payload) : await createAnnouncement(payload);
      toast.success(item ? 'Announcement updated.' : 'Announcement created.');
      onSaved(saved);
    } catch (err) { console.error(err); toast.error('Failed to save.'); } finally { setSaving(false); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[hsl(142_50%_93%)] flex items-center justify-center">
                <Bell size={14} className="text-[hsl(142_60%_32%)]" />
              </div>
              {item ? 'Edit Announcement' : 'New Announcement'}
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg border border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] text-xs font-medium hover:bg-[hsl(142_50%_95%)] transition-colors"
              >
                <Eye size={12} /> Preview
              </button>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-1">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Title <span className="text-destructive">*</span></Label>
              <Input value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Ramadan Timetable Now Available" className="h-9" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Description (English)</Label>
              <RichTextEditor content={form.body ?? ''} onChange={(html) => set('body', html)} />
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
                style={{ fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif", lineHeight: '2.4' }}
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
          <DialogFooter> {/* This was the missing closing tag */}
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {item ? 'Save Changes' : 'Create Announcement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnnouncementPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        title={form.title ?? ''}
        body={form.body ?? ''}
        imageUrl={form.image_url ?? ''}
        linkUrl={form.link_url ?? ''}
      />
    </>
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
            <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
              {item.is_active ? 'LIVE' : 'OFF'}
            </span>
          </div>
          {plainBody && <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{plainBody}</p>}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
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

  const { data, isLoading, isError, refetch, isFetching } = useQuery({ queryKey: ['announcements'], queryFn: fetchAnnouncements, staleTime: 60_000 });
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
          {isError && <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-sm text-destructive"><AlertCircle size={16} />Failed to load. Try refreshing.</div>}
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

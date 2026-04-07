import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, RefreshCw, Pencil, Trash2, Search, Star, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, GripVertical, ImageIcon, AlignLeft, Hash, Link2,
  ArrowRightLeft, Copy, Loader2, CheckCheck, Filter, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import Sidebar from '@/components/layout/Sidebar';
import SunnahReminderModal from '@/components/features/SunnahReminderModal';
import {
  fetchSunnahReminders, deleteSunnahReminder, updateSunnahReminder,
  fetchSunnahGroups, createSunnahGroup, updateSunnahGroup, deleteSunnahGroup,
  createSunnahReminder,
} from '@/lib/api';
import { supabase } from '@/lib/supabase';
import {
  SunnahReminder, SunnahGroup,
  SUNNAH_CATEGORIES, SUNNAH_CATEGORY_LABELS, SUNNAH_CATEGORY_COLORS,
} from '@/types';
import { toast } from 'sonner';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay, DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const GROUP_ICON_OPTIONS = ['⭐','🌙','☀️','📿','🤲','📖','🕌','💫','🌿','🎯','🔖','✨','🕋','🌺','📋'];
const GROUP_COLOR_PRESETS = [
  { bg: '#0f766e', label: 'Teal' }, { bg: '#7c3aed', label: 'Purple' },
  { bg: '#1d4ed8', label: 'Blue' }, { bg: '#b45309', label: 'Amber' },
  { bg: '#be123c', label: 'Rose' }, { bg: '#15803d', label: 'Green' },
  { bg: '#0369a1', label: 'Sky' }, { bg: '#374151', label: 'Slate' },
];

const SunnahGroupModal = ({ open, group, onClose, onSaved }: { open: boolean; group: SunnahGroup | null; onClose: () => void; onSaved: (g: SunnahGroup, oldName?: string) => void }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [icon, setIcon] = useState('⭐');
  const [iconBg, setIconBg] = useState('#0f766e');
  const [badgeText, setBadgeText] = useState('');
  const [badgeColor, setBadgeColor] = useState('#0f766e');
  const [description, setDescription] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [saving, setSaving] = useState(false);
  const isEdit = !!group?.id;
  const originalName = group?.name ?? '';

  useEffect(() => {
    if (group) {
      setName(group.name ?? ''); setCategory(group.category ?? 'general'); setIcon(group.icon ?? '⭐');
      setIconBg(group.icon_bg_color ?? '#0f766e'); setBadgeText(group.badge_text ?? '');
      setBadgeColor(group.badge_color ?? '#0f766e'); setDescription(group.description ?? '');
      setDisplayOrder(String(group.display_order ?? 0));
    } else {
      setName(''); setCategory('general'); setIcon('⭐'); setIconBg('#0f766e');
      setBadgeText(''); setBadgeColor('#0f766e'); setDescription(''); setDisplayOrder('0');
    }
  }, [group, open]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Group name is required.'); return; }
    setSaving(true);
    const payload = { name: name.trim(), category, icon, icon_color: '#ffffff', icon_bg_color: iconBg, badge_text: badgeText.trim() || null, badge_color: badgeColor, description: description.trim() || null, display_order: Number(displayOrder) || 0 };
    try {
      let saved: SunnahGroup;
      if (isEdit) {
        const { data: rows, error } = await supabase.from('sunnah_groups').update(payload).eq('id', group!.id).select().single();
        if (error) throw error;
        saved = rows as SunnahGroup;
        toast.success('Group updated.');
        onSaved(saved, originalName !== saved.name ? originalName : undefined);
      } else {
        const { data: rows, error } = await supabase.from('sunnah_groups').insert(payload).select().single();
        if (error) throw error;
        saved = rows as SunnahGroup;
        toast.success('Group created.');
        onSaved(saved);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save group.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Sunnah Group' : 'New Sunnah Group'}</DialogTitle></DialogHeader>
        <div className="rounded-xl p-4 border border-border flex items-start gap-4" style={{ background: '#1a2233' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ background: iconBg }}>{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-bold text-base">{name || 'Group Name'}</span>
              {badgeText && <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ background: badgeColor }}>{badgeText}</span>}
            </div>
            <p className="text-sm mt-0.5" style={{ color: '#94a3b8' }}>{description || 'Description appears here.'}</p>
          </div>
        </div>
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Group Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning Sunnahs" /></div>
            <div className="space-y-1.5"><Label>Category</Label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {SUNNAH_CATEGORIES.map((c) => <option key={c} value={c}>{SUNNAH_CATEGORY_LABELS[c] ?? c}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description…" /></div>
          <div className="space-y-2"><Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {GROUP_ICON_OPTIONS.map((opt) => (
                <button key={opt} type="button" onClick={() => setIcon(opt)}
                  className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all border-2 ${icon === opt ? 'border-primary scale-110 shadow-md' : 'border-transparent hover:border-border'}`}
                  style={{ background: icon === opt ? iconBg : 'hsl(var(--muted))' }}>{opt}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2"><Label>Icon Background Color</Label>
            <div className="flex items-center gap-3 flex-wrap">
              {GROUP_COLOR_PRESETS.map((p) => (
                <button key={p.bg} type="button" onClick={() => setIconBg(p.bg)} title={p.label}
                  className={`w-8 h-8 rounded-full transition-all border-2 ${iconBg === p.bg ? 'border-foreground scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
                  style={{ background: p.bg }} />
              ))}
              <input type="color" value={iconBg} onChange={(e) => setIconBg(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Badge Text</Label><Input value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="e.g. Daily" /></div>
            <div className="space-y-2"><Label>Badge Color</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {GROUP_COLOR_PRESETS.slice(0, 6).map((p) => (
                  <button key={p.bg} type="button" onClick={() => setBadgeColor(p.bg)}
                    className={`w-7 h-7 rounded-full transition-all border-2 ${badgeColor === p.bg ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'}`}
                    style={{ background: p.bg }} />
                ))}
                <input type="color" value={badgeColor} onChange={(e) => setBadgeColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border border-input" />
              </div>
            </div>
          </div>
          <div className="space-y-1.5 w-32"><Label>Display Order</Label><Input type="number" min={0} value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} placeholder="0" /></div>
        </div>
        <DialogFooter className="pt-2 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DetailPanel = ({ item, onClose, onEdit, onDelete }: { item: SunnahReminder | null; onClose: () => void; onEdit: (r: SunnahReminder) => void; onDelete: (r: SunnahReminder) => void }) => {
  const isOpen = !!item;
  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />}
      <aside className={`fixed top-0 right-0 h-full z-50 flex flex-col shadow-2xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ width: 'min(500px, 92vw)', background: 'hsl(var(--background))', borderLeft: '1px solid hsl(var(--border))' }}>
        {item && (
          <>
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border shrink-0" style={{ background: 'hsl(var(--primary))' }}>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold leading-snug" style={{ color: 'hsl(var(--primary-foreground))' }}>{item.title}</h2>
                {item.arabic_title && <p className="text-sm mt-1" dir="rtl" style={{ color: 'hsl(var(--primary-foreground) / 0.75)', fontFamily: 'serif' }}>{item.arabic_title}</p>}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge className="text-xs bg-white/20 text-white border-white/30">{SUNNAH_CATEGORY_LABELS[item.category] ?? item.category}</Badge>
                  <Badge className={`text-xs ${item.is_active ? 'bg-emerald-500/80 text-white' : 'bg-white/20 text-white/70'}`}>{item.is_active ? 'Active' : 'Inactive'}</Badge>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors shrink-0"><span className="text-white text-sm font-bold">✕</span></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {item.arabic && (
                <div className="rounded-xl p-5 border border-border" style={{ background: 'hsl(var(--muted) / 0.4)' }}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Arabic Text</p>
                  <p className="text-2xl leading-loose text-right" dir="rtl" style={{ fontFamily: '"Scheherazade New", serif' }}>{item.arabic}</p>
                </div>
              )}
              {item.transliteration && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5"><AlignLeft size={12} /> Transliteration</p><p className="text-sm leading-relaxed italic text-foreground/80">{item.transliteration}</p></div>}
              {item.description && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5"><AlignLeft size={12} /> Description</p><p className="text-sm leading-relaxed text-foreground/85">{item.description}</p></div>}
              {item.translation && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5"><AlignLeft size={12} /> Translation</p><p className="text-sm leading-relaxed text-foreground/85">{item.translation}</p></div>}
              {item.file_url && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5"><ImageIcon size={12} /> Attached Image</p>
                  {/\.(jpg|jpeg|png|webp|gif)$/i.test(item.file_url) ? (
                    <a href={item.file_url} target="_blank" rel="noopener noreferrer"><img src={item.file_url} alt="" className="rounded-xl border border-border w-full object-contain hover:opacity-90 transition-opacity" style={{ maxHeight: 200 }} /></a>
                  ) : (
                    <a href={item.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline break-all"><ImageIcon size={14} />{item.file_url}</a>
                  )}
                </div>
              )}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border" style={{ background: 'hsl(var(--muted) / 0.4)' }}><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</p></div>
                <div className="px-4 divide-y divide-border">
                  <div className="flex items-start gap-3 py-2.5"><Hash size={14} className="mt-0.5 text-muted-foreground shrink-0" /><div><p className="text-xs text-muted-foreground">Count</p><p className="text-sm font-bold" style={{ color: 'hsl(var(--accent))' }}>×{item.count}</p></div></div>
                  <div className="flex items-start gap-3 py-2.5"><Star size={14} className="mt-0.5 text-muted-foreground shrink-0" /><div><p className="text-xs text-muted-foreground">Category</p><p className="text-sm font-medium">{SUNNAH_CATEGORY_LABELS[item.category] ?? item.category}</p></div></div>
                  {item.group_name && <div className="flex items-start gap-3 py-2.5"><GripVertical size={14} className="mt-0.5 text-muted-foreground shrink-0" /><div><p className="text-xs text-muted-foreground">Group</p><p className="text-sm font-medium">{item.group_name}</p></div></div>}
                  {item.reference && <div className="flex items-start gap-3 py-2.5"><Link2 size={14} className="mt-0.5 text-muted-foreground shrink-0" /><div><p className="text-xs text-muted-foreground">Reference</p><p className="text-sm font-medium">{item.reference}</p></div></div>}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0" style={{ background: 'hsl(var(--card))' }}>
              <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => onDelete(item)}><Trash2 size={13} /> Delete</Button>
              <Button size="sm" className="gap-2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }} onClick={() => onEdit(item)}><Pencil size={13} /> Edit</Button>
            </div>
          </>
        )}
      </aside>
    </>
  );
};

const SortableEntryRow = ({ row, idx, onClickRow, onEdit, onDelete, onToggle, onMove, deleting, toggling, isDragOverlay }: {
  row: SunnahReminder; idx: number; onClickRow: (r: SunnahReminder) => void; onEdit: (r: SunnahReminder) => void;
  onDelete: (r: SunnahReminder) => void; onToggle: (r: SunnahReminder) => void; onMove: (r: SunnahReminder) => void;
  deleting: string | null; toggling: string | null; isDragOverlay?: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const [expanded, setExpanded] = useState(false);

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      className={`border-t border-border/60 ${isDragOverlay ? 'bg-card shadow-lg rounded-lg' : ''}`}>
      <div className="px-3 py-3 flex items-center gap-2 hover:bg-secondary/10 transition-colors select-none">
        <button {...attributes} className="shrink-0 touch-none cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground p-0.5" tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => { e.stopPropagation(); listeners?.onPointerDown?.(e as never); }}
          onPointerMove={listeners?.onPointerMove} onPointerUp={listeners?.onPointerUp} onKeyDown={listeners?.onKeyDown}>
          <GripVertical size={13} />
        </button>
        <button className="text-muted-foreground shrink-0" onClick={() => setExpanded((e) => !e)}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <div className="text-xs text-muted-foreground tabular-nums w-5 shrink-0 text-right">{row.display_order ?? idx + 1}</div>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap cursor-pointer" onClick={() => setExpanded((e) => !e)}>
          <span className="font-medium text-sm text-foreground leading-snug">{row.title}</span>
          {row.arabic_title && <span className="text-sm text-muted-foreground" dir="rtl" style={{ fontFamily: 'serif' }}>{row.arabic_title}</span>}
          {!row.arabic && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">⏳ placeholder</span>}
          {row.file_url && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 flex items-center gap-0.5"><ImageIcon size={9} /> media</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 rounded-md text-xs font-bold tabular-nums" style={{ background: 'hsl(var(--accent) / 0.12)', color: 'hsl(var(--accent))' }}>×{row.count}</span>
          <Badge variant={row.is_active ? 'default' : 'secondary'} className="text-[10px] px-1.5">{row.is_active ? 'Active' : 'Off'}</Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onToggle(row)} disabled={toggling === row.id} className="p-1.5 rounded hover:bg-secondary/60 transition-colors">
            {row.is_active ? <ToggleRight size={16} className="text-emerald-500" /> : <ToggleLeft size={16} className="text-muted-foreground" />}
          </button>
          <button onClick={() => onMove(row)} className="p-1.5 rounded hover:bg-purple-50 transition-colors"><ArrowRightLeft size={13} className="text-purple-500" /></button>
          <button onClick={() => onEdit(row)} className="p-1.5 rounded hover:bg-accent/10 transition-colors"><Pencil size={13} style={{ color: 'hsl(var(--accent))' }} /></button>
          <button onClick={() => onDelete(row)} disabled={deleting === row.id} className="p-1.5 rounded hover:bg-destructive/10 transition-colors"><Trash2 size={13} className="text-destructive" /></button>
        </div>
      </div>
      {expanded && !isDragOverlay && (
        <div className="px-10 pb-5 space-y-3 cursor-pointer" onClick={() => onClickRow(row)}>
          {row.arabic && <p className="text-xl leading-loose text-right" dir="rtl" style={{ fontFamily: '"Scheherazade New", serif' }}>{row.arabic}</p>}
          {row.transliteration && <p className="text-sm text-muted-foreground italic leading-relaxed">{row.transliteration}</p>}
          {row.description && <p className="text-sm text-foreground/80 leading-relaxed">{row.description}</p>}
          {row.translation && <p className="text-sm text-foreground/75 leading-relaxed">{row.translation}</p>}
          {row.reference && <p className="text-xs text-muted-foreground">📚 {row.reference}</p>}
        </div>
      )}
    </div>
  );
};

const SortableGroupCard = ({ groupName, groupMeta, items, onClickRow, onEdit, onDelete, onToggle, onMove, onEditGroup, onAddToGroup, onDeleteGroup, onEntriesReordered, deleting, toggling, isDragOverlay }: {
  groupName: string; groupMeta: SunnahGroup | undefined; items: SunnahReminder[];
  onClickRow: (r: SunnahReminder) => void; onEdit: (r: SunnahReminder) => void;
  onDelete: (r: SunnahReminder) => void; onToggle: (r: SunnahReminder) => void; onMove: (r: SunnahReminder) => void;
  onEditGroup: (name: string, meta: SunnahGroup | undefined) => void; onAddToGroup: (name: string, cat: string) => void;
  onDeleteGroup: (name: string, meta: SunnahGroup | undefined) => void; onEntriesReordered: (items: SunnahReminder[]) => void;
  deleting: string | null; toggling: string | null; isDragOverlay?: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `group:${groupName}` });
  const [collapsed, setCollapsed] = useState(true);
  const [entryDragActiveId, setEntryDragActiveId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const icon = groupMeta?.icon ?? '📋';
  const iconBg = groupMeta?.icon_bg_color ?? '#0f766e';
  const isUngrouped = groupName === '(Ungrouped)';
  const entryDragItem = entryDragActiveId ? items.find((d) => d.id === entryDragActiveId) : null;
  const sortedItems = useMemo(() => [...items].sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999)), [items]);

  const handleEntryDragEnd = async (event: DragEndEvent) => {
    setEntryDragActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = sortedItems.findIndex((d) => d.id === active.id);
    const newIdx = sortedItems.findIndex((d) => d.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(sortedItems, oldIdx, newIdx).map((d, i) => ({ ...d, display_order: (i + 1) * 10 }));
    onEntriesReordered(reordered);
    try { await Promise.all(reordered.filter((d, i) => d.display_order !== sortedItems[i]?.display_order).map((d) => updateSunnahReminder(d.id, { display_order: d.display_order ?? 0 }))); }
    catch { toast.error('Failed to save order. Please refresh.'); }
  };

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      className={`rounded-xl border border-border overflow-hidden shadow-sm ${isDragOverlay ? 'rotate-1 shadow-xl' : ''}`}>
      <div className="flex items-center gap-3 px-4 py-3 select-none" style={{ background: 'hsl(var(--card))' }}>
        <button {...attributes} {...listeners} className="shrink-0 touch-none cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground p-0.5" tabIndex={-1} onClick={(e) => e.stopPropagation()}><GripVertical size={14} /></button>
        <button className="text-muted-foreground shrink-0" onClick={() => setCollapsed((c) => !c)}>{collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
        {!isUngrouped && <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0" style={{ background: iconBg }}>{icon}</div>}
        <div className="flex-1 min-w-0" onClick={() => !renaming && setCollapsed((c) => !c)}>
          <div className="flex items-center gap-2 flex-wrap">
            {renaming ? (
              <form onSubmit={(e) => { e.preventDefault(); onEditGroup(groupName, { ...groupMeta, name: renameValue.trim() || groupName } as SunnahGroup); setRenaming(false); }} className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="h-7 text-sm w-48 font-semibold" autoFocus onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(false); }} />
                <button type="submit" className="px-2 h-7 rounded text-xs bg-primary text-primary-foreground font-medium">Save</button>
                <button type="button" onClick={() => setRenaming(false)} className="px-2 h-7 rounded text-xs border border-input text-muted-foreground">✕</button>
              </form>
            ) : (
              <span className="font-semibold text-sm text-foreground cursor-pointer" onClick={() => setCollapsed((c) => !c)}>{groupName}</span>
            )}
            {!renaming && groupMeta?.badge_text && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-white" style={{ background: groupMeta.badge_color }}>{groupMeta.badge_text}</span>}
            {!renaming && <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? 'reminder' : 'reminders'}</span>}
          </div>
          {!renaming && groupMeta?.description && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xl">{groupMeta.description}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {!isUngrouped && (
            <>
              <button onClick={() => { setRenameValue(groupName); setRenaming(true); setCollapsed(false); }} className="p-1.5 rounded-lg hover:bg-purple-50 transition-colors" title="Rename"><Pencil size={13} className="text-purple-500" /></button>
              <button onClick={() => onEditGroup(groupName, groupMeta)} className="p-1.5 rounded-lg hover:bg-accent/10 transition-colors" title="Edit style"><span className="text-[11px] font-bold" style={{ color: 'hsl(var(--accent))' }}>⚙</span></button>
              <button onClick={() => onDeleteGroup(groupName, groupMeta)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="Delete"><Trash2 size={13} className="text-destructive" /></button>
            </>
          )}
          <button onClick={() => onAddToGroup(groupName, items[0]?.category ?? 'general')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors"><Plus size={12} /> Add</button>
        </div>
      </div>
      {!collapsed && !isDragOverlay && !isDragging && (
        <div className="bg-background">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => setEntryDragActiveId(e.active.id as string)} onDragEnd={handleEntryDragEnd}>
            <SortableContext items={sortedItems.map((d) => d.id)} strategy={verticalListSortingStrategy}>
              {sortedItems.map((row, idx) => <SortableEntryRow key={row.id} row={row} idx={idx} onClickRow={onClickRow} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} onMove={onMove} deleting={deleting} toggling={toggling} />)}
            </SortableContext>
            <DragOverlay>
              {entryDragItem && <SortableEntryRow row={entryDragItem} idx={0} onClickRow={() => {}} onEdit={() => {}} onDelete={() => {}} onToggle={() => {}} onMove={() => {}} deleting={null} toggling={null} isDragOverlay />}
            </DragOverlay>
          </DndContext>
        </div>
      )}
      {isDragOverlay && <div className="bg-background px-5 py-2 text-xs text-muted-foreground">{items.length} {items.length === 1 ? 'reminder' : 'reminders'}</div>}
    </div>
  );
};

const CategorySection = ({ cat, catItems, groupMap, onClickRow, onEdit, onDelete, onToggle, onMove, onEditGroup, onAddToGroup, onDeleteGroup, onGroupsReordered, onEntriesReordered, deleting, toggling }: {
  cat: string; catItems: SunnahReminder[]; groupMap: Record<string, SunnahGroup>;
  onClickRow: (r: SunnahReminder) => void; onEdit: (r: SunnahReminder) => void;
  onDelete: (r: SunnahReminder) => void; onToggle: (r: SunnahReminder) => void; onMove: (r: SunnahReminder) => void;
  onEditGroup: (name: string, meta: SunnahGroup | undefined) => void; onAddToGroup: (name: string, cat: string) => void;
  onDeleteGroup: (name: string, meta: SunnahGroup | undefined) => void; onGroupsReordered: (cat: string, newOrder: string[]) => void;
  onEntriesReordered: (groupName: string, items: SunnahReminder[]) => void; deleting: string | null; toggling: string | null;
}) => {
  const [groupDragActiveId, setGroupDragActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const colors = SUNNAH_CATEGORY_COLORS[cat];
  const groupOrder: Record<string, number> = {};
  catItems.forEach((d) => { const key = d.group_name ?? '(Ungrouped)'; if (!(key in groupOrder)) groupOrder[key] = d.group_order ?? 9999; });
  const sortedGroupNames = Object.keys(groupOrder).sort((a, b) => (groupOrder[a] ?? 9999) - (groupOrder[b] ?? 9999));
  const grouped: Record<string, SunnahReminder[]> = {};
  catItems.forEach((d) => { const key = d.group_name ?? '(Ungrouped)'; if (!grouped[key]) grouped[key] = []; grouped[key].push(d); });
  const sortableIds = sortedGroupNames.map((n) => `group:${n}`);
  const activeGroupName = groupDragActiveId ? groupDragActiveId.replace(/^group:/, '') : null;

  const handleGroupDragEnd = async (event: DragEndEvent) => {
    setGroupDragActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = sortableIds.indexOf(active.id as string);
    const newIdx = sortableIds.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(sortedGroupNames, oldIdx, newIdx);
    onGroupsReordered(cat, reordered);
    try { await Promise.all(reordered.map((name, i) => { const meta = groupMap[name]; if (meta?.id) return updateSunnahGroup(meta.id, { display_order: (i + 1) * 10 }); return Promise.resolve(); })); }
    catch { toast.error('Failed to save group order.'); }
  };

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors?.dot ?? '#6b7280' }} />
        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${colors?.pill ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>{SUNNAH_CATEGORY_LABELS[cat] ?? cat}</span>
        <span className="text-xs text-muted-foreground">{catItems.length} {catItems.length === 1 ? 'entry' : 'entries'} · {sortedGroupNames.length} {sortedGroupNames.length === 1 ? 'group' : 'groups'}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="pl-5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e: DragStartEvent) => setGroupDragActiveId(e.active.id as string)} onDragEnd={handleGroupDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {sortedGroupNames.map((groupName) => (
                <SortableGroupCard key={groupName} groupName={groupName} groupMeta={groupMap[groupName]} items={grouped[groupName] ?? []}
                  onClickRow={onClickRow} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} onMove={onMove}
                  onEditGroup={onEditGroup} onAddToGroup={onAddToGroup} onDeleteGroup={onDeleteGroup}
                  onEntriesReordered={(items) => onEntriesReordered(groupName, items)} deleting={deleting} toggling={toggling} />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeGroupName && grouped[activeGroupName] && (
              <SortableGroupCard groupName={activeGroupName} groupMeta={groupMap[activeGroupName]} items={grouped[activeGroupName]}
                onClickRow={() => {}} onEdit={() => {}} onDelete={() => {}} onToggle={() => {}} onMove={() => {}}
                onEditGroup={() => {}} onAddToGroup={() => {}} onDeleteGroup={() => {}}
                onEntriesReordered={() => {}} deleting={null} toggling={null} isDragOverlay />
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </section>
  );
};

const SunnahReminders = () => {
  const [filterCat, setFilterCat] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState<SunnahReminder | null>(null);
  const [presetGroup, setPresetGroup] = useState<{ name: string; category: string } | null>(null);
  const [detailRow, setDetailRow] = useState<SunnahReminder | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<SunnahReminder[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<SunnahGroup | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<SunnahReminder | null>(null);
  const [moveNewGroup, setMoveNewGroup] = useState('');
  const [moveNewCategory, setMoveNewCategory] = useState('general');
  const [moveSaving, setMoveSaving] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<{ name: string; items: SunnahReminder[]; meta: SunnahGroup | undefined } | null>(null);
  const [dupNewName, setDupNewName] = useState('');
  const [dupNewCategory, setDupNewCategory] = useState('general');
  const [dupSaving, setDupSaving] = useState(false);
  const [bulkDescOpen, setBulkDescOpen] = useState(false);
  const [bulkDescSearch, setBulkDescSearch] = useState('');
  const [bulkDescFilter, setBulkDescFilter] = useState<string>('all');
  const [bulkDescEdits, setBulkDescEdits] = useState<Record<string, string>>({});
  const [bulkDescSaving, setBulkDescSaving] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const [bulkSavingAll, setBulkSavingAll] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  const queryClient = useQueryClient();
  const { data: reminders = [], isFetching, refetch } = useQuery({ queryKey: ['sunnah-reminders'], queryFn: () => fetchSunnahReminders() });
  const { data: groups = [], refetch: refetchGroups } = useQuery({ queryKey: ['sunnah-groups'], queryFn: () => fetchSunnahGroups() });

  const groupMap = useMemo(() => { const map: Record<string, SunnahGroup> = {}; groups.forEach((g) => { map[g.name] = g; }); return map; }, [groups]);

  const filtered = reminders.filter((r) => {
    const matchCat = filterCat === 'All' || r.category === filterCat;
    const q = search.toLowerCase();
    const matchSearch = !q || r.title.toLowerCase().includes(q) || (r.arabic ?? '').includes(q) || (r.arabic_title ?? '').includes(q) || (r.transliteration ?? '').toLowerCase().includes(q) || (r.translation ?? '').toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q) || (r.group_name ?? '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const presentCategories = SUNNAH_CATEGORIES.filter((cat) => reminders.some((r) => r.category === cat));
  const unknownCategories = [...new Set(reminders.map((r) => r.category))].filter((cat) => !SUNNAH_CATEGORIES.includes(cat as typeof SUNNAH_CATEGORIES[number]));
  const allCategories = [...presentCategories, ...unknownCategories];
  const filteredCategories = filterCat === 'All' ? allCategories.filter((cat) => filtered.some((r) => r.category === cat)) : [filterCat];

  const allGroupRows = useMemo(() => {
    const seen = new Set<string>();
    const rows: { name: string; category: string; description: string; meta: SunnahGroup | undefined; entryCount: number; icon: string; iconBg: string; }[] = [];
    const catOrder = SUNNAH_CATEGORIES.reduce<Record<string, number>>((acc, cat, i) => { acc[cat] = i; return acc; }, {});
    const sorted = [...reminders].sort((a, b) => { const pc = (catOrder[a.category] ?? 99) - (catOrder[b.category] ?? 99); if (pc !== 0) return pc; return (a.group_order ?? 9999) - (b.group_order ?? 9999); });
    sorted.forEach((r) => {
      const name = r.group_name;
      if (!name || seen.has(name)) return;
      seen.add(name);
      const meta = groupMap[name];
      rows.push({ name, category: meta?.category ?? r.category, description: meta?.description ?? r.description ?? '', meta, entryCount: reminders.filter((x) => x.group_name === name).length, icon: meta?.icon ?? '📋', iconBg: meta?.icon_bg_color ?? '#0f766e' });
    });
    return rows;
  }, [reminders, groupMap]);

  const missingDescCount = allGroupRows.filter((r) => !(r.meta?.description ?? r.description)).length;
  const bulkFilteredRows = useMemo(() => allGroupRows.filter((row) => {
    const q = bulkDescSearch.toLowerCase();
    const matchSearch = !q || row.name.toLowerCase().includes(q) || row.description.toLowerCase().includes(q);
    const currentDesc = bulkDescEdits[row.name] !== undefined ? bulkDescEdits[row.name] : row.description;
    const matchFilter = bulkDescFilter === 'all' || (bulkDescFilter === 'missing' && !currentDesc.trim()) || bulkDescFilter === row.category;
    return matchSearch && matchFilter;
  }), [allGroupRows, bulkDescSearch, bulkDescFilter, bulkDescEdits]);

  const dirtyGroups = Object.keys(bulkDescEdits).filter((name) => { const original = allGroupRows.find((r) => r.name === name)?.description ?? ''; return bulkDescEdits[name] !== original; });

  const handleDescriptionSave = async (groupName: string, description: string, meta: SunnahGroup | undefined) => {
    queryClient.setQueryData<SunnahGroup[]>(['sunnah-groups'], (old = []) => old.map((g) => (g.name === groupName ? { ...g, description } : g)));
    queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.map((r) => (r.group_name === groupName ? { ...r, description } : r)));
    if (meta?.id) await updateSunnahGroup(meta.id, { description });
    toast.success(`Description updated for "${groupName}".`);
    refetch();
  };

  const handleBulkOpen = () => { setBulkDescEdits({}); setBulkDescSaving({}); setBulkDescSearch(''); setBulkDescFilter('all'); setBulkDescOpen(true); };

  const handleBulkSaveOne = async (groupName: string) => {
    const row = allGroupRows.find((r) => r.name === groupName);
    if (!row) return;
    const newDesc = (bulkDescEdits[groupName] ?? row.description).trim();
    setBulkDescSaving((prev) => ({ ...prev, [groupName]: 'saving' }));
    try { await handleDescriptionSave(groupName, newDesc, row.meta); setBulkDescSaving((prev) => ({ ...prev, [groupName]: 'saved' })); setBulkDescEdits((prev) => ({ ...prev, [groupName]: newDesc })); }
    catch { setBulkDescSaving((prev) => ({ ...prev, [groupName]: 'error' })); }
  };

  const handleBulkSaveAll = async () => {
    if (dirtyGroups.length === 0) return;
    setBulkSavingAll(true);
    await Promise.allSettled(dirtyGroups.map((name) => handleBulkSaveOne(name)));
    setBulkSavingAll(false);
    toast.success(`Saved ${dirtyGroups.length} group description${dirtyGroups.length !== 1 ? 's' : ''}.`);
  };

  const handleGenerateWithAI = async () => {
    const groupsToGenerate = allGroupRows.filter((row) => { const current = bulkDescEdits[row.name] !== undefined ? bulkDescEdits[row.name] : row.description; return !current.trim(); });
    if (groupsToGenerate.length === 0) { toast('All groups already have descriptions.'); return; }
    setAiGenerating(true);
    toast(`Generating descriptions for ${groupsToGenerate.length} group${groupsToGenerate.length !== 1 ? 's' : ''}…`);
    try {
      const { data, error } = await supabase.functions.invoke('generate-group-desc', { body: { groups: groupsToGenerate.map((r) => ({ name: r.name, prayerTime: r.category, entryCount: r.entryCount })) } });
      if (error) throw new Error(error.message);
      const results = (data as { results?: { name: string; description: string; error?: string }[] })?.results ?? [];
      const succeeded = results.filter((r) => !r.error && r.description);
      const failed = results.filter((r) => r.error || !r.description);
      if (succeeded.length > 0) {
        setBulkDescEdits((prev) => { const next = { ...prev }; succeeded.forEach((r) => { next[r.name] = r.description; }); return next; });
        setBulkDescSaving((prev) => { const next = { ...prev }; succeeded.forEach((r) => { delete next[r.name]; }); return next; });
        if (bulkDescFilter !== 'all') setBulkDescFilter('all');
        toast.success(`Generated ${succeeded.length} description${succeeded.length !== 1 ? 's' : ''}. Review and click Save All.`);
      }
      if (failed.length > 0) toast.error(`${failed.length} group${failed.length !== 1 ? 's' : ''} failed to generate.`);
    } catch (err) { toast.error(`AI generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`); }
    finally { setAiGenerating(false); }
  };

  const handleSaved = (reminder: SunnahReminder) => { queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => [...old, reminder]); setModalOpen(false); setEditRow(null); setDetailRow(null); setPresetGroup(null); };
  const handleFinalized = (tempId: string, real: SunnahReminder) => { queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.map((r) => (r.id === tempId ? real : r))); };
  const handleRevert = (tempId: string) => { queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.filter((r) => r.id !== tempId)); };
  const handleUpdated = (reminder: SunnahReminder) => { queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.map((r) => (r.id === reminder.id ? reminder : r))); setModalOpen(false); setEditRow(null); };

  const handleToggle = async (row: SunnahReminder) => {
    setToggling(row.id);
    const updated = { ...row, is_active: !row.is_active };
    queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.map((r) => (r.id === row.id ? updated : r)));
    try {
      const real = await updateSunnahReminder(row.id, { is_active: !row.is_active });
      queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.map((r) => (r.id === row.id ? real : r)));
      toast.success(`"${row.title}" ${!row.is_active ? 'activated' : 'deactivated'}.`);
    } catch { queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.map((r) => (r.id === row.id ? row : r))); toast.error('Failed to update status.'); }
    finally { setToggling(null); }
  };

  const handleDelete = async (row: SunnahReminder) => {
    setDetailRow(null); setDeleting(row.id);
    queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.filter((r) => r.id !== row.id));
    setUndoStack((prev) => [...prev.slice(-29), row]);
    await deleteSunnahReminder(row.id).catch(() => {
      toast.error(`Failed to delete "${row.title}". Restored.`);
      queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => { const restored = [...(old ?? []), row]; return restored.sort((a, b) => { const cc = (a.category ?? '').localeCompare(b.category ?? ''); if (cc !== 0) return cc; return (a.display_order ?? 9999) - (b.display_order ?? 9999); }); });
      setUndoStack((prev) => prev.filter((r) => r.id !== row.id));
    });
    setDeleting(null);
    toast.success(`"${row.title}" deleted — use Undo to restore.`);
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const row = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    const { id: _id, created_at: _ca, updated_at: _ua, ...payload } = row;
    const tempId = `temp-undo-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => { const restored = [...(old ?? []), { id: tempId, ...payload, created_at: now, updated_at: now }]; return restored.sort((a, b) => { const cc = (a.category ?? '').localeCompare(b.category ?? ''); if (cc !== 0) return cc; return (a.display_order ?? 9999) - (b.display_order ?? 9999); }); });
    createSunnahReminder(payload).then((real) => { queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.map((r) => (r.id === tempId ? real : r))); toast.success(`"${row.title}" restored.`); })
      .catch(() => { queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.filter((r) => r.id !== tempId)); toast.error(`Failed to restore "${row.title}".`); setUndoStack((prev) => [...prev, row]); });
  };

  const handleOpenMove = (row: SunnahReminder) => { setMoveTarget(row); setMoveNewGroup(row.group_name ?? ''); setMoveNewCategory(row.category); setMoveDialogOpen(true); };
  const handleMoveConfirm = async () => {
    if (!moveTarget) return;
    setMoveSaving(true);
    const patch = { group_name: moveNewGroup.trim() || null, category: moveNewCategory };
    queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.map((r) => (r.id === moveTarget.id ? { ...r, ...patch } : r)));
    setMoveDialogOpen(false);
    try { const real = await updateSunnahReminder(moveTarget.id, patch); queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.map((r) => (r.id === moveTarget.id ? real : r))); toast.success(`Moved to "${moveNewGroup || '(Ungrouped)'}"`); }
    catch { queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.map((r) => (r.id === moveTarget.id ? moveTarget : r))); toast.error('Failed to move entry.'); }
    finally { setMoveSaving(false); setMoveTarget(null); }
  };

  const handleGroupSaved = (saved: SunnahGroup, oldName?: string) => {
    queryClient.setQueryData<SunnahGroup[]>(['sunnah-groups'], (old = []) => { const exists = old.some((g) => g.id === saved.id); return exists ? old.map((g) => (g.id === saved.id ? saved : g)) : [...old, saved]; });
    if (oldName && oldName !== saved.name) queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.map((r) => r.group_name === oldName ? { ...r, group_name: saved.name } : r));
    setGroupModalOpen(false); setEditGroup(null);
  };

  const handleDuplicateGroup = (name: string, items: SunnahReminder[], meta: SunnahGroup | undefined) => { setDuplicateSource({ name, items, meta }); setDupNewName(`${name} (copy)`); setDupNewCategory(items[0]?.category ?? 'general'); setDuplicateDialogOpen(true); };

  const handleDuplicateConfirm = async () => {
    if (!duplicateSource || !dupNewName.trim()) return;
    setDupSaving(true);
    const newGroupName = dupNewName.trim(); const sourceItems = duplicateSource.items; const sourceMeta = duplicateSource.meta;
    let newGroupMeta: SunnahGroup | undefined;
    try {
      newGroupMeta = await createSunnahGroup({ name: newGroupName, category: dupNewCategory, icon: sourceMeta?.icon ?? '📋', icon_color: '#ffffff', icon_bg_color: sourceMeta?.icon_bg_color ?? '#0f766e', badge_text: sourceMeta?.badge_text ?? null, badge_color: sourceMeta?.badge_color ?? '#0f766e', description: sourceMeta?.description ?? null, display_order: (sourceMeta?.display_order ?? 0) + 10 });
      queryClient.setQueryData<SunnahGroup[]>(['sunnah-groups'], (old = []) => [...old, newGroupMeta!]);
    } catch { toast.error('Failed to create group metadata.'); setDupSaving(false); return; }
    const now = new Date().toISOString();
    const tempIds = sourceItems.map(() => `temp-dup-${crypto.randomUUID()}`);
    const optimistic: SunnahReminder[] = sourceItems.map((src, idx) => ({ ...src, id: tempIds[idx], group_name: newGroupName, category: dupNewCategory, created_at: now, updated_at: now }));
    queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => [...old, ...optimistic]);
    setDuplicateDialogOpen(false); setDuplicateSource(null); setDupSaving(false);
    const results = await Promise.allSettled(sourceItems.map(async (src, idx) => { const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = src; const real = await createSunnahReminder({ ...rest, group_name: newGroupName, category: dupNewCategory }); queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.map((r) => (r.id === tempIds[idx] ? real : r))); return real; }));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) toast.error(`${failed} entr${failed === 1 ? 'y' : 'ies'} failed to copy.`);
    else toast.success(`Duplicated "${duplicateSource.name}" → "${newGroupName}" with ${sourceItems.length} entr${sourceItems.length === 1 ? 'y' : 'ies'}.`);
    console.log('[SunnahReminders] Duplicate complete. New group meta:', newGroupMeta);
  };

  const handleGroupsReordered = (cat: string, newGroupOrder: string[]) => { queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => old.map((r) => { if (r.category !== cat) return r; const key = r.group_name ?? '(Ungrouped)'; return { ...r, group_order: (newGroupOrder.indexOf(key) + 1) * 10 }; })); };
  const handleEntriesReordered = (_groupName: string, reorderedItems: SunnahReminder[]) => { queryClient.setQueryData<SunnahReminder[]>(['sunnah-reminders'], (old = []) => { const updatedMap = new Map(reorderedItems.map((r) => [r.id, r])); return old.map((r) => updatedMap.get(r.id) ?? r); }); };

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />
      <main className="flex-1 overflow-x-auto pt-14 md:pt-0">
        {/* Banner */}
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <Star size={20} className="text-[hsl(142_60%_32%)]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[hsl(150_30%_12%)]">Sunnah Reminders</h1>
                <p className="text-xs text-muted-foreground mt-0.5">{reminders.length} reminder{reminders.length !== 1 ? 's' : ''} · {groups.length} groups · drag handles to reorder</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleBulkOpen} className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-50">
                <AlignLeft size={14} /> Bulk Edit Descriptions
                {missingDescCount > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700">{missingDescCount} missing</span>}
              </Button>
              {undoStack.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleUndo} className="gap-2 border-amber-400/60 text-amber-700 hover:bg-amber-50" title={`Restore: "${undoStack[undoStack.length - 1]?.title}"`}>
                  ↩ Undo <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">{undoStack.length}</span>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => { refetch(); refetchGroups(); }} disabled={isFetching} className="gap-2">
                <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
              </Button>
              <Button size="sm" onClick={() => { setEditRow(null); setPresetGroup(null); setModalOpen(true); }} className="gap-2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                <Plus size={14} /> Add Reminder
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-5">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 mb-5">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reminders…" className="pl-9 h-9 text-sm" />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => setFilterCat('All')} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${filterCat === 'All' ? 'border-transparent text-white' : 'border-border bg-muted text-muted-foreground hover:bg-secondary'}`} style={filterCat === 'All' ? { background: 'hsl(var(--primary))' } : {}}>
                All ({reminders.length})
              </button>
              {allCategories.map((cat) => {
                const count = reminders.filter((r) => r.category === cat).length;
                const colors = SUNNAH_CATEGORY_COLORS[cat];
                const isActive = filterCat === cat;
                return (
                  <button key={cat} onClick={() => setFilterCat(cat)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${isActive ? `${colors?.pill ?? 'bg-gray-100 text-gray-700 border-gray-200'} font-semibold` : 'border-border bg-muted text-muted-foreground hover:bg-secondary'}`}>
                    {SUNNAH_CATEGORY_LABELS[cat] ?? cat} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 gap-3 text-muted-foreground rounded-2xl border-2 border-dashed border-[hsl(140_20%_88%)] bg-white">
              <Star size={32} className="opacity-30" />
              <p className="text-sm">{reminders.length === 0 ? 'No sunnah reminders yet. Add your first one!' : 'No results match your search.'}</p>
              {reminders.length === 0 && (
                <Button size="sm" onClick={() => { setEditRow(null); setPresetGroup(null); setModalOpen(true); }} className="gap-2 mt-1" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                  <Plus size={13} /> Add First Reminder
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-10">
              {filteredCategories.map((cat) => {
                const catItems = filtered.filter((r) => r.category === cat);
                if (catItems.length === 0) return null;
                return (
                  <CategorySection key={cat} cat={cat} catItems={catItems} groupMap={groupMap}
                    onClickRow={setDetailRow}
                    onEdit={(r) => { setDetailRow(null); setEditRow(r); setPresetGroup(null); setModalOpen(true); }}
                    onDelete={handleDelete} onToggle={handleToggle} onMove={handleOpenMove}
                    onEditGroup={(name, meta) => { setEditGroup(meta ? { ...meta, name } : { name } as SunnahGroup); setGroupModalOpen(true); }}
                    onAddToGroup={(name, cat) => { setEditRow(null); setPresetGroup({ name, category: cat }); setModalOpen(true); }}
                    onDeleteGroup={async (name, meta) => {
                      if (!confirm(`Delete group "${name}" metadata? Reminders in this group will NOT be deleted.`)) return;
                      if (meta?.id) { await deleteSunnahGroup(meta.id); queryClient.setQueryData<SunnahGroup[]>(['sunnah-groups'], (old = []) => old.filter((g) => g.id !== meta.id)); toast.success(`Group "${name}" deleted.`); }
                    }}
                    onGroupsReordered={handleGroupsReordered} onEntriesReordered={handleEntriesReordered}
                    deleting={deleting} toggling={toggling} />
                );
              })}
            </div>
          )}
        </div>
      </main>

      <SunnahReminderModal open={modalOpen} row={editRow} presetGroup={presetGroup} onClose={() => { setModalOpen(false); setEditRow(null); setPresetGroup(null); }} onSaved={handleSaved} onFinalized={handleFinalized} onRevert={handleRevert} onUpdated={handleUpdated} />
      <SunnahGroupModal open={groupModalOpen} group={editGroup} onClose={() => { setGroupModalOpen(false); setEditGroup(null); }} onSaved={handleGroupSaved} />
      <DetailPanel item={detailRow} onClose={() => setDetailRow(null)} onEdit={(r) => { setDetailRow(null); setEditRow(r); setPresetGroup(null); setModalOpen(true); }} onDelete={handleDelete} />

      <Dialog open={moveDialogOpen} onOpenChange={(v) => { if (!moveSaving) { setMoveDialogOpen(v); if (!v) setMoveTarget(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-base"><ArrowRightLeft size={15} className="text-purple-500" />Move Entry</DialogTitle><p className="text-xs text-muted-foreground pt-1">Reassign <strong>"{moveTarget?.title}"</strong> to a different group or category.</p></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Target Category</Label><select value={moveNewCategory} onChange={(e) => setMoveNewCategory(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">{SUNNAH_CATEGORIES.map((cat) => <option key={cat} value={cat}>{SUNNAH_CATEGORY_LABELS[cat] ?? cat}</option>)}</select></div>
            <div className="space-y-1.5"><Label>Target Group <span className="text-muted-foreground font-normal text-xs">(leave empty for Ungrouped)</span></Label><Input value={moveNewGroup} onChange={(e) => setMoveNewGroup(e.target.value)} placeholder="Group name or leave empty" list="move-sr-group-list" /><datalist id="move-sr-group-list">{groups.map((g) => <option key={g.id} value={g.name} />)}</datalist></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setMoveDialogOpen(false); setMoveTarget(null); }} disabled={moveSaving}>Cancel</Button>
            <Button onClick={handleMoveConfirm} disabled={moveSaving} style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>{moveSaving ? 'Moving…' : 'Move Entry'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateDialogOpen} onOpenChange={(v) => { if (!dupSaving) { setDuplicateDialogOpen(v); if (!v) setDuplicateSource(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-base"><Copy size={15} className="text-blue-500" />Duplicate Group</DialogTitle><p className="text-xs text-muted-foreground pt-1">Creates a full copy of <strong>"{duplicateSource?.name}"</strong> ({duplicateSource?.items.length} entr{(duplicateSource?.items.length ?? 0) === 1 ? 'y' : 'ies'}) under a new name.</p></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>New Group Name *</Label><Input value={dupNewName} onChange={(e) => setDupNewName(e.target.value)} placeholder="e.g. Morning Sunnahs (copy)" autoFocus /></div>
            <div className="space-y-1.5"><Label>Target Category *</Label><select value={dupNewCategory} onChange={(e) => setDupNewCategory(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">{SUNNAH_CATEGORIES.map((cat) => <option key={cat} value={cat}>{SUNNAH_CATEGORY_LABELS[cat] ?? cat}</option>)}</select></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDuplicateDialogOpen(false); setDuplicateSource(null); }} disabled={dupSaving}>Cancel</Button>
            <Button onClick={handleDuplicateConfirm} disabled={dupSaving || !dupNewName.trim()} className="gap-2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
              {dupSaving ? <><Loader2 size={13} className="animate-spin" /> Duplicating…</> : <><Copy size={13} /> Duplicate Group</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDescOpen} onOpenChange={(v) => { if (!bulkSavingAll && !aiGenerating) setBulkDescOpen(v); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
          <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2"><AlignLeft size={16} className="text-violet-500" />Bulk Edit Group Descriptions</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{allGroupRows.length} groups total{missingDescCount > 0 && <span className="ml-2 text-orange-600 font-medium">· {missingDescCount} missing</span>}{dirtyGroups.length > 0 && <span className="ml-2 text-amber-600 font-medium">· {dirtyGroups.length} unsaved</span>}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={handleGenerateWithAI} disabled={aiGenerating || bulkSavingAll || allGroupRows.filter((r) => { const cur = bulkDescEdits[r.name] !== undefined ? bulkDescEdits[r.name] : r.description; return !cur.trim(); }).length === 0} className="gap-1.5 border-violet-400/70 text-violet-700 hover:bg-violet-50 disabled:opacity-40">
                {aiGenerating ? <><Loader2 size={13} className="animate-spin" /> Generating…</> : <><Sparkles size={13} /> Generate with AI</>}
              </Button>
              <Button size="sm" variant="outline" onClick={handleBulkSaveAll} disabled={dirtyGroups.length === 0 || bulkSavingAll || aiGenerating} className="gap-1.5 border-emerald-400/60 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
                {bulkSavingAll ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><CheckCheck size={13} /> Save All ({dirtyGroups.length})</>}
              </Button>
            </div>
          </div>
          {aiGenerating && <div className="px-6 py-2.5 bg-violet-50 border-b border-violet-200 flex items-center gap-2.5"><Loader2 size={13} className="animate-spin text-violet-600 shrink-0" /><p className="text-xs text-violet-700 font-medium">Generating descriptions…</p></div>}
          <div className="px-6 py-3 border-b border-border bg-muted/20 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px] max-w-xs"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={bulkDescSearch} onChange={(e) => setBulkDescSearch(e.target.value)} placeholder="Filter groups…" className="pl-8 h-8 text-xs" /></div>
            <div className="flex items-center gap-1.5 flex-wrap"><Filter size={12} className="text-muted-foreground" />
              {(['all', 'missing', ...SUNNAH_CATEGORIES] as const).map((f) => {
                const label = f === 'all' ? 'All' : f === 'missing' ? '⚠ Missing' : (SUNNAH_CATEGORY_LABELS[f] ?? f);
                const count = f === 'all' ? allGroupRows.length : f === 'missing' ? allGroupRows.filter((r) => { const d = bulkDescEdits[r.name] !== undefined ? bulkDescEdits[r.name] : r.description; return !d.trim(); }).length : allGroupRows.filter((r) => r.category === f).length;
                if (f !== 'all' && f !== 'missing' && count === 0) return null;
                return <button key={f} onClick={() => setBulkDescFilter(f)} className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${bulkDescFilter === f ? 'border-violet-400 bg-violet-100 text-violet-800' : 'border-border bg-background text-muted-foreground hover:bg-secondary'}`}>{label} ({count})</button>;
              })}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {bulkFilteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground"><AlignLeft size={28} className="opacity-20" /><p className="text-sm">{bulkDescSearch ? 'No groups match your search.' : bulkDescFilter === 'missing' ? 'All groups have descriptions.' : 'No groups in this filter.'}</p></div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30 sticky top-0"><th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2 w-[220px]">Group</th><th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 w-[130px]">Category</th><th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2">Description</th><th className="w-[80px] px-3 py-2"></th></tr></thead>
                <tbody>
                  {bulkFilteredRows.map((row, idx) => {
                    const currentVal = bulkDescEdits[row.name] !== undefined ? bulkDescEdits[row.name] : row.description;
                    const isDirty = bulkDescEdits[row.name] !== undefined && bulkDescEdits[row.name] !== row.description;
                    const saveStatus = bulkDescSaving[row.name];
                    const colors = SUNNAH_CATEGORY_COLORS[row.category];
                    return (
                      <tr key={row.name} className={`border-b border-border/40 transition-colors ${isDirty ? 'bg-amber-50/60' : idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}>
                        <td className="px-4 py-2.5 align-top"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-md flex items-center justify-center text-base shrink-0" style={{ background: row.iconBg }}>{row.icon}</div><div className="min-w-0"><p className="font-semibold text-xs text-foreground leading-snug truncate max-w-[140px]" title={row.name}>{row.name}</p><p className="text-[10px] text-muted-foreground">{row.entryCount} entr{row.entryCount !== 1 ? 'ies' : 'y'}</p></div></div></td>
                        <td className="px-3 py-2.5 align-top"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${colors?.pill ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>{SUNNAH_CATEGORY_LABELS[row.category] ?? row.category}</span></td>
                        <td className="px-3 py-2 align-top"><div className="relative"><textarea value={currentVal} onChange={(e) => { setBulkDescEdits((prev) => ({ ...prev, [row.name]: e.target.value })); setBulkDescSaving((prev) => { const next = { ...prev }; delete next[row.name]; return next; }); }} placeholder="Add a description…" rows={2} className={`w-full rounded-md border px-2.5 py-1.5 text-xs text-foreground bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring transition-colors ${isDirty ? 'border-amber-400 ring-1 ring-amber-300/60' : saveStatus === 'saved' ? 'border-emerald-400' : saveStatus === 'error' ? 'border-red-400' : 'border-input'}`} />{isDirty && <span className="absolute top-1 right-1.5 text-[9px] font-bold text-amber-600 bg-amber-50 px-1 rounded">edited</span>}{saveStatus === 'saved' && !isDirty && <span className="absolute top-1 right-1.5 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">✓ saved</span>}{saveStatus === 'error' && <span className="absolute top-1 right-1.5 text-[9px] font-bold text-red-600 bg-red-50 px-1 rounded">error</span>}</div></td>
                        <td className="px-3 py-2.5 align-top"><button onClick={() => handleBulkSaveOne(row.name)} disabled={!isDirty || saveStatus === 'saving'} className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-all ${saveStatus === 'saving' ? 'border-border text-muted-foreground opacity-60' : isDirty ? 'border-primary/60 bg-primary/5 text-primary hover:bg-primary/10' : 'border-border text-muted-foreground opacity-30 cursor-default'}`}>{saveStatus === 'saving' ? <span className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Saving</span> : 'Save'}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Descriptions are saved to group metadata and visible in the portal.</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setBulkDescOpen(false)} disabled={bulkSavingAll || aiGenerating}>Close</Button>
              <Button size="sm" onClick={handleBulkSaveAll} disabled={dirtyGroups.length === 0 || bulkSavingAll || aiGenerating} className="gap-1.5" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                {bulkSavingAll ? <><Loader2 size={13} className="animate-spin" /> Saving All…</> : <><CheckCheck size={13} /> Save All ({dirtyGroups.length})</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SunnahReminders;

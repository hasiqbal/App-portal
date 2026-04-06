import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, RefreshCw, Pencil, Trash2, Search, BookOpen, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, GripVertical, ImageIcon, Copy, Loader2, ArrowRightLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import Sidebar from '@/components/layout/Sidebar';
import DhikrModal from '@/components/features/DhikrModal';
import DhikrDetailPanel from '@/components/features/DhikrDetailPanel';
import AdhkarGroupModal from '@/components/features/AdhkarGroupModal';
import {
  fetchAdhkar, deleteDhikr, fetchAdhkarGroups, createAdhkarGroup, createDhikr, updateDhikr, updateAdhkarGroup,
} from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { Dhikr, AdhkarGroup, PRAYER_TIME_CATEGORIES, PRAYER_TIME_LABELS } from '@/types';
import { toast } from 'sonner';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay, DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const CATEGORY_COLORS: Record<string, { pill: string; dot: string }> = {
  'fajr':          { pill: 'bg-blue-100 text-blue-800 border-blue-200',       dot: '#3b82f6' },
  'after-fajr':    { pill: 'bg-sky-100 text-sky-800 border-sky-200',          dot: '#0ea5e9' },
  'ishraq':        { pill: 'bg-amber-100 text-amber-800 border-amber-200',    dot: '#f59e0b' },
  'duha':          { pill: 'bg-orange-100 text-orange-800 border-orange-200', dot: '#f97316' },
  'zuhr':          { pill: 'bg-yellow-100 text-yellow-800 border-yellow-200', dot: '#eab308' },
  'after-zuhr':    { pill: 'bg-lime-100 text-lime-800 border-lime-200',       dot: '#84cc16' },
  'asr':           { pill: 'bg-green-100 text-green-800 border-green-200',    dot: '#22c55e' },
  'after-asr':     { pill: 'bg-teal-100 text-teal-800 border-teal-200',       dot: '#14b8a6' },
  'maghrib':       { pill: 'bg-rose-100 text-rose-800 border-rose-200',       dot: '#f43f5e' },
  'after-maghrib': { pill: 'bg-pink-100 text-pink-800 border-pink-200',       dot: '#ec4899' },
  'isha':          { pill: 'bg-violet-100 text-violet-800 border-violet-200', dot: '#8b5cf6' },
  'after-isha':    { pill: 'bg-purple-100 text-purple-800 border-purple-200', dot: '#a855f7' },
  'before-sleep':  { pill: 'bg-indigo-100 text-indigo-800 border-indigo-200', dot: '#6366f1' },
  'morning':       { pill: 'bg-cyan-100 text-cyan-800 border-cyan-200',       dot: '#06b6d4' },
  'evening':       { pill: 'bg-red-100 text-red-800 border-red-200',          dot: '#ef4444' },
  'general':       { pill: 'bg-gray-100 text-gray-700 border-gray-200',       dot: '#6b7280' },
};

// ─── Sortable Entry Row ───────────────────────────────────────────────────────

const SortableEntryRow = ({
  row, idx, onClickRow, onEditEntry, onDeleteEntry, onToggleActive, onMoveEntry, deleting, toggling, isDragOverlay,
}: {
  row: Dhikr; idx: number;
  onClickRow: (d: Dhikr) => void; onEditEntry: (d: Dhikr) => void;
  onDeleteEntry: (d: Dhikr) => void; onToggleActive: (d: Dhikr) => void;
  onMoveEntry: (d: Dhikr) => void;
  deleting: string | null; toggling: string | null; isDragOverlay?: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      className={`border-t border-border/60 ${isDragOverlay ? 'bg-card shadow-lg rounded-lg' : ''}`}
    >
      <div className="px-3 py-3 flex items-center gap-2 hover:bg-secondary/10 transition-colors select-none">
        <button
          {...attributes} {...listeners}
          className="shrink-0 touch-none cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground transition-colors p-0.5"
          title="Drag to reorder" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={13} />
        </button>
        <button className="text-muted-foreground shrink-0" onClick={() => setExpanded((e) => !e)}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <div className="text-xs text-muted-foreground tabular-nums w-5 shrink-0 text-right">
          {row.display_order ?? idx + 1}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap cursor-pointer" onClick={() => setExpanded((e) => !e)}>
          <span className="font-medium text-sm text-foreground leading-snug">{row.title}</span>
          {row.arabic_title && (
            <span className="text-sm text-muted-foreground leading-snug" dir="rtl" style={{ fontFamily: 'serif' }}>{row.arabic_title}</span>
          )}
          {!row.arabic && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">⏳ placeholder</span>
          )}
          {row.file_url && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 flex items-center gap-0.5">
              <ImageIcon size={9} /> media
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 rounded-md text-xs font-bold tabular-nums" style={{ background: 'hsl(var(--accent) / 0.12)', color: 'hsl(var(--accent))' }}>
            ×{row.count}
          </span>
          <Badge variant={row.is_active ? 'default' : 'secondary'} className="text-[10px] px-1.5">
            {row.is_active ? 'Active' : 'Off'}
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onToggleActive(row)} disabled={toggling === row.id} className="p-1.5 rounded hover:bg-secondary/60 transition-colors" title={row.is_active ? 'Deactivate' : 'Activate'}>
            {row.is_active ? <ToggleRight size={16} className="text-emerald-500" /> : <ToggleLeft size={16} className="text-muted-foreground" />}
          </button>
          <button onClick={() => onMoveEntry(row)} className="p-1.5 rounded hover:bg-purple-50 transition-colors" title="Move to group / prayer time">
            <ArrowRightLeft size={13} className="text-purple-500" />
          </button>
          <button onClick={() => onEditEntry(row)} className="p-1.5 rounded hover:bg-accent/10 transition-colors" title="Edit (saves as new copy)">
            <Pencil size={13} style={{ color: 'hsl(var(--accent))' }} />
          </button>
          <button onClick={() => onDeleteEntry(row)} disabled={deleting === row.id} className="p-1.5 rounded hover:bg-destructive/10 transition-colors" title="Delete">
            <Trash2 size={13} className="text-destructive" />
          </button>
        </div>
      </div>
      {expanded && !isDragOverlay && (
        <div className="px-10 pb-5 space-y-3 cursor-pointer" onClick={() => onClickRow(row)}>
          <p className="text-xl leading-loose text-right" dir="rtl" style={{ fontFamily: 'serif' }}>{row.arabic}</p>
          {row.transliteration && <p className="text-sm text-muted-foreground italic leading-relaxed">{row.transliteration}</p>}
          {row.translation && <p className="text-sm text-foreground/80 leading-relaxed">{row.translation}</p>}
          {row.reference && <p className="text-xs text-muted-foreground">📚 {row.reference}</p>}
        </div>
      )}
    </div>
  );
};

// ─── Sortable Group Section ───────────────────────────────────────────────────

const SortableGroupSection = ({
  groupName, groupMeta, items,
  onClickRow, onEditEntry, onDeleteEntry, onToggleActive, onMoveEntry,
  onEditGroup, onRenameGroup, onDescriptionSave, onAddToGroup, onDeleteGroup, onDuplicateGroup,
  onEntriesReordered, deleting, toggling, isDragOverlay,
}: {
  groupName: string; groupMeta: AdhkarGroup | undefined; items: Dhikr[];
  onClickRow: (d: Dhikr) => void; onEditEntry: (d: Dhikr) => void;
  onDeleteEntry: (d: Dhikr) => void; onToggleActive: (d: Dhikr) => void;
  onMoveEntry: (d: Dhikr) => void;
  onEditGroup: (groupName: string, meta: AdhkarGroup | undefined) => void;
  onRenameGroup: (groupName: string, newName: string, meta: AdhkarGroup | undefined) => void;
  onDescriptionSave: (groupName: string, description: string, meta: AdhkarGroup | undefined) => void;
  onAddToGroup: (groupName: string, prayerTime: string) => void;
  onDeleteGroup: (groupName: string, meta: AdhkarGroup | undefined) => void;
  onDuplicateGroup: (groupName: string, items: Dhikr[], meta: AdhkarGroup | undefined) => void;
  onEntriesReordered: (reorderedItems: Dhikr[]) => void;
  deleting: string | null; toggling: string | null; isDragOverlay?: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `group:${groupName}` });
  const [collapsed, setCollapsed] = useState(true);
  const [entryDragActiveId, setEntryDragActiveId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [descEditing, setDescEditing] = useState(false);
  const [descValue, setDescValue] = useState('');
  const [descSaving, setDescSaving] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const icon = groupMeta?.icon ?? '📋';
  const iconBg = groupMeta?.icon_bg_color ?? '#6366f1';
  const badgeText = groupMeta?.badge_text;
  const badgeColor = groupMeta?.badge_color ?? '#6366f1';
  const description = groupMeta?.description;
  const isUngrouped = groupName === '(Ungrouped)';
  const entryDragActiveItem = entryDragActiveId ? items.find((d) => d.id === entryDragActiveId) : null;

  const handleEntryDragEnd = async (event: DragEndEvent) => {
    setEntryDragActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((d) => d.id === active.id);
    const newIndex = items.findIndex((d) => d.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(items, oldIndex, newIndex).map((d, i) => ({ ...d, display_order: (i + 1) * 10 }));
    onEntriesReordered(reordered);
    const changed = reordered.filter((d, i) => d.display_order !== items[i]?.display_order);
    try {
      await Promise.all(changed.map((d) => updateDhikr(d.id, { display_order: d.display_order ?? 0 })));
    } catch {
      toast.error('Failed to save new order. Please refresh.');
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      className={`rounded-xl border border-border overflow-hidden shadow-sm ${isDragOverlay ? 'rotate-1 shadow-xl' : ''}`}
    >
      <div className="flex items-center gap-3 px-4 py-3 select-none" style={{ background: 'hsl(var(--card))' }}>
        <button
          {...attributes} {...listeners}
          className="shrink-0 touch-none cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground transition-colors p-0.5"
          title="Drag to reorder group" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} />
        </button>
        <button className="text-muted-foreground shrink-0" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
        {!isUngrouped && (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0" style={{ background: iconBg }}>
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0" onClick={() => !renaming && setCollapsed((c) => !c)}>
          <div className="flex items-center gap-2 flex-wrap">
            {renaming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const newName = renameValue.trim() || groupName;
                  onRenameGroup(groupName, newName, groupMeta);
                  setRenaming(false);
                }}
                className="flex gap-1.5" onClick={(e) => e.stopPropagation()}
              >
                <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                  className="h-7 text-sm w-48 font-semibold" autoFocus
                  onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(false); }} />
                <button type="submit" className="px-2 h-7 rounded text-xs bg-primary text-primary-foreground font-medium">Save</button>
                <button type="button" onClick={() => setRenaming(false)} className="px-2 h-7 rounded text-xs border border-input text-muted-foreground">✕</button>
              </form>
            ) : (
              <span className="font-semibold text-sm text-foreground cursor-pointer" onClick={() => setCollapsed((c) => !c)}>{groupName}</span>
            )}
            {!renaming && badgeText && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-white" style={{ background: badgeColor }}>{badgeText}</span>
            )}
            {!renaming && <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? 'dhikr' : 'adhkar'}</span>}
          </div>
          {!renaming && (
            descEditing ? (
              <div className="mt-1.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                <textarea
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  placeholder="Short description shown under the group title…"
                  className="w-full max-w-xl rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={2}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Escape') setDescEditing(false); }}
                />
                <div className="flex gap-1.5">
                  <button
                    disabled={descSaving}
                    onClick={async (e) => {
                      e.stopPropagation();
                      setDescSaving(true);
                      await onDescriptionSave(groupName, descValue.trim(), groupMeta);
                      setDescSaving(false);
                      setDescEditing(false);
                    }}
                    className="px-2.5 h-6 rounded text-[11px] font-semibold bg-primary text-primary-foreground disabled:opacity-60"
                  >
                    {descSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDescEditing(false); }}
                    className="px-2 h-6 rounded text-[11px] border border-input text-muted-foreground hover:bg-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p
                className="text-xs text-muted-foreground mt-0.5 max-w-xl cursor-text hover:text-foreground transition-colors"
                title="Click to edit description"
                onClick={(e) => { e.stopPropagation(); setDescValue(description ?? ''); setDescEditing(true); setCollapsed(false); }}
              >
                {description ? description : <span className="italic opacity-50">+ add description…</span>}
              </p>
            )
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {!isUngrouped && (
            <>
              {/* Inline rename button */}
              <button
                onClick={() => { setRenameValue(groupName); setRenaming(true); setCollapsed(false); }}
                className="p-1.5 rounded-lg hover:bg-purple-50 transition-colors"
                title="Rename group name"
              >
                <Pencil size={13} className="text-purple-500" />
              </button>
              {/* Full style edit (icon, colours, etc.) */}
              <button
                onClick={() => onEditGroup(groupName, groupMeta)}
                className="p-1.5 rounded-lg hover:bg-accent/10 transition-colors"
                title="Edit group style (icon, colours, badge, prayer time)"
              >
                <span className="text-[11px] font-bold" style={{ color: 'hsl(var(--accent))' }}>⚙</span>
              </button>
              <button
                onClick={() => onDuplicateGroup(groupName, items, groupMeta)}
                className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                title="Duplicate group with all its entries"
              >
                <Copy size={13} className="text-blue-500" />
              </button>
              <button onClick={() => onDeleteGroup(groupName, groupMeta)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="Delete group">
                <Trash2 size={13} className="text-destructive" />
              </button>
            </>
          )}
          <button
            onClick={() => onAddToGroup(groupName, items[0]?.prayer_time ?? 'after-fajr')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors"
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      {!collapsed && !isDragOverlay && (
        <div className="bg-background">
          <DndContext
            sensors={sensors} collisionDetection={closestCenter}
            onDragStart={(e) => setEntryDragActiveId(e.active.id as string)}
            onDragEnd={handleEntryDragEnd}
          >
            <SortableContext items={items.map((d) => d.id)} strategy={verticalListSortingStrategy}>
              {items.map((row, idx) => (
                <SortableEntryRow
                  key={row.id} row={row} idx={idx}
                  onClickRow={onClickRow} onEditEntry={onEditEntry}
                  onDeleteEntry={onDeleteEntry} onToggleActive={onToggleActive}
                  onMoveEntry={onMoveEntry}
                  deleting={deleting} toggling={toggling}
                />
              ))}
            </SortableContext>
            <DragOverlay>
              {entryDragActiveItem && (
                <SortableEntryRow
                  row={entryDragActiveItem} idx={0}
                  onClickRow={() => {}} onEditEntry={() => {}} onDeleteEntry={() => {}} onToggleActive={() => {}}
                  onMoveEntry={() => {}}
                  deleting={null} toggling={null} isDragOverlay
                />
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}
      {isDragOverlay && (
        <div className="bg-background px-5 py-2 text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? 'dhikr' : 'adhkar'}
        </div>
      )}
    </div>
  );
};

// ─── Prayer Time Section ──────────────────────────────────────────────────────

interface PrayerTimeSectionProps {
  cat: string; catItems: Dhikr[]; groupMap: Record<string, AdhkarGroup>;
  onClickRow: (d: Dhikr) => void; onEditEntry: (d: Dhikr) => void;
  onDeleteEntry: (d: Dhikr) => void; onToggleActive: (d: Dhikr) => void;
  onMoveEntry: (d: Dhikr) => void;
  onEditGroup: (groupName: string, meta: AdhkarGroup | undefined) => void;
  onRenameGroup: (groupName: string, newName: string, meta: AdhkarGroup | undefined) => void;
  onDescriptionSave: (groupName: string, description: string, meta: AdhkarGroup | undefined) => void;
  onAddToGroup: (groupName: string, prayerTime: string) => void;
  onDeleteGroup: (groupName: string, meta: AdhkarGroup | undefined) => void;
  onDuplicateGroup: (groupName: string, items: Dhikr[], meta: AdhkarGroup | undefined) => void;
  onGroupsReordered: (cat: string, newOrder: string[]) => void;
  onEntriesReordered: (groupName: string, reorderedItems: Dhikr[]) => void;
  deleting: string | null; toggling: string | null;
}

const PrayerTimeSection = ({
  cat, catItems, groupMap,
  onClickRow, onEditEntry, onDeleteEntry, onToggleActive, onMoveEntry,
  onEditGroup, onRenameGroup, onDescriptionSave, onAddToGroup, onDeleteGroup, onDuplicateGroup,
  onGroupsReordered, onEntriesReordered, deleting, toggling,
}: PrayerTimeSectionProps) => {
  const [groupDragActiveId, setGroupDragActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const colors = CATEGORY_COLORS[cat];

  const groupOrder: Record<string, number> = {};
  catItems.forEach((d) => {
    const key = d.group_name ?? '(Ungrouped)';
    if (!(key in groupOrder)) groupOrder[key] = d.group_order ?? 9999;
  });
  const sortedGroupNames = Object.keys(groupOrder).sort((a, b) => (groupOrder[a] ?? 9999) - (groupOrder[b] ?? 9999));

  const grouped: Record<string, Dhikr[]> = {};
  catItems.forEach((d) => {
    const key = d.group_name ?? '(Ungrouped)';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(d);
  });

  const sortableIds = sortedGroupNames.map((n) => `group:${n}`);
  const activeGroupName = groupDragActiveId ? groupDragActiveId.replace(/^group:/, '') : null;

  const handleGroupDragEnd = async (event: DragEndEvent) => {
    setGroupDragActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortableIds.indexOf(active.id as string);
    const newIndex = sortableIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const reorderedGroupNames = arrayMove(sortedGroupNames, oldIndex, newIndex);
    onGroupsReordered(cat, reorderedGroupNames);

    const updates: Promise<unknown>[] = [];
    reorderedGroupNames.forEach((name, i) => {
      const newGroupOrder = (i + 1) * 10;
      const meta = groupMap[name];
      if (meta?.id) {
        updates.push(updateAdhkarGroup(meta.id, { display_order: newGroupOrder }).catch((err) => console.warn(`Failed to update group ${name}:`, err)));
      }
      (grouped[name] ?? []).forEach((d) => {
        if (d.group_order !== newGroupOrder) {
          updates.push(updateDhikr(d.id, { group_order: newGroupOrder }).catch((err) => console.warn(`Failed to update dhikr ${d.id}:`, err)));
        }
      });
    });
    try {
      await Promise.all(updates);
    } catch {
      toast.error('Failed to save group order.');
    }
  };

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors?.dot ?? '#6b7280' }} />
        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${colors?.pill ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
          {PRAYER_TIME_LABELS[cat] ?? cat}
        </span>
        <span className="text-xs text-muted-foreground">
          {catItems.length} {catItems.length === 1 ? 'entry' : 'entries'} · {sortedGroupNames.length}{' '}
          {sortedGroupNames.length === 1 ? 'group' : 'groups'}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="pl-5">
        <DndContext
          sensors={sensors} collisionDetection={closestCenter}
          onDragStart={(e: DragStartEvent) => setGroupDragActiveId(e.active.id as string)}
          onDragEnd={handleGroupDragEnd}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {sortedGroupNames.map((groupName) => (
                <SortableGroupSection
                  key={groupName} groupName={groupName} groupMeta={groupMap[groupName]}
                  items={grouped[groupName] ?? []}
                  onClickRow={onClickRow} onEditEntry={onEditEntry}
                  onDeleteEntry={onDeleteEntry} onToggleActive={onToggleActive}
                  onMoveEntry={onMoveEntry}
                  onEditGroup={onEditGroup} onRenameGroup={onRenameGroup} onDescriptionSave={onDescriptionSave} onAddToGroup={onAddToGroup}
                  onDeleteGroup={onDeleteGroup} onDuplicateGroup={onDuplicateGroup}
                  onEntriesReordered={(reorderedItems) => onEntriesReordered(groupName, reorderedItems)}
                  deleting={deleting} toggling={toggling}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeGroupName && grouped[activeGroupName] && (
              <SortableGroupSection
                groupName={activeGroupName} groupMeta={groupMap[activeGroupName]}
                items={grouped[activeGroupName]}
                onClickRow={() => {}} onEditEntry={() => {}} onDeleteEntry={() => {}} onToggleActive={() => {}}
                onMoveEntry={() => {}}
                onEditGroup={() => {}} onRenameGroup={() => {}} onDescriptionSave={() => {}} onAddToGroup={() => {}} onDeleteGroup={() => {}} onDuplicateGroup={() => {}}
                onEntriesReordered={() => {}} deleting={null} toggling={null} isDragOverlay
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </section>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const Adhkar = () => {
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState<Dhikr | null>(null);
  const [presetGroup, setPresetGroup] = useState<{ name: string; prayerTime: string } | null>(null);
  const [detailRow, setDetailRow] = useState<Dhikr | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Dhikr[]>([]);
  const [toggling, setToggling] = useState<string | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<AdhkarGroup | null>(null);
  const [testCreating, setTestCreating] = useState(false);

  // Move-to-group state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Dhikr | null>(null);
  const [moveNewGroup, setMoveNewGroup] = useState('');
  const [moveNewPrayerTime, setMoveNewPrayerTime] = useState('after-fajr');
  const [moveSaving, setMoveSaving] = useState(false);

  // Duplicate group state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<{ name: string; items: Dhikr[]; meta: AdhkarGroup | undefined } | null>(null);
  const [dupNewName, setDupNewName] = useState('');
  const [dupPrayerTime, setDupPrayerTime] = useState('after-fajr');
  const [dupSaving, setDupSaving] = useState(false);

  const queryClient = useQueryClient();

  const { data: adhkar = [], isFetching, refetch } = useQuery({
    queryKey: ['adhkar'],
    queryFn: () => fetchAdhkar(),
  });

  const { data: groupsList = [], refetch: refetchGroups } = useQuery({
    queryKey: ['adhkar-groups'],
    queryFn: () => fetchAdhkarGroups(),
  });

  const groupMap = useMemo(() => {
    const map: Record<string, AdhkarGroup> = {};
    groupsList.forEach((g) => { map[g.name] = g; });
    return map;
  }, [groupsList]);

  const filtered = adhkar.filter((d) => {
    const matchCat = filterCategory === 'All' || d.prayer_time === filterCategory;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      d.title.toLowerCase().includes(q) ||
      d.arabic.includes(q) ||
      (d.arabic_title ?? '').includes(q) ||
      (d.transliteration ?? '').toLowerCase().includes(q) ||
      (d.translation ?? '').toLowerCase().includes(q) ||
      (d.group_name ?? '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const presentCategories = PRAYER_TIME_CATEGORIES.filter((cat) => adhkar.some((d) => d.prayer_time === cat));
  const unknownCategories = [...new Set(adhkar.map((d) => d.prayer_time))].filter(
    (cat) => !PRAYER_TIME_CATEGORIES.includes(cat as typeof PRAYER_TIME_CATEGORIES[number])
  );
  const allCategories = [...presentCategories, ...unknownCategories];

  const handleOpenAdd = (groupName?: string, prayerTime?: string) => {
    setEditRow(null);
    setPresetGroup(groupName ? { name: groupName, prayerTime: prayerTime ?? 'after-fajr' } : null);
    setModalOpen(true);
  };

  const handleOpenDetail = (row: Dhikr) => setDetailRow(row);

  const handleEdit = (row: Dhikr) => {
    setDetailRow(null);
    setEditRow(row);
    setPresetGroup(null);
    setModalOpen(true);
  };

  // Modal always creates new entries (copy-on-edit)
  const handleSaved = (dhikr: Dhikr) => {
    queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => [...old, dhikr]);
    setModalOpen(false);
    setEditRow(null);
    setDetailRow(null);
    setPresetGroup(null);
  };

  const handleUpdated = (dhikr: Dhikr) => {
    queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) =>
      old.map((d) => (d.id === dhikr.id ? dhikr : d))
    );
    setModalOpen(false);
    setEditRow(null);
  };

  const handleFinalized = (tempId: string, real: Dhikr) => {
    queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => old.map((d) => (d.id === tempId ? real : d)));
  };

  // Modal always creates; revert just removes the temp row
  const handleRevert = (id: string) => {
    queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => old.filter((d) => d.id !== id));
  };

  // ─── Move to group ────────────────────────────────────────────────────────
  const handleOpenMove = (row: Dhikr) => {
    setMoveTarget(row);
    setMoveNewGroup(row.group_name ?? '');
    setMoveNewPrayerTime(row.prayer_time);
    setMoveDialogOpen(true);
  };

  const handleMoveConfirm = async () => {
    if (!moveTarget) return;
    setMoveSaving(true);
    const patch = { group_name: moveNewGroup.trim() || null, prayer_time: moveNewPrayerTime };
    queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) =>
      old.map((d) => (d.id === moveTarget.id ? { ...d, ...patch } : d))
    );
    setMoveDialogOpen(false);
    try {
      const real = await updateDhikr(moveTarget.id, patch);
      queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) =>
        old.map((d) => (d.id === moveTarget.id ? real : d))
      );
      toast.success(`Moved to "${moveNewGroup || '(Ungrouped)'}"`);
    } catch {
      queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) =>
        old.map((d) => (d.id === moveTarget.id ? moveTarget : d))
      );
      toast.error('Failed to move entry.');
    } finally {
      setMoveSaving(false);
      setMoveTarget(null);
    }
  };

  const handleToggleActive = async (row: Dhikr) => {
    setToggling(row.id);
    const updated = { ...row, is_active: !row.is_active };
    queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => old.map((d) => (d.id === row.id ? updated : d)));
    try {
      const real = await updateDhikr(row.id, { is_active: !row.is_active });
      queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => old.map((d) => (d.id === row.id ? real : d)));
      toast.success(`"${row.title}" ${!row.is_active ? 'activated' : 'deactivated'}.`);
    } catch {
      queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => old.map((d) => (d.id === row.id ? row : d)));
      toast.error('Failed to update status.');
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (row: Dhikr) => {
    setDetailRow(null);
    setDeleting(row.id);
    queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => old.filter((d) => d.id !== row.id));
    setUndoStack((prev) => [...prev.slice(-29), row]);
    try {
      await deleteDhikr(row.id);
      toast.success(`"${row.title}" deleted — use Undo to restore.`);
    } catch (err) {
      console.error('[Adhkar] Delete failed:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to delete "${row.title}": ${msg}`);
      // Revert optimistic removal
      queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => {
        const restored = [...(old ?? []), row];
        return restored.sort((a, b) => {
          const pc = (a.prayer_time ?? '').localeCompare(b.prayer_time ?? '');
          if (pc !== 0) return pc;
          const gc = (a.group_order ?? 9999) - (b.group_order ?? 9999);
          if (gc !== 0) return gc;
          return (a.display_order ?? 9999) - (b.display_order ?? 9999);
        });
      });
      setUndoStack((prev) => prev.filter((d) => d.id !== row.id));
    } finally {
      setDeleting(null);
    }
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const row = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    const { id: _oldId, created_at: _ca, updated_at: _ua, ...payload } = row;
    const tempId = `temp-undo-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const optimistic: Dhikr = { id: tempId, ...payload, created_at: now, updated_at: now };
    queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => {
      const restored = [...(old ?? []), optimistic];
      return restored.sort((a, b) => {
        const pc = (a.prayer_time ?? '').localeCompare(b.prayer_time ?? '');
        if (pc !== 0) return pc;
        const gc = (a.group_order ?? 9999) - (b.group_order ?? 9999);
        if (gc !== 0) return gc;
        return (a.display_order ?? 9999) - (b.display_order ?? 9999);
      });
    });
    import('@/lib/api').then(({ createDhikr }) =>
      createDhikr(payload).then((real) => {
        queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => old.map((d) => (d.id === tempId ? real : d)));
        toast.success(`"${row.title}" restored.`);
      }).catch(() => {
        queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => old.filter((d) => d.id !== tempId));
        toast.error(`Failed to restore "${row.title}".`);
        setUndoStack((prev) => [...prev, row]);
      })
    );
  };

  // ─── Duplicate Group ──────────────────────────────────────────────────────
  const handleDuplicateGroup = (groupName: string, items: Dhikr[], meta: AdhkarGroup | undefined) => {
    setDuplicateSource({ name: groupName, items, meta });
    setDupNewName(`${groupName} (copy)`);
    setDupPrayerTime(items[0]?.prayer_time ?? 'after-fajr');
    setDuplicateDialogOpen(true);
  };

  const handleDuplicateConfirm = async () => {
    if (!duplicateSource || !dupNewName.trim()) return;
    setDupSaving(true);
    const newGroupName = dupNewName.trim();
    const sourceItems = duplicateSource.items;
    const sourceMeta = duplicateSource.meta;

    let newGroupMeta: AdhkarGroup | undefined;
    try {
      newGroupMeta = await createAdhkarGroup({
        name: newGroupName, prayer_time: dupPrayerTime,
        icon: sourceMeta?.icon ?? '📋', icon_color: sourceMeta?.icon_color ?? '#ffffff',
        icon_bg_color: sourceMeta?.icon_bg_color ?? '#6366f1',
        badge_text: sourceMeta?.badge_text ?? null, badge_color: sourceMeta?.badge_color ?? '#6366f1',
        description: sourceMeta?.description ?? null, display_order: (sourceMeta?.display_order ?? 0) + 10,
      });
      queryClient.setQueryData<AdhkarGroup[]>(['adhkar-groups'], (old = []) => [...old, newGroupMeta!]);
    } catch {
      toast.error('Failed to create group metadata.');
      setDupSaving(false);
      return;
    }

    const now = new Date().toISOString();
    const tempIds: string[] = sourceItems.map(() => `temp-dup-${crypto.randomUUID()}`);
    const optimisticEntries: Dhikr[] = sourceItems.map((src, idx) => ({
      ...src, id: tempIds[idx], group_name: newGroupName, prayer_time: dupPrayerTime,
      display_order: src.display_order ?? (idx + 1) * 10, created_at: now, updated_at: now,
    }));
    queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => [...old, ...optimisticEntries]);
    setDuplicateDialogOpen(false);
    setDuplicateSource(null);
    setDupSaving(false);

    const results = await Promise.allSettled(
      sourceItems.map(async (src, idx) => {
        const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = src;
        const real = await createDhikr({
          ...rest, group_name: newGroupName, prayer_time: dupPrayerTime,
          display_order: src.display_order ?? (idx + 1) * 10,
        });
        queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) =>
          old.map((d) => (d.id === tempIds[idx] ? real : d))
        );
        return real;
      })
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) toast.error(`${failed} entr${failed === 1 ? 'y' : 'ies'} failed to copy.`);
    else toast.success(`Duplicated "${duplicateSource.name}" → "${newGroupName}" with ${sourceItems.length} entr${sourceItems.length === 1 ? 'y' : 'ies'}.`);
    console.log('[Adhkar] Duplicate complete. New group meta:', newGroupMeta);
  };

  // ─── Group handlers ───────────────────────────────────────────────────────
  const handleGroupsReordered = (cat: string, newGroupOrder: string[]) => {
    queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) =>
      old.map((d) => {
        if (d.prayer_time !== cat) return d;
        const groupKey = d.group_name ?? '(Ungrouped)';
        const newOrder = (newGroupOrder.indexOf(groupKey) + 1) * 10;
        return { ...d, group_order: newOrder };
      })
    );
  };

  const handleEntriesReordered = (_groupName: string, reorderedItems: Dhikr[]) => {
    queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => {
      const updatedMap = new Map(reorderedItems.map((d) => [d.id, d]));
      return old.map((d) => updatedMap.get(d.id) ?? d);
    });
  };

  const handleCreateTest = async () => {
    setTestCreating(true);
    try {
      let group = groupsList.find((g) => g.name === 'Test Group');
      if (!group) {
        group = await createAdhkarGroup({
          name: 'Test Group', prayer_time: 'after-fajr', icon: '🧪',
          icon_color: '#ffffff', icon_bg_color: '#10b981', badge_text: 'Test',
          badge_color: '#10b981', description: 'Auto-generated test group', display_order: 999,
        });
        queryClient.setQueryData<AdhkarGroup[]>(['adhkar-groups'], (old = []) => [...old, group!]);
      }
      const tempId = `temp-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const payload = {
        title: 'Test Dhikr Entry', arabic_title: 'اختبار', arabic: 'سُبْحَانَ اللَّهِ',
        transliteration: 'SubḥānaAllāh', translation: 'Glory be to Allah',
        reference: 'Test reference', count: '3', prayer_time: 'after-fajr',
        group_name: 'Test Group', group_order: 999, display_order: 1, is_active: true, sections: null,
      };
      queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => [...old, { id: tempId, ...payload, created_at: now, updated_at: now }]);
      const real = await createDhikr(payload);
      queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) => old.map((d) => (d.id === tempId ? real : d)));
      toast.success('Test group + dhikr created.');
    } catch (err: unknown) {
      toast.error(`Test creation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setTestCreating(false);
    }
  };

  // ─── Inline description save ─────────────────────────────────────────────
  const handleDescriptionSave = async (groupName: string, description: string, meta: AdhkarGroup | undefined) => {
    // Optimistically update the cache
    queryClient.setQueryData<AdhkarGroup[]>(['adhkar-groups'], (old = []) =>
      old.map((g) => (g.name === groupName ? { ...g, description } : g))
    );
    if (meta?.id) {
      try {
        await updateAdhkarGroup(meta.id, { description });
        // Also sync description to external backend via Edge Function
        supabase.functions.invoke('sync-group', {
          body: { groupName, payload: { description } },
        }).catch((e) => console.warn('[Adhkar] Description sync (non-critical):', e));
        toast.success('Group description updated.');
      } catch (err) {
        // Revert on failure
        queryClient.setQueryData<AdhkarGroup[]>(['adhkar-groups'], (old = []) =>
          old.map((g) => (g.name === groupName ? { ...g, description: meta.description ?? null } : g))
        );
        toast.error(`Failed to save description: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    } else {
      toast.success('Description updated locally (no metadata record).');
    }
  };

  // ─── Inline rename (saves directly without opening modal) ─────────────────
  const handleRenameGroup = async (oldGroupName: string, newName: string, meta: AdhkarGroup | undefined) => {
    if (newName === oldGroupName) return;
    // Optimistically update the cache
    queryClient.setQueryData<AdhkarGroup[]>(['adhkar-groups'], (old = []) =>
      old.map((g) => (g.name === oldGroupName ? { ...g, name: newName } : g))
    );
    queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) =>
      old.map((d) => (d.group_name === oldGroupName ? { ...d, group_name: newName } : d))
    );
    if (meta?.id) {
      try {
        await updateAdhkarGroup(meta.id, { name: newName });
        // Cascade rename on external backend: updates adhkar_groups name + all adhkar entries
        supabase.functions.invoke('sync-group', {
          body: { groupName: newName, payload: { name: newName }, oldGroupName },
        }).then((res) => {
          const cascaded = (res.data as Record<string, unknown>)?.cascadedEntries;
          if (typeof cascaded === 'number' && cascaded > 0)
            console.log(`[Adhkar] Cascaded ${cascaded} entries on external backend.`);
        }).catch((e) => console.warn('[Adhkar] Rename sync (non-critical):', e));
        toast.success(`Group renamed to "${newName}".`);
      } catch (err) {
        // Revert on failure
        queryClient.setQueryData<AdhkarGroup[]>(['adhkar-groups'], (old = []) =>
          old.map((g) => (g.name === newName ? { ...g, name: oldGroupName } : g))
        );
        queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) =>
          old.map((d) => (d.group_name === newName ? { ...d, group_name: oldGroupName } : d))
        );
        toast.error(`Failed to rename group: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    } else {
      toast.success(`Group renamed to "${newName}" (no metadata record to update).`);
    }
  };

  const handleGroupSaved = (saved: AdhkarGroup, oldName?: string, oldPrayerTime?: string) => {
    queryClient.setQueryData<AdhkarGroup[]>(['adhkar-groups'], (old = []) => {
      const exists = old.some((g) => g.id === saved.id);
      return exists ? old.map((g) => (g.id === saved.id ? saved : g)) : [...old, saved];
    });
    if (oldName && (oldName !== saved.name || (oldPrayerTime && oldPrayerTime !== saved.prayer_time))) {
      queryClient.setQueryData<Dhikr[]>(['adhkar'], (old = []) =>
        old.map((d) => {
          if (d.group_name !== oldName) return d;
          return {
            ...d,
            group_name: saved.name,
            ...(saved.prayer_time && oldPrayerTime !== saved.prayer_time ? { prayer_time: saved.prayer_time } : {}),
          };
        })
      );
    }
    setGroupModalOpen(false);
    setEditGroup(null);
  };

  const filteredCategories =
    filterCategory === 'All'
      ? allCategories.filter((cat) => filtered.some((d) => d.prayer_time === cat))
      : [filterCategory];

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <Sidebar />

      <main className="flex-1 p-4 sm:p-8 overflow-x-auto pt-[4.5rem] md:pt-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>Adhkar Management</h1>
            <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {adhkar.length} adhkar · {groupsList.length} groups · drag handles to reorder
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {undoStack.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleUndo}
                className="gap-2 border-amber-400/60 text-amber-700 hover:bg-amber-50 hover:border-amber-500"
                title={`Restore: "${undoStack[undoStack.length - 1]?.title}"`}>
                ↩ Undo
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">{undoStack.length}</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleCreateTest} disabled={testCreating} className="gap-2 border-primary/30 text-primary hover:bg-primary/5">
              {testCreating ? '⏳' : '🧪'} {testCreating ? 'Creating…' : 'Test Entry'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { refetch(); refetchGroups(); }} disabled={isFetching} className="gap-2">
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => handleOpenAdd()} className="gap-2"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
              <Plus size={14} /> Add Dhikr
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search adhkar…" className="pl-9 h-9 text-sm" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterCategory('All')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${filterCategory === 'All' ? 'border-transparent text-white' : 'border-border bg-muted text-muted-foreground hover:bg-secondary'}`}
              style={filterCategory === 'All' ? { background: 'hsl(var(--primary))' } : {}}
            >
              All ({adhkar.length})
            </button>
            {allCategories.map((cat) => {
              const count = adhkar.filter((d) => d.prayer_time === cat).length;
              const colors = CATEGORY_COLORS[cat];
              const isActive = filterCategory === cat;
              return (
                <button key={cat} onClick={() => setFilterCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${isActive ? `${colors?.pill ?? 'bg-gray-100 text-gray-700 border-gray-200'} font-semibold` : 'border-border bg-muted text-muted-foreground hover:bg-secondary'}`}>
                  {PRAYER_TIME_LABELS[cat] ?? cat} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 gap-3 text-muted-foreground rounded-xl border border-border bg-card">
            <BookOpen size={32} className="opacity-30" />
            <p className="text-sm">{adhkar.length === 0 ? 'No adhkar found in database.' : 'No results match your search.'}</p>
          </div>
        ) : (
          <div className="space-y-10">
            {filteredCategories.map((cat) => {
              const catItems = filtered.filter((d) => d.prayer_time === cat);
              if (catItems.length === 0) return null;
              return (
                <PrayerTimeSection
                  key={cat} cat={cat} catItems={catItems} groupMap={groupMap}
                  onClickRow={handleOpenDetail} onEditEntry={handleEdit}
                  onDeleteEntry={handleDelete} onToggleActive={handleToggleActive}
                  onMoveEntry={handleOpenMove}
                  onEditGroup={(name, meta) => {
                    if (meta?.id) setEditGroup(meta);
                    else setEditGroup({ name } as AdhkarGroup);
                    setGroupModalOpen(true);
                  }}
                  onRenameGroup={handleRenameGroup}
                  onDescriptionSave={handleDescriptionSave}
                  onDeleteGroup={async (name, meta) => {
                    if (!confirm(`Delete group "${name}" metadata? Adhkar entries in this group will NOT be deleted.`)) return;
                    if (meta?.id) {
                      await import('@/lib/api').then(({ deleteAdhkarGroup }) => deleteAdhkarGroup(meta.id));
                      queryClient.setQueryData<AdhkarGroup[]>(['adhkar-groups'], (old = []) => old.filter((g) => g.id !== meta.id));
                      toast.success(`Group "${name}" deleted.`);
                    } else {
                      toast.error('Group has no metadata record to delete.');
                    }
                  }}
                  onDuplicateGroup={handleDuplicateGroup}
                  onAddToGroup={(name, pt) => handleOpenAdd(name, pt)}
                  onGroupsReordered={handleGroupsReordered}
                  onEntriesReordered={handleEntriesReordered}
                  deleting={deleting} toggling={toggling}
                />
              );
            })}
          </div>
        )}
      </main>

      <DhikrModal
        open={modalOpen} row={editRow} presetGroup={presetGroup}
        onClose={() => { setModalOpen(false); setEditRow(null); setPresetGroup(null); }}
        onSaved={handleSaved} onFinalized={handleFinalized} onRevert={handleRevert}
        onUpdated={handleUpdated}
      />

      <DhikrDetailPanel dhikr={detailRow} onClose={() => setDetailRow(null)} onEdit={handleEdit} onDelete={handleDelete} />

      <AdhkarGroupModal
        open={groupModalOpen} group={editGroup}
        onClose={() => { setGroupModalOpen(false); setEditGroup(null); }}
        onSaved={handleGroupSaved}
      />

      {/* ── Move to Group Dialog ── */}
      <Dialog
        open={moveDialogOpen}
        onOpenChange={(v) => { if (!moveSaving) { setMoveDialogOpen(v); if (!v) setMoveTarget(null); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ArrowRightLeft size={15} className="text-purple-500" />
              Move Entry
            </DialogTitle>
            <p className="text-xs text-muted-foreground pt-1">
              Reassign <strong>"{moveTarget?.title}"</strong> to a different group or prayer time.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Target Prayer Time</Label>
              <select
                value={moveNewPrayerTime}
                onChange={(e) => setMoveNewPrayerTime(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {PRAYER_TIME_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{PRAYER_TIME_LABELS[cat] ?? cat}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Target Group <span className="text-muted-foreground font-normal text-xs">(leave empty for Ungrouped)</span></Label>
              <Input
                value={moveNewGroup}
                onChange={(e) => setMoveNewGroup(e.target.value)}
                placeholder="Group name or leave empty"
                list="adhkar-move-group-list"
              />
              <datalist id="adhkar-move-group-list">
                {groupsList.map((g) => <option key={g.id} value={g.name} />)}
              </datalist>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setMoveDialogOpen(false); setMoveTarget(null); }} disabled={moveSaving}>Cancel</Button>
            <Button
              onClick={handleMoveConfirm}
              disabled={moveSaving}
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
            >
              {moveSaving ? 'Moving…' : 'Move Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Duplicate Group Dialog ── */}
      <Dialog
        open={duplicateDialogOpen}
        onOpenChange={(v) => { if (!dupSaving) { setDuplicateDialogOpen(v); if (!v) setDuplicateSource(null); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Copy size={15} className="text-blue-500" />
              Duplicate Group
            </DialogTitle>
            <p className="text-xs text-muted-foreground pt-1">
              Creates a full copy of <strong>"{duplicateSource?.name}"</strong> ({duplicateSource?.items.length} entr{(duplicateSource?.items.length ?? 0) === 1 ? 'y' : 'ies'}) under a new name and prayer time.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="dup-name">New Group Name *</Label>
              <Input
                id="dup-name"
                value={dupNewName}
                onChange={(e) => setDupNewName(e.target.value)}
                placeholder="e.g. Wird al-Latif (After Maghrib)"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dup-prayer-time">Target Prayer Time *</Label>
              <select
                id="dup-prayer-time"
                value={dupPrayerTime}
                onChange={(e) => setDupPrayerTime(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {PRAYER_TIME_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{PRAYER_TIME_LABELS[cat] ?? cat}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">All copied entries will be assigned to this prayer time.</p>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold text-blue-800 mb-1.5">What gets duplicated:</p>
              <ul className="text-xs text-blue-700 space-y-0.5 list-disc pl-4">
                <li>Group metadata (icon, colours, badge)</li>
                <li>All {duplicateSource?.items.length} entries with Arabic text, transliterations &amp; counts</li>
                <li>Original display order is preserved</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDuplicateDialogOpen(false); setDuplicateSource(null); }} disabled={dupSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleDuplicateConfirm}
              disabled={dupSaving || !dupNewName.trim()}
              className="gap-2"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
            >
              {dupSaving
                ? <><Loader2 size={13} className="animate-spin" /> Duplicating…</>
                : <><Copy size={13} /> Duplicate Group</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Adhkar;

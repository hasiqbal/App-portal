import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, FolderTree, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Sidebar from '#/components/layout/Sidebar';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Textarea } from '#/components/ui/textarea';
import { Switch } from '#/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '#/components/ui/dialog';
import {
  createHowToDemoGuide,
  createHowToVersionSnapshot,
  createHowToGroup,
  createHowToGuide,
  deleteHowToGroup,
  deleteHowToGuide,
  fetchHowToGuideTree,
  fetchHowToGroups,
  fetchHowToGuides,
  publishHowToGuide,
  saveHowToGuideTree,
  uploadHowToMedia,
  updateHowToGroup,
  updateHowToGuide,
} from '#/lib/api';
import { usePermissions } from '#/hooks/usePermissions';
import type { HowToGroup, HowToGuide, HowToLanguage } from '#/types';
import { toast } from 'sonner';

type GroupForm = {
  name: string;
  slug: string;
  icon: string;
  color: string;
  display_order: string;
  is_active: boolean;
};

type GuideForm = {
  group_id: string;
  title: string;
  slug: string;
  subtitle: string;
  intro: string;
  language: HowToLanguage;
  icon: string;
  color: string;
  display_order: string;
  is_active: boolean;
  publish_start_at: string;
  publish_end_at: string;
};

type BlockDraft = {
  block_order: number;
  kind: 'text' | 'action' | 'note' | 'recitation';
  payloadJson: string;
};

type ImageDraft = {
  display_order: number;
  image_url: string;
  thumb_url: string;
  caption: string;
  source: string;
};

type StepDraft = {
  step_id?: string;
  step_order: number;
  title: string;
  detail: string;
  note: string;
  rich_content_html: string;
  blocks: BlockDraft[];
  images: ImageDraft[];
  collapsed?: boolean;
};

type SectionDraft = {
  section_order: number;
  heading: string;
  steps: StepDraft[];
};

const GROUPS_KEY = ['howto-groups'];
const GUIDES_KEY = ['howto-guides'];

const EMPTY_GROUP_FORM: GroupForm = {
  name: '',
  slug: '',
  icon: 'menu-book',
  color: '#2e7d32',
  display_order: '0',
  is_active: true,
};

const EMPTY_GUIDE_FORM: GuideForm = {
  group_id: '',
  title: '',
  slug: '',
  subtitle: '',
  intro: '',
  language: 'en',
  icon: 'menu-book',
  color: '#2e7d32',
  display_order: '0',
  is_active: true,
  publish_start_at: '',
  publish_end_at: '',
};

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export default function HowToGuidesPage() {
  const queryClient = useQueryClient();
  const { canEdit, canDelete, role } = usePermissions();

  const [search, setSearch] = useState('');
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [guideDialogOpen, setGuideDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<HowToGroup | null>(null);
  const [editingGuide, setEditingGuide] = useState<HowToGuide | null>(null);
  const [treeGuide, setTreeGuide] = useState<HowToGuide | null>(null);
  const [treeDialogOpen, setTreeDialogOpen] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeSections, setTreeSections] = useState<SectionDraft[]>([]);
  const [uploadingByStepKey, setUploadingByStepKey] = useState<Record<string, boolean>>({});
  const [draggingSectionIndex, setDraggingSectionIndex] = useState<number | null>(null);
  const [draggingStepRef, setDraggingStepRef] = useState<{ sectionIndex: number; stepIndex: number } | null>(null);
  const [draggingBlockRef, setDraggingBlockRef] = useState<{ sectionIndex: number; stepIndex: number; blockIndex: number } | null>(null);
  const [draggingImageRef, setDraggingImageRef] = useState<{ sectionIndex: number; stepIndex: number; imageIndex: number } | null>(null);
  const [showGuideAdvanced, setShowGuideAdvanced] = useState(false);
  const [groupForm, setGroupForm] = useState<GroupForm>(EMPTY_GROUP_FORM);
  const [guideForm, setGuideForm] = useState<GuideForm>(EMPTY_GUIDE_FORM);
  const [saving, setSaving] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);

  const { data: groups = [], isLoading: groupsLoading, refetch: refetchGroups } = useQuery({
    queryKey: GROUPS_KEY,
    queryFn: () => fetchHowToGroups(),
  });

  const { data: guides = [], isLoading: guidesLoading, refetch: refetchGuides } = useQuery({
    queryKey: GUIDES_KEY,
    queryFn: () => fetchHowToGuides(),
  });

  const groupMap = useMemo(() => {
    const map = new Map<string, HowToGroup>();
    groups.forEach((group) => map.set(group.id, group));
    return map;
  }, [groups]);

  const filteredGuides = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return guides;
    return guides.filter((guide) => {
      const groupName = groupMap.get(guide.group_id)?.name ?? '';
      return (
        guide.title.toLowerCase().includes(needle) ||
        (guide.subtitle ?? '').toLowerCase().includes(needle) ||
        guide.slug.toLowerCase().includes(needle) ||
        groupName.toLowerCase().includes(needle)
      );
    });
  }, [guides, groupMap, search]);

  const openCreateGroup = () => {
    setEditingGroup(null);
    setGroupForm(EMPTY_GROUP_FORM);
    setGroupDialogOpen(true);
  };

  const openEditGroup = (group: HowToGroup) => {
    setEditingGroup(group);
    setGroupForm({
      name: group.name,
      slug: group.slug,
      icon: group.icon ?? 'menu-book',
      color: group.color ?? '#2e7d32',
      display_order: String(group.display_order ?? 0),
      is_active: group.is_active,
    });
    setGroupDialogOpen(true);
  };

  const openCreateGuide = () => {
    setEditingGuide(null);
    setShowGuideAdvanced(false);
    setGuideForm({
      ...EMPTY_GUIDE_FORM,
      group_id: groups[0]?.id ?? '',
    });
    setGuideDialogOpen(true);
  };

  const openEditGuide = (guide: HowToGuide) => {
    setEditingGuide(guide);
    setShowGuideAdvanced(true);
    setGuideForm({
      group_id: guide.group_id,
      title: guide.title,
      slug: guide.slug,
      subtitle: guide.subtitle ?? '',
      intro: guide.intro ?? '',
      language: guide.language,
      icon: guide.icon ?? 'menu-book',
      color: guide.color ?? '#2e7d32',
      display_order: String(guide.display_order ?? 0),
      is_active: guide.is_active,
      publish_start_at: guide.publish_start_at ? guide.publish_start_at.slice(0, 16) : '',
      publish_end_at: guide.publish_end_at ? guide.publish_end_at.slice(0, 16) : '',
    });
    setGuideDialogOpen(true);
  };

  const openTreeEditor = async (guide: HowToGuide) => {
    setTreeGuide(guide);
    setTreeDialogOpen(true);
    setTreeLoading(true);

    try {
      const tree = await fetchHowToGuideTree(guide.id);
      const nextSections: SectionDraft[] = (tree?.sections ?? []).map((item, sectionIndex) => ({
        section_order: item.section.section_order ?? sectionIndex,
        heading: item.section.heading,
        steps: item.steps.map((stepItem, stepIndex) => ({
          step_id: stepItem.step.id,
          step_order: stepItem.step.step_order ?? stepIndex,
          title: stepItem.step.title,
          detail: stepItem.step.detail ?? '',
          note: stepItem.step.note ?? '',
          rich_content_html: stepItem.step.rich_content_html ?? '',
            collapsed: false,
          blocks: stepItem.blocks.map((block, blockIndex) => ({
            block_order: block.block_order ?? blockIndex,
            kind: block.kind,
            payloadJson: JSON.stringify(block.payload ?? {}, null, 2),
          })),
          images: stepItem.images.map((image, imageIndex) => ({
            display_order: image.display_order ?? imageIndex,
            image_url: image.image_url,
            thumb_url: image.thumb_url ?? '',
            caption: image.caption ?? '',
            source: image.source ?? '',
          })),
        })),
      }));

      setTreeSections(nextSections);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load guide tree.');
      setTreeSections([]);
    } finally {
      setTreeLoading(false);
    }
  };

  const fileToBase64 = async (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });

  const handleUploadImageFile = async (sectionIndex: number, stepIndex: number, imageIndex: number, file: File) => {
    if (!treeGuide) {
      toast.error('No active guide selected for upload.');
      return;
    }

    const step = treeSections[sectionIndex]?.steps?.[stepIndex];
    if (!step?.step_id) {
      toast.error('Save the guide tree first, then upload images for persisted steps.');
      return;
    }

    const stepKey = `${sectionIndex}-${stepIndex}`;
    setUploadingByStepKey((prev) => ({ ...prev, [stepKey]: true }));

    try {
      const base64Data = await fileToBase64(file);
      const uploaded = await uploadHowToMedia({
        guideId: treeGuide.id,
        stepId: step.step_id,
        fileName: file.name,
        contentType: file.type || 'image/jpeg',
        base64Data,
      });

      setTreeSections((prev) => prev.map((section, sIdx) => {
        if (sIdx !== sectionIndex) return section;
        return {
          ...section,
          steps: section.steps.map((stepItem, stIdx) => {
            if (stIdx !== stepIndex) return stepItem;
            return {
              ...stepItem,
              images: stepItem.images.map((image, iIdx) => {
                if (iIdx !== imageIndex) return image;
                return {
                  ...image,
                  image_url: uploaded.image_url,
                  thumb_url: uploaded.thumb_url,
                };
              }),
            };
          }),
        };
      }));

      toast.success('Image uploaded and linked.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload image.');
    } finally {
      setUploadingByStepKey((prev) => ({ ...prev, [stepKey]: false }));
    }
  };

  const addSection = () => {
    setTreeSections((prev) => ([
      ...prev,
      {
        section_order: prev.length,
        heading: `Section ${prev.length + 1}`,
        steps: [],
      },
    ]));
  };

  const moveSection = (fromIndex: number, toIndex: number) => {
    setTreeSections((prev) => moveItem(prev, fromIndex, toIndex));
  };

  const moveStep = (sectionIndex: number, fromIndex: number, toIndex: number) => {
    setTreeSections((prev) => prev.map((section, idx) => {
      if (idx !== sectionIndex) return section;
      return {
        ...section,
        steps: moveItem(section.steps, fromIndex, toIndex),
      };
    }));
  };

  const moveBlock = (sectionIndex: number, stepIndex: number, fromIndex: number, toIndex: number) => {
    setTreeSections((prev) => prev.map((section, sIdx) => {
      if (sIdx !== sectionIndex) return section;
      return {
        ...section,
        steps: section.steps.map((step, stIdx) => {
          if (stIdx !== stepIndex) return step;
          return {
            ...step,
            blocks: moveItem(step.blocks, fromIndex, toIndex),
          };
        }),
      };
    }));
  };

  const moveImage = (sectionIndex: number, stepIndex: number, fromIndex: number, toIndex: number) => {
    setTreeSections((prev) => prev.map((section, sIdx) => {
      if (sIdx !== sectionIndex) return section;
      return {
        ...section,
        steps: section.steps.map((step, stIdx) => {
          if (stIdx !== stepIndex) return step;
          return {
            ...step,
            images: moveItem(step.images, fromIndex, toIndex),
          };
        }),
      };
    }));
  };

  const updateStepDraft = (
    sectionIndex: number,
    stepIndex: number,
    updater: (step: StepDraft) => StepDraft,
  ) => {
    setTreeSections((prev) => prev.map((section, sIdx) => {
      if (sIdx !== sectionIndex) return section;
      return {
        ...section,
        steps: section.steps.map((step, stIdx) => (stIdx === stepIndex ? updater(step) : step)),
      };
    }));
  };

  const appendStepDetailTemplate = (sectionIndex: number, stepIndex: number, template: string) => {
    updateStepDraft(sectionIndex, stepIndex, (step) => ({
      ...step,
      detail: step.detail.trim().length > 0 ? `${step.detail}\n\n${template}` : template,
    }));
  };

  const addTemplateBlock = (sectionIndex: number, stepIndex: number, kind: BlockDraft['kind']) => {
    const payloadByKind: Record<BlockDraft['kind'], string> = {
      text: '{\n  "text": ""\n}',
      action: '{\n  "label": "Action",\n  "text": ""\n}',
      note: '{\n  "variant": "note",\n  "text": ""\n}',
      recitation: '{\n  "label": "Recite:",\n  "arabic": [""],\n  "transliteration": [""],\n  "meaning": [""]\n}',
    };

    updateStepDraft(sectionIndex, stepIndex, (step) => ({
      ...step,
      blocks: [
        ...step.blocks,
        {
          block_order: step.blocks.length,
          kind,
          payloadJson: payloadByKind[kind],
        },
      ],
    }));
  };

  const handleDropSection = (targetIndex: number) => {
    if (draggingSectionIndex === null) return;
    moveSection(draggingSectionIndex, targetIndex);
    setDraggingSectionIndex(null);
  };

  const handleDropStep = (sectionIndex: number, targetStepIndex: number) => {
    if (!draggingStepRef) return;
    if (draggingStepRef.sectionIndex !== sectionIndex) {
      setDraggingStepRef(null);
      return;
    }
    moveStep(sectionIndex, draggingStepRef.stepIndex, targetStepIndex);
    setDraggingStepRef(null);
  };

  const handleDropBlock = (sectionIndex: number, stepIndex: number, targetBlockIndex: number) => {
    if (!draggingBlockRef) return;
    if (draggingBlockRef.sectionIndex !== sectionIndex || draggingBlockRef.stepIndex !== stepIndex) {
      setDraggingBlockRef(null);
      return;
    }
    moveBlock(sectionIndex, stepIndex, draggingBlockRef.blockIndex, targetBlockIndex);
    setDraggingBlockRef(null);
  };

  const handleDropImage = (sectionIndex: number, stepIndex: number, targetImageIndex: number) => {
    if (!draggingImageRef) return;
    if (draggingImageRef.sectionIndex !== sectionIndex || draggingImageRef.stepIndex !== stepIndex) {
      setDraggingImageRef(null);
      return;
    }
    moveImage(sectionIndex, stepIndex, draggingImageRef.imageIndex, targetImageIndex);
    setDraggingImageRef(null);
  };

  const addStep = (sectionIndex: number) => {
    setTreeSections((prev) => prev.map((section, idx) => {
      if (idx !== sectionIndex) return section;
      return {
        ...section,
        steps: [
          ...section.steps,
          {
            step_order: section.steps.length,
            title: `Step ${section.steps.length + 1}`,
            detail: '',
            note: '',
            rich_content_html: '',
            collapsed: false,
            blocks: [],
            images: [],
          },
        ],
      };
    }));
  };

  const saveTree = async () => {
    if (!treeGuide) return;
    setSaving(true);

    try {
      await saveHowToGuideTree(treeGuide.id, {
        sections: treeSections.map((section, sectionIndex) => ({
          heading: section.heading,
          section_order: sectionIndex,
          steps: section.steps.map((step, stepIndex) => ({
            step_order: stepIndex,
            title: step.title,
            detail: step.detail || null,
            note: step.note || null,
            rich_content_html: step.rich_content_html || null,
            blocks: step.blocks.map((block, blockIndex) => ({
              block_order: blockIndex,
              kind: block.kind,
              payload: (() => {
                try {
                  return JSON.parse(block.payloadJson || '{}') as Record<string, unknown>;
                } catch {
                  throw new Error(`Invalid JSON payload in section ${sectionIndex + 1}, step ${stepIndex + 1}.`);
                }
              })(),
            })),
            images: step.images.map((image, imageIndex) => ({
              display_order: imageIndex,
              image_url: image.image_url,
              thumb_url: image.thumb_url || null,
              caption: image.caption || null,
              source: image.source || null,
            })),
          })),
        })),
      });

      toast.success('Guide tree saved.');
      await openTreeEditor(treeGuide);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save guide tree.');
    } finally {
      setSaving(false);
    }
  };

  const publishGuide = async (guide: HowToGuide) => {
    try {
      await publishHowToGuide({
        guideId: guide.id,
        isActive: !guide.is_active,
        publishStartAt: guide.publish_start_at,
        publishEndAt: guide.publish_end_at,
      });
      await queryClient.invalidateQueries({ queryKey: GUIDES_KEY });
      toast.success(guide.is_active ? 'Guide unpublished.' : 'Guide published.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to publish guide.');
    }
  };

  const snapshotGuide = async (guide: HowToGuide) => {
    try {
      await createHowToVersionSnapshot(guide.id);
      toast.success('Guide snapshot created.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to snapshot guide.');
    }
  };

  const saveGroup = async () => {
    if (!groupForm.name.trim()) {
      toast.error('Group name is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: groupForm.name.trim(),
        slug: normalizeSlug(groupForm.slug || groupForm.name),
        icon: groupForm.icon.trim() || null,
        color: groupForm.color.trim() || null,
        display_order: Number(groupForm.display_order) || 0,
        is_active: groupForm.is_active,
      };

      if (editingGroup) {
        await updateHowToGroup(editingGroup.id, payload);
        toast.success('Group updated.');
      } else {
        await createHowToGroup(payload);
        toast.success('Group created.');
      }

      await queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
      setGroupDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save group.');
    } finally {
      setSaving(false);
    }
  };

  const saveGuide = async () => {
    if (!guideForm.title.trim()) {
      toast.error('Guide title is required.');
      return;
    }
    if (!guideForm.group_id) {
      toast.error('Select a group.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        group_id: guideForm.group_id,
        title: guideForm.title.trim(),
        slug: normalizeSlug(guideForm.slug || guideForm.title),
        subtitle: guideForm.subtitle.trim() || null,
        intro: guideForm.intro.trim() || null,
        language: guideForm.language,
        icon: guideForm.icon.trim() || null,
        color: guideForm.color.trim() || null,
        display_order: Number(guideForm.display_order) || 0,
        is_active: guideForm.is_active,
        publish_start_at: guideForm.publish_start_at ? new Date(guideForm.publish_start_at).toISOString() : null,
        publish_end_at: guideForm.publish_end_at ? new Date(guideForm.publish_end_at).toISOString() : null,
      };

      if (editingGuide) {
        await updateHowToGuide(editingGuide.id, payload);
        toast.success('Guide updated.');
      } else {
        await createHowToGuide(payload);
        toast.success('Guide created.');
      }

      await queryClient.invalidateQueries({ queryKey: GUIDES_KEY });
      setGuideDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save guide.');
    } finally {
      setSaving(false);
    }
  };

  const removeGroup = async (group: HowToGroup) => {
    if (!canDelete) return;
    const confirmed = window.confirm(`Delete group "${group.name}"? This fails if guides still exist in it.`);
    if (!confirmed) return;

    try {
      await deleteHowToGroup(group.id);
      await queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
      await queryClient.invalidateQueries({ queryKey: GUIDES_KEY });
      toast.success('Group deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete group.');
    }
  };

  const removeGuide = async (guide: HowToGuide) => {
    if (!canDelete) return;
    const confirmed = window.confirm(`Delete guide "${guide.title}"?`);
    if (!confirmed) return;

    try {
      await deleteHowToGuide(guide.id);
      await queryClient.invalidateQueries({ queryKey: GUIDES_KEY });
      toast.success('Guide deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete guide.');
    }
  };

  const createDemoGuide = async () => {
    if (!canEdit) return;

    setCreatingDemo(true);
    try {
      const result = await createHowToDemoGuide('en');
      await queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
      await queryClient.invalidateQueries({ queryKey: GUIDES_KEY });
      toast.success(`Demo created: ${result.guideTitle}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create demo guide.');
    } finally {
      setCreatingDemo(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden pt-14 md:pt-0">
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <FolderTree size={20} className="text-[hsl(142_60%_32%)]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[hsl(150_30%_12%)]">How-To Guides</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Manage parent-child guides for the app</p>
                <p className="text-[11px] mt-1 text-muted-foreground">Role: {role ?? 'guest'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => { void refetchGroups(); void refetchGuides(); }} disabled={groupsLoading || guidesLoading} className="gap-2">
                <RefreshCw size={14} className={groupsLoading || guidesLoading ? 'animate-spin' : ''} /> Refresh
              </Button>
              <Button size="sm" onClick={openCreateGroup} disabled={!canEdit} className="gap-2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                <Plus size={14} /> Add Group
              </Button>
              <Button size="sm" variant="outline" onClick={openCreateGuide} disabled={!canEdit || groups.length === 0} className="gap-2 border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)]">
                <BookOpen size={14} /> Add Guide
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-5 space-y-5">
          <div className="rounded-xl border border-[hsl(140_20%_86%)] bg-white p-4">
            <p className="text-sm font-semibold text-[hsl(150_30%_15%)]">Quick Start</p>
            <p className="text-xs text-muted-foreground mt-1">1) Create Group  2) Create Guide  3) Open Tree and add sections/steps/content.</p>
            <div className="mt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => void createDemoGuide()}
                disabled={!canEdit || creatingDemo}
              >
                <Plus size={14} /> {creatingDemo ? 'Creating demo...' : 'Create Demo Guide'}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-[hsl(140_20%_86%)] bg-white p-4">
            <Label htmlFor="howto-search" className="text-[11px] text-muted-foreground">Search guides</Label>
            <Input id="howto-search" className="mt-1 h-9 text-sm max-w-md" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, slug, or group..." />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-[hsl(140_20%_86%)] bg-white overflow-hidden">
              <header className="px-4 py-3 border-b border-[hsl(140_20%_92%)] bg-[hsl(140_20%_99%)]">
                <h2 className="text-sm font-semibold text-[hsl(150_30%_15%)]">Parent Groups ({groups.length})</h2>
              </header>
              <div className="divide-y">
                {groups.map((group) => (
                  <div key={group.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[hsl(150_30%_15%)]">{group.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">slug: {group.slug} · order: {group.display_order}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 rounded hover:bg-secondary/60" onClick={() => openEditGroup(group)} disabled={!canEdit} title="Edit group">
                        <Pencil size={14} />
                      </button>
                      {canDelete ? (
                        <button className="p-1.5 rounded hover:bg-destructive/10" onClick={() => void removeGroup(group)} title="Delete group">
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {groups.length === 0 ? <p className="px-4 py-5 text-xs text-muted-foreground">No groups yet.</p> : null}
              </div>
            </section>

            <section className="rounded-2xl border border-[hsl(140_20%_86%)] bg-white overflow-hidden">
              <header className="px-4 py-3 border-b border-[hsl(140_20%_92%)] bg-[hsl(140_20%_99%)]">
                <h2 className="text-sm font-semibold text-[hsl(150_30%_15%)]">Guides ({filteredGuides.length})</h2>
              </header>
              <div className="divide-y">
                {filteredGuides.map((guide) => (
                  <div key={guide.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[hsl(150_30%_15%)]">{guide.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {groupMap.get(guide.group_id)?.name ?? 'Unknown group'} · {guide.language.toUpperCase()} · order: {guide.display_order}
                      </p>
                      <p className="text-xs text-muted-foreground">slug: {guide.slug}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 rounded hover:bg-secondary/60" onClick={() => void openTreeEditor(guide)} disabled={!canEdit} title="Edit guide tree">
                        <FolderTree size={14} />
                      </button>
                      <button className="p-1.5 rounded hover:bg-secondary/60" onClick={() => void publishGuide(guide)} disabled={!canEdit} title={guide.is_active ? 'Unpublish' : 'Publish'}>
                        <BookOpen size={14} />
                      </button>
                      <button className="p-1.5 rounded hover:bg-secondary/60" onClick={() => void snapshotGuide(guide)} disabled={!canEdit} title="Create snapshot">
                        <RefreshCw size={14} />
                      </button>
                      <button className="p-1.5 rounded hover:bg-secondary/60" onClick={() => openEditGuide(guide)} disabled={!canEdit} title="Edit guide">
                        <Pencil size={14} />
                      </button>
                      {canDelete ? (
                        <button className="p-1.5 rounded hover:bg-destructive/10" onClick={() => void removeGuide(guide)} title="Delete guide">
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {filteredGuides.length === 0 ? <p className="px-4 py-5 text-xs text-muted-foreground">No guides match your filters.</p> : null}
              </div>
            </section>
          </div>
        </div>
      </main>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Edit Group' : 'Create Group'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div>
              <Label>Name</Label>
              <Input value={groupForm.name} onChange={(event) => setGroupForm((prev) => ({ ...prev, name: event.target.value, slug: prev.slug || normalizeSlug(event.target.value) }))} />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={groupForm.slug} onChange={(event) => setGroupForm((prev) => ({ ...prev, slug: normalizeSlug(event.target.value) }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Icon</Label>
                <Input value={groupForm.icon} onChange={(event) => setGroupForm((prev) => ({ ...prev, icon: event.target.value }))} />
              </div>
              <div>
                <Label>Color</Label>
                <Input value={groupForm.color} onChange={(event) => setGroupForm((prev) => ({ ...prev, color: event.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Display Order</Label>
              <Input type="number" value={groupForm.display_order} onChange={(event) => setGroupForm((prev) => ({ ...prev, display_order: event.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>Active</Label>
              <Switch checked={groupForm.is_active} onCheckedChange={(checked) => setGroupForm((prev) => ({ ...prev, is_active: checked }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void saveGroup()} disabled={saving || !canEdit}>{saving ? 'Saving...' : 'Save Group'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={guideDialogOpen} onOpenChange={setGuideDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingGuide ? 'Edit Guide' : 'Create Guide'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div>
              <Label>Group</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1"
                value={guideForm.group_id}
                onChange={(event) => setGuideForm((prev) => ({ ...prev, group_id: event.target.value }))}
              >
                <option value="">Select group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Title</Label>
                <Input value={guideForm.title} onChange={(event) => setGuideForm((prev) => ({ ...prev, title: event.target.value, slug: prev.slug || normalizeSlug(event.target.value) }))} />
              </div>
              <div>
                <Label>Language</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1"
                  value={guideForm.language}
                  onChange={(event) => setGuideForm((prev) => ({ ...prev, language: event.target.value as HowToLanguage }))}
                >
                  <option value="en">English</option>
                  <option value="ur">Urdu</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Subtitle</Label>
              <Input value={guideForm.subtitle} onChange={(event) => setGuideForm((prev) => ({ ...prev, subtitle: event.target.value }))} />
            </div>
            <div>
              <Label>Intro</Label>
              <Textarea
                rows={5}
                className="min-h-[120px]"
                value={guideForm.intro}
                onChange={(event) => setGuideForm((prev) => ({ ...prev, intro: event.target.value }))}
                placeholder={'Write a clear guide introduction. Use short paragraphs and list markers like:\n- Who this guide is for\n- What it covers\n- Important scope notes'}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">This intro appears in the app at the top of each guide.</p>
            </div>
            <button
              type="button"
              className="text-xs text-[hsl(142_60%_32%)] font-semibold text-left"
              onClick={() => setShowGuideAdvanced((prev) => !prev)}
            >
              {showGuideAdvanced ? 'Hide advanced fields' : 'Show advanced fields'}
            </button>

            {showGuideAdvanced ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Slug</Label>
                    <Input value={guideForm.slug} onChange={(event) => setGuideForm((prev) => ({ ...prev, slug: normalizeSlug(event.target.value) }))} />
                  </div>
                  <div>
                    <Label>Icon</Label>
                    <Input value={guideForm.icon} onChange={(event) => setGuideForm((prev) => ({ ...prev, icon: event.target.value }))} />
                  </div>
                  <div>
                    <Label>Color</Label>
                    <Input value={guideForm.color} onChange={(event) => setGuideForm((prev) => ({ ...prev, color: event.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Display Order</Label>
                    <Input type="number" value={guideForm.display_order} onChange={(event) => setGuideForm((prev) => ({ ...prev, display_order: event.target.value }))} />
                  </div>
                  <div>
                    <Label>Publish Start</Label>
                    <Input type="datetime-local" value={guideForm.publish_start_at} onChange={(event) => setGuideForm((prev) => ({ ...prev, publish_start_at: event.target.value }))} />
                  </div>
                  <div>
                    <Label>Publish End</Label>
                    <Input type="datetime-local" value={guideForm.publish_end_at} onChange={(event) => setGuideForm((prev) => ({ ...prev, publish_end_at: event.target.value }))} />
                  </div>
                </div>
              </>
            ) : null}
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>Active</Label>
              <Switch checked={guideForm.is_active} onCheckedChange={(checked) => setGuideForm((prev) => ({ ...prev, is_active: checked }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuideDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void saveGuide()} disabled={saving || !canEdit}>{saving ? 'Saving...' : 'Save Guide'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={treeDialogOpen} onOpenChange={setTreeDialogOpen}>
        <DialogContent className="w-[96vw] max-w-[96vw] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Guide Tree Editor: {treeGuide?.title ?? ''}</DialogTitle>
          </DialogHeader>

          {treeLoading ? (
            <p className="text-sm text-muted-foreground">Loading guide tree...</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Sections {'->'} Steps {'->'} Blocks/Images</p>
                <Button size="sm" variant="outline" onClick={addSection} disabled={!canEdit}>Add Section</Button>
              </div>

              {treeSections.map((section, sectionIndex) => (
                <div
                  key={`section-${sectionIndex}`}
                  className="rounded-xl border border-[hsl(140_20%_86%)] p-3 space-y-3"
                  draggable={canEdit}
                  onDragStart={() => setDraggingSectionIndex(sectionIndex)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDropSection(sectionIndex)}
                  onDragEnd={() => setDraggingSectionIndex(null)}
                >
                  <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                    <div>
                      <Label>Section Heading</Label>
                      <Input
                        value={section.heading}
                        onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => idx === sectionIndex ? { ...item, heading: event.target.value } : item))}
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">Use clear section headings for long guides (for example: obligations, method, notes, references).</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={sectionIndex === 0 || !canEdit} onClick={() => moveSection(sectionIndex, sectionIndex - 1)}>Up</Button>
                      <Button size="sm" variant="outline" disabled={sectionIndex === treeSections.length - 1 || !canEdit} onClick={() => moveSection(sectionIndex, sectionIndex + 1)}>Down</Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setTreeSections((prev) => prev.filter((_, idx) => idx !== sectionIndex))}
                        disabled={!canEdit}
                      >
                        Remove Section
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {section.steps.map((step, stepIndex) => (
                      <div
                        key={`step-${sectionIndex}-${stepIndex}`}
                        className="rounded-lg border p-3 space-y-3 bg-[hsl(140_30%_99%)]"
                        draggable={canEdit}
                        onDragStart={() => setDraggingStepRef({ sectionIndex, stepIndex })}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleDropStep(sectionIndex, stepIndex)}
                        onDragEnd={() => setDraggingStepRef(null)}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">Step {stepIndex + 1}</p>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setTreeSections((prev) => prev.map((item, idx) => {
                                if (idx !== sectionIndex) return item;
                                return {
                                  ...item,
                                  steps: item.steps.map((stepItem, stepIdx) => {
                                    if (stepIdx !== stepIndex) return stepItem;
                                    return { ...stepItem, collapsed: !stepItem.collapsed };
                                  }),
                                };
                              }))}
                            >
                              {step.collapsed ? 'Expand' : 'Collapse'}
                            </Button>
                            <Button size="sm" variant="outline" disabled={stepIndex === 0 || !canEdit} onClick={() => moveStep(sectionIndex, stepIndex, stepIndex - 1)}>Up</Button>
                            <Button size="sm" variant="outline" disabled={stepIndex === section.steps.length - 1 || !canEdit} onClick={() => moveStep(sectionIndex, stepIndex, stepIndex + 1)}>Down</Button>
                          </div>
                        </div>

                        {step.collapsed ? (
                          <p className="text-xs text-muted-foreground">{step.title || `Step ${stepIndex + 1}`} - collapsed</p>
                        ) : (
                          <>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label>Step Title</Label>
                            <Input
                              value={step.title}
                              onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => {
                                if (idx !== sectionIndex) return item;
                                return {
                                  ...item,
                                  steps: item.steps.map((stepItem, stepIdx) => stepIdx === stepIndex ? { ...stepItem, title: event.target.value } : stepItem),
                                };
                              }))}
                            />
                          </div>
                          <div>
                            <Label>Step Note</Label>
                            <Textarea
                              rows={2}
                              className="min-h-[68px]"
                              value={step.note}
                              onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => {
                                if (idx !== sectionIndex) return item;
                                return {
                                  ...item,
                                  steps: item.steps.map((stepItem, stepIdx) => stepIdx === stepIndex ? { ...stepItem, note: event.target.value } : stepItem),
                                };
                              }))}
                            />
                          </div>
                        </div>

                        <div>
                          <Label>Step Detail</Label>
                          <div className="mt-1 mb-2 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => appendStepDetailTemplate(sectionIndex, stepIndex, 'Section Title\n-------------')}
                            >
                              Insert Section Title
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => appendStepDetailTemplate(sectionIndex, stepIndex, '- Point one\n- Point two\n- Point three')}
                            >
                              Insert Bullet List
                            </Button>
                          </div>
                          <Textarea
                            rows={8}
                            className="min-h-[180px]"
                            value={step.detail}
                            onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => {
                              if (idx !== sectionIndex) return item;
                              return {
                                ...item,
                                steps: item.steps.map((stepItem, stepIdx) => stepIdx === stepIndex ? { ...stepItem, detail: event.target.value } : stepItem),
                              };
                            }))}
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">This field is ideal for detailed instructions, references, and long-form text.</p>
                        </div>

                        <div>
                          <Label>Rich HTML (optional)</Label>
                          <Textarea
                            rows={8}
                            className="min-h-[180px] font-mono text-xs"
                            value={step.rich_content_html}
                            onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => {
                              if (idx !== sectionIndex) return item;
                              return {
                                ...item,
                                steps: item.steps.map((stepItem, stepIdx) => stepIdx === stepIndex ? { ...stepItem, rich_content_html: event.target.value } : stepItem),
                              };
                            }))}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Blocks</Label>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => addTemplateBlock(sectionIndex, stepIndex, 'text')}>Add Text</Button>
                              <Button size="sm" variant="outline" onClick={() => addTemplateBlock(sectionIndex, stepIndex, 'note')}>Add Note</Button>
                              <Button size="sm" variant="outline" onClick={() => addTemplateBlock(sectionIndex, stepIndex, 'recitation')}>Add Recitation</Button>
                            </div>
                          </div>
                          {step.blocks.map((block, blockIndex) => (
                            <div
                              key={`block-${sectionIndex}-${stepIndex}-${blockIndex}`}
                              className="rounded-md border p-2 space-y-2 bg-white"
                              draggable={canEdit}
                              onDragStart={() => setDraggingBlockRef({ sectionIndex, stepIndex, blockIndex })}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => handleDropBlock(sectionIndex, stepIndex, blockIndex)}
                              onDragEnd={() => setDraggingBlockRef(null)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">Block {blockIndex + 1}</span>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" variant="outline" disabled={blockIndex === 0 || !canEdit} onClick={() => moveBlock(sectionIndex, stepIndex, blockIndex, blockIndex - 1)}>Up</Button>
                                  <Button size="sm" variant="outline" disabled={blockIndex === step.blocks.length - 1 || !canEdit} onClick={() => moveBlock(sectionIndex, stepIndex, blockIndex, blockIndex + 1)}>Down</Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-[140px_1fr_auto] gap-2 items-center">
                                <select
                                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                  value={block.kind}
                                  onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => {
                                    if (idx !== sectionIndex) return item;
                                    return {
                                      ...item,
                                      steps: item.steps.map((stepItem, stepIdx) => {
                                        if (stepIdx !== stepIndex) return stepItem;
                                        return {
                                          ...stepItem,
                                          blocks: stepItem.blocks.map((blockItem, innerIndex) => innerIndex === blockIndex ? { ...blockItem, kind: event.target.value as BlockDraft['kind'] } : blockItem),
                                        };
                                      }),
                                    };
                                  }))}
                                >
                                  <option value="text">Text</option>
                                  <option value="action">Action</option>
                                  <option value="note">Note</option>
                                  <option value="recitation">Recitation</option>
                                </select>
                                <span className="text-xs text-muted-foreground">Payload JSON</span>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setTreeSections((prev) => prev.map((item, idx) => {
                                    if (idx !== sectionIndex) return item;
                                    return {
                                      ...item,
                                      steps: item.steps.map((stepItem, stepIdx) => {
                                        if (stepIdx !== stepIndex) return stepItem;
                                        return { ...stepItem, blocks: stepItem.blocks.filter((_, innerIndex) => innerIndex !== blockIndex) };
                                      }),
                                    };
                                  }))}
                                >
                                  Remove
                                </Button>
                              </div>
                              <Textarea
                                rows={7}
                                className="min-h-[160px] font-mono text-xs"
                                value={block.payloadJson}
                                onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => {
                                  if (idx !== sectionIndex) return item;
                                  return {
                                    ...item,
                                    steps: item.steps.map((stepItem, stepIdx) => {
                                      if (stepIdx !== stepIndex) return stepItem;
                                      return {
                                        ...stepItem,
                                        blocks: stepItem.blocks.map((blockItem, innerIndex) => innerIndex === blockIndex ? { ...blockItem, payloadJson: event.target.value } : blockItem),
                                      };
                                    }),
                                  };
                                }))}
                              />
                            </div>
                          ))}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Images</Label>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setTreeSections((prev) => prev.map((item, idx) => {
                                if (idx !== sectionIndex) return item;
                                return {
                                  ...item,
                                  steps: item.steps.map((stepItem, stepIdx) => {
                                    if (stepIdx !== stepIndex) return stepItem;
                                    return {
                                      ...stepItem,
                                      images: [...stepItem.images, { display_order: stepItem.images.length, image_url: '', thumb_url: '', caption: '', source: '' }],
                                    };
                                  }),
                                };
                              }))}
                            >
                              Add Image
                            </Button>
                          </div>
                          {step.images.map((image, imageIndex) => (
                            <div
                              key={`image-${sectionIndex}-${stepIndex}-${imageIndex}`}
                              className="rounded-md border p-2 space-y-2 bg-white"
                              draggable={canEdit}
                              onDragStart={() => setDraggingImageRef({ sectionIndex, stepIndex, imageIndex })}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => handleDropImage(sectionIndex, stepIndex, imageIndex)}
                              onDragEnd={() => setDraggingImageRef(null)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">Image {imageIndex + 1}</span>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" variant="outline" disabled={imageIndex === 0 || !canEdit} onClick={() => moveImage(sectionIndex, stepIndex, imageIndex, imageIndex - 1)}>Up</Button>
                                  <Button size="sm" variant="outline" disabled={imageIndex === step.images.length - 1 || !canEdit} onClick={() => moveImage(sectionIndex, stepIndex, imageIndex, imageIndex + 1)}>Down</Button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">Upload image file</span>
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  disabled={!!uploadingByStepKey[`${sectionIndex}-${stepIndex}`] || !canEdit}
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) {
                                      void handleUploadImageFile(sectionIndex, stepIndex, imageIndex, file);
                                    }
                                    event.currentTarget.value = '';
                                  }}
                                  className="text-xs"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  placeholder="Image URL"
                                  value={image.image_url}
                                  onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => {
                                    if (idx !== sectionIndex) return item;
                                    return {
                                      ...item,
                                      steps: item.steps.map((stepItem, stepIdx) => {
                                        if (stepIdx !== stepIndex) return stepItem;
                                        return {
                                          ...stepItem,
                                          images: stepItem.images.map((img, innerIndex) => innerIndex === imageIndex ? { ...img, image_url: event.target.value } : img),
                                        };
                                      }),
                                    };
                                  }))}
                                />
                                <Input
                                  placeholder="Thumbnail URL"
                                  value={image.thumb_url}
                                  onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => {
                                    if (idx !== sectionIndex) return item;
                                    return {
                                      ...item,
                                      steps: item.steps.map((stepItem, stepIdx) => {
                                        if (stepIdx !== stepIndex) return stepItem;
                                        return {
                                          ...stepItem,
                                          images: stepItem.images.map((img, innerIndex) => innerIndex === imageIndex ? { ...img, thumb_url: event.target.value } : img),
                                        };
                                      }),
                                    };
                                  }))}
                                />
                              </div>
                              {uploadingByStepKey[`${sectionIndex}-${stepIndex}`] ? (
                                <p className="text-xs text-muted-foreground">Uploading image...</p>
                              ) : null}
                              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                                <Input
                                  placeholder="Caption"
                                  value={image.caption}
                                  onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => {
                                    if (idx !== sectionIndex) return item;
                                    return {
                                      ...item,
                                      steps: item.steps.map((stepItem, stepIdx) => {
                                        if (stepIdx !== stepIndex) return stepItem;
                                        return {
                                          ...stepItem,
                                          images: stepItem.images.map((img, innerIndex) => innerIndex === imageIndex ? { ...img, caption: event.target.value } : img),
                                        };
                                      }),
                                    };
                                  }))}
                                />
                                <Input
                                  placeholder="Source"
                                  value={image.source}
                                  onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => {
                                    if (idx !== sectionIndex) return item;
                                    return {
                                      ...item,
                                      steps: item.steps.map((stepItem, stepIdx) => {
                                        if (stepIdx !== stepIndex) return stepItem;
                                        return {
                                          ...stepItem,
                                          images: stepItem.images.map((img, innerIndex) => innerIndex === imageIndex ? { ...img, source: event.target.value } : img),
                                        };
                                      }),
                                    };
                                  }))}
                                />
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setTreeSections((prev) => prev.map((item, idx) => {
                                    if (idx !== sectionIndex) return item;
                                    return {
                                      ...item,
                                      steps: item.steps.map((stepItem, stepIdx) => {
                                        if (stepIdx !== stepIndex) return stepItem;
                                        return { ...stepItem, images: stepItem.images.filter((_, innerIndex) => innerIndex !== imageIndex) };
                                      }),
                                    };
                                  }))}
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                        </>
                        )}

                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setTreeSections((prev) => prev.map((item, idx) => {
                              if (idx !== sectionIndex) return item;
                              return { ...item, steps: item.steps.filter((_, stepIdx) => stepIdx !== stepIndex) };
                            }))}
                          >
                            Remove Step
                          </Button>
                        </div>
                      </div>
                    ))}

                    <Button size="sm" variant="outline" onClick={() => addStep(sectionIndex)} disabled={!canEdit}>Add Step</Button>
                  </div>
                </div>
              ))}

              {treeSections.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sections yet. Add your first section.</p>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTreeDialogOpen(false)} disabled={saving}>Close</Button>
            <Button onClick={() => void saveTree()} disabled={saving || !canEdit || treeLoading}>{saving ? 'Saving...' : 'Save Tree'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

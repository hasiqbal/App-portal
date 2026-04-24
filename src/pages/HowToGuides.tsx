import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Camera, Eye, EyeOff, FolderTree, GripVertical, Languages, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { HowToGuidePreview } from '#/components/features/howto/HowToGuidePreview';
import { BlockEditor, blockKindDefaults, blockKindMeta, type BlockDraft, type BlockKind } from '#/components/features/howto/BlockEditor';
import Sidebar from '#/components/layout/Sidebar';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Textarea } from '#/components/ui/textarea';
import { Switch } from '#/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '#/components/ui/dialog';
import {
  createHowToDemoGuide,
  createLinkedUrduHowToGroupCopy,
  createHowToVersionSnapshot,
  createHowToGroup,
  createHowToGuide,
  duplicateHowToGroupEntriesFromEnglish,
  duplicateHowToGuideFromEnglish,
  deleteHowToGroup,
  deleteHowToGuide,
  fetchHowToGuideTree,
  fetchHowToGroups,
  fetchHowToGuides,
  publishHowToGuide,
  saveHowToGuideTree,
  syncEnglishGroupToLinkedUrdu,
  syncEnglishGuideToLinkedUrdu,
  syncEnglishGuideTreeToLinkedUrdu,
  uploadHowToMedia,
  updateHowToGroup,
  updateHowToGuide,
} from '#/lib/api';
import { useUrduTranslation } from '#/hooks/useUrduTranslation';
import { usePermissions } from '#/hooks/usePermissions';
import type { HowToGroup, HowToGuide, HowToLanguage } from '#/types';
import type { PreviewGuideBlock } from '#/components/features/howto/guidePreviewUtils';
import { toast } from 'sonner';

type GroupForm = {
  name: string;
  urdu_name: string;
  slug: string;
  icon: string;
  color: string;
  display_order: string;
  is_active: boolean;
};

type EditingLanguage = 'en' | 'ur';

type GuideFilterState = {
  search: string;
  selectedGroupFilter: string;
  selectedStatusFilter: 'all' | 'live' | 'draft';
};

type DuplicateMode = 'single' | 'all';

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
  urdu_name: '',
  slug: '',
  icon: 'menu-book',
  color: '#2e7d32',
  display_order: '0',
  is_active: true,
};

const EMPTY_GUIDE_FILTERS: GuideFilterState = {
  search: '',
  selectedGroupFilter: 'all',
  selectedStatusFilter: 'all',
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

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  const queue = [...items];
  const workerCount = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next === undefined) return;
        await worker(next);
      }
    }),
  );
}

function parseGuideNotesText(value: string): string[] {
  return value
    .split(/\n\s*\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parsePreviewBlocks(blocks: BlockDraft[]): PreviewGuideBlock[] {
  return blocks.map((block) => ({ kind: block.kind, ...block.payload } as PreviewGuideBlock));
}

function getHowToGroupDisplayName(group: HowToGroup | null | undefined, language: EditingLanguage): string {
  if (!group) return 'Unassigned Group';
  if (language === 'ur' && group.urdu_name?.trim()) return group.urdu_name.trim();
  return group.name;
}

const NON_TRANSLATABLE_PAYLOAD_KEYS = new Set([
  'arabic',
  'transliteration',
  'image_url',
  'thumb_url',
  'source',
  'url',
  'uri',
  'slug',
  'icon',
  'color',
  'variant',
  'repeat',
]);

function containsArabicScript(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

function containsLatinScript(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

export default function HowToGuidesPage() {
  const queryClient = useQueryClient();
  const { canEdit, canDelete, role } = usePermissions();
  const { translateManyToUrdu } = useUrduTranslation();

  const [activeEditingLanguage, setActiveEditingLanguage] = useState<EditingLanguage>('en');
  const [filtersByLanguage, setFiltersByLanguage] = useState<Record<EditingLanguage, GuideFilterState>>({
    en: { ...EMPTY_GUIDE_FILTERS },
    ur: { ...EMPTY_GUIDE_FILTERS },
  });
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [guideDialogOpen, setGuideDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateSourceGroupId, setDuplicateSourceGroupId] = useState('');
  const [duplicateSourceGuideId, setDuplicateSourceGuideId] = useState('');
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('single');
  const [duplicateIntoNewUrduGroup, setDuplicateIntoNewUrduGroup] = useState(false);
  const [duplicateTargetGroupName, setDuplicateTargetGroupName] = useState('');
  const [duplicateTargetGroupUrduName, setDuplicateTargetGroupUrduName] = useState('');
  const [duplicatePublishNow, setDuplicatePublishNow] = useState(false);
  const [duplicatePublishMode, setDuplicatePublishMode] = useState<DuplicateMode>('single');
  const [duplicatePublishSingleGuideId, setDuplicatePublishSingleGuideId] = useState('');
  const [duplicatingGuide, setDuplicatingGuide] = useState(false);
  const [editingGroup, setEditingGroup] = useState<HowToGroup | null>(null);
  const [editingGuide, setEditingGuide] = useState<HowToGuide | null>(null);
  const [treeGuide, setTreeGuide] = useState<HowToGuide | null>(null);
  const [treeDialogOpen, setTreeDialogOpen] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeGuideIntro, setTreeGuideIntro] = useState('');
  const [treeGuideNotesText, setTreeGuideNotesText] = useState('');
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
  const [autoTranslatingTree, setAutoTranslatingTree] = useState(false);
  const [massTranslatingGroup, setMassTranslatingGroup] = useState(false);
  const [treePreviewMode, setTreePreviewMode] = useState<'source' | 'urdu'>('source');
  const [urduPreviewLoading, setUrduPreviewLoading] = useState(false);
  const [urduPreviewData, setUrduPreviewData] = useState<{
    title: string;
    subtitle: string;
    intro: string;
    notesText: string;
    sections: SectionDraft[];
  } | null>(null);

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

  const guideCountByGroup = useMemo(() => {
    const counts = new Map<string, number>();
    guides.forEach((guide) => {
      counts.set(guide.group_id, (counts.get(guide.group_id) ?? 0) + 1);
    });
    return counts;
  }, [guides]);

  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const urduTranslationCacheRef = useRef<Map<string, string>>(new Map());
  const urduLabelsBackfillStartedRef = useRef(false);
  const urduLabelsBackfillRunningRef = useRef(false);
  const urduPreviewRequestRef = useRef(0);

  const activeFilters = filtersByLanguage[activeEditingLanguage];
  const englishGuides = useMemo(() => guides.filter((guide) => guide.language === 'en'), [guides]);
  const selectedFilterGroup = useMemo(
    () => (activeFilters.selectedGroupFilter === 'all'
      ? null
      : groups.find((group) => group.id === activeFilters.selectedGroupFilter) ?? null),
    [activeFilters.selectedGroupFilter, groups],
  );
  const englishGuidesInFilterGroup = useMemo(
    () => (selectedFilterGroup ? englishGuides.filter((guide) => guide.group_id === selectedFilterGroup.id) : []),
    [englishGuides, selectedFilterGroup],
  );
  const englishGroupMap = useMemo(() => {
    const counts = new Map<string, number>();
    englishGuides.forEach((guide) => {
      counts.set(guide.group_id, (counts.get(guide.group_id) ?? 0) + 1);
    });
    return counts;
  }, [englishGuides]);

  const englishGroups = useMemo(
    () => groups.filter((group) => (englishGroupMap.get(group.id) ?? 0) > 0),
    [englishGroupMap, groups],
  );

  const englishGuidesInSelectedGroup = useMemo(
    () => englishGuides.filter((guide) => guide.group_id === duplicateSourceGroupId),
    [duplicateSourceGroupId, englishGuides],
  );

  const setActiveFilters = (updater: (current: GuideFilterState) => GuideFilterState) => {
    setFiltersByLanguage((prev) => ({
      ...prev,
      [activeEditingLanguage]: updater(prev[activeEditingLanguage]),
    }));
  };

  const guidesInActiveLanguage = useMemo(
    () => guides.filter((guide) => guide.language === activeEditingLanguage),
    [guides, activeEditingLanguage],
  );

  const publishedInActiveLanguageCount = useMemo(
    () => guidesInActiveLanguage.filter((guide) => guide.is_active).length,
    [guidesInActiveLanguage],
  );

  const filteredGuides = useMemo(() => {
    const needle = activeFilters.search.trim().toLowerCase();

    return guides.filter((guide) => {
      const groupName = getHowToGroupDisplayName(groupMap.get(guide.group_id), activeEditingLanguage).toLowerCase();
      const matchesSearch = !needle || (
        guide.title.toLowerCase().includes(needle) ||
        (guide.subtitle ?? '').toLowerCase().includes(needle) ||
        guide.slug.toLowerCase().includes(needle) ||
        groupName.includes(needle)
      );

      const matchesGroup = activeFilters.selectedGroupFilter === 'all' || guide.group_id === activeFilters.selectedGroupFilter;
      const matchesLanguage = guide.language === activeEditingLanguage;
      const matchesStatus = activeFilters.selectedStatusFilter === 'all'
        || (activeFilters.selectedStatusFilter === 'live' ? guide.is_active : !guide.is_active);

      return matchesSearch && matchesGroup && matchesLanguage && matchesStatus;
    });
  }, [activeEditingLanguage, activeFilters.search, activeFilters.selectedGroupFilter, activeFilters.selectedStatusFilter, guides, groupMap]);

  const groupedFilteredGuides = useMemo<Array<{ group: HowToGroup | null; guides: HowToGuide[] }>>(() => {
    const sortGuides = (left: HowToGuide, right: HowToGuide) => {
      const orderDiff = (left.display_order ?? 0) - (right.display_order ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return left.title.localeCompare(right.title);
    };

    const guidesByGroupId = new Map<string, HowToGuide[]>();
    filteredGuides.forEach((guide) => {
      const list = guidesByGroupId.get(guide.group_id) ?? [];
      list.push(guide);
      guidesByGroupId.set(guide.group_id, list);
    });

    const grouped = groups
      .map((group) => ({
        group,
        guides: (guidesByGroupId.get(group.id) ?? []).sort(sortGuides),
      }))
      .filter((entry) => entry.guides.length > 0);

    const orphanGuides = Array.from(guidesByGroupId.entries())
      .filter(([groupId]) => !groupMap.has(groupId))
      .flatMap(([, guideList]) => guideList)
      .sort(sortGuides);

    if (orphanGuides.length > 0) {
      grouped.push({ group: null, guides: orphanGuides });
    }

    return grouped;
  }, [filteredGuides, groups, groupMap]);

  const hasActiveGuideFilters = (
    activeFilters.search.trim().length > 0
    || activeFilters.selectedGroupFilter !== 'all'
    || activeFilters.selectedStatusFilter !== 'all'
  );

  const clearGuideFilters = () => {
    setActiveFilters(() => ({ ...EMPTY_GUIDE_FILTERS }));
  };

  const openCreateGroup = () => {
    setEditingGroup(null);
    setGroupForm(EMPTY_GROUP_FORM);
    setGroupDialogOpen(true);
  };

  const openEditGroup = (group: HowToGroup) => {
    setEditingGroup(group);
    setGroupForm({
      name: group.name,
      urdu_name: group.urdu_name ?? '',
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
      language: activeEditingLanguage,
      group_id: activeFilters.selectedGroupFilter !== 'all' ? activeFilters.selectedGroupFilter : (groups[0]?.id ?? ''),
    });
    setGuideDialogOpen(true);
  };

  const openDuplicateGuide = () => {
    if (englishGuides.length === 0) {
      toast.error('Create an English guide first, then duplicate it into Urdu.');
      return;
    }

    const preferredGroupId = activeFilters.selectedGroupFilter !== 'all' ? activeFilters.selectedGroupFilter : '';
    const initialGroupId = englishGroupMap.has(preferredGroupId) ? preferredGroupId : (englishGroups[0]?.id ?? '');
    const initialGuideId = englishGuides.find((guide) => guide.group_id === initialGroupId)?.id ?? englishGuides[0]?.id ?? '';

    setDuplicateMode('single');
    setDuplicateSourceGroupId(initialGroupId);
    setDuplicateSourceGuideId(initialGuideId);
    setDuplicateIntoNewUrduGroup(false);
    setDuplicateTargetGroupName('');
    setDuplicateTargetGroupUrduName('');
    setDuplicatePublishNow(false);
    setDuplicatePublishMode('single');
    setDuplicatePublishSingleGuideId(initialGuideId);
    setDuplicateDialogOpen(true);
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
    setTreePreviewMode('source');
    setUrduPreviewData(null);
    setUrduPreviewLoading(false);
    urduPreviewRequestRef.current += 1;

    try {
      const tree = await fetchHowToGuideTree(guide.id);
      setTreeGuideIntro(tree?.guide.intro ?? '');
      setTreeGuideNotesText((tree?.guide.notes ?? []).join('\n\n'));
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
            payload: (block.payload ?? {}) as Record<string, unknown>,
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
      setTreeGuideIntro('');
      setTreeGuideNotesText('');
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

  const addTemplateBlock = (sectionIndex: number, stepIndex: number, kind: BlockKind) => {
    updateStepDraft(sectionIndex, stepIndex, (step) => ({
      ...step,
      blocks: [
        ...step.blocks,
        {
          block_order: step.blocks.length,
          kind,
          payload: blockKindDefaults(kind),
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
      const treePayload = {
        guideIntro: treeGuideIntro.trim() || null,
        guideNotes: parseGuideNotesText(treeGuideNotesText),
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
              payload: block.payload ?? {},
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
      };

      await saveHowToGuideTree(treeGuide.id, treePayload);

      if (treeGuide.language === 'en') {
        const shouldMirror = window.confirm('Also mirror this English tree content to linked Urdu guides?');
        if (shouldMirror) {
          const mirrored = await syncEnglishGuideTreeToLinkedUrdu(treeGuide.id, treePayload);
          if (mirrored > 0) {
            toast.success(`Updated tree for ${mirrored} linked Urdu ${mirrored === 1 ? 'guide' : 'guides'}.`);
          }
        }
      }

      toast.success('Guide tree saved.');
      await openTreeEditor(treeGuide);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save guide tree.');
    } finally {
      setSaving(false);
    }
  };

  const ARABIC_RUN_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+(?:\s+[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)*/g;

  const normalizeTranslationKey = (value: string): string => value.trim().replace(/\s+/g, ' ');

  const translateFragmentsWithCache = async (fragments: string[]): Promise<Map<string, string>> => {
    const normalizedUnique = Array.from(new Set(
      fragments
        .map((fragment) => normalizeTranslationKey(fragment))
        .filter((fragment) => fragment.length > 0 && /[A-Za-z]/.test(fragment)),
    ));

    const missing = normalizedUnique.filter((fragment) => !urduTranslationCacheRef.current.has(fragment));
    if (missing.length > 0) {
      const translated = await translateManyToUrdu(missing, { silent: true });
      missing.forEach((fragment, index) => {
        const resolved = translated[index]?.trim() || fragment;
        urduTranslationCacheRef.current.set(fragment, resolved);
      });
    }

    const resolved = new Map<string, string>();
    normalizedUnique.forEach((fragment) => {
      resolved.set(fragment, urduTranslationCacheRef.current.get(fragment) || fragment);
    });
    return resolved;
  };

  const translateFragmentWithCache = async (fragment: string): Promise<string> => {
    const normalized = normalizeTranslationKey(fragment);
    if (!normalized) return fragment;

    const hasLatin = /[A-Za-z]/.test(normalized);
    if (!hasLatin) return fragment;

    const batch = await translateFragmentsWithCache([normalized]);
    return batch.get(normalized) || fragment;
  };

  const translateLineForUrdu = async (line: string): Promise<string> => {
    if (!line.trim()) return line;

    if (!containsArabicScript(line)) return translateFragmentWithCache(line);

    if (!/[A-Za-z]/.test(line)) {
      return line;
    }

    const arabicRuns: string[] = [];
    const placeholderText = line.replace(ARABIC_RUN_REGEX, (run) => {
      const token = `__AR_SEG_${arabicRuns.length}__`;
      arabicRuns.push(run);
      return token;
    });

    const batch = await translateFragmentsWithCache([placeholderText]);
    let translated = batch.get(normalizeTranslationKey(placeholderText)) || placeholderText;
    arabicRuns.forEach((run, index) => {
      translated = translated.replaceAll(`__AR_SEG_${index}__`, run);
    });

    return translated;
  };

  const translateTextForUrdu = async (value: string): Promise<string> => {
    const trimmed = value.trim();
    if (!trimmed) return value;

    const lines = value.split('\n');
    const translatedLines = await Promise.all(lines.map((line) => translateLineForUrdu(line)));
    return translatedLines.join('\n');
  };

  const translatePayloadValue = async (value: unknown, key?: string): Promise<unknown> => {
    if (typeof value === 'string') {
      if (key && NON_TRANSLATABLE_PAYLOAD_KEYS.has(key)) return value;
      return translateTextForUrdu(value);
    }

    if (Array.isArray(value)) {
      const nextItems = await Promise.all(value.map((item) => translatePayloadValue(item, key)));
      return nextItems;
    }

    if (value && typeof value === 'object') {
      const entries = await Promise.all(
        Object.entries(value as Record<string, unknown>).map(async ([entryKey, entryValue]) => {
          if (NON_TRANSLATABLE_PAYLOAD_KEYS.has(entryKey)) {
            return [entryKey, entryValue] as const;
          }
          const nextValue = await translatePayloadValue(entryValue, entryKey);
          return [entryKey, nextValue] as const;
        }),
      );
      return Object.fromEntries(entries);
    }

    return value;
  };

  const translateSectionsForUrdu = async (sections: SectionDraft[]): Promise<SectionDraft[]> => {
    return Promise.all(
      sections.map(async (section) => ({
        ...section,
        heading: await translateTextForUrdu(section.heading),
        steps: await Promise.all(section.steps.map(async (step) => {
          const translatedBlocks = await Promise.all(
            step.blocks.map(async (block) => ({
              ...block,
              payload: await translatePayloadValue(block.payload) as Record<string, unknown>,
            })),
          );

          const translatedImages = await Promise.all(
            step.images.map(async (image) => ({
              ...image,
              caption: await translateTextForUrdu(image.caption),
            })),
          );

          return {
            ...step,
            title: await translateTextForUrdu(step.title),
            detail: await translateTextForUrdu(step.detail),
            note: await translateTextForUrdu(step.note),
            blocks: translatedBlocks,
            images: translatedImages,
          };
        })),
      })),
    );
  };

  const autoTranslateUrduTree = async () => {
    if (!treeGuide || treeGuide.language !== 'ur') return;

    const confirmed = window.confirm('Auto-translate current guide content to Urdu? This will overwrite current text fields in the open tree editor.');
    if (!confirmed) return;

    setAutoTranslatingTree(true);
    try {
      const [translatedIntro, translatedNotes, translatedSections] = await Promise.all([
        translateTextForUrdu(treeGuideIntro),
        Promise.all(parseGuideNotesText(treeGuideNotesText).map((note) => translateTextForUrdu(note))),
        translateSectionsForUrdu(treeSections),
      ]);

      setTreeGuideIntro(translatedIntro);
      setTreeGuideNotesText(translatedNotes.join('\n\n'));
      setTreeSections(translatedSections);
      toast.success('Urdu auto-translation completed. Please review and adjust wording before publishing.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to auto-translate this guide.');
    } finally {
      setAutoTranslatingTree(false);
    }
  };

  const autoTranslatePersistedUrduGuide = async (guideId: string) => {
    const tree = await fetchHowToGuideTree(guideId);
    if (!tree) return;

    const translatedIntro = tree.guide.intro ? await translateTextForUrdu(tree.guide.intro) : null;
    const translatedNotes = await Promise.all((tree.guide.notes ?? []).map((note) => translateTextForUrdu(note)));

    const translatedSections = await Promise.all(
      (tree.sections ?? []).map(async (sectionEntry, sectionIndex) => ({
        heading: await translateTextForUrdu(sectionEntry.section.heading),
        section_order: sectionIndex,
        steps: await Promise.all(sectionEntry.steps.map(async (stepEntry, stepIndex) => ({
          step_order: stepIndex,
          title: await translateTextForUrdu(stepEntry.step.title),
          detail: stepEntry.step.detail ? await translateTextForUrdu(stepEntry.step.detail) : null,
          note: stepEntry.step.note ? await translateTextForUrdu(stepEntry.step.note) : null,
          rich_content_html: stepEntry.step.rich_content_html ?? null,
          blocks: await Promise.all(stepEntry.blocks.map(async (blockEntry, blockIndex) => ({
            block_order: blockIndex,
            kind: blockEntry.kind,
            payload: await translatePayloadValue(blockEntry.payload) as Record<string, unknown>,
          }))),
          images: await Promise.all(stepEntry.images.map(async (imageEntry, imageIndex) => ({
            display_order: imageIndex,
            image_url: imageEntry.image_url,
            thumb_url: imageEntry.thumb_url,
            caption: imageEntry.caption ? await translateTextForUrdu(imageEntry.caption) : null,
            source: imageEntry.source,
          }))),
        }))),
      })),
    );

    await saveHowToGuideTree(guideId, {
      guideIntro: translatedIntro,
      guideNotes: translatedNotes,
      sections: translatedSections,
    });
  };

  const autoTranslatePersistedUrduGuideMetadata = async (guide: HowToGuide) => {
    const [translatedTitle, translatedSubtitle, translatedIntro] = await Promise.all([
      translateTextForUrdu(guide.title),
      guide.subtitle ? translateTextForUrdu(guide.subtitle) : Promise.resolve(''),
      guide.intro ? translateTextForUrdu(guide.intro) : Promise.resolve(''),
    ]);

    await updateHowToGuide(guide.id, {
      title: translatedTitle || guide.title,
      subtitle: translatedSubtitle || guide.subtitle || null,
      intro: translatedIntro || guide.intro || null,
    });
  };

  const massTranslateCurrentGroupToUrdu = async () => {
    const groupId = activeFilters.selectedGroupFilter;
    if (groupId === 'all') {
      toast.error('Select a group first to run mass translation.');
      return;
    }

    if (englishGuidesInFilterGroup.length === 0) {
      toast.error('No English guides found in the selected group.');
      return;
    }

    const groupLabel = selectedFilterGroup?.name ?? 'selected group';
    const confirmed = window.confirm(`Translate all English guides in "${groupLabel}" to Urdu?`);
    if (!confirmed) return;

    setMassTranslatingGroup(true);
    try {
      if (selectedFilterGroup) {
        const translatedGroupName = await translateTextForUrdu(selectedFilterGroup.name);
        const nextUrduName = translatedGroupName.trim();
        if (nextUrduName && nextUrduName !== (selectedFilterGroup.urdu_name ?? '').trim()) {
          await updateHowToGroup(selectedFilterGroup.id, { urdu_name: nextUrduName });
        }
      }

      const duplicateResult = await duplicateHowToGroupEntriesFromEnglish({
        sourceGroupId: groupId,
        sourceGuideIds: englishGuidesInFilterGroup.map((guide) => guide.id),
        targetGroupId: groupId,
        createTargetUrduGroup: false,
      });

      const existingUrduGuidesInGroup = guides.filter((guide) => guide.group_id === groupId && guide.language === 'ur');
      const targetUrduGuides = Array.from(
        new Map(
          [...existingUrduGuidesInGroup, ...duplicateResult.guides].map((guide) => [guide.id, guide]),
        ).values(),
      );

      await runWithConcurrency(targetUrduGuides, 3, async (guide) => {
        await autoTranslatePersistedUrduGuideMetadata(guide);
        await autoTranslatePersistedUrduGuide(guide.id);
      });

      await queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
      await queryClient.invalidateQueries({ queryKey: GUIDES_KEY });

      setActiveEditingLanguage('ur');
      setFiltersByLanguage((prev) => ({
        ...prev,
        ur: {
          ...prev.ur,
          search: '',
          selectedGroupFilter: groupId,
          selectedStatusFilter: 'all',
        },
      }));

      toast.success(
        `Mass translation complete: ${targetUrduGuides.length} Urdu ${targetUrduGuides.length === 1 ? 'guide' : 'guides'} in ${groupLabel}.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Mass translation failed.');
    } finally {
      setMassTranslatingGroup(false);
    }
  };

  useEffect(() => {
    if (!treeDialogOpen || !treeGuide || treeGuide.language !== 'en' || treePreviewMode !== 'urdu') {
      return;
    }

    const requestId = urduPreviewRequestRef.current + 1;
    urduPreviewRequestRef.current = requestId;

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setUrduPreviewLoading(true);
        try {
          const [title, subtitle, intro, notes, sections] = await Promise.all([
            translateTextForUrdu(treeGuide.title),
            translateTextForUrdu(treeGuide.subtitle ?? ''),
            translateTextForUrdu(treeGuideIntro),
            Promise.all(parseGuideNotesText(treeGuideNotesText).map((note) => translateTextForUrdu(note))),
            translateSectionsForUrdu(treeSections),
          ]);

          if (urduPreviewRequestRef.current !== requestId) return;
          setUrduPreviewData({
            title: title.trim() || treeGuide.title,
            subtitle: subtitle.trim() || (treeGuide.subtitle ?? ''),
            intro,
            notesText: notes.join('\n\n'),
            sections,
          });
        } catch {
          if (urduPreviewRequestRef.current === requestId) {
            setUrduPreviewData(null);
          }
        } finally {
          if (urduPreviewRequestRef.current === requestId) {
            setUrduPreviewLoading(false);
          }
        }
      })();
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
    };
  // Preview translation helpers are component-local and intentionally captured from current closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    treeDialogOpen,
    treeGuide,
    treeGuideIntro,
    treeGuideNotesText,
    treePreviewMode,
    treeSections,
  ]);

  const backfillExistingUrduLabels = useCallback(async () => {
    if (urduLabelsBackfillRunningRef.current) return;
    urduLabelsBackfillRunningRef.current = true;

    try {
      const urGuides = guides.filter((guide) => guide.language === 'ur');
      if (urGuides.length === 0) return;

      let updatedGroups = 0;
      let updatedGuides = 0;

      const urGuideGroupIds = new Set(urGuides.map((guide) => guide.group_id));
      for (const group of groups) {
        if (!urGuideGroupIds.has(group.id)) continue;

        const currentUrduName = (group.urdu_name ?? '').trim();
        const shouldTranslateGroupName = currentUrduName.length === 0 || containsLatinScript(currentUrduName);
        if (!shouldTranslateGroupName) continue;

        const translatedGroupName = await translateTextForUrdu(group.name);
        const nextGroupUrduName = translatedGroupName.trim();
        if (!nextGroupUrduName || nextGroupUrduName === currentUrduName) continue;

        await updateHowToGroup(group.id, { urdu_name: nextGroupUrduName });
        updatedGroups += 1;
      }

      for (const guide of urGuides) {
        const nextPayload: Partial<HowToGuide> = {};

        if (containsLatinScript(guide.title)) {
          const translatedTitle = await translateTextForUrdu(guide.title);
          const nextTitle = translatedTitle.trim();
          if (nextTitle && nextTitle !== guide.title) {
            nextPayload.title = nextTitle;
          }
        }

        if ((guide.subtitle ?? '').trim().length > 0 && containsLatinScript(guide.subtitle ?? '')) {
          const translatedSubtitle = await translateTextForUrdu(guide.subtitle ?? '');
          const nextSubtitle = translatedSubtitle.trim();
          if (nextSubtitle && nextSubtitle !== (guide.subtitle ?? '')) {
            nextPayload.subtitle = nextSubtitle;
          }
        }

        if (Object.keys(nextPayload).length === 0) continue;

        await updateHowToGuide(guide.id, nextPayload);
        updatedGuides += 1;
      }

      if (updatedGroups > 0 || updatedGuides > 0) {
        await queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
        await queryClient.invalidateQueries({ queryKey: GUIDES_KEY });
        toast.success(`Updated Urdu labels (${updatedGroups} group${updatedGroups === 1 ? '' : 's'}, ${updatedGuides} guide${updatedGuides === 1 ? '' : 's'}).`);
      }
    } catch (error) {
      urduLabelsBackfillStartedRef.current = false;
      toast.error(error instanceof Error ? error.message : 'Failed to update Urdu labels.');
    } finally {
      urduLabelsBackfillRunningRef.current = false;
    }
  // translateTextForUrdu is component-local and intentionally used as current closure here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guides, groups, queryClient]);

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
        urdu_name: groupForm.urdu_name.trim() || null,
        slug: normalizeSlug(groupForm.slug || groupForm.name),
        icon: groupForm.icon.trim() || null,
        color: groupForm.color.trim() || null,
        display_order: Number(groupForm.display_order) || 0,
        is_active: groupForm.is_active,
      };

      if (editingGroup) {
        await updateHowToGroup(editingGroup.id, payload);
        if (!editingGroup.source_group_id) {
          const shouldMirror = window.confirm('Also apply these English group changes to linked Urdu group copies?');
          if (shouldMirror) {
            const mirrored = await syncEnglishGroupToLinkedUrdu(editingGroup.id, payload);
            if (mirrored > 0) {
              toast.success(`Updated ${mirrored} linked Urdu ${mirrored === 1 ? 'group' : 'groups'}.`);
            }
          }
        }
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
    if (!editingGuide && activeEditingLanguage === 'ur') {
      toast.error('Use Duplicate from English to create Urdu guides.');
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
        if (editingGuide.language === 'en') {
          const shouldMirror = window.confirm('Also mirror these English guide field changes to linked Urdu guides?');
          if (shouldMirror) {
            const mirrored = await syncEnglishGuideToLinkedUrdu(editingGuide.id, payload);
            if (mirrored > 0) {
              toast.success(`Updated ${mirrored} linked Urdu ${mirrored === 1 ? 'guide' : 'guides'}.`);
            }
          }
        }
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

  const duplicateGuideFromEnglish = async () => {
    if (!duplicateSourceGroupId) {
      toast.error('Select an English group first.');
      return;
    }

    if (duplicateMode === 'single' && !duplicateSourceGuideId) {
      toast.error('Select an English guide to duplicate.');
      return;
    }

    if (duplicateIntoNewUrduGroup && !duplicateTargetGroupName.trim()) {
      toast.error('Enter a name for the new Urdu group copy.');
      return;
    }

    setDuplicatingGuide(true);
    try {
      const targetGroupId = duplicateIntoNewUrduGroup
        ? (await createLinkedUrduHowToGroupCopy({
          sourceGroupId: duplicateSourceGroupId,
          targetUrduGroupName: duplicateTargetGroupName,
          targetUrduGroupUrduName: duplicateTargetGroupUrduName,
        })).id
        : duplicateSourceGroupId;

      const duplicateResult = duplicateMode === 'all'
        ? await duplicateHowToGroupEntriesFromEnglish({
          sourceGroupId: duplicateSourceGroupId,
          sourceGuideIds: englishGuides
            .filter((guide) => guide.group_id === duplicateSourceGroupId)
            .map((guide) => guide.id),
          targetGroupId,
          createTargetUrduGroup: false,
        })
        : {
          targetGroupId,
          guides: [await duplicateHowToGuideFromEnglish(duplicateSourceGuideId, { targetGroupId })],
        };

      const duplicatedGuides = duplicateResult.guides;

      if (duplicatedGuides.length === 0) {
        toast.error('No new Urdu guides were duplicated. Matching Urdu copies may already exist in the target group.');
        return;
      }

      await Promise.all(
        duplicatedGuides.map(async (duplicatedGuide) => {
          await autoTranslatePersistedUrduGuideMetadata(duplicatedGuide);
          await autoTranslatePersistedUrduGuide(duplicatedGuide.id);
        }),
      );

      if (duplicatePublishNow) {
        let guidesToPublish: HowToGuide[] = [];
        if (duplicatePublishMode === 'all') {
          guidesToPublish = duplicatedGuides;
        } else {
          const targetGuide = duplicatedGuides.find((guide) => guide.source_guide_id === duplicatePublishSingleGuideId) ?? duplicatedGuides[0];
          if (targetGuide) guidesToPublish = [targetGuide];
        }

        for (const guideToPublish of guidesToPublish) {
          await publishHowToGuide({ guideId: guideToPublish.id, isActive: true });
        }
      }

      await queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
      await queryClient.invalidateQueries({ queryKey: GUIDES_KEY });
      setDuplicateDialogOpen(false);
      setActiveEditingLanguage('ur');
      setFiltersByLanguage((prev) => ({
        ...prev,
        ur: {
          search: '',
          selectedGroupFilter: duplicateResult.targetGroupId,
          selectedStatusFilter: 'all',
        },
      }));
      if (duplicatedGuides.length === 1) {
        toast.success(duplicatePublishNow ? 'Urdu guide duplicated, translated, and published.' : 'Urdu guide duplicated and translated.');
        await openTreeEditor(duplicatedGuides[0]);
      } else {
        toast.success(
          duplicatePublishNow
            ? `${duplicatedGuides.length} Urdu guides duplicated, translated, and published.`
            : `${duplicatedGuides.length} Urdu guides duplicated and translated.`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate guide.');
    } finally {
      setDuplicatingGuide(false);
    }
  };

  const removeGroup = async (group: HowToGroup) => {
    if (!canDelete) return;
    const guideCount = guideCountByGroup.get(group.id) ?? 0;
    const confirmed = window.confirm(
      guideCount > 0
        ? `Delete group "${group.name}" and its ${guideCount} ${guideCount === 1 ? 'guide' : 'guides'}? This cannot be undone.`
        : `Delete group "${group.name}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await deleteHowToGroup(group.id, { deleteGuides: true });
      await queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
      await queryClient.invalidateQueries({ queryKey: GUIDES_KEY });
      toast.success(
        guideCount > 0
          ? `Group deleted with ${guideCount} ${guideCount === 1 ? 'guide' : 'guides'}.`
          : 'Group deleted.',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete group.');
    }
  };

  useEffect(() => {
    if (activeEditingLanguage !== 'ur') return;
    if (groupsLoading || guidesLoading) return;
    if (urduLabelsBackfillStartedRef.current) return;
    if (!guides.some((guide) => guide.language === 'ur')) return;

    urduLabelsBackfillStartedRef.current = true;
    void backfillExistingUrduLabels();
  }, [activeEditingLanguage, groupsLoading, guidesLoading, guides, backfillExistingUrduLabels]);

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

  const useDerivedUrduPreview = treeGuide?.language === 'en' && treePreviewMode === 'urdu';
  const previewLanguage: EditingLanguage = (treeGuide?.language === 'ur' || useDerivedUrduPreview) ? 'ur' : 'en';
  const previewTitle = useDerivedUrduPreview
    ? (urduPreviewData?.title ?? treeGuide?.title ?? '')
    : (treeGuide?.title ?? '');
  const previewSubtitle = useDerivedUrduPreview
    ? (urduPreviewData?.subtitle ?? treeGuide?.subtitle ?? '')
    : (treeGuide?.subtitle ?? '');
  const previewIntro = useDerivedUrduPreview
    ? (urduPreviewData?.intro ?? treeGuideIntro)
    : treeGuideIntro;
  const previewNotesText = useDerivedUrduPreview
    ? (urduPreviewData?.notesText ?? treeGuideNotesText)
    : treeGuideNotesText;
  const previewSectionsSource = useDerivedUrduPreview
    ? (urduPreviewData?.sections ?? treeSections)
    : treeSections;

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-[hsl(140_30%_97%)] via-[hsl(160_30%_97%)] to-[hsl(180_25%_97%)]">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden pt-14 md:pt-0">
        <div className="relative overflow-hidden border-b border-[hsl(140_20%_88%)] bg-gradient-to-br from-[hsl(142_55%_28%)] via-[hsl(152_50%_32%)] to-[hsl(168_48%_36%)] px-4 sm:px-8 pt-6 pb-6 text-white">
          <div className="absolute inset-0 opacity-[0.12] pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.6) 0, transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.4) 0, transparent 40%)' }}
          />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur flex items-center justify-center shrink-0">
                <FolderTree size={22} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold leading-tight truncate">How-To Guides</h1>
                <p className="text-[11px] sm:text-xs text-white/80 mt-0.5">Author parent groups and step-by-step guides for English and Urdu app content</p>
                <p className="text-[10px] mt-1 text-white/70">Signed in as <span className="font-medium text-white">{role ?? 'guest'}</span></p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void refetchGroups(); void refetchGuides(); }}
                disabled={groupsLoading || guidesLoading}
                className="gap-2 bg-white/10 border-white/25 text-white hover:bg-white/20 hover:text-white"
              >
                <RefreshCw size={14} className={groupsLoading || guidesLoading ? 'animate-spin' : ''} /> Refresh
              </Button>
              <Button size="sm" onClick={openCreateGroup} disabled={!canEdit} className="gap-2 bg-white text-[hsl(142_60%_28%)] hover:bg-white/90">
                <Plus size={14} /> Add Group
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={activeEditingLanguage === 'ur' ? openDuplicateGuide : openCreateGuide}
                disabled={!canEdit || groups.length === 0 || (activeEditingLanguage === 'ur' && englishGuides.length === 0)}
                className="gap-2 bg-white/10 border-white/25 text-white hover:bg-white/20 hover:text-white"
              >
                <BookOpen size={14} /> {activeEditingLanguage === 'ur' ? 'Duplicate Entries' : 'Add Guide'}
              </Button>
            </div>
          </div>
        </div>

        <div className="px-3 sm:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[hsl(140_20%_88%)] bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(142_30%_35%)]">
                <FolderTree size={14} /> Groups
              </div>
              <p className="mt-1 text-2xl font-bold text-[hsl(150_30%_15%)]">{groups.length}</p>
            </div>
            <div className="rounded-2xl border border-[hsl(140_20%_88%)] bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(142_30%_35%)]">
                <BookOpen size={14} /> Guides ({activeEditingLanguage.toUpperCase()})
              </div>
              <p className="mt-1 text-2xl font-bold text-[hsl(150_30%_15%)]">{guidesInActiveLanguage.length}</p>
            </div>
            <div className="rounded-2xl border border-[hsl(140_20%_88%)] bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(142_30%_35%)]">
                <Sparkles size={14} /> Published ({activeEditingLanguage.toUpperCase()})
              </div>
              <p className="mt-1 text-2xl font-bold text-[hsl(150_30%_15%)]">{publishedInActiveLanguageCount}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[hsl(140_20%_88%)] bg-gradient-to-br from-[hsl(140_40%_97%)] to-white px-4 py-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[hsl(142_50%_92%)] ring-1 ring-[hsl(142_50%_80%)] flex items-center justify-center shrink-0">
                <Sparkles size={16} className="text-[hsl(142_60%_32%)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[hsl(150_30%_15%)]">Quick start</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-medium text-[hsl(150_30%_25%)]">1.</span> Create a group &nbsp;·&nbsp;
                  <span className="font-medium text-[hsl(150_30%_25%)]">2.</span> {activeEditingLanguage === 'ur' ? 'Duplicate an English guide' : 'Add a guide'} &nbsp;·&nbsp;
                  <span className="font-medium text-[hsl(150_30%_25%)]">3.</span> Open the tree editor and add sections, steps, and content blocks.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeEditingLanguage === 'en' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => void createDemoGuide()}
                      disabled={!canEdit || creatingDemo}
                    >
                      <Plus size={14} /> {creatingDemo ? 'Creating demo…' : 'Create Demo Guide'}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={openDuplicateGuide}
                      disabled={!canEdit || englishGuides.length === 0}
                    >
                      <Plus size={14} /> Duplicate from English
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[hsl(140_20%_88%)] bg-white px-4 py-3 shadow-sm space-y-3">
            <div className="inline-flex w-full max-w-sm rounded-xl border border-[hsl(140_20%_86%)] bg-[hsl(140_30%_98%)] p-1">
              <button
                type="button"
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${activeEditingLanguage === 'en' ? 'bg-white text-[hsl(142_60%_28%)] shadow-sm' : 'text-[hsl(142_20%_38%)] hover:text-[hsl(142_40%_30%)]'}`}
                onClick={() => setActiveEditingLanguage('en')}
              >
                English
              </button>
              <button
                type="button"
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${activeEditingLanguage === 'ur' ? 'bg-white text-[hsl(142_60%_28%)] shadow-sm' : 'text-[hsl(142_20%_38%)] hover:text-[hsl(142_40%_30%)]'}`}
                onClick={() => setActiveEditingLanguage('ur')}
              >
                Urdu
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="howto-search" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(142_30%_35%)]">Guide Filters</Label>
              <div className="flex items-center gap-2">
                {activeEditingLanguage === 'en' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={() => void massTranslateCurrentGroupToUrdu()}
                    disabled={!canEdit || massTranslatingGroup || !selectedFilterGroup || englishGuidesInFilterGroup.length === 0}
                  >
                    <Languages size={13} /> {massTranslatingGroup ? 'Translating...' : 'Translate Current Group'}
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="ghost" className="h-8" onClick={clearGuideFilters} disabled={!hasActiveGuideFilters}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_170px]">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="howto-search"
                  className="h-10 pl-9 text-sm"
                  value={activeFilters.search}
                  onChange={(event) => setActiveFilters((prev) => ({ ...prev, search: event.target.value }))}
                  placeholder="Search by title, slug, or group…"
                />
              </div>

              <div>
                <Label htmlFor="howto-group-filter" className="text-[11px] text-muted-foreground">Group</Label>
                <select
                  id="howto-group-filter"
                  value={activeFilters.selectedGroupFilter}
                  onChange={(event) => setActiveFilters((prev) => ({ ...prev, selectedGroupFilter: event.target.value }))}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All groups</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{getHowToGroupDisplayName(group, activeEditingLanguage)}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="howto-status-filter" className="text-[11px] text-muted-foreground">Status</Label>
                <select
                  id="howto-status-filter"
                  value={activeFilters.selectedStatusFilter}
                  onChange={(event) => setActiveFilters((prev) => ({ ...prev, selectedStatusFilter: event.target.value as 'all' | 'live' | 'draft' }))}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All</option>
                  <option value="live">Live</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <section className="rounded-2xl border border-[hsl(140_20%_88%)] bg-white overflow-hidden shadow-sm">
              <header className="px-4 py-3 border-b border-[hsl(140_20%_92%)] bg-gradient-to-r from-[hsl(140_30%_97%)] to-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FolderTree size={16} className="text-[hsl(142_60%_32%)]" />
                  <h2 className="text-sm font-semibold text-[hsl(150_30%_15%)]">Parent Groups</h2>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[hsl(142_50%_92%)] text-[hsl(142_60%_28%)] font-semibold">{groups.length}</span>
                </div>
                <Button size="sm" variant="ghost" className="h-8 gap-1 text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)]" onClick={openCreateGroup} disabled={!canEdit}>
                  <Plus size={14} /> New
                </Button>
              </header>
              <div className="divide-y divide-[hsl(140_20%_94%)]">
                {groups.map((group) => {
                  const color = group.color || '#2e7d32';
                  const count = guideCountByGroup.get(group.id) ?? 0;
                  const groupLabel = getHowToGroupDisplayName(group, activeEditingLanguage);
                  return (
                    <div key={group.id} className="px-3 sm:px-4 py-3 flex items-center justify-between gap-3 hover:bg-[hsl(140_30%_99%)] transition-colors">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-sm ring-1 ring-black/5"
                          style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
                          aria-hidden
                        >
                          {(groupLabel || group.name).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[hsl(150_30%_15%)] truncate">{groupLabel}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono">{group.slug}</span>
                            <span className="text-[hsl(140_20%_80%)]">•</span>
                            <span>{count} {count === 1 ? 'guide' : 'guides'}</span>
                            {!group.is_active ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">Hidden</span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button className="p-2 rounded-lg hover:bg-[hsl(142_50%_92%)] text-[hsl(142_40%_30%)] disabled:opacity-40" onClick={() => openEditGroup(group)} disabled={!canEdit} title="Edit group" aria-label="Edit group">
                          <Pencil size={15} />
                        </button>
                        {canDelete ? (
                          <button className="p-2 rounded-lg hover:bg-rose-50 text-rose-600" onClick={() => void removeGroup(group)} title="Delete group" aria-label="Delete group">
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {groups.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <FolderTree size={28} className="mx-auto text-[hsl(140_20%_70%)]" />
                    <p className="mt-2 text-sm font-medium text-[hsl(150_30%_25%)]">No groups yet</p>
                    <p className="text-xs text-muted-foreground">Create a group to organise your guides.</p>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-[hsl(140_20%_88%)] bg-white overflow-hidden shadow-sm">
              <header className="px-4 py-3 border-b border-[hsl(140_20%_92%)] bg-gradient-to-r from-[hsl(140_30%_97%)] to-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen size={16} className="text-[hsl(142_60%_32%)]" />
                  <h2 className="text-sm font-semibold text-[hsl(150_30%_15%)]">Guides ({activeEditingLanguage.toUpperCase()})</h2>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[hsl(142_50%_92%)] text-[hsl(142_60%_28%)] font-semibold">{filteredGuides.length}</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)]"
                  onClick={activeEditingLanguage === 'ur' ? openDuplicateGuide : openCreateGuide}
                  disabled={!canEdit || groups.length === 0 || (activeEditingLanguage === 'ur' && englishGuides.length === 0)}
                >
                  <Plus size={14} /> {activeEditingLanguage === 'ur' ? 'Duplicate Entries' : 'New'}
                </Button>
              </header>
              <div className="divide-y divide-[hsl(140_20%_94%)]">
                {groupedFilteredGuides.map((groupedEntry, groupedIndex) => {
                  const parentGroup = groupedEntry.group;
                  const parentColor = parentGroup?.color || '#2e7d32';
                  const parentName = getHowToGroupDisplayName(parentGroup, activeEditingLanguage);

                  return (
                    <div key={parentGroup?.id ?? `unknown-group-${groupedIndex}`}>
                      <div className="px-3 sm:px-4 py-2.5 border-b border-[hsl(140_20%_92%)] bg-[hsl(140_30%_98%)] flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-md flex items-center justify-center text-white font-bold text-[10px] ring-1 ring-black/5"
                          style={{ background: `linear-gradient(135deg, ${parentColor}, ${parentColor}cc)` }}
                          aria-hidden
                        >
                          {parentName.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-xs font-semibold text-[hsl(150_30%_18%)] truncate">{parentName}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(142_50%_92%)] text-[hsl(142_60%_28%)] font-semibold">
                          {groupedEntry.guides.length} {groupedEntry.guides.length === 1 ? 'guide' : 'guides'}
                        </span>
                      </div>

                      <div className="divide-y divide-[hsl(140_20%_94%)]">
                        {groupedEntry.guides.map((guide) => {
                          const color = guide.color || parentGroup?.color || '#2e7d32';
                          return (
                            <div key={guide.id} className="px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-[hsl(140_30%_99%)] transition-colors">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <div
                                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-sm ring-1 ring-black/5"
                                  style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
                                  aria-hidden
                                >
                                  {guide.title.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold text-[hsl(150_30%_15%)] truncate">{guide.title}</p>
                                    {guide.is_active ? (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Live</span>
                                    ) : (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">Draft</span>
                                    )}
                                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(210_30%_94%)] text-[hsl(210_40%_30%)] font-semibold uppercase">
                                      <Languages size={10} /> {guide.language}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                    <span className="font-mono">{guide.slug}</span>
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0 flex-wrap justify-end">
                                <button className="p-2 rounded-lg hover:bg-[hsl(142_50%_92%)] text-[hsl(142_40%_30%)] disabled:opacity-40" onClick={() => void openTreeEditor(guide)} disabled={!canEdit} title="Edit guide tree" aria-label="Edit guide tree">
                                  <FolderTree size={15} />
                                </button>
                                <button className="p-2 rounded-lg hover:bg-[hsl(142_50%_92%)] text-[hsl(142_40%_30%)] disabled:opacity-40" onClick={() => void publishGuide(guide)} disabled={!canEdit} title={guide.is_active ? 'Unpublish' : 'Publish'} aria-label={guide.is_active ? 'Unpublish' : 'Publish'}>
                                  <Upload size={15} />
                                </button>
                                <button className="p-2 rounded-lg hover:bg-[hsl(142_50%_92%)] text-[hsl(142_40%_30%)] disabled:opacity-40" onClick={() => void snapshotGuide(guide)} disabled={!canEdit} title="Create snapshot" aria-label="Create snapshot">
                                  <Camera size={15} />
                                </button>
                                <button className="p-2 rounded-lg hover:bg-[hsl(142_50%_92%)] text-[hsl(142_40%_30%)] disabled:opacity-40" onClick={() => openEditGuide(guide)} disabled={!canEdit} title="Edit guide" aria-label="Edit guide">
                                  <Pencil size={15} />
                                </button>
                                {canDelete ? (
                                  <button className="p-2 rounded-lg hover:bg-rose-50 text-rose-600" onClick={() => void removeGuide(guide)} title="Delete guide" aria-label="Delete guide">
                                    <Trash2 size={15} />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {filteredGuides.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <BookOpen size={28} className="mx-auto text-[hsl(140_20%_70%)]" />
                    <p className="mt-2 text-sm font-medium text-[hsl(150_30%_25%)]">No guides match</p>
                    <p className="text-xs text-muted-foreground">
                      {activeEditingLanguage === 'ur'
                        ? 'Adjust filters, clear search, or duplicate an English guide.'
                        : 'Adjust filters, clear search, or add a new guide.'}
                    </p>
                  </div>
                ) : null}
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
              <Input value={groupForm.name} onChange={(event) => setGroupForm((prev) => ({ ...prev, name: event.target.value, slug: prev.slug || normalizeSlug(event.target.value) }))} placeholder="e.g. Prayer essentials" />
            </div>
            <div>
              <Label>Urdu Name</Label>
              <Input value={groupForm.urdu_name} onChange={(event) => setGroupForm((prev) => ({ ...prev, urdu_name: event.target.value }))} placeholder="e.g. نماز کے بنیادی امور" />
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

      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Duplicate English Entries to Urdu</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div>
              <Label>English Group</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1"
                value={duplicateSourceGroupId}
                onChange={(event) => {
                  const nextGroupId = event.target.value;
                  setDuplicateSourceGroupId(nextGroupId);
                  const firstGuideId = englishGuides.find((guide) => guide.group_id === nextGroupId)?.id ?? '';
                  setDuplicateSourceGuideId(firstGuideId);
                  setDuplicatePublishSingleGuideId(firstGuideId);
                }}
              >
                {englishGroups.map((group) => {
                  const count = englishGroupMap.get(group.id) ?? 0;
                  return (
                    <option key={group.id} value={group.id}>
                      {group.name} ({count} {count === 1 ? 'guide' : 'guides'})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="rounded-md border p-2 space-y-2">
              <Label className="text-xs">Duplicate Scope</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold border ${duplicateMode === 'single' ? 'border-[hsl(142_60%_32%)] bg-[hsl(142_50%_95%)] text-[hsl(142_60%_24%)]' : 'border-input bg-white text-muted-foreground'}`}
                  onClick={() => {
                    setDuplicateMode('single');
                    setDuplicatePublishMode('single');
                  }}
                >
                  Single Guide
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold border ${duplicateMode === 'all' ? 'border-[hsl(142_60%_32%)] bg-[hsl(142_50%_95%)] text-[hsl(142_60%_24%)]' : 'border-input bg-white text-muted-foreground'}`}
                  onClick={() => setDuplicateMode('all')}
                >
                  All Guides in Group
                </button>
              </div>
            </div>

            {duplicateMode === 'single' ? (
              <div>
                <Label>English Guide</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1"
                  value={duplicateSourceGuideId}
                  onChange={(event) => {
                    const guideId = event.target.value;
                    setDuplicateSourceGuideId(guideId);
                    setDuplicatePublishSingleGuideId(guideId);
                  }}
                >
                  {englishGuidesInSelectedGroup.map((guide) => (
                    <option key={guide.id} value={guide.id}>
                      {guide.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label className="text-xs">Create new Urdu group copy</Label>
              <Switch
                checked={duplicateIntoNewUrduGroup}
                onCheckedChange={(checked) => {
                  setDuplicateIntoNewUrduGroup(checked);
                  if (checked) {
                    const sourceGroup = englishGroups.find((group) => group.id === duplicateSourceGroupId);
                    if (sourceGroup) {
                      if (!duplicateTargetGroupName.trim()) {
                        setDuplicateTargetGroupName(`${sourceGroup.name} Urdu`);
                      }
                      if (!duplicateTargetGroupUrduName.trim()) {
                        setDuplicateTargetGroupUrduName(sourceGroup.urdu_name ?? sourceGroup.name);
                      }
                    }
                  }
                }}
              />
            </div>

            {duplicateIntoNewUrduGroup ? (
              <div className="grid gap-3 rounded-md border p-3">
                <div>
                  <Label>New Urdu Group Name</Label>
                  <Input
                    className="mt-1"
                    value={duplicateTargetGroupName}
                    onChange={(event) => setDuplicateTargetGroupName(event.target.value)}
                    placeholder="e.g. Prayer Essentials Urdu"
                  />
                </div>
                <div>
                  <Label>New Urdu Group Urdu Name</Label>
                  <Input
                    className="mt-1"
                    value={duplicateTargetGroupUrduName}
                    onChange={(event) => setDuplicateTargetGroupUrduName(event.target.value)}
                    placeholder="e.g. نماز کے بنیادی امور"
                  />
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label className="text-xs">Make duplicate live now</Label>
              <Switch checked={duplicatePublishNow} onCheckedChange={setDuplicatePublishNow} />
            </div>

            {duplicatePublishNow ? (
              <div className="grid gap-3 rounded-md border p-3">
                <Label className="text-xs">Publish Scope</Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold border ${duplicatePublishMode === 'single' ? 'border-[hsl(142_60%_32%)] bg-[hsl(142_50%_95%)] text-[hsl(142_60%_24%)]' : 'border-input bg-white text-muted-foreground'}`}
                    onClick={() => setDuplicatePublishMode('single')}
                  >
                    Single Guide
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold border ${duplicatePublishMode === 'all' ? 'border-[hsl(142_60%_32%)] bg-[hsl(142_50%_95%)] text-[hsl(142_60%_24%)]' : 'border-input bg-white text-muted-foreground'}`}
                    onClick={() => setDuplicatePublishMode('all')}
                    disabled={duplicateMode === 'single'}
                  >
                    All Duplicated
                  </button>
                </div>

                {duplicatePublishMode === 'single' ? (
                  <div>
                    <Label>Guide To Publish</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1"
                      value={duplicatePublishSingleGuideId}
                      onChange={(event) => setDuplicatePublishSingleGuideId(event.target.value)}
                    >
                      {englishGuidesInSelectedGroup.map((guide) => (
                        <option key={guide.id} value={guide.id}>
                          {guide.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              {duplicateMode === 'all'
                ? 'This creates draft Urdu copies for every English guide in the selected group.'
                : 'This creates a draft Urdu copy with the same structure, sections, steps, blocks, and images.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)} disabled={duplicatingGuide}>Cancel</Button>
            <Button
              onClick={() => void duplicateGuideFromEnglish()}
              disabled={
                duplicatingGuide
                || !duplicateSourceGroupId
                || (duplicateMode === 'single' && !duplicateSourceGuideId)
                || (duplicateIntoNewUrduGroup && !duplicateTargetGroupName.trim())
                || !canEdit
              }
            >
              {duplicatingGuide ? 'Duplicating...' : 'Duplicate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={guideDialogOpen} onOpenChange={setGuideDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingGuide ? 'Edit Guide' : 'Create Guide'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1 overflow-y-auto pr-1">
            <div>
              <Label>Group</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1"
                value={guideForm.group_id}
                onChange={(event) => setGuideForm((prev) => ({ ...prev, group_id: event.target.value }))}
              >
                <option value="">Select group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>{getHowToGroupDisplayName(group, guideForm.language as EditingLanguage)}</option>
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
                  disabled
                >
                  <option value="en">English</option>
                  <option value="ur">Urdu</option>
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">Language is fixed per guide.</p>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          <DialogFooter className="pt-3 border-t bg-background">
            <Button variant="outline" onClick={() => setGuideDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void saveGuide()} disabled={saving || !canEdit}>{saving ? 'Saving...' : 'Save Guide'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={treeDialogOpen} onOpenChange={setTreeDialogOpen}>
        <DialogContent className="w-[100vw] sm:w-[98vw] max-w-[98vw] h-[100dvh] sm:h-[92vh] sm:max-h-[92vh] overflow-hidden p-0 rounded-none sm:rounded-lg flex flex-col">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-[hsl(140_20%_92%)] bg-gradient-to-r from-[hsl(142_55%_28%)] via-[hsl(152_50%_32%)] to-[hsl(168_48%_36%)] text-white">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/15 ring-1 ring-white/30 flex items-center justify-center shrink-0">
                <FolderTree size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-sm sm:text-base text-white truncate">{treeGuide?.title ?? 'Guide'}</DialogTitle>
                <p className="text-[11px] text-white/85 mt-1 leading-snug hidden sm:block">
                  <b>Sections</b> → <b>Steps</b> → typed <b>Blocks</b> (Text · Action · Note · Recitation) plus images. Live preview on the right mirrors the app.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="lg:hidden gap-1 bg-white/10 border-white/25 text-white hover:bg-white/20 hover:text-white h-8"
                onClick={() => setShowMobilePreview((value) => !value)}
              >
                {showMobilePreview ? <EyeOff size={14} /> : <Eye size={14} />} {showMobilePreview ? 'Editor' : 'Preview'}
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden">
            {treeLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading guide tree…</p>
            ) : (
              <div className="grid lg:grid-cols-[minmax(0,1fr)_440px] h-full min-h-0 overflow-hidden">
                <div className={`${showMobilePreview ? 'hidden' : 'block'} lg:block min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 border-r border-[hsl(140_20%_92%)]`}>
              <div className="rounded-2xl border border-[hsl(140_20%_88%)] bg-gradient-to-br from-[hsl(140_40%_97%)] to-white p-4 space-y-3 shadow-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[hsl(142_50%_92%)] flex items-center justify-center">
                      <Sparkles size={14} className="text-[hsl(142_60%_32%)]" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(142_30%_30%)]">Guide-level content</p>
                      <p className="text-[11px] text-muted-foreground">Renders at the top of the guide, before the first section.</p>
                    </div>
                  </div>
                  {treeGuide?.language === 'ur' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void autoTranslateUrduTree()}
                      disabled={!canEdit || autoTranslatingTree || treeLoading}
                    >
                      {autoTranslatingTree ? 'Translating...' : 'Auto-translate Urdu'}
                    </Button>
                  ) : null}
                </div>
                <div>
                  <Label>Guide Introduction</Label>
                  <Textarea
                    rows={6}
                    className="mt-1 min-h-[140px]"
                    value={treeGuideIntro}
                    onChange={(event) => setTreeGuideIntro(event.target.value)}
                    placeholder={'Write the full introduction exactly as it should appear in the app.\n\nUse paragraphs, references, and bullet-style lines where needed.'}
                  />
                </div>
                <div>
                  <Label>Guide Notes</Label>
                  <Textarea
                    rows={5}
                    className="mt-1 min-h-[120px]"
                    value={treeGuideNotesText}
                    onChange={(event) => setTreeGuideNotesText(event.target.value)}
                    placeholder={'One guide note per paragraph.\n\nExample note one.\n\nExample note two.'}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Separate each guide-level note with a blank line.</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(142_30%_30%)]">Sections</p>
                  <p className="text-[11px] text-muted-foreground">Sections → Steps → Blocks / Images</p>
                </div>
                <Button size="sm" onClick={addSection} disabled={!canEdit} className="gap-1 bg-[hsl(142_60%_32%)] text-white hover:bg-[hsl(142_60%_28%)]">
                  <Plus size={14} /> Add Section
                </Button>
              </div>

              {treeSections.map((section, sectionIndex) => (
                <div
                  key={`section-${sectionIndex}`}
                  className="rounded-2xl border border-[hsl(140_20%_86%)] bg-white overflow-hidden shadow-sm"
                  draggable={canEdit}
                  onDragStart={() => setDraggingSectionIndex(sectionIndex)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDropSection(sectionIndex)}
                  onDragEnd={() => setDraggingSectionIndex(null)}
                >
                  <div className="px-3 sm:px-4 py-3 bg-gradient-to-r from-[hsl(142_55%_28%)] to-[hsl(168_48%_36%)] text-white flex items-center gap-2">
                    <span className="cursor-grab text-white/70 hover:text-white" title="Drag to reorder section">
                      <GripVertical size={16} />
                    </span>
                    <span className="w-6 h-6 rounded-full bg-white/20 ring-1 ring-white/30 flex items-center justify-center text-xs font-bold">{sectionIndex + 1}</span>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/90">Section</p>
                    <div className="ml-auto flex items-center gap-1">
                      <button className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 flex items-center justify-center text-white" disabled={sectionIndex === 0 || !canEdit} onClick={() => moveSection(sectionIndex, sectionIndex - 1)} title="Move up" aria-label="Move section up">↑</button>
                      <button className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 flex items-center justify-center text-white" disabled={sectionIndex === treeSections.length - 1 || !canEdit} onClick={() => moveSection(sectionIndex, sectionIndex + 1)} title="Move down" aria-label="Move section down">↓</button>
                      <button
                        className="h-8 px-2 rounded-lg bg-rose-500/80 hover:bg-rose-500 disabled:opacity-40 flex items-center gap-1 text-white text-xs font-medium"
                        onClick={() => setTreeSections((prev) => prev.filter((_, idx) => idx !== sectionIndex))}
                        disabled={!canEdit}
                      >
                        <Trash2 size={13} />
                        <span className="hidden sm:inline">Remove</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-3 sm:p-4 space-y-4">
                  <div>
                    <Label>Section Heading</Label>
                    <Input
                      value={section.heading}
                      onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => idx === sectionIndex ? { ...item, heading: event.target.value } : item))}
                      placeholder="e.g. The method, Important notes, References"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">Clear section headings help users scan long guides.</p>
                  </div>

                  <div className="space-y-3">
                    {section.steps.map((step, stepIndex) => (
                      <div
                        key={`step-${sectionIndex}-${stepIndex}`}
                        className="rounded-xl border border-[hsl(140_20%_88%)] bg-[hsl(140_30%_99%)] overflow-hidden"
                        draggable={canEdit}
                        onDragStart={() => setDraggingStepRef({ sectionIndex, stepIndex })}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleDropStep(sectionIndex, stepIndex)}
                        onDragEnd={() => setDraggingStepRef(null)}
                      >
                        <div className="px-3 py-2 bg-white border-b border-[hsl(140_20%_90%)] flex items-center gap-2">
                          <span className="cursor-grab text-[hsl(140_20%_60%)] hover:text-[hsl(140_20%_40%)]" title="Drag to reorder step">
                            <GripVertical size={14} />
                          </span>
                          <span className="w-6 h-6 rounded-full bg-[hsl(142_50%_92%)] text-[hsl(142_60%_28%)] flex items-center justify-center text-[11px] font-bold">{stepIndex + 1}</span>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(142_30%_30%)]">Step</p>
                          {step.title ? (
                            <p className="text-xs text-[hsl(150_30%_25%)] truncate hidden sm:block">· {step.title}</p>
                          ) : null}
                          <div className="ml-auto flex items-center gap-1">
                            <button
                              className="h-7 px-2 rounded-md bg-white border border-[hsl(140_20%_85%)] text-[11px] text-[hsl(142_40%_30%)] hover:bg-[hsl(142_50%_95%)]"
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
                            </button>
                            <button className="h-7 w-7 rounded-md bg-white border border-[hsl(140_20%_85%)] text-[hsl(142_40%_30%)] hover:bg-[hsl(142_50%_95%)] disabled:opacity-40 flex items-center justify-center" disabled={stepIndex === 0 || !canEdit} onClick={() => moveStep(sectionIndex, stepIndex, stepIndex - 1)} aria-label="Move step up">↑</button>
                            <button className="h-7 w-7 rounded-md bg-white border border-[hsl(140_20%_85%)] text-[hsl(142_40%_30%)] hover:bg-[hsl(142_50%_95%)] disabled:opacity-40 flex items-center justify-center" disabled={stepIndex === section.steps.length - 1 || !canEdit} onClick={() => moveStep(sectionIndex, stepIndex, stepIndex + 1)} aria-label="Move step down">↓</button>
                          </div>
                        </div>

                        <div className="p-3 space-y-3">

                        {step.collapsed ? (
                          <p className="text-xs text-muted-foreground">{step.title || `Step ${stepIndex + 1}`} - collapsed</p>
                        ) : (
                          <>

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
                            placeholder="A short, action-oriented step title."
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">The large heading rendered at the top of the step card in the app.</p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <Label>Step Content</Label>
                              <p className="text-[11px] text-muted-foreground">Build the step from structured blocks. Each block maps 1:1 to a rendered component in the app.</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-[11px] text-muted-foreground mr-1">Insert:</span>
                              {(['text', 'action', 'note', 'recitation'] as BlockKind[]).map((kind) => {
                                const meta = blockKindMeta(kind);
                                return (
                                  <Button
                                    key={kind}
                                    size="sm"
                                    variant="outline"
                                    onClick={() => addTemplateBlock(sectionIndex, stepIndex, kind)}
                                    disabled={!canEdit}
                                    title={meta.hint}
                                  >
                                    + {meta.title}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>

                          {step.blocks.length === 0 ? (
                            <div className="rounded-md border border-dashed border-[hsl(140_20%_80%)] bg-[hsl(140_30%_99%)] px-4 py-6 text-center">
                              <p className="text-sm text-muted-foreground">No blocks yet.</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                Use the "Insert" buttons above. <b>Text</b> for prose, <b>Action</b> for "do this" instructions, <b>Note</b> for coloured callouts, <b>Recitation</b> for Arabic + transliteration + meaning.
                              </p>
                            </div>
                          ) : null}

                          {step.blocks.map((block, blockIndex) => (
                            <div
                              key={`block-${sectionIndex}-${stepIndex}-${blockIndex}`}
                              draggable={canEdit}
                              onDragStart={() => setDraggingBlockRef({ sectionIndex, stepIndex, blockIndex })}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => handleDropBlock(sectionIndex, stepIndex, blockIndex)}
                              onDragEnd={() => setDraggingBlockRef(null)}
                            >
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="text-[11px] text-muted-foreground">Block {blockIndex + 1} of {step.blocks.length}</span>
                                <div className="flex items-center gap-1">
                                  <Button size="sm" variant="outline" disabled={blockIndex === 0 || !canEdit} onClick={() => moveBlock(sectionIndex, stepIndex, blockIndex, blockIndex - 1)}>Up</Button>
                                  <Button size="sm" variant="outline" disabled={blockIndex === step.blocks.length - 1 || !canEdit} onClick={() => moveBlock(sectionIndex, stepIndex, blockIndex, blockIndex + 1)}>Down</Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-rose-700 hover:bg-rose-50"
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
                                    disabled={!canEdit}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              </div>
                              <BlockEditor
                                block={block}
                                disabled={!canEdit}
                                onChange={(next) => setTreeSections((prev) => prev.map((item, idx) => {
                                  if (idx !== sectionIndex) return item;
                                  return {
                                    ...item,
                                    steps: item.steps.map((stepItem, stepIdx) => {
                                      if (stepIdx !== stepIndex) return stepItem;
                                      return {
                                        ...stepItem,
                                        blocks: stepItem.blocks.map((blockItem, innerIndex) => innerIndex === blockIndex ? next : blockItem),
                                      };
                                    }),
                                  };
                                }))}
                              />
                            </div>
                          ))}
                        </div>

                        <details className="rounded-md border border-[hsl(140_20%_90%)] bg-white">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-[hsl(150_30%_20%)]">
                            Advanced: legacy free-text fields (optional)
                          </summary>
                          <div className="px-3 pb-3 pt-1 space-y-3">
                            <p className="text-[11px] text-muted-foreground">
                              Prefer structured blocks above. These fields still render in the app but are harder to format consistently. Use them only when you need to migrate long-form text or inject raw HTML.
                            </p>
                            <div>
                              <Label>Step Note (legacy)</Label>
                              <Textarea
                                rows={2}
                                className="mt-1 min-h-[60px]"
                                value={step.note}
                                onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => {
                                  if (idx !== sectionIndex) return item;
                                  return {
                                    ...item,
                                    steps: item.steps.map((stepItem, stepIdx) => stepIdx === stepIndex ? { ...stepItem, note: event.target.value } : stepItem),
                                  };
                                }))}
                                placeholder='Prefer a "Highlighted note" block instead.'
                              />
                            </div>
                            <div>
                              <Label>Step Detail (legacy free-text)</Label>
                              <div className="mt-1 mb-2 flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => appendStepDetailTemplate(sectionIndex, stepIndex, 'Section Title\n-------------')}
                                  disabled={!canEdit}
                                >
                                  Insert Section Title
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => appendStepDetailTemplate(sectionIndex, stepIndex, '- Point one\n- Point two\n- Point three')}
                                  disabled={!canEdit}
                                >
                                  Insert Bullet List
                                </Button>
                              </div>
                              <Textarea
                                rows={6}
                                className="min-h-[140px]"
                                value={step.detail}
                                onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => {
                                  if (idx !== sectionIndex) return item;
                                  return {
                                    ...item,
                                    steps: item.steps.map((stepItem, stepIdx) => stepIdx === stepIndex ? { ...stepItem, detail: event.target.value } : stepItem),
                                  };
                                }))}
                                placeholder="Long-form prose. Will be parsed into text/note/recitation blocks at render time."
                              />
                            </div>
                            <div>
                              <Label>Rich HTML (advanced)</Label>
                              <Textarea
                                rows={6}
                                className="min-h-[140px] font-mono text-xs"
                                value={step.rich_content_html}
                                onChange={(event) => setTreeSections((prev) => prev.map((item, idx) => {
                                  if (idx !== sectionIndex) return item;
                                  return {
                                    ...item,
                                    steps: item.steps.map((stepItem, stepIdx) => stepIdx === stepIndex ? { ...stepItem, rich_content_html: event.target.value } : stepItem),
                                  };
                                }))}
                                placeholder="<p>Raw HTML rendered as-is. Only use if structured blocks can't express your layout.</p>"
                              />
                            </div>
                          </div>
                        </details>

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
                            className="gap-1"
                          >
                            <Trash2 size={13} /> Remove Step
                          </Button>
                        </div>
                        </div>
                      </div>
                    ))}

                    <Button size="sm" variant="outline" onClick={() => addStep(sectionIndex)} disabled={!canEdit} className="gap-1 w-full sm:w-auto border-dashed">
                      <Plus size={14} /> Add Step
                    </Button>
                  </div>
                  </div>
                </div>
              ))}

              {treeSections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[hsl(140_20%_80%)] bg-white px-4 py-8 text-center">
                  <FolderTree size={28} className="mx-auto text-[hsl(140_20%_70%)]" />
                  <p className="mt-2 text-sm font-medium text-[hsl(150_30%_25%)]">No sections yet</p>
                  <p className="text-xs text-muted-foreground">Add your first section to start building the guide.</p>
                </div>
              ) : null}
              </div>

                <aside className={`${showMobilePreview ? 'block' : 'hidden'} lg:block min-h-0 overflow-y-auto bg-gradient-to-b from-[hsl(140_30%_98%)] to-white`}>
                <div className="sticky top-0 z-10 border-b border-[hsl(140_20%_92%)] bg-white/95 backdrop-blur px-4 py-2 flex items-center gap-2">
                  <Eye size={14} className="text-[hsl(142_60%_32%)]" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(142_30%_30%)]">Live preview</p>
                    <p className="text-[10px] text-muted-foreground">Mirrors how the app renders this guide.</p>
                  </div>
                  {treeGuide?.language === 'en' ? (
                    <div className="ml-auto flex items-center gap-2">
                      <div className="inline-flex rounded-lg border border-[hsl(140_20%_86%)] bg-[hsl(140_30%_98%)] p-0.5">
                        <button
                          type="button"
                          className={`rounded-md px-2 py-1 text-[10px] font-semibold ${treePreviewMode === 'source' ? 'bg-white text-[hsl(142_60%_28%)] shadow-sm' : 'text-[hsl(142_20%_38%)]'}`}
                          onClick={() => setTreePreviewMode('source')}
                        >
                          Source
                        </button>
                        <button
                          type="button"
                          className={`rounded-md px-2 py-1 text-[10px] font-semibold ${treePreviewMode === 'urdu' ? 'bg-white text-[hsl(142_60%_28%)] shadow-sm' : 'text-[hsl(142_20%_38%)]'}`}
                          onClick={() => setTreePreviewMode('urdu')}
                        >
                          Urdu
                        </button>
                      </div>
                      {treePreviewMode === 'urdu' ? (
                        <span className="text-[10px] text-muted-foreground">
                          {urduPreviewLoading ? 'Translating...' : 'Urdu preview'}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="p-3 sm:p-4">
                  <HowToGuidePreview
                    title={previewTitle}
                    subtitle={previewSubtitle}
                    intro={previewIntro}
                    notes={parseGuideNotesText(previewNotesText)}
                    accentColor={treeGuide?.color ?? '#2e7d32'}
                    previewLanguage={previewLanguage}
                    sections={previewSectionsSource.map((section) => ({
                      heading: section.heading,
                      steps: section.steps.map((step, stepIndex) => ({
                        step: stepIndex + 1,
                        title: step.title,
                        detail: step.detail,
                        note: step.note,
                        blocks: parsePreviewBlocks(step.blocks),
                        images: step.images.map((image) => ({
                          image_url: image.image_url,
                          caption: image.caption || undefined,
                          source: image.source || undefined,
                        })),
                      })),
                    }))}
                  />
                </div>
                </aside>
              </div>
            )}
          </div>

          <DialogFooter className="px-4 sm:px-6 py-3 border-t border-[hsl(140_20%_92%)] bg-white gap-2">
            <Button variant="outline" onClick={() => setTreeDialogOpen(false)} disabled={saving} className="flex-1 sm:flex-none">Close</Button>
            <Button
              onClick={() => void saveTree()}
              disabled={saving || !canEdit || treeLoading}
              className="flex-1 sm:flex-none gap-1 bg-[hsl(142_60%_32%)] text-white hover:bg-[hsl(142_60%_28%)]"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {saving ? 'Saving…' : 'Save Tree'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

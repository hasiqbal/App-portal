import { createClient } from '@supabase/supabase-js';
import * as HardcodedGuidesModule from '../../JMN-app/howtoguides/index.ts';
import type { GuideBlock, HowToGuide } from '../../JMN-app/howtoguides/types.ts';

const HOW_TO_GUIDES = (
  (HardcodedGuidesModule as { HOW_TO_GUIDES?: HowToGuide[] }).HOW_TO_GUIDES
  ?? (HardcodedGuidesModule as { default?: { HOW_TO_GUIDES?: HowToGuide[] } }).default?.HOW_TO_GUIDES
  ?? []
) as HowToGuide[];

type GroupRow = {
  id: string;
  slug: string;
  name: string;
  display_order: number;
};

type GuideRow = {
  id: string;
  slug: string;
  title: string;
};

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  return { dryRun };
}

function assertEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toDbBlock(block: GuideBlock): { kind: 'text' | 'action' | 'note' | 'recitation'; payload: Record<string, unknown> } {
  const { kind, ...rest } = block as GuideBlock & Record<string, unknown>;
  return {
    kind,
    payload: rest,
  };
}

async function main() {
  const { dryRun } = parseArgs();
  const supabaseUrl = assertEnv('SUPABASE_URL');
  const serviceRoleKey = assertEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const orderedGroups = Array.from(new Set(HOW_TO_GUIDES.map((guide) => guide.parentGroup || 'General')));
  const groupOrderByName = new Map<string, number>(orderedGroups.map((name, index) => [name, index]));

  console.log(`Preparing to migrate ${HOW_TO_GUIDES.length} hardcoded guides.`);
  if (dryRun) {
    console.log('Dry run enabled. No database changes will be applied.');
  }

  const groupIdByName = new Map<string, string>();

  for (const groupName of orderedGroups) {
    const groupSlug = normalizeSlug(groupName);
    const displayOrder = groupOrderByName.get(groupName) ?? 0;

    if (dryRun) {
      console.log(`[DRY RUN] upsert group ${groupName} (${groupSlug})`);
      groupIdByName.set(groupName, `dry-${groupSlug}`);
      continue;
    }

    const { data: group, error: groupError } = await supabase
      .from('howto_groups')
      .upsert(
        {
          slug: groupSlug,
          name: groupName,
          icon: 'menu-book',
          color: '#2e7d32',
          display_order: displayOrder,
          is_active: true,
        },
        { onConflict: 'slug' },
      )
      .select('id,slug,name,display_order')
      .single<GroupRow>();

    if (groupError || !group) {
      throw new Error(`Failed to upsert group ${groupName}: ${groupError?.message ?? 'Unknown error'}`);
    }

    groupIdByName.set(groupName, group.id);
  }

  const guideCounterByGroup = new Map<string, number>();

  for (const rawGuide of HOW_TO_GUIDES) {
    const guide = rawGuide;
    const groupName = guide.parentGroup || 'General';
    const groupId = groupIdByName.get(groupName);

    if (!groupId) {
      throw new Error(`Group ID not found for ${groupName}`);
    }

    const currentOrder = guideCounterByGroup.get(groupName) ?? 0;
    guideCounterByGroup.set(groupName, currentOrder + 1);

    const slug = normalizeSlug(guide.id || guide.title);
    const language = guide.language === 'ur' ? 'ur' : 'en';

    if (dryRun) {
      console.log(`[DRY RUN] upsert guide ${guide.title} (${slug}) in ${groupName}`);
      continue;
    }

    const { data: guideRow, error: guideError } = await supabase
      .from('howto_guides')
      .upsert(
        {
          group_id: groupId,
          slug,
          title: guide.title,
          subtitle: guide.subtitle || null,
          intro: guide.intro || null,
          notes: guide.notes ?? [],
          language,
          icon: guide.icon || 'menu-book',
          color: guide.color || '#2e7d32',
          display_order: currentOrder,
          is_active: true,
        },
        { onConflict: 'slug' },
      )
      .select('id,slug,title')
      .single<GuideRow>();

    if (guideError || !guideRow) {
      throw new Error(`Failed to upsert guide ${guide.title}: ${guideError?.message ?? 'Unknown error'}`);
    }

    const { data: existingSections, error: existingSectionsError } = await supabase
      .from('howto_sections')
      .select('id')
      .eq('guide_id', guideRow.id);

    if (existingSectionsError) {
      throw new Error(`Failed to fetch existing sections for ${guide.title}: ${existingSectionsError.message}`);
    }

    const existingSectionIds = (existingSections ?? []).map((section) => section.id as string);
    if (existingSectionIds.length > 0) {
      const { data: existingSteps, error: existingStepsError } = await supabase
        .from('howto_steps')
        .select('id')
        .in('section_id', existingSectionIds);

      if (existingStepsError) {
        throw new Error(`Failed to fetch existing steps for ${guide.title}: ${existingStepsError.message}`);
      }

      const existingStepIds = (existingSteps ?? []).map((step) => step.id as string);
      if (existingStepIds.length > 0) {
        const { error: deleteBlocksError } = await supabase.from('howto_step_blocks').delete().in('step_id', existingStepIds);
        if (deleteBlocksError) throw new Error(`Failed to delete old blocks for ${guide.title}: ${deleteBlocksError.message}`);

        const { error: deleteImagesError } = await supabase.from('howto_step_images').delete().in('step_id', existingStepIds);
        if (deleteImagesError) throw new Error(`Failed to delete old images for ${guide.title}: ${deleteImagesError.message}`);

        const { error: deleteStepsError } = await supabase.from('howto_steps').delete().in('id', existingStepIds);
        if (deleteStepsError) throw new Error(`Failed to delete old steps for ${guide.title}: ${deleteStepsError.message}`);
      }

      const { error: deleteSectionsError } = await supabase.from('howto_sections').delete().in('id', existingSectionIds);
      if (deleteSectionsError) throw new Error(`Failed to delete old sections for ${guide.title}: ${deleteSectionsError.message}`);
    }

    for (let sectionIndex = 0; sectionIndex < guide.sections.length; sectionIndex += 1) {
      const section = guide.sections[sectionIndex];
      const { data: sectionRow, error: sectionError } = await supabase
        .from('howto_sections')
        .insert({
          guide_id: guideRow.id,
          heading: section.heading,
          section_order: sectionIndex,
        })
        .select('id')
        .single<{ id: string }>();

      if (sectionError || !sectionRow) {
        throw new Error(`Failed to insert section ${section.heading} for ${guide.title}: ${sectionError?.message ?? 'Unknown error'}`);
      }

      for (let stepIndex = 0; stepIndex < section.steps.length; stepIndex += 1) {
        const step = section.steps[stepIndex];
        const { data: stepRow, error: stepError } = await supabase
          .from('howto_steps')
          .insert({
            section_id: sectionRow.id,
            step_order: stepIndex,
            title: step.title,
            detail: step.detail || null,
            note: step.note || null,
            rich_content_html: null,
          })
          .select('id')
          .single<{ id: string }>();

        if (stepError || !stepRow) {
          throw new Error(`Failed to insert step ${step.title} for ${guide.title}: ${stepError?.message ?? 'Unknown error'}`);
        }

        const blocks = (step.blocks ?? []).map(toDbBlock);
        if (blocks.length > 0) {
          const { error: blocksError } = await supabase
            .from('howto_step_blocks')
            .insert(blocks.map((block, blockIndex) => ({
              step_id: stepRow.id,
              block_order: blockIndex,
              kind: block.kind,
              payload: block.payload,
            })));

          if (blocksError) {
            throw new Error(`Failed to insert blocks for step ${step.title} (${guide.title}): ${blocksError.message}`);
          }
        }

        const images = (step.images ?? []) as HowToStep['images'];
        if (images && images.length > 0) {
          const { error: imagesError } = await supabase
            .from('howto_step_images')
            .insert(images.map((image, imageIndex) => ({
              step_id: stepRow.id,
              display_order: imageIndex,
              image_url: image.uri,
              thumb_url: null,
              caption: image.caption || null,
              source: image.source || null,
            })));

          if (imagesError) {
            throw new Error(`Failed to insert images for step ${step.title} (${guide.title}): ${imagesError.message}`);
          }
        }
      }
    }

    console.log(`Migrated guide: ${guide.title}`);
  }

  console.log('How-To hardcoded migration completed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

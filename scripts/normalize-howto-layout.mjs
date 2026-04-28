import { createClient } from '@supabase/supabase-js';

const GUIDANCE_PREFIX_REGEX = /^(Note|Tip|Important|Reminder|Safety|Warning|Hanafi note|Fasting note|Key reminder)\s*:\s*/i;

function variantFor(rawLabel) {
  const lower = String(rawLabel || '').toLowerCase();
  if (lower.startsWith('hanafi')) return 'hanafi';
  if (lower.startsWith('fasting')) return 'fasting';
  if (lower.startsWith('key')) return 'key';
  if (lower === 'warning') return 'warning';
  if (lower === 'safety') return 'safety';
  if (lower === 'important') return 'important';
  if (lower === 'reminder') return 'reminder';
  if (lower === 'tip') return 'tip';
  return 'note';
}

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const dryRun = !apply;

  const guideIdArg = argv.find((arg) => arg.startsWith('--guide-id='));
  const guideId = guideIdArg ? guideIdArg.split('=')[1]?.trim() : '';

  const languageArg = argv.find((arg) => arg.startsWith('--language='));
  const language = languageArg ? languageArg.split('=')[1]?.trim() : '';

  return {
    apply,
    dryRun,
    guideId: guideId || null,
    language: language || null,
  };
}

function assertEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function fetchStepsBySectionIds(supabase, sectionIds) {
  const rows = [];

  for (const sectionIdChunk of chunkArray(sectionIds, 200)) {
    const { data, error } = await supabase
      .from('howto_steps')
      .select('id,section_id,step_order,title,detail,note')
      .in('section_id', sectionIdChunk)
      .order('step_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to load steps: ${error.message}`);
    }

    rows.push(...(data ?? []));
  }

  rows.sort((left, right) => {
    const sectionDiff = String(left.section_id).localeCompare(String(right.section_id));
    if (sectionDiff !== 0) return sectionDiff;
    return (left.step_order ?? 0) - (right.step_order ?? 0);
  });

  return rows;
}

async function fetchBlocksByStepIds(supabase, stepIds) {
  const rows = [];

  for (const stepIdChunk of chunkArray(stepIds, 200)) {
    const { data, error } = await supabase
      .from('howto_step_blocks')
      .select('id,step_id,block_order,kind,payload')
      .in('step_id', stepIdChunk)
      .order('block_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to load existing blocks: ${error.message}`);
    }

    rows.push(...(data ?? []));
  }

  return rows;
}

function splitLines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseLegacyDetailToBlocks(detail) {
  const blocks = [];
  const normalized = String(detail || '').replace(/\r/g, '');
  const pieces = normalized.split(/```([\s\S]*?)```/g);

  pieces.forEach((piece, index) => {
    const isFenced = index % 2 === 1;
    const text = piece.trim();
    if (!text) return;

    if (isFenced) {
      const arabic = splitLines(text);
      if (arabic.length > 0) {
        blocks.push({ kind: 'recitation', payload: { arabic } });
      }
      return;
    }

    const guidanceMatch = text.match(GUIDANCE_PREFIX_REGEX);
    if (guidanceMatch && !/\n\s*\n/.test(text)) {
      const label = guidanceMatch[1];
      const body = text.slice(guidanceMatch[0].length).trim();
      if (body) {
        blocks.push({
          kind: 'note',
          payload: { variant: variantFor(label), text: body },
        });
        return;
      }
    }

    const paragraphs = text.split(/\n\s*\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
    paragraphs.forEach((paragraph) => {
      const paragraphMatch = paragraph.match(GUIDANCE_PREFIX_REGEX);
      if (paragraphMatch) {
        const label = paragraphMatch[1];
        const body = paragraph.slice(paragraphMatch[0].length).trim();
        if (body) {
          blocks.push({ kind: 'note', payload: { variant: variantFor(label), text: body } });
          return;
        }
      }

      blocks.push({ kind: 'text', payload: { text: paragraph } });
    });
  });

  return blocks;
}

function looksLikeLegacyMergedTitle(stepTitle, existingBlockCount) {
  const title = String(stepTitle || '').trim();
  if (existingBlockCount > 0) return false;
  if (title.length < 100) return false;
  if (!title.includes(' - ')) return false;

  const parts = title.split(' - ').map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length < 2) return false;

  const tail = parts.slice(1).join(' - ').trim();
  return tail.split(/\s+/).length >= 8;
}

function normalizeStep(stepRow, existingBlocks) {
  const reasons = [];

  const originalTitle = String(stepRow.title || '').trim();
  let title = originalTitle || `Step ${(stepRow.step_order ?? 0) + 1}`;

  const detailRaw = typeof stepRow.detail === 'string' ? stepRow.detail : '';
  const noteRaw = typeof stepRow.note === 'string' ? stepRow.note : '';
  const detail = detailRaw.trim();
  const note = noteRaw.trim();

  const mergedBlocks = existingBlocks
    .sort((a, b) => (a.block_order ?? 0) - (b.block_order ?? 0))
    .map((block) => ({ kind: block.kind, payload: block.payload ?? {} }));

  if (looksLikeLegacyMergedTitle(title, mergedBlocks.length)) {
    const parts = title.split(' - ').map((part) => part.trim()).filter((part) => part.length > 0);
    const recoveredTitle = parts[0] || title;
    const recoveredBody = parts.slice(1).join(' - ').trim();
    if (recoveredBody) {
      title = recoveredTitle;
      mergedBlocks.push({ kind: 'text', payload: { text: recoveredBody } });
      reasons.push('repaired-merged-title');
    }
  }

  if (detail) {
    const parsedDetailBlocks = parseLegacyDetailToBlocks(detail);
    parsedDetailBlocks.forEach((block) => mergedBlocks.push(block));
    reasons.push('converted-detail-to-blocks');
  }

  if (note) {
    mergedBlocks.push({
      kind: 'note',
      payload: {
        variant: 'note',
        text: note,
      },
    });
    reasons.push('converted-note-to-note-block');
  }

  const normalizedBlocks = mergedBlocks.map((block, index) => ({
    block_order: index,
    kind: block.kind,
    payload: block.payload,
  }));

  const shouldClearLegacyColumns = stepRow.detail !== null || stepRow.note !== null;
  const changed = reasons.length > 0
    || shouldClearLegacyColumns
    || title !== String(stepRow.title || '').trim();

  return {
    changed,
    reasons,
    title,
    detail: null,
    note: null,
    blocks: normalizedBlocks,
  };
}

async function main() {
  const { dryRun, guideId, language } = parseArgs(process.argv.slice(2));

  const supabaseUrl = assertEnv('SUPABASE_URL');
  const serviceRoleKey = assertEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let guidesQuery = supabase
    .from('howto_guides')
    .select('id,title,language')
    .order('title', { ascending: true });

  if (guideId) {
    guidesQuery = guidesQuery.eq('id', guideId);
  }

  if (language) {
    guidesQuery = guidesQuery.eq('language', language);
  }

  const { data: guides, error: guidesError } = await guidesQuery;
  if (guidesError) {
    throw new Error(`Failed to load guides: ${guidesError.message}`);
  }

  if (!guides || guides.length === 0) {
    console.log('No matching guides found.');
    return;
  }

  const guideIds = guides.map((guide) => String(guide.id));

  const { data: sections, error: sectionsError } = await supabase
    .from('howto_sections')
    .select('id,guide_id,section_order')
    .in('guide_id', guideIds);

  if (sectionsError) {
    throw new Error(`Failed to load sections: ${sectionsError.message}`);
  }

  const sectionIds = (sections ?? []).map((section) => String(section.id));

  if (sectionIds.length === 0) {
    console.log('No sections found for matching guides.');
    return;
  }

  const steps = await fetchStepsBySectionIds(supabase, sectionIds);

  const stepIds = (steps ?? []).map((step) => String(step.id));

  const blocks = stepIds.length > 0 ? await fetchBlocksByStepIds(supabase, stepIds) : [];

  const sectionsById = new Map((sections ?? []).map((section) => [String(section.id), section]));
  const guideById = new Map(guides.map((guide) => [String(guide.id), guide]));

  const blocksByStepId = new Map();
  (blocks ?? []).forEach((block) => {
    const stepId = String(block.step_id);
    const list = blocksByStepId.get(stepId) ?? [];
    list.push(block);
    blocksByStepId.set(stepId, list);
  });

  const changedSteps = [];
  const affectedGuideIds = new Set();

  (steps ?? []).forEach((step) => {
    const section = sectionsById.get(String(step.section_id));
    if (!section) return;
    const guide = guideById.get(String(section.guide_id));
    if (!guide) return;

    const stepBlocks = blocksByStepId.get(String(step.id)) ?? [];
    const normalized = normalizeStep(step, stepBlocks);
    if (!normalized.changed) return;

    changedSteps.push({
      step,
      guide,
      normalized,
    });
    affectedGuideIds.add(String(guide.id));
  });

  console.log(`Matched guides: ${guides.length}`);
  console.log(`Matched steps: ${(steps ?? []).length}`);
  console.log(`Steps requiring normalization: ${changedSteps.length}`);
  console.log(`Guides affected: ${affectedGuideIds.size}`);

  if (changedSteps.length === 0) {
    console.log('Everything is already normalized.');
    return;
  }

  const preview = changedSteps.slice(0, 20).map(({ step, guide, normalized }) => ({
    guide: guide.title,
    stepId: step.id,
    fromTitle: step.title,
    toTitle: normalized.title,
    reasons: normalized.reasons.join(','),
    newBlocks: normalized.blocks.length,
  }));

  console.table(preview);

  if (dryRun) {
    console.log('Dry run complete. Re-run with --apply to persist changes.');
    return;
  }

  for (const { step, normalized } of changedSteps) {
    const { error: stepUpdateError } = await supabase
      .from('howto_steps')
      .update({
        title: normalized.title,
        detail: normalized.detail,
        note: normalized.note,
      })
      .eq('id', step.id);

    if (stepUpdateError) {
      throw new Error(`Failed updating step ${step.id}: ${stepUpdateError.message}`);
    }

    const { error: deleteBlocksError } = await supabase
      .from('howto_step_blocks')
      .delete()
      .eq('step_id', step.id);

    if (deleteBlocksError) {
      throw new Error(`Failed deleting existing blocks for step ${step.id}: ${deleteBlocksError.message}`);
    }

    if (normalized.blocks.length > 0) {
      const rows = normalized.blocks.map((block) => ({
        step_id: step.id,
        block_order: block.block_order,
        kind: block.kind,
        payload: block.payload,
      }));

      const { error: insertBlocksError } = await supabase
        .from('howto_step_blocks')
        .insert(rows);

      if (insertBlocksError) {
        throw new Error(`Failed inserting normalized blocks for step ${step.id}: ${insertBlocksError.message}`);
      }
    }
  }

  console.log(`Applied normalization to ${changedSteps.length} steps.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

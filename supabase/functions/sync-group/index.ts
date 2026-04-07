import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? 'https://lhaqqqatdztuijgdfdcf.supabase.co',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

/**
 * PATCH all adhkar entries in a group with any given fields.
 */
async function cascadeFieldsToEntries(
  groupName: string,
  fields: Record<string, unknown>,
): Promise<number> {
  const supabase = getSupabase();
  console.log(`[sync-group] Cascading fields to entries in "${groupName}":`, JSON.stringify(fields));

  const { data, error } = await supabase
    .from('adhkar')
    .update(fields)
    .eq('group_name', groupName)
    .select('id');

  if (error) throw new Error(`Field cascade failed: ${error.message}`);
  console.log(`[sync-group] Field cascade: updated ${data?.length ?? 0} entries`);
  return data?.length ?? 0;
}

/**
 * Cascade-rename: update group_name (and optionally prayer_time + description)
 * on all adhkar entries that currently belong to oldGroupName.
 */
async function cascadeAdhkarEntries(
  oldGroupName: string,
  newGroupName: string,
  newPrayerTime?: string,
  newDescription?: string | null,
): Promise<number> {
  const patch: Record<string, unknown> = { group_name: newGroupName };
  if (newPrayerTime) patch.prayer_time = newPrayerTime;
  if (newDescription !== undefined) patch.description = newDescription;

  const supabase = getSupabase();
  console.log(`[sync-group] Cascading adhkar entries: "${oldGroupName}" → "${newGroupName}"`, JSON.stringify(patch));

  const { data, error } = await supabase
    .from('adhkar')
    .update(patch)
    .eq('group_name', oldGroupName)
    .select('id');

  if (error) throw new Error(`Cascade adhkar update failed: ${error.message}`);
  console.log(`[sync-group] Cascade rename: updated ${data?.length ?? 0} entries`);
  return data?.length ?? 0;
}

/**
 * Seed descriptions for a list of groups.
 * Only sets description if the entries currently have no description (null/empty).
 */
async function seedGroupDescription(
  groupName: string,
  description: string,
  overwrite = false,
): Promise<{ group: string; cascaded: number; skipped: boolean }> {
  const supabase = getSupabase();

  if (!overwrite) {
    const { data: rows } = await supabase
      .from('adhkar')
      .select('description')
      .eq('group_name', groupName)
      .limit(1);

    if (rows && rows.length > 0 && rows[0].description) {
      console.log(`[sync-group] Skipping "${groupName}" — description already set: "${String(rows[0].description).slice(0, 60)}"`);
      return { group: groupName, cascaded: 0, skipped: true };
    }
  }

  const cascaded = await cascadeFieldsToEntries(groupName, { description });
  return { group: groupName, cascaded, skipped: false };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json() as {
      groupName?: string;
      payload?: Record<string, unknown>;
      oldGroupName?: string;
      newPrayerTime?: string;
      descriptionOnly?: boolean;
      seedDescriptions?: Array<{ groupName: string; description: string; overwrite?: boolean }>;
    };

    const { groupName, payload = {}, oldGroupName, newPrayerTime, descriptionOnly, seedDescriptions } = body;

    // ── Bulk seed mode ────────────────────────────────────────────────────────
    if (seedDescriptions && Array.isArray(seedDescriptions)) {
      const results = await Promise.all(
        seedDescriptions.map(({ groupName: gn, description, overwrite }) =>
          seedGroupDescription(gn, description, overwrite ?? false)
        )
      );
      console.log('[sync-group] Seed results:', JSON.stringify(results));
      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!groupName) {
      return new Response(JSON.stringify({ error: 'groupName is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Record<string, unknown> = {};

    // ── 1. Description-only sync ──────────────────────────────────────────────
    if (descriptionOnly) {
      const description = payload.description !== undefined ? payload.description as string | null : null;
      try {
        const count = await cascadeFieldsToEntries(groupName, { description });
        results.descriptionCascaded = count;
        console.log(`[sync-group] Cascaded description to ${count} entries in "${groupName}"`);
      } catch (err) {
        results.descriptionError = String(err);
        console.error('[sync-group] Description cascade error (non-fatal):', err);
      }
      return new Response(JSON.stringify({ ok: true, ...results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Cascade rename (+ optional prayer_time + description) ─────────────
    if (oldGroupName && oldGroupName !== groupName) {
      try {
        const descPayload = payload.description !== undefined ? payload.description as string | null : undefined;
        const count = await cascadeAdhkarEntries(oldGroupName, groupName, newPrayerTime, descPayload);
        results.cascadedEntries = count;
        console.log(`[sync-group] Cascaded ${count} adhkar entries: "${oldGroupName}" → "${groupName}"`);
      } catch (cascadeErr) {
        results.cascadeError = String(cascadeErr);
        console.error('[sync-group] Cascade error (non-fatal):', cascadeErr);
      }
      return new Response(JSON.stringify({ ok: true, ...results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. No rename — cascade field changes to entries ───────────────────────
    const entryPatch: Record<string, unknown> = {};
    if (payload.description !== undefined) entryPatch.description = payload.description;
    if (newPrayerTime) entryPatch.prayer_time = newPrayerTime;

    if (Object.keys(entryPatch).length > 0) {
      try {
        const count = await cascadeFieldsToEntries(groupName, entryPatch);
        results.entriesPatched = count;
        console.log(`[sync-group] Patched ${count} entries in "${groupName}" with:`, JSON.stringify(entryPatch));
      } catch (patchErr) {
        results.entryPatchError = String(patchErr);
        console.error('[sync-group] Entry patch error (non-fatal):', patchErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-group] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

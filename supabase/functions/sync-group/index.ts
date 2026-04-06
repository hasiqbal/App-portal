import { corsHeaders } from '../_shared/cors.ts';

const EXT_BASE = 'https://ucpmwygyuvbfehjpucpm.backend.onspace.ai/rest/v1';
const EXT_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjcG13eWd5dXZiZmVoanB1Y3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDgxMTksImV4cCI6MjA1OTQyNDExOX0.i8tlNr0s9g7D7VhWKUFxXBwU_YhWEarUOBsmCIi-lEA';

const WRITE_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': EXT_KEY,
  'Prefer': 'return=representation',
};

/**
 * PATCH all adhkar entries in a group with any given fields.
 * Used to cascade description, prayer_time, or any combination to individual entries.
 */
async function cascadeFieldsToEntries(
  groupName: string,
  fields: Record<string, unknown>,
): Promise<number> {
  const url = `${EXT_BASE}/adhkar?group_name=eq.${encodeURIComponent(groupName)}`;
  console.log(`[sync-group] Cascading fields to entries in "${groupName}":`, JSON.stringify(fields));

  const res = await fetch(url, {
    method: 'PATCH',
    headers: WRITE_HEADERS,
    body: JSON.stringify(fields),
  });

  const body = await res.text();
  console.log(`[sync-group] Field cascade response: ${res.status} — ${body.slice(0, 300)}`);

  if (!res.ok) {
    throw new Error(`Field cascade failed: ${res.status} — ${body}`);
  }

  let rows: unknown[] = [];
  try { rows = JSON.parse(body); } catch { /* ignore */ }
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * Cascade-rename: update group_name (and optionally prayer_time + description) on all
 * adhkar entries that currently belong to oldGroupName.
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

  const url = `${EXT_BASE}/adhkar?group_name=eq.${encodeURIComponent(oldGroupName)}`;
  console.log(`[sync-group] Cascading adhkar entries: "${oldGroupName}" → "${newGroupName}"`, JSON.stringify(patch));

  const res = await fetch(url, { method: 'PATCH', headers: WRITE_HEADERS, body: JSON.stringify(patch) });
  const body = await res.text();
  console.log(`[sync-group] Cascade rename response: ${res.status} — ${body.slice(0, 200)}`);

  if (!res.ok) {
    throw new Error(`Cascade adhkar update failed: ${res.status} — ${body}`);
  }

  let rows: unknown[] = [];
  try { rows = JSON.parse(body); } catch { /* ignore */ }
  return Array.isArray(rows) ? rows.length : 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json() as {
      groupName: string;
      payload?: Record<string, unknown>;
      oldGroupName?: string;     // present when renaming
      newPrayerTime?: string;    // present when prayer time changed
      descriptionOnly?: boolean; // true = only cascade description to adhkar entries
    };

    const { groupName, payload = {}, oldGroupName, newPrayerTime, descriptionOnly } = body;

    if (!groupName) {
      return new Response(JSON.stringify({ error: 'groupName is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Record<string, unknown> = {};

    // ── 1. Description-only sync: cascade description field to all adhkar entries ─
    // The external adhkar_groups table is empty — the app reads description
    // from individual adhkar entries, so we must cascade it there.
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

    // ── 2. Cascade rename (+ optional prayer_time + description) ─────────────────
    // When the group is renamed, update group_name on all matching adhkar entries.
    // Also cascade prayer_time and description in the same PATCH if provided.
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
      // If rename was done, entries already got the new prayer_time — skip step 3.
      return new Response(JSON.stringify({ ok: true, ...results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. No rename — cascade individual field changes to entries ────────────────
    // Handles cases like: only prayer_time changed, only description changed,
    // or both changed together (without a group name change).
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

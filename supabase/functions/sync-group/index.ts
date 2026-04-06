import { corsHeaders } from '../_shared/cors.ts';

const EXT_BASE = 'https://ucpmwygyuvbfehjpucpm.backend.onspace.ai/rest/v1';
const EXT_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjcG13eWd5dXZiZmVoanB1Y3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDgxMTksImV4cCI6MjA1OTQyNDExOX0.i8tlNr0s9g7D7VhWKUFxXBwU_YhWEarUOBsmCIi-lEA';

const WRITE_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': EXT_KEY,
  'Prefer': 'return=representation',
};

const READ_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': EXT_KEY,
};

// Columns we attempt to sync to the external adhkar_groups table.
// We probe progressively — if the external backend rejects a column, we skip it and retry.
const SAFE_GROUP_COLS = ['name', 'description', 'prayer_time', 'icon', 'icon_color', 'icon_bg_color', 'badge_text', 'badge_color', 'display_order'];

/** Extract an unknown column name from a PostgREST error response body. */
function extractUnknownColumn(body: string): string | null {
  const match = body.match(/Could not find the "([^"]+)" column/);
  return match ? match[1] : null;
}

/**
 * PATCH adhkar_groups by name, retrying with fewer columns on unknown-column errors.
 * Returns null if the row was not found on the external backend (so caller can skip quietly).
 */
async function safePatchGroup(
  groupName: string,
  payload: Record<string, unknown>,
): Promise<{ rows: unknown[]; skipped: string[]; notFound: boolean }> {
  const skipped: string[] = [];

  for (let attempt = 0; attempt < 10; attempt++) {
    // Only include known-safe columns that haven't been skipped
    const safe: Record<string, unknown> = {};
    for (const col of SAFE_GROUP_COLS) {
      if (col in payload && !skipped.includes(col)) safe[col] = payload[col];
    }
    if (Object.keys(safe).length === 0) {
      console.log('[sync-group] No safe columns left to PATCH — skipping group metadata sync.');
      return { rows: [], skipped, notFound: false };
    }

    const url = `${EXT_BASE}/adhkar_groups?name=eq.${encodeURIComponent(groupName)}`;
    console.log(`[sync-group] PATCH attempt ${attempt + 1}: ${url} — fields: ${Object.keys(safe).join(', ')}`);

    const res = await fetch(url, { method: 'PATCH', headers: WRITE_HEADERS, body: JSON.stringify(safe) });
    const body = await res.text();
    console.log(`[sync-group] PATCH response: ${res.status} — ${body.slice(0, 300)}`);

    if (res.ok) {
      let rows: unknown[] = [];
      try { rows = JSON.parse(body); } catch { /* ignore */ }
      // PostgREST returns [] when no row matched the filter
      if (Array.isArray(rows) && rows.length === 0) {
        console.log(`[sync-group] No row with name="${groupName}" on external backend — skipping insert.`);
        return { rows: [], skipped, notFound: true };
      }
      return { rows, skipped, notFound: false };
    }

    const unknownCol = extractUnknownColumn(body);
    if (unknownCol) {
      console.log(`[sync-group] Column "${unknownCol}" not found on external backend — skipping it.`);
      skipped.push(unknownCol);
      continue;
    }

    // Hard fail for non-column errors
    throw new Error(`PATCH adhkar_groups failed: ${res.status} — ${body}`);
  }

  throw new Error('Too many retries on safePatchGroup');
}

/**
 * Cascade-rename: update group_name (and optionally prayer_time) on all
 * adhkar entries that currently belong to oldGroupName.
 */
async function cascadeAdhkarEntries(
  oldGroupName: string,
  newGroupName: string,
  newPrayerTime?: string,
): Promise<number> {
  const patch: Record<string, string> = { group_name: newGroupName };
  if (newPrayerTime) patch.prayer_time = newPrayerTime;

  const url = `${EXT_BASE}/adhkar?group_name=eq.${encodeURIComponent(oldGroupName)}`;
  console.log(`[sync-group] Cascading adhkar entries: "${oldGroupName}" → "${newGroupName}"`);

  const res = await fetch(url, { method: 'PATCH', headers: WRITE_HEADERS, body: JSON.stringify(patch) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cascade adhkar update failed: ${res.status} — ${body}`);
  }

  const rows = await res.json();
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
    };

    const { groupName, payload = {}, oldGroupName, newPrayerTime } = body;

    if (!groupName) {
      return new Response(JSON.stringify({ error: 'groupName is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Record<string, unknown> = {};

    // ── 1. Cascade rename: update group_name on adhkar entries ───────────
    if (oldGroupName && oldGroupName !== groupName) {
      try {
        const count = await cascadeAdhkarEntries(oldGroupName, groupName, newPrayerTime);
        results.cascadedEntries = count;
        console.log(`[sync-group] Cascaded ${count} adhkar entries: "${oldGroupName}" → "${groupName}"`);
      } catch (cascadeErr) {
        results.cascadeError = String(cascadeErr);
        console.error('[sync-group] Cascade error (non-fatal):', cascadeErr);
      }
    }

    // ── 2. Sync group metadata via PATCH only (no INSERT) ─────────────────
    // We never INSERT into the external adhkar_groups table because:
    //   a) It may have NOT NULL constraints we can't satisfy (e.g. id)
    //   b) Groups are managed by the app developer — we only update existing rows
    if (Object.keys(payload).length > 0) {
      try {
        const { rows, skipped, notFound } = await safePatchGroup(groupName, payload);
        results.groupRows = rows;
        if (skipped.length > 0) results.skippedColumns = skipped;
        if (notFound) {
          results.notFound = true;
          console.log(`[sync-group] Group "${groupName}" not in external backend — skipped metadata sync.`);
        } else {
          console.log(`[sync-group] Patched group "${groupName}" on external backend. Skipped cols: ${skipped.join(', ') || 'none'}`);
        }
      } catch (patchErr) {
        // Non-fatal: log and return partial success
        results.patchError = String(patchErr);
        console.error('[sync-group] Patch error (non-fatal):', patchErr);
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

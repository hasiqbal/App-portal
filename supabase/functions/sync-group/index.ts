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

// Known safe columns on the external adhkar_groups table.
// We try progressively smaller payloads if we get a "column not found" error.
const SAFE_GROUP_COLS = ['name', 'description', 'prayer_time', 'icon', 'icon_color', 'icon_bg_color', 'badge_text', 'badge_color', 'display_order'];

/** Strip unknown columns from an error response body. */
function extractUnknownColumn(body: string): string | null {
  // PostgREST: 'Could not find the "foo" column of "adhkar_groups" in the schema cache'
  const match = body.match(/Could not find the "([^"]+)" column/);
  return match ? match[1] : null;
}

/**
 * PATCH adhkar_groups, retrying with progressively fewer columns
 * if the external backend reports unknown columns.
 */
async function safePatchGroup(
  url: string,
  payload: Record<string, unknown>,
): Promise<{ rows: unknown[]; skipped: string[] }> {
  const skipped: string[] = [];
  let current = { ...payload };

  for (let attempt = 0; attempt < 10; attempt++) {
    // Only include known-safe columns
    const safe: Record<string, unknown> = {};
    for (const col of SAFE_GROUP_COLS) {
      if (col in current && !skipped.includes(col)) safe[col] = current[col];
    }
    if (Object.keys(safe).length === 0) {
      console.log('[sync-group] No safe columns left to send.');
      return { rows: [], skipped };
    }

    const res = await fetch(url, { method: 'PATCH', headers: WRITE_HEADERS, body: JSON.stringify(safe) });
    const body = await res.text();

    if (res.ok) {
      let rows: unknown[] = [];
      try { rows = JSON.parse(body); } catch { /* ignore */ }
      return { rows, skipped };
    }

    const unknownCol = extractUnknownColumn(body);
    if (unknownCol) {
      console.log(`[sync-group] Column "${unknownCol}" not found on external backend — skipping.`);
      skipped.push(unknownCol);
      continue;
    }

    // Non-column error — hard fail
    throw new Error(`PATCH failed: ${res.status} — ${body}`);
  }

  throw new Error('Too many retries on safePatchGroup');
}

/**
 * POST new group row, retrying with fewer columns on unknown-column errors.
 */
async function safePatchInsertGroup(
  payload: Record<string, unknown>,
): Promise<{ rows: unknown[]; skipped: string[] }> {
  const skipped: string[] = [];
  let current = { ...payload };

  for (let attempt = 0; attempt < 10; attempt++) {
    const safe: Record<string, unknown> = {};
    for (const col of SAFE_GROUP_COLS) {
      if (col in current && !skipped.includes(col)) safe[col] = current[col];
    }

    const res = await fetch(`${EXT_BASE}/adhkar_groups`, {
      method: 'POST',
      headers: WRITE_HEADERS,
      body: JSON.stringify(safe),
    });
    const body = await res.text();

    if (res.ok) {
      let rows: unknown[] = [];
      try { rows = JSON.parse(body); } catch { /* ignore */ }
      return { rows, skipped };
    }

    const unknownCol = extractUnknownColumn(body);
    if (unknownCol) {
      console.log(`[sync-group] Insert: column "${unknownCol}" not found — skipping.`);
      skipped.push(unknownCol);
      continue;
    }

    throw new Error(`INSERT failed: ${res.status} — ${body}`);
  }

  throw new Error('Too many retries on safePatchInsertGroup');
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

  const res = await fetch(
    `${EXT_BASE}/adhkar?group_name=eq.${encodeURIComponent(oldGroupName)}`,
    { method: 'PATCH', headers: WRITE_HEADERS, body: JSON.stringify(patch) },
  );

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

    // ── 1. Cascade rename adhkar entries if the name changed ──────────────
    if (oldGroupName && oldGroupName !== groupName) {
      try {
        const count = await cascadeAdhkarEntries(oldGroupName, groupName, newPrayerTime);
        results.cascadedEntries = count;
        console.log(`[sync-group] Cascaded ${count} adhkar entries: "${oldGroupName}" → "${groupName}"`);
      } catch (cascadeErr) {
        // Log but don't fail — group metadata sync continues
        results.cascadeError = String(cascadeErr);
        console.error('[sync-group] Cascade error (non-fatal):', cascadeErr);
      }
    }

    // ── 2. Sync group metadata ────────────────────────────────────────────
    if (Object.keys(payload).length > 0) {
      // Check if a row with this name already exists
      const checkRes = await fetch(
        `${EXT_BASE}/adhkar_groups?name=eq.${encodeURIComponent(groupName)}&select=name`,
        { headers: READ_HEADERS },
      );
      let exists = false;
      if (checkRes.ok) {
        const rows = await checkRes.json() as unknown[];
        exists = Array.isArray(rows) && rows.length > 0;
      }

      if (exists) {
        // PATCH existing row
        const { rows, skipped } = await safePatchGroup(
          `${EXT_BASE}/adhkar_groups?name=eq.${encodeURIComponent(groupName)}`,
          payload,
        );
        results.groupRows = rows;
        if (skipped.length > 0) results.skippedColumns = skipped;
        console.log(`[sync-group] Patched group "${groupName}". Skipped: ${skipped.join(', ') || 'none'}`);
      } else {
        // INSERT new row
        const { rows, skipped } = await safePatchInsertGroup({ ...payload, name: groupName });
        results.groupRows = rows;
        results.inserted = true;
        if (skipped.length > 0) results.skippedColumns = skipped;
        console.log(`[sync-group] Inserted group "${groupName}". Skipped: ${skipped.join(', ') || 'none'}`);
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

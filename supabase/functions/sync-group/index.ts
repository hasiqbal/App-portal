import { corsHeaders } from '../_shared/cors.ts';

const EXT_BASE = 'https://ucpmwygyuvbfehjpucpm.backend.onspace.ai/rest/v1';
const EXT_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjcG13eWd5dXZiZmVoanB1Y3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDgxMTksImV4cCI6MjA1OTQyNDExOX0.i8tlNr0s9g7D7VhWKUFxXBwU_YhWEarUOBsmCIi-lEA';

const EXT_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': EXT_KEY,
  'Prefer': 'return=representation',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { groupName, payload } = await req.json() as {
      groupName: string;
      payload: Record<string, unknown>;
    };

    if (!groupName) {
      return new Response(JSON.stringify({ error: 'groupName is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try PATCH first (update existing row)
    const patchRes = await fetch(
      `${EXT_BASE}/adhkar_groups?name=eq.${encodeURIComponent(groupName)}`,
      { method: 'PATCH', headers: EXT_HEADERS, body: JSON.stringify(payload) },
    );

    if (!patchRes.ok) {
      const body = await patchRes.text();
      // Column doesn't exist — retry without description
      if (body.includes('Could not find') && payload.description !== undefined) {
        const { description: _d, ...rest } = payload;
        const retryRes = await fetch(
          `${EXT_BASE}/adhkar_groups?name=eq.${encodeURIComponent(groupName)}`,
          { method: 'PATCH', headers: EXT_HEADERS, body: JSON.stringify(rest) },
        );
        if (!retryRes.ok) {
          const retryBody = await retryRes.text();
          throw new Error(`Patch retry failed: ${retryRes.status} — ${retryBody}`);
        }
        const retryRows = await retryRes.json();
        return new Response(JSON.stringify({ ok: true, rows: retryRows, note: 'description skipped' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Patch failed: ${patchRes.status} — ${body}`);
    }

    const rows = await patchRes.json();

    // No rows matched → INSERT new record
    if (Array.isArray(rows) && rows.length === 0) {
      const insertRes = await fetch(`${EXT_BASE}/adhkar_groups`, {
        method: 'POST',
        headers: EXT_HEADERS,
        body: JSON.stringify({ ...payload, name: groupName }),
      });
      if (!insertRes.ok) {
        const body = await insertRes.text();
        // Retry without description on insert too
        if (body.includes('Could not find') && payload.description !== undefined) {
          const { description: _d, ...rest } = payload;
          const retryInsert = await fetch(`${EXT_BASE}/adhkar_groups`, {
            method: 'POST',
            headers: EXT_HEADERS,
            body: JSON.stringify({ ...rest, name: groupName }),
          });
          if (!retryInsert.ok) throw new Error(`Insert retry failed: ${retryInsert.status}`);
          const retryRows = await retryInsert.json();
          return new Response(JSON.stringify({ ok: true, rows: retryRows, note: 'inserted, description skipped' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Insert failed: ${insertRes.status} — ${body}`);
      }
      const insertedRows = await insertRes.json();
      return new Response(JSON.stringify({ ok: true, rows: insertedRows, note: 'inserted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, rows }), {
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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SRC_BASE = 'https://ucpmwygyuvbfehjpucpm.backend.onspace.ai/rest/v1';
const SRC_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjcG13eWd5dXZiZmVoanB1Y3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDgxMTksImV4cCI6MjA1OTQyNDExOX0.i8tlNr0s9g7D7VhWKUFxXBwU_YhWEarUOBsmCIi-lEA';

const SRC_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SRC_KEY,
};

/** Fetch ALL rows from a source table (pagination-safe). */
async function fetchAll(table: string, select = '*', order = 'id.asc'): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  let offset = 0;
  const all: Record<string, unknown>[] = [];

  while (true) {
    const url = `${SRC_BASE}/${table}?select=${select}&order=${order}&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers: SRC_HEADERS });
    if (!res.ok) throw new Error(`fetchAll(${table}) failed: ${res.status} — ${await res.text()}`);
    const rows = await res.json() as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/** Insert rows into target Supabase in chunks to avoid payload limits. */
async function insertChunked(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: Record<string, unknown>[],
  chunkSize = 500,
): Promise<{ inserted: number; errors: string[] }> {
  let inserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error, count } = await supabase.from(table).upsert(chunk, { onConflict: 'id', count: 'exact' });
    if (error) {
      errors.push(`chunk ${i}–${i + chunk.length}: ${error.message}`);
      console.error(`[migrate] ${table} chunk error:`, error.message);
    } else {
      inserted += count ?? chunk.length;
    }
  }
  return { inserted, errors };
}

/** Create all target tables + RLS via raw SQL through the REST API. */
async function setupSchema(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const logs: string[] = [];

  // We use supabase.rpc to execute raw SQL only if a custom exec_sql function exists,
  // otherwise we rely on the tables already existing. Instead, we use
  // the Supabase Management API workaround: just attempt insert and report.
  // NOTE: Tables MUST be pre-created on the Supabase dashboard.
  // This function validates they exist.

  const tables = ['adhkar', 'prayer_times', 'announcements', 'sunnah_reminders'];
  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error) {
      logs.push(`❌ Table "${table}" not found: ${error.message}`);
    } else {
      logs.push(`✅ Table "${table}" exists`);
    }
  }
  return logs;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({})) as {
      tables?: string[];
      dryRun?: boolean;
      checkOnly?: boolean;
    };

    const targetTables = body.tables ?? ['adhkar', 'prayer_times', 'announcements', 'sunnah_reminders'];
    const dryRun = body.dryRun ?? false;
    const checkOnly = body.checkOnly ?? false;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? 'https://lhaqqqatdztuijgdfdcf.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Validate target tables exist
    const schemaLogs = await setupSchema(supabase);
    console.log('[migrate] Schema check:', schemaLogs);

    if (checkOnly) {
      return new Response(JSON.stringify({ ok: true, schemaCheck: schemaLogs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const report: Record<string, unknown> = { schemaCheck: schemaLogs };

    // ── adhkar ───────────────────────────────────────────────────────────────
    if (targetTables.includes('adhkar')) {
      console.log('[migrate] Fetching adhkar from source…');
      const rows = await fetchAll(
        'adhkar',
        'id,title,arabic_title,arabic,transliteration,translation,reference,count,prayer_time,group_name,group_order,display_order,is_active,description,file_url,created_at,updated_at',
        'display_order.asc,created_at.asc',
      );
      console.log(`[migrate] adhkar: ${rows.length} rows fetched`);

      if (!dryRun) {
        const result = await insertChunked(supabase, 'adhkar', rows);
        report.adhkar = { fetched: rows.length, ...result };
        console.log(`[migrate] adhkar done:`, result);
      } else {
        report.adhkar = { fetched: rows.length, dryRun: true };
      }
    }

    // ── prayer_times ─────────────────────────────────────────────────────────
    if (targetTables.includes('prayer_times')) {
      console.log('[migrate] Fetching prayer_times from source…');
      const rows = await fetchAll(
        'prayer_times',
        'id,month,day,date,fajr,fajr_jamat,sunrise,ishraq,zawaal,zuhr,zuhr_jamat,asr,asr_jamat,maghrib,maghrib_jamat,isha,isha_jamat,jumu_ah_1,jumu_ah_2,created_at,updated_at',
        'month.asc,day.asc',
      );
      console.log(`[migrate] prayer_times: ${rows.length} rows fetched`);

      if (!dryRun) {
        const result = await insertChunked(supabase, 'prayer_times', rows);
        report.prayer_times = { fetched: rows.length, ...result };
        console.log(`[migrate] prayer_times done:`, result);
      } else {
        report.prayer_times = { fetched: rows.length, dryRun: true };
      }
    }

    // ── announcements ────────────────────────────────────────────────────────
    if (targetTables.includes('announcements')) {
      console.log('[migrate] Fetching announcements from source…');
      const rows = await fetchAll(
        'announcements',
        'id,title,body,link_url,image_url,is_active,display_order,created_at,updated_at',
        'created_at.asc',
      );
      console.log(`[migrate] announcements: ${rows.length} rows fetched`);

      if (!dryRun) {
        const result = await insertChunked(supabase, 'announcements', rows);
        report.announcements = { fetched: rows.length, ...result };
        console.log(`[migrate] announcements done:`, result);
      } else {
        report.announcements = { fetched: rows.length, dryRun: true };
      }
    }

    // ── sunnah_reminders ─────────────────────────────────────────────────────
    if (targetTables.includes('sunnah_reminders')) {
      console.log('[migrate] Fetching sunnah_reminders from source…');
      const rows = await fetchAll(
        'sunnah_reminders',
        'id,title,arabic_title,arabic,transliteration,translation,description,reference,count,category,group_name,group_order,display_order,is_active,file_url,created_at,updated_at',
        'display_order.asc,created_at.asc',
      );
      console.log(`[migrate] sunnah_reminders: ${rows.length} rows fetched`);

      if (!dryRun) {
        const result = await insertChunked(supabase, 'sunnah_reminders', rows);
        report.sunnah_reminders = { fetched: rows.length, ...result };
        console.log(`[migrate] sunnah_reminders done:`, result);
      } else {
        report.sunnah_reminders = { fetched: rows.length, dryRun: true };
      }
    }

    return new Response(JSON.stringify({ ok: true, dryRun, ...report }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[migrate] Fatal error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

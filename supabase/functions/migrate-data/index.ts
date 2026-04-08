import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ─── Source: OnSpace Cloud (has all the data) ─────────────────────────────────
const SRC_BASE = 'https://erwtsmhykudttxbeerwt.backend.onspace.ai/rest/v1';
const SRC_KEY  =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyd3RzbWhva3VkdHR4YmVlcnd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDgxMTksImV4cCI6MjA1OTQyNDExOX0.sNXApMNqRjBbVDI-BOZ3kQZXCmpAkUWJqkIWB1FqvLc';

const SRC_HEADERS = {
  'Content-Type': 'application/json',
  apikey: SRC_KEY,
};

// ─── Table configs ────────────────────────────────────────────────────────────
const TABLE_CONFIGS: Record<string, { select: string; order: string; onConflict: string }> = {
  adhkar_groups: {
    select: 'id,name,prayer_time,icon,icon_color,icon_bg_color,badge_text,badge_color,description,display_order,created_at,updated_at',
    order: 'display_order.asc,name.asc',
    onConflict: 'id',
  },
  adhkar: {
    select: 'id,title,arabic_title,arabic,transliteration,translation,reference,count,prayer_time,group_name,group_order,display_order,is_active,description,file_url,created_at,updated_at',
    order: 'display_order.asc,created_at.asc',
    onConflict: 'id',
  },
  prayer_times: {
    select: 'id,month,day,date,fajr,fajr_jamat,sunrise,ishraq,zawaal,zuhr,zuhr_jamat,asr,asr_jamat,maghrib,maghrib_jamat,isha,isha_jamat,jumu_ah_1,jumu_ah_2,created_at,updated_at',
    order: 'month.asc,day.asc',
    onConflict: 'id',
  },
  announcements: {
    select: 'id,title,body,link_url,image_url,is_active,display_order,created_at,updated_at',
    order: 'created_at.asc',
    onConflict: 'id',
  },
  sunnah_groups: {
    select: 'id,name,category,icon,icon_color,icon_bg_color,badge_text,badge_color,description,display_order,created_at,updated_at',
    order: 'display_order.asc,name.asc',
    onConflict: 'id',
  },
  sunnah_reminders: {
    select: 'id,title,arabic_title,arabic,transliteration,translation,description,reference,count,category,group_name,group_order,display_order,is_active,file_url,created_at,updated_at',
    order: 'display_order.asc,created_at.asc',
    onConflict: 'id',
  },
};

const DEFAULT_TABLES = ['adhkar_groups', 'adhkar', 'prayer_times', 'announcements', 'sunnah_groups', 'sunnah_reminders'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch ALL rows from a source table with automatic pagination. */
async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const cfg  = TABLE_CONFIGS[table];
  let offset = 0;
  const all: Record<string, unknown>[] = [];

  while (true) {
    const url = `${SRC_BASE}/${table}?select=${cfg.select}&order=${cfg.order}&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers: SRC_HEADERS });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`fetchAll(${table}) HTTP ${res.status}: ${text}`);
    }
    const rows = (await res.json()) as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`[migrate] ${table}: fetched ${all.length} rows from source`);
  return all;
}

/** Upsert rows into the target Supabase in chunks. */
async function upsertChunked(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: Record<string, unknown>[],
  chunkSize = 500,
): Promise<{ upserted: number; errors: string[] }> {
  const cfg = TABLE_CONFIGS[table];
  let upserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: cfg.onConflict, count: 'exact' });

    if (error) {
      const msg = `${table} chunk ${i}–${i + chunk.length}: ${error.message}`;
      errors.push(msg);
      console.error(`[migrate] ${msg}`);
    } else {
      upserted += count ?? chunk.length;
    }
  }

  return { upserted, errors };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({})) as {
      tables?: string[];
      dryRun?: boolean;
    };

    const targetTables = body.tables ?? DEFAULT_TABLES;
    const dryRun       = body.dryRun ?? false;

    // Target = external Supabase (where the app now points)
    // Uses service role key so it bypasses RLS for bulk insert
    const supabase = createClient(
      'https://lhaqqqatdztuijgdfdcf.supabase.co',
      Deno.env.get('EXT_SUPABASE_SERVICE_ROLE_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU5OTExOSwiZXhwIjoyMDkxMTc1MTE5fQ.Dlt1Dkkh7WzUPLOVh1JgNU7h6u3m1PyttSlHuNxho4w',
    );

    console.log(`[migrate] Starting migration — tables: ${targetTables.join(', ')} | dryRun: ${dryRun}`);

    const report: Record<string, unknown> = { dryRun, tables: targetTables };

    for (const table of targetTables) {
      if (!TABLE_CONFIGS[table]) {
        report[table] = { error: `Unknown table "${table}"` };
        continue;
      }

      try {
        const rows = await fetchAll(table);

        if (dryRun) {
          report[table] = { fetched: rows.length, dryRun: true };
          continue;
        }

        if (rows.length === 0) {
          report[table] = { fetched: 0, upserted: 0, skipped: 'no source data' };
          continue;
        }

        const result = await upsertChunked(supabase, table, rows);
        report[table] = { fetched: rows.length, ...result };
        console.log(`[migrate] ${table} complete:`, result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        report[table] = { error: message };
        console.error(`[migrate] ${table} failed:`, message);
      }
    }

    console.log('[migrate] Migration complete:', JSON.stringify(report, null, 2));

    return new Response(JSON.stringify({ ok: true, ...report }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[migrate] Fatal error:', message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

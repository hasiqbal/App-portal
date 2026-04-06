import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const EXTERNAL_URL = 'https://ucpmwygyuvbfehjpucpm.backend.onspace.ai/rest/v1';
const EXTERNAL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjcG13eWd5dXZiZmVoanB1Y3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDgxMTksImV4cCI6MjA1OTQyNDExOX0.i8tlNr0s9g7D7VhWKUFxXBwU_YhWEarUOBsmCIi-lEA';

const readHeaders = { 'Content-Type': 'application/json', 'apikey': EXTERNAL_KEY };

async function fetchAll(table: string, select = '*'): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 500;
  while (true) {
    const res = await fetch(
      `${EXTERNAL_URL}/${table}?select=${select}&limit=${limit}&offset=${offset}`,
      { headers: { ...readHeaders, 'Range-Unit': 'items', 'Range': `${offset}-${offset + limit - 1}` } }
    );
    if (!res.ok) throw new Error(`Fetch ${table} failed: ${res.status} ${await res.text()}`);
    const rows = await res.json() as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const results: Record<string, unknown> = {};

    // ── Migrate adhkar ─────────────────────────────────────────────────────
    console.log('Fetching adhkar from external backend...');
    const adhkar = await fetchAll('adhkar', 'id,title,arabic_title,arabic,transliteration,translation,reference,count,prayer_time,group_name,group_order,display_order,is_active,file_url,description,sections,created_at,updated_at');
    console.log(`Fetched ${adhkar.length} adhkar entries`);

    if (adhkar.length > 0) {
      // Sanitize: cast count to integer (external backend may return string)
      const sanitizedAdhkar = adhkar.map((row) => ({
        ...row,
        count: row.count != null ? parseInt(String(row.count), 10) || 1 : 1,
        group_order: row.group_order != null ? parseInt(String(row.group_order), 10) || 0 : 0,
        display_order: row.display_order != null ? parseInt(String(row.display_order), 10) || 0 : 0,
        // Ensure sections is null or valid JSONB (not a string)
        sections: row.sections === 'null' || row.sections === '' ? null : row.sections,
      }));

      let adhkarInserted = 0;
      for (let i = 0; i < sanitizedAdhkar.length; i += 100) {
        const batch = sanitizedAdhkar.slice(i, i + 100);
        const { error } = await supabase.from('adhkar').upsert(batch, { onConflict: 'id' });
        if (error) {
          console.error('adhkar batch error:', JSON.stringify(error));
          throw new Error(`adhkar upsert failed: ${error.message} | code: ${error.code} | details: ${error.details} | hint: ${error.hint}`);
        }
        adhkarInserted += batch.length;
      }
      results.adhkar = `${adhkarInserted} rows inserted/updated`;
    } else {
      results.adhkar = '0 rows';
    }

    // ── Migrate prayer_times ───────────────────────────────────────────────
    console.log('Fetching prayer_times from external backend...');
    const prayerTimes = await fetchAll('prayer_times', 'id,month,day,date,fajr,fajr_jamat,sunrise,ishraq,zuhr,zuhr_jamat,zawaal,asr,asr_jamat,maghrib,maghrib_jamat,isha,isha_jamat,jumu_ah_1,jumu_ah_2,created_at,updated_at');
    console.log(`Fetched ${prayerTimes.length} prayer time entries`);

    if (prayerTimes.length > 0) {
      let ptInserted = 0;
      for (let i = 0; i < prayerTimes.length; i += 100) {
        const batch = prayerTimes.slice(i, i + 100);
        const { error } = await supabase.from('prayer_times').upsert(batch, { onConflict: 'id' });
        if (error) {
          console.error('prayer_times batch error:', error);
          throw new Error(`prayer_times upsert failed: ${error.message}`);
        }
        ptInserted += batch.length;
      }
      results.prayer_times = `${ptInserted} rows inserted/updated`;
    } else {
      results.prayer_times = '0 rows';
    }

    // ── Migrate announcements ──────────────────────────────────────────────
    console.log('Fetching announcements from external backend...');
    const announcements = await fetchAll('announcements', 'id,title,body,is_active,display_order,link_url,image_url,created_at,updated_at');
    console.log(`Fetched ${announcements.length} announcements`);

    if (announcements.length > 0) {
      const { error } = await supabase.from('announcements').upsert(announcements, { onConflict: 'id' });
      if (error) throw new Error(`announcements upsert failed: ${error.message}`);
      results.announcements = `${announcements.length} rows inserted/updated`;
    } else {
      results.announcements = '0 rows';
    }

    // ── Migrate sunnah_reminders ───────────────────────────────────────────
    console.log('Fetching sunnah_reminders from external backend...');
    const sunnahReminders = await fetchAll('sunnah_reminders', 'id,title,arabic_title,arabic,transliteration,translation,description,reference,count,category,group_name,group_order,display_order,is_active,file_url,created_at,updated_at');
    console.log(`Fetched ${sunnahReminders.length} sunnah reminders`);

    if (sunnahReminders.length > 0) {
      let srInserted = 0;
      for (let i = 0; i < sunnahReminders.length; i += 100) {
        const batch = sunnahReminders.slice(i, i + 100);
        const { error } = await supabase.from('sunnah_reminders').upsert(batch, { onConflict: 'id' });
        if (error) {
          console.error('sunnah_reminders batch error:', error);
          throw new Error(`sunnah_reminders upsert failed: ${error.message}`);
        }
        srInserted += batch.length;
      }
      results.sunnah_reminders = `${srInserted} rows inserted/updated`;
    } else {
      results.sunnah_reminders = '0 rows';
    }

    console.log('Migration complete:', results);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Migration error:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

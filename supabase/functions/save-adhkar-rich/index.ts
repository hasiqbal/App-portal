import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type SaveMode = 'create' | 'update';

interface SavePayload {
  mode: SaveMode;
  id?: string;
  data: Record<string, unknown>;
}

interface SaveAuditMeta {
  mode: SaveMode;
  saved_at: string;
  tafsir_sanitized: boolean;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const ALLOWED_PRAYER_TIMES = new Set([
  'before-fajr',
  'after-fajr',
  'after-zuhr',
  'after-asr',
  'after-maghrib',
  'after-isha',
  'before-sleep',
  'after-jumuah',
  'morning',
  'evening',
  'general',
]);

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sanitizeRichHtml(input: string): string {
  let html = input;

  // Remove dangerous blocks entirely.
  html = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>[\s\S]*?<\/embed>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '');

  // Remove inline event handlers (onClick, onerror, etc).
  html = html
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');

  // Block javascript: and data:text/html in href/src.
  html = html
    .replace(/\s(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*'\s*javascript:[^']*'/gi, " $1='#'")
    .replace(/\s(href|src)\s*=\s*"\s*data:text\/html[^"]*"/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*'\s*data:text\/html[^']*'/gi, " $1='#'");

  return html.trim();
}

function normalizePayload(data: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...data };

  const asTrimmedStringOrNull = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    return v.length > 0 ? v : null;
  };

  normalized.title = asTrimmedStringOrNull(data.title) ?? '';
  normalized.arabic = asTrimmedStringOrNull(data.arabic) ?? '';
  normalized.arabic_title = asTrimmedStringOrNull(data.arabic_title);
  normalized.transliteration = asTrimmedStringOrNull(data.transliteration);
  normalized.translation = asTrimmedStringOrNull(data.translation);
  normalized.urdu_translation = asTrimmedStringOrNull(data.urdu_translation);
  normalized.reference = asTrimmedStringOrNull(data.reference);
  normalized.group_name = asTrimmedStringOrNull(data.group_name);
  normalized.file_url = asTrimmedStringOrNull(data.file_url);

  const rawTafsir = asTrimmedStringOrNull(data.tafsir);
  normalized.tafsir = rawTafsir ? sanitizeRichHtml(rawTafsir) : null;
  normalized.description = asTrimmedStringOrNull(data.description);

  const prayerTime = asTrimmedStringOrNull(data.prayer_time);
  normalized.prayer_time = prayerTime;

  const countValue = asTrimmedStringOrNull(data.count);
  normalized.count = countValue ?? '1';

  const asNullableNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  normalized.group_order = asNullableNumber(data.group_order);
  normalized.display_order = asNullableNumber(data.display_order) ?? 0;
  normalized.is_active = data.is_active !== false;

  if ('sections' in data) {
    normalized.sections = data.sections;
  }

  return normalized;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json() as SavePayload;
    if (!body || typeof body !== 'object') return badRequest('Invalid payload.');

    if (body.mode !== 'create' && body.mode !== 'update') {
      return badRequest('mode must be create or update.');
    }

    if (!body.data || typeof body.data !== 'object') {
      return badRequest('data is required.');
    }

    if (body.mode === 'update' && (!body.id || typeof body.id !== 'string')) {
      return badRequest('id is required for update mode.');
    }

    const normalized = normalizePayload(body.data);
    const rawTafsir = typeof body.data.tafsir === 'string'
      ? body.data.tafsir.trim()
      : (typeof body.data.description === 'string' ? body.data.description.trim() : null);
    const sanitizedTafsir = typeof normalized.tafsir === 'string' ? normalized.tafsir : null;
    const tafsirSanitized = rawTafsir !== sanitizedTafsir;
    const audit: SaveAuditMeta = {
      mode: body.mode,
      saved_at: new Date().toISOString(),
      tafsir_sanitized: tafsirSanitized,
    };

    if (typeof normalized.title !== 'string' || normalized.title.trim().length === 0) {
      return badRequest('title is required.');
    }

    if (typeof normalized.arabic !== 'string' || normalized.arabic.trim().length === 0) {
      return badRequest('arabic is required.');
    }

    if (typeof normalized.prayer_time !== 'string' || !ALLOWED_PRAYER_TIMES.has(normalized.prayer_time)) {
      return badRequest('Invalid prayer_time.');
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (body.mode === 'create') {
      const { data, error } = await admin
        .from('adhkar')
        .insert(normalized)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: `Failed to create dhikr: ${error.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ data, audit }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data, error } = await admin
      .from('adhkar')
      .update(normalized)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: `Failed to update dhikr: ${error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ data, audit }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

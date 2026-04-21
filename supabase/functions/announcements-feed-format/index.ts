import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type FeedRequest = {
  limit?: number;
  offset?: number;
  type?: string;
  tag?: boolean;
  includeUrdu?: boolean;
  formatRichText?: boolean;
};

type FeedAnnouncement = {
  id: string;
  title: string;
  urdu_title: string | null;
  body_html: string;
  body_plain: string;
  urdu_body: string | null;
  type: string | null;
  tag: boolean;
  lead_names: string | null;
  urdu_lead_names: string | null;
  start_time: string | null;
  image_url: string | null;
  link_url: string | null;
  pinned: boolean;
  is_active: boolean;
  published_at: string;
  expires_at: string | null;
  display_order: number | null;
  updated_at: string | null;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANNOUNCEMENTS_TABLE = Deno.env.get('ANNOUNCEMENTS_TABLE')?.trim() || 'announcements';

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(max, Math.max(min, Math.floor(value)));
  }
  return fallback;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

function normalizeNameList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function joinNameList(value: unknown): string | null {
  const values = normalizeNameList(value);
  return values.length > 0 ? values.join(', ') : null;
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeRichHtml(input: string): string {
  let html = input;

  html = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>[\s\S]*?<\/embed>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '');

  html = html
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');

  html = html
    .replace(/\s(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*'\s*javascript:[^']*'/gi, " $1='#'")
    .replace(/\s(href|src)\s*=\s*"\s*data:text\/html[^"]*"/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*'\s*data:text\/html[^']*'/gi, " $1='#'");

  return html.trim();
}

function mapAnnouncementRow(row: Record<string, unknown>, includeUrdu: boolean, formatRichText: boolean): FeedAnnouncement {
  const type =
    asTrimmedString(row.type)
    ?? asTrimmedString(row.event_type)
    ?? asTrimmedString(row.category)
    ?? null;

  const legacyUrduTitle = asTrimmedString(row['Urdu title']);
  const legacyUrduGuests = row['Urdu guests'];

  const bodyHtmlRaw =
    asTrimmedString(row.body)
    ?? asTrimmedString(row.body_html)
    ?? '';

  const bodyHtml = formatRichText ? sanitizeRichHtml(bodyHtmlRaw) : '';
  const bodyPlain =
    asTrimmedString(row.body_plain)
    ?? (bodyHtmlRaw ? stripHtml(bodyHtmlRaw) : '');

  const urduBodyRaw =
    asTrimmedString(row.urdu_translation)
    ?? asTrimmedString(row.urdu_body)
    ?? null;

  const urduBody = includeUrdu && urduBodyRaw
    ? (formatRichText ? sanitizeRichHtml(urduBodyRaw) : stripHtml(urduBodyRaw))
    : null;

  return {
    id: asTrimmedString(row.id) ?? crypto.randomUUID(),
    title: asTrimmedString(row.title) ?? 'Announcement',
    urdu_title: includeUrdu
      ? (asTrimmedString(row.urdu_title) ?? legacyUrduTitle ?? null)
      : null,
    body_html: bodyHtml,
    body_plain: bodyPlain,
    urdu_body: includeUrdu ? urduBody : null,
    type,
    tag: asBoolean(row.tag),
    lead_names:
      joinNameList(row.lead_names)
      ?? joinNameList(row.guests)
      ?? joinNameList(row.guest_speakers)
      ?? joinNameList(row.teacher_name)
      ?? null,
    urdu_lead_names: includeUrdu
      ? (
        joinNameList(row.urdu_lead_names)
        ?? joinNameList(row.guest_urdu)
        ?? joinNameList(legacyUrduGuests)
        ?? joinNameList(row.urdu_guest_speakers)
        ?? joinNameList(row.urdu_teacher_name)
        ?? null
      )
      : null,
    start_time:
      asTrimmedString(row.start_time)
      ?? asTrimmedString(row.time)
      ?? asTrimmedString(row.event_time)
      ?? null,
    image_url: asTrimmedString(row.image_url),
    link_url: asTrimmedString(row.link_url),
    pinned: asBoolean(row.pinned),
    is_active: row.is_active !== false,
    published_at:
      asTrimmedString(row.published_at)
      ?? asTrimmedString(row.created_at)
      ?? new Date().toISOString(),
    expires_at: asTrimmedString(row.expires_at),
    display_order: typeof row.display_order === 'number' ? row.display_order : null,
    updated_at: asTrimmedString(row.updated_at),
  };
}

function applyTypeFilter(rows: FeedAnnouncement[], typeFilter: string | null): FeedAnnouncement[] {
  const value = (typeFilter ?? '').trim();
  if (!value) return rows;
  const normalized = value.toLowerCase();
  return rows.filter((row) => ((row.type ?? '').toLowerCase() === normalized));
}

function sortRows(rows: FeedAnnouncement[]): FeedAnnouncement[] {
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

    const aPublished = Date.parse(a.published_at);
    const bPublished = Date.parse(b.published_at);
    const safeA = Number.isFinite(aPublished) ? aPublished : 0;
    const safeB = Number.isFinite(bPublished) ? bPublished : 0;
    if (safeA !== safeB) return safeB - safeA;

    const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.MAX_SAFE_INTEGER;
    const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
}

serve(async (req: Request) => {
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

    const payload = (await req.json().catch(() => ({}))) as FeedRequest;

    const limit = clampNumber(payload.limit, 1, 200, 100);
    const offset = clampNumber(payload.offset, 0, 1000, 0);
    const includeUrdu = payload.includeUrdu !== false;
    const formatRichText = payload.formatRichText !== false;
    const typeFilter = asTrimmedString(payload.type);
    const tagFilter = typeof payload.tag === 'boolean' ? payload.tag : null;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let query = supabase
      .from(ANNOUNCEMENTS_TABLE)
      .select('*')
      .eq('is_active', true);

    if (tagFilter !== null) {
      query = query.eq('tag', tagFilter);
    }

    const { data, error } = await query
      .range(offset, offset + limit - 1);

    if (error) {
      return new Response(JSON.stringify({ error: `Failed to fetch announcements: ${error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mapped = (Array.isArray(data) ? data : [])
      .map((row) => mapAnnouncementRow(row as Record<string, unknown>, includeUrdu, formatRichText));

    const filtered = applyTypeFilter(mapped, typeFilter);
    const announcements = sortRows(filtered);

    return new Response(JSON.stringify({
      announcements,
      generated_at: new Date().toISOString(),
      total: announcements.length,
    }), {
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

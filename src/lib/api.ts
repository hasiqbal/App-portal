
import { PrayerTime, PrayerTimeUpdate, Dhikr, DhikrPayload, AdhkarGroup, AdhkarGroupPayload, Announcement, AnnouncementPayload, SunnahReminder, SunnahReminderPayload, SunnahGroup, SunnahGroupPayload } from '@/types';
import { supabase } from '@/lib/supabase';

const BASE_URL = 'https://ucpmwygyuvbfehjpucpm.backend.onspace.ai/rest/v1';

const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjcG13eWd5dXZiZmVoanB1Y3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDgxMTksImV4cCI6MjA1OTQyNDExOX0.i8tlNr0s9g7D7VhWKUFxXBwU_YhWEarUOBsmCIi-lEA';

// Read-only requests: apikey only (hits public RLS policy)
const readHeaders = {
  'Content-Type': 'application/json',
  'apikey': ANON_KEY,
};

// Write requests: apikey only (Authorization header causes PGRST301 on this backend)
const writeHeaders = {
  'Content-Type': 'application/json',
  'apikey': ANON_KEY,
  'Prefer': 'return=representation',
};

// ─── Prayer Times ────────────────────────────────────────────────────────────

export async function fetchPrayerTimes(month?: number): Promise<PrayerTime[]> {
  let url = `${BASE_URL}/prayer_times?order=month.asc,day.asc`;
  if (month !== undefined) {
    url += `&month=eq.${month}`;
  }
  const res = await fetch(url, { headers: readHeaders });
  if (!res.ok) throw new Error(`Failed to fetch prayer times: ${res.status}`);
  return res.json();
}

export async function bulkUpdatePrayerTimes(ids: string[], data: PrayerTimeUpdate): Promise<PrayerTime[]> {
  const idList = ids.join(',');
  const res = await fetch(`${BASE_URL}/prayer_times?id=in.(${idList})`, {
    method: 'PATCH',
    headers: writeHeaders,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to bulk update prayer times: ${res.status} — ${body}`);
  }
  return res.json();
}

export async function updatePrayerTime(id: string, data: PrayerTimeUpdate): Promise<PrayerTime[]> {
  const res = await fetch(`${BASE_URL}/prayer_times?id=eq.${id}`, {
    method: 'PATCH',
    headers: writeHeaders,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update prayer time: ${res.status}`);
  return res.json();
}

// ─── Adhkar ──────────────────────────────────────────────────────────────────

// Columns needed for the list/table view — excludes `sections` (potentially large JSON)
const ADHKAR_LIST_COLS =
  'id,title,arabic_title,arabic,transliteration,translation,reference,count,prayer_time,group_name,group_order,display_order,is_active,created_at,updated_at';

export async function fetchAdhkar(category?: string): Promise<Dhikr[]> {
  let url = `${BASE_URL}/adhkar?select=${ADHKAR_LIST_COLS}&order=prayer_time.asc,group_order.asc,display_order.asc,created_at.asc`;
  if (category) url += `&prayer_time=eq.${encodeURIComponent(category)}`;
  const res = await fetch(url, { headers: readHeaders });
  if (!res.ok) throw new Error(`Failed to fetch adhkar: ${res.status}`);
  return res.json();
}

// Columns that actually exist on the external adhkar table.
// `description` and `file_url` exist only in the current project's schema cache
// but NOT in the external backend (ucpmwygyuvbfehjpucpm), so we strip them.
function sanitizeDhikrPayload(data: Partial<DhikrPayload>): Record<string, unknown> {
  // Strip only `file_url` — the external adhkar table doesn't have that column.
  // `description` IS now supported on the external backend, so we pass it through.
  const { file_url: _f, ...rest } = data as Record<string, unknown>;
  return rest;
}

// All valid prayer_time values on the external backend (ucpmwygyuvbfehjpucpm).
// Constraint updated to accept the full portal slug set.
const EXTERNAL_PRAYER_TIMES = new Set([
  'before-fajr', 'fajr', 'after-fajr',
  'ishraq', 'duha',
  'zuhr', 'after-zuhr',
  'asr', 'after-asr',
  'maghrib', 'after-maghrib',
  'isha', 'after-isha',
  'before-sleep', 'morning', 'evening',
  'jumuah', 'after-jumuah',
  'general',
]);

// Legacy slug aliases only — all canonical slugs are now accepted natively.
const PRAYER_TIME_OVERRIDE: Record<string, string> = {
  'jumu-ah':       'jumuah',
  'after-jumu-ah': 'after-jumuah',
};

function sanitizePrayerTime(pt: unknown): string {
  if (typeof pt !== 'string') return 'after-fajr';
  if (EXTERNAL_PRAYER_TIMES.has(pt)) return pt;
  return PRAYER_TIME_OVERRIDE[pt] ?? 'after-fajr';
}

export async function createDhikr(data: Partial<DhikrPayload>): Promise<Dhikr> {
  const sanitized = sanitizeDhikrPayload(data);
  // Map any portal-only prayer_time slug to a value the external backend accepts
  if ('prayer_time' in sanitized) {
    (sanitized as Record<string, unknown>).prayer_time = sanitizePrayerTime(sanitized.prayer_time);
  }
  console.log('createDhikr payload:', JSON.stringify(sanitized));
  const res = await fetch(`${BASE_URL}/adhkar`, {
    method: 'POST',
    headers: writeHeaders,
    body: JSON.stringify(sanitized),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('createDhikr error:', res.status, body);
    throw new Error(`Failed to create dhikr: ${res.status} — ${body}`);
  }
  const rows = await res.json();
  console.log('createDhikr response:', JSON.stringify(rows));
  const row = Array.isArray(rows) ? rows[0] : rows;
  // Restore the original prayer_time so the portal cache shows the correct category
  return { ...row, prayer_time: data.prayer_time ?? row.prayer_time };
}

export async function updateDhikr(id: string, data: Partial<DhikrPayload>): Promise<Dhikr> {
  const sanitized = sanitizeDhikrPayload(data);
  // Map prayer_time if present
  if ('prayer_time' in sanitized) {
    (sanitized as Record<string, unknown>).prayer_time = sanitizePrayerTime(sanitized.prayer_time);
  }
  const res = await fetch(`${BASE_URL}/adhkar?id=eq.${id}`, {
    method: 'PATCH',
    headers: writeHeaders,
    body: JSON.stringify(sanitized),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('updateDhikr error:', res.status, body);
    throw new Error(`Failed to update dhikr: ${res.status} — ${body}`);
  }
  const rows = await res.json();
  const row = rows[0];
  // Restore the original prayer_time so the portal cache shows the correct category
  return { ...row, prayer_time: data.prayer_time ?? row.prayer_time };
}

export async function deleteDhikr(id: string): Promise<void> {
  const deleteHeaders = {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
  };
  const res = await fetch(`${BASE_URL}/adhkar?id=eq.${id}`, {
    method: 'DELETE',
    headers: deleteHeaders,
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('deleteDhikr error:', res.status, body);
    throw new Error(`Failed to delete dhikr: ${res.status} — ${body}`);
  }
}

// ─── Adhkar Groups (uses this project's OnSpace backend via supabase client) ─────────────────────

export async function fetchAdhkarGroups(): Promise<AdhkarGroup[]> {
  const { data, error } = await supabase
    .from('adhkar_groups')
    .select('*')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(`Failed to fetch adhkar groups: ${error.message}`);
  return data as AdhkarGroup[];
}

export async function createAdhkarGroup(data: Partial<AdhkarGroupPayload>): Promise<AdhkarGroup> {
  const { data: rows, error } = await supabase
    .from('adhkar_groups')
    .insert(data)
    .select()
    .single();
  if (error) {
    console.error('createAdhkarGroup error:', error);
    throw new Error(`Failed to create group: ${error.message}`);
  }
  return rows as AdhkarGroup;
}

export async function updateAdhkarGroup(id: string, data: Partial<AdhkarGroupPayload>): Promise<AdhkarGroup> {
  const { data: rows, error } = await supabase
    .from('adhkar_groups')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('updateAdhkarGroup error:', error);
    throw new Error(`Failed to update group: ${error.message}`);
  }
  return rows as AdhkarGroup;
}

export async function deleteAdhkarGroup(id: string): Promise<void> {
  const { error } = await supabase
    .from('adhkar_groups')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`Failed to delete group: ${error.message}`);
}

// ─── Announcements (external backend — same as adhkar/prayer_times) ────────────────────────────────────────────────────────────

const ANN_URL = `${BASE_URL}/announcements`;

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const res = await fetch(
    `${ANN_URL}?order=display_order.asc,created_at.desc`,
    { headers: readHeaders }
  );
  if (!res.ok) throw new Error(`Failed to fetch announcements: ${res.status}`);
  return res.json();
}

export async function createAnnouncement(data: Partial<AnnouncementPayload>): Promise<Announcement> {
  const payload = { display_order: 0, is_active: true, ...data };
  const res = await fetch(ANN_URL, {
    method: 'POST',
    headers: writeHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create announcement: ${res.status} — ${body}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateAnnouncement(id: string, data: Partial<AnnouncementPayload>): Promise<Announcement> {
  const res = await fetch(`${ANN_URL}?id=eq.${id}`, {
    method: 'PATCH',
    headers: writeHeaders,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to update announcement: ${res.status} — ${body}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const res = await fetch(`${ANN_URL}?id=eq.${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to delete announcement: ${res.status} — ${body}`);
  }
}

export async function bulkUpdatePrayerTimesFromCsv(
  month: number,
  rows: { day: number; fields: PrayerTimeUpdate }[]
): Promise<PrayerTime[]> {
  // Fetch all rows for the month to map day → id
  const existing = await fetchPrayerTimes(month);
  const dayToId = new Map(existing.map((r) => [r.day, r.id]));

  const updates: Promise<PrayerTime[]>[] = [];
  for (const { day, fields } of rows) {
    const id = dayToId.get(day);
    if (!id) continue;
    updates.push(updatePrayerTime(id, fields));
  }

  const results = await Promise.all(updates);
  return results.flat();
}

/**
 * Year-wide CSV import: groups parsed rows by month and bulk-updates each.
 * Returns a map of month → updated PrayerTime rows.
 */
// ─── Sunnah Reminders (external database — SunnahReminders table) ───────────
// The external table uses PascalCase and different column names:
// id, title, detail, reference, icon
// We map them to our SunnahReminder shape on the way in.

// Use the same external backend as adhkar/prayer_times
const SUNNAH_URL = `${BASE_URL}/sunnah_reminders`;

function mapExternalSunnah(raw: Record<string, unknown>): SunnahReminder {
  return {
    id:              String(raw.id ?? ''),
    title:           String(raw.title ?? ''),
    arabic_title:    raw.arabic_title != null ? String(raw.arabic_title) : null,
    arabic:          raw.arabic != null ? String(raw.arabic) : null,
    transliteration: raw.transliteration != null ? String(raw.transliteration) : null,
    translation:     raw.translation != null ? String(raw.translation) : null,
    description:     raw.detail != null ? String(raw.detail) : (raw.description != null ? String(raw.description) : null),
    reference:       raw.reference != null ? String(raw.reference) : null,
    count:           raw.count != null ? String(raw.count) : '1',
    category:        raw.category != null ? String(raw.category) : 'general',
    group_name:      raw.group_name != null ? String(raw.group_name) : null,
    group_order:     raw.group_order != null ? Number(raw.group_order) : null,
    display_order:   raw.display_order != null ? Number(raw.display_order) : null,
    is_active:       raw.is_active !== false,
    file_url:        raw.file_url != null ? String(raw.file_url) : (raw.icon != null ? String(raw.icon) : null),
    created_at:      String(raw.created_at ?? new Date().toISOString()),
    updated_at:      String(raw.updated_at ?? new Date().toISOString()),
  };
}

export async function fetchSunnahReminders(_category?: string): Promise<SunnahReminder[]> {
  const res = await fetch(
    `${SUNNAH_URL}?order=display_order.asc,created_at.asc`,
    { headers: readHeaders }
  );
  if (!res.ok) throw new Error(`Failed to fetch sunnah reminders: ${res.status}`);
  const data = await res.json() as Record<string, unknown>[];
  return data.map(mapExternalSunnah);
}

export async function createSunnahReminder(data: Partial<SunnahReminderPayload>): Promise<SunnahReminder> {
  // External table only has: title, detail, reference, icon, friday_only, display_order, is_active
  const payload: Record<string, unknown> = {
    title: data.title,
    detail: data.description ?? null,
    reference: data.reference ?? null,
    icon: data.file_url ?? null,
    display_order: data.display_order ?? 0,
    is_active: data.is_active !== false,
  };

  const res = await fetch(SUNNAH_URL, {
    method: 'POST',
    headers: writeHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('createSunnahReminder error:', res.status, body);
    throw new Error(`Failed to create sunnah reminder: ${res.status} — ${body}`);
  }
  const rows = await res.json();
  return mapExternalSunnah(Array.isArray(rows) ? rows[0] : rows);
}

export async function updateSunnahReminder(id: string, data: Partial<SunnahReminderPayload>): Promise<SunnahReminder> {
  // External table only has: title, detail, reference, icon, friday_only, display_order, is_active
  const payload: Record<string, unknown> = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.description !== undefined) payload.detail = data.description;
  if (data.reference !== undefined) payload.reference = data.reference;
  if (data.file_url !== undefined) payload.icon = data.file_url;
  if (data.display_order !== undefined) payload.display_order = data.display_order;
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  const res = await fetch(`${SUNNAH_URL}?id=eq.${id}`, {
    method: 'PATCH',
    headers: writeHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('updateSunnahReminder error:', res.status, body);
    throw new Error(`Failed to update sunnah reminder: ${res.status} — ${body}`);
  }
  const rows = await res.json();
  return mapExternalSunnah(Array.isArray(rows) ? rows[0] : rows);
}

export async function deleteSunnahReminder(id: string): Promise<void> {
  const res = await fetch(`${SUNNAH_URL}?id=eq.${id}`, {
    method: 'DELETE',
    headers: writeHeaders,
  });
  if (!res.ok) throw new Error(`Failed to delete sunnah reminder: ${res.status}`);
}

// ─── Sunnah Groups ───────────────────────────────────────────────────────────

export async function fetchSunnahGroups(): Promise<SunnahGroup[]> {
  const { data, error } = await supabase
    .from('sunnah_groups')
    .select('*')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(`Failed to fetch sunnah groups: ${error.message}`);
  return data as SunnahGroup[];
}

export async function createSunnahGroup(data: Partial<SunnahGroupPayload>): Promise<SunnahGroup> {
  const { data: rows, error } = await supabase
    .from('sunnah_groups')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(`Failed to create sunnah group: ${error.message}`);
  return rows as SunnahGroup;
}

export async function updateSunnahGroup(id: string, data: Partial<SunnahGroupPayload>): Promise<SunnahGroup> {
  const { data: rows, error } = await supabase
    .from('sunnah_groups')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`Failed to update sunnah group: ${error.message}`);
  return rows as SunnahGroup;
}

export async function deleteSunnahGroup(id: string): Promise<void> {
  const { error } = await supabase
    .from('sunnah_groups')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`Failed to delete sunnah group: ${error.message}`);
}

export async function bulkUpdatePrayerTimesFromYearCsv(
  rowsByMonth: Map<number, { day: number; fields: PrayerTimeUpdate }[]>
): Promise<Map<number, PrayerTime[]>> {
  const results = new Map<number, PrayerTime[]>();
  await Promise.all(
    Array.from(rowsByMonth.entries()).map(async ([month, rows]) => {
      const updated = await bulkUpdatePrayerTimesFromCsv(month, rows);
      results.set(month, updated);
    })
  );
  return results;
}

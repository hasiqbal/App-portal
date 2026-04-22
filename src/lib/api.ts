
import {
  PrayerTime,
  PrayerTimeUpdate,
  Dhikr,
  DhikrPayload,
  AdhkarGroup,
  AdhkarGroupPayload,
  Announcement,
  AnnouncementPayload,
  SunnahReminder,
  SunnahReminderPayload,
  SunnahGroup,
  SunnahGroupPayload,
  AdhkarContentType,
  QaseedahNaatEntry,
  QaseedahNaatEntryPayload,
  QaseedahNaatGroup,
  QaseedahNaatGroupPayload,
  QaseedahNaatType,
} from '#/types';
import { supabase, supabaseAdmin, invokeExternalFunction } from '#/lib/supabase';

const ANNOUNCEMENTS_TABLE = (import.meta.env.VITE_ANNOUNCEMENTS_TABLE ?? 'announcements').trim() || 'announcements';
const ANNOUNCEMENTS_URDU_TITLE_COLUMN = (import.meta.env.VITE_ANNOUNCEMENTS_URDU_TITLE_COLUMN ?? 'Urdu title').trim() || 'Urdu title';
const ANNOUNCEMENTS_URDU_GUESTS_COLUMN = 'guest_urdu';
const ANNOUNCEMENTS_GUESTS_COLUMN = 'guests';
const ANNOUNCEMENTS_TIME_COLUMN = 'time';

type AnnouncementDbRow = Omit<Announcement, 'type' | 'urdu_title' | 'urdu_body' | 'tag' | 'urdu_lead_names'> & {
  type?: string | null;
  event_type?: string | null;
  category?: string | null;
  urdu_title?: string | null;
  urdu_body?: string | null;
  urdu_translation?: string | null;
  urdu_lead_names?: string | string[] | null;
  urdu_guest_speakers?: string | string[] | null;
  urdu_teacher_name?: string | string[] | null;
  guest_urdu?: string | string[] | null;
  tag?: boolean | null;
  lead_names?: string | string[] | null;
  guest_speakers?: string | string[] | null;
  teacher_name?: string | string[] | null;
  guests?: string | string[] | null;
  start_time?: string | null;
  event_time?: string | null;
  time?: string | null;
};

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
  const names = normalizeNameList(value);
  return names.length > 0 ? names.join(', ') : null;
}

function mapAnnouncementFromDb(row: AnnouncementDbRow): Announcement {
  const legacyUrduTitle = (row as Record<string, unknown>)['Urdu title'];
  const resolvedUrduTitle = typeof legacyUrduTitle === 'string'
    ? legacyUrduTitle
    : row.urdu_title ?? null;

  const legacyUrduGuests = (row as Record<string, unknown>)['Urdu guests'];
  const resolvedUrduGuests = typeof legacyUrduGuests === 'string'
    ? legacyUrduGuests
    : row.urdu_lead_names ?? row.guest_urdu ?? row.urdu_guest_speakers ?? row.urdu_teacher_name ?? null;

  return {
    ...row,
    tag: Boolean(row.tag),
    type: row.type ?? row.event_type ?? row.category ?? null,
    urdu_title: resolvedUrduTitle,
    lead_names: joinNameList(row.lead_names ?? row.guests ?? row.guest_speakers ?? row.teacher_name),
    urdu_lead_names: joinNameList(resolvedUrduGuests),
    start_time: row.start_time ?? row.time ?? row.event_time ?? null,
    urdu_body: row.urdu_body ?? row.urdu_translation ?? null,
  };
}

function mapAnnouncementPayloadToDb(data: Partial<AnnouncementPayload>): Record<string, unknown> {
  const { urdu_body, urdu_title, urdu_lead_names, lead_names, start_time, type: announcementType, ...rest } = data as Partial<AnnouncementPayload> & Record<string, unknown>;
  const mapped: Record<string, unknown> = { ...rest };

  if (announcementType !== undefined) {
    mapped.type = announcementType;
  }

  if (urdu_body !== undefined) {
    mapped.urdu_translation = urdu_body;
  }

  if (urdu_title !== undefined) {
    mapped[ANNOUNCEMENTS_URDU_TITLE_COLUMN] = urdu_title;
  }

  if (urdu_lead_names !== undefined) {
    const urduNames = normalizeNameList(urdu_lead_names);
    mapped[ANNOUNCEMENTS_URDU_GUESTS_COLUMN] = urduNames.length > 0 ? urduNames : null;
  }

  if (lead_names !== undefined) {
    const names = normalizeNameList(lead_names);
    mapped[ANNOUNCEMENTS_GUESTS_COLUMN] = names.length > 0 ? names : null;
  }

  if (start_time !== undefined) {
    mapped[ANNOUNCEMENTS_TIME_COLUMN] = start_time;
  }

  return mapped;
}

// All data now lives in the single external Supabase project (lhaqqqatdztuijgdfdcf).
// The supabase client in src/lib/supabase.ts already points there.

// ─── Prayer Times ────────────────────────────────────────────────────────────

export async function fetchPrayerTimes(month?: number): Promise<PrayerTime[]> {
  let query = supabase
    .from('prayer_times')
    .select('*')
    .order('month', { ascending: true })
    .order('day', { ascending: true });

  if (month !== undefined) {
    query = query.eq('month', month);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch prayer times: ${error.message}`);
  return data as PrayerTime[];
}

export async function updatePrayerTime(id: string, data: PrayerTimeUpdate): Promise<PrayerTime[]> {
  const { data: rows, error } = await supabaseAdmin
    .from('prayer_times')
    .update(data)
    .eq('id', id)
    .select();
  if (error) throw new Error(`Failed to update prayer time: ${error.message}`);
  return rows as PrayerTime[];
}

export async function bulkUpdatePrayerTimes(ids: string[], data: PrayerTimeUpdate): Promise<PrayerTime[]> {
  const { data: rows, error } = await supabase
    .from('prayer_times')
    .update(data)
    .in('id', ids)
    .select();
  if (error) throw new Error(`Failed to bulk update prayer times: ${error.message}`);
  return rows as PrayerTime[];
}

// ─── Adhkar ──────────────────────────────────────────────────────────────────

export async function fetchAdhkar(
  category?: string,
  options?: { contentTypes?: AdhkarContentType[] }
): Promise<Dhikr[]> {
  let query = supabase
    .from('adhkar')
    .select('id,title,arabic_title,arabic,transliteration,translation,urdu_translation,reference,count,prayer_time,group_name,group_order,display_order,sections,is_active,tafsir,description,file_url,content_type,content_source,content_key,created_at,updated_at')
    .order('prayer_time', { ascending: true })
    .order('group_order', { ascending: true })
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (category) {
    query = query.eq('prayer_time', category);
  }

  if (options?.contentTypes && options.contentTypes.length > 0) {
    query = query.in('content_type', options.contentTypes);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch adhkar: ${error.message}`);
  return (data ?? []).map((row) => ({
    ...row,
    count: String(row.count ?? ''),
    sections: row.sections ?? null,
    file_url: row.file_url ?? null,
    content_type: row.content_type ?? null,
    content_source: row.content_source ?? null,
    content_key: row.content_key ?? null,
    tafsir: row.tafsir ?? row.description ?? null,
    description: row.description ?? null,
    urdu_translation: row.urdu_translation ?? null,
  })) as Dhikr[];
}

export async function createDhikr(data: Partial<DhikrPayload>): Promise<Dhikr> {
  const { data: rows, error } = await supabase
    .from('adhkar')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(`Failed to create dhikr: ${error.message}`);
  return rows as Dhikr;
}

export async function updateDhikr(id: string, data: Partial<DhikrPayload>): Promise<Dhikr> {
  const { data: rows, error } = await supabase
    .from('adhkar')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`Failed to update dhikr: ${error.message}`);
  return rows as Dhikr;
}

export async function saveDhikrViaEdge(
  mode: 'create' | 'update',
  data: Partial<DhikrPayload>,
  id?: string,
): Promise<Dhikr> {
  const { data: result, error } = await invokeExternalFunction<{ data?: Dhikr; error?: string }>('save-adhkar-rich', {
    mode,
    id,
    data,
  });

  if (error) {
    throw new Error(`Failed to save dhikr via edge function: ${error}`);
  }

  if (!result?.data) {
    throw new Error(result?.error || 'Edge function returned an empty response.');
  }

  return result.data;
}

export async function deleteDhikr(id: string): Promise<void> {
  const { error } = await supabase
    .from('adhkar')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`Failed to delete dhikr: ${error.message}`);
}

// ─── Adhkar Groups ───────────────────────────────────────────────────────────

export async function fetchAdhkarGroups(): Promise<AdhkarGroup[]> {
  const { data, error } = await supabase
    .from('adhkar_groups')
    .select('*')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(`Failed to fetch adhkar groups: ${error.message}`);
  return data as AdhkarGroup[];
}

function extractMissingSchemaColumn(message: string): string | null {
  const quotedMatch = message.match(/Could not find the '([^']+)' column/i);
  if (quotedMatch) return quotedMatch[1];

  const schemaCacheMatch = message.match(/column\s+['"]?([a-zA-Z0-9_]+)['"]?\s+.*schema cache/i);
  if (schemaCacheMatch) return schemaCacheMatch[1];

  return null;
}

async function createAdhkarGroupWithFallback(payload: Record<string, unknown>): Promise<AdhkarGroup> {
  let currentPayload = { ...payload };

  while (true) {
    const { data: rows, error } = await supabase
      .from('adhkar_groups')
      .insert(currentPayload)
      .select()
      .single();

    if (!error) return rows as AdhkarGroup;

    const missingColumn = extractMissingSchemaColumn(error.message);
    if (!missingColumn || !(missingColumn in currentPayload)) {
      throw new Error(`Failed to create group: ${error.message}`);
    }

    const { [missingColumn]: _removed, ...rest } = currentPayload;
    currentPayload = rest;
  }
}

async function updateAdhkarGroupWithFallback(id: string, payload: Record<string, unknown>): Promise<AdhkarGroup> {
  let currentPayload = { ...payload };

  while (true) {
    const { data: rows, error } = await supabase
      .from('adhkar_groups')
      .update(currentPayload)
      .eq('id', id)
      .select()
      .single();

    if (!error) return rows as AdhkarGroup;

    const missingColumn = extractMissingSchemaColumn(error.message);
    if (!missingColumn || !(missingColumn in currentPayload)) {
      throw new Error(`Failed to update group: ${error.message}`);
    }

    const { [missingColumn]: _removed, ...rest } = currentPayload;
    currentPayload = rest;
  }
}

export async function createAdhkarGroup(data: Partial<AdhkarGroupPayload>): Promise<AdhkarGroup> {
  return createAdhkarGroupWithFallback(data as Record<string, unknown>);
}

export async function updateAdhkarGroup(id: string, data: Partial<AdhkarGroupPayload>): Promise<AdhkarGroup> {
  return updateAdhkarGroupWithFallback(id, data as Record<string, unknown>);
}

export async function deleteAdhkarGroup(id: string): Promise<void> {
  const { error } = await supabase
    .from('adhkar_groups')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`Failed to delete group: ${error.message}`);
}

// ─── Qaseedah & Naat (dedicated tables) ────────────────────────────────────

type QaseedahNaatEntryDbRow = Omit<QaseedahNaatEntry, 'group_name'> & {
  qaseedah_naat_groups?: { name: string } | Array<{ name: string }> | null;
};

function mapQaseedahNaatEntryRow(row: QaseedahNaatEntryDbRow): QaseedahNaatEntry {
  const relatedGroup = Array.isArray(row.qaseedah_naat_groups)
    ? row.qaseedah_naat_groups[0]
    : row.qaseedah_naat_groups;

  return {
    ...row,
    group_name: relatedGroup?.name ?? 'General',
  };
}

export async function fetchQaseedahNaatGroups(options?: {
  contentTypes?: QaseedahNaatType[];
  onlyActive?: boolean;
}): Promise<QaseedahNaatGroup[]> {
  let query = supabase
    .from('qaseedah_naat_groups')
    .select('*')
    .order('content_type', { ascending: true })
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (options?.contentTypes && options.contentTypes.length > 0) {
    query = query.in('content_type', options.contentTypes);
  }

  if (options?.onlyActive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch qaseedah/naat groups: ${error.message}`);
  return (data ?? []) as QaseedahNaatGroup[];
}

export async function createQaseedahNaatGroup(
  data: Partial<QaseedahNaatGroupPayload>
): Promise<QaseedahNaatGroup> {
  const { data: rows, error } = await supabase
    .from('qaseedah_naat_groups')
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(`Failed to create qaseedah/naat group: ${error.message}`);
  return rows as QaseedahNaatGroup;
}

export async function updateQaseedahNaatGroup(
  id: string,
  data: Partial<QaseedahNaatGroupPayload>
): Promise<QaseedahNaatGroup> {
  const { data: rows, error } = await supabase
    .from('qaseedah_naat_groups')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update qaseedah/naat group: ${error.message}`);
  return rows as QaseedahNaatGroup;
}

export async function deleteQaseedahNaatGroup(id: string): Promise<void> {
  const { error } = await supabase
    .from('qaseedah_naat_groups')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete qaseedah/naat group: ${error.message}`);
}

export async function fetchQaseedahNaatEntries(options?: {
  contentTypes?: QaseedahNaatType[];
  groupIds?: string[];
  onlyActive?: boolean;
}): Promise<QaseedahNaatEntry[]> {
  let query = supabase
    .from('qaseedah_naat_entries')
    .select('id,group_id,content_type,legacy_adhkar_id,title,arabic_title,arabic,transliteration,translation,urdu_translation,reference,count,prayer_time,display_order,is_active,sections,file_url,tafsir,description,created_at,updated_at,qaseedah_naat_groups(name)')
    .order('content_type', { ascending: true })
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (options?.contentTypes && options.contentTypes.length > 0) {
    query = query.in('content_type', options.contentTypes);
  }

  if (options?.groupIds && options.groupIds.length > 0) {
    query = query.in('group_id', options.groupIds);
  }

  if (options?.onlyActive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch qaseedah/naat entries: ${error.message}`);

  return (data ?? []).map((row) => mapQaseedahNaatEntryRow(row as QaseedahNaatEntryDbRow));
}

export async function createQaseedahNaatEntry(
  data: Partial<QaseedahNaatEntryPayload>
): Promise<QaseedahNaatEntry> {
  const { data: rows, error } = await supabase
    .from('qaseedah_naat_entries')
    .insert(data)
    .select('id,group_id,content_type,legacy_adhkar_id,title,arabic_title,arabic,transliteration,translation,urdu_translation,reference,count,prayer_time,display_order,is_active,sections,file_url,tafsir,description,created_at,updated_at,qaseedah_naat_groups(name)')
    .single();

  if (error) throw new Error(`Failed to create qaseedah/naat entry: ${error.message}`);
  return mapQaseedahNaatEntryRow(rows as QaseedahNaatEntryDbRow);
}

export async function updateQaseedahNaatEntry(
  id: string,
  data: Partial<QaseedahNaatEntryPayload>
): Promise<QaseedahNaatEntry> {
  const { data: rows, error } = await supabase
    .from('qaseedah_naat_entries')
    .update(data)
    .eq('id', id)
    .select('id,group_id,content_type,legacy_adhkar_id,title,arabic_title,arabic,transliteration,translation,urdu_translation,reference,count,prayer_time,display_order,is_active,sections,file_url,tafsir,description,created_at,updated_at,qaseedah_naat_groups(name)')
    .single();

  if (error) throw new Error(`Failed to update qaseedah/naat entry: ${error.message}`);
  return mapQaseedahNaatEntryRow(rows as QaseedahNaatEntryDbRow);
}

export async function deleteQaseedahNaatEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from('qaseedah_naat_entries')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete qaseedah/naat entry: ${error.message}`);
}

// ─── Announcements ───────────────────────────────────────────────────────────

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from(ANNOUNCEMENTS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to fetch announcements: ${error.message}`);
  return (data ?? []).map((row) => mapAnnouncementFromDb(row as AnnouncementDbRow));
}

export async function createAnnouncement(data: Partial<AnnouncementPayload>): Promise<Announcement> {
  const payload = { is_active: true, ...mapAnnouncementPayloadToDb(data) };
  const { data: rows, error } = await supabase
    .from(ANNOUNCEMENTS_TABLE)
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(`Failed to create announcement: ${error.message}`);
  return mapAnnouncementFromDb(rows as AnnouncementDbRow);
}

export async function updateAnnouncement(id: string, data: Partial<AnnouncementPayload>): Promise<Announcement> {
  const payload = mapAnnouncementPayloadToDb(data);
  const { data: rows, error } = await supabase
    .from(ANNOUNCEMENTS_TABLE)
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`Failed to update announcement: ${error.message}`);
  return mapAnnouncementFromDb(rows as AnnouncementDbRow);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase
    .from(ANNOUNCEMENTS_TABLE)
    .delete()
    .eq('id', id);
  if (error) throw new Error(`Failed to delete announcement: ${error.message}`);
}

// ─── Sunnah Reminders ────────────────────────────────────────────────────────

export async function fetchSunnahReminders(_category?: string): Promise<SunnahReminder[]> {
  const { data, error } = await supabase
    .from('sunnah_reminders')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to fetch sunnah reminders: ${error.message}`);
  return data as SunnahReminder[];
}

export async function createSunnahReminder(data: Partial<SunnahReminderPayload>): Promise<SunnahReminder> {
  const { data: rows, error } = await supabase
    .from('sunnah_reminders')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(`Failed to create sunnah reminder: ${error.message}`);
  return rows as SunnahReminder;
}

export async function updateSunnahReminder(id: string, data: Partial<SunnahReminderPayload>): Promise<SunnahReminder> {
  const { data: rows, error } = await supabase
    .from('sunnah_reminders')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`Failed to update sunnah reminder: ${error.message}`);
  return rows as SunnahReminder;
}

export async function deleteSunnahReminder(id: string): Promise<void> {
  const { error } = await supabase
    .from('sunnah_reminders')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`Failed to delete sunnah reminder: ${error.message}`);
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

// ─── Bulk prayer time helpers ────────────────────────────────────────────────

export async function bulkUpdatePrayerTimesFromCsv(
  month: number,
  rows: { day: number; fields: PrayerTimeUpdate }[]
): Promise<PrayerTime[]> {
  if (rows.length === 0) return [];

  // Build upsert payload — include month + day so the DB can match existing rows
  const payload = rows.map(({ day, fields }) => ({ month, day, ...fields }));

  const { data, error } = await supabase
    .from('prayer_times')
    .upsert(payload, { onConflict: 'month,day', ignoreDuplicates: false })
    .select();

  if (error) {
    return await _fallbackUpdateMonth(month, rows);
  }

  // Always re-fetch to confirm DB state and return fresh data
  return await fetchPrayerTimes(month);
}

/** Fallback: update each row individually when upsert constraint is missing */
async function _fallbackUpdateMonth(
  month: number,
  rows: { day: number; fields: PrayerTimeUpdate }[]
): Promise<PrayerTime[]> {
  const existing = await fetchPrayerTimes(month);
  const dayToId  = new Map(existing.map((r) => [r.day, r.id]));

  const toUpdate: { id: string; fields: PrayerTimeUpdate }[] = [];
  const toInsert: (PrayerTimeUpdate & { month: number; day: number })[] = [];

  for (const { day, fields } of rows) {
    const id = dayToId.get(day);
    if (id) toUpdate.push({ id, fields });
    else     toInsert.push({ month, day, ...fields });
  }

  // Run all updates in parallel
  if (toUpdate.length > 0) {
    await Promise.all(
      toUpdate.map(({ id, fields }) =>
        supabase.from('prayer_times').update(fields).eq('id', id)
      )
    );
  }

  // Insert any new rows
  if (toInsert.length > 0) {
    await supabase.from('prayer_times').insert(toInsert);
  }

  // Always return fresh data from DB
  return await fetchPrayerTimes(month);
}

export async function bulkUpdatePrayerTimesFromYearCsv(
  rowsByMonth: Map<number, { day: number; fields: PrayerTimeUpdate }[]>
): Promise<Map<number, PrayerTime[]>> {
  const results = new Map<number, PrayerTime[]>();
  // Process months sequentially to avoid overwhelming the DB
  for (const [month, rows] of Array.from(rowsByMonth.entries()).sort(([a], [b]) => a - b)) {
    const updated = await bulkUpdatePrayerTimesFromCsv(month, rows);
    results.set(month, updated);
  }
  return results;
}

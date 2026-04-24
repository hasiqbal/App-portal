
import {
  PrayerTime,
  PrayerTimeUpdate,
  Dhikr,
  DhikrPayload,
  AdhkarGroup,
  AdhkarGroupPayload,
  Announcement,
  AnnouncementPayload,
  DonationFrequency,
  DonationOption,
  DonationOptionAudit,
  DonationOptionPayload,
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
  HowToGroup,
  HowToGroupPayload,
  HowToGuide,
  HowToGuidePayload,
  HowToGuideTree,
  HowToSection,
  HowToStep,
  HowToStepBlock,
  HowToStepImage,
  HowToLanguage,
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

function normalizeClockTo24Hour(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const twentyFour = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }

  const twelveHour = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (!twelveHour) return null;

  const hour12 = Number(twelveHour[1]);
  const minute = Number(twelveHour[2]);
  const suffix = twelveHour[3].toUpperCase();
  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null;

  const hour24 = suffix === 'PM' ? (hour12 % 12) + 12 : (hour12 % 12);
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function extractAnnouncementTimeParts(value: string): { primaryTime: string | null; richTimeText: string | null } {
  const richTimeText = value.trim();
  if (!richTimeText) return { primaryTime: null, richTimeText: null };

  const firstEntry = richTimeText
    .split(/\s*\|\s*|\n+/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0)
    ?? '';

  const rangeMatch = firstEntry.match(/^(.*?)\s*[-\u2013]\s*(.*?)$/);
  const primaryCandidate = (rangeMatch?.[1] ?? firstEntry).trim();
  let primaryTime = normalizeClockTo24Hour(primaryCandidate);

  if (!primaryTime) {
    const embeddedMatch = firstEntry.match(/(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)/);
    if (embeddedMatch) {
      primaryTime = normalizeClockTo24Hour(embeddedMatch[1]);
    }
  }

  return { primaryTime, richTimeText };
}

function isMissingColumnError(errorMessage: string, column: string): boolean {
  const lower = errorMessage.toLowerCase();
  if (!lower.includes(column.toLowerCase())) return false;
  return (
    lower.includes('does not exist')
    || lower.includes('schema cache')
    || lower.includes('could not find')
    || lower.includes('not found')
  );
}

function normalizeHowToGuideSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return normalized.length > 0 ? normalized : 'guide';
}

function normalizeHowToGroupSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return normalized.length > 0 ? normalized : 'howto-group';
}

async function ensureUniqueHowToGuideSlug(baseSlug: string): Promise<string> {
  const normalizedBase = normalizeHowToGuideSlug(baseSlug);
  let candidate = normalizedBase;
  let suffix = 1;

  while (true) {
    const { data, error } = await supabase
      .from('howto_guides')
      .select('id')
      .eq('slug', candidate)
      .limit(1);

    if (error) {
      throw new Error(`Failed checking guide slug: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return candidate;
    }

    suffix += 1;
    candidate = `${normalizedBase}-${suffix}`;
  }
}

async function ensureUniqueHowToGroupSlug(baseSlug: string): Promise<string> {
  const normalizedBase = normalizeHowToGroupSlug(baseSlug);
  let candidate = normalizedBase;
  let suffix = 1;

  while (true) {
    const { data, error } = await supabase
      .from('howto_groups')
      .select('id')
      .eq('slug', candidate)
      .limit(1);

    if (error) {
      throw new Error(`Failed checking group slug: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return candidate;
    }

    suffix += 1;
    candidate = `${normalizedBase}-${suffix}`;
  }
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
    start_time: row.start_time ?? row.event_time ?? row.time ?? null,
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
    const value = typeof start_time === 'string' ? start_time.trim() : '';
    if (!value) {
      mapped[ANNOUNCEMENTS_TIME_COLUMN] = null;
      mapped.event_time = null;
    } else {
      const { primaryTime, richTimeText } = extractAnnouncementTimeParts(value);
      mapped[ANNOUNCEMENTS_TIME_COLUMN] = primaryTime;
      if (richTimeText && richTimeText !== primaryTime) {
        mapped.event_time = richTimeText;
      }
    }
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
  const baseSelect = 'id,title,arabic_title,arabic,transliteration,translation,urdu_translation,reference,count,prayer_time,group_name,group_order,display_order,sections,is_active,tafsir,description,file_url,content_type,created_at,updated_at';
  const extendedSelect = `${baseSelect},content_source,content_key`;

  const buildQuery = (selectClause: string) => {
    let query = supabase
      .from('adhkar')
      .select(selectClause)
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

    return query;
  };

  let { data, error } = await buildQuery(extendedSelect);

  if (error && /content_source|content_key/i.test(error.message)) {
    const fallback = await buildQuery(baseSelect);
    data = fallback.data;
    error = fallback.error;
  }

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

// ─── How-To Guides (hierarchical schema) ───────────────────────────────────

export async function fetchHowToGroups(options?: {
  onlyActive?: boolean;
}): Promise<HowToGroup[]> {
  let query = supabase
    .from('howto_groups')
    .select('*')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (options?.onlyActive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch how-to groups: ${error.message}`);
  return (data ?? []) as HowToGroup[];
}

export async function createHowToGroup(data: Partial<HowToGroupPayload>): Promise<HowToGroup> {
  const { data: rows, error } = await supabase
    .from('howto_groups')
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(`Failed to create how-to group: ${error.message}`);
  return rows as HowToGroup;
}

export async function updateHowToGroup(id: string, data: Partial<HowToGroupPayload>): Promise<HowToGroup> {
  const { data: rows, error } = await supabase
    .from('howto_groups')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update how-to group: ${error.message}`);
  return rows as HowToGroup;
}

export async function deleteHowToGroup(
  id: string,
  options?: {
    deleteGuides?: boolean;
  },
): Promise<void> {
  const shouldDeleteGuides = options?.deleteGuides === true;

  if (shouldDeleteGuides) {
    const { error: guidesDeleteError } = await supabase
      .from('howto_guides')
      .delete()
      .eq('group_id', id);

    if (guidesDeleteError) {
      throw new Error(`Failed to delete guides in this group: ${guidesDeleteError.message}`);
    }
  }

  const { error } = await supabase
    .from('howto_groups')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete how-to group: ${error.message}`);
}

export async function fetchHowToGuides(options?: {
  groupId?: string;
  language?: HowToLanguage;
  onlyActive?: boolean;
}): Promise<HowToGuide[]> {
  let query = supabase
    .from('howto_guides')
    .select('*')
    .order('display_order', { ascending: true })
    .order('title', { ascending: true });

  if (options?.groupId) {
    query = query.eq('group_id', options.groupId);
  }

  if (options?.language) {
    query = query.eq('language', options.language);
  }

  if (options?.onlyActive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch how-to guides: ${error.message}`);
  return (data ?? []) as HowToGuide[];
}

export async function createHowToGuide(data: Partial<HowToGuidePayload>): Promise<HowToGuide> {
  const { data: rows, error } = await supabase
    .from('howto_guides')
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(`Failed to create how-to guide: ${error.message}`);
  return rows as HowToGuide;
}

export type HowToDemoSeedResult = {
  groupId: string;
  guideId: string;
  groupName: string;
  guideTitle: string;
};

export async function createHowToDemoGuide(language: HowToLanguage = 'en'): Promise<HowToDemoSeedResult> {
  const stamp = Date.now();
  const groupSlug = `demo-howto-group-${stamp}`;
  const guideSlug = `demo-howto-guide-${stamp}`;
  const groupName = `Demo How-To Group ${stamp}`;
  const guideTitle = `Demo How-To Guide ${stamp}`;

  const { data: group, error: groupError } = await supabase
    .from('howto_groups')
    .insert({
      slug: groupSlug,
      name: groupName,
      icon: 'menu-book',
      color: '#2e7d32',
      display_order: 999,
      is_active: true,
    })
    .select('*')
    .single();

  if (groupError || !group) {
    throw new Error(`Failed to create demo group: ${groupError?.message ?? 'Unknown error'}`);
  }

  const { data: guide, error: guideError } = await supabase
    .from('howto_guides')
    .insert({
      group_id: group.id,
      slug: guideSlug,
      title: guideTitle,
      subtitle: 'Portal demo entry',
      intro: 'This is a one-click demo guide created from the portal.',
      notes: ['Demo guide note. Edit or remove this in the tree editor.'],
      language,
      icon: 'menu-book',
      color: '#2e7d32',
      display_order: 999,
      is_active: true,
    })
    .select('*')
    .single();

  if (guideError || !guide) {
    throw new Error(`Failed to create demo guide: ${guideError?.message ?? 'Unknown error'}`);
  }

  const { data: section, error: sectionError } = await supabase
    .from('howto_sections')
    .insert({
      guide_id: guide.id,
      heading: 'Demo Section',
      section_order: 0,
    })
    .select('*')
    .single();

  if (sectionError || !section) {
    throw new Error(`Failed to create demo section: ${sectionError?.message ?? 'Unknown error'}`);
  }

  const { data: step, error: stepError } = await supabase
    .from('howto_steps')
    .insert({
      section_id: section.id,
      step_order: 0,
      title: 'Demo Step',
      detail: 'Open the tree editor and customize this step.',
      note: 'You can now publish or snapshot this guide.',
      rich_content_html: null,
    })
    .select('*')
    .single();

  if (stepError || !step) {
    throw new Error(`Failed to create demo step: ${stepError?.message ?? 'Unknown error'}`);
  }

  const { error: blockError } = await supabase
    .from('howto_step_blocks')
    .insert({
      step_id: step.id,
      block_order: 0,
      kind: 'text',
      payload: {
        text: 'Demo block content. Replace this with your real instructions.',
      },
    });

  if (blockError) {
    throw new Error(`Failed to create demo block: ${blockError.message}`);
  }

  return {
    groupId: group.id as string,
    guideId: guide.id as string,
    groupName,
    guideTitle,
  };
}

export async function updateHowToGuide(id: string, data: Partial<HowToGuidePayload>): Promise<HowToGuide> {
  const { data: rows, error } = await supabase
    .from('howto_guides')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update how-to guide: ${error.message}`);
  return rows as HowToGuide;
}

export async function deleteHowToGuide(id: string): Promise<void> {
  const { error } = await supabase
    .from('howto_guides')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete how-to guide: ${error.message}`);
}

export async function fetchHowToGuideTree(guideId: string): Promise<HowToGuideTree | null> {
  const { data: guide, error: guideError } = await supabase
    .from('howto_guides')
    .select('*')
    .eq('id', guideId)
    .maybeSingle();

  if (guideError) throw new Error(`Failed to fetch how-to guide: ${guideError.message}`);
  if (!guide) return null;

  const { data: sections, error: sectionsError } = await supabase
    .from('howto_sections')
    .select('*')
    .eq('guide_id', guideId)
    .order('section_order', { ascending: true });

  if (sectionsError) throw new Error(`Failed to fetch how-to sections: ${sectionsError.message}`);

  const sectionIds = (sections ?? []).map((section) => section.id);
  const { data: steps, error: stepsError } = await supabase
    .from('howto_steps')
    .select('*')
    .in('section_id', sectionIds.length > 0 ? sectionIds : ['00000000-0000-0000-0000-000000000000'])
    .order('step_order', { ascending: true });

  if (stepsError) throw new Error(`Failed to fetch how-to steps: ${stepsError.message}`);

  const stepIds = (steps ?? []).map((step) => step.id);
  const blockQuery = stepIds.length > 0
    ? supabase.from('howto_step_blocks').select('*').in('step_id', stepIds).order('block_order', { ascending: true })
    : Promise.resolve({ data: [], error: null } as { data: HowToStepBlock[]; error: null });
  const imageQuery = stepIds.length > 0
    ? supabase.from('howto_step_images').select('*').in('step_id', stepIds).order('display_order', { ascending: true })
    : Promise.resolve({ data: [], error: null } as { data: HowToStepImage[]; error: null });

  const [{ data: blocks, error: blocksError }, { data: images, error: imagesError }] = await Promise.all([blockQuery, imageQuery]);

  if (blocksError) throw new Error(`Failed to fetch how-to blocks: ${blocksError.message}`);
  if (imagesError) throw new Error(`Failed to fetch how-to images: ${imagesError.message}`);

  const stepsBySection = new Map<string, HowToStep[]>();
  for (const step of (steps ?? []) as HowToStep[]) {
    const list = stepsBySection.get(step.section_id) ?? [];
    list.push(step);
    stepsBySection.set(step.section_id, list);
  }

  const blocksByStep = new Map<string, HowToStepBlock[]>();
  for (const block of (blocks ?? []) as HowToStepBlock[]) {
    const list = blocksByStep.get(block.step_id) ?? [];
    list.push(block);
    blocksByStep.set(block.step_id, list);
  }

  const imagesByStep = new Map<string, HowToStepImage[]>();
  for (const image of (images ?? []) as HowToStepImage[]) {
    const list = imagesByStep.get(image.step_id) ?? [];
    list.push(image);
    imagesByStep.set(image.step_id, list);
  }

  return {
    guide: guide as HowToGuide,
    sections: ((sections ?? []) as HowToSection[]).map((section) => ({
      section,
      steps: (stepsBySection.get(section.id) ?? []).map((step) => ({
        step,
        blocks: blocksByStep.get(step.id) ?? [],
        images: imagesByStep.get(step.id) ?? [],
      })),
    })),
  };
}

export async function duplicateHowToGuideFromEnglish(
  sourceGuideId: string,
  options?: {
    targetGroupId?: string;
  },
): Promise<HowToGuide> {
  const sourceTree = await fetchHowToGuideTree(sourceGuideId);
  if (!sourceTree) {
    throw new Error('Source guide not found.');
  }

  if (sourceTree.guide.language !== 'en') {
    throw new Error('Only English guides can be duplicated into Urdu.');
  }

  const targetGroupId = options?.targetGroupId ?? sourceTree.guide.group_id;
  const { data: existingUrduCopy, error: existingUrduCopyError } = await supabase
    .from('howto_guides')
    .select('id, title, slug')
    .eq('language', 'ur')
    .eq('source_guide_id', sourceTree.guide.id)
    .eq('group_id', targetGroupId)
    .maybeSingle();

  if (existingUrduCopyError) {
    throw new Error(`Failed to check existing Urdu guide copy: ${existingUrduCopyError.message}`);
  }

  if (existingUrduCopy) {
    throw new Error(`Urdu copy already exists in target group (${String(existingUrduCopy.slug)}).`);
  }

  const nextSlug = await ensureUniqueHowToGuideSlug(`${sourceTree.guide.slug}-ur`);
  const guideNotes = Array.isArray(sourceTree.guide.notes) ? sourceTree.guide.notes : [];

  const { data: duplicatedGuide, error: duplicateError } = await supabase
    .from('howto_guides')
    .insert({
      group_id: targetGroupId,
      slug: nextSlug,
      source_guide_id: sourceTree.guide.id,
      title: sourceTree.guide.title,
      subtitle: sourceTree.guide.subtitle,
      intro: sourceTree.guide.intro,
      notes: guideNotes,
      language: 'ur',
      icon: sourceTree.guide.icon,
      color: sourceTree.guide.color,
      display_order: sourceTree.guide.display_order,
      is_active: false,
      publish_start_at: null,
      publish_end_at: null,
    })
    .select('*')
    .single();

  if (duplicateError || !duplicatedGuide) {
    throw new Error(`Failed to duplicate guide: ${duplicateError?.message ?? 'Unknown error'}`);
  }

  try {
    await saveHowToGuideTree(duplicatedGuide.id as string, {
      guideIntro: sourceTree.guide.intro ?? null,
      guideNotes,
      sections: sourceTree.sections.map((sectionEntry, sectionIndex) => ({
        heading: sectionEntry.section.heading,
        section_order: sectionIndex,
        steps: sectionEntry.steps.map((stepEntry, stepIndex) => ({
          step_order: stepIndex,
          title: stepEntry.step.title,
          detail: stepEntry.step.detail ?? null,
          note: stepEntry.step.note ?? null,
          rich_content_html: stepEntry.step.rich_content_html ?? null,
          blocks: stepEntry.blocks.map((blockEntry, blockIndex) => ({
            block_order: blockIndex,
            kind: blockEntry.kind,
            payload: (blockEntry.payload ?? {}) as Record<string, unknown>,
          })),
          images: stepEntry.images.map((imageEntry, imageIndex) => ({
            display_order: imageIndex,
            image_url: imageEntry.image_url,
            thumb_url: imageEntry.thumb_url,
            caption: imageEntry.caption,
            source: imageEntry.source,
          })),
        })),
      })),
    });
  } catch (error) {
    await supabase.from('howto_guides').delete().eq('id', duplicatedGuide.id as string);
    throw error;
  }

  return duplicatedGuide as HowToGuide;
}

export async function createLinkedUrduHowToGroupCopy(input: {
  sourceGroupId: string;
  targetUrduGroupName?: string;
  targetUrduGroupUrduName?: string;
}): Promise<HowToGroup> {
  const { data: sourceGroup, error: sourceGroupError } = await supabase
    .from('howto_groups')
    .select('*')
    .eq('id', input.sourceGroupId)
    .maybeSingle();

  if (sourceGroupError) {
    throw new Error(`Failed to load source group: ${sourceGroupError.message}`);
  }

  if (!sourceGroup) {
    throw new Error('Source group not found.');
  }

  const newGroupSlug = await ensureUniqueHowToGroupSlug(`${String(sourceGroup.slug)}-ur`);
  const newGroupName = input.targetUrduGroupName?.trim() || `${String(sourceGroup.name)} Urdu`;
  const newGroupUrduName = input.targetUrduGroupUrduName?.trim() || String(sourceGroup.urdu_name ?? sourceGroup.name ?? '');

  const { data: createdGroup, error: createdGroupError } = await supabase
    .from('howto_groups')
    .insert({
      slug: newGroupSlug,
      name: newGroupName,
      urdu_name: newGroupUrduName || null,
      source_group_id: sourceGroup.id,
      icon: sourceGroup.icon,
      color: sourceGroup.color,
      display_order: sourceGroup.display_order,
      is_active: sourceGroup.is_active,
    })
    .select('*')
    .single();

  if (createdGroupError || !createdGroup) {
    throw new Error(`Failed to create Urdu group copy: ${createdGroupError?.message ?? 'Unknown error'}`);
  }

  return createdGroup as HowToGroup;
}

export async function duplicateHowToGroupEntriesFromEnglish(input: {
  sourceGroupId: string;
  sourceGuideIds?: string[];
  targetGroupId?: string;
  createTargetUrduGroup?: boolean;
  targetUrduGroupName?: string;
  targetUrduGroupUrduName?: string;
}): Promise<{ guides: HowToGuide[]; targetGroupId: string }> {
  let targetGroupId = input.targetGroupId ?? input.sourceGroupId;

  if (input.createTargetUrduGroup) {
    const createdGroup = await createLinkedUrduHowToGroupCopy({
      sourceGroupId: input.sourceGroupId,
      targetUrduGroupName: input.targetUrduGroupName,
      targetUrduGroupUrduName: input.targetUrduGroupUrduName,
    });
    targetGroupId = String(createdGroup.id);
  }

  let guideIds = (input.sourceGuideIds ?? []).filter((id) => id.trim().length > 0);

  if (guideIds.length === 0) {
    const { data, error } = await supabase
      .from('howto_guides')
      .select('id')
      .eq('group_id', input.sourceGroupId)
      .eq('language', 'en')
      .order('display_order', { ascending: true })
      .order('title', { ascending: true });

    if (error) {
      throw new Error(`Failed to load source guides: ${error.message}`);
    }

    guideIds = (data ?? []).map((row) => String(row.id));
  }

  const duplicated: HowToGuide[] = [];
  for (const guideId of guideIds) {
    try {
      const nextGuide = await duplicateHowToGuideFromEnglish(guideId, { targetGroupId });
      duplicated.push(nextGuide);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown duplication error';
      if (message.startsWith('Urdu copy already exists in target group')) {
        continue;
      }
      throw error;
    }
  }

  return { guides: duplicated, targetGroupId };
}

export async function syncEnglishGuideToLinkedUrdu(sourceGuideId: string, payload: Partial<HowToGuidePayload>): Promise<number> {
  const { data: linked, error: linkedError } = await supabase
    .from('howto_guides')
    .select('id')
    .eq('language', 'ur')
    .eq('source_guide_id', sourceGuideId);

  if (linkedError) {
    throw new Error(`Failed to load linked Urdu guides: ${linkedError.message}`);
  }

  const linkedIds = (linked ?? []).map((row) => String(row.id));
  if (linkedIds.length === 0) return 0;

  const mirrorPayload: Partial<HowToGuidePayload> = { ...payload };
  delete mirrorPayload.slug;
  delete mirrorPayload.language;
  delete mirrorPayload.group_id;
  delete mirrorPayload.source_guide_id;

  if (Object.keys(mirrorPayload).length === 0) {
    return linkedIds.length;
  }

  const { error: updateError } = await supabase
    .from('howto_guides')
    .update(mirrorPayload)
    .in('id', linkedIds);

  if (updateError) {
    throw new Error(`Failed to mirror guide metadata to Urdu: ${updateError.message}`);
  }

  return linkedIds.length;
}

export async function syncEnglishGuideTreeToLinkedUrdu(sourceGuideId: string, input: HowToTreeSaveInput): Promise<number> {
  const { data: linked, error: linkedError } = await supabase
    .from('howto_guides')
    .select('id')
    .eq('language', 'ur')
    .eq('source_guide_id', sourceGuideId);

  if (linkedError) {
    throw new Error(`Failed to load linked Urdu guides: ${linkedError.message}`);
  }

  const linkedIds = (linked ?? []).map((row) => String(row.id));
  for (const urduGuideId of linkedIds) {
    await saveHowToGuideTree(urduGuideId, input);
  }

  return linkedIds.length;
}

export async function syncEnglishGroupToLinkedUrdu(sourceGroupId: string, payload: Partial<HowToGroupPayload>): Promise<number> {
  const { data: linked, error: linkedError } = await supabase
    .from('howto_groups')
    .select('id')
    .eq('source_group_id', sourceGroupId);

  if (linkedError) {
    throw new Error(`Failed to load linked Urdu groups: ${linkedError.message}`);
  }

  const linkedIds = (linked ?? []).map((row) => String(row.id));
  if (linkedIds.length === 0) return 0;

  const mirrorPayload: Partial<HowToGroupPayload> = { ...payload };
  delete mirrorPayload.slug;
  delete mirrorPayload.urdu_name;
  delete mirrorPayload.source_group_id;

  if (Object.keys(mirrorPayload).length === 0) {
    return linkedIds.length;
  }

  const { error: updateError } = await supabase
    .from('howto_groups')
    .update(mirrorPayload)
    .in('id', linkedIds);

  if (updateError) {
    throw new Error(`Failed to mirror group updates to Urdu groups: ${updateError.message}`);
  }

  return linkedIds.length;
}

export type HowToTreeSaveInput = {
  guideIntro: string | null;
  guideNotes: string[];
  sections: Array<{
    heading: string;
    section_order: number;
    steps: Array<{
      step_order: number;
      title: string;
      detail?: string | null;
      note?: string | null;
      rich_content_html?: string | null;
      blocks: Array<{
        block_order: number;
        kind: HowToStepBlock['kind'];
        payload: Record<string, unknown>;
      }>;
      images: Array<{
        display_order: number;
        image_url: string;
        thumb_url?: string | null;
        caption?: string | null;
        source?: string | null;
      }>;
    }>;
  }>;
};

export async function saveHowToGuideTree(guideId: string, input: HowToTreeSaveInput): Promise<void> {
  const { error: guideUpdateError } = await supabase
    .from('howto_guides')
    .update({ intro: input.guideIntro, notes: input.guideNotes })
    .eq('id', guideId);

  if (guideUpdateError) throw new Error(`Failed to save guide notes: ${guideUpdateError.message}`);

  const existing = await fetchHowToGuideTree(guideId);
  if (existing) {
    const sectionIds = existing.sections.map((item) => item.section.id);
    const stepIds = existing.sections.flatMap((item) => item.steps.map((step) => step.step.id));

    if (stepIds.length > 0) {
      await supabase.from('howto_step_blocks').delete().in('step_id', stepIds);
      await supabase.from('howto_step_images').delete().in('step_id', stepIds);
      await supabase.from('howto_steps').delete().in('id', stepIds);
    }

    if (sectionIds.length > 0) {
      await supabase.from('howto_sections').delete().in('id', sectionIds);
    }
  }

  if (input.sections.length === 0) return;

  const { data: sections, error: sectionsError } = await supabase
    .from('howto_sections')
    .insert(input.sections.map((section) => ({
      guide_id: guideId,
      heading: section.heading,
      section_order: section.section_order,
    })))
    .select('*');

  if (sectionsError) throw new Error(`Failed to save sections: ${sectionsError.message}`);

  const sectionByOrder = new Map<number, string>();
  for (const section of sections ?? []) {
    sectionByOrder.set(section.section_order as number, section.id as string);
  }

  const stepInsertRows: Array<{
    section_id: string;
    step_order: number;
    title: string;
    detail: string | null;
    note: string | null;
    rich_content_html: string | null;
  }> = [];

  for (const section of input.sections) {
    const sectionId = sectionByOrder.get(section.section_order);
    if (!sectionId) continue;
    for (const step of section.steps) {
      stepInsertRows.push({
        section_id: sectionId,
        step_order: step.step_order,
        title: step.title,
        detail: step.detail ?? null,
        note: step.note ?? null,
        rich_content_html: step.rich_content_html ?? null,
      });
    }
  }

  const { data: steps, error: stepsError } = await supabase
    .from('howto_steps')
    .insert(stepInsertRows)
    .select('*');

  if (stepsError) throw new Error(`Failed to save steps: ${stepsError.message}`);

  const stepByComposite = new Map<string, string>();
  for (const step of steps ?? []) {
    stepByComposite.set(`${step.section_id}::${step.step_order}`, step.id as string);
  }

  const blockRows: Array<{ step_id: string; block_order: number; kind: HowToStepBlock['kind']; payload: Record<string, unknown> }> = [];
  const imageRows: Array<{ step_id: string; display_order: number; image_url: string; thumb_url: string | null; caption: string | null; source: string | null }> = [];

  for (const section of input.sections) {
    const sectionId = sectionByOrder.get(section.section_order);
    if (!sectionId) continue;

    for (const step of section.steps) {
      const stepId = stepByComposite.get(`${sectionId}::${step.step_order}`);
      if (!stepId) continue;

      for (const block of step.blocks) {
        blockRows.push({
          step_id: stepId,
          block_order: block.block_order,
          kind: block.kind,
          payload: block.payload,
        });
      }

      for (const image of step.images) {
        imageRows.push({
          step_id: stepId,
          display_order: image.display_order,
          image_url: image.image_url,
          thumb_url: image.thumb_url ?? null,
          caption: image.caption ?? null,
          source: image.source ?? null,
        });
      }
    }
  }

  if (blockRows.length > 0) {
    const { error: blocksError } = await supabase.from('howto_step_blocks').insert(blockRows);
    if (blocksError) throw new Error(`Failed to save blocks: ${blocksError.message}`);
  }

  if (imageRows.length > 0) {
    const { error: imagesError } = await supabase.from('howto_step_images').insert(imageRows);
    if (imagesError) throw new Error(`Failed to save images: ${imagesError.message}`);
  }
}

export async function publishHowToGuide(input: {
  guideId: string;
  isActive: boolean;
  publishStartAt?: string | null;
  publishEndAt?: string | null;
}): Promise<void> {
  const { error } = await invokeExternalFunction<{ data?: unknown; error?: string }>('howto-publish', {
    guideId: input.guideId,
    isActive: input.isActive,
    publishStartAt: input.publishStartAt ?? null,
    publishEndAt: input.publishEndAt ?? null,
  });

  if (error) {
    throw new Error(`Failed to publish how-to guide: ${error}`);
  }
}

export async function createHowToVersionSnapshot(guideId: string): Promise<void> {
  const { error } = await invokeExternalFunction<{ data?: unknown; error?: string }>('howto-version-snapshot', {
    guideId,
  });

  if (error) {
    throw new Error(`Failed to create guide snapshot: ${error}`);
  }
}

export async function uploadHowToMedia(input: {
  guideId: string;
  stepId: string;
  fileName: string;
  contentType: string;
  base64Data: string;
}): Promise<{ image_url: string; thumb_url: string; path: string }> {
  const { data, error } = await invokeExternalFunction<{ data?: { image_url: string; thumb_url: string; path: string }; error?: string }>('howto-media-upload', input);

  if (error) {
    throw new Error(`Failed to upload how-to media: ${error}`);
  }

  if (!data?.data) {
    throw new Error(data?.error ?? 'How-to media upload returned empty response.');
  }

  return data.data;
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
  const insertQuery = (rowPayload: Record<string, unknown>) => supabase
    .from(ANNOUNCEMENTS_TABLE)
    .insert(rowPayload)
    .select()
    .single();

  let { data: rows, error } = await insertQuery(payload);

  if (error && 'event_time' in payload && isMissingColumnError(error.message, 'event_time')) {
    const retryPayload = { ...payload };
    delete retryPayload.event_time;
    ({ data: rows, error } = await insertQuery(retryPayload));
  }

  if (error) throw new Error(`Failed to create announcement: ${error.message}`);
  return mapAnnouncementFromDb(rows as AnnouncementDbRow);
}

export async function updateAnnouncement(id: string, data: Partial<AnnouncementPayload>): Promise<Announcement> {
  const payload = mapAnnouncementPayloadToDb(data);
  const updateQuery = (rowPayload: Record<string, unknown>) => supabase
    .from(ANNOUNCEMENTS_TABLE)
    .update(rowPayload)
    .eq('id', id)
    .select()
    .single();

  let { data: rows, error } = await updateQuery(payload);

  if (error && 'event_time' in payload && isMissingColumnError(error.message, 'event_time')) {
    const retryPayload = { ...payload };
    delete retryPayload.event_time;
    ({ data: rows, error } = await updateQuery(retryPayload));
  }

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

// ─── Donation Options ───────────────────────────────────────────────────────

export async function fetchDonationOptions(options?: {
  includeInactive?: boolean;
  frequency?: DonationFrequency;
}): Promise<DonationOption[]> {
  let query = supabase
    .from('donation_options')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('pin_order', { ascending: true })
    .order('global_order', { ascending: true })
    .order('frequency', { ascending: true })
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq('is_active', true);
  }

  if (options?.frequency) {
    query = query.eq('frequency', options.frequency);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch donation options: ${error.message}`);
  return (data ?? []) as DonationOption[];
}

export async function createDonationOption(data: Partial<DonationOptionPayload>): Promise<DonationOption> {
  const { data: row, error } = await supabase
    .from('donation_options')
    .insert(data)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create donation option: ${error.message}`);
  return row as DonationOption;
}

export async function createDonationOptionWithStripe(data: Partial<DonationOptionPayload>): Promise<DonationOption> {
  const { data: result, error } = await invokeExternalFunction<DonationOption | { error?: string }>(
    'create-donation-option-stripe',
    { option: data },
  );

  if (error) {
    throw new Error(`Failed to create donation option with Stripe: ${error}`);
  }

  if (!result || typeof result !== 'object') {
    throw new Error('Donation create function returned an empty response.');
  }

  if ('error' in result && typeof result.error === 'string' && result.error) {
    throw new Error(result.error);
  }

  return result as DonationOption;
}

export async function updateDonationOption(
  id: string,
  data: Partial<DonationOptionPayload>
): Promise<DonationOption> {
  const { data: row, error } = await supabase
    .from('donation_options')
    .update(data)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update donation option: ${error.message}`);
  return row as DonationOption;
}

export async function deleteDonationOption(id: string): Promise<void> {
  const { error } = await supabase
    .from('donation_options')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete donation option: ${error.message}`);
}

export async function bulkReorderDonationOptions(
  updates: Array<{
    id: string;
    pin_order: number;
    display_order: number;
    global_order: number;
  }>
): Promise<void> {
  if (updates.length === 0) return;

  const now = new Date().toISOString();

  await Promise.all(
    updates.map(async (entry) => {
      const { error } = await supabase
        .from('donation_options')
        .update({
          pin_order: entry.pin_order,
          display_order: entry.display_order,
          global_order: entry.global_order,
          updated_at: now,
        })
        .eq('id', entry.id);

      if (error) {
        throw new Error(`Failed to reorder donation option ${entry.id}: ${error.message}`);
      }
    })
  );
}

export async function fetchDonationOptionAudit(limit = 100): Promise<DonationOptionAudit[]> {
  const { data, error } = await supabase
    .from('donation_option_audit')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch donation option audit: ${error.message}`);
  return (data ?? []) as DonationOptionAudit[];
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

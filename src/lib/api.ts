
import { PrayerTime, PrayerTimeUpdate, Dhikr, DhikrPayload, AdhkarGroup, AdhkarGroupPayload, Announcement, AnnouncementPayload, SunnahReminder, SunnahReminderPayload, SunnahGroup, SunnahGroupPayload } from '@/types';
import { supabase } from '@/lib/supabase';

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
  const { data: rows, error } = await supabase
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

export async function fetchAdhkar(category?: string): Promise<Dhikr[]> {
  let query = supabase
    .from('adhkar')
    .select('id,title,arabic_title,arabic,transliteration,translation,reference,count,prayer_time,group_name,group_order,display_order,is_active,description,file_url,created_at,updated_at')
    .order('prayer_time', { ascending: true })
    .order('group_order', { ascending: true })
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (category) {
    query = query.eq('prayer_time', category);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch adhkar: ${error.message}`);
  return data as Dhikr[];
}

export async function createDhikr(data: Partial<DhikrPayload>): Promise<Dhikr> {
  console.log('createDhikr payload:', JSON.stringify(data));
  const { data: rows, error } = await supabase
    .from('adhkar')
    .insert(data)
    .select()
    .single();
  if (error) {
    console.error('createDhikr error:', error);
    throw new Error(`Failed to create dhikr: ${error.message}`);
  }
  return rows as Dhikr;
}

export async function updateDhikr(id: string, data: Partial<DhikrPayload>): Promise<Dhikr> {
  const { data: rows, error } = await supabase
    .from('adhkar')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('updateDhikr error:', error);
    throw new Error(`Failed to update dhikr: ${error.message}`);
  }
  return rows as Dhikr;
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

// ─── Announcements ───────────────────────────────────────────────────────────

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to fetch announcements: ${error.message}`);
  return data as Announcement[];
}

export async function createAnnouncement(data: Partial<AnnouncementPayload>): Promise<Announcement> {
  const payload = { is_active: true, ...data };
  const { data: rows, error } = await supabase
    .from('announcements')
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(`Failed to create announcement: ${error.message}`);
  return rows as Announcement;
}

export async function updateAnnouncement(id: string, data: Partial<AnnouncementPayload>): Promise<Announcement> {
  const { data: rows, error } = await supabase
    .from('announcements')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`Failed to update announcement: ${error.message}`);
  return rows as Announcement;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase
    .from('announcements')
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

  console.log(`Month ${month}: upserting ${payload.length} rows`, payload.slice(0, 2));

  // Single upsert call — OnSpace Cloud anon key has full permissive policies
  // so this will INSERT new rows and UPDATE existing ones in one shot.
  const { data, error } = await supabase
    .from('prayer_times')
    .upsert(payload, { onConflict: 'month,day', ignoreDuplicates: false })
    .select();

  if (error) {
    console.error(`Upsert failed for month ${month}:`, error.message, error);
    // Fallback: try individual updates if upsert constraint doesn't exist
    return await _fallbackUpdateMonth(month, rows);
  }

  console.log(`Month ${month}: upserted ${data?.length ?? 0} rows successfully`);

  // Always re-fetch to confirm DB state and return fresh data
  return await fetchPrayerTimes(month);
}

/** Fallback: update each row individually when upsert constraint is missing */
async function _fallbackUpdateMonth(
  month: number,
  rows: { day: number; fields: PrayerTimeUpdate }[]
): Promise<PrayerTime[]> {
  console.log(`Month ${month}: falling back to individual updates`);

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
    const results = await Promise.all(
      toUpdate.map(({ id, fields }) =>
        supabase.from('prayer_times').update(fields).eq('id', id)
      )
    );
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      console.error(`Month ${month}: ${failed.length} update(s) failed`, failed[0].error);
    }
  }

  // Insert any new rows
  if (toInsert.length > 0) {
    const { error } = await supabase.from('prayer_times').insert(toInsert);
    if (error) console.error(`Month ${month}: insert failed`, error.message);
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

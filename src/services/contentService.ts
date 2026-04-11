/**
 * Content Service
 * Announcements and Sunnah Reminders database operations.
 * Flow: UI → Hook (React Query) → Service → Supabase
 */

import {
  fetchAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  fetchSunnahReminders,
  createSunnahReminder,
  updateSunnahReminder,
  deleteSunnahReminder,
  fetchSunnahGroups,
  createSunnahGroup,
  updateSunnahGroup,
  deleteSunnahGroup,
} from '#/lib/api';
import type {
  Announcement,
  AnnouncementPayload,
  SunnahReminder,
  SunnahReminderPayload,
  SunnahGroup,
  SunnahGroupPayload,
} from '#/types';

// ─── Announcements ────────────────────────────────────────────────────────────

export const announcementsService = {
  getAll: (): Promise<Announcement[]> => fetchAnnouncements(),
  create: (data: Partial<AnnouncementPayload>): Promise<Announcement> => createAnnouncement(data),
  update: (id: string, data: Partial<AnnouncementPayload>): Promise<Announcement> => updateAnnouncement(id, data),
  delete: (id: string): Promise<void> => deleteAnnouncement(id),
  filterActive: (announcements: Announcement[]): Announcement[] =>
    announcements.filter((a) => a.is_active),
};

// ─── Sunnah Reminders ─────────────────────────────────────────────────────────

export const sunnahService = {
  getAll: (category?: string): Promise<SunnahReminder[]> => fetchSunnahReminders(category),
  create: (data: Partial<SunnahReminderPayload>): Promise<SunnahReminder> => createSunnahReminder(data),
  update: (id: string, data: Partial<SunnahReminderPayload>): Promise<SunnahReminder> => updateSunnahReminder(id, data),
  delete: (id: string): Promise<void> => deleteSunnahReminder(id),
  filterActive: (reminders: SunnahReminder[]): SunnahReminder[] =>
    reminders.filter((r) => r.is_active),
  groupByCategory: (reminders: SunnahReminder[]): Map<string, SunnahReminder[]> => {
    const map = new Map<string, SunnahReminder[]>();
    for (const r of reminders) {
      const key = r.category ?? 'general';
      const existing = map.get(key) ?? [];
      existing.push(r);
      map.set(key, existing);
    }
    return map;
  },
};

// ─── Sunnah Groups ────────────────────────────────────────────────────────────

export const sunnahGroupsService = {
  getAll: (): Promise<SunnahGroup[]> => fetchSunnahGroups(),
  create: (data: Partial<SunnahGroupPayload>): Promise<SunnahGroup> => createSunnahGroup(data),
  update: (id: string, data: Partial<SunnahGroupPayload>): Promise<SunnahGroup> => updateSunnahGroup(id, data),
  delete: (id: string): Promise<void> => deleteSunnahGroup(id),
};

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
  fetchDonationOptions,
  createDonationOption,
  updateDonationOption,
  deleteDonationOption,
  bulkReorderDonationOptions,
  fetchDonationOptionAudit,
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
  DonationFrequency,
  DonationOption,
  DonationOptionAudit,
  DonationOptionPayload,
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

// ─── Donation Options ───────────────────────────────────────────────────────

export const donationOptionsService = {
  getAll: (options?: { includeInactive?: boolean; frequency?: DonationFrequency }): Promise<DonationOption[]> =>
    fetchDonationOptions(options),
  create: (data: Partial<DonationOptionPayload>): Promise<DonationOption> => createDonationOption(data),
  update: (id: string, data: Partial<DonationOptionPayload>): Promise<DonationOption> => updateDonationOption(id, data),
  delete: (id: string): Promise<void> => deleteDonationOption(id),
  reorder: (updates: Array<{ id: string; pin_order: number; display_order: number; global_order: number }>): Promise<void> =>
    bulkReorderDonationOptions(updates),
  getAudit: (limit = 100): Promise<DonationOptionAudit[]> => fetchDonationOptionAudit(limit),
  filterActive: (options: DonationOption[]): DonationOption[] => options.filter((option) => option.is_active),
  groupByFrequency: (options: DonationOption[]): Map<DonationFrequency, DonationOption[]> => {
    const grouped = new Map<DonationFrequency, DonationOption[]>([
      ['one-off', []],
      ['monthly', []],
    ]);

    for (const option of options) {
      const bucket = grouped.get(option.frequency) ?? [];
      bucket.push(option);
      grouped.set(option.frequency, bucket);
    }

    return grouped;
  },
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

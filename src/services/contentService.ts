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
  fetchIslamicCalendarEvents,
  fetchCalendarEventsForMonth,
  createIslamicCalendarEvent,
  updateIslamicCalendarEvent,
  deleteIslamicCalendarEvent,
  upsertIslamicCalendarEvents,
} from '#/lib/api';
import type {
  Announcement,
  AnnouncementPayload,
  DonationFrequency,
  DonationOption,
  DonationOptionAudit,
  DonationOptionPayload,
  IslamicCalendarEvent,
  IslamicCalendarEventPayload,
  IslamicCalendarEventType,
  CalendarMonthEvent,
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

// ─── Islamic Calendar Events ────────────────────────────────────────────────

export const islamicCalendarEventsService = {
  getAll: (options?: {
    year?: number;
    month?: number;
    day?: number;
    eventType?: IslamicCalendarEventType;
  }): Promise<IslamicCalendarEvent[]> => fetchIslamicCalendarEvents(options),
  getMonthFeed: (year: number, month: number): Promise<CalendarMonthEvent[]> =>
    fetchCalendarEventsForMonth(year, month),
  create: (data: Partial<IslamicCalendarEventPayload>): Promise<IslamicCalendarEvent> => createIslamicCalendarEvent(data),
  update: (id: string, data: Partial<IslamicCalendarEventPayload>): Promise<IslamicCalendarEvent> => updateIslamicCalendarEvent(id, data),
  delete: (id: string): Promise<void> => deleteIslamicCalendarEvent(id),
  bulkUpsert: (rows: Array<Partial<IslamicCalendarEventPayload>>): Promise<IslamicCalendarEvent[]> => upsertIslamicCalendarEvents(rows),
  groupByType: (events: IslamicCalendarEvent[]): Map<IslamicCalendarEventType, IslamicCalendarEvent[]> => {
    const grouped = new Map<IslamicCalendarEventType, IslamicCalendarEvent[]>([
      ['important_date', []],
      ['masjid_event', []],
    ]);

    for (const event of events) {
      const bucket = grouped.get(event.event_type) ?? [];
      bucket.push(event);
      grouped.set(event.event_type, bucket);
    }

    return grouped;
  },
};

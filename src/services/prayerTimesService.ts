/**
 * Prayer Times Service
 * All prayer time database operations go through this service.
 * Flow: UI → Hook (React Query) → Service → Supabase
 */

import {
  fetchPrayerTimes,
  updatePrayerTime,
  bulkUpdatePrayerTimes,
  bulkUpdatePrayerTimesFromCsv,
  bulkUpdatePrayerTimesFromYearCsv,
} from '#/lib/api';
import type { PrayerTime, PrayerTimeUpdate } from '#/types';

export const prayerTimesService = {
  /** Fetch all prayer times for a given month (1-12). Omit month to fetch all. */
  getByMonth: (month?: number): Promise<PrayerTime[]> =>
    fetchPrayerTimes(month),

  /** Update a single prayer time row by ID. */
  update: (id: string, data: PrayerTimeUpdate): Promise<PrayerTime[]> =>
    updatePrayerTime(id, data),

  /** Update multiple prayer time rows in a single DB call (e.g. bulk Jumu'ah update). */
  bulkUpdate: (ids: string[], data: PrayerTimeUpdate): Promise<PrayerTime[]> =>
    bulkUpdatePrayerTimes(ids, data),

  /** Apply CSV-parsed rows to the prayer times for a single month. */
  applyMonthCsv: (
    month: number,
    rows: { day: number; fields: PrayerTimeUpdate }[]
  ): Promise<PrayerTime[]> =>
    bulkUpdatePrayerTimesFromCsv(month, rows),

  /** Apply CSV-parsed rows spanning an entire year (keyed by month). */
  applyYearCsv: (
    rowsByMonth: Map<number, { day: number; fields: PrayerTimeUpdate }[]>
  ): Promise<Map<number, PrayerTime[]>> =>
    bulkUpdatePrayerTimesFromYearCsv(rowsByMonth),

  /** Return the row matching today's date from a pre-fetched month array. */
  getTodayRow: (rows: PrayerTime[]): PrayerTime | undefined => {
    const today = new Date();
    return rows.find((r) => r.month === today.getMonth() + 1 && r.day === today.getDate());
  },

  /** Check how many days in a month have all 5 prayer start times populated. */
  getCompleteDayCount: (rows: PrayerTime[]): number =>
    rows.filter((r) => r.fajr && r.zuhr && r.asr && r.maghrib && r.isha).length,

  /** Check how many rows have a given jamaat field populated. */
  getJamaatCoverage: (
    rows: PrayerTime[],
    field: keyof PrayerTime
  ): number => rows.filter((r) => Boolean(r[field])).length,
};

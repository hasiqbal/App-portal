/**
 * Adhkaar Service
 * All adhkar and adhkar group database operations.
 * Flow: UI → Hook (React Query) → Service → Supabase
 */

import {
  fetchAdhkar,
  createDhikr,
  updateDhikr,
  deleteDhikr,
  fetchAdhkarGroups,
  createAdhkarGroup,
  updateAdhkarGroup,
  deleteAdhkarGroup,
} from '#/lib/api';
import type { Dhikr, DhikrPayload, AdhkarGroup, AdhkarGroupPayload } from '#/types';

// ─── Adhkar (individual dhikr entries) ───────────────────────────────────────

export const adhkaarService = {
  /** Fetch all adhkar, optionally filtered by prayer_time category slug. */
  getAll: (category?: string): Promise<Dhikr[]> =>
    fetchAdhkar(category),

  /** Create a new dhikr entry. */
  create: (data: Partial<DhikrPayload>): Promise<Dhikr> =>
    createDhikr(data),

  /** Update an existing dhikr entry by ID. */
  update: (id: string, data: Partial<DhikrPayload>): Promise<Dhikr> =>
    updateDhikr(id, data),

  /** Delete a dhikr entry by ID. */
  delete: (id: string): Promise<void> =>
    deleteDhikr(id),

  /** Filter adhkar by active status. */
  filterActive: (adhkar: Dhikr[]): Dhikr[] =>
    adhkar.filter((d) => d.is_active),

  /** Group a flat adhkar list by their group_name field. */
  groupByName: (adhkar: Dhikr[]): Map<string | null, Dhikr[]> => {
    const map = new Map<string | null, Dhikr[]>();
    for (const d of adhkar) {
      const key = d.group_name ?? null;
      const existing = map.get(key) ?? [];
      existing.push(d);
      map.set(key, existing);
    }
    return map;
  },
};

// ─── Adhkar Groups (metadata / categories) ───────────────────────────────────

export const adhkaarGroupsService = {
  /** Fetch all group definitions sorted by display_order. */
  getAll: (): Promise<AdhkarGroup[]> =>
    fetchAdhkarGroups(),

  /** Create a new group. */
  create: (data: Partial<AdhkarGroupPayload>): Promise<AdhkarGroup> =>
    createAdhkarGroup(data),

  /** Update an existing group by ID. */
  update: (id: string, data: Partial<AdhkarGroupPayload>): Promise<AdhkarGroup> =>
    updateAdhkarGroup(id, data),

  /** Delete a group by ID. */
  delete: (id: string): Promise<void> =>
    deleteAdhkarGroup(id),
};

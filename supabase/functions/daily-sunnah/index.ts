import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TARGETS_CACHE_TTL_MS = 60_000;
const LINKS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PERSISTED_MAP_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-GB,en;q=0.9',
};

type CollectionKey = 'adab' | 'riyadussalihin' | 'shamail';

type CollectionDef = {
  key: CollectionKey;
  title: string;
};

const COLLECTIONS: CollectionDef[] = [
  { key: 'adab', title: 'Al-Adab Al-Mufrad' },
  { key: 'riyadussalihin', title: 'Riyad as-Salihin' },
  { key: 'shamail', title: 'Ash-Shama\'il Al-Muhammadiyah' },
];

const COLLECTION_MAP = new Map<CollectionKey, CollectionDef>(
  COLLECTIONS.map((entry) => [entry.key, entry]),
);

const COLLECTION_BOOK_FALLBACK_MAX: Record<CollectionKey, number> = {
  adab: 57,
  riyadussalihin: 19,
  shamail: 56,
};

type ScrapeTarget = {
  id: string;
  collection_key: CollectionKey;
  book_number: number;
  hadith_number: number;
  enabled: boolean;
  weight: number;
  display_order: number;
};

type ParseResult = {
  arabic: string;
  narrator: string;
  preview: string;
  text: string;
  ref: string;
  idInBook: number;
  bookTitle: string;
};

let targetsCache: ScrapeTarget[] | null = null;
let targetsCacheUpdatedAt = 0;
const collectionBooksCache = new Map<CollectionKey, { updatedAt: number; books: number[] }>();
const bookHadithsCache = new Map<string, { updatedAt: number; hadiths: number[] }>();

type AdminClient = ReturnType<typeof createClient>;

function getAdminClient(): AdminClient | null {
  if (!SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function toHadithKey(target: Pick<ScrapeTarget, 'collection_key' | 'book_number' | 'hadith_number'>): string {
  return `${target.collection_key}/${target.book_number}/${target.hadith_number}`;
}

function getCollectionCacheKey(collectionKey: CollectionKey): string {
  return `collection:${collectionKey}:books`;
}

function getBookCacheKey(collectionKey: CollectionKey, bookNumber: number): string {
  return `book:${collectionKey}:${bookNumber}:hadiths`;
}

function normalizeNumberList(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return uniqueSortedNumbers(
    values
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v) && v > 0),
  );
}

async function readPersistedMapCache(
  admin: AdminClient,
  cacheKey: string,
): Promise<{ numbers: number[]; updatedAtMs: number } | null> {
  const { data, error } = await admin
    .from('hadith_scrape_map_cache')
    .select('numbers, updated_at')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (error || !data) return null;

  const numbers = normalizeNumberList(data.numbers);
  if (numbers.length === 0) return null;

  const updatedAtMs = Date.parse(String(data.updated_at ?? ''));
  return {
    numbers,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
  };
}

async function writePersistedMapCache(admin: AdminClient, cacheKey: string, numbers: number[]): Promise<void> {
  const payload = {
    cache_key: cacheKey,
    numbers,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from('hadith_scrape_map_cache')
    .upsert(payload, { onConflict: 'cache_key' });

  if (error) {
    console.warn('[daily-sunnah] failed to persist map cache', { cacheKey, error: error.message });
  }
}

async function getSeenHadithKeys(admin: AdminClient): Promise<Set<string>> {
  const { data, error } = await admin
    .from('hadith_scrape_history')
    .select('hadith_key');

  if (error || !data) {
    if (error) {
      console.warn('[daily-sunnah] failed to load hadith history', error.message);
    }
    return new Set<string>();
  }

  return new Set(
    data
      .map((row) => String((row as { hadith_key?: string }).hadith_key ?? '').trim())
      .filter((key) => key.length > 0),
  );
}

async function recordServedHadith(admin: AdminClient, target: ScrapeTarget): Promise<void> {
  const hadithKey = toHadithKey(target);
  const nowIso = new Date().toISOString();
  const { data: existing, error: lookupError } = await admin
    .from('hadith_scrape_history')
    .select('id, serve_count, first_served_at')
    .eq('hadith_key', hadithKey)
    .maybeSingle();

  if (lookupError) {
    console.warn('[daily-sunnah] failed to read hadith history row', {
      hadithKey,
      error: lookupError.message,
    });
    return;
  }

  if (!existing) {
    const { error: insertError } = await admin.from('hadith_scrape_history').insert({
      hadith_key: hadithKey,
      collection_key: target.collection_key,
      book_number: target.book_number,
      hadith_number: target.hadith_number,
      source_url: buildSunnahUrl(target),
      first_served_at: nowIso,
      last_served_at: nowIso,
      serve_count: 1,
    });

    if (insertError) {
      console.warn('[daily-sunnah] failed to insert hadith history row', {
        hadithKey,
        error: insertError.message,
      });
    }
    return;
  }

  const nextCount = Math.max(1, Number(existing.serve_count ?? 1)) + 1;
  const firstServedAt = String(existing.first_served_at ?? nowIso);
  const { error: updateError } = await admin
    .from('hadith_scrape_history')
    .update({
      collection_key: target.collection_key,
      book_number: target.book_number,
      hadith_number: target.hadith_number,
      source_url: buildSunnahUrl(target),
      first_served_at: firstServedAt,
      last_served_at: nowIso,
      serve_count: nextCount,
    })
    .eq('hadith_key', hadithKey);

  if (updateError) {
    console.warn('[daily-sunnah] failed to update hadith history row', {
      hadithKey,
      error: updateError.message,
    });
  }
}

function normalizeEnglishHonorifics(value: string): string {
  return value
    .replace(/ï·º|ï·¼|ï·»|ﷺ/gi, 'ﷺ')
    .replace(/\bS\.?\s*A\.?\s*W\.?\b/gi, 'ﷺ')
    .replace(/\bP\.?\s*B\.?\s*U\.?\s*H\.?\b/gi, 'ﷺ')
    .replace(/\(\s*SAW\s*\)/gi, '(ﷺ)')
    .replace(/\(\s*PBUH\s*\)/gi, '(ﷺ)')
    .replace(/,?\s*may\s+allah\s+bless\s+him\s+and\s+grant\s+him\s+peace\.?/gi, ' ﷺ')
    .replace(/,?\s*may\s+allah\s+bless\s+him\s+and\s+give\s+him\s+peace\.?/gi, ' ﷺ')
    .replace(/,?\s*allah\s+bless\s+him\s+and\s+grant\s+him\s+peace\.?/gi, ' ﷺ')
    .replace(/,?\s*allah\s+bless\s+him\s+and\s+give\s+him\s+peace\.?/gi, ' ﷺ')
    .replace(/\(\s*(?:ra|r\.a\.?|radyallahu\s+anhu)\s*\)/gi, '(رضي الله عنه)')
    .replace(/\(\s*(?:radyallahu\s+anha|raha)\s*\)/gi, '(رضي الله عنها)')
    .replace(/\(\s*(?:radyallahu\s+anhuma|rahuma)\s*\)/gi, '(رضي الله عنهما)')
    .replace(/\(\s*(?:radyallahu\s+anhum|rahum)\s*\)/gi, '(رضي الله عنهم)')
    .replace(/,?\s*may\s+allah\s+be\s+pleased\s+with\s+him\.?/gi, ' رضي الله عنه')
    .replace(/,?\s*may\s+allah\s+be\s+pleased\s+with\s+her\.?/gi, ' رضي الله عنها')
    .replace(/,?\s*may\s+allah\s+be\s+pleased\s+with\s+both\s+of\s+them\.?/gi, ' رضي الله عنهما')
    .replace(/,?\s*may\s+allah\s+be\s+pleased\s+with\s+them\.?/gi, ' رضي الله عنهم')
    .replace(/,?\s*allah\s+be\s+pleased\s+with\s+him\.?/gi, ' رضي الله عنه')
    .replace(/,?\s*allah\s+be\s+pleased\s+with\s+her\.?/gi, ' رضي الله عنها')
    .replace(/,?\s*allah\s+be\s+pleased\s+with\s+both\s+of\s+them\.?/gi, ' رضي الله عنهما')
    .replace(/,?\s*allah\s+be\s+pleased\s+with\s+them\.?/gi, ' رضي الله عنهم');
}

function getUtcDayStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function getUtcDayNumber(dayStamp: string): number {
  const d = new Date(`${dayStamp}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor(d.getTime() / 86_400_000);
}

function getUtcSlotIndex(date = new Date()): number {
  return Math.floor(date.getUTCHours() / 8);
}

function parseBoolParam(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function clampInt(value: string | null, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed || 1;

  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const j = state % (i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }

  return out;
}

function randomShuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function pickWeightedTarget(targets: ScrapeTarget[], seed: number): ScrapeTarget | null {
  if (targets.length === 0) return null;

  const totalWeight = targets.reduce((sum, t) => sum + Math.max(1, Number(t.weight || 1)), 0);
  const pick = seed % totalWeight;
  let cursor = 0;

  for (const target of targets) {
    cursor += Math.max(1, Number(target.weight || 1));
    if (pick < cursor) return target;
  }

  return targets[0] ?? null;
}

function pickThreeDailyTargets(targets: ScrapeTarget[], dayStamp: string): ScrapeTarget[] {
  if (targets.length <= 3) return [...targets];

  const available = [...targets];
  const picked: ScrapeTarget[] = [];

  for (let slot = 0; slot < 3 && available.length > 0; slot += 1) {
    const seed = hashSeed(`jmn:${dayStamp}:slot:${slot}`);
    const selected = pickWeightedTarget(available, seed);
    if (!selected) break;
    picked.push(selected);
    const selectedId = selected.id;
    const next = available.filter((target) => target.id !== selectedId);
    available.length = 0;
    available.push(...next);
  }

  if (picked.length >= 3) return picked;

  const existing = new Set(picked.map((target) => target.id));
  const fill = seededShuffle(
    targets.filter((target) => !existing.has(target.id)),
    hashSeed(`jmn:${dayStamp}:fill`),
  );
  return [...picked, ...fill].slice(0, Math.min(3, targets.length));
}

function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function buildIntegerRange(min: number, max: number): number[] {
  const out: number[] = [];
  for (let n = min; n <= max; n += 1) out.push(n);
  return out;
}

function extractNumbersFromLinks(html: string, pattern: RegExp): number[] {
  const numbers: number[] = [];
  const matches = html.matchAll(pattern);
  for (const match of matches) {
    const raw = match[1];
    if (!raw) continue;
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) {
      numbers.push(n);
    }
  }
  return uniqueSortedNumbers(numbers);
}

async function fetchSunnahHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      ...FETCH_HEADERS,
      'Cache-Control': 'no-cache',
    },
  });
  if (!response.ok) {
    throw new Error(`sunnah.com status ${response.status} for ${url}`);
  }
  return await response.text();
}

async function getCollectionBookNumbers(
  collectionKey: CollectionKey,
  admin: AdminClient | null,
): Promise<number[]> {
  const cached = collectionBooksCache.get(collectionKey);
  const now = Date.now();
  if (cached && now - cached.updatedAt < LINKS_CACHE_TTL_MS) {
    return cached.books;
  }

  const cacheKey = getCollectionCacheKey(collectionKey);
  let persisted: { numbers: number[]; updatedAtMs: number } | null = null;
  if (admin) {
    persisted = await readPersistedMapCache(admin, cacheKey);
    if (persisted && now - persisted.updatedAtMs < PERSISTED_MAP_CACHE_MAX_AGE_MS) {
      collectionBooksCache.set(collectionKey, { updatedAt: now, books: persisted.numbers });
      return persisted.numbers;
    }
  }

  let normalizedBooks: number[] = [];
  try {
    const url = `https://sunnah.com/${collectionKey}`;
    const html = await fetchSunnahHtml(url);
    const books = extractNumbersFromLinks(
      html,
      new RegExp(
        `href=(?:"|')(?:(?:https?:)?//sunnah\\.com)?/?${collectionKey}/(\\d+)(?:/)?(?:"|')`,
        'gi',
      ),
    );
    normalizedBooks = books;
  } catch {
    normalizedBooks = [];
  }

  if (normalizedBooks.length === 0 && persisted?.numbers?.length) {
    normalizedBooks = persisted.numbers;
  }

  if (normalizedBooks.length === 0) {
    normalizedBooks = buildIntegerRange(1, COLLECTION_BOOK_FALLBACK_MAX[collectionKey]);
  }

  if (admin && normalizedBooks.length > 0) {
    await writePersistedMapCache(admin, cacheKey, normalizedBooks);
  }

  collectionBooksCache.set(collectionKey, { updatedAt: now, books: normalizedBooks });
  return normalizedBooks;
}

async function getBookHadithNumbers(
  collectionKey: CollectionKey,
  bookNumber: number,
  admin: AdminClient | null,
): Promise<number[]> {
  const cacheKey = `${collectionKey}:${bookNumber}`;
  const cached = bookHadithsCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.updatedAt < LINKS_CACHE_TTL_MS) {
    return cached.hadiths;
  }

  const persistedKey = getBookCacheKey(collectionKey, bookNumber);
  let persisted: { numbers: number[]; updatedAtMs: number } | null = null;
  if (admin) {
    persisted = await readPersistedMapCache(admin, persistedKey);
    if (persisted && now - persisted.updatedAtMs < PERSISTED_MAP_CACHE_MAX_AGE_MS) {
      bookHadithsCache.set(cacheKey, { updatedAt: now, hadiths: persisted.numbers });
      return persisted.numbers;
    }
  }

  let normalizedHadiths: number[] = [];
  try {
    const url = `https://sunnah.com/${collectionKey}/${bookNumber}`;
    const html = await fetchSunnahHtml(url);
    const hadiths = extractNumbersFromLinks(
      html,
      new RegExp(
        `href=(?:"|')(?:(?:https?:)?//sunnah\\.com)?/?${collectionKey}/${bookNumber}/(\\d+)(?:/)?(?:"|')`,
        'gi',
      ),
    );
    normalizedHadiths = hadiths;
  } catch {
    normalizedHadiths = [];
  }

  if (normalizedHadiths.length === 0 && persisted?.numbers?.length) {
    normalizedHadiths = persisted.numbers;
  }

  if (normalizedHadiths.length === 0) {
    normalizedHadiths = [1];
  }

  if (admin && normalizedHadiths.length > 0) {
    await writePersistedMapCache(admin, persistedKey, normalizedHadiths);
  }

  bookHadithsCache.set(cacheKey, { updatedAt: now, hadiths: normalizedHadiths });
  return normalizedHadiths;
}

async function buildDynamicTargetForCollection(
  collectionKey: CollectionKey,
  _dayStamp: string,
  _slotIndex: number,
  admin: AdminClient | null,
): Promise<ScrapeTarget | null> {
  const books = await getCollectionBookNumbers(collectionKey, admin);
  if (books.length === 0) return null;

  const shuffledBooks = randomShuffle(books);
  const bookProbeLimit = Math.min(8, books.length);

  for (let i = 0; i < bookProbeLimit; i += 1) {
    const idx = i;
    const bookNumber = shuffledBooks[idx];
    const hadithNumbers = await getBookHadithNumbers(collectionKey, bookNumber, admin);
    if (hadithNumbers.length === 0) continue;

    const hadithPool = randomShuffle(hadithNumbers);
    const hadithNumber = hadithPool[0];

    return {
      id: `dynamic:${collectionKey}:${bookNumber}:${hadithNumber}`,
      collection_key: collectionKey,
      book_number: bookNumber,
      hadith_number: hadithNumber,
      enabled: true,
      weight: 1,
      display_order: idx,
    };
  }

  return null;
}

async function buildDynamicTargetsForCollection(
  collectionKey: CollectionKey,
  _dayStamp: string,
  _slotIndex: number,
  limit: number,
  admin: AdminClient | null,
): Promise<ScrapeTarget[]> {
  const books = await getCollectionBookNumbers(collectionKey, admin);
  if (books.length === 0 || limit <= 0) return [];

  const shuffledBooks = randomShuffle(books);
  const bookProbeLimit = Math.min(Math.max(limit * 2, 12), books.length);

  const out: ScrapeTarget[] = [];
  const seenKeys = new Set<string>();
  for (let i = 0; i < bookProbeLimit && out.length < limit; i += 1) {
    const idx = i;
    const bookNumber = shuffledBooks[idx];
    const hadithNumbers = await getBookHadithNumbers(collectionKey, bookNumber, admin);
    if (hadithNumbers.length === 0) continue;

    const hadithPool = randomShuffle(hadithNumbers);
    const hadithNumber = hadithPool[0];
    const key = `${collectionKey}:${bookNumber}:${hadithNumber}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    out.push({
      id: `dynamic:${collectionKey}:${bookNumber}:${hadithNumber}`,
      collection_key: collectionKey,
      book_number: bookNumber,
      hadith_number: hadithNumber,
      enabled: true,
      weight: 1,
      display_order: idx,
    });
  }

  return out;
}

async function buildPreviewSchedule(
  targets: ScrapeTarget[],
  startDayStamp: string,
  days: number,
  admin: AdminClient | null,
) {
  const collections = uniqueSortedStrings(targets.map((target) => target.collection_key))
    .filter((value): value is CollectionKey => COLLECTION_MAP.has(value as CollectionKey));

  const rows: Array<{
    dayStamp: string;
    slot: number;
    selectedCollection: CollectionKey;
    selectedSource: 'dynamic' | 'fallback';
    selectedUrl: string;
    selectedBookNumber: number;
    selectedHadithNumber: number;
    collectionCycle: Array<{
      collection: CollectionKey;
      source: 'dynamic' | 'fallback-none';
      bookNumber: number | null;
      hadithNumber: number | null;
      url: string | null;
    }>;
  }> = [];

  const coverageByCollection = new Map<CollectionKey, Set<number>>();
  for (const collection of collections) {
    coverageByCollection.set(collection, new Set<number>());
  }

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const date = new Date(`${startDayStamp}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    const dayStamp = getUtcDayStamp(date);
    const slotTargets = pickThreeDailyTargets(targets, dayStamp);

    for (let slotIndex = 0; slotIndex < 3; slotIndex += 1) {
      const firstPick = slotTargets[slotIndex % slotTargets.length] ?? null;
      if (!firstPick) continue;

      const collectionCycle: Array<{
        collection: CollectionKey;
        source: 'dynamic' | 'fallback-none';
        bookNumber: number | null;
        hadithNumber: number | null;
        url: string | null;
      }> = [];

      for (const collection of collections) {
        const dynamic = await buildDynamicTargetForCollection(collection, dayStamp, slotIndex, admin);
        if (!dynamic) {
          collectionCycle.push({
            collection,
            source: 'fallback-none',
            bookNumber: null,
            hadithNumber: null,
            url: null,
          });
          continue;
        }

        coverageByCollection.get(collection)?.add(dynamic.book_number);
        collectionCycle.push({
          collection,
          source: 'dynamic',
          bookNumber: dynamic.book_number,
          hadithNumber: dynamic.hadith_number,
          url: buildSunnahUrl(dynamic),
        });
      }

      const selectedDynamic = await buildDynamicTargetForCollection(
        firstPick.collection_key,
        dayStamp,
        slotIndex,
        admin,
      );

      const selected = selectedDynamic ?? firstPick;
      const selectedSource: 'dynamic' | 'fallback' = selectedDynamic ? 'dynamic' : 'fallback';
      coverageByCollection.get(selected.collection_key)?.add(selected.book_number);

      rows.push({
        dayStamp,
        slot: slotIndex + 1,
        selectedCollection: selected.collection_key,
        selectedSource,
        selectedUrl: buildSunnahUrl(selected),
        selectedBookNumber: selected.book_number,
        selectedHadithNumber: selected.hadith_number,
        collectionCycle,
      });
    }
  }

  const coverage = collections.map((collection) => ({
    collection,
    uniqueBooksInWindow: coverageByCollection.get(collection)?.size ?? 0,
  }));

  return { coverage, rows };
}

function uniqueSortedStrings(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: '\'',
    rsquo: '’',
    lsquo: '‘',
    ldquo: '“',
    rdquo: '”',
  };

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_m, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    }

    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    }

    return named[entity] ?? _m;
  });
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function cleanText(value: string): string {
  return normalizeWhitespace(stripHtml(decodeHtmlEntities(value)));
}

function extractFirstGroup(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && typeof match[1] === 'string' && match[1].trim().length > 0) {
      return match[1];
    }
  }

  return null;
}

function parseSunnahPage(html: string, target: ScrapeTarget): ParseResult | null {
  const collectionTitle = COLLECTION_MAP.get(target.collection_key)?.title ?? target.collection_key;

  const narratorRaw = extractFirstGroup(html, [
    /<div class=hadith_narrated>([\s\S]*?)<\/div>/i,
    /<div class="hadith_narrated">([\s\S]*?)<\/div>/i,
  ]) ?? '';

  const englishRaw = extractFirstGroup(html, [
    /<div class=text_details>([\s\S]*?)<\/div>/i,
    /<div class="text_details">([\s\S]*?)<\/div>/i,
  ]);

  if (!englishRaw) return null;

  const arabicRaw = extractFirstGroup(html, [
    /<span class="arabic_text_details arabic">([\s\S]*?)<\/span>/i,
    /<div class="arabic_hadith_full arabic">([\s\S]*?)<\/div>/i,
  ]) ?? '';

  const referenceRaw = extractFirstGroup(html, [
    /<tr><td><b>Reference<\/b><\/td><td>[^:]*:[^<]*([^<]+)<\/td><\/tr>/i,
    /<div class="hadith_reference_sticky">([\s\S]*?)<\/div>/i,
  ]);

  const inBookRefRaw = extractFirstGroup(html, [
    /<tr><td>In-book reference<\/td><td>[^<]*Hadith\s*(\d+)[^<]*<\/td><\/tr>/i,
    /In-book reference[^\d]*Book\s*\d+\s*,\s*Hadith\s*(\d+)/i,
  ]);

  const bookTitleRaw = extractFirstGroup(html, [
    /<div class="hadith_reference_sticky">([\s\S]*?)<\/div>/i,
    /<div class="book_page_english_name">([\s\S]*?)<\/div>/i,
  ]);

  const narrator = normalizeEnglishHonorifics(cleanText(narratorRaw));
  const english = normalizeEnglishHonorifics(cleanText(englishRaw));
  const arabic = cleanText(arabicRaw);
  const reference = cleanText(referenceRaw ?? `${collectionTitle} ${target.hadith_number}`);

  if (!english) return null;

  const bookTitle = cleanText(bookTitleRaw ?? collectionTitle)
    .replace(/\s+\d[\d,\s]*$/g, '')
    .trim() || collectionTitle;

  const text = narrator ? `${narrator}\n\n${english}` : english;
  const preview = text.length > 120 ? `${text.slice(0, 120).trimEnd()}...` : text;
  const idInBook = Number(inBookRefRaw ?? target.hadith_number) || target.hadith_number;

  return {
    arabic,
    narrator,
    preview,
    text,
    ref: reference,
    idInBook,
    bookTitle,
  };
}

function buildSunnahUrl(target: ScrapeTarget): string {
  return `https://sunnah.com/${target.collection_key}/${target.book_number}/${target.hadith_number}`;
}

async function getScrapeTargets(): Promise<ScrapeTarget[]> {
  if (!SERVICE_ROLE_KEY) {
    return [];
  }

  const now = Date.now();
  if (targetsCache && now - targetsCacheUpdatedAt < TARGETS_CACHE_TTL_MS) {
    return targetsCache;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from('hadith_scrape_targets')
    .select('id, collection_key, book_number, hadith_number, enabled, weight, display_order')
    .eq('enabled', true)
    .order('display_order', { ascending: true })
    .order('collection_key', { ascending: true })
    .order('book_number', { ascending: true })
    .order('hadith_number', { ascending: true });

  if (error) {
    console.warn('[daily-sunnah] failed to load scrape targets:', error.message);
    return [];
  }

  targetsCache = (data ?? []) as ScrapeTarget[];
  targetsCacheUpdatedAt = now;
  return targetsCache;
}

async function scrapeTarget(target: ScrapeTarget): Promise<ParseResult | null> {
  const url = buildSunnahUrl(target);
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`sunnah.com status ${response.status} for ${url}`);
  }

  const html = await response.text();
  return parseSunnahPage(html, target);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const admin = getAdminClient();
    const requestUrl = new URL(req.url);
    const dayStamp = getUtcDayStamp();
    const slotIndex = getUtcSlotIndex();

    const targets = await getScrapeTargets();
    if (targets.length === 0) {
      return new Response(
        JSON.stringify({ noCandidate: true, reason: 'No enabled scrape targets configured.' }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
          },
        },
      );
    }

    if (parseBoolParam(requestUrl.searchParams.get('preview'))) {
      const previewDays = clampInt(requestUrl.searchParams.get('preview_days'), 1, 30, 7);
      const schedule = await buildPreviewSchedule(targets, dayStamp, previewDays, admin);

      return new Response(
        JSON.stringify({
          mode: 'preview',
          startDayStamp: dayStamp,
          days: previewDays,
          generatedAtUtc: new Date().toISOString(),
          coverage: schedule.coverage,
          rows: schedule.rows,
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const slotTargets = pickThreeDailyTargets(targets, dayStamp);
    const firstPick = slotTargets[slotIndex % slotTargets.length] ?? null;
    if (!firstPick) {
      return new Response(
        JSON.stringify({ noCandidate: true, reason: 'No weighted target available.' }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
          },
        },
      );
    }

    const rest = targets.filter((target) => target.id !== firstPick.id);
    const orderedRest = seededShuffle(rest, hashSeed(`fallback:${dayStamp}:slot:${slotIndex}`));

    const orderedCollections = [
      firstPick.collection_key,
      ...orderedRest.map((target) => target.collection_key),
    ].filter((value, index, arr) => arr.indexOf(value) === index);

    const attemptOrder: ScrapeTarget[] = [];
    for (const collectionKey of orderedCollections) {
      try {
        const dynamicTargets = await buildDynamicTargetsForCollection(
          collectionKey,
          dayStamp,
          slotIndex,
          6,
          admin,
        );
        attemptOrder.push(...dynamicTargets);
      } catch (err) {
        console.warn('[daily-sunnah] dynamic target build failed', {
          collectionKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Keep curated entries as hard fallback if dynamic link discovery fails.
    attemptOrder.push(firstPick, ...orderedRest);

    const dedupedAttempts: ScrapeTarget[] = [];
    const dedupedSeen = new Set<string>();
    for (const target of attemptOrder) {
      const key = toHadithKey(target);
      if (dedupedSeen.has(key)) continue;
      dedupedSeen.add(key);
      dedupedAttempts.push(target);
    }

    const seenHadithKeys = admin ? await getSeenHadithKeys(admin) : new Set<string>();
    const unseenAttempts = dedupedAttempts.filter((target) => !seenHadithKeys.has(toHadithKey(target)));
    const seenAttempts = dedupedAttempts.filter((target) => seenHadithKeys.has(toHadithKey(target)));
    const finalAttempts = unseenAttempts.length > 0
      ? [...unseenAttempts, ...seenAttempts]
      : dedupedAttempts;

    for (let i = 0; i < finalAttempts.length; i += 1) {
      const target = finalAttempts[i];
      try {
        const parsed = await scrapeTarget(target);
        if (!parsed) {
          console.warn('[daily-sunnah] parse failed for target', {
            targetId: target.id,
            url: buildSunnahUrl(target),
          });
          continue;
        }

        if (admin) {
          await recordServedHadith(admin, target);
        }

        return new Response(
          JSON.stringify({
            arabic: parsed.arabic,
            narrator: parsed.narrator,
            preview: parsed.preview,
            text: parsed.text,
            ref: parsed.ref,
            idInBook: parsed.idInBook,
            bookTitle: parsed.bookTitle,
            chapterNumber: target.book_number,
            hadithNumber: target.hadith_number,
            sourceLabel: `${parsed.bookTitle} - Chapter ${target.book_number} - Hadith ${target.hadith_number}`,
            selectionMode: i === 0
              ? `sunnah-random-utc-slot-${slotIndex + 1}`
              : `sunnah-random-utc-slot-${slotIndex + 1}-fallback-${i}`,
            selectionSlot: slotIndex + 1,
            sourceApi: 'sunnah.com',
            sourceUrl: buildSunnahUrl(target),
          }),
          {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=3600',
            },
          },
        );
      } catch (err) {
        console.warn('[daily-sunnah] scrape attempt failed', {
          targetId: target.id,
          url: buildSunnahUrl(target),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return new Response(
      JSON.stringify({ noCandidate: true, reason: 'No parseable hadith found for today.' }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      },
    );
  } catch (err) {
    console.error('[daily-sunnah] error:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch daily hadith' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

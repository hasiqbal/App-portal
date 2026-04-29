import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const HADITH_API_KEY = Deno.env.get('HADITHAPI_KEY') ?? '';
const HADITH_API_BASE = 'https://hadithapi.com/api';
const MAX_BOOK_PROBES = 3;
const HADITHS_PER_CHAPTER_FETCH = 25;

type CollectionDef = {
  key: string;
  bookSlug: string;
  title: string;
};

const COLLECTIONS: CollectionDef[] = [
  { key: 'bukhari', bookSlug: 'sahih-bukhari', title: 'Sahih al-Bukhari' },
  { key: 'muslim', bookSlug: 'sahih-muslim', title: 'Sahih Muslim' },
  { key: 'tirmidhi', bookSlug: 'al-tirmidhi', title: 'Jami at-Tirmidhi' },
  { key: 'abudawud', bookSlug: 'abu-dawood', title: 'Sunan Abu Dawood' },
  { key: 'ibnmajah', bookSlug: 'ibn-e-majah', title: 'Sunan Ibn-e-Majah' },
  { key: 'nasai', bookSlug: 'sunan-nasai', title: 'Sunan An-Nasai' },
];

const SHAMAIL_TOPIC_KEYWORDS = [
  'character', 'manners', 'conduct', 'behavior', 'mercy', 'compassion', 'kindness',
  'gentle', 'humble', 'modesty', 'truthful', 'honest', 'smile', 'patience', 'generous',
  'description', 'appearance', 'face', 'complexion', 'hair', 'beard', 'eyes',
  'height', 'build', 'walk', 'gait', 'garment', 'clothing', 'perfume', 'fragrance',
  'hands', 'teeth', 'voice',
];

const HADITH_EXCLUDE_RANDOM_KEYWORDS = [
  'hudud', 'qisas', 'diyat', 'apostasy', 'riba', 'inheritance', 'menstruation', 'nifas',
];

type InclusionRule = {
  collection_key: string;
  include_scope: 'book' | 'section';
  section_number: number | null;
  enabled: boolean;
};

type HadithApiRow = {
  hadithNumber?: string;
  englishNarrator?: string;
  hadithEnglish?: string;
  hadithArabic?: string;
  headingEnglish?: string | null;
  chapterId?: string;
};

type Candidate = {
  collectionKey: string;
  bookTitle: string;
  hadithNumber: number;
  arabic: string;
  text: string;
  ref: string;
};

let inclusionRulesCache: InclusionRule[] | null = null;
let inclusionRulesUpdatedAt = 0;
const RULES_CACHE_TTL_MS = 60_000;

function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getUTCFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

function normalizeForSearch(value: string): string {
  return value.toLowerCase();
}

function hasBlockedKeyword(candidate: Candidate): boolean {
  const haystack = normalizeForSearch(`${candidate.ref} ${candidate.text}`);
  return HADITH_EXCLUDE_RANDOM_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function getShamailScore(candidate: Candidate): number {
  const haystack = normalizeForSearch(`${candidate.ref} ${candidate.text.slice(0, 320)} ${candidate.arabic.slice(0, 200)}`);
  let score = 0;
  for (const keyword of SHAMAIL_TOPIC_KEYWORDS) {
    if (haystack.includes(keyword.toLowerCase())) {
      score += 1;
    }
  }
  return score;
}

function buildApiUrl(path: string, query: Record<string, string | number>): string {
  const search = new URLSearchParams();
  search.set('apiKey', HADITH_API_KEY);
  for (const [k, v] of Object.entries(query)) {
    search.set(k, String(v));
  }
  return `${HADITH_API_BASE}${path}?${search.toString()}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`hadithapi.com error ${res.status}`);
  return await res.json() as T;
}

async function getInclusionRules(): Promise<InclusionRule[]> {
  if (!SERVICE_ROLE_KEY) return [];

  const now = Date.now();
  if (inclusionRulesCache && now - inclusionRulesUpdatedAt < RULES_CACHE_TTL_MS) {
    return inclusionRulesCache;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from('hadith_inclusion_rules')
    .select('collection_key, include_scope, section_number, enabled')
    .eq('enabled', true);

  if (error) {
    console.warn('[daily-sunnah] failed to load inclusion rules:', error.message);
    return [];
  }

  inclusionRulesCache = (data ?? []) as InclusionRule[];
  inclusionRulesUpdatedAt = now;
  return inclusionRulesCache;
}

function resolveActiveCollections(inclusionRules: InclusionRule[]): CollectionDef[] {
  if (inclusionRules.length === 0) return COLLECTIONS;

  const byCollection = new Map<string, InclusionRule[]>();
  for (const rule of inclusionRules) {
    if (!byCollection.has(rule.collection_key)) {
      byCollection.set(rule.collection_key, []);
    }
    byCollection.get(rule.collection_key)?.push(rule);
  }

  const enabled = COLLECTIONS.filter((c) => (byCollection.get(c.key) ?? []).length > 0);
  return enabled.length > 0 ? enabled : COLLECTIONS;
}

function resolveSectionRules(inclusionRules: InclusionRule[], collectionKey: string): number[] {
  return inclusionRules
    .filter((r) => r.collection_key === collectionKey && r.include_scope === 'section' && typeof r.section_number === 'number')
    .map((r) => Number(r.section_number))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function resolveChapterNumber(collection: CollectionDef, sectionRules: number[], daySeed: number): Promise<number | null> {
  if (sectionRules.length > 0) {
    return sectionRules[daySeed % sectionRules.length];
  }

  const chaptersUrl = buildApiUrl(`/${collection.bookSlug}/chapters`, { paginate: 1 });
  const chaptersData = await fetchJson<{ chapters?: { total?: number } }>(chaptersUrl);
  const total = Number(chaptersData?.chapters?.total ?? 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  return ((daySeed * 31) % total) + 1;
}

function mapHadithRow(row: HadithApiRow, collection: CollectionDef): Candidate | null {
  const hadithNo = Number(row.hadithNumber ?? 0);
  const english = String(row.hadithEnglish ?? '').trim();
  const arabic = String(row.hadithArabic ?? '').trim();
  const heading = String(row.headingEnglish ?? '').trim();
  const narrator = String(row.englishNarrator ?? '').trim();
  if (!Number.isFinite(hadithNo) || hadithNo <= 0 || english.length === 0) return null;

  const text = [narrator, english].filter(Boolean).join('\n\n');
  const ref = `${collection.title}, Hadith ${hadithNo}${heading ? ` - ${heading}` : ''}`;

  return {
    collectionKey: collection.key,
    bookTitle: collection.title,
    hadithNumber: hadithNo,
    arabic,
    text,
    ref,
  };
}

async function fetchChapterCandidates(collection: CollectionDef, chapterNumber: number): Promise<Candidate[]> {
  const hadithsUrl = buildApiUrl('/hadiths', {
    book: collection.bookSlug,
    chapter: chapterNumber,
    paginate: HADITHS_PER_CHAPTER_FETCH,
  });

  const payload = await fetchJson<{ hadiths?: { data?: HadithApiRow[] } }>(hadithsUrl);
  const rows = payload?.hadiths?.data ?? [];
  return rows
    .map((row) => mapHadithRow(row, collection))
    .filter((row): row is Candidate => !!row);
}

function pickFromPool(candidates: Candidate[], daySeed: number, mode: string): { candidate: Candidate; mode: string } | null {
  if (candidates.length === 0) return null;

  const keywordSafe = candidates.filter((c) => !hasBlockedKeyword(c));
  const shamailSafe = keywordSafe.filter((c) => getShamailScore(c) > 0);

  const finalPool = shamailSafe.length > 0
    ? shamailSafe
    : keywordSafe.length > 0
      ? keywordSafe
      : candidates;

  const sorted = [...finalPool].sort((a, b) => {
    const scoreDiff = getShamailScore(b) - getShamailScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    if (a.collectionKey !== b.collectionKey) return a.collectionKey.localeCompare(b.collectionKey);
    return a.hadithNumber - b.hadithNumber;
  });

  const selected = sorted[daySeed % sorted.length];
  const resolvedMode = shamailSafe.length > 0
    ? `${mode}+shamail`
    : keywordSafe.length > 0
      ? `${mode}+keywords`
      : `${mode}+no-filter`;

  return { candidate: selected, mode: resolvedMode };
}

async function selectDailyCandidate(activeCollections: CollectionDef[], inclusionRules: InclusionRule[], daySeed: number): Promise<{
  candidate: Candidate;
  selectionMode: string;
} | null> {
  const probes = Math.min(MAX_BOOK_PROBES, activeCollections.length);
  const probeCollections: CollectionDef[] = [];
  for (let i = 0; i < probes; i += 1) {
    probeCollections.push(activeCollections[(daySeed + i) % activeCollections.length]);
  }

  let fallbackPool: Candidate[] = [];

  for (let i = 0; i < probeCollections.length; i += 1) {
    const collection = probeCollections[i];
    try {
      const sectionRules = resolveSectionRules(inclusionRules, collection.key);
      const chapter = await resolveChapterNumber(collection, sectionRules, daySeed + i * 7);
      if (!chapter) continue;

      const candidates = await fetchChapterCandidates(collection, chapter);
      if (candidates.length === 0) continue;

      // Keep a weak fallback pool if nothing matches shamaail from all probes.
      fallbackPool = fallbackPool.concat(candidates.slice(0, 4));

      const picked = pickFromPool(candidates, daySeed + i * 13, 'hadithapi');
      if (picked) {
        return { candidate: picked.candidate, selectionMode: picked.mode };
      }
    } catch (err) {
      console.warn(`[daily-sunnah] probe failed for ${collection.bookSlug}:`, err);
    }
  }

  const fallbackPicked = pickFromPool(fallbackPool, daySeed, 'hadithapi-fallback');
  if (fallbackPicked) {
    return { candidate: fallbackPicked.candidate, selectionMode: fallbackPicked.mode };
  }

  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!HADITH_API_KEY) {
      return new Response(
        JSON.stringify({ noCandidate: true, reason: 'Missing HADITHAPI_KEY secret' }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
          },
        },
      );
    }

    const daySeed = dayOfYear();
    const inclusionRules = await getInclusionRules();
    const activeCollections = resolveActiveCollections(inclusionRules);
    const selected = await selectDailyCandidate(activeCollections, inclusionRules, daySeed);

    if (!selected) {
      return new Response(
        JSON.stringify({
          noCandidate: true,
          reason: 'No hadith candidate available from hadithapi.com',
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
          },
        },
      );
    }

    const text = selected.candidate.text;
    const preview = text.length > 120 ? `${text.slice(0, 120).trimEnd()}...` : text;

    return new Response(
      JSON.stringify({
        arabic: selected.candidate.arabic,
        narrator: '',
        preview,
        text,
        ref: selected.candidate.ref,
        idInBook: selected.candidate.hadithNumber,
        bookTitle: selected.candidate.bookTitle,
        selectionMode: selected.selectionMode,
        sourceApi: 'hadithapi.com',
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

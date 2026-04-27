import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// fawazahmed0/hadith-api served via jsDelivr CDN
const BASE = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';

type CollectionDef = {
  key: string;
  englishEdition: string;
  arabicEdition: string;
  title: string;
};

const COLLECTIONS: CollectionDef[] = [
  { key: 'nawawi', englishEdition: 'eng-nawawi', arabicEdition: 'ara-nawawi', title: 'The Forty Hadith of Imam Nawawi' },
  { key: 'bukhari', englishEdition: 'eng-bukhari', arabicEdition: 'ara-bukhari', title: 'Sahih al-Bukhari' },
  { key: 'muslim', englishEdition: 'eng-muslim', arabicEdition: 'ara-muslim', title: 'Sahih Muslim' },
  { key: 'abudawud', englishEdition: 'eng-abudawud', arabicEdition: 'ara-abudawud', title: 'Sunan Abu Dawud' },
  { key: 'tirmidhi', englishEdition: 'eng-tirmidhi', arabicEdition: 'ara-tirmidhi', title: 'Jami at-Tirmidhi' },
  { key: 'nasai', englishEdition: 'eng-nasai', arabicEdition: 'ara-nasai', title: 'Sunan an-Nasai' },
  { key: 'ibnmajah', englishEdition: 'eng-ibnmajah', arabicEdition: 'ara-ibnmajah', title: 'Sunan Ibn Majah' },
];

const HADITH_EXCLUDE_RANDOM_KEYWORDS = [
  'fiqh', 'rulings', 'legal', 'injunctions', 'rules of law', 'detailed rules',
  'detailed injunctions', 'permissible', 'impermissible', 'halal', 'haram', 'lawful',
  'unlawful', 'permitted', 'forbidden', 'prohibited', 'disliked', 'makruh', 'obligatory',
  'wajib', 'fard', "sunnah mu'akkadah", 'conditions', 'pillars', 'validity', 'invalid',
  'invalidates', 'expiation', 'kaffarah', 'menstruation', 'menses', 'haidh', 'nifas',
  'post-natal', 'postnatal', 'sexual impurity', 'janaba', 'ghusl', 'bath', 'toilet',
  'urination', 'defecation', 'impurities', 'tayammum', 'wiping over socks', 'marriage',
  'nikah', 'divorce', 'talaq', 'iddah', "li'an", 'breastfeeding', 'suckling', 'custody',
  'inheritance', 'shares of inheritance', "fara'id", 'wills', 'bequests', 'sales', 'trade',
  'business', 'transactions', 'loans', 'debt', 'mortgage', 'pledges', 'riba', 'usury',
  'partnership', 'bankruptcy', 'leasing', 'renting', 'agriculture', 'irrigation',
  'pre-emption', 'punishments', 'hudud', 'legal punishments', 'blood money', 'diyat',
  'retaliation', 'qisas', 'theft', 'stoning', 'apostates', 'apostasy', 'testimony',
  'witnesses', 'judgements', 'judgments', 'judge', 'court', 'oaths', 'vows', 'jihad',
  'fighting', 'military expeditions', 'maghazi', 'campaigns', 'spoils', 'booty', 'one-fifth',
  'prisoners', 'treaties', 'tribute', 'kharaj', 'rulership', 'leadership disputes', 'rebellion',
  'hunting', 'game', 'slaughter', 'sacrifice', 'udhiyah', 'aqiqah', 'intoxicants',
  'forbidden drinks', 'wine rulings', 'medicine', 'medical treatment', 'dreams',
  'interpretation of dreams', 'ruqyah', 'magic', 'evil eye', 'tribulations', 'fitan',
  'trials', 'signs of the hour', 'dajjal', 'mahdi', 'major signs', 'minor signs', 'apocalypse',
];

interface HadithEntry {
  hadithnumber: number;
  arabicnumber: number;
  text: string;
  grades: unknown[];
  reference: { book: number; hadith: number };
}

interface EditionJson {
  metadata?: {
    name?: string;
    section?: Record<string, string>;
    sections?: Record<string, string>;
  };
  hadiths: HadithEntry[];
}

type InclusionRule = {
  collection_key: string;
  include_scope: 'book' | 'section';
  section_number: number | null;
  enabled: boolean;
};

type EditionBundle = {
  english: HadithEntry[];
  arabicByHadithNo: Map<number, string>;
  sectionTitles: Map<number, string>;
};

type Candidate = {
  collectionKey: string;
  bookTitle: string;
  hadith: HadithEntry;
  arabic: string;
  sectionTitle: string;
  ref: string;
};

let editionCache: Map<string, EditionBundle> | null = null;
let inclusionRulesCache: InclusionRule[] | null = null;
let inclusionRulesUpdatedAt = 0;
const RULES_CACHE_TTL_MS = 60_000;

function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getUTCFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

async function fetchEdition(url: string, fallback: string): Promise<HadithEntry[]> {
  let res = await fetch(url);
  if (!res.ok) res = await fetch(fallback);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const data: EditionJson = await res.json();
  return data.hadiths;
}

async function fetchEditionData(edition: string): Promise<EditionJson> {
  const minUrl = `${BASE}/${edition}.min.json`;
  const fullUrl = `${BASE}/${edition}.json`;
  let res = await fetch(minUrl);
  if (!res.ok) res = await fetch(fullUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${edition}: ${res.status} ${res.statusText}`);
  return await res.json() as EditionJson;
}

function getSectionTitle(metadata: EditionJson['metadata'], sectionNo: number): string {
  const raw = metadata?.sections?.[String(sectionNo)] ?? metadata?.section?.[String(sectionNo)] ?? '';
  return raw.trim();
}

function normalizeForSearch(value: string): string {
  return value.toLowerCase();
}

function hasBlockedKeyword(candidate: Candidate): boolean {
  const haystack = normalizeForSearch(
    `${candidate.sectionTitle} ${candidate.hadith.text} ${candidate.ref}`,
  );
  return HADITH_EXCLUDE_RANDOM_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

async function getEditionCache(): Promise<Map<string, EditionBundle>> {
  if (editionCache) return editionCache;

  const map = new Map<string, EditionBundle>();

  for (const collection of COLLECTIONS) {
    const [engData, araData] = await Promise.all([
      fetchEditionData(collection.englishEdition),
      fetchEditionData(collection.arabicEdition),
    ]);

    const arabicByHadithNo = new Map<number, string>();
    for (const row of araData.hadiths) {
      arabicByHadithNo.set(row.hadithnumber, row.text?.trim() ?? '');
    }

    const sectionTitles = new Map<number, string>();
    for (const row of engData.hadiths) {
      const sectionNo = row.reference?.book ?? 0;
      if (!sectionTitles.has(sectionNo)) {
        sectionTitles.set(sectionNo, getSectionTitle(engData.metadata, sectionNo));
      }
    }

    map.set(collection.key, {
      english: engData.hadiths,
      arabicByHadithNo,
      sectionTitles,
    });
  }

  editionCache = map;
  return map;
}

async function getInclusionRules(): Promise<InclusionRule[]> {
  if (!SERVICE_ROLE_KEY) {
    // If key is missing, default to include-all behavior.
    return [];
  }

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

function buildCandidates(
  editionData: Map<string, EditionBundle>,
  inclusionRules: InclusionRule[],
): Candidate[] {
  const rulesByCollection = new Map<string, InclusionRule[]>();
  for (const rule of inclusionRules) {
    if (!rulesByCollection.has(rule.collection_key)) {
      rulesByCollection.set(rule.collection_key, []);
    }
    rulesByCollection.get(rule.collection_key)?.push(rule);
  }

  const hasAnyRules = inclusionRules.length > 0;
  const candidates: Candidate[] = [];

  for (const collection of COLLECTIONS) {
    const bundle = editionData.get(collection.key);
    if (!bundle) continue;

    const rules = rulesByCollection.get(collection.key) ?? [];
    const bookIncluded = rules.some((r) => r.include_scope === 'book');
    const sectionRules = new Set(
      rules
        .filter((r) => r.include_scope === 'section' && typeof r.section_number === 'number')
        .map((r) => r.section_number as number),
    );

    const includeWholeBook = !hasAnyRules || (bookIncluded && sectionRules.size === 0);
    const includeBySection = sectionRules.size > 0;
    const collectionEnabled = includeWholeBook || includeBySection;
    if (!collectionEnabled) continue;

    for (const hadith of bundle.english) {
      const sectionNo = hadith.reference?.book ?? 0;
      if (includeBySection && !sectionRules.has(sectionNo)) {
        continue;
      }

      const ref = `${collection.title}, Hadith ${hadith.hadithnumber}`;
      const sectionTitle = bundle.sectionTitles.get(sectionNo) ?? '';

      candidates.push({
        collectionKey: collection.key,
        bookTitle: collection.title,
        hadith,
        arabic: bundle.arabicByHadithNo.get(hadith.hadithnumber) ?? '',
        sectionTitle,
        ref,
      });
    }
  }

  return candidates;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const editionData = await getEditionCache();
    const inclusionRules = await getInclusionRules();

    const allCandidates = buildCandidates(editionData, inclusionRules);
    const filteredCandidates = allCandidates.filter((candidate) => !hasBlockedKeyword(candidate));

    if (filteredCandidates.length === 0) {
      return new Response(
        JSON.stringify({
          noCandidate: true,
          reason: 'All candidates filtered by include rules or keyword safety filters',
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

    const stableSorted = filteredCandidates.sort((a, b) => {
      if (a.collectionKey !== b.collectionKey) {
        return a.collectionKey.localeCompare(b.collectionKey);
      }
      return a.hadith.hadithnumber - b.hadith.hadithnumber;
    });

    const index = dayOfYear() % stableSorted.length;
    const selected = stableSorted[index];
    const text = selected.hadith.text.trim();
    const preview = text.length > 120 ? text.slice(0, 120).trimEnd() + '…' : text;

    return new Response(
      JSON.stringify({
        arabic: selected.arabic,
        // narrator is embedded in text for this API — kept for interface compat
        narrator: '',
        preview,
        text,
        ref: selected.ref,
        idInBook: selected.hadith.hadithnumber,
        bookTitle: selected.bookTitle,
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

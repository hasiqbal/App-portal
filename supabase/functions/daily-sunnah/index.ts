import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

// fawazahmed0/hadith-api served via jsDelivr CDN — no rate limits
// Primary: minified, fallback: pretty-printed
const BASE = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';
const ENG_URL = `${BASE}/eng-nawawi.min.json`;
const ARA_URL = `${BASE}/ara-nawawi.min.json`;
const ENG_FALLBACK = `${BASE}/eng-nawawi.json`;
const ARA_FALLBACK = `${BASE}/ara-nawawi.json`;

interface HadithEntry {
  hadithnumber: number;
  arabicnumber: number;
  text: string;
  grades: unknown[];
  reference: { book: number; hadith: number };
}

interface EditionJson {
  metadata: { name: string };
  hadiths: HadithEntry[];
}

// In-memory cache for the function instance lifetime
let cachedEng: HadithEntry[] | null = null;
let cachedAra: HadithEntry[] | null = null;

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

async function getData(): Promise<{ eng: HadithEntry[]; ara: HadithEntry[] }> {
  if (cachedEng && cachedAra) return { eng: cachedEng, ara: cachedAra };
  const [eng, ara] = await Promise.all([
    fetchEdition(ENG_URL, ENG_FALLBACK),
    fetchEdition(ARA_URL, ARA_FALLBACK),
  ]);
  cachedEng = eng;
  cachedAra = ara;
  return { eng, ara };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { eng, ara } = await getData();
    const index = dayOfYear() % eng.length;
    const hadith = eng[index];
    const araHadith = ara[index];

    const text = hadith.text.trim();
    const arabic = araHadith?.text?.trim() ?? '';
    const preview = text.length > 120 ? text.slice(0, 120).trimEnd() + '…' : text;
    const ref = `Nawawi 40, Hadith ${hadith.hadithnumber}`;

    return new Response(
      JSON.stringify({
        arabic,
        // narrator is embedded in text for this API — kept for interface compat
        narrator: '',
        preview,
        text,
        ref,
        idInBook: hadith.hadithnumber,
        bookTitle: 'The Forty Hadith of Imam Nawawi',
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

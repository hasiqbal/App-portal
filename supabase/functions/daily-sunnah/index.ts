import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

// Pinned to v1.2.0 — do not use main branch (format may change)
const NAWAWI40_URL =
  'https://raw.githubusercontent.com/AhmedBaset/hadith-json/v1.2.0/db/by_book/forties/nawawi40.json';

// Cache the full JSON in-memory for the function instance lifetime
let cachedHadiths: HadithEntry[] | null = null;

interface HadithEntry {
  id: number;
  idInBook: number;
  chapterId: number;
  bookId: number;
  arabic: string;
  english: {
    narrator: string;
    text: string;
  };
}

interface BookJson {
  hadiths: HadithEntry[];
}

function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

async function getHadiths(): Promise<HadithEntry[]> {
  if (cachedHadiths) return cachedHadiths;

  const res = await fetch(NAWAWI40_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch hadith-json: ${res.status} ${res.statusText}`);
  }

  const data: BookJson = await res.json();
  cachedHadiths = data.hadiths;
  return cachedHadiths;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const hadiths = await getHadiths();
    const index = dayOfYear() % hadiths.length;
    const hadith = hadiths[index];

    const narrator = hadith.english.narrator.trim();
    const text = hadith.english.text.trim();
    const preview = text.length > 120 ? text.slice(0, 120).trimEnd() + '…' : text;
    const ref = `Nawawi 40, Hadith ${hadith.idInBook}`;

    return new Response(
      JSON.stringify({
        arabic: hadith.arabic,
        narrator,
        preview,
        text,
        ref,
        idInBook: hadith.idInBook,
        bookTitle: 'The Forty Hadith of Imam Nawawi',
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          // Cache until end of UTC day so all clients get the same hadith
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

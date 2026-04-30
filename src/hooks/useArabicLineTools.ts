import { useState } from 'react';
import { toast } from 'sonner';

export type ArabicLineConversion = {
  translation: string;
  transliteration: string;
};

type GoogleSegment = [
  string | null,
  string | null,
  unknown,
  string | null,
  unknown,
];

function extractConversionFromGooglePayload(payload: unknown): ArabicLineConversion | null {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) return null;

  const segments = payload[0] as unknown[];

  const translation = segments
    .map((segment) => (Array.isArray(segment) ? (segment as GoogleSegment)[0] : null))
    .filter((piece): piece is string => typeof piece === 'string' && piece.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const transliteration = segments
    .map((segment) => (Array.isArray(segment) ? (segment as GoogleSegment)[3] : null))
    .filter((piece): piece is string => typeof piece === 'string' && piece.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!translation && !transliteration) return null;

  return {
    translation,
    transliteration,
  };
}

async function convertArabicLine(text: string): Promise<ArabicLineConversion | null> {
  const endpoint = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
  const response = await fetch(endpoint);
  if (!response.ok) return null;

  const payload = await response.json() as unknown;
  return extractConversionFromGooglePayload(payload);
}

export function useArabicLineTools() {
  const [activeRequests, setActiveRequests] = useState(0);

  const beginRequest = () => setActiveRequests((prev) => prev + 1);
  const endRequest = () => setActiveRequests((prev) => Math.max(0, prev - 1));

  const convertManyArabicLines = async (
    lines: string[],
    options?: { silent?: boolean },
  ): Promise<Array<ArabicLineConversion | null>> => {
    const silent = options?.silent === true;
    if (lines.length === 0) {
      if (!silent) {
        toast.error('No Arabic verses found to convert.');
      }
      return [];
    }

    beginRequest();
    try {
      const trimmed = lines.map((line) => line.trim());
      const cache = new Map<string, ArabicLineConversion | null>();
      const results: Array<ArabicLineConversion | null> = [];

      for (const line of trimmed) {
        if (!line) {
          results.push(null);
          continue;
        }

        if (cache.has(line)) {
          results.push(cache.get(line) ?? null);
          continue;
        }

        const converted = await convertArabicLine(line);
        cache.set(line, converted);
        results.push(converted);
      }

      if (!silent && results.every((item) => item === null)) {
        toast.error('Could not auto-convert Arabic verses.');
      }

      return results;
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : 'Failed to convert Arabic verses.');
      }
      return lines.map(() => null);
    } finally {
      endRequest();
    }
  };

  return {
    convertManyArabicLines,
    converting: activeRequests > 0,
  };
}

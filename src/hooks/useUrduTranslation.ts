import { useState } from 'react';
import { invokeExternalFunction } from '#/lib/supabase';
import { toast } from 'sonner';

/**
 * Hook that provides a `translateToUrdu(text)` function backed by the
 * `translate-urdu` OnSpace AI edge function.
 *
 * Usage:
 *   const { translateToUrdu, translating } = useUrduTranslation();
 *   const urdu = await translateToUrdu(englishText);
 */
export function useUrduTranslation() {
  const [translating, setTranslating] = useState(false);

  const fallbackTranslateToUrdu = async (text: string): Promise<string> => {
    const endpoint = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ur&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Fallback translation failed (${response.status})`);
    const data = await response.json() as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[0])) return '';

    const parts = (data[0] as unknown[])
      .map((row) => (Array.isArray(row) ? row[0] : ''))
      .filter((chunk): chunk is string => typeof chunk === 'string' && chunk.trim().length > 0);
    return parts.join('').trim();
  };

  const extractUrduText = (payload: unknown): string => {
    if (!payload) return '';

    if (typeof payload === 'string') {
      return payload.trim();
    }

    if (typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      const direct = [obj.urdu, obj.translation, obj.translatedText, obj.text]
        .find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined;
      if (direct) return direct.trim();

      const nested = obj.data;
      if (nested && typeof nested === 'object') {
        const nestedObj = nested as Record<string, unknown>;
        const nestedText = [nestedObj.urdu, nestedObj.translation, nestedObj.translatedText, nestedObj.text]
          .find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined;
        if (nestedText) return nestedText.trim();
      }
    }

    return '';
  };

  const translateToUrdu = async (text: string, options?: { silent?: boolean }): Promise<string | null> => {
    const silent = options?.silent === true;
    if (!text.trim()) {
      if (!silent) {
        toast.error('No text to translate.');
      }
      return null;
    }
    setTranslating(true);
    try {
      const { data, error } = await invokeExternalFunction('translate-urdu', {
        text: text.trim(),
      });

      if (error) {
        const msg = typeof error === 'string' ? error : 'Unknown translation error';
        try {
          const fallbackUrdu = await fallbackTranslateToUrdu(text.trim());
          if (fallbackUrdu) {
            if (!silent) {
              toast.warning('Primary translator unavailable. Used fallback translator.');
            }
            return fallbackUrdu;
          }
        } catch {
          // Fall through to normal error toast.
        }
        if (!silent) {
          toast.error(`Translation failed: ${msg}`);
        }
        return null;
      }

      const urdu = extractUrduText(data);
      if (!urdu) {
        try {
          const fallbackUrdu = await fallbackTranslateToUrdu(text.trim());
          if (fallbackUrdu) {
            if (!silent) {
              toast.warning('Primary translator returned empty text. Used fallback translator.');
            }
            return fallbackUrdu;
          }
        } catch {
          // Fall through to normal error toast.
        }
        if (!silent) {
          toast.error('Empty translation returned.');
        }
        return null;
      }
      return urdu;
    } catch (err) {
      try {
        const fallbackUrdu = await fallbackTranslateToUrdu(text.trim());
        if (fallbackUrdu) {
          if (!silent) {
            toast.warning('Primary translator error. Used fallback translator.');
          }
          return fallbackUrdu;
        }
      } catch {
        // Fall through to normal error toast.
      }
      if (!silent) {
        toast.error(`Translation error: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
      return null;
    } finally {
      setTranslating(false);
    }
  };

  return { translateToUrdu, translating };
}

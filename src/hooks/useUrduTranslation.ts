import { useState } from 'react';
import { supabase } from '#/lib/supabase';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';

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

  const translateToUrdu = async (text: string): Promise<string | null> => {
    if (!text.trim()) {
      toast.error('No text to translate.');
      return null;
    }
    setTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-urdu', {
        body: { text: text.trim() },
      });

      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const statusCode = error.context?.status ?? 500;
            const textContent = await error.context?.text();
            msg = `[${statusCode}] ${textContent || error.message}`;
          } catch { /* keep original */ }
        }
        try {
          const fallbackUrdu = await fallbackTranslateToUrdu(text.trim());
          if (fallbackUrdu) {
            toast.warning(`Primary translator unavailable. Used fallback translator.`);
            return fallbackUrdu;
          }
        } catch {
          // Fall through to normal error toast.
        }
        toast.error(`Translation failed: ${msg}`);
        return null;
      }

      const urdu = extractUrduText(data);
      if (!urdu) {
        try {
          const fallbackUrdu = await fallbackTranslateToUrdu(text.trim());
          if (fallbackUrdu) {
            toast.warning('Primary translator returned empty text. Used fallback translator.');
            return fallbackUrdu;
          }
        } catch {
          // Fall through to normal error toast.
        }
        toast.error('Empty translation returned.');
        return null;
      }
      return urdu;
    } catch (err) {
      try {
        const fallbackUrdu = await fallbackTranslateToUrdu(text.trim());
        if (fallbackUrdu) {
          toast.warning('Primary translator error. Used fallback translator.');
          return fallbackUrdu;
        }
      } catch {
        // Fall through to normal error toast.
      }
      toast.error(`Translation error: ${err instanceof Error ? err.message : 'Unknown'}`);
      return null;
    } finally {
      setTranslating(false);
    }
  };

  return { translateToUrdu, translating };
}

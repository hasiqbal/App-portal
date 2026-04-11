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
        toast.error(`Translation failed: ${msg}`);
        return null;
      }

      const urdu = (data as { urdu?: string })?.urdu;
      if (!urdu) {
        toast.error('Empty translation returned.');
        return null;
      }
      return urdu;
    } catch (err) {
      toast.error(`Translation error: ${err instanceof Error ? err.message : 'Unknown'}`);
      return null;
    } finally {
      setTranslating(false);
    }
  };

  return { translateToUrdu, translating };
}

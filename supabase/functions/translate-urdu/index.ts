import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim(),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try next candidate.
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const middle = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(middle) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore parsing failure.
    }
  }

  return null;
}

function parseBatchTranslations(raw: string, expectedCount: number): string[] {
  const parsed = parseJsonObject(raw);
  if (!parsed) return [];

  const translations = parsed.translations;
  if (!Array.isArray(translations)) return [];

  const normalized = translations.map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (normalized.length !== expectedCount) return [];
  return normalized;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const inputText = typeof body?.text === 'string' ? body.text.trim() : '';
    const inputTexts = Array.isArray(body?.texts)
      ? body.texts.filter((item: unknown): item is string => typeof item === 'string').map((item: string) => item.trim()).filter(Boolean)
      : [];
    const isBatch = inputTexts.length > 0;

    if (!inputText && !isBatch) {
      return new Response(JSON.stringify({ error: 'No text provided.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('ONSPACE_AI_API_KEY');
    const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');

    if (!apiKey || !baseUrl) {
      return new Response(JSON.stringify(isBatch ? { translations: [] } : { urdu: '' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userContent = isBatch
      ? [
          'Translate each item to Urdu and return ONLY strict JSON.',
          `Expected format: {"translations": ["...", "..."]} with exactly ${inputTexts.length} items.`,
          'Keep item order exactly the same. Do not include markdown or explanations.',
          `Input JSON: ${JSON.stringify({ items: inputTexts })}`,
        ].join('\n')
      : `Translate the following into Urdu:\n\n${inputText}`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: `You are a professional Islamic text translator specialising in translating English and Arabic Islamic content into Urdu using Nastaliq script. 

Rules:
- Translate accurately and naturally into Urdu
- Preserve Islamic terminology (e.g. Salah, Wudu, Sunnah) in Urdu transliteration where appropriate
- Use respectful, formal Urdu appropriate for religious texts
- For Arabic text: transliterate and translate meaning into Urdu
- If given batch input, output ONLY strict JSON in the required schema
- If given single input, output ONLY the Urdu translation — no explanations, no English, no extra text
- Use standard Nastaliq Urdu script`,
          },
          {
            role: 'user',
            content: userContent,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[translate-urdu] AI API error:', errText);
      return new Response(JSON.stringify(isBatch ? { translations: [] } : { urdu: '' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() ?? '';

    if (isBatch) {
      const translations = parseBatchTranslations(content, inputTexts.length);
      if (translations.length !== inputTexts.length) {
        return new Response(JSON.stringify({ translations: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('[translate-urdu] Batch translated', inputTexts.length, 'items');

      return new Response(JSON.stringify({ translations }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const urdu = content;

    if (!urdu) {
      return new Response(JSON.stringify({ urdu: '' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[translate-urdu] Translated', inputText.length, 'chars →', urdu.length, 'chars');

    return new Response(JSON.stringify({ urdu }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[translate-urdu] Unexpected error:', err);
    return new Response(JSON.stringify({ urdu: '', translations: [] }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

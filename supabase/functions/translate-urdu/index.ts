import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string' || !text.trim()) {
      return new Response(JSON.stringify({ error: 'No text provided.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('ONSPACE_AI_API_KEY');
    const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');

    if (!apiKey || !baseUrl) {
      return new Response(JSON.stringify({ urdu: '' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
- Output ONLY the Urdu translation — no explanations, no English, no extra text
- Use standard Nastaliq Urdu script`,
          },
          {
            role: 'user',
            content: `Translate the following into Urdu:\n\n${text.trim()}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[translate-urdu] AI API error:', errText);
      return new Response(JSON.stringify({ urdu: '' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const urdu = data.choices?.[0]?.message?.content?.trim() ?? '';

    if (!urdu) {
      return new Response(JSON.stringify({ urdu: '' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[translate-urdu] Translated', text.length, 'chars →', urdu.length, 'chars');

    return new Response(JSON.stringify({ urdu }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[translate-urdu] Unexpected error:', err);
    return new Response(JSON.stringify({ urdu: '' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

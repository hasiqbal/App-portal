import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type PublishPayload = {
  guideId?: string;
  isActive?: boolean;
  publishStartAt?: string | null;
  publishEndAt?: string | null;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json() as PublishPayload;
    const guideId = body.guideId?.trim();

    if (!guideId) {
      return new Response(JSON.stringify({ error: 'guideId is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startAt = body.publishStartAt ? new Date(body.publishStartAt).toISOString() : null;
    const endAt = body.publishEndAt ? new Date(body.publishEndAt).toISOString() : null;

    if (startAt && endAt && endAt <= startAt) {
      return new Response(JSON.stringify({ error: 'publishEndAt must be later than publishStartAt.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const patch = {
      is_active: body.isActive !== false,
      publish_start_at: startAt,
      publish_end_at: endAt,
    };

    const { data: guide, error: updateError } = await admin
      .from('howto_guides')
      .update(patch)
      .eq('id', guideId)
      .select('*')
      .single();

    if (updateError) {
      return new Response(JSON.stringify({ error: `Failed to publish guide: ${updateError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await admin.from('howto_audit_log').insert({
      action: 'publish',
      entity: 'howto_guide',
      entity_id: guideId,
      metadata: {
        is_active: patch.is_active,
        publish_start_at: patch.publish_start_at,
        publish_end_at: patch.publish_end_at,
        published_at: new Date().toISOString(),
      },
    });

    return new Response(JSON.stringify({ data: guide }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

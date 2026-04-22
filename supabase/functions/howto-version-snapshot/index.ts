import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type SnapshotPayload = {
  guideId?: string;
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

    const body = await req.json() as SnapshotPayload;
    const guideId = body.guideId?.trim();

    if (!guideId) {
      return new Response(JSON.stringify({ error: 'guideId is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: guide, error: guideError } = await admin
      .from('howto_guides')
      .select('*')
      .eq('id', guideId)
      .single();

    if (guideError || !guide) {
      return new Response(JSON.stringify({ error: `Guide not found: ${guideError?.message ?? 'not found'}` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: sections, error: sectionsError } = await admin
      .from('howto_sections')
      .select('*')
      .eq('guide_id', guideId)
      .order('section_order', { ascending: true });

    if (sectionsError) {
      return new Response(JSON.stringify({ error: `Failed to fetch sections: ${sectionsError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sectionIds = (sections ?? []).map((section) => section.id);
    const { data: steps, error: stepsError } = sectionIds.length > 0
      ? await admin
          .from('howto_steps')
          .select('*')
          .in('section_id', sectionIds)
          .order('step_order', { ascending: true })
      : { data: [], error: null };

    if (stepsError) {
      return new Response(JSON.stringify({ error: `Failed to fetch steps: ${stepsError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stepIds = (steps ?? []).map((step) => step.id);
    const [blocksResult, imagesResult] = stepIds.length > 0
      ? await Promise.all([
          admin
            .from('howto_step_blocks')
            .select('*')
            .in('step_id', stepIds)
            .order('block_order', { ascending: true }),
          admin
            .from('howto_step_images')
            .select('*')
            .in('step_id', stepIds)
            .order('display_order', { ascending: true }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

    if (blocksResult.error || imagesResult.error) {
      return new Response(JSON.stringify({ error: `Failed to fetch guide children.` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: lastVersion } = await admin
      .from('howto_guide_versions')
      .select('version_no')
      .eq('guide_id', guideId)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (lastVersion?.version_no ?? 0) + 1;

    const snapshot = {
      guide,
      sections: sections ?? [],
      steps: steps ?? [],
      blocks: blocksResult.data ?? [],
      images: imagesResult.data ?? [],
      captured_at: new Date().toISOString(),
    };

    const { data: version, error: versionError } = await admin
      .from('howto_guide_versions')
      .insert({
        guide_id: guideId,
        version_no: nextVersion,
        snapshot,
      })
      .select('*')
      .single();

    if (versionError) {
      return new Response(JSON.stringify({ error: `Failed to create snapshot: ${versionError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await admin.from('howto_audit_log').insert({
      action: 'snapshot',
      entity: 'howto_guide',
      entity_id: guideId,
      metadata: {
        version_no: nextVersion,
        created_at: new Date().toISOString(),
      },
    });

    return new Response(JSON.stringify({ data: version }), {
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

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type UploadPayload = {
  guideId?: string;
  stepId?: string;
  fileName?: string;
  contentType?: string;
  base64Data?: string;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const DEFAULT_BUCKET = 'howto-media';
const MAX_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function decodeBase64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

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

    const body = await req.json() as UploadPayload;
    const guideId = body.guideId?.trim();
    const stepId = body.stepId?.trim();
    const fileName = body.fileName?.trim() || `howto-${Date.now()}.jpg`;
    const contentType = body.contentType?.trim() || 'image/jpeg';
    const base64Data = body.base64Data?.trim();

    if (!guideId || !stepId || !base64Data) {
      return new Response(JSON.stringify({ error: 'guideId, stepId, and base64Data are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return new Response(JSON.stringify({ error: 'Unsupported content type.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bytes = decodeBase64ToBytes(base64Data);
    if (bytes.byteLength > MAX_SIZE_BYTES) {
      return new Response(JSON.stringify({ error: 'Image too large. Max 8MB.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ext = fileName.includes('.') ? fileName.split('.').pop() : 'jpg';
    const objectPath = `guides/${guideId}/steps/${stepId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await admin.storage
      .from(DEFAULT_BUCKET)
      .upload(objectPath, bytes, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: `Upload failed: ${uploadError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: publicData } = admin.storage.from(DEFAULT_BUCKET).getPublicUrl(objectPath);
    const fullUrl = publicData.publicUrl;
    const thumbUrl = `${publicData.publicUrl}?width=480&quality=70`;

    await admin.from('howto_audit_log').insert({
      action: 'media_upload',
      entity: 'howto_step',
      entity_id: stepId,
      metadata: {
        guide_id: guideId,
        path: objectPath,
        full_url: fullUrl,
        thumb_url: thumbUrl,
        content_type: contentType,
        size_bytes: bytes.byteLength,
      },
    });

    return new Response(JSON.stringify({
      data: {
        image_url: fullUrl,
        thumb_url: thumbUrl,
        path: objectPath,
      },
    }), {
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

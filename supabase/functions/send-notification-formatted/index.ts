import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface NotificationPayload {
  notificationId: string;
  title: string;
  body: string;
  urduBody?: string;
  imageUrl?: string;
  linkUrl?: string;
  ctaLabel?: string;
  audience?: 'all' | 'active' | 'new';
  category?: string;
  formatVersion?: string;
}

interface DeviceTokenRow {
  id: string;
  token: string;
  platform: string;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  image?: string;
  channelId: string;
  priority: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: NotificationPayload = await req.json();
    const {
      notificationId,
      title,
      body,
      urduBody,
      imageUrl,
      linkUrl,
      ctaLabel,
      audience = 'all',
      category = 'general',
      formatVersion = 'v1',
    } = payload;

    if (!notificationId || !title?.trim() || !body?.trim()) {
      return new Response(JSON.stringify({ error: 'notificationId, title and body are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? 'https://lhaqqqatdztuijgdfdcf.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let tokenQuery = supabaseAdmin
      .from('device_tokens')
      .select('id, token, platform')
      .eq('is_active', true);

    if (audience === 'active') {
      const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      tokenQuery = tokenQuery.gte('last_active', threshold);
    } else if (audience === 'new') {
      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      tokenQuery = tokenQuery.gte('registered_at', threshold);
    }

    const { data: tokenRows, error: tokenError } = await tokenQuery;

    if (tokenError) {
      throw new Error(`DB error fetching tokens: ${tokenError.message}`);
    }

    const tokens: DeviceTokenRow[] = tokenRows ?? [];

    const payloadJson = {
      formatVersion,
      category,
      audience,
      ctaLabel: ctaLabel ?? null,
      imageUrl: imageUrl ?? null,
      linkUrl: linkUrl ?? null,
      urduBody: urduBody ?? null,
    };

    if (tokens.length === 0) {
      await supabaseAdmin
        .from('push_notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          recipient_count: 0,
          error_message: 'No registered devices found for selected audience.',
          urdu_body: urduBody ?? null,
          cta_label: ctaLabel ?? null,
          payload_json: payloadJson,
          format_version: formatVersion,
        })
        .eq('id', notificationId);

      return new Response(JSON.stringify({ success: true, sent: 0, total: 0, errors: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const buildMessage = (token: string): ExpoMessage => ({
      to: token,
      title,
      body,
      priority: 'high',
      channelId: 'default',
      data: {
        notificationId,
        category,
        audience,
        url: linkUrl ?? null,
        ctaLabel: ctaLabel ?? null,
        urduBody: urduBody ?? null,
        formatVersion,
      },
      ...(imageUrl ? { image: imageUrl } : {}),
    });

    const CHUNK_SIZE = 100;
    const chunks: DeviceTokenRow[][] = [];

    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      chunks.push(tokens.slice(i, i + CHUNK_SIZE));
    }

    let successCount = 0;
    const errorDetails: string[] = [];
    const invalidTokenIds: string[] = [];

    for (const chunk of chunks) {
      const messages = chunk.map((t) => buildMessage(t.token));

      const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (!expoRes.ok) {
        const errText = await expoRes.text();
        errorDetails.push(`Expo API ${expoRes.status}: ${errText.slice(0, 200)}`);
        continue;
      }

      const result = await expoRes.json();
      const tickets: ExpoPushTicket[] = result.data ?? [];

      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          successCount++;
          return;
        }

        const reason = ticket.message ?? ticket.details?.error ?? 'Unknown error';
        errorDetails.push(`${chunk[idx].platform}: ${reason}`);

        if (ticket.details?.error === 'DeviceNotRegistered') {
          invalidTokenIds.push(chunk[idx].id);
        }
      });
    }

    if (invalidTokenIds.length > 0) {
      await supabaseAdmin
        .from('device_tokens')
        .update({ is_active: false })
        .in('id', invalidTokenIds);
    }

    const finalStatus = successCount === 0 && errorDetails.length > 0 ? 'failed' : 'sent';

    await supabaseAdmin
      .from('push_notifications')
      .update({
        status: finalStatus,
        sent_at: new Date().toISOString(),
        recipient_count: successCount,
        error_message: errorDetails.length > 0 ? errorDetails.slice(0, 5).join(' | ') : null,
        urdu_body: urduBody ?? null,
        cta_label: ctaLabel ?? null,
        payload_json: payloadJson,
        format_version: formatVersion,
      })
      .eq('id', notificationId);

    return new Response(JSON.stringify({
      success: true,
      sent: successCount,
      total: tokens.length,
      errors: errorDetails,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

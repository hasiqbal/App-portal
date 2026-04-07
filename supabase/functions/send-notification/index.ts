import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface NotificationPayload {
  notificationId: string;
  title: string;
  body: string;
  imageUrl?: string;
  linkUrl?: string;
  audience?: string;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  image?: string;
  channelId?: string;
  priority?: string;
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
    const { notificationId, title, body, imageUrl, linkUrl, audience } = payload;

    console.log(`send-notification: id=${notificationId} audience=${audience}`);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? 'https://lhaqqqatdztuijgdfdcf.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Fetch active device tokens
    const { data: tokenRows, error: tokenError } = await supabaseAdmin
      .from('device_tokens')
      .select('id, token, platform')
      .eq('is_active', true);

    if (tokenError) throw new Error(`DB error fetching tokens: ${tokenError.message}`);

    const tokens: { id: string; token: string; platform: string }[] = tokenRows ?? [];
    console.log(`send-notification: ${tokens.length} active tokens found`);

    if (tokens.length === 0) {
      await supabaseAdmin.from('push_notifications').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        recipient_count: 0,
        error_message: 'No registered devices found. Make sure the mobile app registers Expo push tokens.',
      }).eq('id', notificationId);

      return new Response(JSON.stringify({ success: true, sent: 0, total: 0, errors: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build Expo push messages
    const buildMessage = (token: string): ExpoMessage => ({
      to: token,
      title,
      body,
      priority: 'high',
      channelId: 'default',
      data: linkUrl ? { url: linkUrl } : {},
      ...(imageUrl ? { image: imageUrl } : {}),
    });

    // Expo recommends max 100 messages per request
    const CHUNK_SIZE = 100;
    const chunks: { id: string; token: string; platform: string }[][] = [];
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
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (!expoRes.ok) {
        const errText = await expoRes.text();
        console.error(`Expo API error (${expoRes.status}): ${errText}`);
        errorDetails.push(`Expo API ${expoRes.status}: ${errText.slice(0, 200)}`);
        continue;
      }

      const result = await expoRes.json();
      const tickets: ExpoPushTicket[] = result.data ?? [];

      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          successCount++;
        } else {
          const reason = ticket.message ?? ticket.details?.error ?? 'Unknown error';
          console.warn(`Token error: ${chunk[idx].token} → ${reason}`);
          errorDetails.push(`${chunk[idx].platform}: ${reason}`);

          // Mark DeviceNotRegistered tokens as inactive
          if (ticket.details?.error === 'DeviceNotRegistered') {
            invalidTokenIds.push(chunk[idx].id);
          }
        }
      });
    }

    // Deactivate invalid tokens in bulk
    if (invalidTokenIds.length > 0) {
      await supabaseAdmin.from('device_tokens')
        .update({ is_active: false })
        .in('id', invalidTokenIds);
      console.log(`send-notification: deactivated ${invalidTokenIds.length} invalid tokens`);
    }

    const finalStatus =
      successCount === 0 && errorDetails.length > 0 ? 'failed' : 'sent';

    // Update the notification record with real delivery results
    await supabaseAdmin.from('push_notifications').update({
      status: finalStatus,
      sent_at: new Date().toISOString(),
      recipient_count: successCount,
      error_message: errorDetails.length > 0
        ? errorDetails.slice(0, 5).join(' | ')
        : null,
    }).eq('id', notificationId);

    console.log(`send-notification: done — sent=${successCount} failed=${errorDetails.length}`);

    return new Response(JSON.stringify({
      success: true,
      sent: successCount,
      total: tokens.length,
      errors: errorDetails,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('send-notification unexpected error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

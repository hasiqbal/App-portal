/**
 * push-template — Scheduled / Batch Push Notification Sender
 *
 * This edge function handles sending push notifications to all registered
 * device tokens using the Expo Push Notifications API.
 *
 * Invoke via: supabase.functions.invoke('push-template', { body: { ... } })
 *
 * Request body:
 * {
 *   title: string;           // Notification title
 *   body: string;            // Notification body text
 *   data?: Record<string, unknown>;  // Optional deep-link data
 *   image?: string;          // Optional image URL (Android / rich notifications)
 *   audience?: 'all' | string[];     // 'all' or array of device token strings
 *   category?: string;       // Optional category tag
 *   badge?: number;          // Optional badge count (iOS)
 *   sound?: 'default' | null; // Notification sound
 *   ttl?: number;            // Time-to-live in seconds (default: 86400)
 *   priority?: 'default' | 'normal' | 'high';
 * }
 *
 * Response:
 * {
 *   sent: number;
 *   errors: number;
 *   ticketErrors: Array<{ token: string; message: string }>;
 *   receipts?: Record<string, unknown>;
 * }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  image?: string;
  audience?: 'all' | string[];
  category?: string;
  badge?: number;
  sound?: 'default' | null;
  ttl?: number;
  priority?: 'default' | 'normal' | 'high';
}

interface DeviceToken {
  id: string;
  token: string;
  platform: string;
  is_active: boolean;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const payload: PushPayload = await req.json();

    if (!payload.title?.trim() || !payload.body?.trim()) {
      return new Response(
        JSON.stringify({ error: 'title and body are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Fetch target device tokens ────────────────────────────────────────────
    let query = supabase.from('device_tokens').select('*').eq('is_active', true);

    if (Array.isArray(payload.audience)) {
      query = query.in('token', payload.audience);
    }

    const { data: tokens, error: tokenError } = await query;

    if (tokenError) {
      console.error('Failed to fetch device tokens:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch device tokens', details: tokenError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const deviceTokens: DeviceToken[] = tokens ?? [];
    console.log(`[push-template] Sending to ${deviceTokens.length} devices`);

    if (deviceTokens.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, errors: 0, ticketErrors: [], message: 'No active device tokens found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Build Expo messages (chunk into batches of 100) ──────────────────────
    const messages = deviceTokens.map((dt) => ({
      to: dt.token,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      ...(payload.image ? { image: payload.image } : {}),
      ...(payload.category ? { categoryId: payload.category } : {}),
      sound: payload.sound !== undefined ? payload.sound : 'default',
      badge: payload.badge ?? 1,
      ttl: payload.ttl ?? 86400,
      priority: payload.priority ?? 'high',
    }));

    const CHUNK_SIZE = 100;
    const chunks: typeof messages[] = [];
    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      chunks.push(messages.slice(i, i + CHUNK_SIZE));
    }

    let totalSent = 0;
    let totalErrors = 0;
    const ticketErrors: { token: string; message: string }[] = [];
    const receiptIds: string[] = [];

    // ── Send each chunk to Expo API ──────────────────────────────────────────
    for (const chunk of chunks) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`Expo API error ${response.status}:`, text);
        totalErrors += chunk.length;
        continue;
      }

      const result = await response.json() as { data: ExpoTicket[] };
      const tickets: ExpoTicket[] = result.data ?? [];

      tickets.forEach((ticket, i) => {
        if (ticket.status === 'ok') {
          totalSent++;
          if (ticket.id) receiptIds.push(ticket.id);
        } else {
          totalErrors++;
          ticketErrors.push({
            token: chunk[i]?.to ?? 'unknown',
            message: ticket.message ?? ticket.details?.error ?? 'Unknown error',
          });
        }
      });
    }

    // ── Update device token last_active timestamps ───────────────────────────
    const activeTokens = deviceTokens.map((dt) => dt.token);
    if (activeTokens.length > 0) {
      await supabase
        .from('device_tokens')
        .update({ last_active: new Date().toISOString() })
        .in('token', activeTokens)
        .then(({ error }) => {
          if (error) console.warn('Failed to update last_active:', error.message);
        });
    }

    // ── Optionally deactivate tokens that returned DeviceNotRegistered ───────
    const invalidTokens = ticketErrors
      .filter((e) => e.message.includes('DeviceNotRegistered') || e.message.includes('InvalidCredentials'))
      .map((e) => e.token);

    if (invalidTokens.length > 0) {
      console.log(`[push-template] Deactivating ${invalidTokens.length} invalid tokens`);
      await supabase
        .from('device_tokens')
        .update({ is_active: false })
        .in('token', invalidTokens);
    }

    const responseBody = {
      sent: totalSent,
      errors: totalErrors,
      ticketErrors,
      ...(receiptIds.length > 0 ? { receiptIds } : {}),
    };

    console.log(`[push-template] Done — sent: ${totalSent}, errors: ${totalErrors}`);

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[push-template] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

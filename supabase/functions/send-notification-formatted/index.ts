import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface NotificationPayload {
  notificationId: string;
  title: string;
  body: string;
  urduTitle?: string;
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
  installation_id?: string | null;
  platform: string;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  image?: string;
  channelId: string;
  sound: 'default';
  badge: number;
  priority: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

interface JwtClaims {
  role?: string;
  portal_role?: string;
  app_metadata?: { role?: string };
  user_metadata?: { role?: string; portal_role?: string };
}

type SupportedPlatform = 'ios' | 'android';

type PlatformCounter = Record<SupportedPlatform, number>;

function emptyPlatformCounter(): PlatformCounter {
  return { ios: 0, android: 0 };
}

function normalizePlatform(value: string | null | undefined): SupportedPlatform | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'ios' || normalized === 'android') {
    return normalized;
  }
  return null;
}

function isExpoPushToken(value: string | null | undefined): boolean {
  if (!value) return false;
  const token = value.trim();
  return token.startsWith('ExpoPushToken[') || token.startsWith('ExponentPushToken[');
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const BODY_URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<>()]+(?:\([^\s<>()]*\))?[^\s<>()\],.!?;:'"\)])/i;

function normalizeExternalUrl(value: string | null | undefined): string | null {
  const trimmed = asTrimmedString(value);
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

function extractFirstBodyUrl(value: string | null | undefined): string | null {
  const source = asTrimmedString(value);
  if (!source) return null;
  const match = source.match(BODY_URL_PATTERN);
  if (!match?.[1]) return null;
  return normalizeExternalUrl(match[1]);
}

function buildBilingualTitle(english: string, urdu?: string): string {
  const englishTrimmed = english.trim();
  const urduTrimmed = asTrimmedString(urdu);
  if (!urduTrimmed) return englishTrimmed;
  return `${englishTrimmed} - ${urduTrimmed}`;
}

function buildBilingualBody(english: string, urdu?: string): string {
  const englishTrimmed = english.trim();
  const urduTrimmed = asTrimmedString(urdu);
  if (!urduTrimmed) return englishTrimmed;

  // Keep English and Urdu visually separated in the system notification body.
  return `${englishTrimmed}\n\n${urduTrimmed}`;
}

function decodeJwtClaims(token: string): JwtClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const json = atob(padded);
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

function getRequesterRole(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim();

   const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
   if (serviceRoleKey && token === serviceRoleKey) {
     return 'service_role';
   }

  const claims = decodeJwtClaims(token);
  if (!claims) return null;

  if (claims.role === 'service_role') return 'service_role';
  return (
    claims.user_metadata?.portal_role
    ?? claims.portal_role
    ?? claims.app_metadata?.role
    ?? claims.user_metadata?.role
    ?? claims.role
    ?? null
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const requesterRole = getRequesterRole(req);
    if (!requesterRole || !['service_role', 'admin', 'editor'].includes(requesterRole)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions to send notifications.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: NotificationPayload = await req.json();
    const {
      notificationId,
      title,
      body,
      urduTitle,
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

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

    const rawTokens: DeviceTokenRow[] = tokenRows ?? [];
    const tokens = rawTokens.filter((row) => {
      const platform = normalizePlatform(row.platform);
      return platform !== null && isExpoPushToken(row.token);
    });

    const invalidTokenIds = rawTokens
      .filter((row) => {
        const platform = normalizePlatform(row.platform);
        return platform === null || !isExpoPushToken(row.token);
      })
      .map((row) => row.id);

    const payloadJson = {
      formatVersion,
      category,
      audience,
      urduTitle: urduTitle ?? null,
      ctaLabel: ctaLabel ?? null,
      imageUrl: imageUrl ?? null,
      linkUrl: normalizeExternalUrl(linkUrl) ?? extractFirstBodyUrl(body),
      urduBody: urduBody ?? null,
    };

    const resolvedLinkUrl = payloadJson.linkUrl;

    if (tokens.length === 0) {
      if (invalidTokenIds.length > 0) {
        await supabaseAdmin
          .from('device_tokens')
          .update({ is_active: false })
          .in('id', invalidTokenIds);
      }

      await supabaseAdmin
        .from('push_notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          recipient_count: 0,
          error_message: invalidTokenIds.length > 0
            ? 'No valid Expo device tokens found for selected audience. Invalid tokens were deactivated.'
            : 'No registered devices found for selected audience.',
          urdu_body: urduBody ?? null,
          cta_label: ctaLabel ?? null,
          payload_json: payloadJson,
          format_version: formatVersion,
        })
        .eq('id', notificationId);

      return new Response(JSON.stringify({
        success: true,
        sent: 0,
        total: 0,
        errors: [],
        invalidTokenRowsDeactivated: invalidTokenIds.length,
        platformBreakdown: {
          attempted: emptyPlatformCounter(),
          sent: emptyPlatformCounter(),
          failed: emptyPlatformCounter(),
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const attemptedByPlatform = emptyPlatformCounter();
    for (const tokenRow of tokens) {
      const platform = normalizePlatform(tokenRow.platform);
      if (platform) {
        attemptedByPlatform[platform] += 1;
      }
    }

    const buildMessage = (token: string): ExpoMessage => ({
      to: token,
      title: buildBilingualTitle(title, urduTitle),
      body: buildBilingualBody(body, urduBody),
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'jmn-general-v2',
      data: {
        notificationId,
        route: '/push-notification',
        category,
        audience,
        title,
        body,
        urduTitle: urduTitle ?? null,
        url: resolvedLinkUrl,
        ctaLabel: ctaLabel ?? null,
        urduBody: urduBody ?? null,
        imageUrl: imageUrl ?? null,
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
    const sentByPlatform = emptyPlatformCounter();
    const failedByPlatform = emptyPlatformCounter();
    const ticketToDevice = new Map<string, DeviceTokenRow>();

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
        const platform = normalizePlatform(chunk[idx].platform);
        if (ticket.status === 'ok') {
          successCount++;
          if (platform) {
            sentByPlatform[platform] += 1;
          }
          if (ticket.id) {
            ticketToDevice.set(ticket.id, chunk[idx]);
          }
          return;
        }

        const reason = ticket.message ?? ticket.details?.error ?? 'Unknown error';
        errorDetails.push(`${chunk[idx].platform}: ${reason}`);
        if (platform) {
          failedByPlatform[platform] += 1;
        }

        if (ticket.details?.error === 'DeviceNotRegistered') {
          invalidTokenIds.push(chunk[idx].id);
        }
      });
    }

    // Expo tickets only confirm acceptance, not final delivery. Query receipts
    // to capture downstream provider errors (FCM/APNs credentials, etc.).
    if (ticketToDevice.size > 0) {
      const receiptIds = Array.from(ticketToDevice.keys());
      const RECEIPT_CHUNK_SIZE = 300;

      for (let i = 0; i < receiptIds.length; i += RECEIPT_CHUNK_SIZE) {
        const receiptChunk = receiptIds.slice(i, i + RECEIPT_CHUNK_SIZE);

        const receiptRes = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ids: receiptChunk }),
        });

        if (!receiptRes.ok) {
          const receiptErr = await receiptRes.text().catch(() => 'unknown receipt error');
          errorDetails.push(`Expo receipts API ${receiptRes.status}: ${receiptErr.slice(0, 200)}`);
          continue;
        }

        const receiptPayload = await receiptRes.json().catch(() => null) as { data?: Record<string, ExpoPushReceipt> } | null;
        const receiptData = receiptPayload?.data ?? {};

        for (const id of receiptChunk) {
          const receipt = receiptData[id];
          if (!receipt || receipt.status === 'ok') continue;

          const device = ticketToDevice.get(id);
          const platform = normalizePlatform(device?.platform);
          if (successCount > 0) {
            successCount--;
          }
          if (platform && sentByPlatform[platform] > 0) {
            sentByPlatform[platform] -= 1;
            failedByPlatform[platform] += 1;
          }

          const reason = receipt.message ?? receipt.details?.error ?? 'Unknown receipt error';
          errorDetails.push(`receipt:${device?.platform ?? 'unknown'}: ${reason}`);

          if (receipt.details?.error === 'DeviceNotRegistered' && device?.id) {
            invalidTokenIds.push(device.id);
          }
        }
      }
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
        payload_json: {
          ...payloadJson,
          delivery_breakdown: {
            attempted: attemptedByPlatform,
            sent: sentByPlatform,
            failed: failedByPlatform,
          },
        },
        format_version: formatVersion,
      })
      .eq('id', notificationId);

    return new Response(JSON.stringify({
      success: true,
      sent: successCount,
      total: tokens.length,
      errors: errorDetails,
      invalidTokenRowsDeactivated: invalidTokenIds.length,
      platformBreakdown: {
        attempted: attemptedByPlatform,
        sent: sentByPlatform,
        failed: failedByPlatform,
      },
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

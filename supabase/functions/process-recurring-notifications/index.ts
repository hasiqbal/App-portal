import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type ScheduledNotificationRow = {
  id: string;
  title: string;
  body: string;
  urdu_body: string | null;
  image_url: string | null;
  link_url: string | null;
  cta_label: string | null;
  audience: string;
  category: string;
  format_version: string | null;
  scheduled_for: string | null;
  automation_id: string | null;
};

type AutomationRow = {
  id: string;
  name: string;
  enabled: boolean;
  schedule_type: 'one_time' | 'daily' | 'weekly' | 'prayer';
  next_run_at: string | null;
  recurrence_days: number[] | null;
  prayer_names: string[] | null;
  title: string;
  body: string;
  urdu_body: string | null;
  image_url: string | null;
  link_url: string | null;
  cta_label: string | null;
  audience: string;
  category: string;
  run_count: number;
};

type PrayerTimesRow = {
  month: number;
  day: number;
  fajr: string;
  zuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  jumu_ah_1: string | null;
};

type ProcessorRequest = {
  dryRun?: boolean;
  maxBatch?: number;
  source?: string;
};

type SendFormattedResponse = {
  success?: boolean;
  sent?: number;
  total?: number;
  errors?: string[];
  error?: string;
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function addDays(isoDate: string, days: number): string {
  const base = new Date(isoDate);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString();
}

function getNextWeeklyRun(currentRunIso: string, recurrenceDays: number[] | null): string {
  const days = (recurrenceDays ?? [])
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
    .sort((a, b) => a - b);

  if (days.length === 0) {
    return addDays(currentRunIso, 7);
  }

  const current = new Date(currentRunIso);

  for (let delta = 1; delta <= 14; delta++) {
    const candidate = new Date(current);
    candidate.setUTCDate(candidate.getUTCDate() + delta);
    if (days.includes(candidate.getUTCDay())) {
      return candidate.toISOString();
    }
  }

  return addDays(currentRunIso, 7);
}

function getLondonParts(date: Date): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '0');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '0');
  return { year, month, day };
}

function getLondonOffsetMinutes(date: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    timeZoneName: 'shortOffset',
  });
  const offsetPart = formatter
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')
    ?.value;

  const match = offsetPart?.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;

  const sign = match[1] === '+' ? 1 : -1;
  const hours = Number(match[2] ?? '0');
  const minutes = Number(match[3] ?? '0');
  return sign * (hours * 60 + minutes);
}

function londonWallTimeToUtcIso(year: number, month: number, day: number, timeText: string): string | null {
  const [hRaw, mRaw] = timeText.split(':');
  const hour = Number(hRaw);
  const minute = Number(mRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offset = getLondonOffsetMinutes(new Date(utcGuess));
  const utcMs = utcGuess - (offset * 60 * 1000);
  return new Date(utcMs).toISOString();
}

function prayerColumnFor(name: string): keyof PrayerTimesRow | null {
  const normalized = name.trim().toLowerCase();
  if (normalized === 'fajr') return 'fajr';
  if (normalized === 'dhuhr' || normalized === 'zuhr') return 'zuhr';
  if (normalized === 'asr') return 'asr';
  if (normalized === 'maghrib') return 'maghrib';
  if (normalized === 'isha') return 'isha';
  if (normalized === 'jumuah' || normalized === 'jummah') return 'jumu_ah_1';
  return null;
}

async function resolveNextPrayerRunAt(args: {
  admin: ReturnType<typeof createClient>;
  prayerNames: string[] | null;
  fromIso: string;
}): Promise<string | null> {
  const { admin, prayerNames, fromIso } = args;
  const selectedColumns = (prayerNames ?? [])
    .map((name) => prayerColumnFor(name))
    .filter((value): value is keyof PrayerTimesRow => value !== null);

  if (selectedColumns.length === 0) {
    return null;
  }

  const uniqueColumns = Array.from(new Set(selectedColumns));
  const fromDate = new Date(fromIso);
  const nowTs = fromDate.getTime();

  for (let offset = 0; offset <= 7; offset++) {
    const probe = new Date(nowTs + offset * 24 * 60 * 60 * 1000);
    const { year, month, day } = getLondonParts(probe);

    const { data, error } = await admin
      .from('prayer_times')
      .select('month, day, fajr, zuhr, asr, maghrib, isha, jumu_ah_1')
      .eq('month', month)
      .eq('day', day)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to read prayer_times for ${month}/${day}: ${error.message}`);
    }

    const row = data as PrayerTimesRow | null;
    if (!row) continue;

    let earliest: string | null = null;

    for (const column of uniqueColumns) {
      const timeValue = row[column];
      if (typeof timeValue !== 'string' || !/^\d{1,2}:\d{2}$/.test(timeValue)) continue;

      const runIso = londonWallTimeToUtcIso(year, month, day, timeValue);
      if (!runIso) continue;
      if (new Date(runIso).getTime() <= nowTs) continue;

      if (!earliest || new Date(runIso).getTime() < new Date(earliest).getTime()) {
        earliest = runIso;
      }
    }

    if (earliest) {
      return earliest;
    }
  }

  return null;
}

async function invokeSendFormatted(
  supabaseUrl: string,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; data: SendFormattedResponse | null; error: string | null }> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-notification-formatted`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: accessToken,
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as SendFormattedResponse | null;

    if (!response.ok) {
      const message = data?.error ?? `send-notification-formatted returned ${response.status}`;
      return { ok: false, data, error: message };
    }

    if (data?.error) {
      return { ok: false, data, error: data.error };
    }

    return { ok: true, data, error: null };
  } catch (error) {
    return { ok: false, data: null, error: String(error) };
  }
}

async function logAutomationEvent(
  admin: ReturnType<typeof createClient>,
  input: {
    automationId?: string | null;
    notificationId?: string | null;
    scheduledFor?: string | null;
    status: 'queued' | 'sent' | 'failed' | 'skipped';
    recipientCount?: number | null;
    errorMessage?: string | null;
    payloadJson?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from('notification_automation_events').insert({
    automation_id: input.automationId ?? null,
    notification_id: input.notificationId ?? null,
    scheduled_for: input.scheduledFor ?? null,
    processed_at: new Date().toISOString(),
    status: input.status,
    recipient_count: input.recipientCount ?? null,
    error_message: input.errorMessage ?? null,
    payload_json: input.payloadJson ?? {},
  });
}

async function processScheduledNotifications(args: {
  admin: ReturnType<typeof createClient>;
  supabaseUrl: string;
  accessToken: string;
  dryRun: boolean;
  maxBatch: number;
}) {
  const { admin, supabaseUrl, accessToken, dryRun, maxBatch } = args;
  const nowIso = new Date().toISOString();

  const { data: dueRows, error: dueError } = await admin
    .from('push_notifications')
    .select(
      'id, title, body, urdu_body, image_url, link_url, cta_label, audience, category, format_version, scheduled_for, automation_id',
    )
    .eq('status', 'scheduled')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(maxBatch);

  if (dueError) {
    throw new Error(`Failed to query scheduled notifications: ${dueError.message}`);
  }

  const due = (dueRows ?? []) as ScheduledNotificationRow[];
  if (due.length === 0) {
    return { due: 0, sent: 0, failed: 0 };
  }

  if (dryRun) {
    return { due: due.length, sent: 0, failed: 0 };
  }

  const dueIds = due.map((row) => row.id);

  const { data: claimedRows, error: claimError } = await admin
    .from('push_notifications')
    .update({ status: 'draft' })
    .in('id', dueIds)
    .eq('status', 'scheduled')
    .select(
      'id, title, body, urdu_body, image_url, link_url, cta_label, audience, category, format_version, scheduled_for, automation_id',
    );

  if (claimError) {
    throw new Error(`Failed to claim scheduled notifications: ${claimError.message}`);
  }

  const claimed = (claimedRows ?? []) as ScheduledNotificationRow[];

  let sentCount = 0;
  let failedCount = 0;

  for (const row of claimed) {
    const sendResult = await invokeSendFormatted(supabaseUrl, accessToken, {
      notificationId: row.id,
      title: row.title,
      body: row.body,
      urduBody: row.urdu_body ?? undefined,
      imageUrl: row.image_url ?? undefined,
      linkUrl: row.link_url ?? undefined,
      ctaLabel: row.cta_label ?? undefined,
      audience: row.audience,
      category: row.category,
      formatVersion: row.format_version ?? 'v1',
    });

    if (!sendResult.ok) {
      failedCount += 1;

      await admin
        .from('push_notifications')
        .update({ status: 'failed', error_message: sendResult.error })
        .eq('id', row.id);

      await logAutomationEvent(admin, {
        automationId: row.automation_id,
        notificationId: row.id,
        scheduledFor: row.scheduled_for,
        status: 'failed',
        errorMessage: sendResult.error,
        payloadJson: { source: 'scheduled-notification-processor' },
      });

      continue;
    }

    sentCount += Number(sendResult.data?.sent ?? 0);

    await logAutomationEvent(admin, {
      automationId: row.automation_id,
      notificationId: row.id,
      scheduledFor: row.scheduled_for,
      status: 'sent',
      recipientCount: Number(sendResult.data?.sent ?? 0),
      payloadJson: { source: 'scheduled-notification-processor' },
    });
  }

  return {
    due: due.length,
    sent: sentCount,
    failed: failedCount,
  };
}

async function processRecurringAutomations(args: {
  admin: ReturnType<typeof createClient>;
  supabaseUrl: string;
  accessToken: string;
  dryRun: boolean;
  maxBatch: number;
}) {
  const { admin, supabaseUrl, accessToken, dryRun, maxBatch } = args;

  const nowIso = new Date().toISOString();

  const { data: dueRows, error: dueError } = await admin
    .from('notification_automations')
    .select(
      'id, name, enabled, schedule_type, next_run_at, recurrence_days, prayer_names, title, body, urdu_body, image_url, link_url, cta_label, audience, category, run_count',
    )
    .eq('enabled', true)
    .not('next_run_at', 'is', null)
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(maxBatch);

  if (dueError) {
    throw new Error(`Failed to query notification automations: ${dueError.message}`);
  }

  const due = (dueRows ?? []) as AutomationRow[];
  if (due.length === 0) {
    return { due: 0, sent: 0, failed: 0, skipped: 0 };
  }

  if (dryRun) {
    return { due: due.length, sent: 0, failed: 0, skipped: 0 };
  }

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const automation of due) {
    if (!automation.next_run_at) {
      skippedCount += 1;
      continue;
    }

    const { data: notificationInsert, error: insertError } = await admin
      .from('push_notifications')
      .insert({
        title: automation.title,
        body: automation.body,
        urdu_body: automation.urdu_body,
        image_url: automation.image_url,
        link_url: automation.link_url,
        cta_label: automation.cta_label,
        audience: automation.audience,
        category: automation.category,
        status: 'draft',
        automation_id: automation.id,
        trigger_source: 'automation',
        format_version: 'v1',
        payload_json: {
          source: 'notification_automation',
          automation_id: automation.id,
          schedule_type: automation.schedule_type,
        },
      })
      .select('id')
      .single();

    if (insertError || !notificationInsert?.id) {
      failedCount += 1;

      await admin
        .from('notification_automations')
        .update({ last_error: insertError?.message ?? 'Failed to create push notification row.' })
        .eq('id', automation.id);

      await logAutomationEvent(admin, {
        automationId: automation.id,
        scheduledFor: automation.next_run_at,
        status: 'failed',
        errorMessage: insertError?.message ?? 'Failed to create push notification row.',
        payloadJson: { schedule_type: automation.schedule_type },
      });

      continue;
    }

    const sendResult = await invokeSendFormatted(supabaseUrl, accessToken, {
      notificationId: notificationInsert.id,
      title: automation.title,
      body: automation.body,
      urduBody: automation.urdu_body ?? undefined,
      imageUrl: automation.image_url ?? undefined,
      linkUrl: automation.link_url ?? undefined,
      ctaLabel: automation.cta_label ?? undefined,
      audience: automation.audience,
      category: automation.category,
      formatVersion: 'v1',
    });

    const nextRunAt = automation.schedule_type === 'one_time'
      ? null
      : automation.schedule_type === 'daily'
      ? addDays(automation.next_run_at, 1)
      : automation.schedule_type === 'weekly'
      ? getNextWeeklyRun(automation.next_run_at, automation.recurrence_days)
      : await resolveNextPrayerRunAt({
          admin,
          prayerNames: automation.prayer_names,
          fromIso: new Date().toISOString(),
        });

    const automationPatch = {
      run_count: (automation.run_count ?? 0) + 1,
      last_run_at: new Date().toISOString(),
      last_error: sendResult.ok ? null : sendResult.error,
      enabled: automation.schedule_type === 'one_time' ? false : true,
      next_run_at: automation.schedule_type === 'one_time' ? null : nextRunAt,
    };

    await admin
      .from('notification_automations')
      .update(automationPatch)
      .eq('id', automation.id);

    if (!sendResult.ok) {
      failedCount += 1;

      await logAutomationEvent(admin, {
        automationId: automation.id,
        notificationId: notificationInsert.id,
        scheduledFor: automation.next_run_at,
        status: 'failed',
        errorMessage: sendResult.error,
        payloadJson: { schedule_type: automation.schedule_type },
      });

      continue;
    }

    sentCount += Number(sendResult.data?.sent ?? 0);

    await logAutomationEvent(admin, {
      automationId: automation.id,
      notificationId: notificationInsert.id,
      scheduledFor: automation.next_run_at,
      status: 'sent',
      recipientCount: Number(sendResult.data?.sent ?? 0),
      payloadJson: { schedule_type: automation.schedule_type },
    });
  }

  return {
    due: due.length,
    sent: sentCount,
    failed: failedCount,
    skipped: skippedCount,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' }, 500);
    }

    const requiredToken = Deno.env.get('PROCESS_RECURRING_TOKEN');
    if (requiredToken) {
      const authorization = req.headers.get('authorization') ?? '';
      const providedToken = authorization.replace(/^Bearer\s+/i, '').trim();
      if (providedToken !== requiredToken) {
        return jsonResponse({ error: 'Unauthorized.' }, 401);
      }
    }

    const body: ProcessorRequest = req.method === 'POST'
      ? await req.json().catch(() => ({}))
      : {};

    const dryRun = body.dryRun === true;
    const maxBatchRaw = Number(body.maxBatch ?? 25);
    const maxBatch = Number.isFinite(maxBatchRaw)
      ? Math.max(1, Math.min(100, Math.floor(maxBatchRaw)))
      : 25;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const scheduledSummary = await processScheduledNotifications({
      admin,
      supabaseUrl,
      accessToken: serviceRoleKey,
      dryRun,
      maxBatch,
    });

    const automationSummary = await processRecurringAutomations({
      admin,
      supabaseUrl,
      accessToken: serviceRoleKey,
      dryRun,
      maxBatch,
    });

    return jsonResponse({
      success: true,
      dryRun,
      source: body.source ?? 'manual',
      scheduled: scheduledSummary,
      automations: automationSummary,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
});

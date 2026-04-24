/**
 * Notification Service
 * All push notification and device token database operations.
 * Flow: UI → Hook (React Query) → Service → Supabase
 */

import { invokeExternalFunction, onspaceCloud, supabase } from '#/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  urdu_body?: string | null;
  image_url: string | null;
  link_url: string | null;
  payload_json?: Record<string, unknown> | null;
  format_version?: string | null;
  cta_label?: string | null;
  audience: string;
  category: string;
  status: 'draft' | 'sent' | 'failed' | 'scheduled';
  sent_at: string | null;
  scheduled_for: string | null;
  recipient_count: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceToken {
  id: string;
  token: string;
  platform: string;
  app_version: string | null;
  device_model: string | null;
  is_active: boolean;
  registered_at: string;
  last_active: string;
}

export interface NotificationAutomation {
  id: string;
  name: string;
  enabled: boolean;
  schedule_type: 'one_time' | 'daily' | 'weekly' | 'prayer';
  schedule_timezone: string;
  one_time_at: string | null;
  next_run_at: string | null;
  recurrence_days: number[];
  prayer_names: string[];
  title: string;
  body: string;
  urdu_body: string | null;
  image_url: string | null;
  link_url: string | null;
  cta_label: string | null;
  audience: string;
  category: string;
  run_count: number;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationAutomationEvent {
  id: string;
  automation_id: string | null;
  notification_id: string | null;
  scheduled_for: string | null;
  processed_at: string | null;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  recipient_count: number | null;
  error_message: string | null;
  payload_json: Record<string, unknown>;
  created_at: string;
}

export interface UpsertAutomationPayload {
  name: string;
  enabled: boolean;
  schedule_type: 'one_time' | 'daily' | 'weekly' | 'prayer';
  schedule_timezone: string;
  one_time_at?: string | null;
  next_run_at?: string | null;
  recurrence_days?: number[];
  prayer_names?: string[];
  title: string;
  body: string;
  urdu_body?: string | null;
  image_url?: string | null;
  link_url?: string | null;
  cta_label?: string | null;
  audience?: string;
  category?: string;
}

export interface SendNotificationPayload {
  title: string;
  body: string;
  urduBody?: string;
  imageUrl?: string;
  linkUrl?: string;
  ctaLabel?: string;
  audience?: string;
  category?: string;
  scheduledFor?: string;
}

export interface SendResult {
  sent: number;
  total: number;
  errors?: string[];
}

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationService = {
  /** Fetch all push notification records, newest first. */
  getAll: async (): Promise<PushNotification[]> => {
    const { data, error } = await supabase
      .from('push_notifications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to fetch notifications: ${error.message}`);
    return data as PushNotification[];
  },

  /** Save a draft or scheduled notification record. Returns the created row. */
  saveDraft: async (
    payload: SendNotificationPayload,
    status: 'draft' | 'scheduled' = 'draft'
  ): Promise<PushNotification> => {
    const { data, error } = await supabase
      .from('push_notifications')
      .insert({
        title: payload.title,
        body: payload.body,
        urdu_body: payload.urduBody ?? null,
        image_url: payload.imageUrl ?? null,
        link_url: payload.linkUrl ?? null,
        cta_label: payload.ctaLabel ?? null,
        format_version: 'v1',
        payload_json: {
          hasImage: Boolean(payload.imageUrl),
          hasUrl: Boolean(payload.linkUrl),
          hasUrdu: Boolean(payload.urduBody),
          ctaLabel: payload.ctaLabel ?? null,
        },
        audience: payload.audience ?? 'all',
        category: payload.category ?? 'general',
        status,
        sent_at: null,
        scheduled_for: payload.scheduledFor
          ? new Date(payload.scheduledFor).toISOString()
          : null,
        recipient_count: null,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to save notification: ${error.message}`);
    return data as PushNotification;
  },

  /** Mark a notification record as failed with an error message. */
  markFailed: async (id: string, errorMessage: string): Promise<void> => {
    await supabase
      .from('push_notifications')
      .update({ status: 'failed', error_message: errorMessage })
      .eq('id', id);
  },

  /** Delete a notification record from history. */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('push_notifications')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Failed to delete notification: ${error.message}`);
  },

  /**
   * Send a notification immediately via the Edge Function.
   * Creates a draft record first, then invokes the Edge Function.
   * Returns the draft record and the delivery result.
   */
  send: async (
    payload: SendNotificationPayload
  ): Promise<{ record: PushNotification; result: SendResult }> => {
    // 1. Save draft to DB first to get an ID
    const draft = await notificationService.saveDraft(payload, 'draft');

    // 2. Call Edge Function
    const { data, error } = await invokeExternalFunction<{
      sent?: number;
      total?: number;
      errors?: string[];
    }>('send-notification-formatted', {
      notificationId: draft.id,
      title: payload.title,
      body: payload.body,
      urduBody: payload.urduBody,
      imageUrl: payload.imageUrl,
      linkUrl: payload.linkUrl,
      ctaLabel: payload.ctaLabel,
      audience: payload.audience ?? 'all',
      category: payload.category ?? 'general',
      formatVersion: 'v1',
    });

    if (error) {
      const errorMessage = typeof error === 'string' ? error : 'Unknown edge function error';
      await notificationService.markFailed(draft.id, errorMessage);
      throw new Error(errorMessage);
    }

    return {
      record: draft,
      result: {
        sent: data?.sent ?? 0,
        total: data?.total ?? 0,
        errors: data?.errors,
      },
    };
  },

  /** Upload a notification image to Supabase Storage and return the public URL. */
  uploadImage: async (file: File): Promise<string> => {
    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error('Only JPG, PNG, WebP, and GIF images are supported.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Image must be under 10 MB.');
    }

    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `notifications/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await onspaceCloud.storage
      .from('adhkar-images')
      .upload(path, file, { contentType: file.type });

    if (error) throw new Error(`Upload failed: ${error.message}`);

    const { data } = onspaceCloud.storage.from('adhkar-images').getPublicUrl(path);
    return data.publicUrl;
  },

  /** List notification images from storage. */
  listImages: async (): Promise<{ name: string; url: string; path: string }[]> => {
    const { data } = await onspaceCloud.storage
      .from('adhkar-images')
      .list('notifications', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

    if (!data) return [];

    return data
      .filter((f) => f.name !== '.emptyFolderPlaceholder' && f.metadata)
      .map((f) => {
        const path = `notifications/${f.name}`;
        const { data: u } = onspaceCloud.storage.from('adhkar-images').getPublicUrl(path);
        return { name: f.name, url: u.publicUrl, path };
      });
  },
};

// ─── Device Tokens ────────────────────────────────────────────────────────────

export const deviceTokenService = {
  /** Fetch all device tokens, sorted by most recently active. */
  getAll: async (): Promise<DeviceToken[]> => {
    const { data, error } = await supabase
      .from('device_tokens')
      .select('*')
      .order('last_active', { ascending: false });
    if (error) throw new Error(`Failed to fetch device tokens: ${error.message}`);
    return data as DeviceToken[];
  },

  /** Count active tokens. */
  countActive: (tokens: DeviceToken[]): number =>
    tokens.filter((t) => t.is_active).length,

  /** Split tokens by platform. */
  byPlatform: (tokens: DeviceToken[]): Record<string, DeviceToken[]> => {
    const active = tokens.filter((t) => t.is_active);
    return {
      ios: active.filter((t) => t.platform === 'ios'),
      android: active.filter((t) => t.platform === 'android'),
      other: active.filter((t) => t.platform !== 'ios' && t.platform !== 'android'),
    };
  },
};

// ─── Automations ─────────────────────────────────────────────────────────────

export const notificationAutomationService = {
  /** Fetch all automation rules, newest first. */
  getAll: async (): Promise<NotificationAutomation[]> => {
    const { data, error } = await supabase
      .from('notification_automations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to fetch automation rules: ${error.message}`);
    return (data ?? []) as NotificationAutomation[];
  },

  /** Fetch recent automation execution events. */
  getRecentEvents: async (limit = 40): Promise<NotificationAutomationEvent[]> => {
    const { data, error } = await supabase
      .from('notification_automation_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to fetch automation events: ${error.message}`);
    return (data ?? []) as NotificationAutomationEvent[];
  },

  /** Create a new automation rule. */
  create: async (payload: UpsertAutomationPayload): Promise<NotificationAutomation> => {
    const { data, error } = await supabase
      .from('notification_automations')
      .insert({
        ...payload,
        recurrence_days: payload.recurrence_days ?? [],
        prayer_names: payload.prayer_names ?? [],
        audience: payload.audience ?? 'all',
        category: payload.category ?? 'general',
      })
      .select('*')
      .single();
    if (error) throw new Error(`Failed to create automation rule: ${error.message}`);
    return data as NotificationAutomation;
  },

  /** Enable/disable an automation rule. */
  setEnabled: async (id: string, enabled: boolean): Promise<void> => {
    const { error } = await supabase
      .from('notification_automations')
      .update({ enabled })
      .eq('id', id);
    if (error) throw new Error(`Failed to update automation status: ${error.message}`);
  },

  /** Delete an automation rule. */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('notification_automations')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Failed to delete automation rule: ${error.message}`);
  },
};

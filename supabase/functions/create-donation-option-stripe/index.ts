import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.51.0';
import { corsHeaders } from '../_shared/cors.ts';

type DonationFrequency = 'one-off' | 'monthly';

type DonationOptionInsert = {
  title: string;
  subtitle: string | null;
  frequency: DonationFrequency;
  amount_minor: number | null;
  currency: string;
  is_custom: boolean;
  tags: string[];
  is_active: boolean;
  is_featured: boolean;
  is_pinned: boolean;
  pin_order: number;
  display_order: number;
  global_order: number;
  campaign_label: string | null;
  campaign_copy: string | null;
  promo_start_at: string | null;
  promo_end_at: string | null;
  price_slot: number | null;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function parseBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function decodeJwtPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const encoded = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
    const decoded = atob(padded);
    const payload = JSON.parse(decoded) as unknown;
    if (payload && typeof payload === 'object') {
      return payload as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function getPortalRole(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;

  const rootRole = typeof payload.portal_role === 'string' ? payload.portal_role : null;
  if (rootRole) return rootRole;

  const userMetadata = payload.user_metadata;
  if (userMetadata && typeof userMetadata === 'object') {
    const metadataRole = (userMetadata as Record<string, unknown>).portal_role;
    if (typeof metadataRole === 'string') return metadataRole;
  }

  return null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asIntegerOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function normalizeInput(raw: Record<string, unknown>): DonationOptionInsert {
  const title = asTrimmedString(raw.title) ?? '';
  const frequency = (asTrimmedString(raw.frequency) ?? 'one-off') as DonationFrequency;
  const currency = (asTrimmedString(raw.currency) ?? 'GBP').toUpperCase();
  const isCustom = asBoolean(raw.is_custom, false);

  const payload: DonationOptionInsert = {
    title,
    subtitle: asTrimmedString(raw.subtitle),
    frequency,
    amount_minor: isCustom ? null : asIntegerOrNull(raw.amount_minor),
    currency,
    is_custom: isCustom,
    tags: asStringArray(raw.tags),
    is_active: asBoolean(raw.is_active, true),
    is_featured: asBoolean(raw.is_featured, false),
    is_pinned: asBoolean(raw.is_pinned, false),
    pin_order: asNumber(raw.pin_order, 0),
    display_order: asNumber(raw.display_order, 0),
    global_order: asNumber(raw.global_order, 0),
    campaign_label: asTrimmedString(raw.campaign_label),
    campaign_copy: asTrimmedString(raw.campaign_copy),
    promo_start_at: asTrimmedString(raw.promo_start_at),
    promo_end_at: asTrimmedString(raw.promo_end_at),
    price_slot: asIntegerOrNull(raw.price_slot),
    stripe_price_id: asTrimmedString(raw.stripe_price_id),
    stripe_product_id: asTrimmedString(raw.stripe_product_id),
  };

  return payload;
}

async function createStripeProduct(params: {
  stripeSecretKey: string;
  title: string;
  subtitle: string | null;
  tags: string[];
  frequency: DonationFrequency;
}): Promise<string> {
  const formData = new URLSearchParams();
  formData.set('name', params.title);
  if (params.subtitle) {
    formData.set('description', params.subtitle);
  }
  formData.set('metadata[source]', 'portal');
  formData.set('metadata[frequency]', params.frequency);
  params.tags.slice(0, 10).forEach((tag, index) => {
    formData.set(`metadata[tag_${index + 1}]`, tag);
  });

  const response = await fetch('https://api.stripe.com/v1/products', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  const payload = await response.json().catch(() => ({}));
  const productId = typeof payload?.id === 'string' ? payload.id : null;

  if (!response.ok || !productId) {
    const reason = typeof payload?.error?.message === 'string'
      ? payload.error.message
      : 'Stripe product creation failed.';
    throw new Error(reason);
  }

  return productId;
}

async function createStripePrice(params: {
  stripeSecretKey: string;
  productId: string;
  frequency: DonationFrequency;
  currency: string;
  amountMinor: number | null;
  isCustom: boolean;
}): Promise<string> {
  const formData = new URLSearchParams();
  formData.set('currency', params.currency.toLowerCase());
  formData.set('product', params.productId);

  if (params.frequency === 'monthly') {
    formData.set('recurring[interval]', 'month');
  }

  if (params.isCustom) {
    if (params.frequency !== 'one-off') {
      throw new Error('Custom unit amount is only supported for one-off donations.');
    }
    formData.set('custom_unit_amount[enabled]', 'true');
    const minimum = params.amountMinor && params.amountMinor > 0 ? Math.floor(params.amountMinor) : 100;
    formData.set('custom_unit_amount[minimum]', String(minimum));
  } else {
    if (!params.amountMinor || params.amountMinor <= 0) {
      throw new Error('Amount (minor units) is required for fixed donation options.');
    }
    formData.set('unit_amount', String(Math.floor(params.amountMinor)));
  }

  const response = await fetch('https://api.stripe.com/v1/prices', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  const payload = await response.json().catch(() => ({}));
  const priceId = typeof payload?.id === 'string' ? payload.id : null;

  if (!response.ok || !priceId) {
    const reason = typeof payload?.error?.message === 'string'
      ? payload.error.message
      : 'Stripe price creation failed.';
    throw new Error(reason);
  }

  return priceId;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const token = parseBearerToken(req.headers.get('Authorization'));
    const jwtPayload = decodeJwtPayload(token);
    const portalRole = getPortalRole(jwtPayload);

    if (!portalRole || !['admin', 'editor'].includes(portalRole)) {
      return jsonResponse({ error: 'Only admin/editor can create donation options.' }, 403);
    }

    const requestBody = await req.json().catch(() => ({}));
    const rawOption = requestBody?.option && typeof requestBody.option === 'object'
      ? requestBody.option as Record<string, unknown>
      : requestBody as Record<string, unknown>;

    const option = normalizeInput(rawOption);

    if (!option.title) {
      return jsonResponse({ error: 'Title is required.' }, 400);
    }

    if (!['one-off', 'monthly'].includes(option.frequency)) {
      return jsonResponse({ error: 'Frequency must be one-off or monthly.' }, 400);
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return jsonResponse({ error: 'Stripe is not configured on the server.' }, 500);
    }

    const hasManualIds = !!(option.stripe_price_id && option.stripe_product_id);
    const hasPartialManualIds = !!(option.stripe_price_id || option.stripe_product_id) && !hasManualIds;
    if (hasPartialManualIds) {
      return jsonResponse({ error: 'Provide both Stripe Price ID and Product ID, or leave both empty for auto-create.' }, 400);
    }

    let stripeProductId = option.stripe_product_id;
    let stripePriceId = option.stripe_price_id;

    if (!hasManualIds) {
      stripeProductId = await createStripeProduct({
        stripeSecretKey,
        title: option.title,
        subtitle: option.subtitle,
        tags: option.tags,
        frequency: option.frequency,
      });

      stripePriceId = await createStripePrice({
        stripeSecretKey,
        productId: stripeProductId,
        frequency: option.frequency,
        currency: option.currency,
        amountMinor: option.amount_minor,
        isCustom: option.is_custom,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse({ error: 'Supabase server credentials are not configured.' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('donation_options')
      .insert({
        ...option,
        stripe_price_id: stripePriceId,
        stripe_product_id: stripeProductId,
      })
      .select('*')
      .single();

    if (error) {
      return jsonResponse({ error: `Failed to create donation option: ${error.message}` }, 400);
    }

    return jsonResponse(data, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});

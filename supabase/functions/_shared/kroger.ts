import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

export type KrogerConnection = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string | null;
  expires_at: string;
  preferred_location_id: string | null;
  preferred_location_name: string | null;
};

export type KrogerProduct = {
  upc: string;
  description: string;
  brand: string | null;
  size: string | null;
  imageUrl: string | null;
  price: number | null;
};

const defaultBaseUrl = 'https://api.kroger.com/v1';
const defaultAuthBaseUrl = 'https://api.kroger.com/v1/connect/oauth2';

export function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function krogerBaseUrl() {
  return Deno.env.get('KROGER_BASE_URL') ?? defaultBaseUrl;
}

export function krogerAuthBaseUrl() {
  return Deno.env.get('KROGER_AUTH_BASE_URL') ?? defaultAuthBaseUrl;
}

export function krogerScopes() {
  return Deno.env.get('KROGER_SCOPES') ?? 'profile.compact product.compact cart.basic:write';
}

function basicAuthHeader() {
  const clientId = requiredEnv('KROGER_CLIENT_ID');
  const clientSecret = requiredEnv('KROGER_CLIENT_SECRET');
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

export function buildAuthorizationUrl(state: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: requiredEnv('KROGER_CLIENT_ID'),
    redirect_uri: requiredEnv('KROGER_REDIRECT_URI'),
    scope: krogerScopes(),
    state,
  });
  return `${krogerAuthBaseUrl()}/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string) {
  const response = await fetch(`${krogerAuthBaseUrl()}/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: requiredEnv('KROGER_REDIRECT_URI'),
    }),
  });

  if (!response.ok) {
    throw new Error(`Kroger token exchange failed: ${await response.text()}`);
  }
  return response.json();
}

export async function refreshKrogerToken(supabase: SupabaseClient, connection: KrogerConnection) {
  const response = await fetch(`${krogerAuthBaseUrl()}/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token,
    }),
  });

  if (!response.ok) {
    throw new Error(`Kroger token refresh failed: ${await response.text()}`);
  }

  const token = await response.json();
  const expiresAt = new Date(Date.now() + Number(token.expires_in ?? 1800) * 1000).toISOString();
  const nextConnection = {
    ...connection,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? connection.refresh_token,
    token_type: token.token_type ?? connection.token_type,
    scope: token.scope ?? connection.scope,
    expires_at: expiresAt,
  };
  const { error } = await supabase.rpc('kroger_upsert_connection', {
    connection_user_id: connection.user_id,
    connection_access_token: nextConnection.access_token,
    connection_refresh_token: nextConnection.refresh_token,
    connection_token_type: nextConnection.token_type,
    connection_scope: nextConnection.scope,
    connection_expires_at: nextConnection.expires_at,
  });
  if (error) {
    throw new Error(error.message);
  }
  return nextConnection;
}

export async function getFreshKrogerConnection(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.rpc('kroger_get_connection', { connection_user_id: userId }).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  const connection = data as KrogerConnection;
  const expiresAt = new Date(connection.expires_at).getTime();
  if (expiresAt - Date.now() < 120_000) {
    return refreshKrogerToken(supabase, connection);
  }
  return connection;
}

export function mapKrogerProduct(product: Record<string, unknown>): KrogerProduct {
  const items = Array.isArray(product.items) ? product.items as Record<string, unknown>[] : [];
  const firstItem = items[0] ?? {};
  const images = Array.isArray(product.images) ? product.images as Record<string, unknown>[] : [];
  const firstImage = images[0];
  const sizes = Array.isArray(firstImage?.sizes) ? firstImage.sizes as Record<string, unknown>[] : [];
  const firstSize = sizes[0];
  const price = firstItem.price as Record<string, unknown> | undefined;

  return {
    upc: String(product.upc ?? ''),
    description: String(product.description ?? ''),
    brand: product.brand ? String(product.brand) : null,
    size: firstItem.size ? String(firstItem.size) : null,
    imageUrl: firstSize?.url ? String(firstSize.url) : null,
    price: typeof price?.regular === 'number' ? price.regular : null,
  };
}

export async function searchProducts(accessToken: string, term: string, locationId: string | null) {
  const params = new URLSearchParams({
    'filter.term': term,
    'filter.limit': '8',
  });
  if (locationId) {
    params.set('filter.locationId', locationId);
  }

  const response = await fetch(`${krogerBaseUrl()}/products?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Kroger product search failed: ${await response.text()}`);
  }
  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data.map(mapKrogerProduct).filter((product: KrogerProduct) => product.upc && product.description) : [];
}

export async function addToCart(accessToken: string, items: Array<{ upc: string; quantity: number; allowSubstitutes: boolean; specialInstructions?: string | null }>) {
  const cartPath = Deno.env.get('KROGER_CART_ADD_PATH') ?? '/cart/add';
  const response = await fetch(`${krogerBaseUrl()}${cartPath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      items: items.map((item) => ({
        upc: item.upc,
        quantity: item.quantity,
        allowSubstitutes: item.allowSubstitutes,
        modality: 'PICKUP',
        specialInstructions: item.specialInstructions ?? undefined,
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(`Kroger add-to-cart failed: ${await response.text()}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : { ok: true };
}

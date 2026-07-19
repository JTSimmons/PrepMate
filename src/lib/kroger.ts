import { supabase } from './supabase';
import type { KrogerPreviewItem, KrogerProduct, ShoppingListKrogerMatch } from './types';

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }
  return supabase;
}

function assertInvoke<T>(data: T | null, error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
  return data as T;
}

export async function startKrogerAuth() {
  const { data, error } = await requireSupabase().functions.invoke<{ authorizationUrl: string }>('kroger-auth-start', {
    body: { redirectTo: window.location.href },
  });
  return assertInvoke(data, error).authorizationUrl;
}

export async function fetchKrogerPreview(shoppingListId: string, includeChecked: boolean) {
  const { data, error } = await requireSupabase().functions.invoke<{
    connected: boolean;
    preferredLocationId: string | null;
    preferredLocationName: string | null;
    items: KrogerPreviewItem[];
  }>('kroger-cart-preview', {
    body: { shoppingListId, includeChecked },
  });
  return assertInvoke(data, error);
}

export async function searchKrogerProducts(term: string, locationId: string | null) {
  const { data, error } = await requireSupabase().functions.invoke<{ connected: boolean; products: KrogerProduct[] }>('kroger-product-search', {
    body: { term, locationId },
  });
  return assertInvoke(data, error);
}

export async function saveKrogerMatch(itemId: string, product: KrogerProduct | null, patch: Partial<ShoppingListKrogerMatch> = {}) {
  const payload = {
    shopping_list_item_id: itemId,
    kroger_product_upc: product?.upc ?? patch.kroger_product_upc ?? null,
    product_name: product?.description ?? patch.product_name ?? null,
    brand: product?.brand ?? patch.brand ?? null,
    size: product?.size ?? patch.size ?? null,
    image_url: product?.imageUrl ?? patch.image_url ?? null,
    price: product?.price ?? patch.price ?? null,
    regular_price: product?.regularPrice ?? patch.regular_price ?? null,
    promo_price: product?.promoPrice ?? patch.promo_price ?? null,
    is_on_sale: product?.isOnSale ?? patch.is_on_sale ?? false,
    package_quantity: patch.package_quantity ?? 1,
    allow_substitutes: patch.allow_substitutes ?? true,
    special_instructions: patch.special_instructions ?? null,
    status: patch.status ?? (product ? 'approved' : 'skipped'),
    last_error: null,
  };

  const { data, error } = await requireSupabase()
    .from('shopping_list_kroger_matches')
    .upsert(payload, { onConflict: 'shopping_list_item_id,created_by' })
    .select('*')
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data as ShoppingListKrogerMatch;
}

export async function updateKrogerMatch(matchId: string, patch: Partial<ShoppingListKrogerMatch>) {
  const { data, error } = await requireSupabase().from('shopping_list_kroger_matches').update(patch).eq('id', matchId).select('*').single();
  if (error) {
    throw new Error(error.message);
  }
  return data as ShoppingListKrogerMatch;
}

export async function submitKrogerCart(shoppingListId: string, includeChecked: boolean) {
  const { data, error } = await requireSupabase().functions.invoke<{ added: number; failed: number }>('kroger-cart-submit', {
    body: { shoppingListId, includeChecked },
  });
  return assertInvoke(data, error);
}

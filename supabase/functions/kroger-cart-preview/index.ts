import { getFreshKrogerConnection } from '../_shared/kroger.ts';
import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { requireShoppingListAccess, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json();
    const shoppingListId = typeof body.shoppingListId === 'string' ? body.shoppingListId : '';
    if (!shoppingListId) {
      throw new Error('shoppingListId is required.');
    }
    await requireShoppingListAccess(supabase, user.id, shoppingListId);

    const connection = await getFreshKrogerConnection(supabase, user.id);
    const itemQuery = supabase
      .from('shopping_list_items')
      .select('*')
      .eq('shopping_list_id', shoppingListId)
      .eq('is_removed', false)
      .order('display_name', { ascending: true });

    const { data: items, error } = await itemQuery;
    if (error) throw new Error(error.message);
    const itemIds = (items ?? []).map((item) => item.id);
    const { data: matches, error: matchesError } = itemIds.length
      ? await supabase
        .from('shopping_list_kroger_matches')
        .select('*')
        .eq('created_by', user.id)
        .in('shopping_list_item_id', itemIds)
      : { data: [], error: null };
    if (matchesError) throw new Error(matchesError.message);

    const matchesByItem = new Map((matches ?? []).map((match) => [match.shopping_list_item_id, match]));
    const itemsWithMatches = (items ?? []).map((item) => ({
      ...item,
      shopping_list_kroger_matches: matchesByItem.has(item.id) ? [matchesByItem.get(item.id)] : [],
    }));

    return jsonResponse({
      connected: Boolean(connection),
      preferredLocationId: Deno.env.get('KROGER_DEFAULT_LOCATION_ID') ?? connection?.preferred_location_id ?? null,
      preferredLocationName: Deno.env.get('KROGER_DEFAULT_LOCATION_NAME') ?? connection?.preferred_location_name ?? null,
      items: itemsWithMatches,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Could not build Kroger cart preview.' }, 400);
  }
});

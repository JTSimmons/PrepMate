import { addToCart, getFreshKrogerConnection } from '../_shared/kroger.ts';
import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { requireShoppingListAccess, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json();
    const shoppingListId = typeof body.shoppingListId === 'string' ? body.shoppingListId : '';
    const includeChecked = Boolean(body.includeChecked);
    if (!shoppingListId) {
      throw new Error('shoppingListId is required.');
    }
    await requireShoppingListAccess(supabase, user.id, shoppingListId);

    const connection = await getFreshKrogerConnection(supabase, user.id);
    if (!connection) {
      throw new Error('Connect Kroger before adding items to cart.');
    }

    let matchQuery = supabase
      .from('shopping_list_kroger_matches')
      .select('*, shopping_list_items!inner(shopping_list_id,is_removed,is_checked)')
      .eq('created_by', user.id)
      .eq('status', 'approved')
      .eq('shopping_list_items.shopping_list_id', shoppingListId)
      .eq('shopping_list_items.is_removed', false);
    if (!includeChecked) {
      matchQuery = matchQuery.eq('shopping_list_items.is_checked', false);
    }
    const { data: matches, error } = await matchQuery;
    if (error) throw new Error(error.message);

    const approved = (matches ?? []).filter((match) => match.kroger_product_upc);
    if (approved.length === 0) {
      throw new Error('Approve at least one Kroger product before adding to cart.');
    }

    try {
      await addToCart(
        connection.access_token,
        approved.map((match) => ({
          upc: match.kroger_product_upc,
          quantity: match.package_quantity,
          allowSubstitutes: match.allow_substitutes,
          specialInstructions: match.special_instructions,
        })),
      );
      const ids = approved.map((match) => match.id);
      const { error: updateError } = await supabase
        .from('shopping_list_kroger_matches')
        .update({ status: 'added', last_error: null })
        .in('id', ids);
      if (updateError) throw new Error(updateError.message);
      return jsonResponse({ added: approved.length, failed: 0 });
    } catch (cartError) {
      const ids = approved.map((match) => match.id);
      const message = cartError instanceof Error ? cartError.message : 'Kroger cart submit failed.';
      await supabase.from('shopping_list_kroger_matches').update({ status: 'failed', last_error: message }).in('id', ids);
      throw cartError;
    }
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Could not add items to Kroger cart.' }, 400);
  }
});

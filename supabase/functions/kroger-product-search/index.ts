import { getFreshKrogerConnection, searchProducts } from '../_shared/kroger.ts';
import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { requireUser } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json();
    const term = typeof body.term === 'string' ? body.term.trim() : '';
    const locationId = typeof body.locationId === 'string' && body.locationId.trim() ? body.locationId.trim() : null;
    if (!term) {
      throw new Error('Search term is required.');
    }

    const connection = await getFreshKrogerConnection(supabase, user.id);
    if (!connection) {
      return jsonResponse({ connected: false, products: [] });
    }

    const products = await searchProducts(connection.access_token, term, locationId ?? connection.preferred_location_id);
    return jsonResponse({ connected: true, products });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Kroger product search failed.' }, 400);
  }
});

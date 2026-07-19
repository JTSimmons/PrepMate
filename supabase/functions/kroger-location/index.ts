import { getFreshKrogerConnection, searchLocations } from '../_shared/kroger.ts';
import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { requireUser } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { supabase, user } = await requireUser(request);
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const action = typeof body.action === 'string' ? body.action : 'search';

    const connection = await getFreshKrogerConnection(supabase, user.id);
    if (!connection) {
      throw new Error('Connect Kroger before selecting a store.');
    }

    if (action === 'select') {
      const locationId = typeof body.locationId === 'string' ? body.locationId.trim() : '';
      const locationName = typeof body.locationName === 'string' ? body.locationName.trim() : '';
      if (!locationId) {
        throw new Error('locationId is required.');
      }

      const { error } = await supabase.rpc('kroger_set_preferred_location', {
        connection_user_id: user.id,
        location_id: locationId,
        location_name: locationName,
      });
      if (error) throw new Error(error.message);
      return jsonResponse({ preferredLocationId: locationId, preferredLocationName: locationName || null });
    }

    const zipCode = typeof body.zipCode === 'string' ? body.zipCode.trim() : '';
    if (!/^\d{5}$/.test(zipCode)) {
      throw new Error('Enter a 5-digit ZIP code.');
    }

    const locations = await searchLocations(connection.access_token, zipCode);
    return jsonResponse({ locations });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Could not update Kroger location.' }, 400);
  }
});

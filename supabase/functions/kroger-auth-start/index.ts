import { buildAuthorizationUrl } from '../_shared/kroger.ts';
import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { requireUser } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { supabase, user } = await requireUser(request);
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await supabase.schema('private').from('kroger_oauth_states').insert({
      state,
      user_id: user.id,
      redirect_to: typeof body.redirectTo === 'string' ? body.redirectTo : null,
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);

    return jsonResponse({ authorizationUrl: buildAuthorizationUrl(state) });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Could not start Kroger authorization.' }, 400);
  }
});

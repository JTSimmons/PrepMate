import { exchangeCodeForToken } from '../_shared/kroger.ts';
import { serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return redirectToApp(null, 'error', `Kroger authorization failed: ${error}`);
  }
  if (!code || !state) {
    return redirectToApp(null, 'error', 'Kroger authorization is missing required parameters.');
  }

  try {
    const supabase = serviceClient();
    const { data: stateRow, error: stateError } = await supabase
      .rpc('kroger_get_oauth_state', { state_value: state })
      .maybeSingle();
    if (stateError) throw new Error(stateError.message);
    if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
      throw new Error('Kroger authorization state expired. Start the connection again.');
    }

    const token = await exchangeCodeForToken(code);
    const expiresAt = new Date(Date.now() + Number(token.expires_in ?? 1800) * 1000).toISOString();
    const { error: upsertError } = await supabase.rpc('kroger_upsert_connection', {
      connection_user_id: stateRow.user_id,
      connection_access_token: token.access_token,
      connection_refresh_token: token.refresh_token,
      connection_token_type: token.token_type ?? 'Bearer',
      connection_scope: token.scope ?? null,
      connection_expires_at: expiresAt,
    });
    if (upsertError) throw new Error(upsertError.message);

    await supabase.rpc('kroger_delete_oauth_state', { state_value: state });
    return redirectToApp(stateRow.redirect_to, 'connected');
  } catch (caught) {
    return redirectToApp(null, 'error', caught instanceof Error ? caught.message : 'Kroger authorization failed.');
  }
});

function redirectToApp(redirectTo: string | null, status: 'connected' | 'error', message?: string) {
  const target = safeRedirectUrl(redirectTo);
  target.searchParams.set('kroger', status);
  if (message) {
    target.searchParams.set('kroger_message', message);
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: target.toString(),
      'Cache-Control': 'no-store',
    },
  });
}

function safeRedirectUrl(redirectTo: string | null) {
  const fallback = new URL('https://jtsimmons.github.io/PrepMate/#/grocery-list');
  if (!redirectTo) {
    return fallback;
  }

  try {
    const parsed = new URL(redirectTo);
    if (parsed.origin === 'https://jtsimmons.github.io' && parsed.pathname.startsWith('/PrepMate')) {
      return parsed;
    }
    if (parsed.origin === 'http://localhost:5173') {
      return parsed;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

import { exchangeCodeForToken } from '../_shared/kroger.ts';
import { htmlResponse } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return htmlResponse(closePage(`Kroger authorization failed: ${error}`), 400);
  }
  if (!code || !state) {
    return htmlResponse(closePage('Kroger authorization is missing required parameters.'), 400);
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
    return htmlResponse(closePage('Kroger is connected. You can close this tab and return to PrepMate.'));
  } catch (caught) {
    return htmlResponse(closePage(caught instanceof Error ? caught.message : 'Kroger authorization failed.'), 400);
  }
});

function closePage(message: string) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>PrepMate Kroger</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 2rem;">
    <h1>PrepMate</h1>
    <p>${escapeHtml(message)}</p>
    <script>if (window.opener) window.opener.postMessage({ type: 'prepmate:kroger-connected' }, '*');</script>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

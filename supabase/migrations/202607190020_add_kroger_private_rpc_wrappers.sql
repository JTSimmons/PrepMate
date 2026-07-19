create or replace function public.kroger_create_oauth_state(
  state_value text,
  state_user_id uuid,
  state_redirect_to text,
  state_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, private
set row_security = off
as $$
begin
  insert into private.kroger_oauth_states(state, user_id, redirect_to, expires_at)
  values (state_value, state_user_id, state_redirect_to, state_expires_at);
end;
$$;

create or replace function public.kroger_get_oauth_state(state_value text)
returns table (
  state text,
  user_id uuid,
  redirect_to text,
  expires_at timestamptz
)
language sql
security definer
set search_path = public, private
set row_security = off
as $$
  select state, user_id, redirect_to, expires_at
  from private.kroger_oauth_states
  where state = state_value
$$;

create or replace function public.kroger_delete_oauth_state(state_value text)
returns void
language sql
security definer
set search_path = public, private
set row_security = off
as $$
  delete from private.kroger_oauth_states
  where state = state_value
$$;

create or replace function public.kroger_upsert_connection(
  connection_user_id uuid,
  connection_access_token text,
  connection_refresh_token text,
  connection_token_type text,
  connection_scope text,
  connection_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, private
set row_security = off
as $$
begin
  insert into private.kroger_connections(
    user_id,
    access_token,
    refresh_token,
    token_type,
    scope,
    expires_at
  )
  values (
    connection_user_id,
    connection_access_token,
    connection_refresh_token,
    coalesce(connection_token_type, 'Bearer'),
    connection_scope,
    connection_expires_at
  )
  on conflict (user_id) do update
  set access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_type = excluded.token_type,
      scope = excluded.scope,
      expires_at = excluded.expires_at,
      updated_at = now();
end;
$$;

create or replace function public.kroger_get_connection(connection_user_id uuid)
returns table (
  user_id uuid,
  access_token text,
  refresh_token text,
  token_type text,
  scope text,
  expires_at timestamptz,
  preferred_location_id text,
  preferred_location_name text
)
language sql
security definer
set search_path = public, private
set row_security = off
as $$
  select
    user_id,
    access_token,
    refresh_token,
    token_type,
    scope,
    expires_at,
    preferred_location_id,
    preferred_location_name
  from private.kroger_connections
  where user_id = connection_user_id
$$;

revoke all on function public.kroger_create_oauth_state(text, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.kroger_get_oauth_state(text) from public, anon, authenticated;
revoke all on function public.kroger_delete_oauth_state(text) from public, anon, authenticated;
revoke all on function public.kroger_upsert_connection(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.kroger_get_connection(uuid) from public, anon, authenticated;

grant execute on function public.kroger_create_oauth_state(text, uuid, text, timestamptz) to service_role;
grant execute on function public.kroger_get_oauth_state(text) to service_role;
grant execute on function public.kroger_delete_oauth_state(text) to service_role;
grant execute on function public.kroger_upsert_connection(uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.kroger_get_connection(uuid) to service_role;

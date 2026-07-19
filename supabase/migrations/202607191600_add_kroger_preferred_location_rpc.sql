create or replace function public.kroger_set_preferred_location(
  connection_user_id uuid,
  location_id text,
  location_name text
)
returns void
language plpgsql
security definer
set search_path = public, private
set row_security = off
as $$
begin
  update private.kroger_connections
  set preferred_location_id = nullif(location_id, ''),
      preferred_location_name = nullif(location_name, ''),
      updated_at = now()
  where user_id = connection_user_id;

  if not found then
    raise exception 'Connect Kroger before selecting a store.';
  end if;
end;
$$;

revoke all on function public.kroger_set_preferred_location(uuid, text, text) from public, anon, authenticated;
grant execute on function public.kroger_set_preferred_location(uuid, text, text) to service_role;

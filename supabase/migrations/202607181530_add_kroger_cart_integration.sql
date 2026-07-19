create schema if not exists private;

revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.kroger_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  token_type text not null default 'Bearer',
  scope text,
  expires_at timestamptz not null,
  preferred_location_id text,
  preferred_location_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.kroger_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_to text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.shopping_list_kroger_matches (
  id uuid primary key default gen_random_uuid(),
  shopping_list_item_id uuid not null references public.shopping_list_items(id) on delete cascade,
  kroger_product_upc text,
  product_name text,
  brand text,
  size text,
  image_url text,
  price numeric,
  package_quantity integer not null default 1 check (package_quantity > 0),
  allow_substitutes boolean not null default true,
  special_instructions text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'skipped', 'added', 'failed')),
  last_error text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shopping_list_item_id, created_by)
);

create index idx_kroger_oauth_states_user_id on private.kroger_oauth_states(user_id);
create index idx_kroger_matches_item_id on public.shopping_list_kroger_matches(shopping_list_item_id);
create index idx_kroger_matches_created_by on public.shopping_list_kroger_matches(created_by);

create trigger kroger_connections_touch_updated_at
before update on private.kroger_connections
for each row execute function public.touch_updated_at();

create trigger shopping_list_kroger_matches_touch_updated_at
before update on public.shopping_list_kroger_matches
for each row execute function public.touch_updated_at();

alter table public.shopping_list_kroger_matches enable row level security;

create or replace function public.shopping_list_item_household_id(target_item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select shopping_lists.household_id
  from public.shopping_list_items
  join public.shopping_lists on shopping_lists.id = shopping_list_items.shopping_list_id
  where shopping_list_items.id = target_item_id
$$;

create policy "members can read kroger matches"
on public.shopping_list_kroger_matches for select
using (
  created_by = auth.uid()
  and public.is_household_member(public.shopping_list_item_household_id(shopping_list_item_id))
);

create policy "members can insert kroger matches"
on public.shopping_list_kroger_matches for insert
with check (
  created_by = auth.uid()
  and public.is_household_member(public.shopping_list_item_household_id(shopping_list_item_id))
);

create policy "members can update own kroger matches"
on public.shopping_list_kroger_matches for update
using (
  created_by = auth.uid()
  and public.is_household_member(public.shopping_list_item_household_id(shopping_list_item_id))
)
with check (
  created_by = auth.uid()
  and public.is_household_member(public.shopping_list_item_household_id(shopping_list_item_id))
);

create policy "members can delete own kroger matches"
on public.shopping_list_kroger_matches for delete
using (
  created_by = auth.uid()
  and public.is_household_member(public.shopping_list_item_household_id(shopping_list_item_id))
);

grant select, insert, update, delete on public.shopping_list_kroger_matches to authenticated;
grant all on private.kroger_connections to service_role;
grant all on private.kroger_oauth_states to service_role;

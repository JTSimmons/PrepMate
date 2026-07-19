alter table public.shopping_list_kroger_matches
add column regular_price numeric,
add column promo_price numeric,
add column is_on_sale boolean not null default false;

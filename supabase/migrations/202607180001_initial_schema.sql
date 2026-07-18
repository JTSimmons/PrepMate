create extension if not exists "pgcrypto";

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  description text,
  recipe_url text,
  notes text,
  default_servings numeric not null default 4 check (default_servings > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  default_unit text,
  grocery_category text,
  created_at timestamptz not null default now()
);

create table public.meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  quantity numeric,
  unit text,
  preparation_note text,
  is_optional boolean not null default false
);

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create table public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
  servings numeric,
  planned_date date,
  quantity integer not null default 1 check (quantity > 0)
);

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_plan_id uuid references public.meal_plans(id) on delete set null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  display_name text not null,
  quantity numeric,
  unit text,
  category text,
  source text not null default 'meal' check (source in ('meal', 'manual')),
  is_checked boolean not null default false,
  is_removed boolean not null default false,
  notes text
);

create index idx_household_members_user_id on public.household_members(user_id);
create index idx_meals_household_id on public.meals(household_id);
create index idx_ingredients_household_id on public.ingredients(household_id);
create unique index idx_ingredients_household_name_unit
on public.ingredients(household_id, normalized_name, default_unit) nulls not distinct;
create index idx_meal_ingredients_meal_id on public.meal_ingredients(meal_id);
create index idx_meal_plans_household_id on public.meal_plans(household_id);
create index idx_meal_plan_items_meal_plan_id on public.meal_plan_items(meal_plan_id);
create index idx_shopping_lists_household_id on public.shopping_lists(household_id);
create index idx_shopping_list_items_list_id on public.shopping_list_items(shopping_list_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger meals_touch_updated_at
before update on public.meals
for each row execute function public.touch_updated_at();

create trigger shopping_lists_touch_updated_at
before update on public.shopping_lists
for each row execute function public.touch_updated_at();

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.create_household_for_current_user(household_name text default 'My Household')
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  created_household public.households;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.households(name)
  values (coalesce(nullif(trim(household_name), ''), 'My Household'))
  returning * into created_household;

  insert into public.household_members(household_id, user_id, role)
  values (created_household.id, auth.uid(), 'owner');

  return created_household;
end;
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.meals enable row level security;
alter table public.ingredients enable row level security;
alter table public.meal_ingredients enable row level security;
alter table public.meal_plans enable row level security;
alter table public.meal_plan_items enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;

create policy "members can read households"
on public.households for select
using (public.is_household_member(id));

create policy "members can update households"
on public.households for update
using (public.is_household_member(id))
with check (public.is_household_member(id));

create policy "members can read household members"
on public.household_members for select
using (public.is_household_member(household_id));

create policy "owners can manage household members"
on public.household_members for all
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = household_members.household_id
      and hm.user_id = auth.uid()
      and hm.role = 'owner'
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = household_members.household_id
      and hm.user_id = auth.uid()
      and hm.role = 'owner'
  )
);

create policy "members can manage meals"
on public.meals for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "members can manage ingredients"
on public.ingredients for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "members can manage meal ingredients"
on public.meal_ingredients for all
using (
  exists (
    select 1
    from public.meals
    join public.ingredients on ingredients.id = meal_ingredients.ingredient_id
    where meals.id = meal_ingredients.meal_id
      and ingredients.household_id = meals.household_id
      and public.is_household_member(meals.household_id)
  )
)
with check (
  exists (
    select 1
    from public.meals
    join public.ingredients on ingredients.id = meal_ingredients.ingredient_id
    where meals.id = meal_ingredients.meal_id
      and ingredients.household_id = meals.household_id
      and public.is_household_member(meals.household_id)
  )
);

create policy "members can manage meal plans"
on public.meal_plans for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "members can manage meal plan items"
on public.meal_plan_items for all
using (
  exists (
    select 1
    from public.meal_plans
    join public.meals on meals.id = meal_plan_items.meal_id
    where meal_plans.id = meal_plan_items.meal_plan_id
      and meals.household_id = meal_plans.household_id
      and public.is_household_member(meal_plans.household_id)
  )
)
with check (
  exists (
    select 1
    from public.meal_plans
    join public.meals on meals.id = meal_plan_items.meal_id
    where meal_plans.id = meal_plan_items.meal_plan_id
      and meals.household_id = meal_plans.household_id
      and public.is_household_member(meal_plans.household_id)
  )
);

create policy "members can manage shopping lists"
on public.shopping_lists for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "members can manage shopping list items"
on public.shopping_list_items for all
using (
  exists (
    select 1
    from public.shopping_lists
    left join public.ingredients on ingredients.id = shopping_list_items.ingredient_id
    where shopping_lists.id = shopping_list_items.shopping_list_id
      and (shopping_list_items.ingredient_id is null or ingredients.household_id = shopping_lists.household_id)
      and public.is_household_member(shopping_lists.household_id)
  )
)
with check (
  exists (
    select 1
    from public.shopping_lists
    left join public.ingredients on ingredients.id = shopping_list_items.ingredient_id
    where shopping_lists.id = shopping_list_items.shopping_list_id
      and (shopping_list_items.ingredient_id is null or ingredients.household_id = shopping_lists.household_id)
      and public.is_household_member(shopping_lists.household_id)
  )
);

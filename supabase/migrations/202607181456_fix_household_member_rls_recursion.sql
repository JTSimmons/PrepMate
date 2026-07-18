create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

drop policy if exists "members can read household members" on public.household_members;
drop policy if exists "owners can manage household members" on public.household_members;

create policy "members can read household members"
on public.household_members for select
using (public.is_household_member(household_id));

create policy "owners can insert household members"
on public.household_members for insert
with check (public.is_household_owner(household_id));

create policy "owners can update household members"
on public.household_members for update
using (public.is_household_owner(household_id))
with check (public.is_household_owner(household_id));

create policy "owners can delete household members"
on public.household_members for delete
using (public.is_household_owner(household_id));

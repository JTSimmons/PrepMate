import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';
import { getBearerToken } from './http.ts';

export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service environment is not configured.');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function requireUser(request: Request) {
  const token = getBearerToken(request);
  const supabase = serviceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error('Authentication required.');
  }
  return { supabase, user: data.user };
}

export async function requireShoppingListAccess(supabase: ReturnType<typeof serviceClient>, userId: string, shoppingListId: string) {
  const { data: list, error: listError } = await supabase
    .from('shopping_lists')
    .select('id, household_id')
    .eq('id', shoppingListId)
    .maybeSingle();
  if (listError) {
    throw new Error(listError.message);
  }
  if (!list) {
    throw new Error('Shopping list not found.');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('household_id', list.household_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (membershipError) {
    throw new Error(membershipError.message);
  }
  if (!membership) {
    throw new Error('You do not have access to this shopping list.');
  }

  return list;
}

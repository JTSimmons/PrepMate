import { aggregateGroceryItems, normalizeIngredientName } from './grocery';
import { supabase } from './supabase';
import type {
  AggregatedGroceryItem,
  Household,
  IngredientRowInput,
  Meal,
  MealFormValues,
  SelectedMeal,
  ShoppingList,
  ShoppingListItem,
} from './types';

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }
  return supabase;
}

function assertNoError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

export async function getOrCreateHousehold(): Promise<Household> {
  const client = requireSupabase();
  const { data: memberships, error } = await client
    .from('household_members')
    .select('households(id,name,created_at)')
    .limit(1);
  assertNoError(error);

  const household = memberships?.[0]?.households as Household | undefined;
  if (household) {
    return household;
  }

  const { data, error: rpcError } = await client.rpc('create_household_for_current_user', {
    household_name: 'My Household',
  });
  assertNoError(rpcError);
  return data as Household;
}

export async function fetchMeals(householdId: string): Promise<Meal[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('meals')
    .select(
      '*, meal_ingredients(*, ingredients(id,name,normalized_name,default_unit,grocery_category))',
    )
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  assertNoError(error);
  return (data ?? []) as Meal[];
}

async function findOrCreateIngredient(householdId: string, input: IngredientRowInput) {
  const client = requireSupabase();
  const normalizedName = normalizeIngredientName(input.name);

  const ingredientQuery = client
    .from('ingredients')
    .select('id')
    .eq('household_id', householdId)
    .eq('normalized_name', normalizedName)
    .is('default_unit', null);

  const { data: existing, error: findError } = await ingredientQuery.maybeSingle();
  assertNoError(findError);
  if (existing) {
    return existing.id as string;
  }

  const { data, error } = await client
    .from('ingredients')
    .insert({
      household_id: householdId,
      name: input.name.trim(),
      normalized_name: normalizedName,
      default_unit: null,
    })
    .select('id')
    .single();
  assertNoError(error);
  if (!data) {
    throw new Error('Could not save ingredient.');
  }
  return data.id as string;
}

export async function saveMeal(householdId: string, values: MealFormValues, mealId?: string) {
  const client = requireSupabase();
  const mealPayload = {
    household_id: householdId,
    name: values.name.trim(),
    description: null,
    recipe_url: values.recipe_url.trim() || null,
    notes: values.notes.trim() || null,
    default_servings: 1,
  };

  const mealResult = mealId
    ? await client.from('meals').update(mealPayload).eq('id', mealId).select('id').single()
    : await client.from('meals').insert(mealPayload).select('id').single();
  assertNoError(mealResult.error);
  if (!mealResult.data) {
    throw new Error('Could not save meal.');
  }

  const savedMealId = mealResult.data.id as string;
  if (mealId) {
    const { error } = await client.from('meal_ingredients').delete().eq('meal_id', savedMealId);
    assertNoError(error);
  }

  const rows = [];
  for (const ingredient of values.ingredients) {
    if (!ingredient.name.trim()) {
      continue;
    }
    rows.push({
      meal_id: savedMealId,
      ingredient_id: await findOrCreateIngredient(householdId, ingredient),
      quantity: ingredient.quantity,
      unit: null,
      preparation_note: null,
      is_optional: ingredient.is_optional,
    });
  }

  if (rows.length) {
    const { error } = await client.from('meal_ingredients').insert(rows);
    assertNoError(error);
  }
}

export async function deleteMeal(mealId: string) {
  const { error } = await requireSupabase().from('meals').delete().eq('id', mealId);
  assertNoError(error);
}

export async function createShoppingListSnapshot(householdId: string, selectedMeals: SelectedMeal[]) {
  const client = requireSupabase();
  const now = new Date();
  const listName = `Shopping list ${now.toLocaleDateString()}`;
  const planName = `Plan ${now.toLocaleDateString()}`;

  const { data: plan, error: planError } = await client
    .from('meal_plans')
    .insert({ household_id: householdId, name: planName, status: 'active' })
    .select('id')
    .single();
  assertNoError(planError);
  if (!plan) {
    throw new Error('Could not create meal plan.');
  }

  const planItems = selectedMeals.map((selected) => ({
    meal_plan_id: plan.id,
    meal_id: selected.meal.id,
    servings: null,
    quantity: 1,
  }));
  const { error: planItemsError } = await client.from('meal_plan_items').insert(planItems);
  assertNoError(planItemsError);

  const { data: list, error: listError } = await client
    .from('shopping_lists')
    .insert({ household_id: householdId, meal_plan_id: plan.id, name: listName, status: 'active' })
    .select('*')
    .single();
  assertNoError(listError);

  const items = aggregateGroceryItems(selectedMeals);
  if (items.length) {
    const { error: itemsError } = await client.from('shopping_list_items').insert(
      items.map((item) => ({
        shopping_list_id: list.id,
        ingredient_id: item.ingredient_id,
        display_name: item.display_name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        source: item.source,
        is_checked: item.is_checked,
        is_removed: item.is_removed,
        notes: sourceNotes(item),
      })),
    );
    assertNoError(itemsError);
  }

  return list as ShoppingList;
}

function sourceNotes(item: AggregatedGroceryItem) {
  const sources = item.sources.map((source) => source.mealName).join(', ');
  return [item.notes, sources ? `From: ${sources}` : null].filter(Boolean).join(' | ') || null;
}

export async function fetchLatestShoppingList(householdId: string) {
  const client = requireSupabase();
  const { data: list, error: listError } = await client
    .from('shopping_lists')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  assertNoError(listError);

  if (!list) {
    return { list: null, items: [] };
  }

  const { data: items, error: itemsError } = await client
    .from('shopping_list_items')
    .select('*')
    .eq('shopping_list_id', list.id)
    .order('display_name', { ascending: true });
  assertNoError(itemsError);
  return { list: list as ShoppingList, items: (items ?? []) as ShoppingListItem[] };
}

export async function updateShoppingListItem(id: string, patch: Partial<ShoppingListItem>) {
  const { error } = await requireSupabase().from('shopping_list_items').update(patch).eq('id', id);
  assertNoError(error);
}

export async function addManualShoppingListItem(shoppingListId: string, item: Partial<ShoppingListItem>) {
  const { error } = await requireSupabase().from('shopping_list_items').insert({
    shopping_list_id: shoppingListId,
    ingredient_id: null,
    display_name: item.display_name,
    quantity: item.quantity ?? null,
    unit: null,
    category: item.category || null,
    source: 'manual',
    is_checked: false,
    is_removed: false,
    notes: item.notes || null,
  });
  assertNoError(error);
}

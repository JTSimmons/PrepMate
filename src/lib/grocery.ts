import type { AggregatedGroceryItem, SelectedMeal } from './types';

export function normalizeIngredientName(name: string) {
  return name.trim().toLocaleLowerCase();
}

function scaledQuantity(quantity: number | null) {
  if (quantity === null) {
    return null;
  }

  return quantity;
}

export function aggregateGroceryItems(selectedMeals: SelectedMeal[]): AggregatedGroceryItem[] {
  const items = new Map<string, AggregatedGroceryItem>();

  for (const selected of selectedMeals) {
    const mealIngredients = selected.meal.meal_ingredients ?? [];
    for (const row of mealIngredients) {
      if (!row.ingredients) {
        continue;
      }

      const normalizedName = row.ingredients.normalized_name || normalizeIngredientName(row.ingredients.name);
      const key = normalizedName;
      const quantity = scaledQuantity(row.quantity);
      const existing = items.get(key);

      if (existing) {
        existing.quantity = existing.quantity === null || quantity === null ? null : existing.quantity + quantity;
        existing.sources.push({ mealId: selected.meal.id, mealName: selected.meal.name, quantity });
        continue;
      }

      items.set(key, {
        ingredient_id: row.ingredient_id,
        display_name: row.ingredients.name.trim(),
        normalized_name: normalizedName,
        quantity,
        unit: null,
        category: null,
        notes: null,
        source: 'meal',
        is_checked: false,
        is_removed: false,
        sources: [{ mealId: selected.meal.id, mealName: selected.meal.name, quantity }],
      });
    }
  }

  return [...items.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
}

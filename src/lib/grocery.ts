import type { AggregatedGroceryItem, SelectedMeal } from './types';

export function normalizeIngredientName(name: string) {
  return name.trim().toLocaleLowerCase();
}

export function aggregateGroceryItems(selectedMeals: SelectedMeal[]): AggregatedGroceryItem[] {
  const items = new Map<string, AggregatedGroceryItem>();

  for (const selected of selectedMeals) {
    const mealIngredients = selected.meal.meal_ingredients ?? [];
    for (const row of mealIngredients) {
      if (row.is_optional || !row.ingredients) {
        continue;
      }

      const normalizedName = row.ingredients.normalized_name || normalizeIngredientName(row.ingredients.name);
      const key = normalizedName;
      const note = row.preparation_note?.trim() || null;
      const existing = items.get(key);

      if (existing) {
        existing.sources.push({ mealId: selected.meal.id, mealName: selected.meal.name, quantity: null });
        if (note && !existing.notes?.includes(note)) {
          existing.notes = existing.notes ? `${existing.notes}; ${note}` : note;
        }
        continue;
      }

      items.set(key, {
        ingredient_id: row.ingredient_id,
        display_name: row.ingredients.name.trim(),
        normalized_name: normalizedName,
        quantity: null,
        unit: null,
        category: null,
        notes: note,
        source: 'meal',
        is_checked: false,
        is_removed: false,
        sources: [{ mealId: selected.meal.id, mealName: selected.meal.name, quantity: null }],
      });
    }
  }

  return [...items.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
}

import { describe, expect, it } from 'vitest';
import { aggregateGroceryItems } from './grocery';
import type { Meal, MealIngredient, SelectedMeal } from './types';

function ingredient(overrides: Partial<MealIngredient>): MealIngredient {
  return {
    id: crypto.randomUUID(),
    meal_id: 'meal',
    ingredient_id: crypto.randomUUID(),
    quantity: 1,
    unit: 'cup',
    preparation_note: null,
    is_optional: false,
    ingredients: {
      id: crypto.randomUUID(),
      name: 'Rice',
      normalized_name: 'rice',
      default_unit: 'cup',
      grocery_category: null,
    },
    ...overrides,
  };
}

function selectedMeal(name: string, rows: MealIngredient[], overrides: Partial<SelectedMeal> = {}): SelectedMeal {
  const meal: Meal = {
    id: crypto.randomUUID(),
    household_id: 'household',
    name,
    description: null,
    recipe_url: null,
    notes: null,
    default_servings: 4,
    created_by: 'user',
    created_at: '',
    updated_at: '',
    meal_ingredients: rows,
  };
  return { meal, servings: 4, ...overrides };
}

describe('aggregateGroceryItems', () => {
  it('combines ingredients with matching normalized names', () => {
    const items = aggregateGroceryItems([
      selectedMeal('Burritos', [ingredient({ quantity: 1, unit: 'can', ingredients: { id: 'a', name: 'Black Beans', normalized_name: 'black beans', default_unit: 'can', grocery_category: null } })]),
      selectedMeal('Soup', [ingredient({ quantity: 2, unit: 'CAN', ingredients: { id: 'b', name: ' black beans ', normalized_name: 'black beans', default_unit: 'can', grocery_category: null } })]),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ display_name: 'Black Beans', quantity: 3, unit: null, category: null });
    expect(items[0].sources.map((source) => source.mealName)).toEqual(['Burritos', 'Soup']);
  });

  it('combines matching ingredients regardless of stored units', () => {
    const items = aggregateGroceryItems([
      selectedMeal('Pasta', [ingredient({ quantity: 1, unit: 'lb' })]),
      selectedMeal('Soup', [ingredient({ quantity: 1, unit: 'cup' })]),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ display_name: 'Rice', quantity: 2, unit: null });
  });

  it('uses each selected meal once', () => {
    const items = aggregateGroceryItems([
      selectedMeal('Tacos', [ingredient({ quantity: 2, unit: 'tbsp' })]),
    ]);

    expect(items[0].quantity).toBe(2);
    expect(items[0].sources[0]).toMatchObject({ mealName: 'Tacos', quantity: 2 });
  });

  it('skips optional ingredients and preserves null quantities', () => {
    const items = aggregateGroceryItems([
      selectedMeal('Salad', [
        ingredient({ quantity: 2, unit: 'oz', is_optional: true }),
        ingredient({ quantity: null, unit: 'to taste', ingredients: { id: 'salt', name: 'Salt', normalized_name: 'salt', default_unit: null, grocery_category: null } }),
      ]),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ display_name: 'Salt', quantity: null, unit: null });
  });
});

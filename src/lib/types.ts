export type Household = {
  id: string;
  name: string;
  created_at: string;
};

export type IngredientRowInput = {
  id?: string;
  ingredient_id?: string;
  name: string;
  quantity: number | null;
  unit: string;
  preparation_note: string;
  is_optional: boolean;
  grocery_category: string;
};

export type Meal = {
  id: string;
  household_id: string;
  name: string;
  description: string | null;
  recipe_url: string | null;
  notes: string | null;
  default_servings: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  meal_ingredients?: MealIngredient[];
};

export type MealIngredient = {
  id: string;
  meal_id: string;
  ingredient_id: string;
  quantity: number | null;
  unit: string | null;
  preparation_note: string | null;
  is_optional: boolean;
  ingredients: {
    id: string;
    name: string;
    normalized_name: string;
    default_unit: string | null;
    grocery_category: string | null;
  } | null;
};

export type MealFormValues = {
  name: string;
  description: string;
  recipe_url: string;
  notes: string;
  default_servings: number;
  ingredients: IngredientRowInput[];
};

export type SelectedMeal = {
  meal: Meal;
  quantity: number;
  servings: number | null;
};

export type GrocerySource = {
  mealId: string;
  mealName: string;
  quantity: number | null;
};

export type AggregatedGroceryItem = {
  ingredient_id: string | null;
  display_name: string;
  normalized_name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  notes: string | null;
  source: 'meal' | 'manual';
  is_checked: boolean;
  is_removed: boolean;
  sources: GrocerySource[];
};

export type ShoppingList = {
  id: string;
  household_id: string;
  meal_plan_id: string | null;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ShoppingListItem = {
  id: string;
  shopping_list_id: string;
  ingredient_id: string | null;
  display_name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  source: 'meal' | 'manual';
  is_checked: boolean;
  is_removed: boolean;
  notes: string | null;
};

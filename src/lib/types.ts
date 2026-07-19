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
  preparation_note: string;
  is_optional: boolean;
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
  recipe_url: string;
  notes: string;
  ingredients: IngredientRowInput[];
};

export type SelectedMeal = {
  meal: Meal;
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

export type KrogerMatchStatus = 'pending' | 'approved' | 'skipped' | 'added' | 'failed';

export type ShoppingListKrogerMatch = {
  id: string;
  shopping_list_item_id: string;
  kroger_product_upc: string | null;
  product_name: string | null;
  brand: string | null;
  size: string | null;
  image_url: string | null;
  price: number | null;
  regular_price: number | null;
  promo_price: number | null;
  is_on_sale: boolean;
  package_quantity: number;
  allow_substitutes: boolean;
  special_instructions: string | null;
  status: KrogerMatchStatus;
  last_error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type KrogerProduct = {
  upc: string;
  description: string;
  brand: string | null;
  size: string | null;
  imageUrl: string | null;
  price: number | null;
  regularPrice: number | null;
  promoPrice: number | null;
  isOnSale: boolean;
};

export type KrogerLocation = {
  locationId: string;
  name: string;
  address: string;
};

export type KrogerPreviewItem = ShoppingListItem & {
  shopping_list_kroger_matches?: ShoppingListKrogerMatch[];
};

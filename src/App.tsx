import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import {
  addManualShoppingListItem,
  createShoppingListSnapshot,
  deleteMeal,
  fetchLatestShoppingList,
  fetchMeals,
  getOrCreateHousehold,
  saveMeal,
  updateShoppingListItem,
} from './lib/database';
import { aggregateGroceryItems } from './lib/grocery';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type { Household, IngredientRowInput, Meal, MealFormValues, SelectedMeal, ShoppingList, ShoppingListItem } from './lib/types';

const emptyIngredient = (): IngredientRowInput => ({
  name: '',
  quantity: null,
  unit: '',
  preparation_note: '',
  is_optional: false,
  grocery_category: '',
});

const emptyMealForm: MealFormValues = {
  name: '',
  description: '',
  recipe_url: '',
  notes: '',
  default_servings: 4,
  ingredients: [emptyIngredient()],
};

function mealToForm(meal: Meal): MealFormValues {
  return {
    name: meal.name,
    description: meal.description ?? '',
    recipe_url: meal.recipe_url ?? '',
    notes: meal.notes ?? '',
    default_servings: meal.default_servings,
    ingredients:
      meal.meal_ingredients?.map((row) => ({
        id: row.id,
        ingredient_id: row.ingredient_id,
        name: row.ingredients?.name ?? '',
        quantity: row.quantity,
        unit: row.unit ?? row.ingredients?.default_unit ?? '',
        preparation_note: row.preparation_note ?? '',
        is_optional: row.is_optional,
        grocery_category: row.ingredients?.grocery_category ?? '',
      })) ?? [emptyIngredient()],
  };
}

function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

function AuthPage() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    if (!email || !password) {
      setMessage('Email and password are required.');
      return;
    }

    setLoading(true);
    const result =
      mode === 'sign-in'
        ? await supabase!.auth.signInWithPassword({ email, password })
        : await supabase!.auth.signUp({ email, password });
    setLoading(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    if (mode === 'sign-up') {
      setMessage('Check your email if confirmation is enabled, then sign in.');
    }
  }

  return (
    <main className="auth-panel">
      <section>
        <h1>PrepMate</h1>
        <p>Plan meals, combine ingredients, and shop from an editable grocery list.</p>
      </section>
      <form onSubmit={submit} className="card form-stack">
        <div className="segmented" role="tablist" aria-label="Authentication mode">
          <button type="button" className={mode === 'sign-in' ? 'active' : ''} onClick={() => setMode('sign-in')}>
            Sign in
          </button>
          <button type="button" className={mode === 'sign-up' ? 'active' : ''} onClick={() => setMode('sign-up')}>
            Sign up
          </button>
        </div>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} />
        </label>
        {message && <p className="message">{message}</p>}
        <button className="primary" disabled={loading}>
          {loading ? 'Working...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </main>
  );
}

function ConfigMissing() {
  return (
    <main className="auth-panel">
      <section className="card">
        <h1>PrepMate</h1>
        <p className="message">Supabase is not configured. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env.local`.</p>
      </section>
    </main>
  );
}

function AppShell() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refreshMeals(activeHousehold = household) {
    if (!activeHousehold) {
      return;
    }
    setMeals(await fetchMeals(activeHousehold.id));
  }

  useEffect(() => {
    getOrCreateHousehold()
      .then(async (createdHousehold) => {
        setHousehold(createdHousehold);
        setMeals(await fetchMeals(createdHousehold.id));
      })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <main className="center-state">Loading PrepMate...</main>;
  }

  if (error || !household) {
    return <main className="center-state error">Could not load your household. {error}</main>;
  }

  return (
    <div className="app-shell">
      <header>
        <div>
          <h1>PrepMate</h1>
          <p>{household.name}</p>
        </div>
        <button type="button" onClick={() => supabase?.auth.signOut()}>
          Sign out
        </button>
      </header>
      <nav>
        <NavLink to="/meals">Meals</NavLink>
        <NavLink to="/plan">Plan</NavLink>
        <NavLink to="/grocery-list">Grocery List</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/meals" replace />} />
        <Route path="/meals" element={<MealsPage householdId={household.id} meals={meals} refreshMeals={refreshMeals} />} />
        <Route path="/plan" element={<PlanPage householdId={household.id} meals={meals} />} />
        <Route path="/grocery-list" element={<GroceryPage householdId={household.id} />} />
      </Routes>
    </div>
  );
}

function MealsPage({ householdId, meals, refreshMeals }: { householdId: string; meals: Meal[]; refreshMeals: () => Promise<void> }) {
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  async function removeMeal(meal: Meal) {
    if (!window.confirm(`Delete ${meal.name}?`)) {
      return;
    }
    setError('');
    try {
      await deleteMeal(meal.id);
      await refreshMeals();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h2>Meals</h2>
          <p>Save reusable meals with ingredients and recipe links.</p>
        </div>
        <button type="button" className="primary" onClick={() => setIsCreating(true)}>
          New meal
        </button>
      </div>
      {error && <p className="message error">{error}</p>}
      {(isCreating || editingMeal) && (
        <MealForm
          key={editingMeal?.id ?? 'new'}
          initialValues={editingMeal ? mealToForm(editingMeal) : emptyMealForm}
          onCancel={() => {
            setEditingMeal(null);
            setIsCreating(false);
          }}
          onSave={async (values) => {
            await saveMeal(householdId, values, editingMeal?.id);
            setEditingMeal(null);
            setIsCreating(false);
            await refreshMeals();
          }}
        />
      )}
      {meals.length === 0 ? (
        <section className="empty-state">No meals yet. Create your first meal to start a grocery plan.</section>
      ) : (
        <div className="meal-grid">
          {meals.map((meal) => (
            <article className="card meal-card" key={meal.id}>
              <div>
                <h3>{meal.name}</h3>
                <p>{meal.description || 'No description'}</p>
              </div>
              <p>{meal.meal_ingredients?.length ?? 0} ingredients · {meal.default_servings} servings</p>
              {meal.recipe_url && (
                <a href={meal.recipe_url} target="_blank" rel="noreferrer noopener">
                  Open recipe
                </a>
              )}
              <div className="row-actions">
                <button type="button" onClick={() => setEditingMeal(meal)}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => removeMeal(meal)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

export function MealForm({
  initialValues,
  onSave,
  onCancel,
}: {
  initialValues: MealFormValues;
  onSave: (values: MealFormValues) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<MealFormValues>(initialValues);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function updateIngredient(index: number, patch: Partial<IngredientRowInput>) {
    setValues((current) => ({
      ...current,
      ingredients: current.ingredients.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const validIngredients = values.ingredients.filter((row) => row.name.trim());
    if (!values.name.trim()) {
      setError('Meal name is required.');
      return;
    }
    if (values.default_servings <= 0) {
      setError('Default servings must be greater than zero.');
      return;
    }
    if (validIngredients.length === 0) {
      setError('Add at least one ingredient.');
      return;
    }

    setSaving(true);
    try {
      await onSave({ ...values, ingredients: validIngredients });
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card form-stack" onSubmit={submit} aria-label="Meal form">
      <div className="form-grid">
        <label>
          Meal name
          <input value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} />
        </label>
        <label>
          Default servings
          <input
            type="number"
            min="1"
            value={values.default_servings}
            onChange={(event) => setValues({ ...values, default_servings: Number(event.target.value) })}
          />
        </label>
      </div>
      <label>
        Description
        <input value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} />
      </label>
      <label>
        Recipe URL
        <input type="url" value={values.recipe_url} onChange={(event) => setValues({ ...values, recipe_url: event.target.value })} />
      </label>
      <label>
        Notes
        <textarea value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} />
      </label>
      <h3>Ingredients</h3>
      {values.ingredients.map((ingredient, index) => (
        <div className="ingredient-row" key={ingredient.id ?? index}>
          <input aria-label="Ingredient name" placeholder="Ingredient" value={ingredient.name} onChange={(event) => updateIngredient(index, { name: event.target.value })} />
          <input
            aria-label="Quantity"
            placeholder="Qty"
            type="number"
            step="0.01"
            value={ingredient.quantity ?? ''}
            onChange={(event) => updateIngredient(index, { quantity: event.target.value ? Number(event.target.value) : null })}
          />
          <input aria-label="Unit" placeholder="Unit" value={ingredient.unit} onChange={(event) => updateIngredient(index, { unit: event.target.value })} />
          <input
            aria-label="Category"
            placeholder="Category"
            value={ingredient.grocery_category}
            onChange={(event) => updateIngredient(index, { grocery_category: event.target.value })}
          />
          <input
            aria-label="Preparation note"
            placeholder="Prep note"
            value={ingredient.preparation_note}
            onChange={(event) => updateIngredient(index, { preparation_note: event.target.value })}
          />
          <label className="check-label">
            <input type="checkbox" checked={ingredient.is_optional} onChange={(event) => updateIngredient(index, { is_optional: event.target.checked })} />
            Optional
          </label>
          <button type="button" onClick={() => setValues({ ...values, ingredients: values.ingredients.filter((_, rowIndex) => rowIndex !== index) })}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setValues({ ...values, ingredients: [...values.ingredients, emptyIngredient()] })}>
        Add ingredient
      </button>
      {error && <p className="message error">{error}</p>}
      <div className="row-actions">
        <button className="primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save meal'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PlanPage({ householdId, meals }: { householdId: string; meals: Meal[] }) {
  const [selected, setSelected] = useState<Record<string, { quantity: number; servings: number | null }>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedMeals: SelectedMeal[] = useMemo(
    () =>
      meals
        .filter((meal) => selected[meal.id])
        .map((meal) => ({
          meal,
          quantity: selected[meal.id].quantity,
          servings: selected[meal.id].servings,
        })),
    [meals, selected],
  );
  const preview = useMemo(() => aggregateGroceryItems(selectedMeals), [selectedMeals]);

  async function generate() {
    setMessage('');
    if (selectedMeals.length === 0) {
      setMessage('Select at least one meal.');
      return;
    }
    setSaving(true);
    try {
      await createShoppingListSnapshot(householdId, selectedMeals);
      setMessage('Saved a new grocery-list snapshot.');
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h2>Plan</h2>
          <p>Select meals and generate an editable shopping snapshot.</p>
        </div>
        <button type="button" className="primary" onClick={generate} disabled={saving}>
          {saving ? 'Generating...' : 'Generate list'}
        </button>
      </div>
      {message && <p className="message">{message}</p>}
      {meals.length === 0 ? (
        <section className="empty-state">Create meals before planning a grocery list.</section>
      ) : (
        <div className="plan-layout">
          <section className="card form-stack">
            {meals.map((meal) => {
              const isSelected = Boolean(selected[meal.id]);
              return (
                <div className="planner-row" key={meal.id}>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(event) =>
                        setSelected((current) => {
                          const copy = { ...current };
                          if (event.target.checked) {
                            copy[meal.id] = { quantity: 1, servings: meal.default_servings };
                          } else {
                            delete copy[meal.id];
                          }
                          return copy;
                        })
                      }
                    />
                    {meal.name}
                  </label>
                  {isSelected && (
                    <div className="planner-controls">
                      <label>
                        Count
                        <input
                          type="number"
                          min="1"
                          value={selected[meal.id].quantity}
                          onChange={(event) => setSelected({ ...selected, [meal.id]: { ...selected[meal.id], quantity: Number(event.target.value) } })}
                        />
                      </label>
                      <label>
                        Servings
                        <input
                          type="number"
                          min="1"
                          value={selected[meal.id].servings ?? ''}
                          onChange={(event) =>
                            setSelected({ ...selected, [meal.id]: { ...selected[meal.id], servings: event.target.value ? Number(event.target.value) : null } })
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
          <section className="card">
            <h3>Preview</h3>
            {preview.length === 0 ? (
              <p>No selected ingredients yet.</p>
            ) : (
              <ul className="list">
                {preview.map((item) => (
                  <li key={`${item.normalized_name}-${item.unit}`}>
                    <span>{item.display_name}</span>
                    <span>{item.quantity ?? ''} {item.unit ?? ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function GroceryPage({ householdId }: { householdId: string }) {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState({ display_name: '', quantity: '', unit: '', category: '', notes: '' });

  const refresh = useCallback(async () => {
    const result = await fetchLatestShoppingList(householdId);
    setList(result.list);
    setItems(result.items);
  }, [householdId]);

  useEffect(() => {
    async function loadList() {
      await refresh();
    }

    loadList()
      .catch((caught: Error) => setMessage(caught.message))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function patchItem(id: string, patch: Partial<ShoppingListItem>) {
    await updateShoppingListItem(id, patch);
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function addManual(event: React.FormEvent) {
    event.preventDefault();
    if (!list) {
      return;
    }
    if (!manual.display_name.trim()) {
      setMessage('Manual item name is required.');
      return;
    }
    await addManualShoppingListItem(list.id, {
      display_name: manual.display_name.trim(),
      quantity: manual.quantity ? Number(manual.quantity) : null,
      unit: manual.unit.trim(),
      category: manual.category.trim(),
      notes: manual.notes.trim(),
    });
    setManual({ display_name: '', quantity: '', unit: '', category: '', notes: '' });
    await refresh();
  }

  const visibleItems = items.filter((item) => !item.is_removed);
  const grouped = visibleItems.reduce<Map<string, ShoppingListItem[]>>((groups, item) => {
    const category = item.category || 'Other';
    groups.set(category, [...(groups.get(category) ?? []), item]);
    return groups;
  }, new Map());

  if (loading) {
    return <main className="center-state">Loading grocery list...</main>;
  }

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h2>Grocery List</h2>
          <p>{list ? list.name : 'No list generated yet'}</p>
        </div>
      </div>
      {message && <p className="message">{message}</p>}
      {!list ? (
        <section className="empty-state">Generate a grocery list from the Plan tab.</section>
      ) : (
        <>
          <form className="card manual-form" onSubmit={addManual}>
            <input placeholder="Add item" value={manual.display_name} onChange={(event) => setManual({ ...manual, display_name: event.target.value })} />
            <input placeholder="Qty" type="number" step="0.01" value={manual.quantity} onChange={(event) => setManual({ ...manual, quantity: event.target.value })} />
            <input placeholder="Unit" value={manual.unit} onChange={(event) => setManual({ ...manual, unit: event.target.value })} />
            <input placeholder="Category" value={manual.category} onChange={(event) => setManual({ ...manual, category: event.target.value })} />
            <input placeholder="Notes" value={manual.notes} onChange={(event) => setManual({ ...manual, notes: event.target.value })} />
            <button className="primary">Add</button>
          </form>
          {visibleItems.length === 0 ? (
            <section className="empty-state">All items are removed. Add manual items if needed.</section>
          ) : (
            [...grouped.entries()].map(([category, categoryItems]) => (
              <section className="card" key={category}>
                <h3>{category}</h3>
                <div className="shopping-items">
                  {categoryItems.map((item) => (
                    <div className={`shopping-item ${item.is_checked ? 'checked' : ''}`} key={item.id}>
                      <input aria-label={`Check ${item.display_name}`} type="checkbox" checked={item.is_checked} onChange={(event) => patchItem(item.id, { is_checked: event.target.checked })} />
                      <input aria-label="Item name" value={item.display_name} onChange={(event) => patchItem(item.id, { display_name: event.target.value })} />
                      <input aria-label="Item quantity" type="number" step="0.01" value={item.quantity ?? ''} onChange={(event) => patchItem(item.id, { quantity: event.target.value ? Number(event.target.value) : null })} />
                      <input aria-label="Item unit" value={item.unit ?? ''} onChange={(event) => patchItem(item.id, { unit: event.target.value })} />
                      <input aria-label="Item notes" value={item.notes ?? ''} onChange={(event) => patchItem(item.id, { notes: event.target.value })} />
                      <button type="button" className="danger" onClick={() => patchItem(item.id, { is_removed: true })}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </>
      )}
    </main>
  );
}

export default function App() {
  const { session, loading } = useSession();

  if (!isSupabaseConfigured) {
    return <ConfigMissing />;
  }
  if (loading) {
    return <main className="center-state">Restoring session...</main>;
  }
  return session ? <AppShell /> : <AuthPage />;
}

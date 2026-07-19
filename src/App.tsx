import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import {
  addManualShoppingListItem,
  createShoppingListSnapshot,
  deleteMeal,
  fetchLatestShoppingList,
  fetchMeals,
  getOrCreateHousehold,
  saveMeal,
} from './lib/database';
import { aggregateGroceryItems } from './lib/grocery';
import {
  fetchKrogerPreview,
  saveKrogerMatch,
  searchKrogerProducts,
  startKrogerAuth,
  submitKrogerCart,
  updateKrogerMatch,
} from './lib/kroger';
import { activeKrogerMatch, cartSearchTerm, isApprovedForKroger, isKrogerReviewComplete, krogerStatusLabel } from './lib/krogerCart';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type {
  Household,
  IngredientRowInput,
  KrogerPreviewItem,
  KrogerProduct,
  Meal,
  MealFormValues,
  SelectedMeal,
  ShoppingList,
} from './lib/types';

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
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(initialGroceryMessage);

  const refresh = useCallback(async () => {
    const result = await fetchLatestShoppingList(householdId);
    setList(result.list);
  }, [householdId]);

  useEffect(() => {
    async function loadList() {
      await refresh();
    }

    loadList()
      .catch((caught: Error) => setMessage(caught.message))
      .finally(() => setLoading(false));
  }, [refresh]);

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
        <KrogerCartPanel shoppingListId={list.id} />
      )}
    </main>
  );
}

function initialGroceryMessage() {
  const params = new URLSearchParams(window.location.search);
  const krogerStatus = params.get('kroger');
  if (krogerStatus === 'connected') {
    return 'Kroger is connected. Refresh the Kroger cart review if needed.';
  }
  if (krogerStatus === 'error') {
    return params.get('kroger_message') ?? 'Kroger authorization failed.';
  }
  return '';
}

function KrogerCartPanel({ shoppingListId }: { shoppingListId: string }) {
  return <KrogerCartPanelReview shoppingListId={shoppingListId} />;
}

function KrogerCartPanelReview({ shoppingListId }: { shoppingListId: string }) {
  const [expanded, setExpanded] = useState(true);
  const [connected, setConnected] = useState(false);
  const [includeChecked, setIncludeChecked] = useState(true);
  const [items, setItems] = useState<KrogerPreviewItem[]>([]);
  const [locationId, setLocationId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState({ display_name: '', quantity: '', unit: '', notes: '' });
  const [searchingItemId, setSearchingItemId] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [productsByItem, setProductsByItem] = useState<Record<string, KrogerProduct[]>>({});

  const approvedCount = items.filter((item) => isApprovedForKroger(activeKrogerMatch(item))).length;
  const pendingItems = items.filter((item) => !isKrogerReviewComplete(activeKrogerMatch(item)));
  const activeItem = pendingItems[0] ?? null;

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const preview = await fetchKrogerPreview(shoppingListId, includeChecked);
      setConnected(preview.connected);
      setItems(preview.items);
      setLocationId(preview.preferredLocationId ?? '');
      setExpandedItemId((current) => current ?? preview.items.find((item) => !isKrogerReviewComplete(activeKrogerMatch(item)))?.id ?? preview.items[0]?.id ?? null);
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [includeChecked, shoppingListId]);

  useEffect(() => {
    if (!expanded) {
      return;
    }
    void loadPreview();
  }, [expanded, loadPreview]);

  async function connectKroger() {
    setMessage('');
    try {
      const authorizationUrl = await startKrogerAuth();
      window.location.assign(authorizationUrl);
    } catch (caught) {
      setMessage((caught as Error).message);
    }
  }

  async function searchItem(item: KrogerPreviewItem) {
    setSearchingItemId(item.id);
    setMessage('');
    try {
      const result = await searchKrogerProducts(cartSearchTerm(item), locationId || null);
      setConnected(result.connected);
      setProductsByItem((current) => ({ ...current, [item.id]: result.products }));
      if (result.products.length === 0) {
        setMessage(`No Kroger products found for ${item.display_name}.`);
      }
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setSearchingItemId(null);
    }
  }

  async function chooseProduct(item: KrogerPreviewItem, product: KrogerProduct) {
    const match = await saveKrogerMatch(item.id, product, {
      package_quantity: activeKrogerMatch(item)?.package_quantity ?? 1,
      allow_substitutes: activeKrogerMatch(item)?.allow_substitutes ?? true,
    });
    setItems((current) => current.map((currentItem) => (currentItem.id === item.id ? { ...currentItem, shopping_list_kroger_matches: [match] } : currentItem)));
    advanceExpandedItem(item.id);
  }

  async function patchMatch(item: KrogerPreviewItem, patch: Parameters<typeof updateKrogerMatch>[1]) {
    const match = activeKrogerMatch(item);
    if (!match) {
      return;
    }
    const saved = await updateKrogerMatch(match.id, patch);
    setItems((current) => current.map((currentItem) => (currentItem.id === item.id ? { ...currentItem, shopping_list_kroger_matches: [saved] } : currentItem)));
  }

  async function skipItem(item: KrogerPreviewItem) {
    const match = await saveKrogerMatch(item.id, null, { status: 'skipped', package_quantity: 1, allow_substitutes: true });
    setItems((current) => current.map((currentItem) => (currentItem.id === item.id ? { ...currentItem, shopping_list_kroger_matches: [match] } : currentItem)));
    setProductsByItem((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    advanceExpandedItem(item.id);
  }

  function advanceExpandedItem(completedItemId: string) {
    const nextItem = items.find((candidate) => candidate.id !== completedItemId && !isKrogerReviewComplete(activeKrogerMatch(candidate)));
    setExpandedItemId(nextItem?.id ?? null);
  }

  function toggleExpandedItem(itemId: string) {
    setExpandedItemId((current) => (current === itemId ? null : itemId));
  }

  function shouldIgnoreCardToggle(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest('button, input, textarea, select, label, a'));
  }

  function handleReviewItemClick(event: MouseEvent<HTMLElement>, itemId: string) {
    if (shouldIgnoreCardToggle(event.target)) {
      return;
    }
    toggleExpandedItem(itemId);
  }

  async function submitApproved() {
    setLoading(true);
    setMessage('');
    try {
      const result = await submitKrogerCart(shoppingListId, includeChecked);
      setMessage(`Added ${result.added} approved item${result.added === 1 ? '' : 's'} to Kroger.`);
      await loadPreview();
    } catch (caught) {
      setMessage((caught as Error).message);
      await loadPreview();
    } finally {
      setLoading(false);
    }
  }

  async function addManual(event: React.FormEvent) {
    event.preventDefault();
    if (!manual.display_name.trim()) {
      setMessage('Item name is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      await addManualShoppingListItem(shoppingListId, {
        display_name: manual.display_name.trim(),
        quantity: manual.quantity ? Number(manual.quantity) : null,
        unit: manual.unit.trim(),
        notes: manual.notes.trim(),
      });
      setManual({ display_name: '', quantity: '', unit: '', notes: '' });
      await loadPreview();
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card kroger-panel">
      <div className="panel-heading">
        <div>
          <h3>Kroger cart</h3>
          <p>Review product matches before adding this saved grocery list to Kroger.</p>
        </div>
        <button type="button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? 'Hide' : 'Review'}
        </button>
      </div>
      {expanded && (
        <div className="form-stack">
          <div className="row-actions">
            <button type="button" onClick={connectKroger}>
              {connected ? 'Reconnect Kroger' : 'Connect Kroger'}
            </button>
            <button type="button" onClick={loadPreview} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh review'}
            </button>
            <button type="button" className="primary" onClick={submitApproved} disabled={!connected || approvedCount === 0 || loading}>
              Add approved ({approvedCount})
            </button>
          </div>
          <label className="check-label">
            <input type="checkbox" checked={includeChecked} onChange={(event) => setIncludeChecked(event.target.checked)} />
            Include checked grocery items
          </label>
          <label>
            Kroger location ID
            <input value={locationId} onChange={(event) => setLocationId(event.target.value)} placeholder="Optional, improves product availability and prices" />
          </label>
          {message && <p className="message">{message}</p>}
          {!connected && <p className="message">Connect Kroger before searching products or adding items to cart.</p>}
          {items.length === 0 ? (
            <section className="empty-state">No eligible grocery items to send to Kroger.</section>
          ) : (
            <div className="kroger-review-list">
              {items.map((item) => {
                const match = activeKrogerMatch(item);
                const products = productsByItem[item.id] ?? [];
                const isExpanded = expandedItemId === item.id;
                const isActive = activeItem?.id === item.id;
                const isAdded = match?.status === 'added';
                return (
                  <article
                    className={`kroger-review-item ${isActive ? 'active-review-item' : ''}`}
                    key={item.id}
                    onClick={(event) => handleReviewItemClick(event, item.id)}
                  >
                    <div className="kroger-item-summary">
                      <button type="button" className="summary-toggle" onClick={() => toggleExpandedItem(item.id)}>
                        <span>
                          <strong>{item.display_name}</strong>
                          <small>{[item.quantity, item.unit].filter(Boolean).join(' ')} {item.notes ? `- ${item.notes}` : ''}</small>
                        </span>
                        <span className={`status-pill status-${match?.status ?? 'pending'}`}>{krogerStatusLabel(match)}</span>
                      </button>
                      {isActive && <p>{pendingItems.length} item{pendingItems.length === 1 ? '' : 's'} left to review</p>}
                      {match?.last_error && <p className="message error">{match.last_error}</p>}
                    </div>
                    {match?.product_name && (
                      <div className="selected-product">
                        {match.image_url && <img src={match.image_url} alt="" />}
                        <div>
                          <strong>{match.product_name}</strong>
                          <p>{[match.brand, match.size, match.price ? `$${match.price.toFixed(2)}` : null].filter(Boolean).join(' · ')}</p>
                        </div>
                      </div>
                    )}
                    {isExpanded && !isAdded && (
                      <>
                    <div className="kroger-controls">
                      <button type="button" onClick={() => searchItem(item)} disabled={!connected || searchingItemId === item.id}>
                        {searchingItemId === item.id ? 'Searching...' : match?.product_name ? 'Search different product' : 'Search Kroger'}
                      </button>
                      <button type="button" onClick={() => skipItem(item)}>
                        Skip
                      </button>
                      {match && (
                        <>
                          <label>
                            Packages
                            <input
                              type="number"
                              min="1"
                              value={match.package_quantity}
                              onChange={(event) => patchMatch(item, { package_quantity: Number(event.target.value) })}
                            />
                          </label>
                          <label className="check-label">
                            <input
                              type="checkbox"
                              checked={match.allow_substitutes}
                              onChange={(event) => patchMatch(item, { allow_substitutes: event.target.checked })}
                            />
                            Allow substitutes
                          </label>
                          <label className="wide-field">
                            Instructions
                            <input
                              value={match.special_instructions ?? ''}
                              onChange={(event) => patchMatch(item, { special_instructions: event.target.value })}
                              placeholder="Optional cart note"
                            />
                          </label>
                        </>
                      )}
                    </div>
                    {products.length > 0 && (
                      <div className="product-results">
                        {products.map((product) => (
                          <button
                            type="button"
                            className={`product-choice ${match?.kroger_product_upc === product.upc ? 'selected-product-choice' : ''}`}
                            key={product.upc}
                            onClick={() => chooseProduct(item, product)}
                          >
                            {product.imageUrl && <img src={product.imageUrl} alt="" />}
                            <span>
                              <strong>{product.description}</strong>
                              <small>{[product.brand, product.size, product.price ? `$${product.price.toFixed(2)}` : null].filter(Boolean).join(' · ')}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                      </>
                    )}
                    {isExpanded && isAdded && (
                      <p className="message">This item has already been added to Kroger. Generate a new grocery-list snapshot to send changes.</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          <form className="manual-form add-cart-item-form" onSubmit={addManual}>
            <input placeholder="Add item" value={manual.display_name} onChange={(event) => setManual({ ...manual, display_name: event.target.value })} />
            <input placeholder="Qty" type="number" step="0.01" value={manual.quantity} onChange={(event) => setManual({ ...manual, quantity: event.target.value })} />
            <input placeholder="Unit" value={manual.unit} onChange={(event) => setManual({ ...manual, unit: event.target.value })} />
            <input placeholder="Notes" value={manual.notes} onChange={(event) => setManual({ ...manual, notes: event.target.value })} />
            <button className="primary" disabled={loading}>{loading ? 'Adding...' : 'Add item'}</button>
          </form>
        </div>
      )}
    </section>
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

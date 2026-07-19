import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
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
  searchKrogerLocations,
  searchKrogerProducts,
  selectKrogerLocation,
  startKrogerAuth,
  submitKrogerCart,
  updateKrogerMatch,
} from './lib/kroger';
import { activeKrogerMatch, cartSearchTerm, isApprovedForKroger, isKrogerReviewComplete, krogerStatusLabel } from './lib/krogerCart';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type {
  Household,
  KrogerLocation,
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
  preparation_note: '',
  is_optional: false,
});

const emptyMealForm: MealFormValues = {
  name: '',
  recipe_url: '',
  notes: '',
  ingredients: [emptyIngredient()],
};

function mealToForm(meal: Meal): MealFormValues {
  return {
    name: meal.name,
    recipe_url: meal.recipe_url ?? '',
    notes: meal.notes ?? '',
    ingredients:
      meal.meal_ingredients?.map((row) => ({
        id: row.id,
        ingredient_id: row.ingredient_id,
        name: row.ingredients?.name ?? '',
        quantity: row.quantity,
        preparation_note: row.preparation_note ?? '',
        is_optional: row.is_optional,
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
              </div>
              <p>{meal.meal_ingredients?.length ?? 0} ingredients</p>
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
      </div>
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
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const selectedMeals: SelectedMeal[] = useMemo(
    () =>
      meals
        .filter((meal) => selected[meal.id])
        .map((meal) => ({
          meal,
          servings: null,
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
      navigate('/grocery-list');
    } catch (caught) {
      setMessage((caught as Error).message);
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
                            copy[meal.id] = true;
                          } else {
                            delete copy[meal.id];
                          }
                          return copy;
                        })
                      }
                    />
                    {meal.name}
                  </label>
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
                  <li key={item.normalized_name}>
                    <span>{item.display_name}</span>
                    <span>{item.quantity ?? ''}</span>
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

function formatMoney(value: number | null) {
  return value === null ? null : `$${value.toFixed(2)}`;
}

function krogerProductPrice(product: KrogerProduct) {
  const currentPrice = formatMoney(product.price);
  return {
    currentPrice: currentPrice ?? 'Price unavailable',
    regularPrice: product.isOnSale ? formatMoney(product.regularPrice) : null,
    isOnSale: product.isOnSale,
    isUnavailable: currentPrice === null,
  };
}

function krogerMatchPrice(match: NonNullable<ReturnType<typeof activeKrogerMatch>>) {
  const currentPrice = formatMoney(match.price);
  return {
    currentPrice: currentPrice ?? 'Price unavailable',
    regularPrice: match.is_on_sale ? formatMoney(match.regular_price) : null,
    isOnSale: match.is_on_sale,
    isUnavailable: currentPrice === null,
  };
}

function KrogerCartPanel({ shoppingListId }: { shoppingListId: string }) {
  return <KrogerCartPanelReview shoppingListId={shoppingListId} />;
}

const KROGER_CART_URL = 'https://www.kroger.com/cart';

function KrogerCartPanelReview({ shoppingListId }: { shoppingListId: string }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [items, setItems] = useState<KrogerPreviewItem[]>([]);
  const [locationId, setLocationId] = useState('');
  const [locationName, setLocationName] = useState<string | null>(null);
  const [zipCode, setZipCode] = useState('');
  const [locations, setLocations] = useState<KrogerLocation[]>([]);
  const [searchingLocations, setSearchingLocations] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
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
      const preview = await fetchKrogerPreview(shoppingListId);
      setConnected(preview.connected);
      setItems(preview.items);
      setLocationId(preview.preferredLocationId ?? '');
      setLocationName(preview.preferredLocationName);
      setExpandedItemId((current) => current ?? preview.items.find((item) => !isKrogerReviewComplete(activeKrogerMatch(item)))?.id ?? preview.items[0]?.id ?? null);
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [shoppingListId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

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
      } else if (!locationId) {
        setMessage('Select a Kroger store to see location-specific prices.');
      }
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setSearchingItemId(null);
    }
  }

  function defaultPackageQuantity(quantity: number | null) {
    return Math.max(1, Math.ceil(quantity ?? 1));
  }

  async function chooseProduct(item: KrogerPreviewItem, product: KrogerProduct) {
    const match = await saveKrogerMatch(item.id, product, {
      package_quantity: activeKrogerMatch(item)?.package_quantity ?? defaultPackageQuantity(item.quantity),
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
      const result = await submitKrogerCart(shoppingListId);
      await loadPreview();
      const opened = window.open(KROGER_CART_URL, '_blank');
      if (opened) {
        opened.opener = null;
      }
      setMessage(
        opened
          ? `Added ${result.added} approved item${result.added === 1 ? '' : 's'} to Kroger.`
          : `Added ${result.added} approved item${result.added === 1 ? '' : 's'} to Kroger. Open ${KROGER_CART_URL} to review your cart.`,
      );
    } catch (caught) {
      setMessage((caught as Error).message);
      await loadPreview();
    } finally {
      setLoading(false);
    }
  }

  async function searchStores(event: React.FormEvent) {
    event.preventDefault();
    setSearchingLocations(true);
    setMessage('');
    try {
      const results = await searchKrogerLocations(zipCode);
      setLocations(results);
      if (results.length === 0) {
        setMessage(`No Kroger stores found near ${zipCode}.`);
      }
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setSearchingLocations(false);
    }
  }

  async function chooseLocation(location: KrogerLocation) {
    setLoading(true);
    setMessage('');
    try {
      const selected = await selectKrogerLocation(location);
      setLocationId(selected.preferredLocationId);
      setLocationName(selected.preferredLocationName);
      setLocations([]);
      setProductsByItem({});
      setMessage('Kroger store selected. Search products again to load prices for that store.');
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
      </div>
      <div className="form-stack">
          <div className="row-actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Kroger settings"
              title="Kroger settings"
              onClick={() => setSettingsOpen((current) => !current)}
            >
              Settings
            </button>
          </div>
          {settingsOpen && (
            <div className="kroger-settings">
              <div className="row-actions">
                <button type="button" onClick={connectKroger}>
                  {connected ? 'Reconnect Kroger' : 'Connect Kroger'}
                </button>
                <button type="button" onClick={loadPreview} disabled={loading}>
                  {loading ? 'Refreshing...' : 'Refresh review'}
                </button>
              </div>
              <div className="store-picker">
                <div>
                  <strong>Kroger store</strong>
                  <p>{locationId ? [locationName, locationId].filter(Boolean).join(' - ') : 'Select a store to show Kroger prices.'}</p>
                </div>
                <form className="store-search" onSubmit={searchStores}>
                  <input
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="ZIP code"
                    value={zipCode}
                    onChange={(event) => setZipCode(event.target.value.replace(/\D/g, '').slice(0, 5))}
                  />
                  <button type="submit" disabled={!connected || searchingLocations}>
                    {searchingLocations ? 'Searching...' : 'Find store'}
                  </button>
                </form>
                {locations.length > 0 && (
                  <div className="store-results">
                    {locations.map((location) => (
                      <button type="button" key={location.locationId} onClick={() => chooseLocation(location)}>
                        <strong>{location.name}</strong>
                        <small>{location.address || location.locationId}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
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
                const selectedPrice = match ? krogerMatchPrice(match) : null;
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
                          {(item.quantity !== null || item.notes) && (
                            <small>{[item.quantity !== null ? String(item.quantity) : '', item.notes ?? ''].filter(Boolean).join(' - ')}</small>
                          )}
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
                          <p>{[match.brand, match.size].filter(Boolean).join(' - ')}</p>
                          {selectedPrice && (
                            <p className="price-line">
                              <strong className={selectedPrice.isUnavailable ? 'price-unavailable' : ''}>{selectedPrice.currentPrice}</strong>
                              {selectedPrice.regularPrice && <span className="regular-price">{selectedPrice.regularPrice}</span>}
                              {selectedPrice.isOnSale && <span className="sale-badge">Sale</span>}
                            </p>
                          )}
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
                        {products.map((product) => {
                          const productPrice = krogerProductPrice(product);
                          return (
                            <button
                              type="button"
                              className={`product-choice ${match?.kroger_product_upc === product.upc ? 'selected-product-choice' : ''}`}
                              key={product.upc}
                              onClick={() => chooseProduct(item, product)}
                            >
                              {product.imageUrl && <img src={product.imageUrl} alt="" />}
                              <span>
                                <strong>{product.description}</strong>
                                <small>{[product.brand, product.size].filter(Boolean).join(' - ')}</small>
                                {productPrice && (
                                  <span className="price-line">
                                    <strong className={productPrice.isUnavailable ? 'price-unavailable' : ''}>{productPrice.currentPrice}</strong>
                                    {productPrice.regularPrice && <span className="regular-price">{productPrice.regularPrice}</span>}
                                    {productPrice.isOnSale && <span className="sale-badge">Sale</span>}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })}
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
          {items.length > 0 && (
            <div className="full-width-action">
              <button type="button" className="primary" onClick={submitApproved} disabled={!connected || approvedCount === 0 || loading}>
                Add approved ({approvedCount})
              </button>
            </div>
          )}
        </div>
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

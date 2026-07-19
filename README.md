# PrepMate

PrepMate is a mobile-first meal-planning MVP built with React, TypeScript, Vite, Supabase Auth, and Supabase PostgreSQL. Users can save meals with ingredients, select meals for a shopping period, generate a combined grocery-list snapshot, and edit that snapshot while shopping.

## Local Setup

1. Install Node.js 22 or newer.
2. Install dependencies:

```bash
npm install
```

3. Copy the example environment file:

```bash
cp .env.example .env.local
```

4. Fill in:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

The anon key is safe to ship in the browser. Do not use or expose a Supabase service-role key in this app.

5. Start Vite:

```bash
npm run dev
```

## Supabase Setup

1. Create a Supabase project.
2. In Authentication settings, enable email/password sign-in.
3. Connect the Supabase project to this GitHub repository, `JTSimmons/PrepMate`.
4. Apply the SQL migrations in `supabase/migrations/`.

Using the Supabase CLI:

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

Or paste the migration into the Supabase SQL editor and run it once.

The migration creates household, meal, ingredient, meal-plan, shopping-list, and shopping-list-item tables. Row Level Security is enabled for every user-accessible table. Policies restrict normal browser CRUD operations to households where `auth.uid()` is a member. A `create_household_for_current_user` RPC creates the first household and membership for a new user.

The Supabase project structure is committed under `supabase/`:

```text
supabase/
  config.toml
  migrations/
  functions/
  seed.sql
  tests/
```

Keep generated local state such as `supabase/.temp/` out of Git. Do not commit Supabase access tokens, database passwords, or service-role keys.

Recommended Auth URL settings:

- Site URL: `https://jtsimmons.github.io/PrepMate/`
- Additional redirect URLs:
  - `http://localhost:5173/**`
  - `https://jtsimmons.github.io/PrepMate/**`

## Kroger Integration Setup

PrepMate sends grocery lists to Kroger through Supabase Edge Functions. The browser never receives Kroger OAuth tokens, the Kroger client secret, or the Supabase service-role key.

1. Create a Kroger developer app with an OAuth redirect URI:

```text
https://your-project-ref.supabase.co/functions/v1/kroger-auth-callback
```

2. Store Kroger credentials as Supabase Edge Function secrets:

```bash
supabase secrets set KROGER_CLIENT_ID=your-kroger-client-id
supabase secrets set KROGER_CLIENT_SECRET=your-kroger-client-secret
supabase secrets set KROGER_REDIRECT_URI=https://your-project-ref.supabase.co/functions/v1/kroger-auth-callback
supabase secrets set KROGER_DEFAULT_LOCATION_ID=optional-store-location-id
```

3. Deploy the Edge Functions:

```bash
supabase functions deploy kroger-auth-start
supabase functions deploy kroger-auth-callback --no-verify-jwt
supabase functions deploy kroger-cart-preview
supabase functions deploy kroger-product-search
supabase functions deploy kroger-cart-submit
```

The Kroger review flow uses the saved `shopping_list_items` snapshot. Removed items are never exported, checked items are excluded by default, and users must approve a Kroger product match before it can be added to cart. Recipe quantities are not converted to package counts automatically; the user confirms package count during review.

## Development Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Vitest covers grocery-list aggregation, Kroger cart eligibility helpers, and meal form validation/save behavior. Playwright covers the static setup state and runs against the Vite app.

## Grocery List Behavior

Generated grocery lists are persisted snapshots in `shopping_lists` and `shopping_list_items`. They are not continuously recalculated after meal changes. Ingredients combine by normalized ingredient name across the selected family meals. PrepMate assumes each selected meal appears once; the shopper chooses the exact Kroger package, then the summed quantity is used as the default package count.

## GitHub Pages Deployment

The Vite `base` is `/PrepMate/`, and the app uses `HashRouter` so static GitHub Pages routing works.

The workflow in `.github/workflows/deploy.yml` builds and deploys on pushes to `main`. Configure these repository values before enabling the deployment:

- Repository variable: `VITE_SUPABASE_URL`
- Repository secret: `VITE_SUPABASE_ANON_KEY`

In repository settings, set GitHub Pages source to GitHub Actions.

## Current Limitations

Recipe scraping/importing, pantry inventory, AI recommendations, push notifications, native apps, and a separate backend service are intentionally out of scope. Kroger integration requires a configured Kroger developer app and deployed Supabase Edge Functions before the cart flow can complete against the live Kroger API.

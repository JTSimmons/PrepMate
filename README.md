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
3. Apply the SQL migration in `supabase/migrations/202607180001_initial_schema.sql`.

Using the Supabase CLI:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

Or paste the migration into the Supabase SQL editor and run it once.

The migration creates household, meal, ingredient, meal-plan, shopping-list, and shopping-list-item tables. Row Level Security is enabled for every user-accessible table. Policies restrict normal browser CRUD operations to households where `auth.uid()` is a member. A `create_household_for_current_user` RPC creates the first household and membership for a new user.

## Development Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Vitest covers grocery-list aggregation and meal form validation/save behavior. Playwright covers the static setup state and runs against the Vite app.

## Grocery List Behavior

Generated grocery lists are persisted snapshots in `shopping_lists` and `shopping_list_items`. They are not continuously recalculated after meal changes. Ingredients combine only when the normalized ingredient name and unit match. The first normalization pass trims names and compares them case-insensitively; no unsafe unit conversions are attempted.

## GitHub Pages Deployment

The Vite `base` is `/PrepMate/`, and the app uses `HashRouter` so static GitHub Pages routing works.

The workflow in `.github/workflows/deploy.yml` builds and deploys on pushes to `main`. Configure these repository values before enabling the deployment:

- Repository variable: `VITE_SUPABASE_URL`
- Repository secret: `VITE_SUPABASE_ANON_KEY`

In repository settings, set GitHub Pages source to GitHub Actions.

## Current Limitations

Kroger integration, recipe scraping/importing, pantry inventory, AI recommendations, push notifications, native apps, and a separate backend service are intentionally out of scope for this MVP.

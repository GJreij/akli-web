# akli-web

Next.js PWA replacing the FlutterFlow client app for Akli (Lebanon meal prep, D2C).

## Backend
- Supabase project: `rjaypqibeymfopncjxkz` (eu-west-3), all tables RLS-enabled
- Flask LP solver: `https://aklilebapp-72376dbe3cc8.herokuapp.com` — endpoint path TBD (need Flask repo)
- Tenant ID: 1 (hardcoded for now, single tenant)

## Key constraints
- Contact channel is WhatsApp only — never default to email in copy or UX
- Existing users at akli-lb.org must be able to sign in with zero migration
- Deploy new app to app.akli-lb.org first; don't cut over akli-lb.org until ready
- `partner_client_link` table has stale data (156 rows) from old B2B2C model — ignore in client app

## Onboarding flow
goal → basics → activity → results → save (account creation)
Skip path: goal → manual (macros or kcal) → save

## Pricing
Real pricing from `macro_price` table (per-gram prices + packaging + delivery).
`src/lib/macros.ts:estimatePriceFromMacros()` uses this when table data is available.

## Flask solver
Stubbed in `src/lib/flask.ts`. Wire real endpoint/request contract once repo is shared.

## Build order
1. Landing + onboarding (done)
2. Home dashboard (done, stub)
3. Ordering flow (needs Flask solver contract)
4. Checkout: delivery slot, promo codes, payment
5. Polish: order history, profile editing

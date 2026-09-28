# HABÄNE Admin — Developer Onboarding

Internal operations console for the HABÄNE store. React + TanStack Start,
Supabase for data and auth, Stripe for payments.

This document is for a developer picking the project up for the first time.
It covers getting it running, how the code is organised, and the known
problems you are most likely to hit.

---

## 1. Before you start

You need three things from whoever owns the project:

| What | Why | Where it comes from |
|---|---|---|
| `.env` values | Nothing runs without them | Ask the owner — send via password manager, **never** commit or paste in chat |
| Supabase dashboard access | To inspect data and run migrations | Project owner invites you |
| An admin login | To see past the auth gate | See §6 |

Node 22 is what this was built and tested against (`v22.17.0`). No `engines`
field is declared, so nothing enforces it — if you hit odd build errors on an
older Node, check your version first.

---

## 2. Getting it running

```sh
git clone https://github.com/Saicharan-Billakanti/Habane_Admin.git
cd Habane_Admin
npm install
cp .env.example .env     # then fill in real values
npm run dev
```

The port is set by the `@lovable.dev/vite-tanstack-config` preset rather than
declared in `vite.config.ts`, so read the URL Vite prints on startup. Then go
to `/admin`.

### A warning about the package manager

The repo contains **both `bun.lock` and `package-lock.json`**, and no
`packageManager` field. That is a trap: if you install with a different tool
than the person before you, you can silently resolve different dependency
versions and chase bugs that are not in the code.

**Use `npm`.** That is what the lockfile in active use reflects and what the
build has been verified against. If the team later standardises on bun,
delete `package-lock.json` in the same commit — do not leave both.

### Available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build (also regenerates the route tree) |
| `npm run lint` | ESLint + Prettier |
| `npm run format` | Auto-fix formatting |
| `npx tsc --noEmit` | Typecheck — **not** wired to a script, run it directly |

### Verifying your setup is sound

Before changing anything, confirm you start from a clean baseline:

```sh
npx tsc --noEmit     # expect: no output
npm run build        # expect: succeeds
npm run lint         # expect: no errors
```

All three pass on `main` as of this writing. **If any of them fail on a fresh
clone, the problem is your environment, not the code** — most likely Node
version or a mixed install. Fix that before debugging anything else.

---

## 3. How the code is laid out

```
src/
├── routes/
│   ├── _authenticated/
│   │   └── admin/          ← every admin screen lives here
│   │       ├── route.tsx   ← sidebar + auth guard (start here)
│   │       ├── index.tsx   ← dashboard
│   │       ├── analytics/  ← 8 reports
│   │       ├── cms/        ← 7 content screens
│   │       └── seo/
│   └── api/                ← server routes
├── lib/
│   ├── api/                ← ALL data access (see below)
│   ├── commerce.functions.ts  ← server functions (Stripe, email)
│   └── format.ts           ← money, dates, CSV
├── components/
│   ├── admin/              ← PageHeader, DataStates, AnalyticsKit
│   └── ui/                 ← shadcn primitives, don't edit by hand
└── integrations/supabase/  ← client setup, auth middleware
```

### The one rule worth internalising

**Screens never talk to Supabase directly.** Every query and mutation goes
through a module in `src/lib/api/`. A route imports a function, wraps it in
`useQuery`/`useMutation`, and renders. If you find yourself importing
`supabase` into a route file, you are doing it wrong.

The API modules are organised by domain: `products.ts`, `orders.ts`,
`customers.ts`, `cms.ts`, `marketing.ts`, `inventory.ts`, `analytics.ts`,
`seo.ts`, `admin.ts`, `refunds.ts`, `settings.ts`.

### Routing

File-based via TanStack Router. `src/routeTree.gen.ts` is **generated** —
never edit it. It regenerates on `npm run dev` and `npm run build`.

If you add a route file and TypeScript complains that the path is not
assignable to `keyof FileRoutesByPath`, you just need to run a build to
regenerate the tree. That error is expected and not a real problem.

A route needs its own directory to have children. `analytics.tsx` became
`analytics/index.tsx` for this reason — if you make a leaf route into a
parent, move it the same way.

---

## 4. The errors you are most likely here to fix

### 4.1 Seven screens fail — and it is not a code bug

**This is the single most important thing in this document.**

A migration (`supabase/migrations/20260901000000_phase0_full_scope.sql`) was
only **partially applied** to the live database. 32 of its 48 tables exist;
**16 do not**:

```
wishlists              purchase_orders        purchase_order_items
product_drops          search_logs            back_in_stock_requests
early_access_list      suppliers              content_versions
custom_reports         customer_activity      product_matching_rules
product_recommendations shipping_zones        shipping_methods
tax_rules
```

As a result these screens show an error state:

| Screen | Missing table |
|---|---|
| Customers → Wishlists | `wishlists` |
| Products → Purchase Orders | `purchase_orders` |
| Products → Product Drops | `product_drops` |
| Marketing → Early Access | `early_access_list` |
| Marketing → Back in Stock | `back_in_stock_requests` |
| SEO → Search Analytics | `search_logs` |
| Analytics → Custom Reports (saved reports) | `custom_reports` |

**The UI code for these is written and correct.** Do not rewrite it. The fix
is to apply the catch-up migration:

```
supabase/migrations/20260902000000_catchup_missing_tables.sql
```

It creates exactly those 16 tables in dependency order and is safe to re-run
(`IF NOT EXISTS` on indexes, `DROP ... IF EXISTS` before policies and
triggers). Apply it via the Supabase SQL Editor, or `supabase db push` if you
have the DB password.

If any `CREATE TYPE` fails as missing, run `supabase/fix_enums_first.sql`
first, in its own SQL Editor tab — Postgres needs new enum values committed
before they can be used.

**Verify after applying** — all 16 should return HTTP 200:

```sh
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/wishlists?select=*&limit=1"
```

### 4.2 Most screens look empty

Expected. The database has 8 products, 8 orders and 4 customers, and most
other tables are genuinely empty. An empty state is the screen working
correctly — check the row count before assuming a bug.

### 4.3 A save fails with a permissions error

Row Level Security. Write policies are `USING (public.is_admin())`. Reads on
CMS tables are public, so a list can populate while a save is rejected —
which looks like a broken form but is an auth problem.

Check your user has the admin role:

```sql
select * from user_roles where user_id = '<your-uuid>';
```

### 4.4 Analytics shows zeros

Two separate causes, worth telling apart:

- **Revenue/orders zero** — there is genuinely little order data.
- **Conversion funnel zero** — the storefront sends **no events at all**. No
  product views, no cart events, no UTM capture. The funnel has no data
  source. This is a storefront gap, not an admin bug, and cannot be fixed in
  this repo.

---

## 5. Architecture you should know before changing things

### Two separate codebases

| | Repo | Stack |
|---|---|---|
| **Admin** (this) | `Saicharan-Billakanti/Habane_Admin` | TanStack Start + Supabase |
| **Storefront** | `Saicharan-Billakanti/Habane_current` | Static HTML/CSS/JS |

**They are not connected.** The storefront renders products from a hardcoded
object in its own `assets/app.js`. Editing a product in this admin does
**not** change the live shop. Wiring the storefront to `getProducts()` is
outstanding work in the *other* repo.

### Access control is currently one boolean

Auth is Supabase email/password. Authorisation is a single `has_role(uid,
'admin')` check. The Team screen exposes 9 roles with module grants, but the
route guard only checks for `admin` — a "Content Manager" cannot currently
log in with reduced access. Treat the roles UI as ahead of the enforcement.

### Money and Stripe

Refunds go through `refundOrderFn` in `commerce.functions.ts`, a **server**
function. The Stripe secret must never reach the browser. There is an
`issueRefund` in `lib/api/refunds.ts` that takes a `stripeSecretKey`
parameter — **do not call it from a component.** Use the server function.

---

## 6. Logging in

There is exactly one admin account, and its password is not recoverable —
Supabase hashes it.

- **Forgot the password**: Supabase Dashboard → Authentication → Users →
  select the user → Send password recovery.
- **Need a second admin**: create the user in Supabase Dashboard →
  Authentication → Users → Add user, then insert a row into `user_roles`
  with that user's id and role `admin`.

---

## 7. Deploying

Hosted on Vercel, project `ember-commerce-backend`, deployed from the CLI
(not Git-connected — pushing to GitHub does **not** deploy).

```sh
npx vercel deploy --yes          # preview
npx vercel deploy --prod --yes   # production
```

Two things to watch:

1. **Env vars in Vercel are scoped to Production only**, and
   `SUPABASE_PUBLISHABLE_KEY` is absent from the project entirely. A plain
   preview deploy gets no Supabase credentials and every page errors. Pass
   them per-deployment with `--build-env` / `--env`.
2. **Preview URLs sit behind Vercel SSO.** You must be signed into the Vercel
   account in that browser, or you get redirected to a login page.

---

## 8. Conventions

- Screens use `PageHeader`, `LoadingState`, `ErrorState`, `EmptyState` from
  `components/admin/`. Match the existing pattern rather than inventing one.
- Analytics screens share `StatCard` / `Section` / `DateRangePicker` from
  `components/admin/AnalyticsKit.tsx`, and `useDateRange` / `CHART_COLORS`
  from `lib/analytics-ui.ts`. These are split because React Fast Refresh
  requires a component file to export only components — keep hooks and
  constants out of `AnalyticsKit`.
- CSV export uses `toCsv` + `downloadFile` from `lib/format.ts`
  (semicolon-delimited, which is what Excel expects in de-DE).
- Mutations show a `sonner` toast on success and error.

---

## 9. Handy commands

```sh
# every admin route the sidebar declares
grep -oE '\{ to: "[^"]+"' src/routes/_authenticated/admin/route.tsx

# what an API module exposes
grep -nE "^export (async )?function" src/lib/api/orders.ts

# smoke-test routes render (dev server running; use the port Vite printed)
PORT=3000
for p in /admin /admin/products /admin/orders; do
  curl -s -o /dev/null -w "%{http_code} $p\n" "http://localhost:$PORT$p"
done
```

---

## 10. Other docs in this repo

`API.md`, `DEPLOYMENT.md`, `FRONTEND_INTEGRATION.md`, `AGENTS.md`. Note that
`README.md` is the generic Lovable scaffold and does not describe this
project accurately — prefer this file.

---

## First day, in order

1. Clone, `npm install`, fill `.env`, `npm run dev`.
2. Run the three baseline checks in §2. Do not proceed until all pass.
3. Log in at `/admin`, click through the sidebar, note which screens error.
4. Cross-reference against §4.1 — most failures are the missing tables.
5. Apply the catch-up migration and re-check.
6. Only then start on anything else.

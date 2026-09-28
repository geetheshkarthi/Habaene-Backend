# HABÄNE Backend

Standalone backend + admin panel for the HABÄNE storefront. TanStack Start (React SSR) on
Supabase (Postgres), deployed independently of the static storefront at `Habane_current`.

## Stack

- **App**: TanStack Start + React 19 + Tailwind v4, TypeScript
- **Database**: Supabase (Postgres), schema + RLS policies in `supabase/migrations/`
- **Payments**: Stripe and Razorpay (selectable per order via `payment_provider`), Slice scaffolded
- **Shipping**: DHL and Delhivery (`src/lib/dhl.server.ts`, `src/lib/delhivery.server.ts`)
- **Email**: Resend (transactional order/return emails)

Every third-party integration degrades cleanly when its keys are absent — checkout/refunds answer
`503` instead of crashing, emails are logged instead of sent. See `GET /api/v1/health` and
`GET /api/v1/system/check`.

## Setup

1. `npm i`
2. Create a Supabase project, then apply the schema:
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   `supabase/migrations/*.sql` is the source of truth (applied in filename order). The root
   `setup_database.sql` is an older, partial snapshot — kept for reference only.
3. Copy `.env.example` to `.env` and fill in Supabase credentials. Payment/shipping/email keys are
   optional — leave them unset until you have them; the app runs fine without them (see above).
4. `npm run dev` and open the URL Vite prints.
5. Create your first admin account: sign up once at `/auth`, then grant the role from the Supabase
   SQL editor:
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com'
   on conflict do nothing;
   ```

## Deployment (Cloudflare Workers)

Deploy this app on its own (not alongside the static storefront). It targets Cloudflare Workers via
Cloudflare's official `@cloudflare/vite-plugin` (officially supports TanStack Start SSR — set in
`vite.config.ts`), with `wrangler.jsonc` describing the Worker. `main` in `wrangler.jsonc` points at
TanStack Start's `virtual:tanstack-start-server-entry` virtual module rather than a real file —
that's expected, the plugin resolves it through Vite at build time.

```sh
npx wrangler login              # once, opens a browser to authorize this machine
npm run cf:deploy               # builds, then `wrangler deploy`
```

Set every env var from `.env.example` as a Worker secret (Supabase ones are required; the rest are
optional per the degrade-cleanly behavior above — add them later as you get each provider's keys):

```sh
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
# repeat for RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RAZORPAY_*, SLICE_*, DHL_*, DELHIVERY_*
```

`VITE_*` vars (public, inlined into the client bundle at build time) must be present in `.env`
(or the shell) when you run `npm run cf:deploy` — they're baked into the build, not read by the
Worker at runtime, so `wrangler secret put` doesn't apply to them.

Register provider webhooks against your Worker's URL once keys exist:

- Stripe: `POST /api/public/stripe-webhook`
- Razorpay: `POST /api/public/razorpay-webhook`
- Slice: `POST /api/public/slice-webhook`

## Docs

- `ONBOARDING.md` — architecture, current known gaps, deeper setup notes
- `API.md` — full endpoint reference
- `FRONTEND_INTEGRATION.md` — how the storefront consumes this API (`src/lib/api/sdk.ts` +
  `src/lib/api-v1/contract.ts` are meant to be copied into the storefront, or called over HTTP)
- `DEPLOYMENT.md` — pre-launch QA checklist

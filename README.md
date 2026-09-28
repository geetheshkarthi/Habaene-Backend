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

## Deployment

Deploy this app on its own (not alongside the static storefront). It runs on any Nitro-supported
host — Vercel, Netlify, Cloudflare, Render, Railway, or plain Node. No `preset` is hardcoded in
`vite.config.ts`, so Nitro auto-detects the host from the deploy environment; set `NITRO_PRESET`
explicitly if it picks the wrong one.

```sh
npm run build
```

Set every env var from `.env.example` on the host (Supabase ones are required; the rest are
optional per the degrade-cleanly behavior above). Register provider webhooks once keys exist:

- Stripe: `POST /api/public/stripe-webhook`
- Razorpay: `POST /api/public/razorpay-webhook`
- Slice: `POST /api/public/slice-webhook`

## Docs

- `ONBOARDING.md` — architecture, current known gaps, deeper setup notes
- `API.md` — full endpoint reference
- `FRONTEND_INTEGRATION.md` — how the storefront consumes this API (`src/lib/api/sdk.ts` +
  `src/lib/api-v1/contract.ts` are meant to be copied into the storefront, or called over HTTP)
- `DEPLOYMENT.md` — pre-launch QA checklist

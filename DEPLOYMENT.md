# HABÄNE — Phase 8: testing & production checklist

## 1. Seed data (already applied)

The database is seeded through migrations, so every environment gets the same fixtures:

| Fixture | Value |
|---|---|
| Products | 6 test products across `system`, `carry`, `luggage` |
| Low stock | `HB-CAR-02` Meridian Sling 6L — stock 4 (triggers the low-stock alert) |
| Out of stock | `HB-LUG-02` Continent Hold Case 75 — stock 0 (checkout must reject it) |
| Discount | `WELCOME10` — 10 % off, minimum order €100, 500 uses |
| Store settings | Brand HABÄNE, EUR, 19 % VAT, 14-day withdrawal window |

Replace the placeholder legal fields (VAT ID, commercial register, business and returns address)
in **Admin → Settings** before going live — every invoice and transactional email reads them.

## 2. First admin account

1. Sign up once at `/auth` with the address that should own the panel.
2. Grant the role (run once, from the backend SQL tool):
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com'
   on conflict do nothing;
   ```
3. Sign in again — the admin console loads. Non-admin users are rejected by the route gate.

## 3. Secrets

| Secret | Needed for |
|---|---|
| `STRIPE_SECRET_KEY` | checkout sessions, refunds |
| `STRIPE_WEBHOOK_SECRET` | webhook signature verification |
| `RESEND_API_KEY` | transactional email |
| `EMAIL_FROM` | sender identity, e.g. `HABÄNE <orders@yourdomain.com>` |

Until they exist, checkout answers `503 unavailable` and emails are logged instead of sent — nothing
crashes. Ask me and I'll open the secure form for each.

## 4. Stripe test mode

1. Add the **test** secret key.
2. Register the webhook endpoint
   `https://project--f525ea2d-07af-408d-b05a-bcc17b77532b.lovable.app/api/public/stripe-webhook`
   for events: `checkout.session.completed`, `checkout.session.expired`,
   `payment_intent.payment_failed`, `charge.refunded`.
3. Save the signing secret as `STRIPE_WEBHOOK_SECRET`.
4. Publish the app so the new secrets reach production.

## 5. End-to-end pass

| # | Step | Expected |
|---|---|---|
| 1 | `GET /api/v1/health` | `database` and `storage` ok, `stripe`/`email` ok once keys exist |
| 2 | `GET /api/v1/products` | 6 products, `HB-LUG-02` shows `in_stock: false` |
| 3 | `POST /api/v1/discounts/validate` `{ code: "WELCOME10", subtotal: 340 }` | `valid: true`, `discount_amount: 34` |
| 4 | `POST /api/v1/checkout` with an in-stock item | `201` + `checkout_url` |
| 5 | Pay with card `4242 4242 4242 4242`, any future expiry, any CVC | Stripe redirects to `success_url` |
| 6 | Admin → Orders | order is `confirmed` / `paid`, stock decremented, `WELCOME10` usage +1 |
| 7 | Inbox | order confirmation with itemised 19 % VAT and withdrawal notice |
| 8 | Admin → Orders → set carrier + tracking → *Email shipping update* | status `shipped`, tracking email arrives |
| 9 | Mark delivered | `delivered_at` set, withdrawal deadline shown (+14 days) |
| 10 | `POST /api/v1/returns` with that order number + email | `201`, appears in Admin → Returns |
| 11 | Approve the return, then *Refund via Stripe* | Stripe refund created, `payment_status: refunded`, refund email sent |
| 12 | `POST /api/v1/checkout` for `HB-LUG-02` | `409 conflict` — out of stock |
| 13 | Card `4000 0000 0000 9995` | payment fails, order stays `pending`, `payment_failed` logged |

Failure paths worth one pass each: bad JSON (`400 validation_error`), unknown slug
(`404 not_found`), `DELETE /api/v1/products` (`405 method_not_allowed`), tampered webhook
signature (`401`).

## 6. RLS verification

With the anon key only (no session), confirm:

- `products` — readable, but only `is_active` and non-deleted rows.
- `store_settings` — readable; private legal fields are filtered by the `/store` endpoint, and the
  admin-only columns are not exposed to anon.
- `orders`, `order_items`, `customers`, `discount_codes`, `returns`, `event_logs` — **no** anon read.
- `newsletter_subscribers`, `contact_messages` — insert allowed, read denied.
- Signed in as a non-admin user, every admin table read returns empty.

## 7. API verification

```bash
BASE=https://project--f525ea2d-07af-408d-b05a-bcc17b77532b.lovable.app/api/v1
curl -s $BASE/health | jq
curl -s "$BASE/products?limit=3&category=carry" | jq
curl -s $BASE/store | jq
curl -s -X POST $BASE/discounts/validate -H 'content-type: application/json' \
  -d '{"code":"WELCOME10","subtotal":340}' | jq
curl -s -X POST $BASE/newsletter/subscribe -H 'content-type: application/json' \
  -d '{"email":"test@example.com"}' | jq
```

Every response must carry the `{ success, data }` / `{ success, error }` envelope.

## 8. Frontend integration

1. Copy `src/lib/api-v1/contract.ts` and `src/lib/api/sdk.ts` into your storefront.
2. Point the client at the production base URL:
   ```ts
   export const api = new HabaneClient({ baseUrl: import.meta.env.VITE_HABANE_API_URL });
   ```
3. Verify: catalogue renders, cart totals match `/checkout` response totals (the server is
   authoritative), Stripe redirect works, order status page resolves with order number + email,
   newsletter and contact forms submit, return form submits.
4. CORS is open (`*`) — if you tighten it later, add your storefront origin to the allow-list in
   `src/lib/api-v1/response.ts`.

## 9. Production deployment checklist

- [ ] Legal fields completed in Admin → Settings (company, VAT ID, register, addresses)
- [ ] Real product catalogue loaded; test fixtures deactivated or deleted
- [ ] Live Stripe keys and a live-mode webhook endpoint registered
- [ ] Verified sending domain in Resend; `EMAIL_FROM` uses it
- [ ] App published (secrets only reach production on publish)
- [ ] `GET /api/v1/health` returns `status: "ok"`
- [ ] Admin account created, role granted, password stored in a password manager
- [ ] Uptime monitor pointed at `/api/v1/health`
- [ ] Storefront origin configured and tested end to end
- [ ] Security headers verified: `curl -sI $BASE/../.. | grep -Ei 'content-security|strict-transport|x-frame|x-content-type|referrer'`
- [ ] Reviewed Admin → the event log after the first live order

## 10. Known integration points left open

- **DHL / DPD label generation** — the `return_label_url` field and admin upload exist; the carrier
  API needs a business account.
- **Conversion funnel / active carts** — requires the storefront to emit session events.
- **Sentry / CI** — platform-level; backups, HTTPS and deploys are handled by the hosting layer.

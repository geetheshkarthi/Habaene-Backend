# HABÄNE — Frontend Integration Guide

Everything your existing storefront needs to talk to this backend. The admin panel and the public API live in this project; your storefront stays where it is and calls the API over HTTPS.

- **API reference (raw HTTP):** `API.md`
- **OpenAPI 3.1 spec:** `public/openapi.json` → served at `/openapi.json`
- **Runnable examples:** `examples/storefront/`
- **Deployment / go-live:** `DEPLOYMENT.md`

---

## 1. Installation

The SDK is dependency-free (uses `fetch` only). Two options:

### Option A — copy the three files (recommended)

```bash
# from your storefront root
mkdir -p src/lib/api-v1 src/lib/api
cp ../habane-backend/src/lib/api-v1/contract.ts src/lib/api-v1/contract.ts
cp ../habane-backend/src/lib/api/sdk.ts         src/lib/api/sdk.ts
cp ../habane-backend/src/lib/config.ts          src/lib/config.ts
```

Requirements: TypeScript 5+, a bundler with the `@/*` → `./src/*` path alias (Vite/Next/Remix all support it). If you don't use that alias, change the two imports at the top of `sdk.ts` and `config.ts` to relative paths.

### Option B — plain fetch, no SDK

Every endpoint is ordinary JSON over HTTP; see `API.md`. Use `public/openapi.json` with `openapi-typescript` or `orval` if you prefer generated clients.

### Verify the connection

```bash
curl https://project--f525ea2d-07af-408d-b05a-bcc17b77532b.lovable.app/api/v1/health
```

---

## 2. Environment variables

Storefront `.env` (all public, all safe to ship to the browser):

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | yes | `https://project--f525ea2d-07af-408d-b05a-bcc17b77532b.lovable.app` | Backend origin. Leave empty for same-origin. |
| `VITE_IMAGE_BASE_URL` | no | `https://<project>.supabase.co/storage/v1/object/public/product-images` | Only needed if you store bare storage paths; the API already returns absolute image URLs. |
| `VITE_CHECKOUT_SUCCESS_URL` | no | `/checkout/success` | Path Stripe returns to after payment. |
| `VITE_CHECKOUT_CANCEL_URL` | no | `/checkout/cancel` | Path Stripe returns to on cancel. |

Naming differs by framework: `NEXT_PUBLIC_*` for Next.js, `PUBLIC_*` for SvelteKit/Astro — adjust the `env()` reads in `config.ts` accordingly.

**Never put in the storefront:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, the service-role key. They live only in this backend project.

### `src/lib/config.ts`

```ts
import { API_URL, API_VERSION, IMAGE_BASE_URL, STORE_SETTINGS_ENDPOINT, imageUrl } from "@/lib/config";
```

| Export | Value |
|---|---|
| `API_BASE_URL` | Backend origin (`""` = same origin) |
| `API_VERSION` | `"v1"` |
| `API_PREFIX` | `"/api/v1"` |
| `API_URL` | `API_BASE_URL + API_PREFIX` |
| `IMAGE_BASE_URL` | Public product-image base |
| `STORE_SETTINGS_ENDPOINT` | `${API_URL}/store` |
| `HEALTH_ENDPOINT` | `${API_URL}/health` |
| `CHECKOUT_SUCCESS_URL` / `CHECKOUT_CANCEL_URL` | Return paths for Stripe |
| `imageUrl(path)` | Resolves a relative storage path to an absolute URL |

---

## 3. SDK usage

```ts
// src/lib/habane.ts in your storefront
import { createHabaneClient } from "@/lib/api/sdk";
import { API_BASE_URL } from "@/lib/config";

export const api = createHabaneClient({ baseUrl: API_BASE_URL });
```

`createHabaneClient(options)`:

| Option | Default | Notes |
|---|---|---|
| `baseUrl` | `""` (same origin) | Backend origin, no trailing slash |
| `basePath` | `"/api/v1"` | Change only when you move to `v2` |
| `headers` | `{}` | Merged into every request |
| `fetchImpl` | `globalThis.fetch` | Inject for SSR/tests |

Each method returns the **unwrapped `data`** payload and throws `HabaneApiError` on failure — you never handle the envelope yourself.

There is also a same-origin singleton and standalone functions if you prefer them:

```ts
import { getProducts, createCheckout } from "@/lib/api/sdk";
```

---

## 4. Authentication

**The public storefront API needs no authentication.** No API key, no token, no cookie. Endpoints are protected by design instead:

| Concern | Protection |
|---|---|
| Prices / totals | Recomputed server-side from the database; client prices are ignored |
| Discount codes | Re-validated server-side at order/checkout time |
| Stock | Re-checked at checkout; a race returns `409 conflict` |
| Order lookup | Requires order number **and** the email used at checkout |
| Return lookup | Requires return id **and** the customer email |
| Payment confirmation | Only the Stripe webhook (HMAC-verified) can mark an order paid |
| Admin data | Never reachable from the public API; behind Cloud auth + RLS in this project |

Admin authentication (email + password, `admin` role, audited login events) applies only to `/auth` and `/admin/*` in this project — your storefront never touches it.

**CORS:** every `/api/v1/*` route sends permissive CORS headers and answers `OPTIONS` with `204`, so a browser on any origin can call it. Lock this to your storefront domain before launch (see checklist §9).

---

## 5. Checkout flow

```text
storefront                     backend                       Stripe
   │  POST /api/v1/checkout       │                             │
   ├─────────────────────────────►│  re-price cart from DB      │
   │                              │  validate stock + discount  │
   │                              │  create pending order       │
   │                              ├────────────────────────────►│  create session
   │   { checkout_url, order_number, totals }                   │
   │◄─────────────────────────────┤                             │
   │  window.location = checkout_url ──────────────────────────►│  hosted payment
   │                              │◄── checkout.session.completed (webhook, HMAC)
   │                              │  mark paid + confirmed
   │                              │  decrement stock, count discount use
   │                              │  send order confirmation email
   │  redirect to success_url     │
   ├─ GET /api/v1/orders/{number}?email=… ─► live status
```

Rules that matter:

1. **Send only `product_id` + `quantity`** (plus optional `size`/`color`). Prices, VAT, shipping and discounts are all server-side.
2. **Clear the cart after the redirect starts**, not before the call succeeds.
3. **Never mark an order paid in the frontend.** The success page shows "payment is being confirmed" and polls `getOrder()` until `payment_status === "paid"` — the webhook is the source of truth.
4. **`checkout_url` can be `null`** when Stripe isn't configured yet (`503 unavailable` while keys are missing). Show a graceful message; the order is still saved as `pending`.
5. `success_url` / `cancel_url` must be absolute URLs on your storefront.

Use `createOrder()` instead of `createCheckout()` only for non-Stripe flows (invoice / bank transfer); it creates the same pending order without a payment session.

---

## 6. Error handling

Every response uses one envelope:

```jsonc
{ "success": true,  "data": { } }
{ "success": false, "error": { "code": "conflict", "message": "Not enough stock for Atlas Modular System", "details": [] } }
```

The SDK converts failures into `HabaneApiError` with `message`, `code`, `status` and optional `details`.

| `code` | HTTP | Typical cause | Suggested UI |
|---|---|---|---|
| `validation_error` | 400 | Bad/missing fields (`details` holds Zod issues) | Highlight the fields |
| `not_found` | 404 | Unknown product slug, order or return; wrong lookup email | "We couldn't find that" |
| `conflict` | 409 | Out of stock, product inactive, withdrawal window expired, duplicate request | Ask the user to adjust the cart |
| `method_not_allowed` | 405 | Wrong HTTP verb | Bug in the caller |
| `rate_limited` | 429 | Too many contact/newsletter/checkout attempts | "Try again shortly" |
| `unavailable` | 503 | Stripe or email not configured / upstream down | "Temporarily unavailable" |
| `internal_error` | 500 | Unexpected server fault | Generic error + retry |
| `network_error` | 0 | Request never reached the server (SDK-only) | Offline banner + retry |

```ts
import { HabaneApiError } from "@/lib/api/sdk";

try {
  await api.createCheckout(input);
} catch (error) {
  if (error instanceof HabaneApiError) {
    switch (error.code) {
      case "conflict":         return showCartConflict(error.message);
      case "validation_error": return showFieldErrors(error.details);
      case "unavailable":      return showPaymentsDown();
      default:                 return showGeneric(error.message);
    }
  }
  throw error;
}
```

Retry policy: safe to retry `GET`s and `network_error`/`503` with backoff. Never blind-retry `POST /checkout` — it creates a new order each time.

---

## 7. SDK method reference

All examples assume `const api = createHabaneClient({ baseUrl: API_BASE_URL })`.

### `getProducts(params?) → ProductListResult`

`GET /api/v1/products` — active, non-deleted catalogue.

| Param | Type | Notes |
|---|---|---|
| `category` | `"system" \| "carry" \| "luggage"` | optional |
| `search` | `string` | matches name, code, subtitle |
| `in_stock` | `boolean` | `true` hides sold-out items |
| `limit` | `number` | default 24, max 100 |
| `offset` | `number` | pagination |

```ts
const { items, total, limit, offset } = await api.getProducts({ category: "carry", in_stock: true, limit: 12 });
```

Returns `{ items: PublicProduct[]; total; limit; offset }`. `PublicProduct.price` is the gross price in EUR, `vat_rate` is percentage points (`19`), `images`/`card_image` are absolute URLs.

### `getProduct(slug) → PublicProduct`

`GET /api/v1/products/{slug}`. Throws `not_found` (404) for unknown, inactive or deleted products.

```ts
const product = await api.getProduct("atlas-modular-system");
```

### `createOrder(input) → CreatedOrder`

`POST /api/v1/orders` — pending order without payment.

```ts
const order = await api.createOrder({
  items: [{ product_id: "3aaf…", quantity: 1, size: "M", color: "Ink" }],
  email: "anna@example.com",
  shipping_address: { first_name: "Anna", last_name: "Weber", line1: "Hauptstr. 1", postal_code: "10115", city: "Berlin", country: "DE" },
  billing_address: undefined,      // defaults to shipping
  discount_code: "WELCOME10",
  newsletter_opt_in: true,
  gdpr_consent_text: "Accepted terms and privacy policy at checkout.",
});
// → { order_id, order_number: "HB-2026-000123", status, payment_status, subtotal, discount_amount, shipping_cost, vat_rate, vat_amount, total, currency }
```

Errors: `validation_error` (400), `not_found` (404, unknown product), `conflict` (409, out of stock / inactive).

### `createCheckout(input) → CheckoutSessionResult`

`POST /api/v1/checkout` — `createOrder` input plus `success_url` and `cancel_url`.

```ts
const session = await api.createCheckout({
  ...orderInput,
  success_url: `${window.location.origin}/checkout/success`,
  cancel_url: `${window.location.origin}/cart`,
});
if (session.checkout_url) window.location.href = session.checkout_url;
```

Returns the totals plus `checkout_url` (`string | null`) and `support_email`. `503 unavailable` while Stripe keys are missing.

### `getOrder(orderNumber, email) → PublicOrder`

`GET /api/v1/orders/{order_number}?email=…` — guest status lookup; the email must match the checkout email or you get `not_found`.

```ts
const order = await api.getOrder("HB-2026-000123", "anna@example.com");
order.status;               // pending | confirmed | processing | shipped | delivered | cancelled | returned
order.payment_status;       // pending | paid | failed | refunded
order.tracking_number;      // once shipped
order.withdrawal_deadline;  // ISO date, 14 days after delivery
```

### `createReturn(input) → PublicReturn`

`POST /api/v1/returns`.

```ts
const request = await api.createReturn({
  order_number: "HB-2026-000123",
  email: "anna@example.com",
  type: "withdrawal",           // "withdrawal" | "defect" | "exchange_request"
  reason: "Doesn't fit my setup",
});
```

Errors: `not_found` (order/email mismatch), `conflict` (withdrawal window passed or request already open).

### `getReturn(id, email) → PublicReturn`

`GET /api/v1/returns/{id}?email=…` — status, `refund_amount`, `return_label_url` once the admin uploads one.

### `subscribeNewsletter(input) → NewsletterResult`

`POST /api/v1/newsletter/subscribe`.

```ts
await api.subscribeNewsletter({
  email: "anna@example.com",
  consent_text: "I agree to receive the HABÄNE newsletter…",  // stored for GDPR proof
  source: "footer",
});
```

Re-subscribing an existing address is idempotent. Store `unsubscribe_token` only if you build your own unsubscribe links; outgoing emails already carry one.

### `unsubscribeNewsletter({ token? , email? })`

`POST /api/v1/newsletter/unsubscribe` — pass the `token` from the email link, or the `email`.

### `submitContact(input) → ContactResult`

`POST /api/v1/contact` — lands in the admin contact inbox.

```ts
await api.submitContact({ name: "Anna", email: "anna@example.com", subject: "Sizing", message: "Which case fits a 16\" laptop?" });
```

### `validateDiscount(code, subtotal) → DiscountValidation`

`POST /api/v1/discounts/validate` — advisory pre-check for the cart UI.

```ts
const result = await api.validateDiscount("WELCOME10", 349);
// { valid: true, code: "WELCOME10", type: "percent", value: 10, discount_amount: 34.9 }
// { valid: false, code: "EXPIRED", reason: "This code has expired" }
```

`valid: false` is a **200 response**, not an error — check the flag. The code is re-validated at checkout regardless.

### `getStoreSettings() → PublicStoreSettings`

`GET /api/v1/store` — safe subset only: `brand_name`, `company_name`, `support_email`, `support_phone`, `currency`, `vat_rate`, `shipping_cost`, `free_shipping_threshold`, `withdrawal_window_days`, `social_links`, `logo_url`, `favicon_url`. VAT ID, register number and internal addresses are never exposed here.

```ts
const store = await api.getStoreSettings();
const freeShippingLeft = (store.free_shipping_threshold ?? 0) - cartSubtotal;
```

Cache this for the session; it changes rarely.

### `getHealth() → HealthResult`

`GET /api/v1/health` — `status`, `version`, `api_version`, `timestamp` and per-service checks (`database`, `storage`, `stripe`, `email`). For monitoring, not for storefront rendering.

---

## 8. Example implementations

Ready to copy from `examples/storefront/`:

| File | Covers | SDK methods |
|---|---|---|
| `client.ts` | Shared client instance | `createHabaneClient` |
| `ProductListing.tsx` | Grid, search, category filter, pagination fields | `getProducts` |
| `ProductDetail.tsx` | Slug page, gallery, add to cart, 404 handling | `getProduct` |
| `CartContext.tsx` | localStorage cart, `toApiItems()` helper | — |
| `Checkout.tsx` | Address form, discount, Stripe redirect, conflict handling | `validateDiscount`, `createCheckout` |
| `NewsletterForm.tsx` | Consent-text subscribe + unsubscribe handler | `subscribeNewsletter`, `unsubscribeNewsletter` |
| `ContactForm.tsx` | Contact form with rate-limit handling | `submitContact` |
| `OrderLookup.tsx` | Guest order status, tracking, withdrawal deadline | `getOrder` |
| `ReturnRequest.tsx` | Withdrawal / defect / exchange request + status | `createReturn`, `getReturn` |
| `DiscountField.tsx` | Cart discount widget | `validateDiscount` |

They are framework-agnostic React (hooks + `fetch`), deliberately unstyled — drop in your own components and design tokens.

---

## 9. Migration notes — replacing mock data with live calls

Work module by module; each step is independently shippable.

**Step 0 — inventory.** Grep the storefront for mock sources: `rg -n "mockProducts|dummy|fixtures|placeholder" src/`. List every component that reads them.

**Step 1 — shape mapping.** Point your existing types at the SDK's, then let TypeScript show you every mismatch:

```ts
// before
export interface Product { id: string; title: string; price: number; image: string; }
// after
export type { PublicProduct as Product } from "@/lib/api/sdk";
```

Common renames from typical mock data:

| Mock field | API field |
|---|---|
| `title` | `name` |
| `image` / `thumbnail` | `card_image` (list), `images[]` (detail) |
| `shortDescription` | `subtitle` |
| `inStock` | `in_stock` (or `stock > 0`) |
| `priceCents` | `price` (decimal EUR, **not** cents) |
| `tax` | `vat_rate` (percentage points, e.g. `19`) |
| `id` in URLs | `slug` for `getProduct()`; `id` only for cart lines |

**Step 2 — read paths first.** Replace mock arrays with `getProducts()` / `getProduct()`; add loading and error states everywhere (mocks never failed, the API can). Keep the mock file around as a test fixture.

**Step 3 — cart.** Strip prices out of persisted cart state, or treat them as display-only. Persist `product_id` + `quantity` (+ `size`/`color`). Re-fetch products on cart load so prices and stock stay current. Anything price-related computed in the frontend is now a *preview* — the server total wins.

**Step 4 — checkout.** Delete any client-side total/VAT/shipping maths used for submission and any fake payment step. Send the cart to `createCheckout()` and redirect. Build `/checkout/success` (poll `getOrder()`) and `/checkout/cancel`.

**Step 5 — forms.** Wire newsletter, contact and return forms to their SDK calls; add the GDPR consent text you actually display — it is stored as proof of consent.

**Step 6 — store settings.** Replace hardcoded brand name, support email, shipping cost, free-shipping threshold and VAT with `getStoreSettings()` so the admin panel controls them.

**Step 7 — images.** Drop bundled product images; use `card_image` / `images[]` from the API. Add `loading="lazy"` and width/height to avoid layout shift.

**Step 8 — clean up.** Remove mock modules, unused fixtures and dead helpers. Re-run type-check and your test suite.

**Rollback tip:** keep a `VITE_USE_MOCKS` flag during migration and branch inside your data layer only — never inside components.

---

## 10. Production integration checklist

**Backend (this project)**
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` added, then **publish** (secrets reach production only on publish)
- [ ] Stripe webhook registered at `https://<your-domain>/api/public/stripe-webhook`, live mode, signing secret matching
- [ ] Store settings filled in: legal company name, VAT ID, register number, addresses, invoice prefix, shipping cost, threshold, VAT rate, support email, socials, logo
- [ ] Seed/test products, test orders and the `WELCOME10` test code removed or deactivated
- [ ] Real catalogue uploaded with images, stock and prices
- [ ] At least two admin users exist; login and failed-login events appear in the event log
- [ ] `GET /api/v1/health` returns `status: "ok"` with all four checks green

**Frontend**
- [ ] `VITE_API_BASE_URL` points at the production backend (no localhost, no preview URL)
- [ ] No secret keys anywhere in the storefront bundle (`rg -n "sk_live|sk_test|service_role|re_" dist/`)
- [ ] All mock data removed; loading, empty and error states on every API-backed view
- [ ] Cart survives reload and re-validates against live stock
- [ ] Checkout redirects to Stripe and back; success page polls until `payment_status === "paid"`
- [ ] Order lookup, return request, newsletter and contact forms all tested against production
- [ ] Client-side money formatting uses EUR/de-DE and matches the server totals to the cent

**Commerce & legal (DE/EU)**
- [ ] End-to-end live test with a real card, then refunded from the admin panel
- [ ] Order confirmation, shipping, return and refund emails received and rendering correctly
- [ ] Invoice PDF shows itemised VAT, VAT ID and register number
- [ ] Impressum, AGB, Widerrufsbelehrung, Datenschutz and Versand pages published and linked in the footer
- [ ] 14-day withdrawal deadline shown on the order status page
- [ ] Cookie/consent banner in place before any analytics loads
- [ ] Newsletter consent text stored and unsubscribe link works end to end

**Security & operations**
- [ ] CORS narrowed from `*` to your storefront origin(s) in `src/lib/api-v1/response.ts`
- [ ] Security headers verified on production responses (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- [ ] Rate limits confirmed on checkout, contact, newsletter and returns
- [ ] Anonymous access verified: products and store settings readable, everything else empty (see `DEPLOYMENT.md`)
- [ ] Uptime monitor polling `/api/v1/health` every 5 minutes with alerting
- [ ] Event log reviewed after the first live orders
- [ ] `API.md` and `public/openapi.json` re-checked against the deployed API before handover

Stop point: the backend, admin panel, public API, SDK and docs are complete. Next action is yours — add the Stripe and Resend keys, then run the live pass in `DEPLOYMENT.md`.

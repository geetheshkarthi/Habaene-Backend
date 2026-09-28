# HABÄNE Public API — v1

Base URL (preview): `https://project--f525ea2d-07af-408d-b05a-bcc17b77532b-dev.lovable.app`
Base URL (production): `https://project--f525ea2d-07af-408d-b05a-bcc17b77532b.lovable.app`

All storefront endpoints are served under two equivalent prefixes:

| Prefix | Use |
|---|---|
| `/api/v1/...` | canonical, use this from your frontend |
| `/api/public/v1/...` | same handlers, guaranteed to bypass preview-site auth |

Machine-readable specification: [`public/openapi.json`](public/openapi.json), also served at `/openapi.json`.

---

## Conventions

### Response envelope

Every endpoint — success or failure — returns the same shape.

Success:

```json
{ "success": true, "data": { } }
```

Failure:

```json
{
  "success": false,
  "error": { "code": "validation_error", "message": "Invalid request body", "details": [] }
}
```

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `validation_error` | 400 | Body or query failed validation. `details` carries the Zod issues. |
| `unauthorized` | 401 | Missing or wrong credential (e.g. bad webhook signature). |
| `forbidden` | 403 | Credential valid but not permitted. |
| `not_found` | 404 | Unknown endpoint or resource. |
| `method_not_allowed` | 405 | Wrong HTTP method for the path. |
| `conflict` | 409 | State conflict (out of stock, already refunded). |
| `payload_too_large` | 413 | Body exceeds the limit. |
| `rate_limited` | 429 | Too many requests from this IP. |
| `unavailable` | 503 | A dependency (Stripe, email) is not configured. |
| `internal_error` | 500 | Unexpected server error; details are logged, not returned. |

### Authentication

Public endpoints below need **no** credential — they are guest-checkout endpoints, protected by
server-side re-pricing, RLS and rate limiting instead. Ownership-sensitive reads (order and return
lookup) require the matching customer email as proof, and no endpoint ever returns another
customer's data.

Admin operations are **not** part of this API. They run as authenticated TanStack server functions
inside the admin panel and require a signed-in user with the `admin` role.

### CORS

All v1 endpoints answer `OPTIONS` preflight and send
`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`,
`Access-Control-Allow-Headers: content-type`. Safe to call directly from your local frontend.

---

## Products

### `GET /api/v1/products`

List active, non-deleted products.

Query parameters:

| Name | Type | Default | Notes |
|---|---|---|---|
| `limit` | integer | 50 | 1–100 |
| `offset` | integer | 0 | pagination cursor |
| `category` | `system` \| `carry` \| `luggage` | – | filter |
| `search` | string | – | matches name, code and subtitle |
| `in_stock` | `true` \| `false` | – | `true` returns only `stock > 0` |

Response `200`:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "code": "HB-CAR-01",
        "name": "Meridian Day Pack 18L",
        "slug": "meridian-day-pack-18l",
        "subtitle": "Everyday commuter",
        "description": "An 18 litre commuter pack…",
        "badge": "Bestseller",
        "category": "carry",
        "price": 340,
        "vat_rate": 19,
        "stock": 40,
        "in_stock": true,
        "images": ["https://…"],
        "card_image": "https://…",
        "passport_code": null,
        "specs": { "volume": "18 L" },
        "colors": ["Ink", "Clay"],
        "sizes": ["One size"],
        "weight_kg": 1.1
      }
    ],
    "total": 6,
    "limit": 50,
    "offset": 0
  }
}
```

Errors: `validation_error` (400).

### `GET /api/v1/products/{slug}`

Single active product by slug. Response `data` is one `Product` object as above.

Errors: `not_found` (404).

---

## Orders

### `POST /api/v1/orders`

Create an order **without** payment (invoice / bank transfer / manual flows). Prices, discounts,
shipping and VAT are always recalculated server-side; any amounts sent by the client are ignored.

Request body:

```json
{
  "items": [{ "product_id": "uuid", "quantity": 1, "size": "M", "color": "Ink" }],
  "email": "customer@example.com",
  "shipping_address": {
    "first_name": "Anna", "last_name": "Weber",
    "line1": "Hauptstraße 1", "line2": "Apt 4",
    "postal_code": "10115", "city": "Berlin", "state": "BE",
    "country": "DE", "phone": "+49301234567"
  },
  "billing_address": { },
  "discount_code": "WELCOME10",
  "newsletter_opt_in": true,
  "gdpr_consent_text": "Privacy policy accepted at checkout"
}
```

Constraints: 1–50 line items, quantity 1–20 per line, `country` is a 2-letter ISO code.

Response `201`:

```json
{
  "success": true,
  "data": {
    "order_id": "uuid",
    "order_number": "HB-2026-000001",
    "status": "pending",
    "payment_status": "pending",
    "subtotal": 340,
    "discount_amount": 34,
    "shipping_cost": 0,
    "vat_rate": 19,
    "vat_amount": 48.87,
    "total": 306,
    "currency": "EUR"
  }
}
```

Errors: `validation_error` (400), `not_found` (404 — unknown product), `conflict` (409 — insufficient stock or inactive product).

### `GET /api/v1/orders/{order_number}?email={email}`

Order status lookup for the customer. The email must match the order; otherwise `not_found` is
returned (never a 403, so order numbers cannot be probed).

Response `200` `data`: order totals plus `status`, `payment_status`, `created_at`, `shipped_at`,
`delivered_at`, `shipping_carrier`, `tracking_number`, `items[]` and `withdrawal_deadline`
(14 days after delivery, per the store's configured window).

Errors: `validation_error` (400 — missing `email`), `not_found` (404).

---

## Checkout

### `POST /api/v1/checkout`

Creates the order **and** a Stripe Checkout session. Body is the `POST /orders` body plus:

| Field | Type | Notes |
|---|---|---|
| `success_url` | string (URL) | Stripe redirect after payment |
| `cancel_url` | string (URL) | Stripe redirect on abort |

Response `201`:

```json
{
  "success": true,
  "data": {
    "order_id": "uuid",
    "order_number": "HB-2026-000002",
    "checkout_url": "https://checkout.stripe.com/c/pay/…",
    "subtotal": 340, "discount_amount": 0, "shipping_cost": 0,
    "vat_rate": 19, "vat_amount": 54.29, "total": 340, "currency": "EUR",
    "support_email": "support@habane.com"
  }
}
```

Redirect the browser to `checkout_url`. The order is only marked paid by the Stripe webhook.

Errors: `validation_error` (400), `conflict` (409 — stock), `unavailable` (503 — `STRIPE_SECRET_KEY` not configured).

### `POST /api/public/stripe-webhook`

Stripe → server only. Verifies the `stripe-signature` HMAC over the raw body with a 5-minute replay
window. Handles `checkout.session.completed`, `checkout.session.expired`,
`payment_intent.payment_failed` and `charge.refunded`. Returns `401` on a bad signature and `500`
on handler failure so Stripe retries. Do not call this from a frontend.

---

## Returns

### `POST /api/v1/returns`

```json
{
  "order_number": "HB-2026-000001",
  "email": "customer@example.com",
  "type": "withdrawal",
  "reason": "Changed my mind"
}
```

`type` is `withdrawal` (14-day EU right), `defect`, or `exchange_request`. `reason` is 5–1000 chars.

Response `201` `data`: `{ id, order_number, type, status, reason, submitted_at, refund_amount, return_label_url }`.

Errors: `validation_error` (400), `not_found` (404 — no order for that number + email), `conflict` (409 — withdrawal window expired or a return already exists).

### `GET /api/v1/returns/{id}?email={email}`

Same `data` shape. Errors: `validation_error` (400), `not_found` (404).

---

## Newsletter

### `POST /api/v1/newsletter/subscribe`

(`POST /api/v1/newsletter` is an alias.)

```json
{ "email": "customer@example.com", "consent_text": "I agree to receive the HABÄNE newsletter" }
```

Response `201`: `{ "email": "…", "subscribed": true, "unsubscribe_token": "…" }`.
Re-subscribing an existing address is idempotent. The subscriber's IP is stored as consent proof.

### `POST /api/v1/newsletter/unsubscribe`

```json
{ "token": "unsubscribe-token" }
```

or `{ "email": "customer@example.com" }`. Response `200`: `{ "email": "…", "subscribed": false }`.

Errors: `validation_error` (400), `not_found` (404).

---

## Contact

### `POST /api/v1/contact`

```json
{
  "name": "Anna Weber",
  "email": "customer@example.com",
  "subject": "Question about the Atlas system",
  "message": "…"
}
```

Response `201`: `{ "id": "uuid", "received": true }`. Errors: `validation_error` (400).

---

## Discounts

### `POST /api/v1/discounts/validate`

```json
{ "code": "WELCOME10", "subtotal": 340 }
```

Response `200`:

```json
{
  "success": true,
  "data": { "valid": true, "code": "WELCOME10", "type": "percent", "value": 10, "discount_amount": 34 }
}
```

An invalid code is **not** an error — it returns `200` with `{ "valid": false, "reason": "…" }`
(expired, usage limit reached, minimum order not met, unknown code). The authoritative discount is
always recomputed at checkout.

---

## Store settings

### `GET /api/v1/store`

Public storefront configuration. Private fields (VAT ID, commercial register, returns address,
invoice prefix) are never exposed here.

```json
{
  "success": true,
  "data": {
    "brand_name": "HABÄNE",
    "company_name": "HABÄNE GmbH",
    "support_email": "support@habane.com",
    "support_phone": "+49 30 000000",
    "currency": "EUR",
    "vat_rate": 19,
    "shipping_cost": 9.9,
    "free_shipping_threshold": 150,
    "withdrawal_window_days": 14,
    "social_links": { "instagram": "https://instagram.com/habane" },
    "logo_url": null,
    "favicon_url": null
  }
}
```

---

## Health

### `GET /api/v1/health`

```json
{
  "success": true,
  "data": {
    "status": "degraded",
    "version": "1.0.0",
    "api_version": "v1",
    "timestamp": "2026-01-01T00:00:00.000Z",
    "checks": {
      "database": { "status": "ok" },
      "storage": { "status": "ok" },
      "stripe": { "status": "not_configured", "message": "STRIPE_SECRET_KEY missing" },
      "email": { "status": "not_configured", "message": "RESEND_API_KEY missing" }
    }
  }
}
```

`status` is `ok` when database and storage are healthy and Stripe and email are configured,
otherwise `degraded`. HTTP status is always `200` so uptime monitors read the body.

### `GET /api/v1/system/check`

Deeper deployment self-test. No authentication; returns no customer data — only component
statuses and aggregate counts.

```json
{
  "success": true,
  "data": {
    "database": "ok",
    "storage": "ok",
    "auth": "ok",
    "rls": "ok",
    "admin_role": "ok",
    "product_images": "ok",
    "public_api": "ok",
    "products": "ok",
    "orders": "ok",
    "customers": "ok",
    "inventory": "ok",
    "settings": "ok",
    "logs": "ok",
    "stripe": "not_configured",
    "email": "not_configured",
    "status": "degraded",
    "version": "1.0.0",
    "api_version": "v1",
    "timestamp": "2026-01-01T00:00:00.000Z",
    "details": { "rls": { "status": "ok", "info": { "private_tables_blocked": true } } }
  }
}
```

Each component is `ok`, `degraded`, `not_configured` or `error`; `details[component]` carries a
message and diagnostic counts. `status` is `error` if any component errored, `ok` when all are
`ok`, otherwise `degraded`. The `rls` check calls the database with the anonymous key and fails
if private tables such as `orders` are readable.

---


## TypeScript SDK

Copy `src/lib/api-v1/contract.ts` and `src/lib/api/sdk.ts` into your storefront (or import them
from this repo). Both are dependency-free and browser-safe.

```ts
import { HabaneClient } from "@/lib/api/sdk";

const api = new HabaneClient({ baseUrl: "https://project--f525ea2d-07af-408d-b05a-bcc17b77532b.lovable.app" });

const { items } = await api.getProducts({ category: "carry", in_stock: true });
const product = await api.getProduct("meridian-day-pack-18l");

const session = await api.createCheckout({
  items: [{ product_id: product.id, quantity: 1 }],
  email: "customer@example.com",
  shipping_address: { /* … */ },
  success_url: `${location.origin}/order/success`,
  cancel_url: `${location.origin}/cart`,
});
window.location.href = session.checkout_url!;
```

Every method returns the unwrapped `data` and throws `ApiRequestError` (with `.code`, `.status`
and `.details`) on failure, so `try/catch` is enough:

```ts
import { ApiRequestError } from "@/lib/api/sdk";

try {
  await api.subscribeNewsletter({ email });
} catch (error) {
  if (error instanceof ApiRequestError && error.code === "validation_error") { /* … */ }
}
```

Available methods: `getProducts`, `getProduct`, `createOrder`, `createCheckout`, `getOrder`,
`createReturn`, `getReturn`, `subscribeNewsletter`, `unsubscribeNewsletter`, `submitContact`,
`validateDiscount`, `getStore`, `getHealth`.

---

## Logging

Every notable action is written to the `event_logs` table and to the server console:
`checkout_started`, `checkout_completed`, `payment_failed`, `refund`, `order_created`,
`order_updated`, `product_updated`, `admin_login`, `failed_login`, `email_sent`,
`webhook_received`. Order and product updates are captured by database triggers, so they are
recorded no matter which path made the change.

/**
 * Minimal Stripe REST client + webhook signature verification.
 * Uses fetch + Web Crypto only, so it runs on the edge worker runtime.
 * Keys are read at call time; missing keys raise a clear, catchable error.
 */
import { safeEqual, hmacSha256Hex } from "./crypto-compare";

export class StripeNotConfiguredError extends Error {
  constructor(key: string) {
    super(`${key} is not configured. Add the secret to enable payments.`);
    this.name = "StripeNotConfiguredError";
  }
}

function secretKey(): string {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new StripeNotConfiguredError("STRIPE_SECRET_KEY");
  return key;
}

/** Encode a nested plain object into Stripe's bracket form-encoding. */
export function encodeForm(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [rawKey, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const key = prefix ? `${prefix}[${rawKey}]` : rawKey;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === "object") {
          parts.push(encodeForm(item as Record<string, unknown>, `${key}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof value === "object") {
      parts.push(encodeForm(value as Record<string, unknown>, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

export async function stripeRequest<T>(
  path: string,
  body?: Record<string, unknown>,
  method: "GET" | "POST" = "POST",
): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    ...(body ? { body: encodeForm(body) } : {}),
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Stripe request failed (${res.status})`);
  }
  return json;
}

export interface CheckoutSession {
  id: string;
  url: string | null;
  payment_intent: string | null;
  amount_total: number | null;
  currency: string;
  metadata: Record<string, string>;
  customer_details?: { email?: string | null; name?: string | null } | null;
}

export async function createCheckoutSession(params: {
  lineItems: Array<{ name: string; description?: string; amountCents: number; quantity: number }>;
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  shippingCents: number;
  discountCents: number;
}): Promise<CheckoutSession> {
  const body: Record<string, unknown> = {
    mode: "payment",
    customer_email: params.customerEmail,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
    payment_intent_data: { metadata: params.metadata },
    line_items: params.lineItems.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: params.currency.toLowerCase(),
        unit_amount: item.amountCents,
        product_data: { name: item.name, description: item.description },
      },
    })),
  };

  if (params.shippingCents > 0) {
    body["shipping_options"] = [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          display_name: "Shipping",
          fixed_amount: { amount: params.shippingCents, currency: params.currency.toLowerCase() },
        },
      },
    ];
  }

  return stripeRequest<CheckoutSession>("/checkout/sessions", body);
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Verify the `stripe-signature` header against the raw request body.
 * Throws when the secret is missing, the header is malformed, the timestamp is
 * stale (>5 min) or no signature matches.
 */
export async function verifyWebhook(rawBody: string, header: string | null): Promise<StripeEvent> {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) throw new StripeNotConfiguredError("STRIPE_WEBHOOK_SECRET");
  if (!header) throw new Error("Missing stripe-signature header");

  const parts = Object.fromEntries(
    header.split(",").map((piece) => {
      const [k, ...rest] = piece.split("=");
      return [k?.trim() ?? "", rest.join("=")];
    }),
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) throw new Error("Malformed stripe-signature header");

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) throw new Error("Webhook timestamp too old");

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!safeEqual(expected, signature)) throw new Error("Signature mismatch");

  return JSON.parse(rawBody) as StripeEvent;
}

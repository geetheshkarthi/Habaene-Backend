/**
 * Minimal Razorpay REST client + webhook signature verification.
 * Uses fetch + Web Crypto only, so it runs on the edge worker runtime.
 * Keys are read at call time; missing keys raise a clear, catchable error —
 * mirrors stripe.server.ts's shape so checkout.server.ts can call either
 * provider through the same pattern.
 *
 * Razorpay's checkout flow differs from Stripe's: there is no hosted
 * redirect URL. `createOrder` returns an order id that the storefront hands
 * to the client-side Razorpay Checkout widget, which itself returns a
 * payment id + signature to verify (see FRONTEND_INTEGRATION.md).
 */
import { safeEqual, hmacSha256Hex } from "./crypto-compare";

export class RazorpayNotConfiguredError extends Error {
  constructor(key: string) {
    super(`${key} is not configured. Add the secret to enable Razorpay payments.`);
    this.name = "RazorpayNotConfiguredError";
  }
}

function keyId(): string {
  const key = process.env["RAZORPAY_KEY_ID"];
  if (!key) throw new RazorpayNotConfiguredError("RAZORPAY_KEY_ID");
  return key;
}

function keySecret(): string {
  const key = process.env["RAZORPAY_KEY_SECRET"];
  if (!key) throw new RazorpayNotConfiguredError("RAZORPAY_KEY_SECRET");
  return key;
}

async function razorpayRequest<T>(
  path: string,
  body?: Record<string, unknown>,
  method: "GET" | "POST" = "POST",
): Promise<T> {
  const auth = btoa(`${keyId()}:${keySecret()}`);
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json()) as T & { error?: { description?: string } };
  if (!res.ok) {
    throw new Error(json.error?.description ?? `Razorpay request failed (${res.status})`);
  }
  return json;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
  notes: Record<string, string>;
}

/** Create a Razorpay Order for the client-side Checkout widget to open. */
export async function createOrder(params: {
  amountCents: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  return razorpayRequest<RazorpayOrder>("/orders", {
    amount: params.amountCents,
    currency: params.currency.toUpperCase(),
    receipt: params.receipt,
    notes: params.notes,
  });
}

/** Issue a refund for a captured payment. */
export async function refundPayment(paymentId: string, amountCents?: number) {
  return razorpayRequest(`/payments/${paymentId}/refund`, amountCents ? { amount: amountCents } : {});
}

/**
 * Verify a client-side Checkout success callback:
 * HMAC-SHA256("<order_id>|<payment_id>", key_secret) === signature.
 */
export async function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<boolean> {
  const expected = await hmacSha256Hex(keySecret(), `${params.orderId}|${params.paymentId}`);
  return safeEqual(expected, params.signature);
}

export interface RazorpayEvent {
  id?: string;
  event: string;
  payload: {
    payment?: { entity: Record<string, unknown> };
    order?: { entity: Record<string, unknown> };
    refund?: { entity: Record<string, unknown> };
  };
}

/**
 * Verify the `X-Razorpay-Signature` header against the raw request body.
 * Razorpay's webhook scheme is a plain HMAC-SHA256 of the raw body — no
 * timestamp component like Stripe's `t=…,v1=…` header.
 */
export async function verifyWebhook(rawBody: string, signature: string | null): Promise<RazorpayEvent> {
  const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
  if (!secret) throw new RazorpayNotConfiguredError("RAZORPAY_WEBHOOK_SECRET");
  if (!signature) throw new Error("Missing X-Razorpay-Signature header");

  const expected = await hmacSha256Hex(secret, rawBody);
  if (!safeEqual(expected, signature)) throw new Error("Signature mismatch");

  return JSON.parse(rawBody) as RazorpayEvent;
}

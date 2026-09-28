/**
 * Minimal Slice (Indian BNPL/checkout) REST client + webhook verification.
 *
 * ASSUMPTION / SCAFFOLD: Slice's exact API surface hasn't been confirmed
 * against real docs or a real account yet (no keys available at the time
 * this was written). This mirrors the same order-create / webhook-verify /
 * refund shape as stripe.server.ts and razorpay.server.ts — a payment
 * gateway with a bearer-token REST API, HMAC-signed webhooks, and a refund
 * endpoint keyed by payment id — so it's a reasonable starting point, but
 * treat every path/field name below (`SLICE_API_BASE`, `/v1/orders`,
 * request/response field names) as a placeholder to correct once real
 * Slice API docs or sandbox keys are available.
 */
import { safeEqual, hmacSha256Hex } from "./crypto-compare";

export class SliceNotConfiguredError extends Error {
  constructor(key: string) {
    super(`${key} is not configured. Add the secret to enable Slice payments.`);
    this.name = "SliceNotConfiguredError";
  }
}

const SLICE_API_BASE = process.env["SLICE_API_BASE"] || "https://api.slice.it";

function apiKey(): string {
  const key = process.env["SLICE_API_KEY"];
  if (!key) throw new SliceNotConfiguredError("SLICE_API_KEY");
  return key;
}

function apiSecret(): string {
  const key = process.env["SLICE_API_SECRET"];
  if (!key) throw new SliceNotConfiguredError("SLICE_API_SECRET");
  return key;
}

async function sliceRequest<T>(
  path: string,
  body?: Record<string, unknown>,
  method: "GET" | "POST" = "POST",
): Promise<T> {
  const res = await fetch(`${SLICE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "X-Api-Secret": apiSecret(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Slice request failed (${res.status})`);
  }
  return json;
}

export interface SliceOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
  checkout_url?: string;
}

/** Create a Slice order for checkout. */
export async function createOrder(params: {
  amountCents: number;
  currency: string;
  receipt: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  notes: Record<string, string>;
}): Promise<SliceOrder> {
  return sliceRequest<SliceOrder>("/v1/orders", {
    amount: params.amountCents,
    currency: params.currency.toUpperCase(),
    receipt: params.receipt,
    customer_email: params.customerEmail,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    notes: params.notes,
  });
}

/** Issue a refund for a captured payment. */
export async function refundPayment(paymentId: string, amountCents?: number) {
  return sliceRequest(`/v1/payments/${paymentId}/refund`, amountCents ? { amount: amountCents } : {});
}

export interface SliceEvent {
  id?: string;
  event: string;
  data: Record<string, unknown>;
}

/** Verify a Slice webhook: HMAC-SHA256 of the raw body against the signature header. */
export async function verifyWebhook(rawBody: string, signature: string | null): Promise<SliceEvent> {
  const secret = process.env["SLICE_WEBHOOK_SECRET"];
  if (!secret) throw new SliceNotConfiguredError("SLICE_WEBHOOK_SECRET");
  if (!signature) throw new Error("Missing X-Slice-Signature header");

  const expected = await hmacSha256Hex(secret, rawBody);
  if (!safeEqual(expected, signature)) throw new Error("Signature mismatch");

  return JSON.parse(rawBody) as SliceEvent;
}

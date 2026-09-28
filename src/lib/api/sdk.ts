/**
 * HABÄNE storefront SDK — typed client for the public v1 HTTP API.
 *
 * Copy this file (plus `src/lib/api-v1/contract.ts`) into your storefront, or
 * import it directly from this project:
 *
 *   import { createHabaneClient } from "@/lib/api/sdk";
 *   const api = createHabaneClient({ baseUrl: "https://shop.example.com" });
 *   const { items } = await api.getProducts({ category: "carry" });
 *
 * Every call returns the unwrapped `data` payload and throws `HabaneApiError`
 * (with `code`, `status` and optional `details`) on failure.
 */
import {
  API_BASE_PATH,
  type ApiErrorCode,
  type ApiResponse,
  type CheckoutInputBody,
  type CheckoutSessionResult,
  type ContactResult,
  type CreatedOrder,
  type DiscountValidation,
  type HealthResult,
  type NewsletterResult,
  type OrderInputBody,
  type ProductListResult,
  type PublicOrder,
  type PublicProduct,
  type PublicReturn,
  type PublicStoreSettings,
  type ReturnInputBody,
} from "@/lib/api-v1/contract";

export * from "@/lib/api-v1/contract";

export class HabaneApiError extends Error {
  constructor(
    message: string,
    public readonly code: ApiErrorCode | string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HabaneApiError";
  }
}

export interface HabaneClientOptions {
  /** Origin of the API, e.g. "https://shop.example.com". Defaults to same-origin. */
  baseUrl?: string;
  /** Path prefix. Defaults to "/api/v1". */
  basePath?: string;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export function createHabaneClient(options: HabaneClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const basePath = options.basePath ?? API_BASE_PATH;
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  async function call<T>(
    method: "GET" | "POST",
    path: string,
    init: { query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(`${baseUrl}${basePath}${path}`, baseUrl || getOrigin());
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await doFetch(url.toString(), {
        method,
        headers: {
          Accept: "application/json",
          ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
          ...options.headers,
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    } catch (error) {
      throw new HabaneApiError(
        error instanceof Error ? error.message : "Network request failed",
        "network_error",
        0,
      );
    }

    let payload: ApiResponse<T> | null = null;
    try {
      payload = (await response.json()) as ApiResponse<T>;
    } catch {
      payload = null;
    }

    if (!payload) {
      throw new HabaneApiError("Malformed API response", "internal_error", response.status);
    }
    if (!payload.success) {
      throw new HabaneApiError(
        payload.error.message,
        payload.error.code,
        response.status,
        payload.error.details,
      );
    }
    return payload.data;
  }

  return {
    /** Active catalogue, newest first. */
    getProducts: (params: {
      category?: "system" | "carry" | "luggage";
      search?: string;
      in_stock?: boolean;
      limit?: number;
      offset?: number;
    } = {}) => call<ProductListResult>("GET", "/products", { query: params }),

    /** Single active product by slug. Throws `not_found` if unavailable. */
    getProduct: (slug: string) => call<PublicProduct>("GET", `/products/${encodeURIComponent(slug)}`),

    /** Create a pending order without payment (prices recalculated server-side). */
    createOrder: (input: OrderInputBody) => call<CreatedOrder>("POST", "/orders", { body: input }),

    /** Order status lookup, guarded by the email used at checkout. */
    getOrder: (orderNumber: string, email: string) =>
      call<PublicOrder>("GET", `/orders/${encodeURIComponent(orderNumber)}`, { query: { email } }),

    /** Create the order and a Stripe Checkout session; redirect to `checkout_url`. */
    createCheckout: (input: CheckoutInputBody) =>
      call<CheckoutSessionResult>("POST", "/checkout", { body: input }),

    /** Submit a withdrawal, defect or exchange request. */
    createReturn: (input: ReturnInputBody) =>
      call<PublicReturn>("POST", "/returns", { body: input }),

    getReturn: (id: string, email: string) =>
      call<PublicReturn>("GET", `/returns/${encodeURIComponent(id)}`, { query: { email } }),

    subscribeNewsletter: (input: { email: string; consent_text?: string; source?: string }) =>
      call<NewsletterResult>("POST", "/newsletter/subscribe", { body: input }),

    unsubscribeNewsletter: (input: { token?: string; email?: string }) =>
      call<NewsletterResult>("POST", "/newsletter/unsubscribe", { body: input }),

    submitContact: (input: { name: string; email: string; subject?: string; message: string }) =>
      call<ContactResult>("POST", "/contact", { body: input }),

    /** Check a discount code against a cart subtotal before checkout. */
    validateDiscount: (code: string, subtotal: number) =>
      call<DiscountValidation>("POST", "/discounts/validate", { body: { code, subtotal } }),

    /** Public branding, currency, VAT and shipping configuration. */
    getStoreSettings: () => call<PublicStoreSettings>("GET", "/store"),

    /** Deployment health for monitoring dashboards. */
    getHealth: () => call<HealthResult>("GET", "/health"),
  };
}

export type HabaneClient = ReturnType<typeof createHabaneClient>;

function getOrigin(): string {
  return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}

/** Convenience singleton for same-origin usage. */
export const habane = createHabaneClient();

export const getProducts: HabaneClient["getProducts"] = (p) => habane.getProducts(p);
export const getProduct: HabaneClient["getProduct"] = (slug) => habane.getProduct(slug);
export const createOrder: HabaneClient["createOrder"] = (i) => habane.createOrder(i);
export const getOrder: HabaneClient["getOrder"] = (n, e) => habane.getOrder(n, e);
export const createCheckout: HabaneClient["createCheckout"] = (i) => habane.createCheckout(i);
export const createReturn: HabaneClient["createReturn"] = (i) => habane.createReturn(i);
export const getReturn: HabaneClient["getReturn"] = (id, e) => habane.getReturn(id, e);
export const subscribeNewsletter: HabaneClient["subscribeNewsletter"] = (i) =>
  habane.subscribeNewsletter(i);
export const unsubscribeNewsletter: HabaneClient["unsubscribeNewsletter"] = (i) =>
  habane.unsubscribeNewsletter(i);
export const submitContact: HabaneClient["submitContact"] = (i) => habane.submitContact(i);
export const validateDiscount: HabaneClient["validateDiscount"] = (c, s) =>
  habane.validateDiscount(c, s);
export const getStoreSettings: HabaneClient["getStoreSettings"] = () => habane.getStoreSettings();
export const getHealth: HabaneClient["getHealth"] = () => habane.getHealth();

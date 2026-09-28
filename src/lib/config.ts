/**
 * Storefront-facing configuration.
 *
 * Every value is browser-safe (no secrets) and resolved from `VITE_*` env vars
 * with sensible same-origin defaults, so the file works unchanged in this
 * project and after you copy it into your storefront.
 *
 *   .env (storefront)
 *   VITE_API_BASE_URL=https://project--f525ea2d-07af-408d-b05a-bcc17b77532b.lovable.app
 *   VITE_IMAGE_BASE_URL=https://dizsvjznpdezamjjhmrt.supabase.co/storage/v1/object/public/product-images
 */
import { API_BASE_PATH, API_VERSION } from "@/lib/api-v1/contract";

function env(key: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return value && value.length > 0 ? value : undefined;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Origin of the HABÄNE backend. Empty string = same origin as the storefront. */
export const API_BASE_URL = stripTrailingSlash(env("VITE_API_BASE_URL") ?? "");

/** Current public API version, e.g. "v1". */
export { API_VERSION };

/** Full prefix for every public endpoint, e.g. "/api/v1". */
export const API_PREFIX = API_BASE_PATH;

/** Absolute base for API calls, e.g. "https://shop.example.com/api/v1". */
export const API_URL = `${API_BASE_URL}${API_PREFIX}`;

/**
 * Public base for product imagery. Product `images[]` and `card_image` already
 * come back as absolute URLs from the API; use this only when you store bare
 * storage paths yourself.
 */
export const IMAGE_BASE_URL = stripTrailingSlash(
  env("VITE_IMAGE_BASE_URL") ??
    `${env("VITE_SUPABASE_URL") ?? ""}/storage/v1/object/public/product-images`,
);

/** Public store configuration endpoint (branding, currency, VAT, shipping). */
export const STORE_SETTINGS_ENDPOINT = `${API_URL}/store`;

/** Health endpoint for uptime monitors. */
export const HEALTH_ENDPOINT = `${API_URL}/health`;

/** Where Stripe returns the customer after checkout. */
export const CHECKOUT_SUCCESS_URL =
  env("VITE_CHECKOUT_SUCCESS_URL") ?? "/checkout/success";
export const CHECKOUT_CANCEL_URL = env("VITE_CHECKOUT_CANCEL_URL") ?? "/checkout/cancel";

/** Resolve a possibly-relative storage path to an absolute image URL. */
export function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${IMAGE_BASE_URL}/${path.replace(/^\/+/, "")}`;
}

export const config = {
  API_BASE_URL,
  API_VERSION,
  API_PREFIX,
  API_URL,
  IMAGE_BASE_URL,
  STORE_SETTINGS_ENDPOINT,
  HEALTH_ENDPOINT,
  CHECKOUT_SUCCESS_URL,
  CHECKOUT_CANCEL_URL,
} as const;

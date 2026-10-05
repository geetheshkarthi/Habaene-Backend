/**
 * Shared, browser-safe contract for the public HTTP API (v1).
 * Both the server handlers and the frontend SDK import from this file.
 */

export const API_VERSION = "v1" as const;
export const API_BASE_PATH = "/api/v1" as const;

/** Machine-readable error codes returned by every endpoint. */
export const API_ERROR_CODES = [
  "validation_error",
  "not_found",
  "conflict",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "payload_too_large",
  "method_not_allowed",
  "unavailable",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  code: ApiErrorCode | string;
  message: string;
  details?: unknown;
}

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: ApiErrorBody };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/* ---------------------------------- DTOs --------------------------------- */

export interface PublicProduct {
  id: string;
  code: string;
  name: string;
  slug: string;
  subtitle: string;
  description: string;
  badge: string | null;
  category: "system" | "carry" | "luggage";
  price: number;
  vat_rate: number;
  stock: number;
  in_stock: boolean;
  images: string[];
  card_image: string | null;
  passport_code: string | null;
  specs: unknown;
  colors: unknown;
  sizes: unknown;
  weight_kg: number;
  mood: unknown;
  pack_items: unknown;
  passport_service: string;
  passport_role: string;
  materials: string;
  care_instructions: string;
  product_story: string;
  warranty_info: string;
  blueprint: unknown;
  position: number;
}

export interface ProductListResult {
  items: PublicProduct[];
  total: number;
  limit: number;
  offset: number;
}

export interface CartItemInput {
  product_id: string;
  quantity: number;
  size?: string;
  color?: string;
}

export interface AddressInput {
  first_name: string;
  last_name: string;
  line1: string;
  line2?: string;
  postal_code: string;
  city: string;
  state?: string;
  country: string;
  phone?: string;
}

export interface OrderInputBody {
  items: CartItemInput[];
  email: string;
  shipping_address: AddressInput;
  billing_address?: AddressInput;
  discount_code?: string;
  newsletter_opt_in?: boolean;
  gdpr_consent_text?: string;
}

export interface CheckoutInputBody extends OrderInputBody {
  success_url: string;
  cancel_url: string;
  /** Which gateway to charge through. Defaults to "stripe" when omitted. */
  payment_provider?: "stripe" | "razorpay" | "slice";
}

export interface OrderTotals {
  subtotal: number;
  discount_amount: number;
  shipping_cost: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  currency: string;
}

export interface CreatedOrder extends OrderTotals {
  order_id: string;
  order_number: string;
  status: string;
  payment_status: string;
}

export interface CheckoutSessionResult extends OrderTotals {
  order_id: string;
  order_number: string;
  payment_provider: "stripe" | "razorpay" | "slice";
  /** Hosted redirect URL — set for Stripe and Slice, null for Razorpay. */
  checkout_url: string | null;
  /** Razorpay only: order id + key id for the client-side Checkout widget. */
  razorpay_order_id?: string;
  razorpay_key_id?: string;
  support_email: string;
}

export interface PublicOrderItem {
  product_id: string | null;
  product_name: string;
  product_code: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  size: string | null;
  color: string | null;
  product_image: string | null;
}

export interface PublicOrder extends OrderTotals {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  items: PublicOrderItem[];
  withdrawal_deadline: string | null;
}

export interface ReturnInputBody {
  order_number: string;
  email: string;
  type: "withdrawal" | "defect" | "exchange_request";
  reason: string;
}

export interface PublicReturn {
  id: string;
  order_number: string | null;
  type: string;
  status: string;
  reason: string;
  submitted_at: string;
  refund_amount: number | null;
  return_label_url: string | null;
}

export interface NewsletterResult {
  email: string;
  subscribed: boolean;
  unsubscribe_token?: string;
}

export interface ContactResult {
  id: string;
  received: true;
}

export interface DiscountValidation {
  valid: boolean;
  code: string;
  type?: "percent" | "fixed";
  value?: number;
  discount_amount?: number;
  reason?: string;
}

export interface PublicStoreSettings {
  brand_name: string;
  company_name: string;
  support_email: string;
  support_phone: string;
  currency: string;
  vat_rate: number;
  shipping_cost: number;
  free_shipping_threshold: number | null;
  withdrawal_window_days: number;
  social_links: Record<string, string>;
  logo_url: string | null;
  favicon_url: string | null;
}

export type HealthState = "ok" | "degraded" | "not_configured" | "error";

export interface HealthResult {
  status: "ok" | "degraded";
  version: string;
  api_version: string;
  timestamp: string;
  checks: {
    database: { status: HealthState; message?: string };
    storage: { status: HealthState; message?: string };
    stripe: { status: HealthState; message?: string };
    razorpay: { status: HealthState; message?: string };
    slice: { status: HealthState; message?: string };
    dhl: { status: HealthState; message?: string };
    delhivery: { status: HealthState; message?: string };
    email: { status: HealthState; message?: string };
  };
}

/** Components covered by GET /api/v1/system/check. */
export const SYSTEM_CHECK_COMPONENTS = [
  "database",
  "storage",
  "auth",
  "rls",
  "admin_role",
  "product_images",
  "public_api",
  "products",
  "orders",
  "customers",
  "inventory",
  "settings",
  "logs",
  "stripe",
  "razorpay",
  "slice",
  "dhl",
  "delhivery",
  "email",
] as const;

export type SystemCheckComponent = (typeof SYSTEM_CHECK_COMPONENTS)[number];

export interface SystemCheckDetail {
  status: HealthState;
  message?: string;
  info?: Record<string, unknown>;
}

export type SystemCheckResult = Record<SystemCheckComponent, HealthState> & {
  status: "ok" | "degraded" | "error";
  version: string;
  api_version: string;
  timestamp: string;
  details: Record<SystemCheckComponent, SystemCheckDetail>;
};

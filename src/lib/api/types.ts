import type { Database } from "@/integrations/supabase/types";

export type Tables = Database["public"]["Tables"];
export type Enums = Database["public"]["Enums"];

export type Product = Tables["products"]["Row"];
export type ProductInsert = Tables["products"]["Insert"];
export type ProductUpdate = Tables["products"]["Update"];
export type Order = Tables["orders"]["Row"];
export type OrderItem = Tables["order_items"]["Row"];
export type Customer = Tables["customers"]["Row"];
export type NewsletterSubscriber = Tables["newsletter_subscribers"]["Row"];
export type Return = Tables["returns"]["Row"];
export type ReturnEvent = Tables["return_events"]["Row"];
export type DiscountCode = Tables["discount_codes"]["Row"];
export type ContactMessage = Tables["contact_messages"]["Row"];
export type StoreSettings = Tables["store_settings"]["Row"];

export type ProductCategory = Enums["product_category"];
export type OrderStatus = Enums["order_status"];
export type PaymentStatus = Enums["payment_status"];
export type ReturnStatus = Enums["return_status"];
export type ReturnType = Enums["return_type"];
export type DiscountType = Enums["discount_type"];

export type OrderWithItems = Order & { order_items: OrderItem[] };
export type ReturnWithEvents = Return & { return_events: ReturnEvent[] };

export interface Address {
  first_name?: string;
  last_name?: string;
  company?: string;
  line1?: string;
  line2?: string;
  postal_code?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
}

export const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
];

export const PAYMENT_STATUSES: PaymentStatus[] = ["pending", "paid", "failed", "refunded"];

export const RETURN_STATUSES: ReturnStatus[] = [
  "submitted",
  "approved",
  "rejected",
  "items_received",
  "refunded",
];

export const RETURN_TYPES: ReturnType[] = ["withdrawal", "defect", "exchange_request"];

export const PRODUCT_CATEGORIES: ProductCategory[] = ["system", "carry", "luggage"];

export const LOW_STOCK_THRESHOLD = 5;

/** Thrown by every API helper so callers get one predictable error shape. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function unwrap<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new ApiError(result.error.message, result.error.code);
  if (result.data === null) throw new ApiError("No data returned");
  return result.data;
}

export function assertOk(result: { error: { message: string; code?: string } | null }): void {
  if (result.error) throw new ApiError(result.error.message, result.error.code);
}

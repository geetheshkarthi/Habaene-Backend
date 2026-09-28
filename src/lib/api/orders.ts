import { supabase } from "@/integrations/supabase/client";
import {
  assertOk,
  unwrap,
  type Order,
  type OrderStatus,
  type OrderWithItems,
  type PaymentStatus,
} from "./types";

export interface OrderFilters {
  search?: string;
  status?: OrderStatus | "all";
  paymentStatus?: PaymentStatus | "all";
  paymentMethod?: string | "all";
  from?: string;
  to?: string;
}

export async function getOrders(filters: OrderFilters = {}): Promise<OrderWithItems[]> {
  let query = supabase
    .from("orders")
    .select("*, order_items(*)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.paymentStatus && filters.paymentStatus !== "all") {
    query = query.eq("payment_status", filters.paymentStatus);
  }
  if (filters.paymentMethod && filters.paymentMethod !== "all") {
    query = query.eq("payment_method", filters.paymentMethod);
  }
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(
      `order_number.ilike.${term},customer_email.ilike.${term},customer_name.ilike.${term},tracking_number.ilike.${term}`,
    );
  }

  return unwrap(await query) as OrderWithItems[];
}

export async function getOrder(id: string): Promise<OrderWithItems> {
  return unwrap(
    await supabase.from("orders").select("*, order_items(*)").eq("id", id).single(),
  ) as OrderWithItems;
}

export async function getOrdersByCustomerEmail(email: string): Promise<OrderWithItems[]> {
  return unwrap(
    await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("customer_email", email)
      .order("created_at", { ascending: false }),
  ) as OrderWithItems[];
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const patch: Partial<Order> = { status };
  if (status === "shipped") patch.shipped_at = new Date().toISOString();
  if (status === "delivered") patch.delivered_at = new Date().toISOString();
  if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
  assertOk(await supabase.from("orders").update(patch).eq("id", id));
}

export async function updatePaymentStatus(id: string, payment_status: PaymentStatus): Promise<void> {
  assertOk(await supabase.from("orders").update({ payment_status }).eq("id", id));
}

export async function updateOrderShipping(
  id: string,
  input: { shipping_carrier: string | null; tracking_number: string | null },
): Promise<void> {
  assertOk(await supabase.from("orders").update(input).eq("id", id));
}

export async function updateOrderNotes(id: string, notes: string): Promise<void> {
  assertOk(await supabase.from("orders").update({ notes }).eq("id", id));
}

export async function deleteOrder(id: string): Promise<void> {
  assertOk(
    await supabase.from("orders").update({ deleted_at: new Date().toISOString() }).eq("id", id),
  );
}

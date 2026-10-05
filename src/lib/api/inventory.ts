/**
 * inventory.ts — Inventory management service.
 * Warehouses, stock movements, purchase orders, suppliers, product drops.
 */
import { supabase as supabaseClient } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;
// ─── Types ──────────────────────────────────────────────────────────────────

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: Record<string, unknown>;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  product_id: string;
  variant_id: string | null;
  warehouse_id: string | null;
  movement_type: string;
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  reason: string | null;
  reference_id: string | null;
  reference_type: string | null;
  performed_by: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
  website: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  warehouse_id: string | null;
  status: "draft" | "sent" | "partial" | "received" | "cancelled";
  expected_delivery_date: string | null;
  received_at: string | null;
  total_cost: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  ordered_quantity: number;
  received_quantity: number;
  damaged_quantity: number;
  unit_cost: number;
  created_at: string;
}

export interface ProductDrop {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "scheduled" | "active" | "sold_out" | "ended";
  launch_at: string;
  end_at: string | null;
  purchase_limit_per_customer: number | null;
  is_early_access_only: boolean;
  products: unknown[];
  created_at: string;
  updated_at: string;
}

// ─── Warehouse functions ─────────────────────────────────────────────────────

export async function getWarehouses(): Promise<Warehouse[]> {
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .order("is_default", { ascending: false })
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Warehouse[];
}

export async function createWarehouse(payload: Partial<Warehouse>): Promise<Warehouse> {
  const { data, error } = await supabase.from("warehouses").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as Warehouse;
}

export async function updateWarehouse(id: string, payload: Partial<Warehouse>): Promise<Warehouse> {
  const { data, error } = await supabase
    .from("warehouses")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Warehouse;
}

export async function deleteWarehouse(id: string): Promise<void> {
  const { error } = await supabase.from("warehouses").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Inventory movements ─────────────────────────────────────────────────────

export async function getInventoryMovements(
  productId?: string,
  limit = 50,
): Promise<InventoryMovement[]> {
  let q = supabase
    .from("inventory_movements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (productId) q = q.eq("product_id", productId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryMovement[];
}

export async function logInventoryMovement(payload: {
  product_id: string;
  variant_id?: string;
  warehouse_id?: string;
  movement_type: string;
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  reason?: string;
  reference_id?: string;
  reference_type?: string;
}): Promise<void> {
  const { error } = await supabase.from("inventory_movements").insert(payload);
  if (error) throw new Error(error.message);
}

export async function adjustProductStock(
  productId: string,
  newQuantity: number,
  reason: string,
): Promise<void> {
  const { data: prod, error: prodErr } = await supabase
    .from("products")
    .select("stock")
    .eq("id", productId)
    .single();
  if (prodErr) throw new Error(prodErr.message);
  const before = prod.stock;
  const diff = newQuantity - before;

  const { error } = await supabase
    .from("products")
    .update({ stock: newQuantity })
    .eq("id", productId);
  if (error) throw new Error(error.message);

  await logInventoryMovement({
    product_id: productId,
    movement_type: "adjustment",
    quantity_before: before,
    quantity_change: diff,
    quantity_after: newQuantity,
    reason,
  });
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

export async function getSuppliers(activeOnly = true): Promise<Supplier[]> {
  let q = supabase.from("suppliers").select("*").order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Supplier[];
}

export async function createSupplier(payload: Partial<Supplier>): Promise<Supplier> {
  const { data, error } = await supabase.from("suppliers").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as Supplier;
}

export async function updateSupplier(id: string, payload: Partial<Supplier>): Promise<Supplier> {
  const { data, error } = await supabase
    .from("suppliers")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Supplier;
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

let _poCounter = 1;
function generatePoNumber(): string {
  const year = new Date().getFullYear();
  return `PO-${year}-${String(_poCounter++).padStart(5, "0")}`;
}

export async function getPurchaseOrders(status?: string): Promise<PurchaseOrder[]> {
  let q = supabase.from("purchase_orders").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as PurchaseOrder[];
}

export async function getPurchaseOrder(
  id: string,
): Promise<{ po: PurchaseOrder; items: PurchaseOrderItem[] }> {
  const [poRes, itemsRes] = await Promise.all([
    supabase.from("purchase_orders").select("*").eq("id", id).single(),
    supabase.from("purchase_order_items").select("*").eq("po_id", id),
  ]);
  if (poRes.error) throw new Error(poRes.error.message);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  return { po: poRes.data as PurchaseOrder, items: (itemsRes.data ?? []) as PurchaseOrderItem[] };
}

export async function createPurchaseOrder(
  payload: Partial<PurchaseOrder>,
  items: Partial<PurchaseOrderItem>[],
): Promise<PurchaseOrder> {
  const po_number = generatePoNumber();
  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .insert({ ...payload, po_number })
    .select()
    .single();
  if (poErr) throw new Error(poErr.message);
  if (items.length > 0) {
    const { error: iErr } = await supabase
      .from("purchase_order_items")
      .insert(items.map((i) => ({ ...i, po_id: po.id })));
    if (iErr) throw new Error(iErr.message);
  }
  return po as PurchaseOrder;
}

export async function receivePurchaseOrder(
  poId: string,
  receivedItems: { item_id: string; received_quantity: number; damaged_quantity: number }[],
): Promise<void> {
  for (const ri of receivedItems) {
    const { data: item } = await supabase
      .from("purchase_order_items")
      .select("product_id, ordered_quantity, unit_cost")
      .eq("id", ri.item_id)
      .single();
    if (!item) continue;

    await supabase
      .from("purchase_order_items")
      .update({
        received_quantity: ri.received_quantity,
        damaged_quantity: ri.damaged_quantity,
      })
      .eq("id", ri.item_id);

    if (!item.product_id) continue;

    // Logged as "purchase" (received, sellable) and "damage" (received, not
    // sellable) separately, rather than through adjustProductStock — that
    // only ever writes movement_type "adjustment", which made the
    // inventory_overview view's damaged/returned aggregate always read zero
    // regardless of what actually came in on a purchase order.
    if (ri.received_quantity > 0) {
      const { data: prod } = await supabase
        .from("products")
        .select("stock")
        .eq("id", item.product_id)
        .single();
      if (prod) {
        const before = prod.stock;
        const after = before + ri.received_quantity;
        await supabase.from("products").update({ stock: after }).eq("id", item.product_id);
        await logInventoryMovement({
          product_id: item.product_id,
          movement_type: "purchase",
          quantity_before: before,
          quantity_change: ri.received_quantity,
          quantity_after: after,
          reason: `Purchase order ${poId}`,
          reference_id: poId,
          reference_type: "purchase_order",
        });
      }
    }
    if (ri.damaged_quantity > 0) {
      const { data: prod } = await supabase
        .from("products")
        .select("stock")
        .eq("id", item.product_id)
        .single();
      const stockNow = prod?.stock ?? 0;
      await logInventoryMovement({
        product_id: item.product_id,
        movement_type: "damage",
        quantity_before: stockNow,
        quantity_change: -ri.damaged_quantity,
        quantity_after: stockNow,
        reason: `Damaged on receipt — purchase order ${poId}`,
        reference_id: poId,
        reference_type: "purchase_order",
      });
    }
  }
  await supabase
    .from("purchase_orders")
    .update({ status: "received", received_at: new Date().toISOString() })
    .eq("id", poId);
}

// ─── Product Drops ───────────────────────────────────────────────────────────

export async function getProductDrops(status?: string): Promise<ProductDrop[]> {
  let q = supabase.from("product_drops").select("*").order("launch_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductDrop[];
}

export async function createProductDrop(payload: Partial<ProductDrop>): Promise<ProductDrop> {
  const { data, error } = await supabase.from("product_drops").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as ProductDrop;
}

export async function updateProductDrop(
  id: string,
  payload: Partial<ProductDrop>,
): Promise<ProductDrop> {
  const { data, error } = await supabase
    .from("product_drops")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ProductDrop;
}

// ─── Inventory overview (admin Inventory page) ──────────────────────────────

export interface InventoryOverviewRow {
  id: string;
  code: string;
  name: string;
  category: string;
  badge: string | null;
  weight_kg: number;
  stock: number;
  price: number;
  cost_price: number;
  is_active: boolean;
  card_image: string | null;
  damaged_returned: number;
  incoming: number;
  inventory_value: number;
}

export interface InventoryOverviewFilters {
  search?: string;
  category?: string;
  stockFilter?: "all" | "low" | "out";
}

export async function getInventoryOverview(
  filters: InventoryOverviewFilters = {},
): Promise<InventoryOverviewRow[]> {
  let q = supabase.from("inventory_overview").select("*").order("name");
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    q = q.or(`name.ilike.${term},code.ilike.${term}`);
  }
  if (filters.category && filters.category !== "all") q = q.eq("category", filters.category);
  if (filters.stockFilter === "out") q = q.eq("stock", 0);
  if (filters.stockFilter === "low") q = q.gt("stock", 0).lt("stock", 10);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryOverviewRow[];
}

// ─── Stock alerts ────────────────────────────────────────────────────────────

export interface StockAlert {
  id: string;
  name: string;
  stock: number;
  level: "critical" | "low" | "ok";
}

export async function getLowStockProducts(threshold = 10): Promise<StockAlert[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, stock")
    .is("deleted_at", null)
    .eq("is_active", true)
    .lt("stock", threshold)
    .order("stock");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; name: string; stock: number }[]).map((p) => ({
    ...p,
    level: p.stock === 0 ? "critical" : p.stock <= 3 ? "critical" : "low",
  }));
}

// ─── Back in Stock ───────────────────────────────────────────────────────────

export async function getBackInStockRequests(productId?: string) {
  let q = supabase
    .from("back_in_stock_requests")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (productId) q = q.eq("product_id", productId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function registerBackInStockRequest(
  email: string,
  productId: string,
  variantId?: string,
): Promise<void> {
  const { error } = await supabase
    .from("back_in_stock_requests")
    .upsert(
      { email, product_id: productId, variant_id: variantId ?? null, is_active: true },
      { onConflict: "email,product_id" },
    );
  if (error) throw new Error(error.message);
}

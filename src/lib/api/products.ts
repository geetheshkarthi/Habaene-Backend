import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrap, type Product, type ProductInsert, type ProductUpdate } from "./types";

export interface ProductFilters {
  search?: string;
  category?: string;
  stock?: "all" | "in" | "low" | "out";
  activeOnly?: boolean;
  includeDeleted?: boolean;
}

/** Admin-facing product list (RLS grants full read to admins). */
export async function getProducts(filters: ProductFilters = {}): Promise<Product[]> {
  let query = supabase.from("products").select("*").order("created_at", { ascending: false });

  if (!filters.includeDeleted) query = query.is("deleted_at", null);
  if (filters.activeOnly) query = query.eq("is_active", true);
  if (filters.category && filters.category !== "all") {
    query = query.eq("category", filters.category as Product["category"]);
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(`name.ilike.${term},code.ilike.${term},slug.ilike.${term}`);
  }
  if (filters.stock === "out") query = query.eq("stock", 0);
  if (filters.stock === "low") query = query.gt("stock", 0).lt("stock", 5);
  if (filters.stock === "in") query = query.gte("stock", 5);

  return unwrap(await query);
}

export async function getProduct(id: string): Promise<Product> {
  return unwrap(await supabase.from("products").select("*").eq("id", id).single());
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase.from("products").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createProduct(input: ProductInsert): Promise<Product> {
  return unwrap(await supabase.from("products").insert(input).select("*").single());
}

export async function updateProduct(id: string, input: ProductUpdate): Promise<Product> {
  return unwrap(await supabase.from("products").update(input).eq("id", id).select("*").single());
}

/** Soft delete — keeps order-item history intact. */
export async function deleteProduct(id: string): Promise<void> {
  assertOk(
    await supabase
      .from("products")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", id),
  );
}

export async function restoreProduct(id: string): Promise<void> {
  assertOk(await supabase.from("products").update({ deleted_at: null }).eq("id", id));
}

export async function setProductActive(id: string, isActive: boolean): Promise<void> {
  assertOk(await supabase.from("products").update({ is_active: isActive }).eq("id", id));
}

export async function setProductStock(id: string, stock: number): Promise<void> {
  assertOk(await supabase.from("products").update({ stock }).eq("id", id));
}

export async function setProductImages(
  id: string,
  images: string[],
  cardImage: string | null,
): Promise<void> {
  assertOk(
    await supabase.from("products").update({ images, card_image: cardImage }).eq("id", id),
  );
}

export async function bulkSetActive(ids: string[], isActive: boolean): Promise<void> {
  if (ids.length === 0) return;
  assertOk(await supabase.from("products").update({ is_active: isActive }).in("id", ids));
}

export async function bulkDelete(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  assertOk(
    await supabase
      .from("products")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .in("id", ids),
  );
}

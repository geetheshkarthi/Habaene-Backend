import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_CATEGORIES } from "./types";

/**
 * Product categories live in the `product_category` database enum. Falls back to
 * the built-in three if the helper functions aren't installed yet.
 */
export async function getProductCategories(): Promise<string[]> {
  const { data, error } = await supabase.rpc("list_product_categories");
  if (error || !Array.isArray(data) || data.length === 0) return [...PRODUCT_CATEGORIES];
  return data;
}

/** Adds a category (admin only) and returns its stored name. */
export async function addProductCategory(name: string): Promise<string> {
  const { data, error } = await supabase.rpc("add_product_category", { p_name: name });
  if (error) {
    if (/could not find the function|schema cache/i.test(error.message)) {
      throw new Error("Adding categories isn't set up in the database yet — run the categories SQL first.");
    }
    throw new Error(error.message);
  }
  return String(data);
}

import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrap, type DiscountCode } from "./types";
import type { Tables } from "./types";

export async function getDiscountCodes(search?: string): Promise<DiscountCode[]> {
  let query = supabase
    .from("discount_codes")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (search?.trim()) query = query.ilike("code", `%${search.trim()}%`);
  return unwrap(await query);
}

export async function createDiscountCode(
  input: Tables["discount_codes"]["Insert"],
): Promise<DiscountCode> {
  return unwrap(
    await supabase
      .from("discount_codes")
      .insert({ ...input, code: input.code.trim().toUpperCase() })
      .select("*")
      .single(),
  );
}

export async function updateDiscountCode(
  id: string,
  input: Tables["discount_codes"]["Update"],
): Promise<void> {
  assertOk(await supabase.from("discount_codes").update(input).eq("id", id));
}

export async function setDiscountActive(id: string, is_active: boolean): Promise<void> {
  assertOk(await supabase.from("discount_codes").update({ is_active }).eq("id", id));
}

export async function deleteDiscountCode(id: string): Promise<void> {
  assertOk(
    await supabase
      .from("discount_codes")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", id),
  );
}

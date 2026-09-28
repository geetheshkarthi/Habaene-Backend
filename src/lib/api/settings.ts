import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrap, type StoreSettings } from "./types";

export async function getStoreSettings(): Promise<StoreSettings> {
  return unwrap(await supabase.from("store_settings").select("*").limit(1).single());
}

export async function updateStoreSettings(
  id: string,
  input: Partial<StoreSettings>,
): Promise<void> {
  assertOk(await supabase.from("store_settings").update(input).eq("id", id));
}

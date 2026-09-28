import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrap, type ContactMessage } from "./types";

export async function getMessages(): Promise<ContactMessage[]> {
  const query = supabase.from("contact_messages").select("*").order("created_at", { ascending: false });
  return unwrap(await query);
}

export async function deleteMessage(id: string): Promise<void> {
  assertOk(await supabase.from("contact_messages").delete().eq("id", id));
}

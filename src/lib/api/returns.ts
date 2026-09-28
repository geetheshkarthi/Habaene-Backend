import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrap, type Return, type ReturnStatus, type ReturnWithEvents } from "./types";

export async function getReturns(status?: ReturnStatus | "all"): Promise<ReturnWithEvents[]> {
  let query = supabase
    .from("returns")
    .select("*, return_events(*)")
    .order("submitted_at", { ascending: false });
  if (status && status !== "all") query = query.eq("status", status);
  return unwrap(await query) as ReturnWithEvents[];
}

export async function getReturn(id: string): Promise<ReturnWithEvents> {
  return unwrap(
    await supabase.from("returns").select("*, return_events(*)").eq("id", id).single(),
  ) as ReturnWithEvents;
}

export async function updateReturn(id: string, input: Partial<Return>): Promise<void> {
  assertOk(await supabase.from("returns").update(input).eq("id", id));
}

export async function setReturnStatus(id: string, status: ReturnStatus): Promise<void> {
  const patch: Partial<Return> = { status };
  if (status === "items_received") patch.items_received_at = new Date().toISOString();
  assertOk(await supabase.from("returns").update(patch).eq("id", id));
}

export async function addReturnNote(id: string, notes: string): Promise<void> {
  assertOk(await supabase.from("returns").update({ notes }).eq("id", id));
}

export async function countPendingReturns(): Promise<number> {
  const { count, error } = await supabase
    .from("returns")
    .select("id", { count: "exact", head: true })
    .in("status", ["submitted", "approved", "items_received"]);
  if (error) throw error;
  return count ?? 0;
}

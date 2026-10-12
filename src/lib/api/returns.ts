import { supabase } from "@/integrations/supabase/client";
import {
  assertOk,
  unwrap,
  type Return,
  type ReturnStatus,
  type ReturnType,
  type ReturnWithEvents,
} from "./types";

export interface ReturnFilters {
  status?: ReturnStatus | "all";
  search?: string;
}

export async function getReturns(filters: ReturnFilters | ReturnStatus | "all" = {}): Promise<ReturnWithEvents[]> {
  // Accept the old (status-only) call shape too, so existing callers don't break.
  const { status, search } =
    typeof filters === "string" ? { status: filters, search: undefined } : filters;

  let query = supabase
    .from("returns")
    .select("*, return_events(*)")
    .order("submitted_at", { ascending: false });
  if (status && status !== "all") query = query.eq("status", status);
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`order_number.ilike.${term},customer_email.ilike.${term}`);
  }
  return unwrap(await query) as ReturnWithEvents[];
}

export interface CreateReturnInput {
  order_id: string;
  order_number: string | null;
  customer_email: string;
  type: ReturnType;
  reason: string;
}

/** Admin-initiated return for a customer who requested one by phone/email rather
 * than through the storefront's self-service flow. */
export async function createReturn(input: CreateReturnInput): Promise<Return> {
  return unwrap(
    await supabase
      .from("returns")
      .insert({ ...input, status: "submitted" })
      .select()
      .single(),
  ) as Return;
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

export async function markReturnRefunded(id: string, amount: number): Promise<void> {
  assertOk(
    await supabase
      .from("returns")
      .update({
        status: "refunded",
        refund_amount: amount,
        refund_at: new Date().toISOString(),
      })
      .eq("id", id),
  );
}

export async function countPendingReturns(): Promise<number> {
  const { count, error } = await supabase
    .from("returns")
    .select("id", { count: "exact", head: true })
    .in("status", ["submitted", "approved", "items_received"]);
  if (error) throw error;
  return count ?? 0;
}

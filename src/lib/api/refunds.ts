/**
 * refunds.ts — Refund read models (list + stats). Issuing a refund goes
 * through checkout.server.ts's refundOrder (server-only, provider-aware —
 * see commerce.functions.ts's refundOrderFn), not this file.
 */
import { supabase as supabaseClient } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

export interface Refund {
  id: string;
  order_id: string;
  return_id: string | null;
  type: "full" | "partial" | "product_level";
  amount: number;
  reason: string | null;
  stripe_refund_id: string | null;
  status: "pending" | "processing" | "succeeded" | "failed";
  processed_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function getRefunds(orderId?: string): Promise<Refund[]> {
  let q = supabase.from("refunds").select("*").order("created_at", { ascending: false });
  if (orderId) q = q.eq("order_id", orderId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Refund[];
}

export async function getRefundStats(start: string, end: string) {
  const { data, error } = await supabase
    .from("refunds")
    .select("amount, status, type")
    .eq("status", "succeeded")
    .gte("created_at", start)
    .lte("created_at", end);
  if (error) throw new Error(error.message);

  const items = data ?? [];
  return {
    total_refunded: items.reduce((s: number, r: any) => s + Number(r.amount), 0),
    count: items.length,
    full_refunds: items.filter((r: any) => r.type === "full").length,
    partial_refunds: items.filter((r: any) => r.type === "partial").length,
  };
}


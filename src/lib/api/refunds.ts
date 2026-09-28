/**
 * refunds.ts — Refund management service.
 * Full refunds, partial refunds, product-level refunds via Stripe.
 */
import { supabase as supabaseClient } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;
import Stripe from "stripe";

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

export async function issueRefund(payload: {
  orderId: string;
  amount: number;
  type: "full" | "partial" | "product_level";
  reason?: string;
  returnId?: string;
  stripeSecretKey: string;
}): Promise<Refund> {
  // Get order to find payment intent
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("payment_intent_id, payment_status, total")
    .eq("id", payload.orderId)
    .single();
  if (orderErr) throw new Error(orderErr.message);
  if (!order.payment_intent_id) throw new Error("Order has no payment intent — cannot refund");

  // Insert pending refund
  const { data: refund, error: refundErr } = await supabase
    .from("refunds")
    .insert({
      order_id: payload.orderId,
      return_id: payload.returnId ?? null,
      type: payload.type,
      amount: payload.amount,
      reason: payload.reason ?? null,
      status: "processing",
    })
    .select()
    .single();
  if (refundErr) throw new Error(refundErr.message);

  try {
    // Issue refund via Stripe
    const stripe = new Stripe(payload.stripeSecretKey, { apiVersion: "2025-02-24.acacia" as any });
    const stripeRefund = await stripe.refunds.create({
      payment_intent: order.payment_intent_id,
      amount: Math.round(payload.amount * 100), // Convert to cents
      reason: "requested_by_customer",
    });

    // Update refund record with Stripe response
    const { data: updated, error: updateErr } = await supabase
      .from("refunds")
      .update({
        stripe_refund_id: stripeRefund.id,
        status: stripeRefund.status === "succeeded" ? "succeeded" : "processing",
        gateway_response: stripeRefund as unknown as Record<string, unknown>,
      })
      .eq("id", refund.id)
      .select()
      .single();
    if (updateErr) throw new Error(updateErr.message);

    // Update order payment_status if full refund
    if (payload.type === "full") {
      await supabase
        .from("orders")
        .update({ payment_status: "refunded", status: "returned" })
        .eq("id", payload.orderId);
    } else {
      await supabase
        .from("orders")
        .update({ partial_refund_amount: payload.amount, refund_reason: payload.reason ?? null })
        .eq("id", payload.orderId);
    }

    return updated as Refund;
  } catch (err) {
    // Mark refund as failed
    await supabase
      .from("refunds")
      .update({ status: "failed" })
      .eq("id", refund.id);
    throw err;
  }
}

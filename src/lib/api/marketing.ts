/**
 * marketing.ts — Marketing, Discounts & Customer Engagement service.
 * Promotions, campaigns, wishlists, abandoned carts, early access, subscribers.
 */
import { supabase as supabaseClient } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Promotion {
  id: string;
  name: string;
  description: string | null;
  type: "percent" | "fixed" | "free_shipping" | "buy_x_get_y";
  value: number | null;
  status: "draft" | "scheduled" | "active" | "paused" | "expired";
  start_at: string | null;
  end_at: string | null;
  applies_to: string;
  product_ids: string[] | null;
  category_ids: string[] | null;
  min_order: number | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  start_at: string | null;
  end_at: string | null;
  budget: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CampaignStats {
  campaign: Campaign;
  revenue: number;
  orders: number;
  customers: number;
}

export interface WishlistItem {
  id: string;
  customer_id: string | null;
  customer_email: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  created_at: string;
}

export interface AbandonedCart {
  session_id: string;
  customer_email: string | null;
  cart_total: number | null;
  cart_items: unknown;
  last_activity: string;
  checkout_stage: string | null;
  utm_source: string | null;
}

export interface EarlyAccessEntry {
  id: string;
  email: string;
  customer_id: string | null;
  product_id: string | null;
  drop_id: string | null;
  source: string;
  is_invited: boolean;
  invited_at: string | null;
  created_at: string;
}

export interface SubscriberExtended {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  subscribed_at: string;
  unsubscribed_at: string | null;
  source: string;
  interests: string[];
  channel: string;
  consent_text: string;
}

// ─── Promotions ───────────────────────────────────────────────────────────────

export async function getPromotions(status?: string): Promise<Promotion[]> {
  let q = supabase.from("promotions").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Promotion[];
}

export async function createPromotion(payload: Partial<Promotion>): Promise<Promotion> {
  const { data, error } = await supabase.from("promotions").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as Promotion;
}

export async function updatePromotion(id: string, payload: Partial<Promotion>): Promise<Promotion> {
  const { data, error } = await supabase.from("promotions").update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as Promotion;
}

export async function deletePromotion(id: string): Promise<void> {
  const { error } = await supabase.from("promotions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

export async function getCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Campaign[];
}

export async function getCampaignStats(
  campaignId: string,
  start: string,
  end: string
): Promise<CampaignStats | null> {
  const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
  if (!campaign) return null;

  const { data: orders } = await supabase
    .from("orders")
    .select("total, customer_email")
    .eq("utm_campaign", campaign.utm_campaign)
    .eq("payment_status", "paid")
    .is("deleted_at", null)
    .gte("created_at", start)
    .lte("created_at", end);

  const ordersData = orders ?? [];
  const revenue = ordersData.reduce((s: number, o: any) => s + Number(o.total), 0);
  const uniqueCustomers = new Set(ordersData.map((o: any) => o.customer_email)).size;

  return {
    campaign: campaign as Campaign,
    revenue,
    orders: ordersData.length,
    customers: uniqueCustomers,
  };
}

export async function createCampaign(payload: Partial<Campaign>): Promise<Campaign> {
  const { data, error } = await supabase.from("campaigns").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as Campaign;
}

export async function updateCampaign(id: string, payload: Partial<Campaign>): Promise<Campaign> {
  const { data, error } = await supabase.from("campaigns").update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as Campaign;
}

// ─── Wishlists ────────────────────────────────────────────────────────────────

export async function getWishlists(productId?: string): Promise<WishlistItem[]> {
  let q = supabase.from("wishlists").select("*").order("created_at", { ascending: false });
  if (productId) q = q.eq("product_id", productId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as WishlistItem[];
}

export async function getWishlistByProduct(): Promise<{ product_id: string; product_name: string; count: number }[]> {
  const { data, error } = await supabase
    .from("wishlists")
    .select("product_id, product_name");
  if (error) throw new Error(error.message);
  const counts: Record<string, { product_id: string; product_name: string; count: number }> = {};
  for (const w of data ?? []) {
    if (!counts[w.product_id]) counts[w.product_id] = { product_id: w.product_id, product_name: w.product_name, count: 0 };
    counts[w.product_id]!.count++;
  }
  return Object.values(counts).sort((a, b) => b.count - a.count);
}

// ─── Abandoned Carts ──────────────────────────────────────────────────────────

export async function getAbandonedCarts(start?: string, end?: string): Promise<AbandonedCart[]> {
  // Find sessions that had checkout_started but NOT checkout_completed
  let q = supabase
    .from("cart_events")
    .select("session_id, customer_email, cart_total, cart_items, created_at, checkout_stage, utm_source")
    .eq("event_type", "checkout_abandoned")
    .order("created_at", { ascending: false });
  if (start) q = q.gte("created_at", start);
  if (end) q = q.lte("created_at", end);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    session_id: r.session_id,
    customer_email: r.customer_email,
    cart_total: r.cart_total,
    cart_items: r.cart_items,
    last_activity: r.created_at,
    checkout_stage: r.checkout_stage,
    utm_source: r.utm_source,
  }));
}

export async function getAbandonedCartStats(start: string, end: string) {
  const [abandoned, recovered] = await Promise.all([
    supabase
      .from("cart_events")
      .select("cart_total")
      .eq("event_type", "checkout_abandoned")
      .gte("created_at", start)
      .lte("created_at", end),
    supabase
      .from("cart_events")
      .select("cart_total")
      .eq("event_type", "checkout_completed")
      .gte("created_at", start)
      .lte("created_at", end),
  ]);

  const abandonedCarts = abandoned.data ?? [];
  const recoveredCarts = recovered.data ?? [];
  const lostRevenue = abandonedCarts.reduce((s: number, c: any) => s + Number(c.cart_total ?? 0), 0);
  const recoveredRevenue = recoveredCarts.reduce((s: number, c: any) => s + Number(c.cart_total ?? 0), 0);
  const recoveryRate =
    abandonedCarts.length + recoveredCarts.length > 0
      ? Math.round((recoveredCarts.length / (abandonedCarts.length + recoveredCarts.length)) * 100)
      : 0;

  return {
    abandoned_count: abandonedCarts.length,
    recovered_count: recoveredCarts.length,
    lost_revenue: lostRevenue,
    recovered_revenue: recoveredRevenue,
    recovery_rate: recoveryRate,
  };
}

// ─── Early Access ─────────────────────────────────────────────────────────────

export async function getEarlyAccessList(dropId?: string): Promise<EarlyAccessEntry[]> {
  let q = supabase.from("early_access_list").select("*").order("created_at", { ascending: false });
  if (dropId) q = q.eq("drop_id", dropId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as EarlyAccessEntry[];
}

export async function inviteEarlyAccess(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from("early_access_list")
    .update({ is_invited: true, invited_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(error.message);
}

export async function addToEarlyAccess(
  email: string,
  dropId?: string,
  productId?: string
): Promise<void> {
  const { error } = await supabase.from("early_access_list").upsert(
    { email, drop_id: dropId ?? null, product_id: productId ?? null },
    { onConflict: "email,drop_id" }
  );
  if (error) throw new Error(error.message);
}

// ─── Subscribers ─────────────────────────────────────────────────────────────

export async function getSubscribers(activeOnly = true): Promise<SubscriberExtended[]> {
  let q = supabase
    .from("newsletter_subscribers")
    .select("*")
    .order("subscribed_at", { ascending: false });
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as SubscriberExtended[];
}

export async function getSubscriberStats() {
  const [total, active] = await Promise.all([
    supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true }),
    supabase
      .from("newsletter_subscribers")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ]);
  return {
    total: total.count ?? 0,
    active: active.count ?? 0,
    inactive: (total.count ?? 0) - (active.count ?? 0),
  };
}

export async function unsubscribeSubscriber(id: string): Promise<void> {
  const { error } = await supabase
    .from("newsletter_subscribers")
    .update({ is_active: false, unsubscribed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Coupon management (extended) ────────────────────────────────────────────

export async function getCouponUsage(code: string) {
  const [{ data: disc }] = await Promise.all([
    supabase.from("discount_codes").select("*").eq("code", code.toUpperCase()).single(),
  ]);
  const { data: orders } = await supabase
    .from("orders")
    .select("id, total, created_at, customer_email")
    .eq("discount_code", code.toUpperCase())
    .eq("payment_status", "paid")
    .order("created_at", { ascending: false });

  return {
    coupon: disc,
    usage_orders: orders ?? [],
    total_revenue: (orders ?? []).reduce((s: number, o: any) => s + Number(o.total), 0),
    unique_customers: new Set((orders ?? []).map((o: any) => o.customer_email)).size,
  };
}

// ─── Track events (called from storefront) ───────────────────────────────────

export async function trackCartEvent(payload: {
  session_id: string;
  event_type: "add_to_cart" | "remove_from_cart" | "checkout_started" | "checkout_abandoned" | "checkout_completed";
  customer_email?: string;
  product_id?: string;
  product_name?: string;
  quantity?: number;
  unit_price?: number;
  cart_total?: number;
  cart_items?: unknown;
  checkout_stage?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  referrer?: string;
}): Promise<void> {
  const { error } = await supabase.from("cart_events").insert(payload);
  if (error) throw new Error(error.message);
}

export async function trackProductView(payload: {
  product_id: string;
  session_id?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  country_code?: string;
}): Promise<void> {
  const { error } = await supabase.from("product_views").insert(payload);
  if (error) console.warn("Failed to track product view:", error.message);
}

export async function trackSearch(query: string, resultsCount: number, sessionId?: string): Promise<void> {
  const { error } = await supabase
    .from("search_logs")
    .insert({ query, results_count: resultsCount, session_id: sessionId ?? null });
  if (error) console.warn("Failed to track search:", error.message);
}

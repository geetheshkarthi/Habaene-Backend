/**
 * analytics.ts — Production analytics service.
 * All aggregations use PostgreSQL RPCs (SUM, COUNT, AVG, GROUP BY).
 * ZERO in-memory data processing.
 */
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ─── Shared date helpers ───────────────────────────────────────────────────

export type DatePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year"
  | "custom";

export interface DateRange {
  start: string; // ISO
  end: string; // ISO
}

export function resolveDateRange(preset: DatePreset, custom?: DateRange): DateRange {
  const now = new Date();

  const startOf = (unit: "day" | "month" | "year" | "quarter") => {
    const d = new Date(now);
    if (unit === "day") {
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (unit === "month") {
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (unit === "year") {
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (unit === "quarter") {
      const q = Math.floor(d.getMonth() / 3);
      d.setMonth(q * 3, 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    return d;
  };

  const sub = (d: Date, days: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() - days);
    return r;
  };

  switch (preset) {
    case "today":
      return { start: startOf("day").toISOString(), end: now.toISOString() };
    case "yesterday": {
      const s = sub(startOf("day"), 1);
      return { start: s.toISOString(), end: startOf("day").toISOString() };
    }
    case "last_7_days":
      return { start: sub(now, 7).toISOString(), end: now.toISOString() };
    case "last_30_days":
      return { start: sub(now, 30).toISOString(), end: now.toISOString() };
    case "last_90_days":
      return { start: sub(now, 90).toISOString(), end: now.toISOString() };
    case "this_month":
      return { start: startOf("month").toISOString(), end: now.toISOString() };
    case "last_month": {
      const s = new Date(startOf("month"));
      s.setMonth(s.getMonth() - 1);
      return { start: s.toISOString(), end: startOf("month").toISOString() };
    }
    case "this_quarter":
      return { start: startOf("quarter").toISOString(), end: now.toISOString() };
    case "last_quarter": {
      const s = new Date(startOf("quarter"));
      s.setMonth(s.getMonth() - 3);
      return { start: s.toISOString(), end: startOf("quarter").toISOString() };
    }
    case "this_year":
      return { start: startOf("year").toISOString(), end: now.toISOString() };
    case "last_year": {
      const s = new Date(startOf("year"));
      s.setFullYear(s.getFullYear() - 1);
      return { start: s.toISOString(), end: startOf("year").toISOString() };
    }
    case "custom":
      if (!custom) throw new Error("Custom date range requires start and end");
      return custom;
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  revenue: number;
  gross_sales: number;
  net_revenue: number;
  orders: number;
  units_sold: number;
  aov: number;
  discount_total: number;
  vat_total: number;
  shipping_revenue: number;
  refund_value: number;
  cancellation_value: number;
  new_customers: number;
}

export interface PeriodComparison {
  current: AnalyticsSummary;
  previous: AnalyticsSummary;
  revenue_growth: number; // percentage
  orders_growth: number; // percentage
}

export interface RevenuePoint {
  period: string;
  revenue: number;
  orders: number;
  units: number;
}

export interface ProductAnalyticsRow {
  product_id: string;
  product_name: string;
  units_sold: number;
  revenue: number;
  refund_count: number;
  avg_rating: number;
  view_count: number;
}

export interface CustomerAnalytics {
  total_customers: number;
  new_customers: number;
  returning_customers: number;
  avg_spend: number;
  avg_orders_per_customer: number;
}

export interface GeographicRow {
  country_code: string;
  revenue: number;
  orders: number;
  customers: number;
  aov: number;
}

export interface FinancialSummary {
  gross_sales: number;
  discounts: number;
  net_sales: number;
  shipping_revenue: number;
  taxes_collected: number;
  total_revenue: number;
  refunds_total: number;
  net_revenue: number;
}

export interface FunnelAnalytics {
  product_views: number;
  add_to_cart: number;
  checkout_started: number;
  checkout_abandoned: number;
  purchases: number;
  payment_failures: number;
}

export interface DayOfWeekAnalytics {
  day_of_week: number;
  revenue: number;
  orders: number;
  units_sold: number;
  aov: number;
}

export interface DashboardStats {
  today: AnalyticsSummary;
  yesterday: AnalyticsSummary;
  last_7_days: AnalyticsSummary;
  last_30_days: AnalyticsSummary;
  last_90_days: AnalyticsSummary;
  this_month: AnalyticsSummary;
  this_year: AnalyticsSummary;
  all_time: AnalyticsSummary;
  pending_returns: number;
  low_stock_count: number;
  open_orders: number;
  active_subscribers: number;
  pending_reviews: number;
}

// ─── Service functions ──────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await db.rpc("dashboard_stats");
  if (error) throw new Error(`Dashboard stats failed: ${error.message}`);
  return data as DashboardStats;
}

export async function getAnalyticsSummary(range: DateRange): Promise<AnalyticsSummary> {
  const { data, error } = await db.rpc("analytics_summary", {
    p_start: range.start,
    p_end: range.end,
  });
  if (error) throw new Error(`Analytics summary failed: ${error.message}`);
  return data as AnalyticsSummary;
}

export async function getPeriodComparison(range: DateRange): Promise<PeriodComparison> {
  const { data, error } = await db.rpc("analytics_period_comparison", {
    p_start: range.start,
    p_end: range.end,
  });
  if (error) throw new Error(`Period comparison failed: ${error.message}`);
  const result = data as { current: AnalyticsSummary; previous: AnalyticsSummary };
  const revenueGrowth =
    result.previous.revenue === 0
      ? result.current.revenue > 0
        ? 100
        : 0
      : Math.round(
          ((result.current.revenue - result.previous.revenue) / result.previous.revenue) * 100 * 10,
        ) / 10;
  const ordersGrowth =
    result.previous.orders === 0
      ? result.current.orders > 0
        ? 100
        : 0
      : Math.round(
          ((result.current.orders - result.previous.orders) / result.previous.orders) * 100 * 10,
        ) / 10;
  return { ...result, revenue_growth: revenueGrowth, orders_growth: ordersGrowth };
}

export async function getRevenueSeries(
  range: DateRange,
  granularity: "hour" | "day" | "week" | "month" = "day",
): Promise<RevenuePoint[]> {
  const { data, error } = await db.rpc("analytics_revenue_series", {
    p_start: range.start,
    p_end: range.end,
    p_granularity: granularity,
  });
  if (error) throw new Error(`Revenue series failed: ${error.message}`);
  return (data as RevenuePoint[]) ?? [];
}

export async function getDayOfWeekAnalytics(
  range: DateRange,
  dayOfWeek: number, // 0=Sunday, 6=Saturday
): Promise<DayOfWeekAnalytics> {
  const { data, error } = await db.rpc("analytics_day_of_week", {
    p_start: range.start,
    p_end: range.end,
    p_day_of_week: dayOfWeek,
  });
  if (error) throw new Error(`Day-of-week analytics failed: ${error.message}`);
  return data as DayOfWeekAnalytics;
}

export async function getAllDaysOfWeekAnalytics(range: DateRange): Promise<DayOfWeekAnalytics[]> {
  const results = await Promise.all(
    [0, 1, 2, 3, 4, 5, 6].map((day) => getDayOfWeekAnalytics(range, day)),
  );
  return results;
}

export async function getProductAnalytics(
  range: DateRange,
  limit = 20,
  offset = 0,
): Promise<ProductAnalyticsRow[]> {
  const { data, error } = await db.rpc("analytics_products", {
    p_start: range.start,
    p_end: range.end,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(`Product analytics failed: ${error.message}`);
  return (data as ProductAnalyticsRow[]) ?? [];
}

export async function getCustomerAnalytics(range: DateRange): Promise<CustomerAnalytics> {
  const { data, error } = await db.rpc("analytics_customers", {
    p_start: range.start,
    p_end: range.end,
  });
  if (error) throw new Error(`Customer analytics failed: ${error.message}`);
  return data as CustomerAnalytics;
}

export async function getGeographicAnalytics(range: DateRange): Promise<GeographicRow[]> {
  const { data, error } = await db.rpc("analytics_geographic", {
    p_start: range.start,
    p_end: range.end,
  });
  if (error) throw new Error(`Geographic analytics failed: ${error.message}`);
  return (data as GeographicRow[]) ?? [];
}

export async function getFinancialAnalytics(range: DateRange): Promise<FinancialSummary> {
  const { data, error } = await db.rpc("analytics_financial", {
    p_start: range.start,
    p_end: range.end,
  });
  if (error) throw new Error(`Financial analytics failed: ${error.message}`);
  return data as FinancialSummary;
}

export async function getFunnelAnalytics(range: DateRange): Promise<FunnelAnalytics> {
  const { data, error } = await db.rpc("analytics_funnel", {
    p_start: range.start,
    p_end: range.end,
  });
  if (error) throw new Error(`Funnel analytics failed: ${error.message}`);
  return data as FunnelAnalytics;
}

/** Helper to compute percentage change between two values */
export function growthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Preset label map */
export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7_days: "Last 7 Days",
  last_30_days: "Last 30 Days",
  last_90_days: "Last 90 Days",
  this_month: "This Month",
  last_month: "Last Month",
  this_quarter: "This Quarter",
  last_quarter: "Last Quarter",
  this_year: "This Year",
  last_year: "Last Year",
  custom: "Custom Range",
};

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Weekday label for a Postgres DOW index (0 = Sunday). */
export function dayName(index: number): string {
  return DAY_NAMES[index] ?? "";
}

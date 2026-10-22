import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "./analytics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface ProductInterestRow {
  product_id: string;
  name: string;
  category: string;
  views: number;
  visitors: number;
  add_to_cart: number;
  avg_seconds: number | null;
  units_sold: number;
}

export interface PageTypeRow {
  page_type: string;
  visits: number;
  avg_seconds: number;
  avg_scroll: number;
  total_seconds: number;
}

export interface PagePathRow {
  path: string;
  page_type: string;
  visits: number;
  avg_seconds: number;
  avg_scroll: number;
  quick_exits: number;
}

export interface PagesInsights {
  visits: number;
  avg_seconds: number;
  avg_scroll: number;
  by_type: PageTypeRow[];
  by_path: PagePathRow[];
}

export interface LabelCount {
  label: string;
  visits: number;
}

export interface VisitorsInsights {
  sessions: number;
  visits: number;
  avg_seconds: number;
  devices: LabelCount[];
  countries: LabelCount[];
  sources: LabelCount[];
  hours: { hour: number; visits: number }[];
  daily: { day: string; visits: number }[];
}

async function call<T>(fn: string, range: DateRange, fallback: T): Promise<T> {
  const { data, error } = await db.rpc(fn, { p_start: range.start, p_end: range.end });
  if (error) {
    if (/could not find the function|schema cache/i.test(error.message)) {
      throw new Error("Visitor Insights isn't set up in the database yet — run the Visitor Insights SQL first.");
    }
    throw new Error(error.message);
  }
  return (data as T) ?? fallback;
}

export const getProductInterest = (range: DateRange) =>
  call<ProductInterestRow[]>("insights_products", range, []);

export const getPagesInsights = (range: DateRange) =>
  call<PagesInsights>("insights_pages", range, {
    visits: 0,
    avg_seconds: 0,
    avg_scroll: 0,
    by_type: [],
    by_path: [],
  });

export const getVisitorsInsights = (range: DateRange) =>
  call<VisitorsInsights>("insights_visitors", range, {
    sessions: 0,
    visits: 0,
    avg_seconds: 0,
    devices: [],
    countries: [],
    sources: [],
    hours: [],
    daily: [],
  });

/** 84 -> "1m 24s" */
export function fmtDuration(seconds: number | null | undefined): string {
  const s = Math.round(Number(seconds) || 0);
  if (s <= 0) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export const PAGE_TYPE_LABELS: Record<string, string> = {
  home: "Homepage",
  shop: "Shop",
  product: "Product pages",
  checkout: "Checkout",
  journal: "Journal",
  info: "Info pages (about, shipping, …)",
  other: "Other",
};

/**
 * seo.ts — SEO Management service.
 * Page metadata, redirects, sitemap, search analytics.
 */
import { supabase as supabaseClient } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

// ─── Types ──────────────────────────────────────────────────────────────────

export type SeoEntityType = "homepage" | "product" | "category" | "collection" | "article" | "page" | "faq";

export interface PageSeo {
  id: string;
  entity_type: SeoEntityType;
  entity_id: string | null;
  entity_slug: string | null;
  seo_title: string | null;
  meta_description: string | null;
  focus_keyword: string | null;
  canonical_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  twitter_image: string | null;
  schema_markup: Record<string, unknown> | null;
  meta_robots: string;
  is_indexed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Redirect {
  id: string;
  from_path: string;
  to_path: string;
  type: "301" | "302";
  is_active: boolean;
  hit_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SearchAnalyticsRow {
  query: string;
  count: number;
  avg_results: number;
  led_to_purchase_count: number;
}

export interface SeoIssue {
  type: "missing_title" | "missing_description" | "missing_alt" | "no_index" | "missing_canonical";
  entity_type: SeoEntityType;
  entity_id: string | null;
  entity_slug: string | null;
  severity: "critical" | "warning" | "info";
  message: string;
}

// ─── Page SEO ─────────────────────────────────────────────────────────────────

export async function getPageSeo(entityType: SeoEntityType, entityId?: string, entitySlug?: string): Promise<PageSeo | null> {
  let q = supabase.from("page_seo").select("*").eq("entity_type", entityType);
  if (entityId) q = q.eq("entity_id", entityId);
  if (entitySlug) q = q.eq("entity_slug", entitySlug);
  const { data, error } = await q.single();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data as PageSeo | null;
}

export async function getAllPageSeo(entityType?: SeoEntityType): Promise<PageSeo[]> {
  let q = supabase.from("page_seo").select("*").order("entity_type").order("created_at");
  if (entityType) q = q.eq("entity_type", entityType);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as PageSeo[];
}

export async function upsertPageSeo(
  entityType: SeoEntityType,
  entityId: string | null,
  payload: Partial<PageSeo>
): Promise<PageSeo> {
  const existing = await getPageSeo(entityType, entityId ?? undefined);
  if (existing) {
    const { data, error } = await supabase
      .from("page_seo")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as PageSeo;
  }
  const { data, error } = await supabase
    .from("page_seo")
    .insert({ entity_type: entityType, entity_id: entityId, ...payload })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PageSeo;
}

// ─── Redirects ────────────────────────────────────────────────────────────────

export async function getRedirects(activeOnly = false): Promise<Redirect[]> {
  let q = supabase.from("redirects").select("*").order("created_at", { ascending: false });
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Redirect[];
}

export async function createRedirect(from: string, to: string, type: "301" | "302" = "301"): Promise<Redirect> {
  const { data, error } = await supabase
    .from("redirects")
    .insert({ from_path: from, to_path: to, type })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Redirect;
}

export async function updateRedirect(id: string, payload: Partial<Redirect>): Promise<Redirect> {
  const { data, error } = await supabase.from("redirects").update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as Redirect;
}

export async function deleteRedirect(id: string): Promise<void> {
  const { error } = await supabase.from("redirects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function resolveRedirect(path: string): Promise<Redirect | null> {
  const { data, error } = await supabase
    .from("redirects")
    .select("*")
    .eq("from_path", path)
    .eq("is_active", true)
    .single();
  if (error && error.code !== "PGRST116") return null;
  if (data) {
    // Increment hit count (fire and forget)
    supabase
      .from("redirects")
      .update({ hit_count: data.hit_count + 1 })
      .eq("id", data.id)
      .then(() => {});
  }
  return data as Redirect | null;
}

// ─── Search Analytics ─────────────────────────────────────────────────────────

export async function getSearchAnalytics(
  limit = 50,
  start?: string,
  end?: string
): Promise<SearchAnalyticsRow[]> {
  let q = supabase
    .from("search_logs")
    .select("query, results_count, led_to_purchase");
  if (start) q = q.gte("created_at", start);
  if (end) q = q.lte("created_at", end);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // Aggregate by query
  const agg: Record<string, SearchAnalyticsRow> = {};
  for (const row of data ?? []) {
    if (!agg[row.query]) {
      agg[row.query] = { query: row.query, count: 0, avg_results: 0, led_to_purchase_count: 0 };
    }
    agg[row.query]!.count++;
    agg[row.query]!.avg_results += row.results_count;
    if (row.led_to_purchase) agg[row.query]!.led_to_purchase_count++;
  }

  return Object.values(agg)
    .map((r) => ({ ...r, avg_results: Math.round(r.avg_results / r.count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ─── SEO Dashboard ────────────────────────────────────────────────────────────

export async function getSeoStats() {
  const [products, articles, pages, seoEntries, redirects] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("is_active", true),
    supabase.from("journal_articles").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("cms_pages").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("page_seo").select("id, seo_title, meta_description, is_indexed, entity_type"),
    supabase.from("redirects").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  const seoData = seoEntries.data ?? [];
  const missingTitle = seoData.filter((s: any) => !s.seo_title).length;
  const missingDesc = seoData.filter((s: any) => !s.meta_description).length;
  const noindex = seoData.filter((s: any) => !s.is_indexed).length;

  return {
    indexed_pages: (products.count ?? 0) + (articles.count ?? 0) + (pages.count ?? 0),
    seo_configured: seoData.length,
    missing_title: missingTitle,
    missing_description: missingDesc,
    noindex_pages: noindex,
    active_redirects: redirects.count ?? 0,
  };
}

export async function getSeoIssues(): Promise<SeoIssue[]> {
  const [products, articles] = await Promise.all([
    supabase.from("products").select("id, slug, seo_title, seo_description").is("deleted_at", null).eq("is_active", true),
    supabase.from("journal_articles").select("id, slug, seo_title, seo_description").eq("status", "published"),
  ]);

  const issues: SeoIssue[] = [];

  for (const p of products.data ?? []) {
    if (!p.seo_title) issues.push({ type: "missing_title", entity_type: "product", entity_id: p.id, entity_slug: p.slug, severity: "warning", message: `Product "${p.slug}" has no SEO title` });
    if (!p.seo_description) issues.push({ type: "missing_description", entity_type: "product", entity_id: p.id, entity_slug: p.slug, severity: "warning", message: `Product "${p.slug}" has no meta description` });
  }

  for (const a of articles.data ?? []) {
    if (!a.seo_title) issues.push({ type: "missing_title", entity_type: "article", entity_id: a.id, entity_slug: a.slug, severity: "warning", message: `Article "${a.slug}" has no SEO title` });
    if (!a.seo_description) issues.push({ type: "missing_description", entity_type: "article", entity_id: a.id, entity_slug: a.slug, severity: "warning", message: `Article "${a.slug}" has no meta description` });
  }

  return issues;
}

// ─── Sitemap generation ───────────────────────────────────────────────────────

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

export async function generateSitemapEntries(baseUrl: string): Promise<SitemapEntry[]> {
  const [products, articles, pages] = await Promise.all([
    supabase.from("products").select("slug, updated_at").is("deleted_at", null).eq("is_active", true),
    supabase.from("journal_articles").select("slug, updated_at").eq("status", "published"),
    supabase.from("cms_pages").select("slug, updated_at").eq("status", "published"),
  ]);

  const entries: SitemapEntry[] = [{ loc: baseUrl, changefreq: "daily", priority: 1.0 }];

  for (const p of products.data ?? []) {
    entries.push({ loc: `${baseUrl}/products/${p.slug}`, lastmod: p.updated_at.slice(0, 10), changefreq: "weekly", priority: 0.8 });
  }
  for (const a of articles.data ?? []) {
    entries.push({ loc: `${baseUrl}/journal/${a.slug}`, lastmod: a.updated_at.slice(0, 10), changefreq: "monthly", priority: 0.6 });
  }
  for (const pg of pages.data ?? []) {
    entries.push({ loc: `${baseUrl}/${pg.slug}`, lastmod: pg.updated_at.slice(0, 10), changefreq: "monthly", priority: 0.5 });
  }

  return entries;
}

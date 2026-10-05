/**
 * cms.ts — Content Management System service.
 * Homepage, pages, navigation, announcements, journal, FAQs, reviews, media library.
 */
import { supabase as supabaseClient } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CmsPage {
  id: string;
  slug: string;
  title: string;
  content: Record<string, unknown>;
  page_type: string;
  status: "draft" | "review" | "approved" | "scheduled" | "published" | "archived";
  seo_title: string | null;
  seo_description: string | null;
  og_image: string | null;
  canonical_url: string | null;
  meta_robots: string;
  published_at: string | null;
  scheduled_at: string | null;
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HeroSlide {
  image_url: string;
  eyebrow: string;
  heading: string;
  sub: string;
}

export interface CmsHomepage {
  id: string;
  hero_heading: string | null;
  hero_subheading: string | null;
  hero_cta_text: string | null;
  hero_cta_url: string | null;
  hero_images: string[];
  hero_video_url: string | null;
  hero_slides: HeroSlide[];
  homepage_reviews_count: number;
  featured_product_ids: string[];
  featured_collection_ids: string[];
  promotional_sections: unknown[];
  editorial_sections: unknown[];
  faq_section: unknown[];
  newsletter_section: Record<string, unknown>;
  updated_at: string;
}

export interface NavigationMenu {
  id: string;
  name: string;
  location: "header" | "header_mega" | "footer" | "footer_secondary";
  items: NavigationItem[];
  updated_at: string;
}

export interface NavigationItem {
  id: string;
  label: string;
  url: string;
  target?: "_blank" | "_self";
  children?: NavigationItem[];
  position: number;
}

export interface AnnouncementBar {
  id: string;
  message: string;
  link_text: string | null;
  link_url: string | null;
  background_color: string;
  text_color: string;
  is_active: boolean;
  start_at: string | null;
  end_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface JournalArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  featured_image: string | null;
  gallery: string[];
  video_url: string | null;
  author_id: string | null;
  author_name: string | null;
  category: string | null;
  tags: string[];
  status: "draft" | "review" | "approved" | "scheduled" | "published" | "archived";
  seo_title: string | null;
  seo_description: string | null;
  og_image: string | null;
  canonical_url: string | null;
  meta_robots: string;
  published_at: string | null;
  scheduled_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  product_id: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  product_id: string;
  products?: { name: string; code: string } | null;
  customer_id: string | null;
  order_id: string | null;
  customer_name: string;
  customer_email: string;
  rating: number;
  title: string | null;
  body: string;
  status: "pending" | "approved" | "rejected" | "hidden" | "featured";
  is_verified_purchase: boolean;
  admin_reply: string | null;
  admin_reply_at: string | null;
  photos: string[];
  videos: string[];
  helpful_count: number;
  created_at: string;
  updated_at: string;
}

export interface MediaItem {
  id: string;
  filename: string;
  original_filename: string;
  url: string;
  type: "image" | "video" | "document";
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  caption: string | null;
  folder: string;
  tags: string[];
  uploaded_by: string | null;
  created_at: string;
}

// ─── Homepage ────────────────────────────────────────────────────────────────

export async function getHomepage(): Promise<CmsHomepage | null> {
  const { data, error } = await supabase.from("cms_homepage").select("*").single();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data as CmsHomepage | null;
}

export async function updateHomepage(payload: Partial<CmsHomepage>): Promise<CmsHomepage> {
  const { data, error } = await supabase
    .from("cms_homepage")
    .update(payload)
    .eq("singleton", true)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CmsHomepage;
}

// ─── Pages ───────────────────────────────────────────────────────────────────

export async function getCmsPages(status?: string): Promise<CmsPage[]> {
  let q = supabase.from("cms_pages").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as CmsPage[];
}

export async function getCmsPage(slug: string): Promise<CmsPage | null> {
  const { data, error } = await supabase.from("cms_pages").select("*").eq("slug", slug).single();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data as CmsPage | null;
}

export async function createCmsPage(payload: Partial<CmsPage>): Promise<CmsPage> {
  const { data, error } = await supabase.from("cms_pages").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as CmsPage;
}

export async function updateCmsPage(id: string, payload: Partial<CmsPage>): Promise<CmsPage> {
  // Save version before update
  const { data: existing } = await supabase.from("cms_pages").select("*").eq("id", id).single();
  if (existing) {
    const { data: maxVer } = await supabase
      .from("content_versions")
      .select("version_number")
      .eq("table_name", "cms_pages")
      .eq("record_id", id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();
    await supabase.from("content_versions").insert({
      table_name: "cms_pages",
      record_id: id,
      version_number: (maxVer?.version_number ?? 0) + 1,
      content: existing,
    });
  }
  // Handle publish status
  if (payload.status === "published" && !payload.published_at) {
    payload.published_at = new Date().toISOString();
  }
  const { data, error } = await supabase.from("cms_pages").update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as CmsPage;
}

export async function deleteCmsPage(id: string): Promise<void> {
  const { error } = await supabase.from("cms_pages").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getContentVersions(tableName: string, recordId: string) {
  const { data, error } = await supabase
    .from("content_versions")
    .select("*")
    .eq("table_name", tableName)
    .eq("record_id", recordId)
    .order("version_number", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export async function getNavigationMenus(): Promise<NavigationMenu[]> {
  const { data, error } = await supabase.from("navigation_menus").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as NavigationMenu[];
}

export async function getNavigationMenu(location: string): Promise<NavigationMenu | null> {
  const { data, error } = await supabase
    .from("navigation_menus")
    .select("*")
    .eq("location", location)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data as NavigationMenu | null;
}

export async function updateNavigationMenu(id: string, items: NavigationItem[]): Promise<NavigationMenu> {
  const { data, error } = await supabase
    .from("navigation_menus")
    .update({ items })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as NavigationMenu;
}

// ─── Announcement Bars ────────────────────────────────────────────────────────

export async function getAnnouncementBars(activeOnly = false): Promise<AnnouncementBar[]> {
  let q = supabase.from("announcement_bars").select("*").order("position");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AnnouncementBar[];
}

export async function createAnnouncementBar(payload: Partial<AnnouncementBar>): Promise<AnnouncementBar> {
  const { data, error } = await supabase.from("announcement_bars").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as AnnouncementBar;
}

export async function updateAnnouncementBar(id: string, payload: Partial<AnnouncementBar>): Promise<AnnouncementBar> {
  const { data, error } = await supabase.from("announcement_bars").update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as AnnouncementBar;
}

export async function deleteAnnouncementBar(id: string): Promise<void> {
  const { error } = await supabase.from("announcement_bars").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Journal ─────────────────────────────────────────────────────────────────

export async function getJournalArticles(status?: string): Promise<JournalArticle[]> {
  let q = supabase.from("journal_articles").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as JournalArticle[];
}

export async function getJournalArticle(slug: string): Promise<JournalArticle | null> {
  const { data, error } = await supabase.from("journal_articles").select("*").eq("slug", slug).single();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data as JournalArticle | null;
}

export async function createJournalArticle(payload: Partial<JournalArticle>): Promise<JournalArticle> {
  const { data, error } = await supabase.from("journal_articles").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as JournalArticle;
}

export async function updateJournalArticle(id: string, payload: Partial<JournalArticle>): Promise<JournalArticle> {
  if (payload.status === "published" && !payload.published_at) {
    payload.published_at = new Date().toISOString();
  }
  const { data, error } = await supabase.from("journal_articles").update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as JournalArticle;
}

export async function deleteJournalArticle(id: string): Promise<void> {
  const { error } = await supabase.from("journal_articles").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

export async function getFaqItems(category?: string, productId?: string): Promise<FaqItem[]> {
  let q = supabase.from("faq_items").select("*").order("category").order("position");
  if (category) q = q.eq("category", category);
  if (productId) q = q.eq("product_id", productId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as FaqItem[];
}

export async function createFaqItem(payload: Partial<FaqItem>): Promise<FaqItem> {
  const { data, error } = await supabase.from("faq_items").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as FaqItem;
}

export async function updateFaqItem(id: string, payload: Partial<FaqItem>): Promise<FaqItem> {
  const { data, error } = await supabase.from("faq_items").update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as FaqItem;
}

export async function deleteFaqItem(id: string): Promise<void> {
  const { error } = await supabase.from("faq_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reorderFaqItems(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from("faq_items").update({ position: idx }).eq("id", id)
    )
  );
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export async function getReviews(status?: string, productId?: string): Promise<Review[]> {
  let q = supabase
    .from("reviews")
    .select("*, products(name, code)")
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  if (productId) q = q.eq("product_id", productId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Review[];
}

export async function updateReviewStatus(
  id: string,
  status: Review["status"],
  adminReply?: string
): Promise<Review> {
  const payload: Partial<Review> = { status };
  if (adminReply !== undefined) {
    payload.admin_reply = adminReply;
    payload.admin_reply_at = new Date().toISOString();
  }
  const { data, error } = await supabase.from("reviews").update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as Review;
}

export async function deleteReview(id: string): Promise<void> {
  const { error } = await supabase.from("reviews").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Media Library ────────────────────────────────────────────────────────────

export async function getMediaItems(folder?: string, type?: string): Promise<MediaItem[]> {
  let q = supabase
    .from("media_library")
    .select("*")
    .order("created_at", { ascending: false });
  if (folder) q = q.eq("folder", folder);
  if (type) q = q.eq("type", type);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaItem[];
}

export async function addMediaItem(payload: Partial<MediaItem>): Promise<MediaItem> {
  const { data, error } = await supabase.from("media_library").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as MediaItem;
}

export async function updateMediaItem(id: string, payload: Partial<MediaItem>): Promise<MediaItem> {
  const { data, error } = await supabase.from("media_library").update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as MediaItem;
}

export async function deleteMediaItem(id: string): Promise<void> {
  const { error } = await supabase.from("media_library").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Legal Pages ─────────────────────────────────────────────────────────────
export const LEGAL_PAGE_SLUGS = [
  "impressum",
  "privacy-policy",
  "terms-and-conditions",
  "shipping-policy",
  "returns-policy",
  "refund-policy",
  "warranty",
  "cookie-policy",
  "right-of-withdrawal",
] as const;

export type LegalSlug = (typeof LEGAL_PAGE_SLUGS)[number];

export async function getLegalPage(slug: LegalSlug): Promise<CmsPage | null> {
  return getCmsPage(slug);
}

export async function upsertLegalPage(
  slug: LegalSlug,
  title: string,
  content: Record<string, unknown>
): Promise<CmsPage> {
  const existing = await getLegalPage(slug);
  if (existing) {
    return updateCmsPage(existing.id, { content, title });
  }
  return createCmsPage({ slug, title, content, page_type: "legal", status: "published" });
}

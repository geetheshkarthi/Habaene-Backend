-- =============================================================================
-- HABÄNE — STEP 2: Tables + RPCs
-- Run AFTER fix_enums_first.sql has already been committed.
-- All statements use CREATE OR REPLACE / IF NOT EXISTS — safe to re-run.
-- =============================================================================

-- ============ REQUIRED ENUMS (safe: wrapped in DO block) ============
DO $$ BEGIN
  CREATE TYPE public.article_status AS ENUM ('draft','review','approved','scheduled','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.promotion_status AS ENUM ('draft','scheduled','active','paused','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.coupon_type AS ENUM ('percent','fixed','free_shipping','buy_x_get_y','product','category','first_order');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inventory_movement_type AS ENUM ('sale','return','adjustment','purchase','damage','transfer','initial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.webhook_status AS ENUM ('active','inactive','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.redirect_type AS ENUM ('301','302');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.review_status AS ENUM ('pending','approved','rejected','hidden','featured');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.media_type AS ENUM ('image','video','document');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.drop_status AS ENUM ('draft','scheduled','active','sold_out','ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.purchase_order_status AS ENUM ('draft','sent','partial','received','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.customer_segment AS ENUM ('new','returning','vip','high_value','one_time','frequent','inactive','at_risk');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.refund_type AS ENUM ('full','partial','product_level');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM ('new_order','payment','low_stock','out_of_stock','new_customer','new_review','return_request','refund');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- NOTE: ALTER TYPE ADD VALUE statements are intentionally NOT here.
-- They were run separately in fix_enums_first.sql (already committed).

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = ANY(roles));
$$;

-- ============ REFUNDS TABLE ============
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  return_id uuid REFERENCES public.returns(id) ON DELETE SET NULL,
  type public.refund_type NOT NULL DEFAULT 'full',
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  reason text,
  stripe_refund_id text,
  gateway_response jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','succeeded','failed')),
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds(status);
GRANT SELECT, INSERT, UPDATE ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins manage refunds" ON public.refunds FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ PRODUCT VARIANTS ============
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text NOT NULL UNIQUE,
  color text,
  size text,
  color_hex text,
  price numeric(10,2),
  compare_at_price numeric(10,2),
  cost_price numeric(10,2),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  weight_kg numeric(8,3),
  images text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON public.product_variants(sku);
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public reads active variants" ON public.product_variants FOR SELECT TO anon, authenticated USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage variants" ON public.product_variants FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ PRODUCT VIEWS ============
CREATE TABLE IF NOT EXISTS public.product_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  session_id text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ip_address text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  country_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_views_product ON public.product_views(product_id);
CREATE INDEX IF NOT EXISTS idx_product_views_created ON public.product_views(created_at DESC);
GRANT INSERT ON public.product_views TO anon;
GRANT SELECT, INSERT ON public.product_views TO authenticated;
GRANT ALL ON public.product_views TO service_role;
ALTER TABLE public.product_views ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Anyone can record product view" ON public.product_views FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins read product views" ON public.product_views FOR SELECT TO authenticated USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ CART EVENTS ============
CREATE TABLE IF NOT EXISTS public.cart_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_email text,
  event_type text NOT NULL CHECK (event_type IN ('add_to_cart','remove_from_cart','checkout_started','checkout_abandoned','checkout_completed')),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity integer,
  unit_price numeric(10,2),
  cart_total numeric(10,2),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cart_events_session ON public.cart_events(session_id);
CREATE INDEX IF NOT EXISTS idx_cart_events_type ON public.cart_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cart_events_created ON public.cart_events(created_at DESC);
GRANT INSERT ON public.cart_events TO anon;
GRANT SELECT, INSERT ON public.cart_events TO authenticated;
GRANT ALL ON public.cart_events TO service_role;
ALTER TABLE public.cart_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Anyone can record cart events" ON public.cart_events FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins read cart events" ON public.cart_events FOR SELECT TO authenticated USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ REVIEWS ============
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  body text NOT NULL,
  status public.review_status NOT NULL DEFAULT 'pending',
  is_verified_purchase boolean NOT NULL DEFAULT false,
  admin_reply text,
  admin_reply_at timestamptz,
  helpful_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON public.reviews(status);
GRANT INSERT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public reads approved reviews" ON public.reviews FOR SELECT TO anon, authenticated USING (status IN ('approved','featured'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Anyone can submit review" ON public.reviews FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage reviews" ON public.reviews FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ WAREHOUSES ============
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins manage warehouses" ON public.warehouses FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO public.warehouses (name, code, is_default) VALUES ('Main Warehouse', 'WH-MAIN', true) ON CONFLICT (code) DO NOTHING;

-- ============ INVENTORY MOVEMENTS ============
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  movement_type public.inventory_movement_type NOT NULL,
  quantity_before integer NOT NULL,
  quantity_change integer NOT NULL,
  quantity_after integer NOT NULL,
  reason text,
  reference_id uuid,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_movements_product ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_created ON public.inventory_movements(created_at DESC);
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins manage inventory movements" ON public.inventory_movements FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ CMS HOMEPAGE ============
CREATE TABLE IF NOT EXISTS public.cms_homepage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  hero_heading text,
  hero_subheading text,
  hero_cta_text text,
  hero_cta_url text,
  hero_images text[] DEFAULT '{}',
  featured_product_ids uuid[] DEFAULT '{}',
  promotional_sections jsonb DEFAULT '[]'::jsonb,
  editorial_sections jsonb DEFAULT '[]'::jsonb,
  faq_section jsonb DEFAULT '[]'::jsonb,
  newsletter_section jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cms_homepage TO anon, authenticated;
GRANT INSERT, UPDATE ON public.cms_homepage TO authenticated;
GRANT ALL ON public.cms_homepage TO service_role;
ALTER TABLE public.cms_homepage ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public reads homepage" ON public.cms_homepage FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage homepage" ON public.cms_homepage FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO public.cms_homepage (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;

-- ============ NAVIGATION MENUS ============
CREATE TABLE IF NOT EXISTS public.navigation_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NOT NULL UNIQUE CHECK (location IN ('header','header_mega','footer','footer_secondary')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.navigation_menus TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.navigation_menus TO authenticated;
GRANT ALL ON public.navigation_menus TO service_role;
ALTER TABLE public.navigation_menus ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public reads navigation" ON public.navigation_menus FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage navigation" ON public.navigation_menus FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO public.navigation_menus (name, location, items) VALUES
  ('Header Menu', 'header', '[]'::jsonb),
  ('Footer Menu', 'footer', '[]'::jsonb)
ON CONFLICT (location) DO NOTHING;

-- ============ ANNOUNCEMENT BARS ============
CREATE TABLE IF NOT EXISTS public.announcement_bars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  link_text text,
  link_url text,
  background_color text NOT NULL DEFAULT '#000000',
  text_color text NOT NULL DEFAULT '#ffffff',
  is_active boolean NOT NULL DEFAULT true,
  start_at timestamptz,
  end_at timestamptz,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.announcement_bars TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.announcement_bars TO authenticated;
GRANT ALL ON public.announcement_bars TO service_role;
ALTER TABLE public.announcement_bars ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public reads active announcements" ON public.announcement_bars FOR SELECT TO anon, authenticated USING (is_active = true AND (start_at IS NULL OR start_at <= now()) AND (end_at IS NULL OR end_at >= now()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage announcements" ON public.announcement_bars FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ JOURNAL ARTICLES ============
CREATE TABLE IF NOT EXISTS public.journal_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text,
  content text NOT NULL DEFAULT '',
  featured_image text,
  gallery text[] DEFAULT '{}',
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  category text,
  tags text[] DEFAULT '{}',
  status public.article_status NOT NULL DEFAULT 'draft',
  seo_title text,
  seo_description text,
  og_image text,
  canonical_url text,
  schema_markup jsonb,
  meta_robots text NOT NULL DEFAULT 'index,follow',
  published_at timestamptz,
  scheduled_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_journal_slug ON public.journal_articles(slug);
CREATE INDEX IF NOT EXISTS idx_journal_status ON public.journal_articles(status);
GRANT SELECT ON public.journal_articles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.journal_articles TO authenticated;
GRANT ALL ON public.journal_articles TO service_role;
ALTER TABLE public.journal_articles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public reads published articles" ON public.journal_articles FOR SELECT TO anon, authenticated USING (status = 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage articles" ON public.journal_articles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ CMS PAGES ============
CREATE TABLE IF NOT EXISTS public.cms_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_type text NOT NULL DEFAULT 'static',
  status public.article_status NOT NULL DEFAULT 'draft',
  seo_title text,
  seo_description text,
  og_image text,
  canonical_url text,
  meta_robots text NOT NULL DEFAULT 'index,follow',
  published_at timestamptz,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cms_pages_slug ON public.cms_pages(slug);
CREATE INDEX IF NOT EXISTS idx_cms_pages_status ON public.cms_pages(status);
GRANT SELECT ON public.cms_pages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cms_pages TO authenticated;
GRANT ALL ON public.cms_pages TO service_role;
ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public reads published pages" ON public.cms_pages FOR SELECT TO anon, authenticated USING (status = 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage pages" ON public.cms_pages FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ FAQ ITEMS ============
CREATE TABLE IF NOT EXISTS public.faq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.faq_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.faq_items TO authenticated;
GRANT ALL ON public.faq_items TO service_role;
ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public reads active FAQs" ON public.faq_items FOR SELECT TO anon, authenticated USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage FAQs" ON public.faq_items FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ MEDIA LIBRARY ============
CREATE TABLE IF NOT EXISTS public.media_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  original_filename text NOT NULL,
  url text NOT NULL,
  type public.media_type NOT NULL DEFAULT 'image',
  size_bytes bigint,
  width integer,
  height integer,
  alt_text text,
  caption text,
  folder text NOT NULL DEFAULT 'general',
  tags text[] DEFAULT '{}',
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_folder ON public.media_library(folder);
GRANT SELECT ON public.media_library TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.media_library TO authenticated;
GRANT ALL ON public.media_library TO service_role;
ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public reads media" ON public.media_library FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage media" ON public.media_library FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ REDIRECTS ============
CREATE TABLE IF NOT EXISTS public.redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_path text NOT NULL UNIQUE,
  to_path text NOT NULL,
  type public.redirect_type NOT NULL DEFAULT '301',
  is_active boolean NOT NULL DEFAULT true,
  hit_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_redirects_from ON public.redirects(from_path);
GRANT SELECT ON public.redirects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.redirects TO authenticated;
GRANT ALL ON public.redirects TO service_role;
ALTER TABLE public.redirects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public reads redirects" ON public.redirects FOR SELECT TO anon, authenticated USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage redirects" ON public.redirects FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ SEO METADATA ============
CREATE TABLE IF NOT EXISTS public.page_seo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('homepage','product','category','collection','article','page','faq')),
  entity_id uuid,
  entity_slug text,
  seo_title text,
  meta_description text,
  focus_keyword text,
  canonical_url text,
  og_title text,
  og_description text,
  og_image text,
  twitter_title text,
  twitter_description text,
  twitter_image text,
  schema_markup jsonb,
  meta_robots text NOT NULL DEFAULT 'index,follow',
  is_indexed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);
GRANT SELECT ON public.page_seo TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.page_seo TO authenticated;
GRANT ALL ON public.page_seo TO service_role;
ALTER TABLE public.page_seo ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public reads SEO metadata" ON public.page_seo FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage SEO" ON public.page_seo FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ NOTIFICATIONS ============
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.notification_type NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(recipient_id, is_read) WHERE is_read = false;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Service role manages notifications" ON public.notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ WEBHOOKS ============
CREATE TABLE IF NOT EXISTS public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text,
  status public.webhook_status NOT NULL DEFAULT 'active',
  last_triggered_at timestamptz,
  last_response_code integer,
  failure_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO authenticated;
GRANT ALL ON public.webhooks TO service_role;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins manage webhooks" ON public.webhooks FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ EMAIL TEMPLATES ============
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text,
  variables jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins manage email templates" ON public.email_templates FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO public.email_templates (slug, name, subject, body_html) VALUES
  ('order_confirmation', 'Order Confirmation', 'Your HABÄNE order {{order_number}} is confirmed', '<p>Thank you for your order!</p>'),
  ('order_shipped', 'Order Shipped', 'Your order {{order_number}} has shipped', '<p>Your order is on its way!</p>'),
  ('refund_issued', 'Refund Issued', 'Refund for order {{order_number}} has been processed', '<p>Your refund has been processed.</p>'),
  ('low_stock_alert', 'Low Stock Alert', 'Low stock alert: {{product_name}}', '<p>Product {{product_name}} is running low.</p>')
ON CONFLICT (slug) DO NOTHING;

-- ============ AUDIT TRAIL ============
CREATE TABLE IF NOT EXISTS public.audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  previous_value jsonb,
  new_value jsonb,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_email text,
  changed_by_role text,
  ip_address text,
  module text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_trail_table ON public.audit_trail(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_trail_created ON public.audit_trail(created_at DESC);
GRANT SELECT ON public.audit_trail TO authenticated;
GRANT ALL ON public.audit_trail TO service_role;
ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins read audit trail" ON public.audit_trail FOR SELECT TO authenticated USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Service role manages audit trail" ON public.audit_trail FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ PROMOTIONS ============
CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'percent' CHECK (type IN ('percent','fixed','free_shipping','buy_x_get_y')),
  value numeric(10,2),
  status public.promotion_status NOT NULL DEFAULT 'draft',
  start_at timestamptz,
  end_at timestamptz,
  applies_to text NOT NULL DEFAULT 'all',
  min_order numeric(10,2),
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins manage promotions" ON public.promotions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ CAMPAIGNS ============
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  start_at timestamptz,
  end_at timestamptz,
  budget numeric(10,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins manage campaigns" ON public.campaigns FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ EXTEND ORDERS TABLE ============
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS partial_refund_amount numeric(10,2);

-- ============ EXTEND CUSTOMERS TABLE ============
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS segment public.customer_segment,
  ADD COLUMN IF NOT EXISTS lifetime_value numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_orders integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_refunds numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_order_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_order_at timestamptz,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_vip boolean NOT NULL DEFAULT false;

-- ============ PERFORMANCE INDEXES ============
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_created ON public.orders(payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_product_created ON public.order_items(product_id, created_at DESC);

-- =============================================================================
-- ANALYTICS RPCs
-- =============================================================================

-- Main analytics summary
CREATE OR REPLACE FUNCTION public.analytics_summary(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'revenue',           COALESCE(SUM(o.total), 0),
    'gross_sales',       COALESCE(SUM(o.subtotal + o.shipping_cost), 0),
    'net_revenue',       COALESCE(SUM(o.total - o.vat_amount - o.shipping_cost), 0),
    'orders',            COUNT(*)::integer,
    'units_sold',        COALESCE(SUM(oi.units), 0)::integer,
    'aov',               CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(COALESCE(SUM(o.total),0) / COUNT(*)::numeric, 2) END,
    'discount_total',    COALESCE(SUM(o.discount_amount), 0),
    'vat_total',         COALESCE(SUM(o.vat_amount), 0),
    'shipping_revenue',  COALESCE(SUM(o.shipping_cost), 0),
    'refund_value',      COALESCE((SELECT SUM(r.amount) FROM public.refunds r JOIN public.orders ro ON ro.id = r.order_id WHERE ro.created_at BETWEEN p_start AND p_end AND r.status = 'succeeded'), 0),
    'cancellation_value',COALESCE((SELECT SUM(o2.total) FROM public.orders o2 WHERE o2.status = 'cancelled' AND o2.created_at BETWEEN p_start AND p_end AND o2.deleted_at IS NULL), 0),
    'new_customers',     (SELECT COUNT(DISTINCT customer_email) FROM public.orders WHERE created_at BETWEEN p_start AND p_end AND payment_status = 'paid' AND customer_email NOT IN (SELECT customer_email FROM public.orders WHERE created_at < p_start AND payment_status = 'paid'))::integer
  )
  FROM public.orders o
  LEFT JOIN LATERAL (
    SELECT SUM(quantity) AS units FROM public.order_items WHERE order_id = o.id
  ) oi ON true
  WHERE o.payment_status = 'paid'
    AND o.deleted_at IS NULL
    AND o.created_at BETWEEN p_start AND p_end;
$$;

-- Period comparison
CREATE OR REPLACE FUNCTION public.analytics_period_comparison(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'current',  public.analytics_summary(p_start, p_end),
    'previous', public.analytics_summary(p_start - (p_end - p_start), p_start)
  );
$$;

-- Revenue time series
CREATE OR REPLACE FUNCTION public.analytics_revenue_series(
  p_start timestamptz,
  p_end timestamptz,
  p_granularity text DEFAULT 'day'
)
RETURNS TABLE(period text, revenue numeric, orders bigint, units bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE p_granularity
      WHEN 'hour'  THEN to_char(date_trunc('hour', o.created_at), 'YYYY-MM-DD HH24:00')
      WHEN 'week'  THEN to_char(date_trunc('week', o.created_at), 'YYYY-MM-DD')
      WHEN 'month' THEN to_char(date_trunc('month', o.created_at), 'YYYY-MM')
      ELSE              to_char(date_trunc('day', o.created_at), 'YYYY-MM-DD')
    END AS period,
    COALESCE(SUM(o.total), 0) AS revenue,
    COUNT(o.id) AS orders,
    COALESCE(SUM(oi.units), 0) AS units
  FROM public.orders o
  LEFT JOIN LATERAL (
    SELECT SUM(quantity) AS units FROM public.order_items WHERE order_id = o.id
  ) oi ON true
  WHERE o.payment_status = 'paid'
    AND o.deleted_at IS NULL
    AND o.created_at BETWEEN p_start AND p_end
  GROUP BY 1
  ORDER BY 1;
$$;

-- Day-of-week analytics
CREATE OR REPLACE FUNCTION public.analytics_day_of_week(
  p_start timestamptz,
  p_end timestamptz,
  p_day_of_week integer
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'day_of_week',  p_day_of_week,
    'revenue',      COALESCE(SUM(o.total), 0),
    'orders',       COUNT(*)::integer,
    'units_sold',   COALESCE(SUM(oi.units), 0)::integer,
    'aov',          CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(SUM(o.total) / COUNT(*)::numeric, 2) END
  )
  FROM public.orders o
  LEFT JOIN LATERAL (
    SELECT SUM(quantity) AS units FROM public.order_items WHERE order_id = o.id
  ) oi ON true
  WHERE o.payment_status = 'paid'
    AND o.deleted_at IS NULL
    AND o.created_at BETWEEN p_start AND p_end
    AND EXTRACT(DOW FROM o.created_at) = p_day_of_week;
$$;

-- Product analytics
CREATE OR REPLACE FUNCTION public.analytics_products(
  p_start timestamptz,
  p_end timestamptz,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  units_sold bigint,
  revenue numeric,
  refund_count bigint,
  avg_rating numeric,
  view_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    oi.product_id,
    oi.product_name,
    SUM(oi.quantity)::bigint AS units_sold,
    SUM(oi.subtotal) AS revenue,
    0::bigint AS refund_count,
    COALESCE((SELECT ROUND(AVG(rating)::numeric,2) FROM public.reviews rv WHERE rv.product_id = oi.product_id AND rv.status = 'approved'), 0) AS avg_rating,
    COALESCE((SELECT COUNT(*) FROM public.product_views pv WHERE pv.product_id = oi.product_id AND pv.created_at BETWEEN p_start AND p_end), 0)::bigint AS view_count
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.payment_status = 'paid'
    AND o.deleted_at IS NULL
    AND o.created_at BETWEEN p_start AND p_end
    AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id, oi.product_name
  ORDER BY revenue DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- Customer analytics
CREATE OR REPLACE FUNCTION public.analytics_customers(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH paid_orders AS (
    SELECT customer_email, total, created_at
    FROM public.orders
    WHERE payment_status = 'paid' AND deleted_at IS NULL AND created_at BETWEEN p_start AND p_end
  ),
  all_paid AS (
    SELECT customer_email, MIN(created_at) AS first_order
    FROM public.orders WHERE payment_status = 'paid' AND deleted_at IS NULL GROUP BY customer_email
  )
  SELECT jsonb_build_object(
    'total_customers',     (SELECT COUNT(DISTINCT customer_email) FROM paid_orders),
    'new_customers',       (SELECT COUNT(DISTINCT po.customer_email) FROM paid_orders po
                            JOIN all_paid ap ON ap.customer_email = po.customer_email
                            WHERE ap.first_order BETWEEN p_start AND p_end),
    'returning_customers', (SELECT COUNT(DISTINCT po.customer_email) FROM paid_orders po
                            JOIN all_paid ap ON ap.customer_email = po.customer_email
                            WHERE ap.first_order < p_start),
    'avg_spend',           COALESCE((SELECT ROUND(AVG(total)::numeric,2) FROM paid_orders), 0),
    'avg_orders_per_customer', COALESCE((
      SELECT ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT customer_email),0), 2)
      FROM paid_orders
    ), 0)
  );
$$;

-- Geographic analytics
CREATE OR REPLACE FUNCTION public.analytics_geographic(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE(country_code text, revenue numeric, orders bigint, customers bigint, aov numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (shipping_address->>'country')::text AS country_code,
    SUM(total) AS revenue,
    COUNT(*)::bigint AS orders,
    COUNT(DISTINCT customer_email)::bigint AS customers,
    ROUND(SUM(total) / NULLIF(COUNT(*),0)::numeric, 2) AS aov
  FROM public.orders
  WHERE payment_status = 'paid'
    AND deleted_at IS NULL
    AND created_at BETWEEN p_start AND p_end
  GROUP BY 1
  ORDER BY revenue DESC;
$$;

-- Financial analytics
CREATE OR REPLACE FUNCTION public.analytics_financial(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'gross_sales',      COALESCE(SUM(subtotal + shipping_cost), 0),
    'discounts',        COALESCE(SUM(discount_amount), 0),
    'net_sales',        COALESCE(SUM(subtotal - discount_amount), 0),
    'shipping_revenue', COALESCE(SUM(shipping_cost), 0),
    'taxes_collected',  COALESCE(SUM(vat_amount), 0),
    'total_revenue',    COALESCE(SUM(total), 0),
    'refunds_total',    COALESCE((SELECT SUM(r.amount) FROM public.refunds r
                                  JOIN public.orders ro ON ro.id = r.order_id
                                  WHERE ro.created_at BETWEEN p_start AND p_end
                                    AND r.status = 'succeeded'), 0),
    'net_revenue',      COALESCE(SUM(total), 0) - COALESCE((
                          SELECT SUM(r.amount) FROM public.refunds r
                          JOIN public.orders ro ON ro.id = r.order_id
                          WHERE ro.created_at BETWEEN p_start AND p_end AND r.status = 'succeeded'
                        ), 0)
  )
  FROM public.orders
  WHERE payment_status = 'paid' AND deleted_at IS NULL AND created_at BETWEEN p_start AND p_end;
$$;

-- Funnel analytics
CREATE OR REPLACE FUNCTION public.analytics_funnel(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'product_views',         (SELECT COUNT(*) FROM public.product_views WHERE created_at BETWEEN p_start AND p_end),
    'add_to_cart',           (SELECT COUNT(*) FROM public.cart_events WHERE event_type = 'add_to_cart' AND created_at BETWEEN p_start AND p_end),
    'checkout_started',      (SELECT COUNT(*) FROM public.cart_events WHERE event_type = 'checkout_started' AND created_at BETWEEN p_start AND p_end),
    'checkout_abandoned',    (SELECT COUNT(*) FROM public.cart_events WHERE event_type = 'checkout_abandoned' AND created_at BETWEEN p_start AND p_end),
    'purchases',             (SELECT COUNT(*) FROM public.orders WHERE payment_status = 'paid' AND deleted_at IS NULL AND created_at BETWEEN p_start AND p_end),
    'payment_failures',      (SELECT COUNT(*) FROM public.orders WHERE payment_status = 'failed' AND deleted_at IS NULL AND created_at BETWEEN p_start AND p_end)
  );
$$;

-- *** THE MAIN ONE THAT WAS FAILING ***
CREATE OR REPLACE FUNCTION public.dashboard_stats()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'today',         public.analytics_summary(date_trunc('day', now()), now()),
    'yesterday',     public.analytics_summary(date_trunc('day', now()) - interval '1 day', date_trunc('day', now())),
    'last_7_days',   public.analytics_summary(now() - interval '7 days', now()),
    'last_30_days',  public.analytics_summary(now() - interval '30 days', now()),
    'last_90_days',  public.analytics_summary(now() - interval '90 days', now()),
    'this_month',    public.analytics_summary(date_trunc('month', now()), now()),
    'this_year',     public.analytics_summary(date_trunc('year', now()), now()),
    'all_time',      public.analytics_summary('2000-01-01'::timestamptz, now()),
    'pending_returns', (SELECT COUNT(*) FROM public.returns WHERE status IN ('submitted','approved','items_received')),
    'low_stock_count', (SELECT COUNT(*) FROM public.products WHERE stock < 10 AND deleted_at IS NULL AND is_active = true),
    'open_orders',     (SELECT COUNT(*) FROM public.orders WHERE status IN ('pending','confirmed','processing') AND deleted_at IS NULL),
    'active_subscribers', (SELECT COUNT(*) FROM public.newsletter_subscribers WHERE is_active = true),
    'pending_reviews', (SELECT COUNT(*) FROM public.reviews WHERE status = 'pending')
  );
$$;

-- Grant execute on all RPCs
GRANT EXECUTE ON FUNCTION public.analytics_summary(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_period_comparison(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_revenue_series(timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_day_of_week(timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_products(timestamptz, timestamptz, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_customers(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_geographic(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_financial(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_funnel(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(text[]) TO authenticated;

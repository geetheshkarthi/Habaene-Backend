-- =============================================================================
-- HABÄNE — catch-up migration
--
-- The 20260901000000_phase0_full_scope migration only partially applied to the
-- live project (vyjrrsnjvgyppcyfwnta): 32 of its 48 tables landed, 16 did not.
-- This file creates just those 16, in dependency order, and is safe to re-run.
--
-- Prerequisite: the enums in supabase/fix_enums_first.sql must already exist
-- (purchase_order_status, drop_status, promotion_status, ...). Run that first
-- in its own SQL Editor tab if any CREATE TYPE below is reported as missing.
--
-- Tables created:
--   wishlists, search_logs, suppliers, purchase_orders, purchase_order_items,
--   product_drops, product_recommendations, product_matching_rules,
--   shipping_zones, shipping_methods, tax_rules, customer_activity,
--   back_in_stock_requests, early_access_list, content_versions, custom_reports
-- =============================================================================

-- ============ WISHLISTS ============
CREATE TABLE IF NOT EXISTS public.wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_email text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wishlists_customer ON public.wishlists(customer_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product ON public.wishlists(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlists_unique ON public.wishlists(customer_email, product_id);
GRANT INSERT, DELETE ON public.wishlists TO authenticated;
GRANT ALL ON public.wishlists TO service_role;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage wishlists" ON public.wishlists;
CREATE POLICY "Admins manage wishlists" ON public.wishlists FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- ============ SEARCH LOGS ============
CREATE TABLE IF NOT EXISTS public.search_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  results_count integer NOT NULL DEFAULT 0,
  session_id text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  led_to_purchase boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_logs_query ON public.search_logs(query);
CREATE INDEX IF NOT EXISTS idx_search_logs_created ON public.search_logs(created_at DESC);
GRANT INSERT ON public.search_logs TO anon;
GRANT SELECT, INSERT ON public.search_logs TO authenticated;
GRANT ALL ON public.search_logs TO service_role;
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can log searches" ON public.search_logs;
CREATE POLICY "Anyone can log searches" ON public.search_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Admins read search logs" ON public.search_logs;
CREATE POLICY "Admins read search logs" ON public.search_logs FOR SELECT TO authenticated USING (public.is_admin());
-- ============ SUPPLIERS ============
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  address jsonb,
  website text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage suppliers" ON public.suppliers;
CREATE POLICY "Admins manage suppliers" ON public.suppliers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS trg_suppliers_updated ON public.update_updated_at_column;
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- ============ PURCHASE ORDERS ============
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  status public.purchase_order_status NOT NULL DEFAULT 'draft',
  expected_delivery_date date,
  received_at timestamptz,
  total_cost numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_po_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON public.purchase_orders(supplier_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage purchase orders" ON public.purchase_orders;
CREATE POLICY "Admins manage purchase orders" ON public.purchase_orders FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS trg_po_updated ON public.update_updated_at_column;
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- ============ PURCHASE ORDER ITEMS ============
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  ordered_quantity integer NOT NULL CHECK (ordered_quantity > 0),
  received_quantity integer NOT NULL DEFAULT 0,
  damaged_quantity integer NOT NULL DEFAULT 0,
  unit_cost numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON public.purchase_order_items(po_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage PO items" ON public.purchase_order_items;
CREATE POLICY "Admins manage PO items" ON public.purchase_order_items FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- ============ PRODUCT DROPS ============
CREATE TABLE IF NOT EXISTS public.product_drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  status public.drop_status NOT NULL DEFAULT 'draft',
  launch_at timestamptz NOT NULL,
  end_at timestamptz,
  purchase_limit_per_customer integer,
  is_early_access_only boolean NOT NULL DEFAULT false,
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drops_launch ON public.product_drops(launch_at);
CREATE INDEX IF NOT EXISTS idx_drops_status ON public.product_drops(status);
GRANT SELECT ON public.product_drops TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_drops TO authenticated;
GRANT ALL ON public.product_drops TO service_role;
ALTER TABLE public.product_drops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public reads active drops" ON public.product_drops;
CREATE POLICY "Public reads active drops" ON public.product_drops FOR SELECT TO anon, authenticated USING (status = 'active');
DROP POLICY IF EXISTS "Admins manage drops" ON public.product_drops;
CREATE POLICY "Admins manage drops" ON public.product_drops FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS trg_drops_updated ON public.update_updated_at_column;
CREATE TRIGGER trg_drops_updated BEFORE UPDATE ON public.product_drops FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- ============ PRODUCT RECOMMENDATIONS ============
CREATE TABLE IF NOT EXISTS public.product_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  recommended_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  recommendation_type text NOT NULL CHECK (recommendation_type IN ('frequently_bought_together','you_may_also_like','accessories','cross_sell','upsell')),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, recommended_product_id, recommendation_type)
);
CREATE INDEX IF NOT EXISTS idx_recommendations_product ON public.product_recommendations(product_id);
GRANT SELECT ON public.product_recommendations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_recommendations TO authenticated;
GRANT ALL ON public.product_recommendations TO service_role;
ALTER TABLE public.product_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public reads recommendations" ON public.product_recommendations;
CREATE POLICY "Public reads recommendations" ON public.product_recommendations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage recommendations" ON public.product_recommendations;
CREATE POLICY "Admins manage recommendations" ON public.product_recommendations FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- ============ PRODUCT MATCHING RULES ============
CREATE TABLE IF NOT EXISTS public.product_matching_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_length text,
  movement_mode text,
  travel_mood text,
  recommended_product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_matching_rules TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_matching_rules TO authenticated;
GRANT ALL ON public.product_matching_rules TO service_role;
ALTER TABLE public.product_matching_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public reads matching rules" ON public.product_matching_rules;
CREATE POLICY "Public reads matching rules" ON public.product_matching_rules FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Admins manage matching rules" ON public.product_matching_rules;
CREATE POLICY "Admins manage matching rules" ON public.product_matching_rules FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS trg_matching_rules_updated ON public.update_updated_at_column;
CREATE TRIGGER trg_matching_rules_updated BEFORE UPDATE ON public.product_matching_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- ============ SHIPPING ZONES ============
CREATE TABLE IF NOT EXISTS public.shipping_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  countries text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.shipping_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid REFERENCES public.shipping_zones(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  carrier text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  free_threshold numeric(10,2),
  estimated_days_min integer,
  estimated_days_max integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shipping_zones, public.shipping_methods TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shipping_zones, public.shipping_methods TO authenticated;
GRANT ALL ON public.shipping_zones, public.shipping_methods TO service_role;
ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public reads shipping zones" ON public.shipping_zones;
CREATE POLICY "Public reads shipping zones" ON public.shipping_zones FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Public reads shipping methods" ON public.shipping_methods;
CREATE POLICY "Public reads shipping methods" ON public.shipping_methods FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Admins manage shipping zones" ON public.shipping_zones;
CREATE POLICY "Admins manage shipping zones" ON public.shipping_zones FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins manage shipping methods" ON public.shipping_methods;
CREATE POLICY "Admins manage shipping methods" ON public.shipping_methods FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS trg_shipping_zones_updated ON public.update_updated_at_column;
CREATE TRIGGER trg_shipping_zones_updated BEFORE UPDATE ON public.shipping_zones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_shipping_methods_updated ON public.update_updated_at_column;
CREATE TRIGGER trg_shipping_methods_updated BEFORE UPDATE ON public.shipping_methods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- ============ TAX RULES ============
CREATE TABLE IF NOT EXISTS public.tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country_code text,
  region text,
  rate numeric(5,4) NOT NULL,
  applies_to text NOT NULL DEFAULT 'all',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tax_rules TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tax_rules TO authenticated;
GRANT ALL ON public.tax_rules TO service_role;
ALTER TABLE public.tax_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public reads tax rules" ON public.tax_rules;
CREATE POLICY "Public reads tax rules" ON public.tax_rules FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Admins manage tax rules" ON public.tax_rules;
CREATE POLICY "Admins manage tax rules" ON public.tax_rules FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS trg_tax_rules_updated ON public.update_updated_at_column;
CREATE TRIGGER trg_tax_rules_updated BEFORE UPDATE ON public.tax_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- ============ CUSTOMER ACTIVITY ============
CREATE TABLE IF NOT EXISTS public.customer_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_email text NOT NULL,
  event_type text NOT NULL,
  description text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_activity_customer ON public.customer_activity(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_activity_created ON public.customer_activity(created_at DESC);
GRANT INSERT ON public.customer_activity TO service_role;
GRANT SELECT ON public.customer_activity TO authenticated;
GRANT ALL ON public.customer_activity TO service_role;
ALTER TABLE public.customer_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read customer activity" ON public.customer_activity;
CREATE POLICY "Admins read customer activity" ON public.customer_activity FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Service role manages activity" ON public.customer_activity;
CREATE POLICY "Service role manages activity" ON public.customer_activity FOR ALL TO service_role USING (true) WITH CHECK (true);
-- ============ BACK-IN-STOCK REQUESTS ============
CREATE TABLE IF NOT EXISTS public.back_in_stock_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  email text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  notified_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, product_id)
);
CREATE INDEX IF NOT EXISTS idx_bis_product ON public.back_in_stock_requests(product_id);
CREATE INDEX IF NOT EXISTS idx_bis_email ON public.back_in_stock_requests(email);
GRANT INSERT ON public.back_in_stock_requests TO anon;
GRANT SELECT, INSERT, UPDATE ON public.back_in_stock_requests TO authenticated;
GRANT ALL ON public.back_in_stock_requests TO service_role;
ALTER TABLE public.back_in_stock_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can request back in stock" ON public.back_in_stock_requests;
CREATE POLICY "Anyone can request back in stock" ON public.back_in_stock_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Admins manage back in stock" ON public.back_in_stock_requests;
CREATE POLICY "Admins manage back in stock" ON public.back_in_stock_requests FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- ============ EARLY ACCESS LIST ============
CREATE TABLE IF NOT EXISTS public.early_access_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  drop_id uuid REFERENCES public.product_drops(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'website',
  is_invited boolean NOT NULL DEFAULT false,
  invited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, drop_id)
);
CREATE INDEX IF NOT EXISTS idx_early_access_email ON public.early_access_list(email);
CREATE INDEX IF NOT EXISTS idx_early_access_drop ON public.early_access_list(drop_id);
GRANT INSERT ON public.early_access_list TO anon;
GRANT SELECT, INSERT, UPDATE ON public.early_access_list TO authenticated;
GRANT ALL ON public.early_access_list TO service_role;
ALTER TABLE public.early_access_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can join early access" ON public.early_access_list;
CREATE POLICY "Anyone can join early access" ON public.early_access_list FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Admins manage early access" ON public.early_access_list;
CREATE POLICY "Admins manage early access" ON public.early_access_list FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- ============ CONTENT VERSIONS ============
CREATE TABLE IF NOT EXISTS public.content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  version_number integer NOT NULL,
  content jsonb NOT NULL,
  saved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_versions_record ON public.content_versions(table_name, record_id);
GRANT SELECT, INSERT ON public.content_versions TO authenticated;
GRANT ALL ON public.content_versions TO service_role;
ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage content versions" ON public.content_versions;
CREATE POLICY "Admins manage content versions" ON public.content_versions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- ============ CUSTOM REPORTS ============
CREATE TABLE IF NOT EXISTS public.custom_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  metric text NOT NULL,
  dimensions text[] DEFAULT '{}',
  filters jsonb DEFAULT '{}'::jsonb,
  date_range text,
  grouping text,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  is_scheduled boolean NOT NULL DEFAULT false,
  schedule_cron text,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_reports_creator ON public.custom_reports(created_by);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_reports TO authenticated;
GRANT ALL ON public.custom_reports TO service_role;
ALTER TABLE public.custom_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own reports" ON public.custom_reports;
CREATE POLICY "Users manage own reports" ON public.custom_reports FOR ALL TO authenticated USING (created_by = auth.uid() OR public.is_admin()) WITH CHECK (created_by = auth.uid() OR public.is_admin());
DROP TRIGGER IF EXISTS trg_custom_reports_updated ON public.update_updated_at_column;
CREATE TRIGGER trg_custom_reports_updated BEFORE UPDATE ON public.custom_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

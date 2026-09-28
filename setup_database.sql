-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin');
CREATE TYPE public.product_category AS ENUM ('system', 'carry', 'luggage');
CREATE TYPE public.order_status AS ENUM ('pending','confirmed','processing','shipped','delivered','cancelled','returned');
CREATE TYPE public.payment_status AS ENUM ('pending','paid','failed','refunded');
CREATE TYPE public.return_type AS ENUM ('withdrawal','defect','exchange_request');
CREATE TYPE public.return_status AS ENUM ('submitted','approved','rejected','items_received','refunded');
CREATE TYPE public.discount_type AS ENUM ('percent','fixed');

-- ============ SHARED FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- ============ STORE SETTINGS ============
CREATE TABLE public.store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  legal_company_name text NOT NULL DEFAULT '',
  vat_id text NOT NULL DEFAULT '',
  commercial_register_number text NOT NULL DEFAULT '',
  business_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  returns_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  support_email text NOT NULL DEFAULT '',
  support_phone text NOT NULL DEFAULT '',
  invoice_prefix text NOT NULL DEFAULT 'HB',
  default_vat_rate numeric(5,4) NOT NULL DEFAULT 0.19,
  shipping_cost numeric(10,2) NOT NULL DEFAULT 0,
  free_shipping_threshold numeric(10,2),
  withdrawal_window_days integer NOT NULL DEFAULT 14,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read store settings" ON public.store_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert store settings" ON public.store_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update store settings" ON public.store_settings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER trg_store_settings_updated BEFORE UPDATE ON public.store_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.store_settings (legal_company_name, vat_id, commercial_register_number, business_address, returns_address, support_email, shipping_cost, free_shipping_threshold)
VALUES ('HABÄNE (legal name pending)', 'DE-PENDING', 'HRB-PENDING',
  '{"line1":"","line2":"","postal_code":"","city":"","country":"DE"}'::jsonb,
  '{"line1":"","line2":"","postal_code":"","city":"","country":"DE"}'::jsonb,
  'service@habaene.com', 4.90, 150.00);

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  badge text,
  category public.product_category NOT NULL DEFAULT 'system',
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  vat_rate numeric(5,4) NOT NULL DEFAULT 0.19,
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active boolean NOT NULL DEFAULT true,
  description text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  images text[] NOT NULL DEFAULT '{}',
  card_image text,
  passport_code text,
  specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  colors jsonb NOT NULL DEFAULT '[]'::jsonb,
  sizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  weight_kg numeric(8,3) NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_slug ON public.products(slug);
CREATE INDEX idx_products_category ON public.products(category);
CREATE INDEX idx_products_active ON public.products(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_stock ON public.products(stock);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active products" ON public.products FOR SELECT TO anon, authenticated USING (is_active = true AND deleted_at IS NULL);
CREATE POLICY "Admins can read all products" ON public.products FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update products" ON public.products FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete products" ON public.products FOR DELETE TO authenticated USING (public.is_admin());
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  phone text,
  stripe_customer_id text,
  newsletter_opt_in boolean NOT NULL DEFAULT false,
  gdpr_consent_at timestamptz,
  gdpr_consent_text text,
  anonymized_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_email ON public.customers(email);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage customers" ON public.customers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ORDERS ============
CREATE SEQUENCE public.order_number_seq START 1;
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'HB-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0');
$$;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT public.generate_order_number(),
  status public.order_status NOT NULL DEFAULT 'pending',
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_email text NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  customer_phone text,
  shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  shipping_cost numeric(10,2) NOT NULL DEFAULT 0,
  discount_code text,
  discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,4) NOT NULL DEFAULT 0.19,
  vat_amount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  payment_method text,
  payment_intent_id text,
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  stripe_session_id text,
  shipping_carrier text,
  tracking_number text,
  notes text,
  gdpr_consent_at timestamptz,
  gdpr_consent_text text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_number ON public.orders(order_number);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX idx_orders_customer ON public.orders(customer_id);
CREATE INDEX idx_orders_email ON public.orders(customer_email);
CREATE INDEX idx_orders_created ON public.orders(created_at DESC);
GRANT INSERT ON public.orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Guests can create orders" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins can read orders" ON public.orders FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update orders" ON public.orders FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete orders" ON public.orders FOR DELETE TO authenticated USING (public.is_admin());
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ORDER ITEMS ============
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_code text NOT NULL DEFAULT '',
  product_image text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL,
  color text,
  size text,
  subtotal numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_product ON public.order_items(product_id);
GRANT INSERT ON public.order_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Guests can create order items" ON public.order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins can read order items" ON public.order_items FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update order items" ON public.order_items FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete order items" ON public.order_items FOR DELETE TO authenticated USING (public.is_admin());

-- ============ NEWSLETTER ============
CREATE TABLE public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  ip_address text,
  consent_text text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'website',
  is_active boolean NOT NULL DEFAULT true,
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_newsletter_email ON public.newsletter_subscribers(email);
CREATE INDEX idx_newsletter_active ON public.newsletter_subscribers(is_active);
GRANT INSERT ON public.newsletter_subscribers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.newsletter_subscribers TO authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can subscribe" ON public.newsletter_subscribers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins can read subscribers" ON public.newsletter_subscribers FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update subscribers" ON public.newsletter_subscribers FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete subscribers" ON public.newsletter_subscribers FOR DELETE TO authenticated USING (public.is_admin());
CREATE TRIGGER trg_newsletter_updated BEFORE UPDATE ON public.newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RETURNS ============
CREATE TABLE public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_number text,
  customer_email text NOT NULL,
  type public.return_type NOT NULL DEFAULT 'withdrawal',
  reason text NOT NULL DEFAULT '',
  status public.return_status NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  return_label_url text,
  refund_amount numeric(10,2),
  refund_at timestamptz,
  items_received_at timestamptz,
  stripe_refund_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_returns_order ON public.returns(order_id);
CREATE INDEX idx_returns_status ON public.returns(status);
CREATE INDEX idx_returns_email ON public.returns(customer_email);
GRANT INSERT ON public.returns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.returns TO authenticated;
GRANT ALL ON public.returns TO service_role;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can create returns" ON public.returns FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins can read returns" ON public.returns FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update returns" ON public.returns FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete returns" ON public.returns FOR DELETE TO authenticated USING (public.is_admin());
CREATE TRIGGER trg_returns_updated BEFORE UPDATE ON public.returns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.return_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  status public.return_status NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_return_events_return ON public.return_events(return_id);
GRANT SELECT, INSERT, DELETE ON public.return_events TO authenticated;
GRANT ALL ON public.return_events TO service_role;
ALTER TABLE public.return_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage return events" ON public.return_events FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.log_return_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.return_events (return_id, status, created_by) VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_returns_timeline AFTER INSERT OR UPDATE ON public.returns FOR EACH ROW EXECUTE FUNCTION public.log_return_status();

-- ============ DISCOUNT CODES ============
CREATE TABLE public.discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  type public.discount_type NOT NULL DEFAULT 'percent',
  value numeric(10,2) NOT NULL CHECK (value >= 0),
  min_order numeric(10,2) NOT NULL DEFAULT 0,
  max_uses integer,
  uses_so_far integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_discount_code ON public.discount_codes(code);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_codes TO authenticated;
GRANT ALL ON public.discount_codes TO service_role;
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage discount codes" ON public.discount_codes FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER trg_discounts_updated BEFORE UPDATE ON public.discount_codes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CONTACT MESSAGES ============
CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL DEFAULT '',
  message text NOT NULL,
  is_handled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contact_created ON public.contact_messages(created_at DESC);
GRANT INSERT ON public.contact_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can send a message" ON public.contact_messages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins can read messages" ON public.contact_messages FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update messages" ON public.contact_messages FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete messages" ON public.contact_messages FOR DELETE TO authenticated USING (public.is_admin());
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon, public;
REVOKE ALL ON FUNCTION public.log_return_status() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
CREATE POLICY "Admins can read product images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'product-images' AND public.is_admin());
CREATE POLICY "Admins can upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND public.is_admin());
CREATE POLICY "Admins can update product images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images' AND public.is_admin()) WITH CHECK (bucket_id = 'product-images' AND public.is_admin());
CREATE POLICY "Admins can delete product images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images' AND public.is_admin());

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS brand_name text NOT NULL DEFAULT 'HABÄNE',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS storefront_url text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_id uuid,
  actor text,
  request_id text
);

CREATE INDEX IF NOT EXISTS event_logs_created_at_idx ON public.event_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS event_logs_event_idx ON public.event_logs (event);
CREATE INDEX IF NOT EXISTS event_logs_order_id_idx ON public.event_logs (order_id);

GRANT SELECT ON public.event_logs TO authenticated;
GRANT ALL ON public.event_logs TO service_role;

ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read event logs" ON public.event_logs;
CREATE POLICY "Admins read event logs"
  ON public.event_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    INSERT INTO public.event_logs (event, level, message, context, actor)
    VALUES (
      'product_updated', 'info',
      format('Product %s updated', NEW.code),
      jsonb_build_object('product_id', NEW.id, 'slug', NEW.slug, 'stock', NEW.stock, 'is_active', NEW.is_active),
      coalesce(auth.uid()::text, 'system')
    );
  ELSIF TG_TABLE_NAME = 'orders' THEN
    INSERT INTO public.event_logs (event, level, message, context, order_id, actor)
    VALUES (
      'order_updated', 'info',
      format('Order %s updated', NEW.order_number),
      jsonb_build_object('status', NEW.status, 'payment_status', NEW.payment_status),
      NEW.id,
      coalesce(auth.uid()::text, 'system')
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_row_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_change_log ON public.products;
CREATE TRIGGER products_change_log
  AFTER UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change();

DROP TRIGGER IF EXISTS orders_change_log ON public.orders;
CREATE TRIGGER orders_change_log
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change();

UPDATE public.store_settings
SET brand_name = 'HABÄNE',
    currency = 'EUR',
    social_links = '{"instagram":"https://instagram.com/habane","linkedin":"https://linkedin.com/company/habane"}'::jsonb
WHERE singleton = true;

INSERT INTO public.products (code, name, slug, subtitle, description, category, price, vat_rate, stock, badge, weight_kg, images, specs, colors, sizes, is_active)
VALUES
  ('HB-SYS-01','Atlas Modular System','atlas-modular-system','The core carry architecture','A three-part modular system: spine harness, primary volume and detachable pouch. Built from recycled ballistic weave with welded seams.','system',690.00,0.19,12,'New',1.9,ARRAY['https://images.unsplash.com/photo-1553062407-98eeb64c6a62'],'{"material":"Recycled ballistic nylon","origin":"Portugal","warranty":"10 years"}'::jsonb,'["Ink","Bone"]'::jsonb,'["One size"]'::jsonb,true),
  ('HB-SYS-02','Atlas Spine Harness','atlas-spine-harness','Load-bearing frame','Aluminium-reinforced spine harness that transfers load to the hips. Compatible with every Atlas volume.','system',280.00,0.19,25,NULL,0.7,ARRAY['https://images.unsplash.com/photo-1491637639811-60e2756cc1c7'],'{"material":"Aluminium, nylon","origin":"Portugal"}'::jsonb,'["Ink"]'::jsonb,'["S","M","L"]'::jsonb,true),
  ('HB-CAR-01','Meridian Day Pack 18L','meridian-day-pack-18l','Everyday commuter','An 18 litre commuter pack with a padded 16 inch laptop sleeve and magnetic top closure.','carry',340.00,0.19,40,'Bestseller',1.1,ARRAY['https://images.unsplash.com/photo-1553062407-98eeb64c6a62'],'{"volume":"18 L","laptop":"16 inch"}'::jsonb,'["Ink","Clay","Bone"]'::jsonb,'["One size"]'::jsonb,true),
  ('HB-CAR-02','Meridian Sling 6L','meridian-sling-6l','Minimal cross-body','A six litre cross-body sling with a quick-release buckle and internal document divider.','carry',190.00,0.19,4,NULL,0.5,ARRAY['https://images.unsplash.com/photo-1548036328-c9fa89d128fa'],'{"volume":"6 L"}'::jsonb,'["Ink","Moss"]'::jsonb,'["One size"]'::jsonb,true),
  ('HB-LUG-01','Continent Cabin Case','continent-cabin-case','55cm cabin luggage','Cabin-legal hard case in recycled polycarbonate with Japanese silent wheels and a TSA lock.','luggage',760.00,0.19,8,NULL,3.4,ARRAY['https://images.unsplash.com/photo-1565026057447-bc90a3dceb87'],'{"dimensions":"55 x 40 x 20 cm","wheels":"Hinomoto"}'::jsonb,'["Bone","Ink"]'::jsonb,'["Cabin"]'::jsonb,true),
  ('HB-LUG-02','Continent Hold Case 75','continent-hold-case-75','Long-haul checked case','A 75 litre checked case with a compression platform and a lifetime shell guarantee.','luggage',980.00,0.19,0,NULL,4.6,ARRAY['https://images.unsplash.com/photo-1590874103328-eac38a683ce7'],'{"dimensions":"75 x 50 x 30 cm"}'::jsonb,'["Bone"]'::jsonb,'["Large"]'::jsonb,true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.discount_codes (code, type, value, min_order, max_uses, is_active)
VALUES ('WELCOME10','percent',10,100,500,true)
ON CONFLICT (code) DO NOTHING;

DROP POLICY IF EXISTS "Admins read event logs" ON public.event_logs;
CREATE POLICY "Admins read event logs" ON public.event_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, anon, PUBLIC;

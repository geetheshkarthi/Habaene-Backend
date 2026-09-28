
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

-- Adds a cost-price column (products had price/sell only, no cost basis),
-- opens public read access to product images (admin-only before — meaning
-- any admin-uploaded image was invisible on the live storefront), and adds
-- an inventory_overview view joining products with their damaged/returned
-- and incoming-stock aggregates so the admin Inventory page can query one
-- row per product instead of stitching several client-side queries together.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price numeric(10,2) NOT NULL DEFAULT 0;

DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
CREATE POLICY "Anyone can view product images" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'product-images');

CREATE OR REPLACE VIEW public.inventory_overview AS
SELECT
  p.id, p.code, p.name, p.category, p.badge, p.weight_kg, p.stock, p.price, p.cost_price,
  p.is_active, p.card_image,
  COALESCE(dmg.qty, 0) AS damaged_returned,
  COALESCE(inc.qty, 0) AS incoming,
  (p.stock * p.cost_price) AS inventory_value
FROM public.products p
LEFT JOIN (
  SELECT product_id, SUM(ABS(quantity_change)) AS qty
  FROM public.inventory_movements
  WHERE movement_type IN ('damage', 'return')
  GROUP BY product_id
) dmg ON dmg.product_id = p.id
LEFT JOIN (
  SELECT poi.product_id, SUM(poi.ordered_quantity - poi.received_quantity) AS qty
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.po_id
  WHERE po.status IN ('draft', 'sent', 'partial')
  GROUP BY poi.product_id
) inc ON inc.product_id = p.id
WHERE p.deleted_at IS NULL;

GRANT SELECT ON public.inventory_overview TO authenticated;

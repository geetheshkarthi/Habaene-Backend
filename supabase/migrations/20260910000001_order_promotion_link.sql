-- Lets checkout auto-apply an eligible active promotion (percent/fixed off,
-- or free shipping) and tracks which one an order used, so promotions.
-- usage_count can be incremented for real instead of staying permanently 0.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_promotion_id ON public.orders(promotion_id);

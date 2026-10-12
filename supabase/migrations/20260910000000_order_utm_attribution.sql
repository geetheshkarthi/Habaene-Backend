-- Campaigns admin page has always queried orders.utm_campaign for revenue
-- attribution, but the orders table never had UTM columns at all — the
-- query would error the moment real campaign data was expected, and nothing
-- on the storefront ever captured UTM params from the URL in the first
-- place. This adds the columns; the storefront/checkout changes that
-- populate them ship alongside this migration.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text;

CREATE INDEX IF NOT EXISTS idx_orders_utm_campaign ON public.orders(utm_campaign);

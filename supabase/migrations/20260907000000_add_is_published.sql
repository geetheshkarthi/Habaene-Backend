-- Separates "pushed to Products" from "live on the public storefront".
-- is_active now means "pushed from Inventory, manageable on the Products
-- page" — it no longer controls public visibility. is_published is the new,
-- separate flag the Products page's "Show on Website"/"Hide" action sets,
-- and is what the public API actually filters on.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

-- Anything already active+live today stays live after the split.
UPDATE public.products SET is_published = true WHERE is_active = true;

-- 20260905000000's `ADD COLUMN IF NOT EXISTS cost_price ... NOT NULL DEFAULT 0`
-- was a silent no-op: the column already existed (nullable, no default) from
-- 20260901000000_phase0_full_scope.sql's own `ADD COLUMN IF NOT EXISTS
-- cost_price numeric(10,2)` — IF NOT EXISTS skips the whole clause when the
-- column is already there, so the NOT NULL/DEFAULT never actually applied.
-- Every existing product was left with cost_price = null, which broke
-- inventory_overview's (stock * cost_price) value calc for any row where
-- cost_price was never explicitly set.

UPDATE public.products SET cost_price = 0 WHERE cost_price IS NULL;
ALTER TABLE public.products ALTER COLUMN cost_price SET DEFAULT 0;
ALTER TABLE public.products ALTER COLUMN cost_price SET NOT NULL;

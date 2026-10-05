-- Greenfield rich-content fields the storefront's product page needs but the
-- database never had: Mood DNA sliders, the Pack-it item list, and the
-- structured Passport service/role fields (material and care already have
-- homes in the existing materials/care_instructions columns, added by
-- phase0_full_scope.sql but never wired to any UI or API until now).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS mood jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pack_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS passport_service text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS passport_role text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS blueprint jsonb NOT NULL DEFAULT '{}'::jsonb;

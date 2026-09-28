-- =============================================================================
-- HAB\u00c4NE \u2014 STEP 1: Enum additions ONLY
-- Run this FIRST in a new SQL Editor tab and click Run.
-- PostgreSQL requires new enum values to be committed before they can be used
-- in the same session. After this succeeds, run fix_missing_rpcs.sql.
-- =============================================================================

-- Extend app_role with all staff roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'content_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'seo_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'inventory_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'order_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'customer_support';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_manager';

-- Extend order_status with 'packed'
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'packed' AFTER 'processing';

-- Done. Now run fix_missing_rpcs.sql in a new tab.

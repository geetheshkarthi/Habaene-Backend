-- Split out of 20260901000000_phase0_full_scope.sql: Postgres won't let a
-- newly added enum value be used in the same transaction it was added in
-- (SQLSTATE 55P04), and phase0_full_scope's own dashboard_stats() function
-- uses 'packed' the moment it's created. Applying the ADD VALUE statements
-- in their own migration/transaction first lets phase0 use them safely.

-- Extend order_status to include 'packed'
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'packed' AFTER 'processing';

-- Extend app_role to include all staff roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'content_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'seo_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'inventory_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'order_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'customer_support';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_manager';

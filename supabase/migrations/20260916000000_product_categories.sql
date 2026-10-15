-- Lets admins add product categories from the dashboard.
-- Categories are the values of the product_category enum; these two functions
-- list them and (admin only) append a new one. Existing values are untouched.

CREATE OR REPLACE FUNCTION public.list_product_categories()
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(array_agg(t.e::text ORDER BY t.n), ARRAY[]::text[])
  FROM unnest(enum_range(NULL::public.product_category)) WITH ORDINALITY AS t(e, n)
$$;

CREATE OR REPLACE FUNCTION public.add_product_category(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text := regexp_replace(lower(btrim(p_name)), '\s+', '-', 'g');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v !~ '^[a-z0-9][a-z0-9-]{0,29}$' THEN
    RAISE EXCEPTION 'Category names use letters, numbers and hyphens (max 30 characters)';
  END IF;
  EXECUTE format('ALTER TYPE public.product_category ADD VALUE IF NOT EXISTS %L', v);
  RETURN v;
END
$$;

REVOKE ALL ON FUNCTION public.add_product_category(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_product_category(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_product_categories() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Visitor Insights: page visits with time-on-page and scroll depth, plus the
-- reporting functions behind Admin -> Visitor Insights.
-- Product views, cart events and searches already exist; this adds the missing
-- "where do visitors spend their time" data.

CREATE TABLE IF NOT EXISTS public.page_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- one random id per page load; several rows with the same visit_id are one visit
  visit_id text NOT NULL,
  session_id text NOT NULL,
  page_type text NOT NULL CHECK (page_type IN ('home','shop','product','checkout','journal','info','other')),
  path text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  seconds integer NOT NULL DEFAULT 0 CHECK (seconds >= 0 AND seconds <= 3600),
  max_scroll integer NOT NULL DEFAULT 0 CHECK (max_scroll BETWEEN 0 AND 100),
  referrer text,
  device text CHECK (device IN ('mobile','tablet','desktop')),
  country_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_page_visits_created ON public.page_visits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_visits_product ON public.page_visits(product_id);
CREATE INDEX IF NOT EXISTS idx_page_visits_visit ON public.page_visits(visit_id);

ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.page_visits TO service_role;
GRANT SELECT ON public.page_visits TO authenticated;
DROP POLICY IF EXISTS "Admins read page visits" ON public.page_visits;
CREATE POLICY "Admins read page visits" ON public.page_visits
  FOR SELECT TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------- products
CREATE OR REPLACE FUNCTION public.insights_products(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN COALESCE((
    WITH v AS (
      SELECT product_id, count(*) AS views, count(DISTINCT session_id) AS visitors
      FROM public.product_views
      WHERE created_at BETWEEN p_start AND p_end AND product_id IS NOT NULL
      GROUP BY product_id
    ), c AS (
      SELECT product_id, count(*) AS adds
      FROM public.cart_events
      WHERE event_type = 'add_to_cart' AND created_at BETWEEN p_start AND p_end AND product_id IS NOT NULL
      GROUP BY product_id
    ), t AS (
      SELECT product_id, round(avg(secs)) AS avg_seconds
      FROM (
        SELECT product_id, visit_id, sum(seconds) AS secs
        FROM public.page_visits
        WHERE page_type = 'product' AND product_id IS NOT NULL AND created_at BETWEEN p_start AND p_end
        GROUP BY product_id, visit_id
      ) x
      GROUP BY product_id
    ), u AS (
      SELECT oi.product_id, sum(oi.quantity) AS units
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE o.status <> 'cancelled' AND o.deleted_at IS NULL AND o.created_at BETWEEN p_start AND p_end
      GROUP BY oi.product_id
    )
    SELECT jsonb_agg(to_jsonb(r) ORDER BY r.views DESC, r.name)
    FROM (
      SELECT p.id AS product_id, p.name, p.category::text AS category,
             COALESCE(v.views, 0) AS views, COALESCE(v.visitors, 0) AS visitors,
             COALESCE(c.adds, 0) AS add_to_cart, t.avg_seconds,
             COALESCE(u.units, 0) AS units_sold
      FROM public.products p
      LEFT JOIN v ON v.product_id = p.id
      LEFT JOIN c ON c.product_id = p.id
      LEFT JOIN t ON t.product_id = p.id
      LEFT JOIN u ON u.product_id = p.id
      WHERE p.deleted_at IS NULL AND p.is_active
    ) r
  ), '[]'::jsonb);
END
$$;

-- ---------------------------------------------------------------- pages
CREATE OR REPLACE FUNCTION public.insights_pages(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN (
    WITH visit AS (
      SELECT visit_id, page_type, path, sum(seconds) AS secs, max(max_scroll) AS scroll
      FROM public.page_visits
      WHERE created_at BETWEEN p_start AND p_end
      GROUP BY visit_id, page_type, path
    )
    SELECT jsonb_build_object(
      'visits', (SELECT count(*) FROM visit),
      'avg_seconds', COALESCE((SELECT round(avg(secs)) FROM visit), 0),
      'avg_scroll', COALESCE((SELECT round(avg(scroll)) FROM visit), 0),
      'by_type', COALESCE((
        SELECT jsonb_agg(to_jsonb(x)) FROM (
          SELECT page_type, count(*) AS visits, round(avg(secs)) AS avg_seconds,
                 round(avg(scroll)) AS avg_scroll, sum(secs) AS total_seconds
          FROM visit GROUP BY page_type ORDER BY sum(secs) DESC
        ) x), '[]'::jsonb),
      'by_path', COALESCE((
        SELECT jsonb_agg(to_jsonb(x)) FROM (
          SELECT path, page_type, count(*) AS visits, round(avg(secs)) AS avg_seconds,
                 round(avg(scroll)) AS avg_scroll, count(*) FILTER (WHERE secs < 10) AS quick_exits
          FROM visit GROUP BY path, page_type ORDER BY count(*) DESC LIMIT 25
        ) x), '[]'::jsonb)
    )
  );
END
$$;

-- ---------------------------------------------------------------- visitors
CREATE OR REPLACE FUNCTION public.insights_visitors(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN (
    WITH visit AS (
      SELECT visit_id, session_id,
             min(created_at) AS at,
             sum(seconds) AS secs,
             max(device) AS device,
             max(country_code) AS country,
             max(referrer) AS referrer
      FROM public.page_visits
      WHERE created_at BETWEEN p_start AND p_end
      GROUP BY visit_id, session_id
    )
    SELECT jsonb_build_object(
      'sessions', (SELECT count(DISTINCT session_id) FROM visit),
      'visits', (SELECT count(*) FROM visit),
      'avg_seconds', COALESCE((SELECT round(avg(secs)) FROM visit), 0),
      'devices', COALESCE((
        SELECT jsonb_agg(to_jsonb(x)) FROM (
          SELECT COALESCE(device, 'unknown') AS label, count(*) AS visits
          FROM visit GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
      'countries', COALESCE((
        SELECT jsonb_agg(to_jsonb(x)) FROM (
          SELECT COALESCE(NULLIF(country, ''), 'Unknown') AS label, count(*) AS visits
          FROM visit GROUP BY 1 ORDER BY 2 DESC LIMIT 10) x), '[]'::jsonb),
      'sources', COALESCE((
        SELECT jsonb_agg(to_jsonb(x)) FROM (
          SELECT CASE WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
                      ELSE regexp_replace(referrer, '^https?://([^/]+).*$', '\1') END AS label,
                 count(*) AS visits
          FROM visit GROUP BY 1 ORDER BY 2 DESC LIMIT 10) x), '[]'::jsonb),
      'hours', COALESCE((
        SELECT jsonb_agg(to_jsonb(x)) FROM (
          SELECT extract(hour FROM at AT TIME ZONE 'UTC')::int AS hour, count(*) AS visits
          FROM visit GROUP BY 1 ORDER BY 1) x), '[]'::jsonb),
      'daily', COALESCE((
        SELECT jsonb_agg(to_jsonb(x)) FROM (
          SELECT to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*) AS visits
          FROM visit GROUP BY 1 ORDER BY 1) x), '[]'::jsonb)
    )
  );
END
$$;

REVOKE ALL ON FUNCTION public.insights_products(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.insights_pages(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.insights_visitors(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insights_products(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insights_pages(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insights_visitors(timestamptz, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';

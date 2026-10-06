-- Every analytics_* RPC only ever counted orders with payment_status =
-- 'paid'. With no payment gateway configured yet, no order can ever reach
-- 'paid' — so Analytics showed zero everywhere (Customers, Sales, Products,
-- Financial, Day of Week, Geographic) despite real orders and real
-- customers existing. Redefines "counts" as any non-cancelled, non-deleted
-- order — Orders/Customers/Units/Revenue now reflect orders actually
-- placed (gross order value), not just confirmed-paid revenue. Pending
-- COD/bank-transfer-style orders are real business activity, not nothing.

CREATE OR REPLACE FUNCTION public.analytics_summary(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'revenue',           COALESCE(SUM(o.total), 0),
    'gross_sales',       COALESCE(SUM(o.subtotal + o.shipping_cost), 0),
    'net_revenue',       COALESCE(SUM(o.total - o.vat_amount - o.shipping_cost), 0),
    'orders',            COUNT(*)::integer,
    'units_sold',        COALESCE(SUM(oi.units), 0)::integer,
    'aov',               CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(COALESCE(SUM(o.total),0) / COUNT(*)::numeric, 2) END,
    'discount_total',    COALESCE(SUM(o.discount_amount), 0),
    'vat_total',         COALESCE(SUM(o.vat_amount), 0),
    'shipping_revenue',  COALESCE(SUM(o.shipping_cost), 0),
    'refund_value',      COALESCE((SELECT SUM(r.amount) FROM public.refunds r JOIN public.orders ro ON ro.id = r.order_id WHERE ro.created_at BETWEEN p_start AND p_end AND r.status = 'succeeded'), 0),
    'cancellation_value',COALESCE((SELECT SUM(o2.total) FROM public.orders o2 WHERE o2.status = 'cancelled' AND o2.created_at BETWEEN p_start AND p_end AND o2.deleted_at IS NULL), 0),
    'new_customers',     (SELECT COUNT(DISTINCT customer_email) FROM public.orders WHERE created_at BETWEEN p_start AND p_end AND status <> 'cancelled' AND deleted_at IS NULL AND customer_email NOT IN (SELECT customer_email FROM public.orders WHERE created_at < p_start AND status <> 'cancelled' AND deleted_at IS NULL))::integer
  )
  FROM public.orders o
  LEFT JOIN LATERAL (
    SELECT SUM(quantity) AS units FROM public.order_items WHERE order_id = o.id
  ) oi ON true
  WHERE o.status <> 'cancelled'
    AND o.deleted_at IS NULL
    AND o.created_at BETWEEN p_start AND p_end;
$$;

CREATE OR REPLACE FUNCTION public.analytics_revenue_series(
  p_start timestamptz,
  p_end timestamptz,
  p_granularity text DEFAULT 'day'
)
RETURNS TABLE(period text, revenue numeric, orders bigint, units bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE p_granularity
      WHEN 'hour'  THEN to_char(date_trunc('hour', o.created_at), 'YYYY-MM-DD HH24:00')
      WHEN 'week'  THEN to_char(date_trunc('week', o.created_at), 'YYYY-MM-DD')
      WHEN 'month' THEN to_char(date_trunc('month', o.created_at), 'YYYY-MM')
      ELSE              to_char(date_trunc('day', o.created_at), 'YYYY-MM-DD')
    END AS period,
    COALESCE(SUM(o.total), 0) AS revenue,
    COUNT(o.id) AS orders,
    COALESCE(SUM(oi.units), 0) AS units
  FROM public.orders o
  LEFT JOIN LATERAL (
    SELECT SUM(quantity) AS units FROM public.order_items WHERE order_id = o.id
  ) oi ON true
  WHERE o.status <> 'cancelled'
    AND o.deleted_at IS NULL
    AND o.created_at BETWEEN p_start AND p_end
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.analytics_day_of_week(
  p_start timestamptz,
  p_end timestamptz,
  p_day_of_week integer
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'day_of_week',  p_day_of_week,
    'revenue',      COALESCE(SUM(o.total), 0),
    'orders',       COUNT(*)::integer,
    'units_sold',   COALESCE(SUM(oi.units), 0)::integer,
    'aov',          CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(SUM(o.total) / COUNT(*)::numeric, 2) END
  )
  FROM public.orders o
  LEFT JOIN LATERAL (
    SELECT SUM(quantity) AS units FROM public.order_items WHERE order_id = o.id
  ) oi ON true
  WHERE o.status <> 'cancelled'
    AND o.deleted_at IS NULL
    AND o.created_at BETWEEN p_start AND p_end
    AND EXTRACT(DOW FROM o.created_at) = p_day_of_week;
$$;

CREATE OR REPLACE FUNCTION public.analytics_products(
  p_start timestamptz,
  p_end timestamptz,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  units_sold bigint,
  revenue numeric,
  refund_count bigint,
  avg_rating numeric,
  view_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    oi.product_id,
    oi.product_name,
    SUM(oi.quantity)::bigint AS units_sold,
    SUM(oi.subtotal) AS revenue,
    COALESCE((SELECT COUNT(DISTINCT r.id) FROM public.returns r
              JOIN public.order_items roi ON roi.order_id = r.order_id
              WHERE r.created_at BETWEEN p_start AND p_end
                AND roi.product_id = oi.product_id), 0)::bigint AS refund_count,
    COALESCE((SELECT ROUND(AVG(rating)::numeric,2) FROM public.reviews rv WHERE rv.product_id = oi.product_id AND rv.status = 'approved'), 0) AS avg_rating,
    COALESCE((SELECT COUNT(*) FROM public.product_views pv WHERE pv.product_id = oi.product_id AND pv.created_at BETWEEN p_start AND p_end), 0)::bigint AS view_count
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.status <> 'cancelled'
    AND o.deleted_at IS NULL
    AND o.created_at BETWEEN p_start AND p_end
    AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id, oi.product_name
  ORDER BY revenue DESC
  LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.analytics_customers(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH real_orders AS (
    SELECT customer_email, total, created_at
    FROM public.orders
    WHERE status <> 'cancelled' AND deleted_at IS NULL AND created_at BETWEEN p_start AND p_end
  ),
  all_real AS (
    SELECT customer_email, MIN(created_at) AS first_order
    FROM public.orders WHERE status <> 'cancelled' AND deleted_at IS NULL GROUP BY customer_email
  )
  SELECT jsonb_build_object(
    'total_customers',     (SELECT COUNT(DISTINCT customer_email) FROM real_orders),
    'new_customers',       (SELECT COUNT(DISTINCT ro.customer_email) FROM real_orders ro
                            JOIN all_real ar ON ar.customer_email = ro.customer_email
                            WHERE ar.first_order BETWEEN p_start AND p_end),
    'returning_customers', (SELECT COUNT(DISTINCT ro.customer_email) FROM real_orders ro
                            JOIN all_real ar ON ar.customer_email = ro.customer_email
                            WHERE ar.first_order < p_start),
    'avg_spend',           COALESCE((SELECT ROUND(AVG(total)::numeric,2) FROM real_orders), 0),
    'avg_orders_per_customer', COALESCE((
      SELECT ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT customer_email),0), 2)
      FROM real_orders
    ), 0)
  );
$$;

CREATE OR REPLACE FUNCTION public.analytics_geographic(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE(country_code text, revenue numeric, orders bigint, customers bigint, aov numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (shipping_address->>'country')::text AS country_code,
    SUM(total) AS revenue,
    COUNT(*)::bigint AS orders,
    COUNT(DISTINCT customer_email)::bigint AS customers,
    ROUND(SUM(total) / NULLIF(COUNT(*),0)::numeric, 2) AS aov
  FROM public.orders
  WHERE status <> 'cancelled'
    AND deleted_at IS NULL
    AND created_at BETWEEN p_start AND p_end
  GROUP BY 1
  ORDER BY revenue DESC;
$$;

CREATE OR REPLACE FUNCTION public.analytics_financial(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'gross_sales',      COALESCE(SUM(subtotal + shipping_cost), 0),
    'discounts',        COALESCE(SUM(discount_amount), 0),
    'net_sales',        COALESCE(SUM(subtotal - discount_amount), 0),
    'shipping_revenue', COALESCE(SUM(shipping_cost), 0),
    'taxes_collected',  COALESCE(SUM(vat_amount), 0),
    'total_revenue',    COALESCE(SUM(total), 0),
    'refunds_total',    COALESCE((SELECT SUM(r.amount) FROM public.refunds r
                                  JOIN public.orders ro ON ro.id = r.order_id
                                  WHERE ro.created_at BETWEEN p_start AND p_end
                                    AND r.status = 'succeeded'), 0),
    'net_revenue',      COALESCE(SUM(total), 0) - COALESCE((
                          SELECT SUM(r.amount) FROM public.refunds r
                          JOIN public.orders ro ON ro.id = r.order_id
                          WHERE ro.created_at BETWEEN p_start AND p_end AND r.status = 'succeeded'
                        ), 0)
  )
  FROM public.orders
  WHERE status <> 'cancelled' AND deleted_at IS NULL AND created_at BETWEEN p_start AND p_end;
$$;

CREATE OR REPLACE FUNCTION public.analytics_funnel(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'product_views',         (SELECT COUNT(*) FROM public.product_views WHERE created_at BETWEEN p_start AND p_end),
    'add_to_cart',           (SELECT COUNT(*) FROM public.cart_events WHERE event_type = 'add_to_cart' AND created_at BETWEEN p_start AND p_end),
    'checkout_started',      (SELECT COUNT(*) FROM public.cart_events WHERE event_type = 'checkout_started' AND created_at BETWEEN p_start AND p_end),
    'checkout_abandoned',    (SELECT COUNT(*) FROM public.cart_events WHERE event_type = 'checkout_abandoned' AND created_at BETWEEN p_start AND p_end),
    'purchases',              (SELECT COUNT(*) FROM public.orders WHERE status <> 'cancelled' AND deleted_at IS NULL AND created_at BETWEEN p_start AND p_end),
    'payment_failures',      (SELECT COUNT(*) FROM public.orders WHERE payment_status = 'failed' AND deleted_at IS NULL AND created_at BETWEEN p_start AND p_end)
  );
$$;

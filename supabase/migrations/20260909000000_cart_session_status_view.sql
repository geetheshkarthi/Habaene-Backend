-- Abandoned Carts has always queried cart_events for event_type =
-- 'checkout_abandoned', but nothing ever inserts that event type — it would
-- require a scheduled job to notice a stale session, which doesn't exist on
-- this Worker. Abandonment is better computed live anyway: a session is
-- "abandoned" once its most recent event is a cart/checkout-started action,
-- no checkout_completed event ever followed, and enough time has passed that
-- the shopper isn't just still mid-session.

CREATE OR REPLACE VIEW public.cart_session_status AS
WITH latest AS (
  SELECT DISTINCT ON (session_id)
    session_id, customer_email, cart_total, cart_items, checkout_stage,
    utm_source, event_type, created_at
  FROM public.cart_events
  ORDER BY session_id, created_at DESC
),
completed AS (
  SELECT session_id, MIN(created_at) AS completed_at
  FROM public.cart_events
  WHERE event_type = 'checkout_completed'
  GROUP BY session_id
)
SELECT
  latest.session_id,
  latest.customer_email,
  latest.cart_total,
  latest.cart_items,
  latest.checkout_stage,
  latest.utm_source,
  latest.event_type AS last_event_type,
  latest.created_at AS last_activity,
  completed.completed_at,
  (completed.session_id IS NOT NULL) AS is_completed,
  (
    completed.session_id IS NULL
    AND latest.event_type IN ('add_to_cart', 'remove_from_cart', 'checkout_started')
    AND latest.created_at < now() - interval '30 minutes'
  ) AS is_abandoned
FROM latest
LEFT JOIN completed ON completed.session_id = latest.session_id;

ALTER VIEW public.cart_session_status SET (security_invoker = true);
GRANT SELECT ON public.cart_session_status TO authenticated;

-- Adds provider-specific payment reference columns for the new gateways
-- (Razorpay, Slice) added alongside the existing Stripe integration.
-- orders.payment_method / orders.payment_status already existed and are
-- reused as-is; only new reference-id columns are added here. Existing
-- Stripe columns (stripe_session_id, payment_intent_id) are untouched.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS slice_order_id text,
  ADD COLUMN IF NOT EXISTS slice_payment_id text;

CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order ON public.orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_slice_order ON public.orders(slice_order_id);

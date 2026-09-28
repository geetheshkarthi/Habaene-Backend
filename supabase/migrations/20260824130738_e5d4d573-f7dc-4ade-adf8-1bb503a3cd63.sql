
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS brand_name text NOT NULL DEFAULT 'HABÄNE',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS storefront_url text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_id uuid,
  actor text,
  request_id text
);

CREATE INDEX IF NOT EXISTS event_logs_created_at_idx ON public.event_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS event_logs_event_idx ON public.event_logs (event);
CREATE INDEX IF NOT EXISTS event_logs_order_id_idx ON public.event_logs (order_id);

GRANT SELECT ON public.event_logs TO authenticated;
GRANT ALL ON public.event_logs TO service_role;

ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read event logs" ON public.event_logs;
CREATE POLICY "Admins read event logs"
  ON public.event_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

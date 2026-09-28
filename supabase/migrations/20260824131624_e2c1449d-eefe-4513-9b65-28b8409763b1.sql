
DROP POLICY IF EXISTS "Admins read event logs" ON public.event_logs;
CREATE POLICY "Admins read event logs" ON public.event_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, anon, PUBLIC;

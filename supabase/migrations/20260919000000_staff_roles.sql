-- Staff roles: the main administrator creates named roles, chooses which parts
-- of the dashboard each role can use, then adds staff users (User ID + password)
-- with a role. Staff sign in on the normal sign-in page and only see what their
-- role allows.
--
-- "Main administrators" are the existing users with the admin role in
-- user_roles; they keep full access and are the only ones who can manage roles.

CREATE TABLE IF NOT EXISTS public.staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_roles_name_key ON public.staff_roles (lower(name));

CREATE TABLE IF NOT EXISTS public.staff_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  login_id text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  role_id uuid NOT NULL REFERENCES public.staff_roles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_members_login_key ON public.staff_members (lower(login_id));

-- True only for main administrators (the admin role in user_roles).
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

-- Can open the dashboard at all: a main administrator OR a staff member.
-- (Which pages a staff member may use is decided by their role in the app.)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.staff_members WHERE user_id = auth.uid());
$$;

-- What the signed-in user may open: ['*'] for main administrators, otherwise their role's list.
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN ARRAY['*']::text[]
    ELSE COALESCE((
      SELECT r.permissions
      FROM public.staff_members m JOIN public.staff_roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid()
    ), ARRAY[]::text[])
  END;
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM anon, public;
REVOKE ALL ON FUNCTION public.my_permissions() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_members TO authenticated;
GRANT ALL ON public.staff_roles TO service_role;
GRANT ALL ON public.staff_members TO service_role;

DROP POLICY IF EXISTS "Main admins manage roles" ON public.staff_roles;
CREATE POLICY "Main admins manage roles" ON public.staff_roles
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Main admins manage staff" ON public.staff_members;
CREATE POLICY "Main admins manage staff" ON public.staff_members
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

NOTIFY pgrst, 'reload schema';

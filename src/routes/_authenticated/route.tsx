import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState } from "@/components/admin/DataStates";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Show the spinner straight away instead of a blank page while access is checked.
  pendingMs: 0,
  pendingComponent: () => <LoadingState label="Loading dashboard…" />,
  beforeLoad: async () => {
    // The stored session is enough for the guard (no network round trip); the database
    // still checks the real token on every request, and is_admin() decides access.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: () => <Outlet />,
});

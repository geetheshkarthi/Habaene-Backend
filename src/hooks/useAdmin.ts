import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

/** True when the signed-in user holds the admin role. */
export function useIsAdmin() {
  const { user, loading } = useCurrentUser();
  const query = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // has_role(user_id, role) is intentionally not callable by `authenticated`
      // (see supabase/migrations/20260824131624_...sql) — it took an arbitrary
      // user_id, letting any signed-in user probe other users' roles. is_admin()
      // checks auth.uid() only, so it's safe to expose and is what stays granted.
      const { data, error } = await supabase.rpc("is_admin");
      if (error) throw error;
      return data === true;
    },
  });

  return {
    user,
    isAdmin: query.data === true,
    loading: loading || (!!user && query.isLoading),
    error: query.error,
  };
}

export async function signOut() {
  await supabase.auth.signOut();
}

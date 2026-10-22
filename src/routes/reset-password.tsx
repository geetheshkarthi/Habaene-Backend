import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyPermissions } from "@/lib/api/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — HABÄNE Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

const MIN_LENGTH = 8;

function ResetPasswordPage() {
  const navigate = useNavigate();
  // "checking" until the recovery link has been turned into a session.
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "blocked">("checking");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Only main administrators may set a password here; staff passwords are managed
    // by a main administrator from Admin Roles.
    async function allowIfMainAdmin() {
      try {
        const perms = await getMyPermissions();
        if (perms.includes("*")) {
          setState("ready");
        } else {
          setState("blocked");
          await supabase.auth.signOut();
        }
      } catch {
        setState("invalid");
      }
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        void allowIfMainAdmin();
      }
    });
    // The link's token is processed on load; if nothing arrives, the link is bad or expired.
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) await allowIfMainAdmin();
      else setState((s) => (s === "checking" ? "invalid" : s));
    }, 2500);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < MIN_LENGTH) {
      toast.error(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated — please sign in");
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <span className="eyebrow text-muted-foreground">Administrator access</span>
        <h1 className="mt-3 text-3xl">Reset password</h1>

        {state === "checking" && (
          <p className="mt-6 text-sm text-muted-foreground">Checking your reset link…</p>
        )}

        {state === "invalid" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
            <Button asChild className="w-full">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        )}

        {state === "blocked" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Only the main administrator can change passwords. Please ask them to change yours.
            </p>
            <Button asChild className="w-full">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        )}

        {state === "ready" && (
          <form onSubmit={submit} className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">At least {MIN_LENGTH} characters.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving || !next || !confirm}>
              {saving ? "Saving…" : "Set new password"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}

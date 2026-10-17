import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/change-password")({
  head: () => ({ meta: [{ title: "Passwords — HABÄNE Admin" }] }),
  component: ChangePasswordPage,
});

const MIN_LENGTH = 8;

function ChangePasswordPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: async () => {
      if (next.length < MIN_LENGTH) {
        throw new Error(`New password must be at least ${MIN_LENGTH} characters.`);
      }
      if (next !== confirm) throw new Error("New password and confirmation don't match.");
      if (next === current) throw new Error("New password must be different from the current one.");

      const { data: auth } = await supabase.auth.getUser();
      const email = auth.user?.email;
      if (!email) throw new Error("You're not signed in.");

      // Re-check the current password before allowing the change.
      const check = await supabase.auth.signInWithPassword({ email, password: current });
      if (check.error) throw new Error("Current password is incorrect.");

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ready = current && next && confirm && !change.isPending;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Passwords"
        description="Update the password for the account you're signed in with."
      />

      <form
        className="max-w-md space-y-4 rounded-lg border border-border bg-card p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) change.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
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
        <Button type="submit" disabled={!ready}>
          {change.isPending ? "Updating…" : "Change password"}
        </Button>
      </form>
    </div>
  );
}

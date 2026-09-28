import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getTeamMembers,
  assignRole,
  removeRole,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type AppRole,
} from "@/lib/api/admin";
import { dateShort } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/team")({
  head: () => ({ meta: [{ title: "Team — HABÄNE Admin" }] }),
  component: TeamPage,
});

const ROLES = Object.keys(ROLE_LABELS) as AppRole[];

function TeamPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<AppRole>("content_manager");

  const { data, isLoading, error } = useQuery({
    queryKey: ["team"],
    queryFn: getTeamMembers,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["team"] });

  const assign = useMutation({
    mutationFn: () => assignRole(userId.trim(), role),
    onSuccess: () => {
      toast.success("Role assigned");
      setOpen(false);
      setUserId("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: ({ uid, r }: { uid: string; r: AppRole }) => removeRole(uid, r),
    onSuccess: () => {
      toast.success("Role removed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;

  const members = data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Team"
        description="Grant and revoke module access. A user may hold more than one role."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Assign role</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign a role</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Supabase user ID</Label>
                  <Input
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Find this in Supabase under Authentication → Users. The person must already have
                    an account.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as AppRole)}
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Grants: {ROLE_PERMISSIONS[role].join(", ")}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => assign.mutate()}
                  disabled={!userId.trim() || assign.isPending}
                >
                  Assign
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : members.length === 0 ? (
        <EmptyState
          title="No team members"
          description="Assign a role to give someone access to this console."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">User</th>
                <th className="p-3">Role</th>
                <th className="p-3">Modules</th>
                <th className="p-3">Granted</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-border/50">
                  <td className="p-3">
                    <span className="block">{m.email ?? "—"}</span>
                    <span className="block text-xs text-muted-foreground">{m.user_id}</span>
                  </td>
                  <td className="p-3">{ROLE_LABELS[m.role] ?? m.role}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {(ROLE_PERMISSIONS[m.role] ?? []).join(", ")}
                  </td>
                  <td className="p-3 text-muted-foreground">{dateShort(m.created_at)}</td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate({ uid: m.user_id, r: m.role })}
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold">Role reference</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r} className="rounded-md border border-border p-3">
              <p className="text-sm font-medium">{ROLE_LABELS[r]}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r === "admin" ? "Full access to every module." : ROLE_PERMISSIONS[r].join(", ")}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

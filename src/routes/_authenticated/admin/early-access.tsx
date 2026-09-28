import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getEarlyAccessList, inviteEarlyAccess, addToEarlyAccess } from "@/lib/api/marketing";
import { dateShort, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatCard } from "@/components/admin/AnalyticsKit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/early-access")({
  head: () => ({ meta: [{ title: "Early Access — HABÄNE Admin" }] }),
  component: EarlyAccessPage,
});

function EarlyAccessPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "invited" | "waiting">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["early-access"],
    queryFn: () => getEarlyAccessList(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["early-access"] });
    setSelected([]);
  };

  const invite = useMutation({
    mutationFn: (ids: string[]) => inviteEarlyAccess(ids),
    onSuccess: () => {
      toast.success("Invitations marked as sent");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const add = useMutation({
    mutationFn: () => addToEarlyAccess(email.trim()),
    onSuccess: () => {
      toast.success("Added to early access");
      setOpen(false);
      setEmail("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;

  const all = data ?? [];
  const rows = all.filter((e) =>
    filter === "all" ? true : filter === "invited" ? e.is_invited : !e.is_invited,
  );
  const waiting = all.filter((e) => !e.is_invited).length;

  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  function toggleAll() {
    setSelected(allSelected ? [] : rows.map((r) => r.id));
  }

  function toggleOne(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Marketing"
        title="Early Access"
        description="Customers queued for exclusive product access and limited drops."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!all.length}
              onClick={() => downloadFile("early-access.csv", toCsv(all))}
            >
              Export CSV
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              Add person
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="On the List" value={all.length} />
        <StatCard label="Invited" value={all.length - waiting} />
        <StatCard label="Waiting" value={waiting} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "waiting", "invited"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md border px-3 py-1.5 text-xs capitalize transition-colors ${
              filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            {f}
          </button>
        ))}
        {selected.length > 0 && (
          <Button size="sm" disabled={invite.isPending} onClick={() => invite.mutate(selected)}>
            Invite {selected.length} selected
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nobody on the list"
          description="Sign-ups from the storefront early-access form land here."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th className="p-3">Email</th>
                <th className="p-3">Source</th>
                <th className="p-3">Drop</th>
                <th className="p-3">Status</th>
                <th className="p-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-border/50">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(e.id)}
                      onChange={() => toggleOne(e.id)}
                    />
                  </td>
                  <td className="p-3">{e.email}</td>
                  <td className="p-3 text-muted-foreground">{e.source}</td>
                  <td className="p-3 text-muted-foreground">{e.drop_id ?? "—"}</td>
                  <td className="p-3">
                    {e.is_invited ? (
                      <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                        invited {e.invited_at ? dateShort(e.invited_at) : ""}
                      </span>
                    ) : (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        waiting
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{dateShort(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to early access</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => add.mutate()} disabled={!email.trim() || add.isPending}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

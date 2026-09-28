import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  type Webhook,
} from "@/lib/api/admin";
import { dateTime } from "@/lib/format";
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
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/webhooks")({
  head: () => ({ meta: [{ title: "Webhooks — HABÄNE Admin" }] }),
  component: WebhooksPage,
});

/** The event catalogue from the backend scope document. */
const EVENTS = [
  "order.created",
  "payment.successful",
  "payment.failed",
  "shipment.created",
  "shipment.delivered",
  "refund.created",
  "inventory.changed",
  "product.updated",
];

const STATUS_STYLES: Record<Webhook["status"], string> = {
  active: "bg-green-500/10 text-green-600",
  inactive: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
};

type FormState = { name: string; url: string; secret: string; events: string[] };

const EMPTY: FormState = { name: "", url: "", secret: "", events: [] };

function WebhooksPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data, isLoading, error } = useQuery({ queryKey: ["webhooks"], queryFn: getWebhooks });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["webhooks"] });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        url: form.url.trim(),
        secret: form.secret.trim() || null,
        events: form.events,
      };
      return editing ? updateWebhook(editing.id, payload) : createWebhook(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Webhook updated" : "Webhook created");
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (w: Webhook) =>
      updateWebhook(w.id, { status: w.status === "active" ? "inactive" : "active" }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteWebhook,
    onSuccess: () => {
      toast.success("Webhook deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;

  const rows = data ?? [];

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(w: Webhook) {
    setEditing(w);
    setForm({ name: w.name, url: w.url, secret: w.secret ?? "", events: w.events ?? [] });
    setOpen(true);
  }

  function toggleEvent(ev: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((x) => x !== ev) : [...f.events, ev],
    }));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Webhooks"
        description="Notify external systems when commerce events occur."
        actions={
          <Button size="sm" onClick={openNew}>
            New webhook
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No webhooks"
          description="Add an endpoint to receive order, payment, shipment and inventory events."
          action={
            <Button size="sm" onClick={openNew}>
              New webhook
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">Name</th>
                <th className="p-3">Endpoint</th>
                <th className="p-3">Events</th>
                <th className="p-3">Status</th>
                <th className="p-3">Last triggered</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="border-b border-border/50 align-top">
                  <td className="p-3">{w.name}</td>
                  <td className="max-w-xs truncate p-3 text-muted-foreground">{w.url}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {(w.events ?? []).join(", ") || "—"}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[w.status]}`}
                    >
                      {w.status}
                    </span>
                    {w.failure_count > 0 && (
                      <span className="ml-2 text-xs text-destructive">
                        {w.failure_count} failures
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {w.last_triggered_at ? dateTime(w.last_triggered_at) : "Never"}
                    {w.last_response_code != null && (
                      <span className="ml-2 text-xs">HTTP {w.last_response_code}</span>
                    )}
                  </td>
                  <td className="space-x-1 whitespace-nowrap p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(w)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggle.mutate(w)}>
                      {w.status === "active" ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => remove.mutate(w.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit webhook" : "New webhook"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Endpoint URL</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://example.com/hooks/habane"
              />
            </div>
            <div className="space-y-2">
              <Label>Signing secret (optional)</Label>
              <Input
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              <div className="grid grid-cols-2 gap-2">
                {EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.events.includes(ev)}
                      onChange={() => toggleEvent(ev)}
                    />
                    {ev}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={
                !form.name.trim() || !form.url.trim() || form.events.length === 0 || save.isPending
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

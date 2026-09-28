import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getProductDrops,
  createProductDrop,
  updateProductDrop,
  type ProductDrop,
} from "@/lib/api/inventory";
import { dateTime } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/product-drops")({
  head: () => ({ meta: [{ title: "Product Drops — HABÄNE Admin" }] }),
  component: ProductDropsPage,
});

const STATUSES: ProductDrop["status"][] = ["draft", "scheduled", "active", "sold_out", "ended"];

const STATUS_STYLES: Record<ProductDrop["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-500/10 text-blue-600",
  active: "bg-green-500/10 text-green-600",
  sold_out: "bg-amber-500/10 text-amber-600",
  ended: "bg-muted text-muted-foreground",
};

type FormState = {
  name: string;
  description: string;
  status: ProductDrop["status"];
  launch_at: string;
  end_at: string;
  purchase_limit_per_customer: string;
  is_early_access_only: boolean;
};

const EMPTY: FormState = {
  name: "",
  description: "",
  status: "draft",
  launch_at: "",
  end_at: "",
  purchase_limit_per_customer: "",
  is_early_access_only: false,
};

/** Human countdown to launch, or null once it has passed. */
function countdown(launchAt: string): string | null {
  const ms = new Date(launchAt).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return null;
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function ProductDropsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductDrop | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data, isLoading, error } = useQuery({
    queryKey: ["product-drops", filter],
    queryFn: () => getProductDrops(filter === "all" ? undefined : filter),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["product-drops"] });

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<ProductDrop> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
        launch_at: new Date(form.launch_at).toISOString(),
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        purchase_limit_per_customer:
          form.purchase_limit_per_customer === "" ? null : Number(form.purchase_limit_per_customer),
        is_early_access_only: form.is_early_access_only,
      };
      return editing ? updateProductDrop(editing.id, payload) : createProductDrop(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Drop updated" : "Drop created");
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProductDrop["status"] }) =>
      updateProductDrop(id, { status }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;

  const rows = data ?? [];

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(d: ProductDrop) {
    setEditing(d);
    setForm({
      name: d.name,
      description: d.description ?? "",
      status: d.status,
      launch_at: d.launch_at ? d.launch_at.slice(0, 16) : "",
      end_at: d.end_at ? d.end_at.slice(0, 16) : "",
      purchase_limit_per_customer:
        d.purchase_limit_per_customer == null ? "" : String(d.purchase_limit_per_customer),
      is_early_access_only: d.is_early_access_only,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Products & Inventory"
        title="Product Drops"
        description="Timed launches with countdown, early access and purchase limits."
        actions={
          <Button size="sm" onClick={openNew}>
            New drop
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {["all", ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-md border px-3 py-1.5 text-xs capitalize transition-colors ${
              filter === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No drops"
          description="Schedule a limited launch with a countdown and purchase limit."
          action={
            <Button size="sm" onClick={openNew}>
              New drop
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((d) => {
            const remaining = countdown(d.launch_at);
            return (
              <div key={d.id} className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold">{d.name}</h3>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[d.status]}`}
                  >
                    {d.status.replace(/_/g, " ")}
                  </span>
                </div>
                {d.description && (
                  <p className="mt-2 text-xs text-muted-foreground">{d.description}</p>
                )}

                <p className="mt-4 text-2xl font-semibold">{remaining ?? "Live"}</p>
                <p className="text-xs text-muted-foreground">
                  {remaining ? "until launch" : "launched"} · {dateTime(d.launch_at)}
                </p>

                <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
                  {d.is_early_access_only && <li>Early access only</li>}
                  {d.purchase_limit_per_customer != null && (
                    <li>Limit {d.purchase_limit_per_customer} per customer</li>
                  )}
                  {d.end_at && <li>Ends {dateTime(d.end_at)}</li>}
                </ul>

                <div className="mt-4 flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(d)}>
                    Edit
                  </Button>
                  {d.status !== "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStatus.mutate({ id: d.id, status: "active" })}
                    >
                      Go live
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStatus.mutate({ id: d.id, status: "ended" })}
                    >
                      End
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit drop" : "New drop"}</DialogTitle>
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
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Launch at</Label>
                <Input
                  type="datetime-local"
                  value={form.launch_at}
                  onChange={(e) => setForm((f) => ({ ...f, launch_at: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Ends at</Label>
                <Input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Purchase limit per customer</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.purchase_limit_per_customer}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, purchase_limit_per_customer: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as ProductDrop["status"] }))
                  }
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm capitalize"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_early_access_only}
                onChange={(e) => setForm((f) => ({ ...f, is_early_access_only: e.target.checked }))}
              />
              Early access customers only
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!form.name.trim() || !form.launch_at || save.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

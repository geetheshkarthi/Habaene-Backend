import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  type Promotion,
} from "@/lib/api/marketing";
import { money, dateShort } from "@/lib/format";
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

export const Route = createFileRoute("/_authenticated/admin/promotions")({
  head: () => ({ meta: [{ title: "Promotions — HABÄNE Admin" }] }),
  component: PromotionsPage,
});

const TYPES: { value: Promotion["type"]; label: string; needsValue: boolean }[] = [
  { value: "percent", label: "Percentage off", needsValue: true },
  { value: "fixed", label: "Fixed amount off", needsValue: true },
  { value: "free_shipping", label: "Free shipping", needsValue: false },
  { value: "buy_x_get_y", label: "Buy X get Y", needsValue: true },
];

const STATUSES: Promotion["status"][] = ["draft", "scheduled", "active", "paused", "expired"];

const STATUS_STYLES: Record<Promotion["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-500/10 text-blue-600",
  active: "bg-green-500/10 text-green-600",
  paused: "bg-amber-500/10 text-amber-600",
  expired: "bg-destructive/10 text-destructive",
};

type FormState = {
  name: string;
  description: string;
  type: Promotion["type"];
  value: string;
  status: Promotion["status"];
  start_at: string;
  end_at: string;
  min_order: string;
};

const EMPTY: FormState = {
  name: "",
  description: "",
  type: "percent",
  value: "",
  status: "draft",
  start_at: "",
  end_at: "",
  min_order: "",
};

function toIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

function toLocal(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

function PromotionsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data, isLoading, error } = useQuery({
    queryKey: ["promotions", filter],
    queryFn: () => getPromotions(filter === "all" ? undefined : filter),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["promotions"] });

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<Promotion> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        type: form.type,
        value: form.value === "" ? null : Number(form.value),
        status: form.status,
        start_at: toIso(form.start_at),
        end_at: toIso(form.end_at),
        min_order: form.min_order === "" ? null : Number(form.min_order),
      };
      return editing ? updatePromotion(editing.id, payload) : createPromotion(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Promotion updated" : "Promotion created");
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Promotion["status"] }) =>
      updatePromotion(id, { status }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deletePromotion,
    onSuccess: () => {
      toast.success("Promotion deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;

  const rows = data ?? [];
  const activeType = TYPES.find((t) => t.value === form.type)!;

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(p: Promotion) {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      type: p.type,
      value: p.value == null ? "" : String(p.value),
      status: p.status,
      start_at: toLocal(p.start_at),
      end_at: toLocal(p.end_at),
      min_order: p.min_order == null ? "" : String(p.min_order),
    });
    setOpen(true);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Marketing"
        title="Promotions"
        description="Seasonal sales, launch offers and limited-time campaigns."
        actions={
          <Button size="sm" onClick={openNew}>
            New promotion
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
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No promotions"
          description="Create a weekend sale, launch offer or seasonal campaign."
          action={
            <Button size="sm" onClick={openNew}>
              New promotion
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Value</th>
                <th className="p-3">Runs</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Used</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="p-3">
                    <span className="block">{p.name}</span>
                    {p.description && (
                      <span className="block max-w-xs truncate text-xs text-muted-foreground">
                        {p.description}
                      </span>
                    )}
                  </td>
                  <td className="p-3">{TYPES.find((t) => t.value === p.type)?.label ?? p.type}</td>
                  <td className="p-3">
                    {p.value == null
                      ? "—"
                      : p.type === "percent"
                        ? `${p.value}%`
                        : p.type === "fixed"
                          ? money(p.value)
                          : p.value}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {p.start_at ? dateShort(p.start_at) : "—"} →{" "}
                    {p.end_at ? dateShort(p.end_at) : "—"}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[p.status]}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">{p.usage_count}</td>
                  <td className="space-x-1 whitespace-nowrap p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      Edit
                    </Button>
                    {p.status === "active" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStatus.mutate({ id: p.id, status: "paused" })}
                      >
                        Pause
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStatus.mutate({ id: p.id, status: "active" })}
                      >
                        Activate
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => remove.mutate(p.id)}
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
            <DialogTitle>{editing ? "Edit promotion" : "New promotion"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Black Friday 2026"
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
                <Label>Type</Label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value as Promotion["type"] }))
                  }
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input
                  type="number"
                  step="0.01"
                  disabled={!activeType.needsValue}
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder={form.type === "percent" ? "20" : "50.00"}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Starts</Label>
                <Input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Ends</Label>
                <Input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Minimum order (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.min_order}
                  onChange={(e) => setForm((f) => ({ ...f, min_order: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as Promotion["status"] }))
                  }
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm capitalize"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

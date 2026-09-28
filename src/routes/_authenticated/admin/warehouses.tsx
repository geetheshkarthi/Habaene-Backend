import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  type Warehouse,
} from "@/lib/api/inventory";
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
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/warehouses")({
  head: () => ({ meta: [{ title: "Warehouses — HABÄNE Admin" }] }),
  component: WarehousesPage,
});

type FormState = {
  name: string;
  code: string;
  line1: string;
  city: string;
  postal_code: string;
  country: string;
  is_active: boolean;
  is_default: boolean;
};

const EMPTY: FormState = {
  name: "",
  code: "",
  line1: "",
  city: "",
  postal_code: "",
  country: "DE",
  is_active: true,
  is_default: false,
};

function addressLine(address: Record<string, unknown>): string {
  const parts = [address["line1"], address["postal_code"], address["city"], address["country"]]
    .filter((p) => typeof p === "string" && p.trim() !== "")
    .map(String);
  return parts.join(", ") || "—";
}

function WarehousesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data, isLoading, error } = useQuery({ queryKey: ["warehouses"], queryFn: getWarehouses });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["warehouses"] });

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<Warehouse> = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        address: {
          line1: form.line1.trim(),
          city: form.city.trim(),
          postal_code: form.postal_code.trim(),
          country: form.country.trim().toUpperCase(),
        },
        is_active: form.is_active,
        is_default: form.is_default,
      };
      return editing ? updateWarehouse(editing.id, payload) : createWarehouse(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Warehouse updated" : "Warehouse created");
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteWarehouse,
    onSuccess: () => {
      toast.success("Warehouse deleted");
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

  function openEdit(w: Warehouse) {
    const a = w.address ?? {};
    setEditing(w);
    setForm({
      name: w.name,
      code: w.code,
      line1: String(a["line1"] ?? ""),
      city: String(a["city"] ?? ""),
      postal_code: String(a["postal_code"] ?? ""),
      country: String(a["country"] ?? "DE"),
      is_active: w.is_active,
      is_default: w.is_default,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Products & Inventory"
        title="Warehouses"
        description="Locations that hold stock. One warehouse is the default for new inventory."
        actions={
          <Button size="sm" onClick={openNew}>
            New warehouse
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No warehouses"
          description="Add your first stock location."
          action={
            <Button size="sm" onClick={openNew}>
              New warehouse
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">Name</th>
                <th className="p-3">Code</th>
                <th className="p-3">Address</th>
                <th className="p-3">State</th>
                <th className="p-3">Created</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="border-b border-border/50">
                  <td className="p-3">
                    {w.name}
                    {w.is_default && (
                      <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        default
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs">{w.code}</td>
                  <td className="p-3 text-muted-foreground">{addressLine(w.address ?? {})}</td>
                  <td className="p-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        w.is_active
                          ? "bg-green-500/10 text-green-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {w.is_active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{dateShort(w.created_at)}</td>
                  <td className="space-x-1 whitespace-nowrap p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(w)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={w.is_default}
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
            <DialogTitle>{editing ? "Edit warehouse" : "New warehouse"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Code</Label>
                <Input
                  value={form.code}
                  placeholder="BER-01"
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Street</Label>
              <Input
                value={form.line1}
                onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Postal code</Label>
                <Input
                  value={form.postal_code}
                  onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Input
                  value={form.country}
                  maxLength={2}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                />
                Default location
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!form.name.trim() || !form.code.trim() || save.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

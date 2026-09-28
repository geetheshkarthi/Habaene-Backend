import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  receivePurchaseOrder,
  getSuppliers,
  getWarehouses,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from "@/lib/api/inventory";
import { getProducts } from "@/lib/api/products";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/admin/purchase-orders")({
  head: () => ({ meta: [{ title: "Purchase Orders — HABÄNE Admin" }] }),
  component: PurchaseOrdersPage,
});

const STATUSES: PurchaseOrder["status"][] = ["draft", "sent", "partial", "received", "cancelled"];

const STATUS_STYLES: Record<PurchaseOrder["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/10 text-blue-600",
  partial: "bg-amber-500/10 text-amber-600",
  received: "bg-green-500/10 text-green-600",
  cancelled: "bg-destructive/10 text-destructive",
};

type DraftItem = {
  product_id: string;
  product_name: string;
  ordered_quantity: number;
  unit_cost: number;
};

function PurchaseOrdersPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [received, setReceived] = useState<Record<string, { received: string; damaged: string }>>(
    {},
  );

  const pos = useQuery({
    queryKey: ["purchase-orders", filter],
    queryFn: () => getPurchaseOrders(filter === "all" ? undefined : filter),
  });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => getSuppliers() });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: getWarehouses });
  const products = useQuery({ queryKey: ["products"], queryFn: () => getProducts() });
  const detail = useQuery({
    queryKey: ["purchase-order", detailId],
    enabled: !!detailId,
    queryFn: () => getPurchaseOrder(detailId!),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["purchase-orders"] });

  const create = useMutation({
    mutationFn: () =>
      createPurchaseOrder(
        {
          supplier_id: supplierId || null,
          warehouse_id: warehouseId || null,
          expected_delivery_date: expected ? new Date(expected).toISOString() : null,
          notes: notes.trim() || null,
          status: "draft",
          total_cost: items.reduce((a, i) => a + i.ordered_quantity * i.unit_cost, 0),
        },
        items.map((i) => ({
          product_id: i.product_id,
          product_name: i.product_name,
          ordered_quantity: i.ordered_quantity,
          unit_cost: i.unit_cost,
        })),
      ),
    onSuccess: () => {
      toast.success("Purchase order created");
      setOpen(false);
      setItems([]);
      setNotes("");
      setExpected("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const receive = useMutation({
    mutationFn: (poItems: PurchaseOrderItem[]) =>
      receivePurchaseOrder(
        detailId!,
        poItems.map((i) => ({
          item_id: i.id,
          received_quantity: Number(received[i.id]?.received ?? i.ordered_quantity),
          damaged_quantity: Number(received[i.id]?.damaged ?? 0),
        })),
      ),
    onSuccess: () => {
      toast.success("Stock received and inventory updated");
      setDetailId(null);
      setReceived({});
      invalidate();
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const error = pos.error ?? suppliers.error ?? warehouses.error;
  if (error) return <ErrorState error={error} />;

  const rows = pos.data ?? [];
  const supplierList = suppliers.data ?? [];
  const supplierById = new Map(supplierList.map((s) => [s.id, s.name]));
  const productList = products.data ?? [];

  function addItem() {
    const first = productList[0];
    if (!first) {
      toast.error("No products to order");
      return;
    }
    setItems((it) => [
      ...it,
      { product_id: first.id, product_name: first.name, ordered_quantity: 1, unit_cost: 0 },
    ]);
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((it) => it.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  const draftTotal = items.reduce((a, i) => a + i.ordered_quantity * i.unit_cost, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Products & Inventory"
        title="Purchase Orders"
        description="Order stock from suppliers and book it into inventory on arrival."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            New purchase order
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

      {pos.isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No purchase orders"
          description="Create one to record incoming stock and its cost."
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              New purchase order
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">PO Number</th>
                <th className="p-3">Supplier</th>
                <th className="p-3">Expected</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Total Cost</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((po) => (
                <tr key={po.id} className="border-b border-border/50">
                  <td className="p-3 font-mono text-xs">{po.po_number}</td>
                  <td className="p-3">
                    {po.supplier_id ? (supplierById.get(po.supplier_id) ?? "—") : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {po.expected_delivery_date ? dateShort(po.expected_delivery_date) : "—"}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[po.status]}`}
                    >
                      {po.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">{money(po.total_cost)}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setDetailId(po.id)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New purchase order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {supplierList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Warehouse</Label>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {(warehouses.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Expected delivery</Label>
                <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                <Button variant="outline" size="sm" onClick={addItem}>
                  Add line
                </Button>
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lines yet.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_80px_100px_auto] items-center gap-2"
                    >
                      <select
                        value={item.product_id}
                        onChange={(e) => {
                          const p = productList.find((x) => x.id === e.target.value);
                          updateItem(i, {
                            product_id: e.target.value,
                            product_name: p?.name ?? "",
                          });
                        }}
                        className="rounded-md border border-border bg-input px-2 py-1.5 text-sm"
                      >
                        {productList.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min={1}
                        value={item.ordered_quantity}
                        onChange={(e) =>
                          updateItem(i, { ordered_quantity: Number(e.target.value) })
                        }
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(e) => updateItem(i, { unit_cost: Number(e.target.value) })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setItems((it) => it.filter((_, x) => x !== i))}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <p className="text-right text-sm font-medium">Total {money(draftTotal)}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={items.length === 0 || create.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail / receive */}
      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{detail.data?.po.po_number ?? "Purchase order"}</SheetTitle>
          </SheetHeader>
          {detail.isLoading ? (
            <LoadingState />
          ) : detail.data ? (
            <div className="space-y-6 p-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt className="text-muted-foreground">Status</dt>
                <dd>{detail.data.po.status}</dd>
                <dt className="text-muted-foreground">Expected</dt>
                <dd>
                  {detail.data.po.expected_delivery_date
                    ? dateShort(detail.data.po.expected_delivery_date)
                    : "—"}
                </dd>
                <dt className="text-muted-foreground">Total cost</dt>
                <dd>{money(detail.data.po.total_cost)}</dd>
              </dl>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Receive stock</h3>
                {detail.data.items.map((item) => (
                  <div key={item.id} className="rounded-md border border-border p-3">
                    <p className="text-sm font-medium">{item.product_name}</p>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Ordered {item.ordered_quantity} at {money(item.unit_cost)}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Received</Label>
                        <Input
                          type="number"
                          min={0}
                          value={received[item.id]?.received ?? String(item.ordered_quantity)}
                          onChange={(e) =>
                            setReceived((r) => ({
                              ...r,
                              [item.id]: {
                                received: e.target.value,
                                damaged: r[item.id]?.damaged ?? "0",
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Damaged</Label>
                        <Input
                          type="number"
                          min={0}
                          value={received[item.id]?.damaged ?? "0"}
                          onChange={(e) =>
                            setReceived((r) => ({
                              ...r,
                              [item.id]: {
                                received: r[item.id]?.received ?? String(item.ordered_quantity),
                                damaged: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button
                  className="w-full"
                  disabled={detail.data.po.status === "received" || receive.isPending}
                  onClick={() => receive.mutate(detail.data!.items)}
                >
                  {detail.data.po.status === "received" ? "Already received" : "Mark received"}
                </Button>
              </div>

              {detail.data.po.notes && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold">Notes</h3>
                  <p className="text-sm text-muted-foreground">{detail.data.po.notes}</p>
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

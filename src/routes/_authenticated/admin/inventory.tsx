import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState, EmptyState } from "@/components/admin/DataStates";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  getInventoryOverview,
  getInventoryMovements,
  adjustProductStock,
  type InventoryOverviewRow,
} from "@/lib/api/inventory";
import { setProductActive, deleteProduct } from "@/lib/api/products";
import { PRODUCT_CATEGORIES } from "@/lib/api/types";
import { money, toCsv, downloadFile } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  head: () => ({ meta: [{ title: "Inventory — HABÄNE Admin" }] }),
  component: InventoryPage,
});

const LOW_STOCK_THRESHOLD = 10;

function stockClass(stock: number) {
  if (stock === 0) return "text-destructive font-semibold";
  if (stock < LOW_STOCK_THRESHOLD) return "text-warning-foreground font-semibold";
  return "";
}

function InventoryPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "low" | "out" | "log">("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [adjustFor, setAdjustFor] = useState<InventoryOverviewRow | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");

  const stockFilter = tab === "low" ? "low" : tab === "out" ? "out" : "all";

  const overview = useQuery({
    queryKey: ["inventory-overview", search, category, stockFilter],
    queryFn: () => getInventoryOverview({ search, category, stockFilter }),
    enabled: tab !== "log",
  });

  // Unfiltered pass just for the alert banners/summary cards, so switching
  // tabs/filters doesn't make the KPIs at the top jump around.
  const allItems = useQuery({
    queryKey: ["inventory-overview", "", "all", "all"],
    queryFn: () => getInventoryOverview({}),
  });

  const movements = useQuery({
    queryKey: ["inventory-movements", "all"],
    queryFn: () => getInventoryMovements(undefined, 50),
    enabled: tab === "log",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inventory-overview"] });
    qc.invalidateQueries({ queryKey: ["inventory-movements"] });
  };

  const adjust = useMutation({
    mutationFn: () => adjustProductStock(adjustFor!.id, adjustQty, adjustReason),
    onSuccess: () => {
      toast.success("Stock updated");
      setAdjustFor(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setProductActive(id, active),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      toast.success("Product archived");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openAdjust(row: InventoryOverviewRow) {
    setAdjustFor(row);
    setAdjustQty(row.stock);
    setAdjustReason("");
  }

  function exportCsv() {
    const rows = (allItems.data ?? []).map((r) => ({
      code: r.code,
      name: r.name,
      category: r.category,
      available: r.stock,
      damaged_returned: r.damaged_returned,
      incoming: r.incoming,
      cost_price: r.cost_price,
      sell_price: r.price,
      inventory_value: r.inventory_value,
    }));
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadFile(`habaene-inventory-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  const items = allItems.data ?? [];
  const outOfStockCount = items.filter((r) => r.stock === 0).length;
  const lowStockCount = items.filter((r) => r.stock > 0 && r.stock < LOW_STOCK_THRESHOLD).length;
  const totalUnits = items.reduce((s, r) => s + r.stock, 0);
  const totalValue = items.reduce((s, r) => s + r.inventory_value, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="E-Commerce"
        title="Inventory Management"
        description="Stock, incoming purchase orders and damaged/returned units, all from one place."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button asChild>
              <Link to="/admin/products">+ Add item</Link>
            </Button>
          </div>
        }
      />

      {outOfStockCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">
            Out of Stock Alert: {outOfStockCount} product(s) have 0 available units.
          </p>
          <Button size="sm" variant="outline" onClick={() => setTab("out")}>
            View Out of Stock
          </Button>
        </div>
      )}
      {lowStockCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-semibold text-warning-foreground">
            Low Stock Alert: {lowStockCount} product(s) are low in stock.
          </p>
          <Button size="sm" variant="outline" onClick={() => setTab("low")}>
            View Low Stock
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Total Inventory Valuation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{money(totalValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Total Stock Units
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{totalUnits.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-warning-foreground">{lowStockCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Out of Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-destructive">{outOfStockCount}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="all">All Items ({items.length})</TabsTrigger>
            <TabsTrigger value="low">Low Stock ({lowStockCount})</TabsTrigger>
            <TabsTrigger value="out">Out of Stock ({outOfStockCount})</TabsTrigger>
            <TabsTrigger value="log">Movement &amp; Adjustments Log</TabsTrigger>
          </TabsList>
          {tab !== "log" && (
            <div className="flex flex-wrap gap-3">
              <Input
                placeholder="Search item name or code…"
                className="max-w-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {(["all", "low", "out"] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            {overview.isLoading ? (
              <LoadingState />
            ) : overview.error ? (
              <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
            ) : (overview.data ?? []).length === 0 ? (
              <EmptyState title="No items" description="Nothing matches this view yet." />
            ) : (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item / Batch Details</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">Damaged / Returned</TableHead>
                      <TableHead className="text-right">Incoming</TableHead>
                      <TableHead className="text-right">Unit Cost / Value</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(overview.data ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {r.card_image && (
                              <img
                                src={r.card_image}
                                alt=""
                                className="h-10 w-10 rounded-md object-cover"
                              />
                            )}
                            <div>
                              <p className="font-medium">{r.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {r.code} · {r.weight_kg}kg
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">{r.category}</TableCell>
                        <TableCell className={"text-right " + stockClass(r.stock)}>
                          {r.stock} units
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {r.damaged_returned}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {r.incoming}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          <p>Cost: {money(r.cost_price)}</p>
                          <p>Sell: {money(r.price)}</p>
                        </TableCell>
                        <TableCell className="space-x-1 text-right whitespace-nowrap">
                          <Button size="sm" variant="outline" onClick={() => openAdjust(r)}>
                            Update Stock
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleActive.mutate({ id: r.id, active: !r.is_active })}
                          >
                            {r.is_active ? "Remove from Website" : "Show on Website"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => archive.mutate(r.id)}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        ))}

        <TabsContent value="log" className="mt-4">
          {movements.isLoading ? (
            <LoadingState />
          ) : (movements.data ?? []).length === 0 ? (
            <EmptyState
              title="No movements"
              description="Stock adjustments and receipts will show up here."
            />
          ) : (
            <div className="space-y-2 rounded-lg border border-border bg-card p-5">
              {(movements.data ?? []).map((m) => (
                <div key={m.id} className="flex items-baseline justify-between text-sm">
                  <div>
                    <StatusBadge value={m.movement_type} />
                    <span
                      className={`ml-2 font-medium ${m.quantity_change > 0 ? "text-success" : "text-destructive"}`}
                    >
                      {m.quantity_change > 0 ? "+" : ""}
                      {m.quantity_change}
                    </span>
                    {m.reason && (
                      <span className="ml-2 text-xs text-muted-foreground">({m.reason})</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {m.quantity_before} → {m.quantity_after} ·{" "}
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!adjustFor} onOpenChange={(o) => !o && setAdjustFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update stock — {adjustFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>New quantity</Label>
              <Input
                type="number"
                min={0}
                value={adjustQty}
                onChange={(e) => setAdjustQty(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                placeholder="e.g. Stock count correction"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustFor(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => adjust.mutate()}
              disabled={adjust.isPending || !adjustReason.trim()}
            >
              {adjust.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

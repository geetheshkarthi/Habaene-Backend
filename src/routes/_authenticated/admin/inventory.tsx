import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
import {
  getLowStockProducts,
  getInventoryMovements,
  adjustProductStock,
} from "@/lib/api/inventory";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  head: () => ({ meta: [{ title: "Inventory — HABÄNE Admin" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState("");
  const qc = useQueryClient();

  const productsQ = useQuery({
    queryKey: ["products-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, stock, is_active")
        .is("deleted_at", null)
        .order("stock");
      if (error) throw error;
      return data;
    },
  });

  const lowStockQ = useQuery({
    queryKey: ["low-stock"],
    queryFn: () => getLowStockProducts(10),
    staleTime: 60_000,
  });

  const movementsQ = useQuery({
    queryKey: ["inventory-movements", selectedProduct],
    queryFn: () =>
      selectedProduct ? getInventoryMovements(selectedProduct, 20) : Promise.resolve([]),
    enabled: !!selectedProduct,
  });

  const adjustMutation = useMutation({
    mutationFn: () => adjustProductStock(selectedProduct!, adjustQty, adjustReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products-inventory"] });
      qc.invalidateQueries({ queryKey: ["low-stock"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements", selectedProduct] });
      setAdjustQty(0);
      setAdjustReason("");
    },
  });

  if (productsQ.isLoading) return <LoadingState />;
  if (productsQ.error)
    return <ErrorState error={productsQ.error} onRetry={() => productsQ.refetch()} />;

  const products = productsQ.data ?? [];
  const low = lowStockQ.data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="E-Commerce" title="Inventory Management" />

      {/* Alerts */}
      {low.length > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
          <p className="text-sm font-semibold text-yellow-500">
            {low.length} products need attention
          </p>
          <ul className="mt-2 space-y-1">
            {low.slice(0, 5).map((p) => (
              <li key={p.id} className="flex justify-between text-sm">
                <span>{p.name}</span>
                <span
                  className={
                    p.level === "critical" ? "text-destructive font-bold" : "text-yellow-500"
                  }
                >
                  {p.stock} left
                </span>
              </li>
            ))}
            {low.length > 5 && (
              <li className="text-xs text-muted-foreground">+{low.length - 5} more…</li>
            )}
          </ul>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Product Stock Table */}
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">All Products</h2>
          </div>
          <div className="divide-y divide-border">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProduct(p.id)}
                className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm transition-colors hover:bg-accent/40 ${selectedProduct === p.id ? "bg-accent/60" : ""}`}
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.code}</p>
                </div>
                <span
                  className={`font-mono text-sm ${p.stock === 0 ? "text-destructive font-bold" : p.stock < 10 ? "text-yellow-500" : "text-green-500"}`}
                >
                  {p.stock}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Stock adjustment & history */}
        {selectedProduct && (
          <div className="space-y-4">
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold">Adjust Stock</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">New Quantity</label>
                  <input
                    type="number"
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-border bg-input px-3 py-2 text-sm"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Reason</label>
                  <input
                    type="text"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="mt-1 w-full rounded border border-border bg-input px-3 py-2 text-sm"
                    placeholder="e.g. Stock count correction"
                  />
                </div>
                <button
                  onClick={() => adjustMutation.mutate()}
                  disabled={adjustMutation.isPending || !adjustReason}
                  className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {adjustMutation.isPending ? "Saving…" : "Save Adjustment"}
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold">Movement History</h2>
              {movementsQ.isLoading ? (
                <LoadingState />
              ) : (
                <div className="space-y-2">
                  {(movementsQ.data ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">No movements recorded.</p>
                  )}
                  {(movementsQ.data ?? []).map((m) => (
                    <div key={m.id} className="flex items-baseline justify-between text-sm">
                      <div>
                        <span
                          className={`font-medium ${m.quantity_change > 0 ? "text-green-500" : "text-destructive"}`}
                        >
                          {m.quantity_change > 0 ? "+" : ""}
                          {m.quantity_change}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {m.movement_type}
                        </span>
                        {m.reason && (
                          <span className="ml-2 text-xs text-muted-foreground">({m.reason})</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {m.quantity_before} → {m.quantity_after}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

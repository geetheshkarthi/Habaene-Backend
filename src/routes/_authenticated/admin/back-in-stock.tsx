import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getBackInStockRequests } from "@/lib/api/inventory";
import { getProducts } from "@/lib/api/products";
import { dateShort, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatCard, Section } from "@/components/admin/AnalyticsKit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/back-in-stock")({
  head: () => ({ meta: [{ title: "Back in Stock — HABÄNE Admin" }] }),
  component: BackInStockPage,
});

interface BackInStockRow {
  id: string;
  email: string;
  product_id: string;
  variant_id: string | null;
  created_at: string;
}

function BackInStockPage() {
  const requests = useQuery({
    queryKey: ["back-in-stock"],
    queryFn: () => getBackInStockRequests() as Promise<BackInStockRow[]>,
  });
  const products = useQuery({ queryKey: ["products"], queryFn: () => getProducts() });

  const error = requests.error ?? products.error;
  if (error) return <ErrorState error={error} />;

  const rows = requests.data ?? [];
  const productList = products.data ?? [];
  const productById = new Map(productList.map((p) => [p.id, p]));

  // Group by product so the team can see which restock unlocks the most demand.
  const byProduct = new Map<string, { name: string; stock: number; emails: Set<string> }>();
  for (const r of rows) {
    const p = productById.get(r.product_id);
    const entry = byProduct.get(r.product_id) ?? {
      name: p?.name ?? r.product_id.slice(0, 8),
      stock: p?.stock ?? 0,
      emails: new Set<string>(),
    };
    entry.emails.add(r.email);
    byProduct.set(r.product_id, entry);
  }
  const grouped = [...byProduct.entries()]
    .map(([id, v]) => ({ id, name: v.name, stock: v.stock, interested: v.emails.size }))
    .sort((a, b) => b.interested - a.interested);

  const uniquePeople = new Set(rows.map((r) => r.email)).size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Marketing"
        title="Back in Stock"
        description="Customers who asked to be told when a sold-out product returns."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!rows.length}
            onClick={() =>
              downloadFile(
                "back-in-stock.csv",
                toCsv(
                  rows.map((r) => ({
                    email: r.email,
                    product: productById.get(r.product_id)?.name ?? r.product_id,
                    variant: r.variant_id ?? "",
                    requested: r.created_at,
                  })),
                ),
              )
            }
          >
            Export CSV
          </Button>
        }
      />

      {requests.isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No requests"
          description="Notify-me requests from the storefront appear here."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Open Requests" value={rows.length} />
            <StatCard label="Unique Customers" value={uniquePeople} />
            <StatCard label="Products Awaited" value={grouped.length} />
          </div>

          <Section title="Demand by Product">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2">Product</th>
                    <th className="pb-2 text-right">Interested Customers</th>
                    <th className="pb-2 text-right">Current Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((g) => (
                    <tr key={g.id} className="border-b border-border/50">
                      <td className="py-2">{g.name}</td>
                      <td className="py-2 text-right font-medium">{g.interested}</td>
                      <td className={`py-2 text-right ${g.stock === 0 ? "text-destructive" : ""}`}>
                        {g.stock}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="All Requests">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2">Email</th>
                    <th className="pb-2">Product</th>
                    <th className="pb-2">Variant</th>
                    <th className="pb-2">Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-2">{r.email}</td>
                      <td className="py-2">
                        {productById.get(r.product_id)?.name ?? r.product_id.slice(0, 8)}
                      </td>
                      <td className="py-2 text-muted-foreground">{r.variant_id ?? "—"}</td>
                      <td className="py-2 text-muted-foreground">{dateShort(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

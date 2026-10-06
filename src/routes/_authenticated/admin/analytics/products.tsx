import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProductAnalytics } from "@/lib/api/analytics";
import { getProducts } from "@/lib/api/products";
import { money, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { DateRangePicker, Section, StatCard } from "@/components/admin/AnalyticsKit";
import { useDateRange } from "@/lib/analytics-ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/analytics/products")({
  head: () => ({ meta: [{ title: "Product Analytics — HABÄNE Admin" }] }),
  component: ProductAnalytics,
});

function ProductAnalytics() {
  const { range, pickerProps } = useDateRange();
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "products", range],
    queryFn: () => getProductAnalytics(range, 100, 0),
  });
  // analytics_products() is built FROM order_items, so it only ever returns
  // products that sold at least one unit in range — there's no zero-units
  // row to filter for. Cross-referencing the full catalogue is the only way
  // to find products that didn't sell at all.
  const allProducts = useQuery({ queryKey: ["products"], queryFn: () => getProducts() });

  if (error) return <ErrorState error={error} />;

  const rows = data ?? [];
  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  const totalUnits = rows.reduce((a, r) => a + r.units_sold, 0);
  const totalViews = rows.reduce((a, r) => a + r.view_count, 0);
  // The RPC exposes views and units, not cart adds, so this is a view-to-purchase rate.
  const viewToPurchase = totalViews > 0 ? Math.round((totalUnits / totalViews) * 1000) / 10 : 0;

  const best = rows.slice(0, 5);
  const soldIds = new Set(rows.map((r) => r.product_id));
  const noSales = (allProducts.data ?? [])
    .filter((p) => !soldIds.has(p.id))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analytics"
        title="Product Analytics"
        description="Revenue, units, views and ratings per product."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!rows.length}
            onClick={() => downloadFile("product-analytics.csv", toCsv(rows))}
          >
            Export CSV
          </Button>
        }
      />

      <DateRangePicker {...pickerProps} />

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No product data"
          description="Product analytics appear once orders are placed in this period."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Products Sold" value={rows.filter((r) => r.units_sold > 0).length} />
            <StatCard label="Units Sold" value={totalUnits} />
            <StatCard label="Product Revenue" value={money(totalRevenue)} />
            <StatCard
              label="View to Purchase"
              value={`${viewToPurchase}%`}
              sub={`${totalViews} product views`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Best Sellers">
              <ol className="space-y-2 text-sm">
                {best.map((r, i) => (
                  <li key={r.product_id} className="flex items-center justify-between gap-4">
                    <span className="truncate">
                      <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                      {r.product_name}
                    </span>
                    <span className="whitespace-nowrap font-medium">{money(r.revenue)}</span>
                  </li>
                ))}
              </ol>
            </Section>
            <Section title="No Sales This Period">
              {allProducts.isLoading ? (
                <LoadingState />
              ) : noSales.length === 0 ? (
                <p className="text-sm text-muted-foreground">Every product sold at least once.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {noSales.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-4">
                      <span className="truncate">{p.name}</span>
                      <span className="whitespace-nowrap text-xs text-muted-foreground capitalize">
                        {p.is_published ? "live" : "not live"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section title="All Products">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2">Product</th>
                    <th className="pb-2 text-right">Units</th>
                    <th className="pb-2 text-right">Revenue</th>
                    <th className="pb-2 text-right">Views</th>
                    <th className="pb-2 text-right">Refunds</th>
                    <th className="pb-2 text-right">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.product_id} className="border-b border-border/50">
                      <td className="py-2">{r.product_name}</td>
                      <td className="py-2 text-right">{r.units_sold}</td>
                      <td className="py-2 text-right">{money(r.revenue)}</td>
                      <td className="py-2 text-right text-muted-foreground">{r.view_count}</td>
                      <td
                        className={`py-2 text-right ${
                          r.refund_count > 0 ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {r.refund_count}
                      </td>
                      <td className="py-2 text-right">
                        {r.avg_rating ? r.avg_rating.toFixed(1) : "—"}
                      </td>
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

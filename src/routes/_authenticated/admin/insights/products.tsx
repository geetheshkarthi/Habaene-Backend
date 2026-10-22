import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProductInterest, fmtDuration } from "@/lib/api/insights";
import { downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { DateRangePicker, Section, StatCard } from "@/components/admin/AnalyticsKit";
import { InsightBars } from "@/components/admin/InsightBars";
import { useDateRange } from "@/lib/analytics-ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/insights/products")({
  head: () => ({ meta: [{ title: "Product Interest — HABÄNE Admin" }] }),
  component: ProductInterest,
});

const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 1000) / 10}%` : "—");

function ProductInterest() {
  const { range, pickerProps } = useDateRange();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["insights", "products", range],
    queryFn: () => getProductInterest(range),
  });

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  const rows = data ?? [];
  const views = rows.reduce((a, r) => a + r.views, 0);
  const visitors = rows.reduce((a, r) => a + r.visitors, 0);
  const adds = rows.reduce((a, r) => a + r.add_to_cart, 0);

  const byCategory = Object.values(
    rows.reduce<Record<string, { label: string; value: number }>>((acc, r) => {
      const key = r.category || "other";
      acc[key] = { label: key, value: (acc[key]?.value ?? 0) + r.views };
      return acc;
    }, {}),
  )
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  // Looked at a lot but rarely added to the bag: worth a better photo, price or description.
  const lowConversion = rows
    .filter((r) => r.views >= 5)
    .map((r) => ({ ...r, rate: r.add_to_cart / r.views }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Visitor Insights"
        title="Product Interest"
        description="Which products customers look at, add to their bag and buy — and how long they spend on each product page."
      />
      <DateRangePicker {...pickerProps} />

      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Product views" value={views} />
            <StatCard label="Visitors who viewed" value={visitors} sub="Counted per product" />
            <StatCard label="Added to bag" value={adds} />
            <StatCard label="View → bag rate" value={pct(adds, views)} />
          </div>

          {views === 0 ? (
            <EmptyState
              title="No product views in this period"
              description="Views are recorded whenever someone opens a product page on the website."
            />
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <Section title="Most viewed products">
                  <InsightBars
                    rows={[...rows]
                      .filter((r) => r.views > 0)
                      .slice(0, 8)
                      .map((r) => ({ label: r.name, value: r.views }))}
                    format={(n) => `${n} views`}
                  />
                </Section>
                <Section title="Interest by category">
                  <InsightBars rows={byCategory} format={(n) => `${n} views`} />
                </Section>
              </div>

              <Section title="Looked at a lot, added to bag rarely">
                {lowConversion.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Not enough views yet (a product needs at least 5).
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {lowConversion.map((r) => (
                      <li key={r.product_id} className="flex justify-between gap-4">
                        <span>{r.name}</span>
                        <span className="text-muted-foreground">
                          {r.views} views → {r.add_to_cart} added ({pct(r.add_to_cart, r.views)})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Visitors</TableHead>
                      <TableHead className="text-right">Added to bag</TableHead>
                      <TableHead className="text-right">View → bag</TableHead>
                      <TableHead className="text-right">Avg time on page</TableHead>
                      <TableHead className="text-right">Units sold</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.product_id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="capitalize text-muted-foreground">{r.category}</TableCell>
                        <TableCell className="text-right">{r.views}</TableCell>
                        <TableCell className="text-right">{r.visitors}</TableCell>
                        <TableCell className="text-right">{r.add_to_cart}</TableCell>
                        <TableCell className="text-right">{pct(r.add_to_cart, r.views)}</TableCell>
                        <TableCell className="text-right">{fmtDuration(r.avg_seconds)}</TableCell>
                        <TableCell className="text-right">{r.units_sold}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                "Avg time on page" only counts visitors who accepted Analytics in the cookie banner.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

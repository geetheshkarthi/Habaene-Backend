import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSearchAnalytics } from "@/lib/api/seo";
import { toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatCard, Section, DateRangePicker } from "@/components/admin/AnalyticsKit";
import { useDateRange } from "@/lib/analytics-ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/seo/search-analytics")({
  head: () => ({ meta: [{ title: "Search Analytics — HABÄNE Admin" }] }),
  component: SearchAnalyticsPage,
});

function SearchAnalyticsPage() {
  const { range, pickerProps } = useDateRange();
  const { data, isLoading, error } = useQuery({
    queryKey: ["search-analytics", range],
    queryFn: () => getSearchAnalytics(200, range.start, range.end),
  });

  if (error) return <ErrorState error={error} />;

  const rows = data ?? [];
  const totalSearches = rows.reduce((a, r) => a + r.count, 0);
  const noResults = rows.filter((r) => r.avg_results === 0);
  const conversions = rows.reduce((a, r) => a + r.led_to_purchase_count, 0);
  const searchToPurchase =
    totalSearches > 0 ? Math.round((conversions / totalSearches) * 1000) / 10 : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="SEO"
        title="Search Analytics"
        description="What people type into the storefront search, and whether it leads anywhere."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!rows.length}
            onClick={() => downloadFile("search-analytics.csv", toCsv(rows))}
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
          title="No searches recorded"
          description="Queries appear here once the storefront logs its internal search."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Searches" value={totalSearches} />
            <StatCard label="Unique Queries" value={rows.length} />
            <StatCard
              label="No-Result Queries"
              value={noResults.length}
              accent="text-destructive"
            />
            <StatCard label="Search to Purchase" value={`${searchToPurchase}%`} />
          </div>

          {noResults.length > 0 && (
            <Section title="Queries With No Results">
              <p className="mb-3 text-xs text-muted-foreground">
                These are missed demand signals — either a product gap or a naming mismatch.
              </p>
              <ul className="space-y-2 text-sm">
                {noResults.slice(0, 15).map((r) => (
                  <li key={r.query} className="flex items-center justify-between gap-4">
                    <span className="truncate font-medium">{r.query}</span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.count} searches
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="All Queries">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2">Query</th>
                    <th className="pb-2 text-right">Searches</th>
                    <th className="pb-2 text-right">Avg Results</th>
                    <th className="pb-2 text-right">Purchases</th>
                    <th className="pb-2 text-right">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.query} className="border-b border-border/50">
                      <td className="py-2 font-medium">{r.query}</td>
                      <td className="py-2 text-right">{r.count}</td>
                      <td className="py-2 text-right">
                        <span
                          className={
                            r.avg_results === 0 ? "text-destructive" : "text-muted-foreground"
                          }
                        >
                          {r.avg_results}
                        </span>
                      </td>
                      <td className="py-2 text-right">{r.led_to_purchase_count}</td>
                      <td className="py-2 text-right text-muted-foreground">
                        {r.count > 0
                          ? `${Math.round((r.led_to_purchase_count / r.count) * 1000) / 10}%`
                          : "—"}
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

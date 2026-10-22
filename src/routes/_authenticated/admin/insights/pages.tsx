import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPagesInsights, fmtDuration, PAGE_TYPE_LABELS } from "@/lib/api/insights";
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

export const Route = createFileRoute("/_authenticated/admin/insights/pages")({
  head: () => ({ meta: [{ title: "Pages & Time — HABÄNE Admin" }] }),
  component: PagesAndTime,
});

function PagesAndTime() {
  const { range, pickerProps } = useDateRange();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["insights", "pages", range],
    queryFn: () => getPagesInsights(range),
  });

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Visitor Insights"
        title="Pages & Time"
        description="Which pages visitors spend their time on, and how far down they read."
      />
      <DateRangePicker {...pickerProps} />

      {isLoading || !data ? (
        <LoadingState />
      ) : data.visits === 0 ? (
        <EmptyState
          title="No page visits recorded yet"
          description="Time on page is recorded only for visitors who accept Analytics in the cookie banner. It starts filling in once the updated website is live."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Page visits" value={data.visits} />
            <StatCard label="Avg time per page" value={fmtDuration(data.avg_seconds)} />
            <StatCard label="Avg scroll depth" value={`${data.avg_scroll}%`} sub="How far down the page" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Where visitors spend the most time (total)">
              <InsightBars
                rows={data.by_type.map((t) => ({
                  label: PAGE_TYPE_LABELS[t.page_type] ?? t.page_type,
                  value: Number(t.total_seconds),
                  hint: `${t.visits} visits`,
                }))}
                format={fmtDuration}
              />
            </Section>
            <Section title="Average time per visit">
              <InsightBars
                rows={[...data.by_type]
                  .sort((a, b) => b.avg_seconds - a.avg_seconds)
                  .map((t) => ({
                    label: PAGE_TYPE_LABELS[t.page_type] ?? t.page_type,
                    value: Number(t.avg_seconds),
                    hint: `scroll ${t.avg_scroll}%`,
                  }))}
                format={fmtDuration}
              />
            </Section>
          </div>

          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Avg time</TableHead>
                  <TableHead className="text-right">Avg scroll</TableHead>
                  <TableHead className="text-right">Left within 10s</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.by_path.map((p) => (
                  <TableRow key={p.path}>
                    <TableCell className="font-medium">{p.path}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {PAGE_TYPE_LABELS[p.page_type] ?? p.page_type}
                    </TableCell>
                    <TableCell className="text-right">{p.visits}</TableCell>
                    <TableCell className="text-right">{fmtDuration(p.avg_seconds)}</TableCell>
                    <TableCell className="text-right">{p.avg_scroll}%</TableCell>
                    <TableCell className="text-right">
                      {p.quick_exits} ({Math.round((p.quick_exits / p.visits) * 100)}%)
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Only visitors who accepted Analytics in the cookie banner are counted here. Product
            pages are shown together — see Product Interest for time per product.
          </p>
        </>
      )}
    </div>
  );
}

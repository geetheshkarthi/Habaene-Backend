import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getVisitorsInsights, fmtDuration } from "@/lib/api/insights";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { DateRangePicker, Section, StatCard } from "@/components/admin/AnalyticsKit";
import { InsightBars } from "@/components/admin/InsightBars";
import { useDateRange } from "@/lib/analytics-ui";

export const Route = createFileRoute("/_authenticated/admin/insights/visitors")({
  head: () => ({ meta: [{ title: "Visitors — HABÄNE Admin" }] }),
  component: Visitors,
});

const asRows = (rows: { label: string; visits: number }[]) =>
  rows.map((r) => ({ label: r.label, value: r.visits }));

function Visitors() {
  const { range, pickerProps } = useDateRange();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["insights", "visitors", range],
    queryFn: () => getVisitorsInsights(range),
  });

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Visitor Insights"
        title="Visitors"
        description="Who is visiting: where they come from, what device they use, which country, and when they are most active."
      />
      <DateRangePicker {...pickerProps} />

      {isLoading || !data ? (
        <LoadingState />
      ) : data.visits === 0 ? (
        <EmptyState
          title="No visitors recorded yet"
          description="Visits are recorded only for people who accept Analytics in the cookie banner. It starts filling in once the updated website is live."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Visitors (sessions)" value={data.sessions} />
            <StatCard label="Page visits" value={data.visits} />
            <StatCard
              label="Pages per visitor"
              value={data.sessions ? Math.round((data.visits / data.sessions) * 10) / 10 : "—"}
            />
            <StatCard label="Avg time per page" value={fmtDuration(data.avg_seconds)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Where visitors come from">
              <InsightBars rows={asRows(data.sources)} format={(n) => `${n} visits`} />
            </Section>
            <Section title="Devices">
              <InsightBars rows={asRows(data.devices)} format={(n) => `${n} visits`} />
            </Section>
            <Section title="Countries">
              <InsightBars rows={asRows(data.countries)} format={(n) => `${n} visits`} />
            </Section>
            <Section title="Busiest hours (UTC)">
              <InsightBars
                rows={[...data.hours]
                  .sort((a, b) => b.visits - a.visits)
                  .slice(0, 8)
                  .map((h) => ({ label: `${String(h.hour).padStart(2, "0")}:00`, value: h.visits }))}
                format={(n) => `${n} visits`}
              />
            </Section>
          </div>

          <Section title="Visits per day">
            <InsightBars
              rows={data.daily.map((d) => ({ label: d.day, value: d.visits }))}
              format={(n) => `${n}`}
            />
          </Section>
          <p className="text-xs text-muted-foreground">
            Only visitors who accepted Analytics in the cookie banner are counted here.
          </p>
        </>
      )}
    </div>
  );
}

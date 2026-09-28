import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getAnalyticsSummary, getPeriodComparison, getRevenueSeries } from "@/lib/api/analytics";
import { money, dateShort, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatCard, Section, DateRangePicker } from "@/components/admin/AnalyticsKit";
import { useDateRange } from "@/lib/analytics-ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/analytics/sales")({
  head: () => ({ meta: [{ title: "Sales Analytics — HABÄNE Admin" }] }),
  component: SalesAnalytics,
});

type Granularity = "hour" | "day" | "week" | "month";

function SalesAnalytics() {
  const { range, pickerProps } = useDateRange();
  const [granularity, setGranularity] = useState<Granularity>("day");

  const summary = useQuery({
    queryKey: ["analytics", "summary", range],
    queryFn: () => getAnalyticsSummary(range),
  });
  const comparison = useQuery({
    queryKey: ["analytics", "comparison", range],
    queryFn: () => getPeriodComparison(range),
  });
  const series = useQuery({
    queryKey: ["analytics", "series", range, granularity],
    queryFn: () => getRevenueSeries(range, granularity),
  });

  const error = summary.error ?? comparison.error ?? series.error;
  if (error) return <ErrorState error={error} />;

  const s = summary.data;
  const c = comparison.data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analytics"
        title="Sales Analytics"
        description="Revenue, orders, discounts and tax across the selected period."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!series.data?.length}
            onClick={() => downloadFile("sales-analytics.csv", toCsv(series.data ?? []))}
          >
            Export CSV
          </Button>
        }
      />

      <DateRangePicker {...pickerProps} />

      {summary.isLoading || !s ? (
        <LoadingState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Revenue" value={money(s.revenue)} change={c?.revenue_growth} />
          <StatCard label="Gross Sales" value={money(s.gross_sales)} />
          <StatCard label="Net Revenue" value={money(s.net_revenue)} />
          <StatCard label="Total Orders" value={s.orders} change={c?.orders_growth} />
          <StatCard label="Units Sold" value={s.units_sold} />
          <StatCard label="Average Order Value" value={money(s.aov)} />
          <StatCard label="Discounts Given" value={money(s.discount_total)} />
          <StatCard label="Tax / VAT Collected" value={money(s.vat_total)} />
          <StatCard label="Shipping Revenue" value={money(s.shipping_revenue)} />
          <StatCard label="Refund Value" value={money(s.refund_value)} accent="text-destructive" />
          <StatCard
            label="Cancellation Value"
            value={money(s.cancellation_value)}
            accent="text-destructive"
          />
          <StatCard label="New Customers" value={s.new_customers} />
        </div>
      )}

      <Section title="Revenue Over Time">
        <div className="mb-4 flex gap-2">
          {(["hour", "day", "week", "month"] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`rounded-md border px-3 py-1 text-xs capitalize transition-colors ${
                granularity === g
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        {series.isLoading ? (
          <LoadingState />
        ) : !series.data?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data for this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={series.data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="period" tickFormatter={dateShort} className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                formatter={(v: number, name: string) => (name === "revenue" ? money(v) : v)}
                labelFormatter={dateShort}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#8884d8"
                fill="#8884d8"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Section>

      {c && (
        <Section title="Period Comparison">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2">Metric</th>
                  <th className="pb-2 text-right">Current</th>
                  <th className="pb-2 text-right">Previous</th>
                  <th className="pb-2 text-right">Change</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Revenue", c.current.revenue, c.previous.revenue, c.revenue_growth, true],
                    ["Orders", c.current.orders, c.previous.orders, c.orders_growth, false],
                    ["Units Sold", c.current.units_sold, c.previous.units_sold, undefined, false],
                    ["AOV", c.current.aov, c.previous.aov, undefined, true],
                  ] as [string, number, number, number | undefined, boolean][]
                ).map(([label, cur, prev, growth, isMoney]) => (
                  <tr key={label} className="border-b border-border/50">
                    <td className="py-2">{label}</td>
                    <td className="py-2 text-right">{isMoney ? money(cur) : cur}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {isMoney ? money(prev) : prev}
                    </td>
                    <td
                      className={`py-2 text-right ${
                        growth === undefined
                          ? ""
                          : growth >= 0
                            ? "text-green-500"
                            : "text-destructive"
                      }`}
                    >
                      {growth === undefined ? "—" : `${growth >= 0 ? "+" : ""}${growth}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

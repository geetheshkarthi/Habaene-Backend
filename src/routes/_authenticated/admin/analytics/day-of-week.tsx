import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getAllDaysOfWeekAnalytics, dayName } from "@/lib/api/analytics";
import { money, dateShort, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
import { DateRangePicker, Section, StatCard } from "@/components/admin/AnalyticsKit";
import { useDateRange } from "@/lib/analytics-ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/analytics/day-of-week")({
  head: () => ({ meta: [{ title: "Day-of-Week Analytics — HABÄNE Admin" }] }),
  component: DayOfWeekAnalyticsPage,
});

// Display order: Monday first, matching German business convention.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function DayOfWeekAnalyticsPage() {
  const { range, pickerProps } = useDateRange();
  // 3 = Wednesday, the worked example in the scope document.
  const [selectedDay, setSelectedDay] = useState<number>(3);

  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "day-of-week", range],
    queryFn: () => getAllDaysOfWeekAnalytics(range),
  });

  if (error) return <ErrorState error={error} />;

  const rows = data ?? [];
  const byDay = new Map(rows.map((r) => [r.day_of_week, r]));
  const selected = byDay.get(selectedDay);

  const chartData = DISPLAY_ORDER.map((d) => {
    const r = byDay.get(d);
    return {
      day: dayName(d).slice(0, 3),
      dayIndex: d,
      revenue: r?.revenue ?? 0,
      orders: r?.orders ?? 0,
      units: r?.units_sold ?? 0,
      aov: r?.aov ?? 0,
    };
  });

  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  const share =
    selected && totalRevenue > 0 ? Math.round((selected.revenue / totalRevenue) * 1000) / 10 : 0;
  const bestDay = [...rows].sort((a, b) => b.revenue - a.revenue)[0];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analytics"
        title="Day-of-Week Analytics"
        description="Pick a weekday to see how it performs across every occurrence in the selected date range."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!rows.length}
            onClick={() =>
              downloadFile(
                "day-of-week-analytics.csv",
                toCsv(
                  DISPLAY_ORDER.map((d) => {
                    const r = byDay.get(d);
                    return {
                      day: dayName(d),
                      revenue: r?.revenue ?? 0,
                      orders: r?.orders ?? 0,
                      units_sold: r?.units_sold ?? 0,
                      aov: r?.aov ?? 0,
                    };
                  }),
                ),
              )
            }
          >
            Export CSV
          </Button>
        }
      />

      <DateRangePicker {...pickerProps} />

      <div className="flex flex-wrap gap-2">
        {DISPLAY_ORDER.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDay(d)}
            className={`rounded-md border px-4 py-2 text-sm transition-colors ${
              selectedDay === d
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            {dayName(d)}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Showing every <span className="font-medium text-foreground">{dayName(selectedDay)}</span>{" "}
        between {dateShort(range.start)} and {dateShort(range.end)}.
      </p>

      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              label={`${dayName(selectedDay)} Revenue`}
              value={money(selected?.revenue ?? 0)}
            />
            <StatCard label={`${dayName(selectedDay)} Orders`} value={selected?.orders ?? 0} />
            <StatCard
              label={`${dayName(selectedDay)} Units Sold`}
              value={selected?.units_sold ?? 0}
            />
            <StatCard label={`${dayName(selectedDay)} AOV`} value={money(selected?.aov ?? 0)} />
            <StatCard
              label="Share of Period Revenue"
              value={`${share}%`}
              sub={`of ${money(totalRevenue)} total`}
            />
          </div>

          <Section title="All Days Compared">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  formatter={(v: number, name: string) =>
                    name === "revenue" || name === "aov" ? money(v) : v
                  }
                />
                <Bar
                  dataKey="revenue"
                  radius={[4, 4, 0, 0]}
                  onClick={(d) => setSelectedDay((d as unknown as { dayIndex: number }).dayIndex)}
                  className="cursor-pointer"
                >
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.dayIndex}
                      fill={entry.dayIndex === selectedDay ? "#8884d8" : "#c4c1e0"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {bestDay && (
              <p className="mt-4 text-xs text-muted-foreground">
                Strongest weekday in this period:{" "}
                <span className="font-medium text-foreground">{dayName(bestDay.day_of_week)}</span>{" "}
                at {money(bestDay.revenue)}.
              </p>
            )}
          </Section>

          <Section title="Weekday Breakdown">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2">Day</th>
                    <th className="pb-2 text-right">Revenue</th>
                    <th className="pb-2 text-right">Orders</th>
                    <th className="pb-2 text-right">Units</th>
                    <th className="pb-2 text-right">AOV</th>
                  </tr>
                </thead>
                <tbody>
                  {DISPLAY_ORDER.map((d) => {
                    const r = byDay.get(d);
                    return (
                      <tr
                        key={d}
                        onClick={() => setSelectedDay(d)}
                        className={`cursor-pointer border-b border-border/50 ${
                          selectedDay === d ? "bg-accent/50 font-medium" : ""
                        }`}
                      >
                        <td className="py-2">{dayName(d)}</td>
                        <td className="py-2 text-right">{money(r?.revenue ?? 0)}</td>
                        <td className="py-2 text-right">{r?.orders ?? 0}</td>
                        <td className="py-2 text-right">{r?.units_sold ?? 0}</td>
                        <td className="py-2 text-right">{money(r?.aov ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getGeographicAnalytics } from "@/lib/api/analytics";
import { money, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { DateRangePicker, Section, StatCard } from "@/components/admin/AnalyticsKit";
import { useDateRange } from "@/lib/analytics-ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/analytics/geographic")({
  head: () => ({ meta: [{ title: "Geographic Analytics — HABÄNE Admin" }] }),
  component: GeographicAnalytics,
});

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

function countryName(code: string): string {
  if (!code || code.length !== 2) return code || "Unknown";
  try {
    return REGION_NAMES.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function GeographicAnalytics() {
  const { range, pickerProps } = useDateRange();
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "geographic", range],
    queryFn: () => getGeographicAnalytics(range),
  });

  if (error) return <ErrorState error={error} />;

  const rows = data ?? [];
  const chart = rows.slice(0, 10).map((r) => ({ ...r, name: countryName(r.country_code) }));
  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  const totalOrders = rows.reduce((a, r) => a + r.orders, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analytics"
        title="Geographic Analytics"
        description="Revenue, orders and customers by shipping country."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!rows.length}
            onClick={() => downloadFile("geographic-analytics.csv", toCsv(rows))}
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
          title="No geographic data"
          description="Country breakdowns appear once orders are placed."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Countries" value={rows.length} />
            <StatCard label="Total Revenue" value={money(totalRevenue)} />
            <StatCard label="Total Orders" value={totalOrders} />
          </div>

          <Section title="Top Countries by Revenue">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar dataKey="revenue" fill="#8884d8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          <Section title="All Countries">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2">Country</th>
                    <th className="pb-2 text-right">Revenue</th>
                    <th className="pb-2 text-right">Orders</th>
                    <th className="pb-2 text-right">Customers</th>
                    <th className="pb-2 text-right">AOV</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.country_code} className="border-b border-border/50">
                      <td className="py-2">
                        {countryName(r.country_code)}
                        <span className="ml-2 text-xs text-muted-foreground">{r.country_code}</span>
                      </td>
                      <td className="py-2 text-right">{money(r.revenue)}</td>
                      <td className="py-2 text-right">{r.orders}</td>
                      <td className="py-2 text-right">{r.customers}</td>
                      <td className="py-2 text-right">{money(r.aov)}</td>
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

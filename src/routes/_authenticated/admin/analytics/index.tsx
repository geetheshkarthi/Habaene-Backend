import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getAnalyticsSummary,
  getPeriodComparison,
  getRevenueSeries,
  getProductAnalytics,
  getCustomerAnalytics,
  getGeographicAnalytics,
  getFinancialAnalytics,
  getFunnelAnalytics,
  getAllDaysOfWeekAnalytics,
  resolveDateRange,
  DatePreset,
  DATE_PRESET_LABELS,
  DAY_NAMES,
  DateRange,
} from "@/lib/api/analytics";
import { money, dateShort } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatCard, Section, DateRangePicker } from "@/components/admin/AnalyticsKit";

export const Route = createFileRoute("/_authenticated/admin/analytics/")({
  head: () => ({ meta: [{ title: "Analytics — HABÄNE Admin" }] }),
  component: AnalyticsPage,
});

// ─── Main Page ────────────────────────────────────────────────────────────────
function AnalyticsPage() {
  const [preset, setPreset] = useState<DatePreset>("last_30_days");
  const [custom, setCustom] = useState<DateRange>({
    start: new Date(Date.now() - 30 * 86400000).toISOString(),
    end: new Date().toISOString(),
  });
  const [dayOfWeekFilter, setDayOfWeekFilter] = useState<number>(1); // Monday

  const range = resolveDateRange(preset, custom);

  const summaryQ = useQuery({
    queryKey: ["analytics-summary", range.start, range.end],
    queryFn: () => getAnalyticsSummary(range),
    staleTime: 60_000,
  });
  const comparisonQ = useQuery({
    queryKey: ["analytics-comparison", range.start, range.end],
    queryFn: () => getPeriodComparison(range),
    staleTime: 60_000,
  });
  const seriesQ = useQuery({
    queryKey: ["analytics-series", range.start, range.end],
    queryFn: () => getRevenueSeries(range, "day"),
    staleTime: 60_000,
  });
  const productsQ = useQuery({
    queryKey: ["analytics-products", range.start, range.end],
    queryFn: () => getProductAnalytics(range, 10),
    staleTime: 60_000,
  });
  const customersQ = useQuery({
    queryKey: ["analytics-customers", range.start, range.end],
    queryFn: () => getCustomerAnalytics(range),
    staleTime: 60_000,
  });
  const geoQ = useQuery({
    queryKey: ["analytics-geo", range.start, range.end],
    queryFn: () => getGeographicAnalytics(range),
    staleTime: 60_000,
  });
  const financialQ = useQuery({
    queryKey: ["analytics-financial", range.start, range.end],
    queryFn: () => getFinancialAnalytics(range),
    staleTime: 60_000,
  });
  const funnelQ = useQuery({
    queryKey: ["analytics-funnel", range.start, range.end],
    queryFn: () => getFunnelAnalytics(range),
    staleTime: 60_000,
  });
  const dowQ = useQuery({
    queryKey: ["analytics-dow", range.start, range.end],
    queryFn: () => getAllDaysOfWeekAnalytics(range),
    staleTime: 300_000,
  });

  const isLoading = summaryQ.isLoading || comparisonQ.isLoading;
  const s = summaryQ.data;
  const cmp = comparisonQ.data;
  const fin = financialQ.data;
  const cust = customersQ.data;
  const funnel = funnelQ.data;

  const chartData = (seriesQ.data ?? []).map((p) => ({
    date: p.period,
    revenue: Number(p.revenue),
    orders: Number(p.orders),
  }));

  const geoData = (geoQ.data ?? []).slice(0, 10);
  const productData = (productsQ.data ?? []).map((p) => ({
    name: p.product_name.length > 20 ? p.product_name.slice(0, 20) + "…" : p.product_name,
    revenue: Number(p.revenue),
    units: Number(p.units_sold),
    product_id: p.product_id,
  }));

  const dowData = (dowQ.data ?? []).map((d) => ({
    day: DAY_NAMES[d.day_of_week]!.slice(0, 3),
    revenue: Number(d.revenue),
    orders: d.orders,
  }));

  // Funnel calculation
  const funnelSteps = funnel
    ? [
        { name: "Product Views", value: funnel.product_views },
        { name: "Add to Cart", value: funnel.add_to_cart },
        { name: "Checkout", value: funnel.checkout_started },
        { name: "Purchases", value: funnel.purchases },
      ]
    : [];

  const PIE_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd"];

  if (isLoading) return <LoadingState />;
  if (summaryQ.error)
    return <ErrorState error={summaryQ.error} onRetry={() => summaryQ.refetch()} />;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Analytics" title="Sales Analytics" />

      {/* Date Range Picker */}
      <DateRangePicker
        preset={preset}
        onPresetChange={setPreset}
        custom={custom}
        onCustomChange={setCustom}
      />

      {/* Sales KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={money(s?.revenue ?? 0)}
          sub="Paid orders only"
          change={cmp?.revenue_growth}
        />
        <StatCard label="Total Orders" value={s?.orders ?? 0} change={cmp?.orders_growth} />
        <StatCard label="Units Sold" value={(s?.units_sold ?? 0).toLocaleString()} />
        <StatCard label="Avg Order Value" value={money(s?.aov ?? 0)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Gross Sales" value={money(s?.gross_sales ?? 0)} />
        <StatCard label="Net Revenue" value={money(s?.net_revenue ?? 0)} />
        <StatCard label="Discounts Given" value={money(s?.discount_total ?? 0)} />
        <StatCard
          label="Refund Value"
          value={money(s?.refund_value ?? 0)}
          accent="text-destructive"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="VAT Collected" value={money(s?.vat_total ?? 0)} />
        <StatCard label="Shipping Revenue" value={money(s?.shipping_revenue ?? 0)} />
        <StatCard label="Cancellations" value={money(s?.cancellation_value ?? 0)} />
        <StatCard label="New Customers" value={s?.new_customers ?? 0} />
      </div>

      {/* Revenue Chart */}
      <Section title="Revenue Over Time">
        {seriesQ.isLoading ? (
          <LoadingState />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeOpacity={0.15} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => dateShort(v)}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => money(v)} labelFormatter={(v) => dateShort(v)} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-chart-1)"
                  fill="var(--color-chart-1)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* Period Comparison */}
      {cmp && (
        <Section title="Period Comparison">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Revenue (current)</p>
              <p className="text-xl font-semibold">{money(cmp.current.revenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Revenue (previous)</p>
              <p className="text-xl font-semibold">{money(cmp.previous.revenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Growth</p>
              <p
                className={`text-xl font-semibold ${cmp.revenue_growth >= 0 ? "text-green-500" : "text-destructive"}`}
              >
                {cmp.revenue_growth >= 0 ? "+" : ""}
                {cmp.revenue_growth}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Orders (current)</p>
              <p className="text-xl font-semibold">{cmp.current.orders}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Orders (previous)</p>
              <p className="text-xl font-semibold">{cmp.previous.orders}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Order Growth</p>
              <p
                className={`text-xl font-semibold ${cmp.orders_growth >= 0 ? "text-green-500" : "text-destructive"}`}
              >
                {cmp.orders_growth >= 0 ? "+" : ""}
                {cmp.orders_growth}%
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* Financial Analytics */}
      {fin && (
        <Section title="Financial Analytics">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Gross Sales" value={money(fin.gross_sales)} />
            <StatCard label="Net Sales" value={money(fin.net_sales)} />
            <StatCard label="Total Discounts" value={money(fin.discounts)} />
            <StatCard label="Tax Collected" value={money(fin.taxes_collected)} />
            <StatCard label="Shipping Revenue" value={money(fin.shipping_revenue)} />
            <StatCard label="Total Refunds" value={money(fin.refunds_total)} />
            <StatCard label="Net Revenue" value={money(fin.net_revenue)} />
          </div>
        </Section>
      )}

      {/* Product Analytics */}
      <Section title="Top Products">
        {productsQ.isLoading ? (
          <LoadingState />
        ) : productData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data for this period.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeOpacity={0.1} horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => money(v)}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={140}
                />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar dataKey="revenue" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* Customer Analytics */}
      {cust && (
        <Section title="Customer Analytics">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Total Customers" value={cust.total_customers} />
            <StatCard label="New Customers" value={cust.new_customers} />
            <StatCard label="Returning" value={cust.returning_customers} />
            <StatCard label="Avg Spend" value={money(cust.avg_spend)} />
            <StatCard
              label="Orders/Customer"
              value={Number(cust.avg_orders_per_customer).toFixed(1)}
            />
          </div>
        </Section>
      )}

      {/* Funnel */}
      {funnel && (
        <Section title="Conversion Funnel">
          <div className="grid gap-4 sm:grid-cols-4">
            {funnelSteps.map((step, i) => (
              <div key={step.name} className="text-center rounded-lg bg-muted/30 p-4">
                <p className="text-2xl font-bold">{step.value.toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">{step.name}</p>
                {i > 0 && funnelSteps[i - 1]!.value > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {((step.value / funnelSteps[i - 1]!.value) * 100).toFixed(1)}% conversion
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Geographic */}
      {geoData.length > 0 && (
        <Section title="Revenue by Country">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4">Country</th>
                  <th className="pb-2 pr-4 text-right">Revenue</th>
                  <th className="pb-2 pr-4 text-right">Orders</th>
                  <th className="pb-2 pr-4 text-right">Customers</th>
                  <th className="pb-2 text-right">AOV</th>
                </tr>
              </thead>
              <tbody>
                {geoData.map((row) => (
                  <tr key={row.country_code} className="border-b border-border/50 text-sm">
                    <td className="py-2 pr-4 font-medium">{row.country_code || "Unknown"}</td>
                    <td className="py-2 pr-4 text-right">{money(row.revenue)}</td>
                    <td className="py-2 pr-4 text-right">{row.orders}</td>
                    <td className="py-2 pr-4 text-right">{row.customers}</td>
                    <td className="py-2 text-right">{money(row.aov)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Day-of-Week Analytics */}
      {dowData.length > 0 && (
        <Section title="Day-of-Week Analytics">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Highlight:</span>
            {DAY_NAMES.map((day, i) => (
              <button
                key={day}
                onClick={() => setDayOfWeekFilter(i)}
                className={`rounded px-2 py-1 text-xs transition-colors ${dayOfWeekFilter === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dowData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {dowData.map((_, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={
                        idx === dayOfWeekFilter
                          ? "var(--color-chart-1)"
                          : "var(--color-chart-2, #a78bfa)"
                      }
                      fillOpacity={idx === dayOfWeekFilter ? 1 : 0.4}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}
    </div>
  );
}

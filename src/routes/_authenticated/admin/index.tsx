import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDashboardStats, getRevenueSeries, resolveDateRange } from "@/lib/api/analytics";
import { money, dateShort } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
import {
  TrendingUp,
  ShoppingCart,
  PackageCheck,
  Undo2,
  Users,
  Mail,
  Star,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — HABÄNE Admin" },
      { name: "description", content: "Revenue, orders, stock and returns at a glance." },
    ],
  }),
  component: Dashboard,
});

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string | undefined;
  icon?: React.ComponentType<{ className?: string }> | undefined;
  href?: string | undefined;
  accent?: "green" | "red" | "yellow" | undefined;
}) {
  const el = (
    <div className="rounded-lg border border-border bg-card p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <p
        className={`mt-3 text-2xl font-semibold ${accent === "red" ? "text-destructive" : accent === "yellow" ? "text-yellow-500" : ""}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
  return href ? <Link to={href}>{el}</Link> : el;
}

function Dashboard() {
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: getDashboardStats,
    staleTime: 60_000,
  });
  // Memoized for the same reason as analytics/index.tsx and analytics-ui.ts's
  // useDateRange(): resolveDateRange() builds a fresh object every call, and
  // this page's queryFn closure captures it fresh each render even though
  // the queryKey itself stays stable.
  const range = useMemo(() => resolveDateRange("last_30_days"), []);
  const series = useQuery({
    queryKey: ["revenue-series", "last_30_days"],
    queryFn: () => getRevenueSeries(range, "day"),
    staleTime: 60_000,
  });

  if (stats.isLoading) return <LoadingState />;
  if (stats.error) return <ErrorState error={stats.error} onRetry={() => stats.refetch()} />;
  const d = stats.data!;

  const chartData = (series.data ?? []).map((p) => ({
    date: p.period,
    revenue: Number(p.revenue),
    orders: Number(p.orders),
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Paid revenue only. All amounts are gross, VAT included."
      />

      {/* Revenue KPIs */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Revenue
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={TrendingUp}
            label="Today"
            value={money(d.today.revenue)}
            sub={`${d.today.orders} orders`}
          />
          <StatCard
            icon={TrendingUp}
            label="This Month"
            value={money(d.this_month.revenue)}
            sub={`${d.this_month.orders} orders`}
          />
          <StatCard
            icon={TrendingUp}
            label="Last 30 Days"
            value={money(d.last_30_days.revenue)}
            sub={`${d.last_30_days.orders} orders`}
          />
          <StatCard
            icon={TrendingUp}
            label="This Year"
            value={money(d.this_year.revenue)}
            sub={`${d.this_year.orders} orders`}
          />
        </div>
      </div>

      {/* Chart */}
      <section className="rounded-lg border border-border bg-card p-5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Revenue — Last 30 Days
        </span>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid strokeOpacity={0.15} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => dateShort(v)}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v: number) => money(v)}
                labelFormatter={(v: string) => dateShort(v)}
              />
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
      </section>

      {/* Operations KPIs */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Operations
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            href="/admin/orders"
            icon={ShoppingCart}
            label="Open Orders"
            value={d.open_orders}
          />
          <StatCard
            href="/admin/returns"
            icon={Undo2}
            label="Pending Returns"
            value={d.pending_returns}
            accent={d.pending_returns > 0 ? "yellow" : undefined}
          />
          <StatCard
            href="/admin/newsletter"
            icon={Mail}
            label="Subscribers"
            value={d.active_subscribers}
          />
          <StatCard
            href="/admin/reviews"
            icon={Star}
            label="Pending Reviews"
            value={d.pending_reviews}
            accent={d.pending_reviews > 0 ? "yellow" : undefined}
          />
        </div>
      </div>

      {/* All Time */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          All Time
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Revenue"
            value={money(d.all_time.revenue)}
            sub={`${d.all_time.orders} orders`}
          />
          <StatCard label="Units Sold" value={d.all_time.units_sold.toLocaleString()} />
          <StatCard label="Avg Order Value" value={money(d.all_time.aov)} />
          <StatCard label="VAT Collected" value={money(d.all_time.vat_total)} />
        </div>
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          to="/admin/analytics"
          className="rounded-lg border border-border bg-card p-5 text-center hover:bg-accent/40 transition-colors"
        >
          <p className="text-sm font-medium">Full Analytics</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sales, customers, products, financial
          </p>
        </Link>
        <Link
          to="/admin/inventory"
          className={`rounded-lg border bg-card p-5 text-center hover:bg-accent/40 transition-colors ${d.low_stock_count > 0 ? "border-yellow-500" : "border-border"}`}
        >
          <div className="flex items-center justify-center gap-2">
            {d.low_stock_count > 0 && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
            <p className="text-sm font-medium">Low Stock</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {d.low_stock_count} products need attention
          </p>
        </Link>
        <Link
          to="/admin/customers"
          className="rounded-lg border border-border bg-card p-5 text-center hover:bg-accent/40 transition-colors"
        >
          <p className="text-sm font-medium">Customers</p>
          <p className="mt-1 text-xs text-muted-foreground">View profiles and segments</p>
        </Link>
      </div>
    </div>
  );
}

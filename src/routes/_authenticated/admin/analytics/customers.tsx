import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { getCustomerAnalytics, getFunnelAnalytics } from "@/lib/api/analytics";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
import { DateRangePicker, Section, StatCard } from "@/components/admin/AnalyticsKit";
import { useDateRange, CHART_COLORS } from "@/lib/analytics-ui";

export const Route = createFileRoute("/_authenticated/admin/analytics/customers")({
  head: () => ({ meta: [{ title: "Customer Analytics — HABÄNE Admin" }] }),
  component: CustomerAnalyticsPage,
});

function CustomerAnalyticsPage() {
  const { range, pickerProps } = useDateRange();

  const customers = useQuery({
    queryKey: ["analytics", "customers", range],
    queryFn: () => getCustomerAnalytics(range),
  });
  const funnel = useQuery({
    queryKey: ["analytics", "funnel", range],
    queryFn: () => getFunnelAnalytics(range),
  });

  const error = customers.error ?? funnel.error;
  if (error) return <ErrorState error={error} />;

  const c = customers.data;
  const f = funnel.data;

  const repeatRate =
    c && c.total_customers > 0
      ? Math.round((c.returning_customers / c.total_customers) * 1000) / 10
      : 0;

  const split = c
    ? [
        { name: "New", value: c.new_customers },
        { name: "Returning", value: c.returning_customers },
      ]
    : [];

  const funnelSteps = f
    ? [
        { label: "Product Views", value: f.product_views },
        { label: "Add to Cart", value: f.add_to_cart },
        { label: "Checkout Started", value: f.checkout_started },
        { label: "Purchases", value: f.purchases },
      ]
    : [];
  const funnelTop = funnelSteps[0]?.value ?? 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analytics"
        title="Customer Analytics"
        description="Acquisition, retention and spend behaviour for the selected period."
      />

      <DateRangePicker {...pickerProps} />

      {customers.isLoading || !c ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Total Customers" value={c.total_customers} />
            <StatCard label="New Customers" value={c.new_customers} />
            <StatCard label="Returning" value={c.returning_customers} />
            <StatCard label="Repeat Purchase Rate" value={`${repeatRate}%`} />
            <StatCard label="Average Spend" value={money(c.avg_spend)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="New vs Returning">
              {c.total_customers === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No customers in this period.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={split}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={95}
                      label
                    >
                      {split.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Section>

            <Section title="Orders per Customer">
              <div className="flex h-[260px] flex-col items-center justify-center gap-2">
                <p className="text-4xl font-semibold">{c.avg_orders_per_customer.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">average orders per customer</p>
              </div>
            </Section>
          </div>

          <Section title="Conversion Funnel">
            {funnel.isLoading ? (
              <LoadingState />
            ) : funnelTop === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No funnel events recorded. The storefront must send view and cart events for this
                report to populate.
              </p>
            ) : (
              <div className="space-y-3">
                {funnelSteps.map((step) => {
                  const pct = funnelTop > 0 ? (step.value / funnelTop) * 100 : 0;
                  return (
                    <div key={step.label}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span>{step.label}</span>
                        <span className="text-muted-foreground">
                          {step.value} ({Math.round(pct * 10) / 10}%)
                        </span>
                      </div>
                      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {f && (
                  <p className="pt-2 text-xs text-muted-foreground">
                    {f.checkout_abandoned} abandoned at checkout · {f.payment_failures} payment
                    failures
                  </p>
                )}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

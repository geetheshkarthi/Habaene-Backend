import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAbandonedCarts, getAbandonedCartStats } from "@/lib/api/marketing";
import { money, dateTime, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatCard, DateRangePicker } from "@/components/admin/AnalyticsKit";
import { useDateRange } from "@/lib/analytics-ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/abandoned-carts")({
  head: () => ({ meta: [{ title: "Abandoned Carts — HABÄNE Admin" }] }),
  component: AbandonedCartsPage,
});

const STAGE_STYLES: Record<string, string> = {
  cart: "bg-muted text-muted-foreground",
  checkout_started: "bg-amber-500/10 text-amber-600",
  payment: "bg-destructive/10 text-destructive",
};

function itemCount(cartItems: unknown): number {
  return Array.isArray(cartItems) ? cartItems.length : 0;
}

function AbandonedCartsPage() {
  const { range, pickerProps } = useDateRange();

  const carts = useQuery({
    queryKey: ["abandoned-carts", range],
    queryFn: () => getAbandonedCarts(range.start, range.end),
  });
  const stats = useQuery({
    queryKey: ["abandoned-cart-stats", range],
    queryFn: () => getAbandonedCartStats(range.start, range.end),
  });

  const error = carts.error ?? stats.error;
  if (error) return <ErrorState error={error} />;

  const rows = carts.data ?? [];
  const s = stats.data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Customers"
        title="Abandoned Carts"
        description="Carts and checkouts that were started but never completed."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!rows.length}
            onClick={() => downloadFile("abandoned-carts.csv", toCsv(rows))}
          >
            Export CSV
          </Button>
        }
      />

      <DateRangePicker {...pickerProps} />

      {s && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Abandoned Carts" value={s.abandoned_count} />
          <StatCard label="Lost Revenue" value={money(s.lost_revenue)} accent="text-destructive" />
          <StatCard label="Recovered Carts" value={s.recovered_count} />
          <StatCard label="Recovered Revenue" value={money(s.recovered_revenue)} />
          <StatCard label="Recovery Rate" value={`${s.recovery_rate}%`} />
        </div>
      )}

      {carts.isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No abandoned carts"
          description="Carts appear here once the storefront reports cart and checkout events."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">Customer</th>
                <th className="p-3">Items</th>
                <th className="p-3">Cart Value</th>
                <th className="p-3">Stage</th>
                <th className="p-3">Source</th>
                <th className="p-3">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.session_id} className="border-b border-border/50">
                  <td className="p-3">
                    {c.customer_email ?? <span className="text-muted-foreground">Anonymous</span>}
                    <span className="block text-xs text-muted-foreground">
                      {c.session_id.slice(0, 12)}…
                    </span>
                  </td>
                  <td className="p-3">{itemCount(c.cart_items)}</td>
                  <td className="p-3">{money(c.cart_total ?? 0)}</td>
                  <td className="p-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        STAGE_STYLES[c.checkout_stage ?? ""] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {(c.checkout_stage ?? "cart").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{c.utm_source ?? "direct"}</td>
                  <td className="p-3 text-muted-foreground">{dateTime(c.last_activity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

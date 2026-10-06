import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getFinancialAnalytics } from "@/lib/api/analytics";
import { money, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
import { DateRangePicker, Section, StatCard } from "@/components/admin/AnalyticsKit";
import { useDateRange } from "@/lib/analytics-ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/analytics/financial")({
  head: () => ({ meta: [{ title: "Financial Analytics — HABÄNE Admin" }] }),
  component: FinancialAnalytics,
});

function FinancialAnalytics() {
  const { range, pickerProps } = useDateRange();
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "financial", range],
    queryFn: () => getFinancialAnalytics(range),
  });

  if (error) return <ErrorState error={error} />;

  const f = data;

  // Waterfall from gross sales down to net revenue. Prices are VAT-inclusive
  // (gross) throughout checkout, so taxes_collected is already embedded in
  // every line below it, not an amount added on top — total_revenue is
  // exactly net_sales + shipping_revenue; adding taxes again here would
  // overstate the running total by the VAT amount. It's shown as a memo
  // line instead of an addition in the chain.
  const lines: { label: string; value: number; kind: "add" | "sub" | "total" | "memo" }[] = f
    ? [
        { label: "Gross sales", value: f.gross_sales, kind: "add" },
        { label: "Discounts", value: -f.discounts, kind: "sub" },
        { label: "Net sales", value: f.net_sales, kind: "total" },
        { label: "Shipping revenue", value: f.shipping_revenue, kind: "add" },
        { label: "Total revenue", value: f.total_revenue, kind: "total" },
        { label: "— of which VAT (included above)", value: f.taxes_collected, kind: "memo" },
        { label: "Refunds", value: -f.refunds_total, kind: "sub" },
        { label: "Net revenue", value: f.net_revenue, kind: "total" },
      ]
    : [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analytics"
        title="Financial Analytics"
        description="Gross to net revenue, including discounts, tax and refunds."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!f}
            onClick={() =>
              f &&
              downloadFile(
                "financial-analytics.csv",
                toCsv([f as unknown as Record<string, unknown>]),
              )
            }
          >
            Export CSV
          </Button>
        }
      />

      <DateRangePicker {...pickerProps} />

      {isLoading || !f ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Gross Sales" value={money(f.gross_sales)} />
            <StatCard label="Net Sales" value={money(f.net_sales)} />
            <StatCard label="Total Revenue" value={money(f.total_revenue)} />
            <StatCard label="Net Revenue" value={money(f.net_revenue)} />
            <StatCard label="Discounts" value={money(f.discounts)} />
            <StatCard label="Shipping Revenue" value={money(f.shipping_revenue)} />
            <StatCard label="Taxes Collected" value={money(f.taxes_collected)} />
            <StatCard label="Refunds" value={money(f.refunds_total)} accent="text-destructive" />
          </div>

          <Section title="Gross to Net">
            <table className="w-full text-sm">
              <tbody>
                {lines.map((l) => (
                  <tr
                    key={l.label}
                    className={`border-b border-border/50 ${l.kind === "total" ? "font-semibold" : ""} ${
                      l.kind === "memo" ? "text-xs text-muted-foreground italic" : ""
                    }`}
                  >
                    <td className="py-2">{l.label}</td>
                    <td className={`py-2 text-right ${l.kind === "sub" ? "text-destructive" : ""}`}>
                      {money(l.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-xs text-muted-foreground">
              Product cost, payment fees and contribution margin are not yet captured on orders, so
              they are excluded from this statement.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}

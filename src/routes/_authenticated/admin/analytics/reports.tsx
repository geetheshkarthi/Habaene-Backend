import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getRevenueSeries,
  getProductAnalytics,
  getGeographicAnalytics,
  getAllDaysOfWeekAnalytics,
  dayName,
  type DatePreset,
} from "@/lib/api/analytics";
import {
  getSavedReports,
  createSavedReport,
  deleteSavedReport,
  type SavedReport,
} from "@/lib/api/reports";
import { money, dateShort, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { DateRangePicker, Section } from "@/components/admin/AnalyticsKit";
import { useDateRange } from "@/lib/analytics-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/analytics/reports")({
  head: () => ({ meta: [{ title: "Custom Reports — HABÄNE Admin" }] }),
  component: CustomReports,
});

type Metric = "revenue" | "orders" | "units" | "aov";
type Dimension = "time" | "product" | "country" | "day_of_week";

const METRICS: { value: Metric; label: string; isMoney: boolean }[] = [
  { value: "revenue", label: "Revenue", isMoney: true },
  { value: "orders", label: "Orders", isMoney: false },
  { value: "units", label: "Units sold", isMoney: false },
  { value: "aov", label: "Average order value", isMoney: true },
];

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: "time", label: "Time period" },
  { value: "product", label: "Product" },
  { value: "country", label: "Country" },
  { value: "day_of_week", label: "Day of week" },
];

type Row = { label: string; revenue: number; orders: number; units: number; aov: number };

function CustomReports() {
  const qc = useQueryClient();
  const { range, pickerProps } = useDateRange();
  const [metric, setMetric] = useState<Metric>("revenue");
  const [dimension, setDimension] = useState<Dimension>("product");
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");
  const [minValue, setMinValue] = useState<string>("");
  const [reportName, setReportName] = useState("");

  const savedReports = useQuery({ queryKey: ["saved-reports"], queryFn: getSavedReports });

  const save = useMutation({
    mutationFn: () =>
      createSavedReport({
        name: reportName.trim(),
        metric,
        dimensions: [dimension],
        filters: minValue === "" ? {} : { min: Number(minValue) },
        date_range: pickerProps.preset,
        grouping: granularity,
      }),
    onSuccess: () => {
      toast.success("Report saved");
      setReportName("");
      qc.invalidateQueries({ queryKey: ["saved-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSavedReport(id),
    onSuccess: () => {
      toast.success("Report deleted");
      qc.invalidateQueries({ queryKey: ["saved-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function loadReport(r: SavedReport) {
    setMetric(r.metric as Metric);
    const dim = r.dimensions[0];
    if (dim) setDimension(dim as Dimension);
    if (r.grouping) setGranularity(r.grouping as "day" | "week" | "month");
    if (r.date_range && r.date_range !== "custom") {
      pickerProps.onPresetChange(r.date_range as DatePreset);
    }
    const min = (r.filters as { min?: number } | null)?.min;
    setMinValue(min != null ? String(min) : "");
    toast.success(`Loaded "${r.name}"`);
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", dimension, range, granularity],
    queryFn: async (): Promise<Row[]> => {
      if (dimension === "time") {
        const series = await getRevenueSeries(range, granularity);
        return series.map((p) => ({
          label: dateShort(p.period),
          revenue: p.revenue,
          orders: p.orders,
          units: p.units,
          aov: p.orders > 0 ? p.revenue / p.orders : 0,
        }));
      }
      if (dimension === "product") {
        const rows = await getProductAnalytics(range, 200, 0);
        return rows.map((r) => ({
          label: r.product_name,
          revenue: r.revenue,
          orders: 0,
          units: r.units_sold,
          aov: r.units_sold > 0 ? r.revenue / r.units_sold : 0,
        }));
      }
      if (dimension === "country") {
        const rows = await getGeographicAnalytics(range);
        return rows.map((r) => ({
          label: r.country_code,
          revenue: r.revenue,
          orders: r.orders,
          units: 0,
          aov: r.aov,
        }));
      }
      const rows = await getAllDaysOfWeekAnalytics(range);
      return rows.map((r) => ({
        label: dayName(r.day_of_week),
        revenue: r.revenue,
        orders: r.orders,
        units: r.units_sold,
        aov: r.aov,
      }));
    },
  });

  if (error) return <ErrorState error={error} />;

  const activeMetric = METRICS.find((m) => m.value === metric)!;
  const threshold = minValue === "" ? null : Number(minValue);

  const rows = (data ?? [])
    .filter((r) => threshold === null || Number.isNaN(threshold) || r[metric] >= threshold)
    .sort((a, b) => b[metric] - a[metric]);

  const total = rows.reduce((a, r) => a + r[metric], 0);
  const format = (v: number) =>
    activeMetric.isMoney ? money(v) : String(Math.round(v * 100) / 100);

  // "Product dimension has no order count" — the product RPC aggregates line items, not orders.
  const orderCountUnavailable = dimension === "product" && metric === "orders";
  const unitsUnavailable = dimension === "country" && metric === "units";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analytics"
        title="Custom Reports"
        description="Combine a metric, a dimension, a date range and a filter, then export the result."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!rows.length}
            onClick={() =>
              downloadFile(
                `report-${metric}-by-${dimension}.csv`,
                toCsv(
                  rows.map((r) => ({
                    [DIMENSIONS.find((d) => d.value === dimension)!.label]: r.label,
                    revenue: r.revenue,
                    orders: r.orders,
                    units: r.units,
                    aov: r.aov,
                  })),
                ),
              )
            }
          >
            Export CSV
          </Button>
        }
      />

      <Section title="Report Builder">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Metric</Label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as Metric)}
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            >
              {METRICS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Dimension</Label>
            <select
              value={dimension}
              onChange={(e) => setDimension(e.target.value as Dimension)}
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            >
              {DIMENSIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Grouping</Label>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as "day" | "week" | "month")}
              disabled={dimension !== "time"}
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Minimum {activeMetric.label.toLowerCase()}</Label>
            <input
              type="number"
              value={minValue}
              placeholder="No filter"
              onChange={(e) => setMinValue(e.target.value)}
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4">
          <DateRangePicker {...pickerProps} />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <div className="min-w-[200px] flex-1 space-y-2">
            <Label>Save this report as</Label>
            <Input
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="e.g. Monthly product revenue"
            />
          </div>
          <Button
            variant="outline"
            disabled={!reportName.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save report"}
          </Button>
        </div>
      </Section>

      {isLoading ? (
        <LoadingState />
      ) : orderCountUnavailable ? (
        <EmptyState
          title="Order count is not available per product"
          description="The product report aggregates line items rather than orders. Pick Revenue or Units sold instead."
        />
      ) : unitsUnavailable ? (
        <EmptyState
          title="Units are not available per country"
          description="The geographic report aggregates revenue and orders. Pick Revenue, Orders or AOV instead."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No rows match"
          description="Widen the date range or clear the minimum filter."
        />
      ) : (
        <Section
          title={`${activeMetric.label} by ${DIMENSIONS.find((d) => d.value === dimension)!.label.toLowerCase()}`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2">{DIMENSIONS.find((d) => d.value === dimension)!.label}</th>
                  <th className="pb-2 text-right">{activeMetric.label}</th>
                  <th className="pb-2 text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-border/50">
                    <td className="py-2">{r.label}</td>
                    <td className="py-2 text-right">{format(r[metric])}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {total > 0 ? `${Math.round((r[metric] / total) * 1000) / 10}%` : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{format(total)}</td>
                  <td className="py-2 text-right">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="Saved Reports">
        {savedReports.isLoading ? (
          <LoadingState />
        ) : !savedReports.data?.length ? (
          <p className="text-sm text-muted-foreground">
            No saved reports yet — build one above and give it a name to save it here.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {savedReports.data.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {METRICS.find((m) => m.value === r.metric)?.label ?? r.metric} by{" "}
                    {DIMENSIONS.find((d) => d.value === r.dimensions[0])?.label ?? r.dimensions[0]}
                    {r.date_range ? ` · ${r.date_range.replace(/_/g, " ")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => loadReport(r)}>
                    Load
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={remove.isPending && remove.variables === r.id}
                    onClick={() => remove.mutate(r.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

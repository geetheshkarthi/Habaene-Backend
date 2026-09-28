/**
 * AnalyticsKit — shared presentation primitives for the analytics module.
 * Extracted from admin/analytics.tsx so every sub-report renders identically.
 */
import type { ReactNode } from "react";
import { DATE_PRESET_LABELS, type DatePreset, type DateRange } from "@/lib/api/analytics";

export function StatCard({
  label,
  value,
  sub,
  change,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  change?: number | undefined;
  /** Optional tailwind text-colour class applied to the value, e.g. "text-destructive". */
  accent?: string | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-3 text-2xl font-semibold ${accent ?? ""}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      {change !== undefined && (
        <span
          className={`mt-1 inline-block text-xs font-medium ${
            change >= 0 ? "text-green-500" : "text-destructive"
          }`}
        >
          {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% vs previous period
        </span>
      )}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-4 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function DateRangePicker({
  preset,
  onPresetChange,
  custom,
  onCustomChange,
}: {
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
  custom: DateRange;
  onCustomChange: (r: DateRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(Object.keys(DATE_PRESET_LABELS) as DatePreset[])
        .filter((p) => p !== "custom")
        .map((p) => (
          <button
            key={p}
            onClick={() => onPresetChange(p)}
            className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
              preset === p
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            {DATE_PRESET_LABELS[p]}
          </button>
        ))}
      <button
        onClick={() => onPresetChange("custom")}
        className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
          preset === "custom"
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-muted-foreground hover:bg-accent"
        }`}
      >
        Custom
      </button>
      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={custom.start.slice(0, 10)}
            onChange={(e) =>
              onCustomChange({ ...custom, start: e.target.value + "T00:00:00.000Z" })
            }
            className="rounded border border-border bg-input px-2 py-1 text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={custom.end.slice(0, 10)}
            onChange={(e) => onCustomChange({ ...custom, end: e.target.value + "T23:59:59.999Z" })}
            className="rounded border border-border bg-input px-2 py-1 text-xs"
          />
        </div>
      )}
    </div>
  );
}

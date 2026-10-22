/** A simple labelled horizontal bar list — no chart library needed. */
export function InsightBars({
  rows,
  format = (n) => String(n),
  empty = "No data yet.",
}: {
  rows: { label: string; value: number; hint?: string }[];
  format?: (n: number) => string;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {format(r.value)}
              {r.hint ? ` · ${r.hint}` : ""}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/80"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

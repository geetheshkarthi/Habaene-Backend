import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getAuditTrail, type AuditTrailEntry } from "@/lib/api/admin";
import { dateTime, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/audit-log")({
  head: () => ({ meta: [{ title: "Audit Log — HABÄNE Admin" }] }),
  component: AuditLogPage,
});

const ACTION_STYLES: Record<string, string> = {
  INSERT: "bg-green-500/10 text-green-600",
  UPDATE: "bg-amber-500/10 text-amber-600",
  DELETE: "bg-destructive/10 text-destructive",
};

/** Fields whose before/after values are worth surfacing in the diff column. */
function diffSummary(entry: AuditTrailEntry): string {
  const prev = entry.previous_value ?? {};
  const next = entry.new_value ?? {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (k === "updated_at" || k === "created_at") continue;
    const a = JSON.stringify(prev[k as keyof typeof prev]);
    const b = JSON.stringify(next[k as keyof typeof next]);
    if (a !== b) changed.push(`${k}: ${a ?? "—"} → ${b ?? "—"}`);
  }
  return changed.slice(0, 4).join("; ");
}

function AuditLogPage() {
  const [table, setTable] = useState("");
  const [module, setModule] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-trail", table, module],
    queryFn: () =>
      getAuditTrail({
        limit: 200,
        ...(table ? { tableName: table } : {}),
        ...(module ? { module } : {}),
      }),
  });

  if (error) return <ErrorState error={error} />;

  const rows = data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Audit Log"
        description="Who changed what, when, and what the value was before and after."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!rows.length}
            onClick={() =>
              downloadFile(
                "audit-log.csv",
                toCsv(
                  rows.map((r) => ({
                    when: r.created_at,
                    who: r.changed_by_email ?? r.changed_by ?? "system",
                    role: r.changed_by_role ?? "",
                    action: r.action,
                    table: r.table_name,
                    record: r.record_id ?? "",
                    module: r.module ?? "",
                    change: diffSummary(r),
                  })),
                ),
              )
            }
          >
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Input
          value={table}
          onChange={(e) => setTable(e.target.value)}
          placeholder="Filter by table, e.g. products"
          className="max-w-xs"
        />
        <Input
          value={module}
          onChange={(e) => setModule(e.target.value)}
          placeholder="Filter by module, e.g. cms"
          className="max-w-xs"
        />
      </div>

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No audit entries"
          description="Changes are recorded here once the audit triggers fire on a tracked table."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">When</th>
                <th className="p-3">Who</th>
                <th className="p-3">Action</th>
                <th className="p-3">Table</th>
                <th className="p-3">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="cursor-pointer border-b border-border/50 align-top hover:bg-accent/40"
                >
                  <td className="whitespace-nowrap p-3 text-muted-foreground">
                    {dateTime(r.created_at)}
                  </td>
                  <td className="p-3">
                    <span className="block">{r.changed_by_email ?? "system"}</span>
                    {r.changed_by_role && (
                      <span className="block text-xs text-muted-foreground">
                        {r.changed_by_role}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        ACTION_STYLES[r.action] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {r.action}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="block">{r.table_name}</span>
                    {r.module && (
                      <span className="block text-xs text-muted-foreground">{r.module}</span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {expanded === r.id ? (
                      <pre className="max-w-xl overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
                        {JSON.stringify({ before: r.previous_value, after: r.new_value }, null, 2)}
                      </pre>
                    ) : (
                      diffSummary(r) || r.description || "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

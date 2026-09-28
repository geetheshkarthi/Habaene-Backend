import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getRedirects,
  createRedirect,
  updateRedirect,
  deleteRedirect,
  type Redirect,
} from "@/lib/api/seo";
import { dateShort, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatCard } from "@/components/admin/AnalyticsKit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/seo/redirects")({
  head: () => ({ meta: [{ title: "Redirects — HABÄNE Admin" }] }),
  component: RedirectsPage,
});

/** Leading-slash relative paths only, so a redirect cannot point off-site by accident. */
function normalisePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function RedirectsPage() {
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState<"301" | "302">("301");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["redirects"],
    queryFn: () => getRedirects(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["redirects"] });

  const create = useMutation({
    mutationFn: () => createRedirect(normalisePath(from), normalisePath(to), type),
    onSuccess: () => {
      toast.success("Redirect created");
      setFrom("");
      setTo("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (r: Redirect) => updateRedirect(r.id, { is_active: !r.is_active }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteRedirect,
    onSuccess: () => {
      toast.success("Redirect deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;

  const all = data ?? [];
  const term = search.trim().toLowerCase();
  const rows = term
    ? all.filter(
        (r) => r.from_path.toLowerCase().includes(term) || r.to_path.toLowerCase().includes(term),
      )
    : all;

  const active = all.filter((r) => r.is_active).length;
  const totalHits = all.reduce((a, r) => a + r.hit_count, 0);

  const duplicate = all.some((r) => r.from_path === normalisePath(from));
  const selfRedirect = normalisePath(from) !== "" && normalisePath(from) === normalisePath(to);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="SEO"
        title="Redirects"
        description="Map retired URLs to their replacements so links and rankings survive."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!all.length}
            onClick={() => downloadFile("redirects.csv", toCsv(all))}
          >
            Export CSV
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Redirects" value={all.length} />
        <StatCard label="Active" value={active} />
        <StatCard label="Total Hits" value={totalHits} />
      </div>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold">Add a redirect</h2>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-40 flex-1">
            <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="/old-url" />
          </div>
          <span className="self-center text-sm text-muted-foreground">→</span>
          <div className="min-w-40 flex-1">
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="/new-url" />
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "301" | "302")}
            className="rounded-md border border-border bg-input px-3 py-2 text-sm"
          >
            <option value="301">301 Permanent</option>
            <option value="302">302 Temporary</option>
          </select>
          <Button
            onClick={() => create.mutate()}
            disabled={!from.trim() || !to.trim() || duplicate || selfRedirect || create.isPending}
          >
            Add
          </Button>
        </div>
        {duplicate && (
          <p className="mt-2 text-xs text-destructive">A redirect from that path already exists.</p>
        )}
        {selfRedirect && (
          <p className="mt-2 text-xs text-destructive">Source and destination must differ.</p>
        )}
      </section>

      {isLoading ? (
        <LoadingState />
      ) : all.length === 0 ? (
        <EmptyState title="No redirects" description="Add one when you retire or rename a URL." />
      ) : (
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search paths"
            className="max-w-xs"
          />
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">From</th>
                  <th className="p-3">To</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">State</th>
                  <th className="p-3 text-right">Hits</th>
                  <th className="p-3">Created</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="p-3 font-mono text-xs">{r.from_path}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{r.to_path}</td>
                    <td className="p-3">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.type}</span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          r.is_active
                            ? "bg-green-500/10 text-green-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {r.is_active ? "active" : "disabled"}
                      </span>
                    </td>
                    <td className="p-3 text-right">{r.hit_count}</td>
                    <td className="p-3 text-muted-foreground">{dateShort(r.created_at)}</td>
                    <td className="space-x-1 whitespace-nowrap p-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => toggle.mutate(r)}>
                        {r.is_active ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => remove.mutate(r.id)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

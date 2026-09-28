import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
import { getSeoStats, getSeoIssues, getRedirects, getSearchAnalytics } from "@/lib/api/seo";

export const Route = createFileRoute("/_authenticated/admin/seo/")({
  head: () => ({ meta: [{ title: "SEO — HABÄNE Admin" }] }),
  component: SeoPage,
});

function SeoPage() {
  const statsQ = useQuery({ queryKey: ["seo-stats"], queryFn: getSeoStats, staleTime: 60_000 });
  const issuesQ = useQuery({ queryKey: ["seo-issues"], queryFn: getSeoIssues, staleTime: 60_000 });
  const redirectsQ = useQuery({
    queryKey: ["redirects"],
    queryFn: () => getRedirects(),
    staleTime: 30_000,
  });
  const searchQ = useQuery({
    queryKey: ["search-analytics"],
    queryFn: () => getSearchAnalytics(20),
    staleTime: 60_000,
  });

  const stats = statsQ.data;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="SEO" title="SEO Management" />

      {/* Dashboard stats */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Indexed Pages", value: stats.indexed_pages },
            { label: "SEO Configured", value: stats.seo_configured },
            { label: "Missing Title", value: stats.missing_title, warn: true },
            { label: "Missing Description", value: stats.missing_description, warn: true },
            { label: "No-Index Pages", value: stats.noindex_pages, warn: true },
            { label: "Active Redirects", value: stats.active_redirects },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p
                className={`mt-2 text-2xl font-semibold ${s.warn && (s.value as number) > 0 ? "text-yellow-500" : ""}`}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* SEO Issues */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">SEO Issues</h2>
        {issuesQ.isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(issuesQ.data ?? []).length === 0 && (
              <p className="text-sm text-green-500">✓ No SEO issues detected</p>
            )}
            {(issuesQ.data ?? []).map((issue, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs ${issue.severity === "critical" ? "bg-red-500/20 text-red-500" : "bg-yellow-500/20 text-yellow-500"}`}
                >
                  {issue.severity}
                </span>
                <span className="text-muted-foreground">{issue.message}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Links to the dedicated management screens */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/admin/seo/redirects"
          className="rounded-lg border border-border bg-card p-5 transition-colors hover:bg-accent/40"
        >
          <h2 className="text-sm font-semibold">Redirect Manager</h2>
          <p className="mt-2 text-2xl font-semibold">{(redirectsQ.data ?? []).length}</p>
          <p className="text-xs text-muted-foreground">
            {(redirectsQ.data ?? []).filter((r) => r.is_active).length} active · manage 301 and 302
            rules
          </p>
        </Link>
        <Link
          to="/admin/seo/search-analytics"
          className="rounded-lg border border-border bg-card p-5 transition-colors hover:bg-accent/40"
        >
          <h2 className="text-sm font-semibold">Search Analytics</h2>
          <p className="mt-2 text-2xl font-semibold">{(searchQ.data ?? []).length}</p>
          <p className="text-xs text-muted-foreground">
            {(searchQ.data ?? []).filter((r) => r.avg_results === 0).length} queries with no results
          </p>
        </Link>
      </div>
    </div>
  );
}

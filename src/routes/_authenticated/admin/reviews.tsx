import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getReviews, updateReviewStatus, deleteReview, type Review } from "@/lib/api/cms";
import { dateShort } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, Search, Star, AlertTriangle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  head: () => ({
    meta: [
      { title: "Reviews — HABÄNE Admin" },
      { name: "description", content: "Moderate and reply to customer product reviews." },
    ],
  }),
  component: ReviewsPage,
});

type Tab = "all" | "5" | "4" | "3" | "low" | "pending";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All Reviews" },
  { value: "5", label: "5 Stars" },
  { value: "4", label: "4 Stars" },
  { value: "3", label: "3 Stars" },
  { value: "low", label: "1-2 Stars" },
  { value: "pending", label: "Pending" },
];

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5 text-amber-500", className)}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className="h-3.5 w-3.5" fill={i < rating ? "currentColor" : "none"} />
      ))}
    </span>
  );
}

function ReviewsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");

  const reviewsQ = useQuery({
    queryKey: ["reviews", "all"],
    queryFn: () => getReviews(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["reviews"] });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, reply }: { id: string; status: Review["status"]; reply?: string }) =>
      updateReviewStatus(id, status, reply),
    onSuccess: () => {
      toast.success("Review updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReview(id),
    onSuccess: () => {
      toast.success("Review deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = reviewsQ.data ?? [];
  const approved = all.filter((r) => r.status === "approved" || r.status === "featured");
  const total = approved.length;
  const average = total ? approved.reduce((s, r) => s + r.rating, 0) / total : 0;
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: approved.filter((r) => r.rating === star).length,
  }));
  const lowRated = approved.filter((r) => r.rating <= 2).length;

  const counts: Record<Tab, number> = {
    all: all.length,
    "5": approved.filter((r) => r.rating === 5).length,
    "4": approved.filter((r) => r.rating === 4).length,
    "3": approved.filter((r) => r.rating === 3).length,
    low: approved.filter((r) => r.rating <= 2).length,
    pending: all.filter((r) => r.status === "pending").length,
  };

  const term = search.trim().toLowerCase();
  const filtered = all.filter((r) => {
    if (tab === "5" && r.rating !== 5) return false;
    if (tab === "4" && r.rating !== 4) return false;
    if (tab === "3" && r.rating !== 3) return false;
    if (tab === "low" && r.rating > 2) return false;
    if (tab === "pending" && r.status !== "pending") return false;
    if (!term) return true;
    return (
      r.customer_name.toLowerCase().includes(term) ||
      r.body.toLowerCase().includes(term) ||
      (r.products?.name ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Content"
        title="Customer Reviews & Rating Moderation"
        description="Approve, feature or reject reviews submitted on the storefront."
      />

      {reviewsQ.isLoading ? (
        <LoadingState />
      ) : reviewsQ.error ? (
        <ErrorState error={reviewsQ.error} onRetry={() => reviewsQ.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <Card>
              <CardContent className="flex flex-wrap items-center gap-8 pt-6">
                <div>
                  <p className="text-4xl font-semibold">{average.toFixed(1)}</p>
                  <Stars rating={Math.round(average)} className="mt-1" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Based on {total} verified customer review{total === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex-1 space-y-1.5 min-w-[220px]">
                  {distribution.map((d) => (
                    <div key={d.star} className="flex items-center gap-2 text-xs">
                      <span className="w-6 text-muted-foreground">{d.star}★</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${total ? (d.count / total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-16 text-right text-muted-foreground">
                        {d.count} ({total ? Math.round((d.count / total) * 100) : 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {lowRated > 0 && (
              <Card className="border-destructive/30 bg-destructive/5 lg:w-80">
                <CardContent className="pt-6">
                  <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    {lowRated} Low-Rated Review{lowRated === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Items with 1-2 star ratings require quality check or packaging review.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === t.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground hover:border-foreground/40",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs",
                    tab === t.value ? "bg-background/20" : "bg-muted text-muted-foreground",
                  )}
                >
                  {counts[t.value]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-xs flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by product, customer name or review text…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={() => reviewsQ.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Refresh Reviews
            </Button>
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="No reviews" description="No reviews match this filter." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((r) => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  onStatus={(status) => updateMutation.mutate({ id: r.id, status })}
                  onReply={() => {
                    const reply = window.prompt("Reply to this review:", r.admin_reply ?? "");
                    if (reply !== null) updateMutation.mutate({ id: r.id, status: r.status, reply });
                  }}
                  onDelete={() => confirm("Delete this review?") && deleteMutation.mutate(r.id)}
                  pending={updateMutation.isPending && updateMutation.variables?.id === r.id}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-success/15 text-success",
  featured: "bg-accent/20 text-accent-foreground",
  pending: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
  hidden: "bg-muted text-muted-foreground",
};

function ReviewCard({
  review: r,
  onStatus,
  onReply,
  onDelete,
  pending,
}: {
  review: Review;
  onStatus: (status: Review["status"]) => void;
  onReply: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{r.products?.name ?? "Unknown product"}</p>
          <p className="text-xs text-muted-foreground">
            Product #{r.products?.code ?? r.product_id.slice(0, 8)}
          </p>
        </div>
        <span className={cn("rounded-sm px-2 py-0.5 text-[11px] font-medium capitalize", STATUS_STYLES[r.status])}>
          {r.status}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Stars rating={r.rating} />
        {r.title && <span className="truncate text-sm font-semibold">&quot;{r.title}&quot;</span>}
      </div>

      <p className="mt-2 rounded-md bg-muted/40 p-2 text-sm text-muted-foreground">{r.body}</p>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {r.customer_name}{" "}
          {r.is_verified_purchase && <span className="text-foreground">(Verified Customer)</span>}
        </span>
        <span>{dateShort(r.created_at)}</span>
      </div>

      {r.admin_reply && (
        <div className="mt-3 rounded-md bg-muted/30 p-2">
          <p className="text-xs font-semibold text-muted-foreground">HABÄNE Reply:</p>
          <p className="text-sm">{r.admin_reply}</p>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {r.status !== "approved" && (
          <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => onStatus("approved")}>
            Approve
          </Button>
        )}
        {r.status === "approved" && (
          <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => onStatus("featured")}>
            Feature
          </Button>
        )}
        {r.status !== "rejected" && (
          <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => onStatus("rejected")}>
            Reject
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onReply}>
          Reply
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

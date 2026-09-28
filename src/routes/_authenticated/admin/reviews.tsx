import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
import { getReviews, updateReviewStatus, deleteReview } from "@/lib/api/cms";
import type { Review } from "@/lib/api/cms";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  head: () => ({ meta: [{ title: "Reviews — HABÄNE Admin" }] }),
  component: ReviewsPage,
});

const STATUS_OPTS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "featured", label: "Featured" },
  { value: "rejected", label: "Rejected" },
  { value: "hidden", label: "Hidden" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  approved: "bg-green-500/20 text-green-500",
  featured: "bg-blue-500/20 text-blue-500",
  rejected: "bg-red-500/20 text-red-500",
  hidden: "bg-gray-500/20 text-gray-500",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-yellow-400 text-sm">
      {"★".repeat(rating)}
      {"☆".repeat(5 - rating)}
    </span>
  );
}

function ReviewsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const qc = useQueryClient();

  const reviewsQ = useQuery({
    queryKey: ["reviews", statusFilter],
    queryFn: () => getReviews(statusFilter || undefined),
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, reply }: { id: string; status: Review["status"]; reply?: string }) =>
      updateReviewStatus(id, status, reply),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      setReplyingTo(null);
      setReplyText("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReview(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews"] }),
  });

  if (reviewsQ.isLoading) return <LoadingState />;
  if (reviewsQ.error)
    return <ErrorState error={reviewsQ.error} onRetry={() => reviewsQ.refetch()} />;

  const reviews = reviewsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader eyebrow="Content" title="Review Management" />
        <div className="flex gap-2">
          {STATUS_OPTS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${statusFilter === opt.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {reviews.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          No reviews found for this filter.
        </div>
      )}

      <div className="space-y-4">
        {reviews.map((review) => (
          <div key={review.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-medium text-sm">{review.customer_name}</span>
                  {review.is_verified_purchase && (
                    <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-xs text-green-500">
                      Verified Purchase
                    </span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${STATUS_COLORS[review.status] ?? ""}`}
                  >
                    {review.status}
                  </span>
                </div>
                <StarRating rating={review.rating} />
                {review.title && <p className="mt-1 text-sm font-semibold">{review.title}</p>}
                <p className="mt-1 text-sm text-muted-foreground">{review.body}</p>
                {review.admin_reply && (
                  <div className="mt-3 rounded bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">
                      HABÄNE Reply:
                    </p>
                    <p className="text-sm">{review.admin_reply}</p>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(review.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                {review.status !== "approved" && (
                  <button
                    onClick={() => updateMutation.mutate({ id: review.id, status: "approved" })}
                    className="rounded border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-500 hover:bg-green-500/20"
                  >
                    Approve
                  </button>
                )}
                {review.status !== "featured" && (
                  <button
                    onClick={() => updateMutation.mutate({ id: review.id, status: "featured" })}
                    className="rounded border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-500 hover:bg-blue-500/20"
                  >
                    Feature
                  </button>
                )}
                {review.status !== "rejected" && (
                  <button
                    onClick={() => updateMutation.mutate({ id: review.id, status: "rejected" })}
                    className="rounded border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-500 hover:bg-red-500/20"
                  >
                    Reject
                  </button>
                )}
                {review.status !== "hidden" && (
                  <button
                    onClick={() => updateMutation.mutate({ id: review.id, status: "hidden" })}
                    className="rounded border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
                  >
                    Hide
                  </button>
                )}
                <button
                  onClick={() => {
                    setReplyingTo(review.id);
                    setReplyText(review.admin_reply ?? "");
                  }}
                  className="rounded border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
                >
                  Reply
                </button>
                <button
                  onClick={() => confirm("Delete this review?") && deleteMutation.mutate(review.id)}
                  className="rounded border border-red-500/20 px-3 py-1 text-xs text-destructive hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </div>

            {replyingTo === review.id && (
              <div className="mt-4 space-y-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-border bg-input px-3 py-2 text-sm"
                  placeholder="Type your reply…"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      updateMutation.mutate({
                        id: review.id,
                        status: review.status,
                        reply: replyText,
                      })
                    }
                    disabled={updateMutation.isPending}
                    className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Save Reply
                  </button>
                  <button
                    onClick={() => setReplyingTo(null)}
                    className="rounded border border-border px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

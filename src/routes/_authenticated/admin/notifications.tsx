import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/api/admin";
import { useCurrentUser } from "@/hooks/useAdmin";
import { dateTime } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  head: () => ({ meta: [{ title: "Notifications — HABÄNE Admin" }] }),
  component: NotificationsPage,
});

const TYPE_STYLES: Record<string, string> = {
  new_order: "bg-green-500/10 text-green-600",
  payment: "bg-green-500/10 text-green-600",
  low_stock: "bg-amber-500/10 text-amber-600",
  out_of_stock: "bg-destructive/10 text-destructive",
  new_customer: "bg-blue-500/10 text-blue-600",
  new_review: "bg-blue-500/10 text-blue-600",
  return_request: "bg-amber-500/10 text-amber-600",
  refund: "bg-destructive/10 text-destructive",
};

function NotificationsPage() {
  const qc = useQueryClient();
  const { user, loading: userLoading } = useCurrentUser();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications", user?.id, unreadOnly],
    enabled: !!user,
    queryFn: () => getNotifications(user!.id, unreadOnly),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  const readOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const readAll = useMutation({
    mutationFn: () => markAllNotificationsRead(user!.id),
    onSuccess: () => {
      toast.success("All notifications marked read");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;

  const rows = data ?? [];
  const unreadCount = rows.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Notifications"
        description="Operational alerts for orders, payments, stock, reviews and returns."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!user || unreadCount === 0 || readAll.isPending}
            onClick={() => readAll.mutate()}
          >
            Mark all read
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <button
          onClick={() => setUnreadOnly(false)}
          className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
            !unreadOnly
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setUnreadOnly(true)}
          className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
            unreadOnly
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent"
          }`}
        >
          Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
        </button>
      </div>

      {userLoading || isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title={unreadOnly ? "Nothing unread" : "No notifications"}
          description="Alerts arrive here as orders, reviews and stock events occur."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li
              key={n.id}
              className={`flex items-start justify-between gap-4 rounded-lg border p-4 ${
                n.is_read ? "border-border bg-card" : "border-primary/40 bg-accent/30"
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      TYPE_STYLES[n.type] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {n.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm font-medium">{n.title}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{dateTime(n.created_at)}</p>
              </div>
              {!n.is_read && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={readOne.isPending}
                  onClick={() => readOne.mutate(n.id)}
                >
                  Mark read
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

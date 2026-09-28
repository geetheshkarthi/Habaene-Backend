import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSubscribers, setSubscriberActive, deleteSubscriber } from "@/lib/api/newsletter";
import { dateTime, downloadFile, toCsv } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/newsletter")({
  head: () => ({
    meta: [
      { title: "Newsletter — HABÄNE Admin" },
      { name: "description", content: "Double opt-in subscriber list with consent timestamps." },
      { property: "og:title", content: "Newsletter — HABÄNE Admin" },
      {
        property: "og:description",
        content: "Double opt-in subscriber list with consent timestamps.",
      },
    ],
  }),
  component: NewsletterPage,
});

function NewsletterPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const subs = useQuery({
    queryKey: ["subscribers", search],
    queryFn: () => getSubscribers(search),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["subscribers"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setSubscriberActive(id, active),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSubscriber(id),
    onSuccess: () => {
      toast.success("Subscriber deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportCsv() {
    const rows = (subs.data ?? []).map((s) => ({
      email: s.email,
      active: s.is_active,
      subscribed_at: s.subscribed_at,
      consent_text: s.consent_text,
      unsubscribed_at: s.unsubscribed_at,
      source: s.source,
    }));
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadFile("habaene-newsletter.csv", toCsv(rows));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Audience"
        title="Newsletter"
        description="Consent records are retained as proof of double opt-in. Unsubscribing keeps the record; deleting removes it entirely."
        actions={
          <Button variant="outline" onClick={exportCsv}>
            Export CSV
          </Button>
        }
      />

      <Input
        placeholder="Search email"
        className="max-w-xs"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {subs.isLoading ? (
        <LoadingState />
      ) : subs.error ? (
        <ErrorState error={subs.error} onRetry={() => subs.refetch()} />
      ) : subs.data!.length === 0 ? (
        <EmptyState title="No subscribers" description="Sign-ups from the storefront land here." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Subscribed</TableHead>
                <TableHead>Source</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.data!.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>
                    <StatusBadge value={s.is_active ? "active" : "inactive"} />
                  </TableCell>
                  <TableCell>{dateTime(s.subscribed_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.source}</TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggle.mutate({ id: s.id, active: !s.is_active })}
                    >
                      {s.is_active ? "Unsubscribe" : "Resubscribe"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => remove.mutate(s.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getReturns, setReturnStatus, addReturnNote } from "@/lib/api/returns";
import { RETURN_STATUSES, type ReturnStatus, type ReturnWithEvents } from "@/lib/api/types";
import { money, dateTime } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/returns")({
  head: () => ({
    meta: [
      { title: "Returns — HABÄNE Admin" },
      {
        name: "description",
        content: "Handle EU withdrawals, defects and exchange requests within the 14-day window.",
      },
      { property: "og:title", content: "Returns — HABÄNE Admin" },
      {
        property: "og:description",
        content: "Handle EU withdrawals, defects and exchange requests.",
      },
    ],
  }),
  component: ReturnsPage,
});

function ReturnsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<ReturnStatus | "all">("all");
  const [selected, setSelected] = useState<ReturnWithEvents | null>(null);
  const [notes, setNotes] = useState("");

  const returns = useQuery({ queryKey: ["returns", status], queryFn: () => getReturns(status) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["returns"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const changeStatus = useMutation({
    mutationFn: ({ id, value }: { id: string; value: ReturnStatus }) => setReturnStatus(id, value),
    onSuccess: () => {
      toast.success("Return updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNotes = useMutation({
    mutationFn: (id: string) => addReturnNote(id, notes),
    onSuccess: () => {
      toast.success("Notes saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Aftercare"
        title="Returns"
        description="EU right of withdrawal is 14 days from delivery. Refunds are due within 14 days of receiving the goods back."
      />

      <Select value={status} onValueChange={(v) => setStatus(v as ReturnStatus | "all")}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {RETURN_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {returns.isLoading ? (
        <LoadingState />
      ) : returns.error ? (
        <ErrorState error={returns.error} onRetry={() => returns.refetch()} />
      ) : returns.data!.length === 0 ? (
        <EmptyState
          title="No returns"
          description="Return requests from the storefront land here."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Refund</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.data!.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.order_number ?? r.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(r.submitted_at)}</p>
                  </TableCell>
                  <TableCell>{r.customer_email}</TableCell>
                  <TableCell className="capitalize">{r.type.replace(/_/g, " ")}</TableCell>
                  <TableCell>
                    <StatusBadge value={r.status} />
                  </TableCell>
                  <TableCell className="text-right">{money(r.refund_amount)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelected(r);
                        setNotes(r.notes ?? "");
                      }}
                    >
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.order_number ?? "Return"}</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 px-4 pb-8 text-sm">
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Customer</dt>
                    <dd>{selected.customer_email}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="capitalize">{selected.type.replace(/_/g, " ")}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Submitted</dt>
                    <dd>{dateTime(selected.submitted_at)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Items received</dt>
                    <dd>{dateTime(selected.items_received_at)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Refund amount</dt>
                    <dd>{money(selected.refund_amount)}</dd>
                  </div>
                </dl>

                {selected.reason && (
                  <div>
                    <span className="eyebrow text-muted-foreground">Reason</span>
                    <p className="mt-2 whitespace-pre-line">{selected.reason}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <span className="eyebrow text-muted-foreground">Status</span>
                  <Select
                    value={selected.status}
                    onValueChange={(v) =>
                      changeStatus.mutate({ id: selected.id, value: v as ReturnStatus })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RETURN_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <span className="eyebrow text-muted-foreground">History</span>
                  <ul className="mt-3 space-y-2">
                    {selected.return_events.length === 0 && (
                      <li className="text-muted-foreground">No events recorded.</li>
                    )}
                    {selected.return_events.map((e) => (
                      <li key={e.id} className="flex justify-between gap-4">
                        <span className="capitalize">{String(e.status).replace(/_/g, " ")}</span>
                        <span className="text-muted-foreground">{dateTime(e.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <span className="eyebrow text-muted-foreground">Internal notes</span>
                  <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <Button size="sm" variant="outline" onClick={() => saveNotes.mutate(selected.id)}>
                    Save notes
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getReturns,
  setReturnStatus,
  addReturnNote,
  createReturn,
  markReturnRefunded,
} from "@/lib/api/returns";
import { getOrderByNumber } from "@/lib/api/orders";
import {
  RETURN_STATUSES,
  RETURN_TYPES,
  type ReturnStatus,
  type ReturnType,
  type ReturnWithEvents,
} from "@/lib/api/types";
import { money, dateTime, num } from "@/lib/format";
import { refundOrderFn, sendReturnUpdateFn } from "@/lib/commerce.functions";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Mail, Plus, RefreshCw, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";

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

const STATUS_TABS: { value: ReturnStatus | "all"; label: string }[] = [
  { value: "all", label: "All Returns" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "items_received", label: "Items Received" },
  { value: "refunded", label: "Refunded" },
  { value: "rejected", label: "Rejected" },
];

function reference(r: { order_number: string | null; id: string }): string {
  return r.order_number ? `RET-${r.order_number}` : `RET-${r.id.slice(0, 8).toUpperCase()}`;
}

function ReturnsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<{ status: ReturnStatus | "all"; search: string }>({
    status: "all",
    search: "",
  });
  const [selected, setSelected] = useState<ReturnWithEvents | null>(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    orderNumber: "",
    type: "withdrawal" as ReturnType,
    reason: "",
  });

  const returns = useQuery({
    queryKey: ["returns", filters],
    queryFn: () => getReturns(filters),
  });

  const allReturns = useQuery({
    queryKey: ["returns", "all-for-counts"],
    queryFn: () => getReturns({}),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["returns"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const changeStatus = useMutation({
    mutationFn: ({ id, value }: { id: string; value: ReturnStatus }) => setReturnStatus(id, value),
    onSuccess: (_r, vars) => {
      toast.success("Return updated");
      invalidate();
      setSelected((s) => (s && s.id === vars.id ? { ...s, status: vars.value } : s));
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

  const emailCall = useServerFn(sendReturnUpdateFn);
  const emailCustomer = useMutation({
    mutationFn: ({ id, msg }: { id: string; msg: string }) =>
      emailCall({ data: { returnId: id, message: msg.trim() || undefined } }),
    onSuccess: (r) => toast.success(r.sent ? "Email sent to customer" : "Email provider not configured yet"),
    onError: (e: Error) => toast.error(e.message),
  });

  const refundCall = useServerFn(refundOrderFn);
  const refund = useMutation({
    mutationFn: async ({ returnId, orderId, amount }: { returnId: string; orderId: string; amount?: number }) => {
      await refundCall({ data: amount ? { orderId, amount } : { orderId } });
      await markReturnRefunded(returnId, amount ?? 0);
    },
    onSuccess: () => {
      toast.success("Refund issued and return marked refunded");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createReturnMutation = useMutation({
    mutationFn: async () => {
      const order = await getOrderByNumber(newForm.orderNumber);
      if (!order) throw new Error(`No order found with number "${newForm.orderNumber}"`);
      if (!newForm.reason.trim()) throw new Error("A reason is required");
      return createReturn({
        order_id: order.id,
        order_number: order.order_number,
        customer_email: order.customer_email,
        type: newForm.type,
        reason: newForm.reason.trim(),
      });
    },
    onSuccess: (created) => {
      toast.success(`Return ${reference(created)} created`);
      setNewOpen(false);
      setNewForm({ orderNumber: "", type: "withdrawal", reason: "" });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openReturn(r: ReturnWithEvents) {
    setSelected(r);
    setNotes(r.notes ?? "");
    setMessage("");
  }

  const counts = (allReturns.data ?? []).reduce<Record<string, number>>(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {},
  );
  const totalCount = allReturns.data?.length ?? 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Aftercare"
        title="Returns"
        description="EU right of withdrawal is 14 days from delivery. Refunds are due within 14 days of receiving the goods back."
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" />
            New Return
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => {
          const count = t.value === "all" ? totalCount : (counts[t.value] ?? 0);
          const active = filters.status === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setFilters((f) => ({ ...f, status: t.value }))}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:border-foreground/40",
              )}
            >
              <RotateCcw className="h-3.5 w-3.5 opacity-70" />
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  active ? "bg-background/20" : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search order number or customer email…"
            className="pl-9"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            returns.refetch();
            allReturns.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {returns.isLoading ? (
        <LoadingState />
      ) : returns.error ? (
        <ErrorState error={returns.error} onRetry={() => returns.refetch()} />
      ) : returns.data!.length === 0 ? (
        <EmptyState
          title="No returns"
          description="Return requests from the storefront land here — or use New Return for a phone/email request."
        />
      ) : (
        <div className="space-y-4">
          {returns.data!.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-2">
                    <RotateCcw className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{reference(r)}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(r.submitted_at)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={r.type} />
                  <StatusBadge value={r.status} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openReturn(r)}>
                    View Details
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={emailCustomer.isPending && emailCustomer.variables?.id === r.id}
                    onClick={() => emailCustomer.mutate({ id: r.id, msg: "" })}
                  >
                    <Mail className="h-4 w-4" />
                    Email Customer
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="eyebrow text-muted-foreground">Customer</p>
                  <p className="mt-1 text-sm font-medium">{r.customer_email}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="eyebrow text-muted-foreground">Reason</p>
                  <p className="mt-1 line-clamp-2 text-sm">{r.reason || "—"}</p>
                </div>
                <div className="lg:text-right">
                  <p className="eyebrow text-muted-foreground">Refund</p>
                  <p className="text-lg font-semibold">{money(r.refund_amount)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Return — for return requests taken by phone or email, so a return
          record always exists rather than being tracked outside the system. */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Return</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Order number</Label>
              <Input
                placeholder="e.g. HB-2026-000003"
                value={newForm.orderNumber}
                onChange={(e) => setNewForm((f) => ({ ...f, orderNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={newForm.type}
                onValueChange={(v) => setNewForm((f) => ({ ...f, type: v as ReturnType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                rows={3}
                value={newForm.reason}
                onChange={(e) => setNewForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="What the customer told you"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createReturnMutation.mutate()}
              disabled={createReturnMutation.isPending}
            >
              {createReturnMutation.isPending ? "Creating…" : "Create return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{reference(selected)}</SheetTitle>
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

                <section className="space-y-3">
                  <span className="eyebrow text-muted-foreground">
                    Message to customer (accept / reject reason)
                  </span>
                  <Textarea
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="e.g. Your return has been approved — please ship the item back using the enclosed label."
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={emailCustomer.isPending}
                    onClick={() => emailCustomer.mutate({ id: selected.id, msg: message })}
                  >
                    <Mail className="h-4 w-4" />
                    Email customer the decision
                  </Button>
                </section>

                <section className="space-y-3">
                  <span className="eyebrow text-muted-foreground">Refund</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={
                      refund.isPending ||
                      selected.status === "refunded" ||
                      !selected.order_id
                    }
                    onClick={() =>
                      selected.order_id &&
                      refund.mutate({
                        returnId: selected.id,
                        orderId: selected.order_id,
                        ...(selected.refund_amount ? { amount: num(selected.refund_amount) } : {}),
                      })
                    }
                  >
                    {selected.status === "refunded"
                      ? "Already refunded"
                      : refund.isPending
                        ? "Refunding…"
                        : "Issue refund"}
                  </Button>
                  {!selected.order_id && (
                    <p className="text-xs text-muted-foreground">
                      No linked order — refund must be issued manually.
                    </p>
                  )}
                </section>

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

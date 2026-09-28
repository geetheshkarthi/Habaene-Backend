import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getRefunds, getRefundStats, type Refund } from "@/lib/api/refunds";
import { getOrders } from "@/lib/api/orders";
import { refundOrderFn } from "@/lib/commerce.functions";
import { money, dateTime, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatCard, DateRangePicker } from "@/components/admin/AnalyticsKit";
import { useDateRange } from "@/lib/analytics-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/refunds")({
  head: () => ({ meta: [{ title: "Refunds — HABÄNE Admin" }] }),
  component: RefundsPage,
});

const STATUS_STYLES: Record<Refund["status"], string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-amber-500/10 text-amber-600",
  succeeded: "bg-green-500/10 text-green-600",
  failed: "bg-destructive/10 text-destructive",
};

function RefundsPage() {
  const qc = useQueryClient();
  const { range, pickerProps } = useDateRange();
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");

  const refundCall = useServerFn(refundOrderFn);

  const refunds = useQuery({ queryKey: ["refunds"], queryFn: () => getRefunds() });
  const stats = useQuery({
    queryKey: ["refund-stats", range],
    queryFn: () => getRefundStats(range.start, range.end),
  });
  // Paid orders are the only ones Stripe can refund.
  const orders = useQuery({
    queryKey: ["orders", "paid"],
    queryFn: () => getOrders({ paymentStatus: "paid" }),
  });

  const issue = useMutation({
    mutationFn: () => {
      const parsed = Number(amount);
      return refundCall({
        data: {
          orderId,
          ...(amount.trim() !== "" && parsed > 0 ? { amount: parsed } : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success("Refund issued");
      setOpen(false);
      setOrderId("");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["refunds"] });
      qc.invalidateQueries({ queryKey: ["refund-stats"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const error = refunds.error ?? stats.error;
  if (error) return <ErrorState error={error} />;

  const rows = refunds.data ?? [];
  const s = stats.data;
  const orderList = orders.data ?? [];
  const orderNumberById = new Map(orderList.map((o) => [o.id, o.order_number]));
  const selectedOrder = orderList.find((o) => o.id === orderId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Orders & Operations"
        title="Refunds"
        description="Every refund issued against an order, full or partial."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!rows.length}
              onClick={() => downloadFile("refunds.csv", toCsv(rows))}
            >
              Export CSV
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              Issue refund
            </Button>
          </div>
        }
      />

      <DateRangePicker {...pickerProps} />

      {s && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Refunded"
            value={money(s.total_refunded)}
            accent="text-destructive"
          />
          <StatCard label="Refund Count" value={s.count} />
          <StatCard label="Full Refunds" value={s.full_refunds} />
          <StatCard label="Partial Refunds" value={s.partial_refunds} />
        </div>
      )}

      {refunds.isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No refunds"
          description="Refunds issued from here or from an order appear in this ledger."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">Date</th>
                <th className="p-3">Order</th>
                <th className="p-3">Type</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Status</th>
                <th className="p-3">Stripe ID</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="whitespace-nowrap p-3 text-muted-foreground">
                    {dateTime(r.created_at)}
                  </td>
                  <td className="p-3">
                    {orderNumberById.get(r.order_id) ?? r.order_id.slice(0, 8)}
                  </td>
                  <td className="p-3 capitalize">{r.type.replace(/_/g, " ")}</td>
                  <td className="p-3 text-muted-foreground">{r.reason ?? "—"}</td>
                  <td className="p-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{r.stripe_refund_id ?? "—"}</td>
                  <td className="p-3 text-right text-destructive">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue a refund</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Order</Label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              >
                <option value="">Select a paid order…</option>
                {orderList.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.order_number} — {o.customer_email} — {money(o.total)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Amount (leave blank for a full refund)</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                placeholder={selectedOrder ? String(selectedOrder.total) : "0.00"}
                onChange={(e) => setAmount(e.target.value)}
              />
              {selectedOrder && (
                <p className="text-xs text-muted-foreground">
                  Order total is {money(selectedOrder.total)}. A partial refund must be lower than
                  this.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => issue.mutate()} disabled={!orderId || issue.isPending}>
              {issue.isPending ? "Processing…" : "Refund via Stripe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

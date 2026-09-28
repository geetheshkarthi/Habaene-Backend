import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getOrders,
  updateOrderStatus,
  updatePaymentStatus,
  updateOrderShipping,
  updateOrderNotes,
  type OrderFilters,
} from "@/lib/api/orders";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type OrderStatus,
  type OrderWithItems,
  type PaymentStatus,
  type Address,
} from "@/lib/api/types";
import { money, dateTime, toCsv, downloadFile, num } from "@/lib/format";
import {
  createShipmentFn,
  refundOrderFn,
  resendOrderConfirmationFn,
  sendShippingNotificationFn,
} from "@/lib/commerce.functions";
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
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({
    meta: [
      { title: "Orders — HABÄNE Admin" },
      { name: "description", content: "Track, fulfil and refund HABÄNE customer orders." },
      { property: "og:title", content: "Orders — HABÄNE Admin" },
      { property: "og:description", content: "Track, fulfil and refund HABÄNE customer orders." },
    ],
  }),
  component: OrdersPage,
});

function formatAddress(value: unknown): string {
  const a = (value ?? {}) as Address;
  return [
    [a.first_name, a.last_name].filter(Boolean).join(" "),
    a.company,
    a.line1,
    a.line2,
    [a.postal_code, a.city].filter(Boolean).join(" "),
    a.country,
  ]
    .filter(Boolean)
    .join("\n");
}

function OrdersPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<OrderFilters>({ status: "all", paymentStatus: "all" });
  const [selected, setSelected] = useState<OrderWithItems | null>(null);
  const [tracking, setTracking] = useState({ carrier: "", number: "" });
  const [notes, setNotes] = useState("");

  const orders = useQuery({ queryKey: ["orders", filters], queryFn: () => getOrders(filters) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: OrderStatus }) => updateOrderStatus(id, value),
    onSuccess: () => {
      toast.success("Order status updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payment = useMutation({
    mutationFn: ({ id, value }: { id: string; value: PaymentStatus }) =>
      updatePaymentStatus(id, value),
    onSuccess: () => {
      toast.success("Payment status updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shipping = useMutation({
    mutationFn: (id: string) =>
      updateOrderShipping(id, {
        shipping_carrier: tracking.carrier.trim() || null,
        tracking_number: tracking.number.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Tracking saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refundCall = useServerFn(refundOrderFn);
  const resendCall = useServerFn(resendOrderConfirmationFn);
  const shipMailCall = useServerFn(sendShippingNotificationFn);
  const createShipmentCall = useServerFn(createShipmentFn);

  const refund = useMutation({
    mutationFn: (id: string) => refundCall({ data: { orderId: id } }),
    onSuccess: () => {
      toast.success("Refund issued");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendConfirmation = useMutation({
    mutationFn: (id: string) => resendCall({ data: { orderId: id } }),
    onSuccess: (r) =>
      toast.success(r.sent ? "Confirmation sent" : "Email provider not configured yet"),
    onError: (e: Error) => toast.error(e.message),
  });

  const shippingEmail = useMutation({
    mutationFn: (id: string) => shipMailCall({ data: { orderId: id } }),
    onSuccess: (r) =>
      toast.success(r.sent ? "Shipping notification sent" : "Email provider not configured yet"),
    onError: (e: Error) => toast.error(e.message),
  });

  const createShipment = useMutation({
    mutationFn: ({ id, carrier }: { id: string; carrier: "dhl" | "delhivery" }) =>
      createShipmentCall({ data: { orderId: id, carrier } }),
    onSuccess: (result) => {
      toast.success(`Shipment created — tracking ${result.trackingNumber}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const noteSave = useMutation({
    mutationFn: (id: string) => updateOrderNotes(id, notes),
    onSuccess: () => {
      toast.success("Notes saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportCsv() {
    const rows = (orders.data ?? []).map((o) => ({
      order_number: o.order_number,
      date: o.created_at,
      customer: o.customer_name,
      email: o.customer_email,
      status: o.status,
      payment_status: o.payment_status,
      subtotal: num(o.subtotal),
      shipping: num(o.shipping_cost),
      vat: num(o.vat_amount),
      total: num(o.total),
    }));
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadFile(`habaene-orders-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  function openOrder(o: OrderWithItems) {
    setSelected(o);
    setTracking({ carrier: o.shipping_carrier ?? "", number: o.tracking_number ?? "" });
    setNotes(o.notes ?? "");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Fulfilment"
        title="Orders"
        description="Invoice-relevant records. Orders are never hard-deleted."
        actions={
          <Button variant="outline" onClick={exportCsv}>
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search order no., name, email, tracking"
          className="max-w-xs"
          value={filters.search ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
        <Select
          value={filters.status ?? "all"}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v as OrderStatus | "all" }))}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.paymentStatus ?? "all"}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, paymentStatus: v as PaymentStatus | "all" }))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            {PAYMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {orders.isLoading ? (
        <LoadingState />
      ) : orders.error ? (
        <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
      ) : orders.data!.length === 0 ? (
        <EmptyState title="No orders" description="Orders appear here once checkout is live." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.data!.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <p className="font-medium">{o.order_number}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(o.created_at)}</p>
                  </TableCell>
                  <TableCell>
                    <p>{o.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{o.customer_email}</p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={o.status} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={o.payment_status} />
                  </TableCell>
                  <TableCell className="text-right">{money(o.total)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openOrder(o)}>
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
                <SheetTitle>{selected.order_number}</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 px-4 pb-8">
                <p className="text-xs text-muted-foreground">{dateTime(selected.created_at)}</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Order status</Label>
                    <Select
                      value={selected.status}
                      onValueChange={(v) =>
                        status.mutate({ id: selected.id, value: v as OrderStatus })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Payment status</Label>
                    <Select
                      value={selected.payment_status}
                      onValueChange={(v) =>
                        payment.mutate({ id: selected.id, value: v as PaymentStatus })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <section>
                  <span className="eyebrow text-muted-foreground">Items</span>
                  <ul className="mt-3 space-y-2 text-sm">
                    {selected.order_items.map((it) => (
                      <li key={it.id} className="flex justify-between gap-4">
                        <span>
                          {it.quantity} × {it.product_name}
                        </span>
                        <span>{money(it.subtotal)}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Subtotal</dt>
                      <dd>{money(selected.subtotal)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Shipping</dt>
                      <dd>{money(selected.shipping_cost)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">
                        VAT ({Math.round(num(selected.vat_rate) * 100)}%, included)
                      </dt>
                      <dd>{money(selected.vat_amount)}</dd>
                    </div>
                    <div className="flex justify-between font-medium">
                      <dt>Total</dt>
                      <dd>{money(selected.total)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <span className="eyebrow text-muted-foreground">Shipping address</span>
                    <p className="mt-2 text-sm whitespace-pre-line">
                      {formatAddress(selected.shipping_address) || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="eyebrow text-muted-foreground">Billing address</span>
                    <p className="mt-2 text-sm whitespace-pre-line">
                      {formatAddress(selected.billing_address) || "—"}
                    </p>
                  </div>
                </section>

                <section className="space-y-3">
                  <span className="eyebrow text-muted-foreground">Tracking</span>
                  <Input
                    placeholder="Carrier (e.g. DHL)"
                    value={tracking.carrier}
                    onChange={(e) => setTracking((t) => ({ ...t, carrier: e.target.value }))}
                  />
                  <Input
                    placeholder="Tracking number"
                    value={tracking.number}
                    onChange={(e) => setTracking((t) => ({ ...t, number: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => shipping.mutate(selected.id)}>
                      Save tracking
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={shippingEmail.isPending}
                      onClick={() => shippingEmail.mutate(selected.id)}
                    >
                      Email shipping update
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={createShipment.isPending}
                      onClick={() => createShipment.mutate({ id: selected.id, carrier: "dhl" })}
                    >
                      Create shipment via DHL
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={createShipment.isPending}
                      onClick={() => createShipment.mutate({ id: selected.id, carrier: "delhivery" })}
                    >
                      Create shipment via Delhivery
                    </Button>
                  </div>
                </section>

                <section className="space-y-3">
                  <span className="eyebrow text-muted-foreground">Payment actions</span>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resendConfirmation.isPending}
                      onClick={() => resendConfirmation.mutate(selected.id)}
                    >
                      Resend confirmation
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={refund.isPending || selected.payment_status !== "paid"}
                      onClick={() => refund.mutate(selected.id)}
                    >
                      Refund via Stripe
                    </Button>
                  </div>
                </section>

                <section className="space-y-3">
                  <span className="eyebrow text-muted-foreground">Internal notes</span>
                  <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <Button size="sm" variant="outline" onClick={() => noteSave.mutate(selected.id)}>
                    Save notes
                  </Button>
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

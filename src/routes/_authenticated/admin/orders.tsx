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
import { getStoreSettings } from "@/lib/api/settings";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type OrderStatus,
  type OrderWithItems,
  type PaymentStatus,
  type Address,
  type StoreSettings,
} from "@/lib/api/types";
import { money, dateTime, dateShort, toCsv, downloadFile, num } from "@/lib/format";
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
import { Printer, RefreshCw, Eye, Package, Search } from "lucide-react";
import { cn } from "@/lib/utils";

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

function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function paymentRef(o: OrderWithItems): string {
  return (
    o.razorpay_payment_id ||
    o.payment_intent_id ||
    o.stripe_session_id ||
    o.slice_payment_id ||
    "—"
  );
}

function openInvoice(order: OrderWithItems, settings: StoreSettings | undefined) {
  const company = settings?.legal_company_name || settings?.brand_name || "HABÄNE";
  const address = formatAddress(settings?.business_address).replace(/\n/g, ", ");
  const vatId = settings?.vat_id ? `VAT ID: ${esc(settings.vat_id)}` : "";
  const invoiceNo = `${settings?.invoice_prefix ?? ""}${order.order_number}`;

  const itemsRows = order.order_items
    .map(
      (it) => `
        <tr>
          <td>${esc(it.product_name)}</td>
          <td class="num">${it.quantity}</td>
          <td class="num">${money(num(it.unit_price))}</td>
          <td class="num">${money(num(it.subtotal))}</td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${esc(invoiceNo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; padding: 48px; max-width: 760px; margin: 0 auto; }
  h1 { font-size: 20px; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 4px; }
  .muted { color: #666; font-size: 12px; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .block { margin-bottom: 24px; }
  .label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #888; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 8px 4px; font-size: 13px; border-bottom: 1px solid #e5e5e5; }
  th { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #888; }
  td.num, th.num { text-align: right; }
  .totals { width: 280px; margin-left: auto; margin-top: 16px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .totals .grand { font-weight: 700; font-size: 16px; border-top: 1px solid #1a1a1a; margin-top: 6px; padding-top: 10px; }
  pre { font-family: inherit; white-space: pre-line; margin: 0; font-size: 13px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="row">
    <div>
      <h1>${esc(company)}</h1>
      <p class="muted">${esc(address)}${vatId ? " — " + vatId : ""}</p>
      ${settings?.support_email ? `<p class="muted">${esc(settings.support_email)}</p>` : ""}
    </div>
    <div style="text-align:right">
      <div class="label">Invoice</div>
      <div style="font-size:18px;font-weight:700">${esc(invoiceNo)}</div>
      <p class="muted">${esc(dateShort(order.created_at))}</p>
    </div>
  </div>

  <div class="row">
    <div class="block">
      <div class="label">Bill to</div>
      <pre>${esc(order.customer_name)}
${esc(order.customer_email)}${order.customer_phone ? "\n" + esc(order.customer_phone) : ""}</pre>
    </div>
    <div class="block">
      <div class="label">Ship to</div>
      <pre>${esc(formatAddress(order.shipping_address))}</pre>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Subtotal</th></tr>
    </thead>
    <tbody>${itemsRows}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
    <div><span>Shipping</span><span>${money(order.shipping_cost)}</span></div>
    <div><span>VAT (${Math.round(num(order.vat_rate) * 100)}%, included)</span><span>${money(order.vat_amount)}</span></div>
    <div class="grand"><span>Total</span><span>${money(order.total)}</span></div>
  </div>

  <p class="muted" style="margin-top:40px">
    Payment method: ${esc(order.payment_method || "—")} · Status: ${esc(order.payment_status)}
    ${order.tracking_number ? ` · Tracking: ${esc(order.tracking_number)}${order.shipping_carrier ? ` (${esc(order.shipping_carrier)})` : ""}` : ""}
  </p>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Pop-up blocked — allow pop-ups to view the invoice");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => win.print();
}

const STATUS_TABS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All Orders" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returns" },
];

function OrdersPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<OrderFilters>({ status: "all", paymentStatus: "all" });
  const [selected, setSelected] = useState<OrderWithItems | null>(null);
  const [tracking, setTracking] = useState({ carrier: "", number: "" });
  const [notes, setNotes] = useState("");

  const orders = useQuery({ queryKey: ["orders", filters], queryFn: () => getOrders(filters) });

  // Unfiltered pass so tab counts stay stable regardless of the active tab/search.
  const allOrders = useQuery({
    queryKey: ["orders", "all-for-counts"],
    queryFn: () => getOrders({}),
  });

  const settings = useQuery({ queryKey: ["store-settings"], queryFn: getStoreSettings });

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

  const counts = (allOrders.data ?? []).reduce<Record<string, number>>(
    (acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }),
    {},
  );
  const totalCount = allOrders.data?.length ?? 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Fulfilment"
        title="Orders"
        description="Invoice-relevant records. Orders are never hard-deleted."
        actions={
          <Button variant="outline" onClick={exportCsv}>
            Export Orders CSV
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => {
          const count = t.value === "all" ? totalCount : (counts[t.value] ?? 0);
          const active = (filters.status ?? "all") === t.value;
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
              <Package className="h-3.5 w-3.5 opacity-70" />
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
            placeholder="Search Order ID, Customer, Email or Tracking…"
            className="pl-9"
            value={filters.search ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
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
            <SelectItem value="all">All Payments</SelectItem>
            {PAYMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => {
            orders.refetch();
            allOrders.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {orders.isLoading ? (
        <LoadingState />
      ) : orders.error ? (
        <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
      ) : orders.data!.length === 0 ? (
        <EmptyState title="No orders" description="Orders appear here once checkout is live." />
      ) : (
        <div className="space-y-4">
          {orders.data!.map((o) => (
            <div key={o.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-2">
                    <Package className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">
                      Order #{o.order_number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Placed on {dateTime(o.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={o.status} />
                  <StatusBadge value={o.payment_status} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openOrder(o)}>
                    <Eye className="h-4 w-4" />
                    View Details
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openInvoice(o, settings.data)}>
                    <Printer className="h-4 w-4" />
                    Invoice
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <p className="eyebrow text-muted-foreground">Customer</p>
                  <p className="mt-1 text-sm font-medium">{o.customer_name}</p>
                  <p className="text-xs text-muted-foreground">{o.customer_email}</p>
                </div>
                <div>
                  <p className="eyebrow text-muted-foreground">Items ({o.order_items.length})</p>
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {o.order_items.slice(0, 3).map((it) => (
                      <li key={it.id} className="truncate">
                        • {it.product_name} x{it.quantity}
                      </li>
                    ))}
                    {o.order_items.length > 3 && (
                      <li className="text-xs text-muted-foreground">
                        +{o.order_items.length - 3} more
                      </li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="eyebrow text-muted-foreground">Delivery details</p>
                  <p className="mt-1 text-sm whitespace-pre-line">
                    {formatAddress(o.shipping_address) || "—"}
                  </p>
                  {o.tracking_number && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tracking: <span className="font-medium">{o.tracking_number}</span>
                      {o.shipping_carrier ? ` (${o.shipping_carrier})` : ""}
                    </p>
                  )}
                </div>
                <div>
                  <p className="eyebrow text-muted-foreground">Payment &amp; Txn</p>
                  <p className="mt-1 text-sm font-medium capitalize">
                    {o.payment_method || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{paymentRef(o)}</p>
                </div>
                <div className="flex flex-col items-start gap-2 lg:items-end">
                  <div className="lg:text-right">
                    <p className="eyebrow text-muted-foreground">Grand Total</p>
                    <p className="text-lg font-semibold">{money(o.total)}</p>
                  </div>
                  <div className="flex w-full flex-col gap-2 lg:w-auto">
                    <Select
                      value={o.status}
                      onValueChange={(v) => status.mutate({ id: o.id, value: v as OrderStatus })}
                    >
                      <SelectTrigger className="h-8 w-full text-xs lg:w-40">
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
                    <Select
                      value={o.payment_status}
                      onValueChange={(v) => payment.mutate({ id: o.id, value: v as PaymentStatus })}
                    >
                      <SelectTrigger className="h-8 w-full text-xs lg:w-40">
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
              </div>
            </div>
          ))}
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
                      variant="outline"
                      onClick={() => openInvoice(selected, settings.data)}
                    >
                      <Printer className="h-4 w-4" />
                      Print invoice
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

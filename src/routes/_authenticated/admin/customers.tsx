import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getCustomers,
  exportCustomerData,
  anonymiseCustomer,
  type CustomerListRow,
} from "@/lib/api/customers";
import { getOrdersByCustomerEmail } from "@/lib/api/orders";
import { sendCustomerMessageFn } from "@/lib/commerce.functions";
import { useServerFn } from "@tanstack/react-start";
import { money, dateShort, dateTime, downloadFile, toCsv } from "@/lib/format";
import type { Address } from "@/lib/api/types";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Mail, RefreshCw, Search, Sparkles, UserPlus, Clock3, Eye, User } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  head: () => ({
    meta: [
      { title: "Customers — HABÄNE Admin" },
      { name: "description", content: "Customer records with GDPR export and erasure tools." },
      { property: "og:title", content: "Customers — HABÄNE Admin" },
      {
        property: "og:description",
        content: "Customer records with GDPR export and erasure tools.",
      },
    ],
  }),
  component: CustomersPage,
});

type Segment = "new" | "returning" | "inactive";

function segmentOf(c: CustomerListRow): Segment {
  if (c.order_count >= 2) return "returning";
  const daysSinceJoined = (Date.now() - new Date(c.created_at).getTime()) / 86_400_000;
  return daysSinceJoined > 30 ? "inactive" : "new";
}

const SEGMENT_META: Record<Segment, { label: string; icon: typeof Sparkles }> = {
  new: { label: "New", icon: UserPlus },
  returning: { label: "Regular", icon: RefreshCw },
  inactive: { label: "Inactive", icon: Clock3 },
};

const TABS: { value: Segment | "all"; label: string }[] = [
  { value: "all", label: "All Customers" },
  { value: "returning", label: "Regular" },
  { value: "new", label: "New" },
  { value: "inactive", label: "Inactive (30d+)" },
];

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

function initials(c: CustomerListRow): string {
  const letter = (c.first_name || c.email)[0];
  return (letter || "?").toUpperCase();
}

function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Segment | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<CustomerListRow | null>(null);
  const [pendingAnonymise, setPendingAnonymise] = useState<{ id: string; email: string } | null>(null);
  const [messageFor, setMessageFor] = useState<string[] | null>(null);
  const [messageForm, setMessageForm] = useState({ subject: "", body: "" });

  const customers = useQuery({
    queryKey: ["customers", search],
    queryFn: () => getCustomers(search),
  });

  const withSegment = (customers.data ?? []).map((c) => ({ ...c, segment: segmentOf(c) }));
  const filtered = tab === "all" ? withSegment : withSegment.filter((c) => c.segment === tab);
  const counts = withSegment.reduce<Record<string, number>>(
    (acc, c) => ({ ...acc, [c.segment]: (acc[c.segment] ?? 0) + 1 }),
    {},
  );

  const exportOne = useMutation({
    mutationFn: async (id: string) => exportCustomerData(id),
    onSuccess: (data) => {
      downloadFile(
        `gdpr-export-${data.customer.email}.json`,
        JSON.stringify(data, null, 2),
        "application/json",
      );
      toast.success("Export downloaded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const anonymise = useMutation({
    mutationFn: (id: string) => anonymiseCustomer(id),
    onSuccess: () => {
      toast.success("Customer anonymised");
      setPendingAnonymise(null);
      setProfile(null);
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const messageCall = useServerFn(sendCustomerMessageFn);
  const sendMessage = useMutation({
    mutationFn: () =>
      messageCall({
        data: { customerIds: messageFor ?? [], subject: messageForm.subject, body: messageForm.body },
      }),
    onSuccess: (r) => {
      toast.success(
        r.sent > 0 ? `Sent to ${r.sent}/${r.total} customer(s)` : "Email provider not configured yet",
      );
      setMessageFor(null);
      setMessageForm({ subject: "", body: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportAll() {
    const rows = filtered.map((c) => ({
      email: c.email,
      first_name: c.first_name,
      last_name: c.last_name,
      segment: c.segment,
      orders: c.order_count,
      total_spent: c.total_spent,
      created_at: c.created_at,
    }));
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadFile("habaene-customers.csv", toCsv(rows));
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="People"
        title="Customers"
        description="Every signed-in account shows up here the moment they log in — Google, email OTP, or an order as a guest. GDPR Art. 17 erasure anonymises personal data while keeping legally required accounting records."
        actions={
          <Button variant="outline" onClick={exportAll}>
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = t.value === "all" ? withSegment.length : (counts[t.value] ?? 0);
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:border-foreground/40",
              )}
            >
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
            placeholder="Search by customer name, email or phone…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={() => customers.refetch()}>
          <RefreshCw className="h-4 w-4" />
          Refresh Customers
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          <Checkbox
            checked={filtered.length > 0 && filtered.every((c) => selected.has(c.id))}
            onCheckedChange={(v) =>
              setSelected(v ? new Set(filtered.map((c) => c.id)) : new Set())
            }
            aria-label="Select all customers"
          />
          {selected.size} customer(s) selected for messaging
        </label>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelected(new Set(filtered.map((c) => c.id)))}
          >
            Select All ({filtered.length})
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
            Clear Selection
          </Button>
          <Button
            size="sm"
            disabled={selected.size === 0}
            onClick={() => {
              setMessageForm({ subject: "", body: "" });
              setMessageFor(Array.from(selected));
            }}
          >
            <Mail className="h-4 w-4" />
            Message Selected ({selected.size})
          </Button>
        </div>
      </div>

      {customers.isLoading ? (
        <LoadingState />
      ) : customers.error ? (
        <ErrorState error={customers.error} onRetry={() => customers.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No customers" description="Customers appear the moment someone signs in." />
      ) : (
        <div className="space-y-4">
          {filtered.map((c) => {
            const meta = SEGMENT_META[c.segment];
            const Icon = meta.icon;
            const avgOrder = c.order_count > 0 ? c.total_spent / c.order_count : 0;
            const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed";
            return (
              <div
                key={c.id}
                className={cn(
                  "rounded-lg border bg-card p-5 transition-colors",
                  selected.has(c.id) ? "border-foreground" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={() => toggle(c.id)}
                      aria-label={`Select ${fullName}`}
                    />
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                      {initials(c)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        Customer since {dateShort(c.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                    {c.newsletter_opt_in && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Newsletter
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setProfile(c)}>
                      <Eye className="h-4 w-4" />
                      View Details
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setMessageForm({ subject: "", body: "" });
                        setMessageFor([c.id]);
                      }}
                    >
                      <Mail className="h-4 w-4" />
                      Message
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="min-w-0">
                    <p className="eyebrow text-muted-foreground">Contact</p>
                    <p className="mt-1 truncate text-sm font-medium">{c.email}</p>
                    <p className="text-xs text-muted-foreground">{c.phone || "No phone"}</p>
                  </div>
                  <div>
                    <p className="eyebrow text-muted-foreground">Orders</p>
                    <p className="mt-1 text-sm font-medium">{c.order_count}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.order_count === 1 ? "1 order placed" : `${c.order_count} orders placed`}
                    </p>
                  </div>
                  <div>
                    <p className="eyebrow text-muted-foreground">Total spent</p>
                    <p className="mt-1 text-sm font-medium">{money(c.total_spent)}</p>
                    <p className="text-xs text-muted-foreground">Paid orders only</p>
                  </div>
                  <div>
                    <p className="eyebrow text-muted-foreground">Avg order</p>
                    <p className="mt-1 text-sm font-medium">{money(avgOrder)}</p>
                  </div>
                  <div className="lg:text-right">
                    <p className="eyebrow text-muted-foreground">Joined</p>
                    <p className="mt-1 text-sm font-medium">{dateShort(c.created_at)}</p>
                    <p className="text-xs text-muted-foreground">
                      Updated {dateShort(c.updated_at)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!messageFor} onOpenChange={(v) => !v && setMessageFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Message {messageFor && messageFor.length > 1 ? `${messageFor.length} customers` : "customer"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={messageForm.subject}
                onChange={(e) => setMessageForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                rows={5}
                value={messageForm.body}
                onChange={(e) => setMessageForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                sendMessage.isPending || !messageForm.subject.trim() || !messageForm.body.trim()
              }
              onClick={() => sendMessage.mutate()}
            >
              {sendMessage.isPending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!profile} onOpenChange={(v) => !v && setProfile(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {profile && (
            <ProfileHistory
              customer={profile}
              onExport={() => exportOne.mutate(profile.id)}
              exportPending={exportOne.isPending}
              onAnonymise={() => setPendingAnonymise({ id: profile.id, email: profile.email })}
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!pendingAnonymise} onOpenChange={(v) => !v && setPendingAnonymise(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anonymise {pendingAnonymise?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes name, email, phone and addresses from the customer record and
              their orders, and deletes newsletter subscriptions. Order totals stay for tax records.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingAnonymise && anonymise.mutate(pendingAnonymise.id)}>
              Anonymise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function ProfileHistory({
  customer,
  onExport,
  exportPending,
  onAnonymise,
}: {
  customer: CustomerListRow;
  onExport: () => void;
  exportPending: boolean;
  onAnonymise: () => void;
}) {
  const orders = useQuery({
    queryKey: ["customer-orders", customer.email],
    queryFn: () => getOrdersByCustomerEmail(customer.email),
  });

  const list = orders.data ?? [];
  const latest = list[0];
  const avgOrder = customer.order_count > 0 ? customer.total_spent / customer.order_count : 0;
  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Unnamed";
  const shipping = latest ? formatAddress(latest.shipping_address) : "";
  const billing = latest ? formatAddress(latest.billing_address) : "";

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <User className="h-4 w-4" />
          {fullName}
        </SheetTitle>
      </SheetHeader>
      <div className="space-y-6 px-4 pb-8 text-sm">
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-border py-3 text-center">
          <div>
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Total spent</p>
            <p className="mt-1 font-semibold">{money(customer.total_spent)}</p>
          </div>
          <div>
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Orders</p>
            <p className="mt-1 font-semibold">{customer.order_count}</p>
          </div>
          <div>
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Avg order</p>
            <p className="mt-1 font-semibold">{money(avgOrder)}</p>
          </div>
        </div>

        <section>
          <span className="eyebrow text-muted-foreground">Profile</span>
          <dl className="mt-2 divide-y divide-border">
            <Field label="Name">{fullName}</Field>
            <Field label="Email">{customer.email}</Field>
            <Field label="Phone">{customer.phone || "—"}</Field>
            <Field label="Joined">{dateTime(customer.created_at)}</Field>
            <Field label="Last updated">{dateTime(customer.updated_at)}</Field>
            <Field label="Last order">{latest ? dateTime(latest.created_at) : "—"}</Field>
            <Field label="Newsletter">
              {customer.newsletter_opt_in ? "Subscribed" : "Not subscribed"}
            </Field>
            <Field label="GDPR consent">
              {customer.gdpr_consent_at ? dateTime(customer.gdpr_consent_at) : "—"}
            </Field>
            {customer.stripe_customer_id && (
              <Field label="Stripe customer">{customer.stripe_customer_id}</Field>
            )}
          </dl>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="eyebrow text-muted-foreground">Shipping address</span>
            <p className="mt-2 whitespace-pre-line">{shipping || "—"}</p>
          </div>
          <div>
            <span className="eyebrow text-muted-foreground">Billing address</span>
            <p className="mt-2 whitespace-pre-line">{billing || "—"}</p>
          </div>
        </section>

        <section>
          <span className="eyebrow text-muted-foreground">Order history ({list.length})</span>
          {orders.isLoading ? (
            <p className="mt-2 text-muted-foreground">Loading…</p>
          ) : list.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {list.map((o) => (
                <li key={o.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">Order #{o.order_number}</p>
                      <p className="text-xs text-muted-foreground">{dateTime(o.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge value={o.status} />
                      <StatusBadge value={o.payment_status} />
                    </div>
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {o.order_items.map((it) => (
                      <li key={it.id} className="flex justify-between gap-4 text-xs">
                        <span className="truncate">
                          {it.quantity} × {it.product_name}
                        </span>
                        <span>{money(it.subtotal)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs">
                    <span className="text-muted-foreground capitalize">
                      {o.payment_method || "—"}
                      {o.tracking_number ? ` · Tracking ${o.tracking_number}` : ""}
                    </span>
                    <span className="text-sm font-semibold">{money(o.total)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-muted-foreground">No orders yet.</p>
          )}
        </section>

        <section className="space-y-2">
          <span className="eyebrow text-muted-foreground">GDPR</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={exportPending} onClick={onExport}>
              Export data
            </Button>
            <Button size="sm" variant="destructive" onClick={onAnonymise}>
              Anonymise
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

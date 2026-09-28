import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCustomers, exportCustomerData, anonymiseCustomer } from "@/lib/api/customers";
import { money, dateShort, downloadFile, toCsv } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<{ id: string; email: string } | null>(null);

  const customers = useQuery({
    queryKey: ["customers", search],
    queryFn: () => getCustomers(search),
  });

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
      setPending(null);
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportAll() {
    const rows = (customers.data ?? []).map((c) => ({
      email: c.email,
      first_name: c.first_name,
      last_name: c.last_name,
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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="People"
        title="Customers"
        description="Guest checkout only — records are derived from orders. GDPR Art. 17 erasure anonymises personal data while keeping legally required accounting records."
        actions={
          <Button variant="outline" onClick={exportAll}>
            Export CSV
          </Button>
        }
      />

      <Input
        placeholder="Search name or email"
        className="max-w-xs"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {customers.isLoading ? (
        <LoadingState />
      ) : customers.error ? (
        <ErrorState error={customers.error} onRetry={() => customers.refetch()} />
      ) : customers.data!.length === 0 ? (
        <EmptyState title="No customers" description="Customers appear after the first order." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.data!.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <p>
                      {c.first_name} {c.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.email}</p>
                  </TableCell>
                  <TableCell>{dateShort(c.created_at)}</TableCell>
                  <TableCell className="text-right">{c.order_count}</TableCell>
                  <TableCell className="text-right">{money(c.total_spent)}</TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => exportOne.mutate(c.id)}>
                      Export data
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setPending({ id: c.id, email: c.email })}
                    >
                      Anonymise
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anonymise {pending?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes name, email, phone and addresses from the customer record and
              their orders, and deletes newsletter subscriptions. Order totals stay for tax records.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && anonymise.mutate(pending.id)}>
              Anonymise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

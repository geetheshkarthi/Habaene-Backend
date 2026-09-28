import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getWishlists, getWishlistByProduct } from "@/lib/api/marketing";
import { dateShort, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatCard, Section } from "@/components/admin/AnalyticsKit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/wishlists")({
  head: () => ({ meta: [{ title: "Wishlists — HABÄNE Admin" }] }),
  component: WishlistsPage,
});

function WishlistsPage() {
  const [search, setSearch] = useState("");

  const items = useQuery({ queryKey: ["wishlists"], queryFn: () => getWishlists() });
  const byProduct = useQuery({
    queryKey: ["wishlists", "by-product"],
    queryFn: getWishlistByProduct,
  });

  const error = items.error ?? byProduct.error;
  if (error) return <ErrorState error={error} />;

  const all = items.data ?? [];
  const grouped = byProduct.data ?? [];
  const term = search.trim().toLowerCase();
  const rows = term
    ? all.filter(
        (w) =>
          w.customer_email.toLowerCase().includes(term) ||
          w.product_name.toLowerCase().includes(term),
      )
    : all;

  const uniqueCustomers = new Set(all.map((w) => w.customer_email)).size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Customers"
        title="Wishlists"
        description="What customers saved but have not bought yet."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!all.length}
            onClick={() => downloadFile("wishlists.csv", toCsv(all))}
          >
            Export CSV
          </Button>
        }
      />

      {items.isLoading ? (
        <LoadingState />
      ) : all.length === 0 ? (
        <EmptyState
          title="No wishlist entries"
          description="Saved items appear here once the storefront wishlist is live."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Saved Items" value={all.length} />
            <StatCard label="Customers" value={uniqueCustomers} />
            <StatCard label="Products Wished For" value={grouped.length} />
          </div>

          <Section title="Most Wished-For Products">
            {grouped.length === 0 ? (
              <p className="text-sm text-muted-foreground">No aggregates available.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {grouped.slice(0, 10).map((g, i) => (
                  <li key={g.product_id} className="flex items-center justify-between gap-4">
                    <span className="truncate">
                      <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                      {g.product_name}
                    </span>
                    <span className="whitespace-nowrap font-medium">{g.count} saves</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <div className="space-y-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email or product"
              className="max-w-xs"
            />
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="p-3">Customer</th>
                    <th className="p-3">Product</th>
                    <th className="p-3">Variant</th>
                    <th className="p-3">Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => (
                    <tr key={w.id} className="border-b border-border/50">
                      <td className="p-3">{w.customer_email}</td>
                      <td className="p-3">{w.product_name}</td>
                      <td className="p-3 text-muted-foreground">{w.variant_id ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{dateShort(w.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

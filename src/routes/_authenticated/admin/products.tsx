import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getProducts, updateProduct, deleteProduct, type ProductFilters } from "@/lib/api/products";
import { PRODUCT_CATEGORIES, type Product } from "@/lib/api/types";
import { money, num } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/products")({
  head: () => ({
    meta: [
      { title: "Products — HABÄNE Admin" },
      {
        name: "description",
        content: "Set pricing, display priority and storefront visibility for catalogue items.",
      },
      { property: "og:title", content: "Products — HABÄNE Admin" },
      {
        property: "og:description",
        content: "Set pricing, display priority and storefront visibility for catalogue items.",
      },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<
    Required<Pick<ProductFilters, "search" | "category" | "stock">>
  >({
    search: "",
    category: "all",
    stock: "all",
  });
  const [editing, setEditing] = useState<Product | null>(null);
  const [price, setPrice] = useState(0);
  const [position, setPosition] = useState(0);

  // Products only ever shows items Inventory has pushed (is_active = true).
  const products = useQuery({
    queryKey: ["products", filters],
    queryFn: () => getProducts({ ...filters, activeOnly: true }),
  });

  // Unfiltered pass for stable summary cards, same pattern as Inventory.
  const allPushed = useQuery({
    queryKey: ["products", "all-pushed"],
    queryFn: () => getProducts({ activeOnly: true }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["products"] });

  const save = useMutation({
    mutationFn: () =>
      updateProduct(editing!.id, { price: num(price), position: Math.trunc(num(position)) }),
    onSuccess: () => {
      toast.success("Product updated");
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // This is the website-visibility toggle — distinct from Inventory's "Push
  // to Products" (is_active). Conflating the two in one column previously
  // meant toggling Hide/Show here could un-push the item from Inventory's
  // perspective too, which looked like "click one button, a different one
  // reacts".
  const publish = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      updateProduct(id, { is_published: published }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      toast.success("Product removed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(p: Product) {
    setEditing(p);
    setPrice(num(p.price));
    setPosition(p.position ?? 0);
  }

  const items = allPushed.data ?? [];
  const totalValuation = items.reduce((s, p) => s + num(p.price) * p.stock, 0);
  const totalProducts = items.length;
  const totalLive = items.filter((p) => p.is_published).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="What's pushed from Inventory — set a price and priority, then choose what goes live on the storefront."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Total Product Valuation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{money(totalValuation)}</p>
            <p className="text-xs text-muted-foreground">Retail value (stock × sell price)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Total Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{totalProducts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Total Products Live
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-success">{totalLive}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search name, code or slug"
          className="max-w-xs"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
        <Select
          value={filters.category}
          onValueChange={(v) => setFilters((f) => ({ ...f, category: v }))}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {PRODUCT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.stock}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, stock: v as NonNullable<ProductFilters["stock"]> }))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock</SelectItem>
            <SelectItem value="in">In stock</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {products.isLoading ? (
        <LoadingState />
      ) : products.error ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} />
      ) : products.data!.length === 0 ? (
        <EmptyState
          title="No products"
          description="Push items from Inventory first — they'll show up here."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Priority</TableHead>
                <TableHead>State</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.data!.map((p) => {
                const publishPending = publish.isPending && publish.variables?.id === p.id;
                const removePending = remove.isPending && remove.variables === p.id;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {p.card_image && (
                          <img
                            src={p.card_image}
                            alt=""
                            className="h-10 w-10 rounded-md object-cover"
                          />
                        )}
                        <div>
                          <p>{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.code || p.slug}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{p.category}</TableCell>
                    <TableCell className="text-right">{money(p.price)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {p.position ?? 0}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={p.is_published ? "active" : "inactive"} />
                    </TableCell>
                    <TableCell className="space-x-1 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                        Price &amp; priority
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={publishPending}
                        onClick={() => publish.mutate({ id: p.id, published: !p.is_published })}
                      >
                        {publishPending
                          ? "Saving…"
                          : p.is_published
                            ? "Hide from Website"
                            : "Show on Website"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={removePending}
                        onClick={() => remove.mutate(p.id)}
                      >
                        {removePending ? "Removing…" : "Remove"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Sell price (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Display priority (lower shows first)</Label>
              <Input
                type="number"
                value={position}
                onChange={(e) => setPosition(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

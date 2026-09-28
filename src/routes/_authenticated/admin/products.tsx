import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  setProductActive,
  type ProductFilters,
} from "@/lib/api/products";
import { PRODUCT_CATEGORIES, LOW_STOCK_THRESHOLD, type Product } from "@/lib/api/types";
import { money, slugify, num } from "@/lib/format";
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
      { name: "description", content: "Manage the HABÄNE catalogue, pricing and stock levels." },
      { property: "og:title", content: "Products — HABÄNE Admin" },
      {
        property: "og:description",
        content: "Manage the HABÄNE catalogue, pricing and stock levels.",
      },
    ],
  }),
  component: ProductsPage,
});

const EMPTY = {
  name: "",
  code: "",
  slug: "",
  category: "system" as Product["category"],
  price: 0,
  stock: 0,
  subtitle: "",
  description: "",
  badge: "",
  weight_kg: 0,
  is_active: true,
};

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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  const products = useQuery({
    queryKey: ["products", filters],
    queryFn: () => getProducts(filters),
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        slug: form.slug.trim() || slugify(form.name),
        price: num(form.price),
        stock: Math.trunc(num(form.stock)),
        weight_kg: num(form.weight_kg),
        badge: form.badge.trim() || null,
      };
      if (editing) return updateProduct(editing.id, payload);
      return createProduct(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Product updated" : "Product created");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      toast.success("Product archived");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setProductActive(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY });
    setOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      code: p.code ?? "",
      slug: p.slug,
      category: p.category,
      price: num(p.price),
      stock: p.stock,
      subtitle: p.subtitle ?? "",
      description: p.description ?? "",
      badge: p.badge ?? "",
      weight_kg: num(p.weight_kg),
      is_active: p.is_active,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="Prices are gross, VAT included. Deleting archives a product so past orders stay intact."
        actions={<Button onClick={openCreate}>New product</Button>}
      />

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
        <EmptyState title="No products" description="Create your first catalogue entry." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>State</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.data!.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p>{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.code || p.slug}</p>
                  </TableCell>
                  <TableCell className="capitalize">{p.category}</TableCell>
                  <TableCell className="text-right">{money(p.price)}</TableCell>
                  <TableCell
                    className={
                      p.stock === 0
                        ? "text-right text-destructive"
                        : p.stock < LOW_STOCK_THRESHOLD
                          ? "text-right text-warning-foreground"
                          : "text-right"
                    }
                  >
                    {p.stock}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={p.is_active ? "active" : "inactive"} />
                  </TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggle.mutate({ id: p.id, active: !p.is_active })}
                    >
                      {p.is_active ? "Hide" : "Show"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => remove.mutate(p.id)}
                    >
                      Archive
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                placeholder={slugify(form.name)}
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v as Product["category"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Price (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Stock</Label>
                <Input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Subtitle</Label>
              <Input
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Description</Label>
              <Textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Badge</Label>
              <Input
                value={form.badge}
                onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Weight (kg)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.weight_kg}
                onChange={(e) => setForm((f) => ({ ...f, weight_kg: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

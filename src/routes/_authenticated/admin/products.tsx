import { useEffect, useState } from "react";
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
import { uploadProductImage, deleteProductImage, getImageUrls } from "@/lib/api/storage";
import {
  PRODUCT_CATEGORIES,
  LOW_STOCK_THRESHOLD,
  type Product,
  type ProductInsert,
} from "@/lib/api/types";
import { money, slugify, num } from "@/lib/format";
import { X, ChevronUp, ChevronDown } from "lucide-react";
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

interface SpecRow {
  key: string;
  value: string;
}
interface ColorRow {
  name: string;
  hex: string;
}

const EMPTY = {
  name: "",
  code: "",
  slug: "",
  category: "system" as Product["category"],
  price: 0,
  cost_price: 0,
  stock: 0,
  subtitle: "",
  description: "",
  badge: "",
  weight_kg: 0,
  is_active: true,
  images: [] as string[],
  card_image: null as string | null,
  specs: [] as SpecRow[],
  colors: [] as ColorRow[],
  sizes: [] as string[],
};

function specsToRows(specs: unknown): SpecRow[] {
  if (!specs || typeof specs !== "object") return [];
  return Object.entries(specs as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: String(value),
  }));
}
function rowsToSpecs(rows: SpecRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) if (r.key.trim()) out[r.key.trim()] = r.value;
  return out;
}
function colorsFromJson(colors: unknown): ColorRow[] {
  if (!Array.isArray(colors)) return [];
  return colors.map((c) =>
    c && typeof c === "object"
      ? {
          name: String((c as Record<string, unknown>)["name"] ?? ""),
          hex: String((c as Record<string, unknown>)["hex"] ?? "#000000"),
        }
      : { name: String(c), hex: "#000000" },
  );
}
function sizesFromJson(sizes: unknown): string[] {
  if (!Array.isArray(sizes)) return [];
  return sizes.map((s) => String(s));
}

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
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (form.images.length === 0) {
      setImageUrls({});
      return;
    }
    let active = true;
    getImageUrls(form.images).then((urls) => {
      if (active) setImageUrls(urls);
    });
    return () => {
      active = false;
    };
  }, [form.images]);

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
        cost_price: num(form.cost_price),
        stock: Math.trunc(num(form.stock)),
        weight_kg: num(form.weight_kg),
        badge: form.badge.trim() || null,
        specs: rowsToSpecs(form.specs),
        colors: form.colors as unknown as ProductInsert["colors"],
        sizes: form.sizes,
        card_image: form.images[0] ?? null,
      };
      if (editing) return updateProduct(editing.id, payload as ProductInsert);
      return createProduct(payload as ProductInsert);
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
      cost_price: num(p.cost_price),
      stock: p.stock,
      subtitle: p.subtitle ?? "",
      description: p.description ?? "",
      badge: p.badge ?? "",
      weight_kg: num(p.weight_kg),
      is_active: p.is_active,
      images: Array.isArray(p.images) ? [...p.images] : [],
      card_image: p.card_image ?? null,
      specs: specsToRows(p.specs),
      colors: colorsFromJson(p.colors),
      sizes: sizesFromJson(p.sizes),
    });
    setOpen(true);
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const slug = form.slug.trim() || slugify(form.name) || "untitled";
    setUploading(true);
    try {
      const paths = await Promise.all(
        files.map((file) => uploadProductImage(file, { productSlug: slug, kind: "gallery" })),
      );
      setForm((f) => ({ ...f, images: [...f.images, ...paths] }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeImage(path: string) {
    setForm((f) => ({ ...f, images: f.images.filter((p) => p !== path) }));
    deleteProductImage(path).catch(() => {});
  }

  function moveImage(index: number, dir: -1 | 1) {
    setForm((f) => {
      const images = [...f.images];
      const target = index + dir;
      if (target < 0 || target >= images.length) return f;
      [images[index], images[target]] = [images[target]!, images[index]!];
      return { ...f, images };
    });
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
            <div className="grid grid-cols-3 gap-4 sm:col-span-2">
              <div className="space-y-2">
                <Label>Cost price (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.cost_price}
                  onChange={(e) => setForm((f) => ({ ...f, cost_price: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Sell price (€)</Label>
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

            <div className="space-y-2 sm:col-span-2">
              <Label>Images (first is the storefront cover image)</Label>
              <div className="flex flex-wrap gap-3">
                {form.images.map((path, i) => (
                  <div
                    key={path}
                    className="relative h-20 w-20 overflow-hidden rounded-md border border-border"
                  >
                    {imageUrls[path] ? (
                      <img src={imageUrls[path]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        …
                      </div>
                    )}
                    <button
                      type="button"
                      className="absolute top-0.5 right-0.5 rounded-full bg-background/90 p-0.5"
                      onClick={() => removeImage(path)}
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="absolute bottom-0.5 left-0.5 flex gap-0.5">
                      <button
                        type="button"
                        className="rounded-full bg-background/90 p-0.5 disabled:opacity-30"
                        disabled={i === 0}
                        onClick={() => moveImage(i, -1)}
                        aria-label="Move earlier"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-background/90 p-0.5 disabled:opacity-30"
                        disabled={i === form.images.length - 1}
                        onClick={() => moveImage(i, 1)}
                        aria-label="Move later"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
                <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground hover:border-foreground">
                  {uploading ? "Uploading…" : "+ Add"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={handleImageSelect}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Specs</Label>
              {form.specs.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="Material"
                    value={row.key}
                    onChange={(e) =>
                      setForm((f) => {
                        const specs = [...f.specs];
                        specs[i] = { ...specs[i]!, key: e.target.value };
                        return { ...f, specs };
                      })
                    }
                  />
                  <Input
                    placeholder="Premium materials"
                    value={row.value}
                    onChange={(e) =>
                      setForm((f) => {
                        const specs = [...f.specs];
                        specs[i] = { ...specs[i]!, value: e.target.value };
                        return { ...f, specs };
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setForm((f) => ({ ...f, specs: f.specs.filter((_, j) => j !== i) }))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((f) => ({ ...f, specs: [...f.specs, { key: "", value: "" }] }))
                }
              >
                Add spec
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Colors</Label>
              {form.colors.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="Name"
                    value={row.name}
                    onChange={(e) =>
                      setForm((f) => {
                        const colors = [...f.colors];
                        colors[i] = { ...colors[i]!, name: e.target.value };
                        return { ...f, colors };
                      })
                    }
                  />
                  <Input
                    type="color"
                    className="w-14 p-1"
                    value={row.hex}
                    onChange={(e) =>
                      setForm((f) => {
                        const colors = [...f.colors];
                        colors[i] = { ...colors[i]!, hex: e.target.value };
                        return { ...f, colors };
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setForm((f) => ({ ...f, colors: f.colors.filter((_, j) => j !== i) }))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((f) => ({ ...f, colors: [...f.colors, { name: "", hex: "#000000" }] }))
                }
              >
                Add color
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Sizes</Label>
              {form.sizes.map((size, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={size}
                    onChange={(e) =>
                      setForm((f) => {
                        const sizes = [...f.sizes];
                        sizes[i] = e.target.value;
                        return { ...f, sizes };
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setForm((f) => ({ ...f, sizes: f.sizes.filter((_, j) => j !== i) }))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm((f) => ({ ...f, sizes: [...f.sizes, ""] }))}
              >
                Add size
              </Button>
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

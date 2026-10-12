import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState, EmptyState } from "@/components/admin/DataStates";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  getInventoryOverview,
  getInventoryMovements,
  adjustProductStock,
  type InventoryOverviewRow,
} from "@/lib/api/inventory";
import {
  getProduct,
  createProduct,
  updateProduct,
  setProductActive,
  deleteProduct,
} from "@/lib/api/products";
import { uploadProductImage, deleteProductImage, getImageUrls } from "@/lib/api/storage";
import { PRODUCT_CATEGORIES, type Product, type ProductInsert } from "@/lib/api/types";
import { money, slugify, num, toCsv, downloadFile } from "@/lib/format";
import { imageUrl } from "@/lib/config";
import { X, ChevronUp, ChevronDown } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  head: () => ({ meta: [{ title: "Inventory — HABÄNE Admin" }] }),
  component: InventoryPage,
});

const LOW_STOCK_THRESHOLD = 10;
const MAX_IMAGES = 10;

function stockClass(stock: number) {
  if (stock === 0) return "text-destructive font-semibold";
  if (stock < LOW_STOCK_THRESHOLD) return "text-warning-foreground font-semibold";
  return "";
}

interface SpecRow {
  key: string;
  value: string;
}
interface ColorRow {
  name: string;
  hex: string;
}

const EMPTY_FORM = {
  name: "",
  code: "",
  slug: "",
  category: "system" as Product["category"],
  cost_price: 0,
  stock: 0,
  subtitle: "",
  description: "",
  badge: "",
  weight_kg: 0,
  images: [] as string[],
  card_image: null as string | null,
  specs: [] as SpecRow[],
  colors: [] as ColorRow[],
  sizes: [] as string[],
  moodLabel: "",
  moodQuiet: 50,
  moodUrban: 50,
  moodTrip: 50,
  packItems: [] as string[],
  passportService: "",
  passportRole: "",
  materials: "",
  careInstructions: "",
  productStory: "",
  warrantyInfo: "",
  blueprintJson: "{}",
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
function listFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((s) => String(s));
}
function moodFromJson(mood: unknown): {
  label: string;
  quiet: number;
  urban: number;
  trip: number;
} {
  const m = (mood && typeof mood === "object" ? mood : {}) as Record<string, unknown>;
  return {
    label: String(m["label"] ?? ""),
    quiet: Number(m["quiet"] ?? 50),
    urban: Number(m["urban"] ?? 50),
    trip: Number(m["trip"] ?? 50),
  };
}

function InventoryPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "low" | "out" | "log">("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [adjustFor, setAdjustFor] = useState<InventoryOverviewRow | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
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

  const stockFilter = tab === "low" ? "low" : tab === "out" ? "out" : "all";

  const overview = useQuery({
    queryKey: ["inventory-overview", search, category, stockFilter],
    queryFn: () => getInventoryOverview({ search, category, stockFilter }),
    enabled: tab !== "log",
  });

  // Unfiltered pass just for the alert banners/summary cards, so switching
  // tabs/filters doesn't make the KPIs at the top jump around.
  const allItems = useQuery({
    queryKey: ["inventory-overview", "", "all", "all"],
    queryFn: () => getInventoryOverview({}),
  });

  const movements = useQuery({
    queryKey: ["inventory-movements", "all"],
    queryFn: () => getInventoryMovements(undefined, 50),
    enabled: tab === "log",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inventory-overview"] });
    qc.invalidateQueries({ queryKey: ["inventory-movements"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const adjust = useMutation({
    mutationFn: () => adjustProductStock(adjustFor!.id, adjustQty, adjustReason),
    onSuccess: () => {
      toast.success("Stock updated");
      setAdjustFor(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePush = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setProductActive(id, active),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      toast.success("Item archived");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      let blueprint: unknown = {};
      try {
        blueprint = JSON.parse(form.blueprintJson || "{}");
      } catch {
        throw new Error("Blueprint JSON is invalid — fix it or leave it as {}");
      }
      const payload = {
        name: form.name,
        code: form.code,
        slug: form.slug.trim() || slugify(form.name),
        category: form.category,
        cost_price: num(form.cost_price),
        stock: Math.trunc(num(form.stock)),
        subtitle: form.subtitle,
        description: form.description,
        badge: form.badge.trim() || null,
        weight_kg: num(form.weight_kg),
        images: form.images,
        card_image: form.images[0] ?? null,
        specs: rowsToSpecs(form.specs),
        colors: form.colors as unknown as ProductInsert["colors"],
        sizes: form.sizes,
        mood: {
          label: form.moodLabel,
          quiet: num(form.moodQuiet),
          urban: num(form.moodUrban),
          trip: num(form.moodTrip),
        } as unknown as ProductInsert["mood"],
        pack_items: form.packItems as unknown as ProductInsert["pack_items"],
        passport_service: form.passportService,
        passport_role: form.passportRole,
        materials: form.materials,
        care_instructions: form.careInstructions,
        product_story: form.productStory,
        warranty_info: form.warrantyInfo,
        blueprint: blueprint as ProductInsert["blueprint"],
        // New items start unpublished — the owner pushes them live from here,
        // then sets price/priority on the Products page.
        is_active: editingId ? undefined : false,
        price: editingId ? undefined : 0,
      };
      if (editingId) return updateProduct(editingId, payload as ProductInsert);
      return createProduct(payload as ProductInsert);
    },
    onSuccess: () => {
      toast.success(editingId ? "Item updated" : "Item created — push it live when ready");
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setOpen(true);
  }

  async function openEdit(id: string) {
    const p = await getProduct(id);
    setEditingId(p.id);
    const mood = moodFromJson(p.mood);
    setForm({
      name: p.name,
      code: p.code ?? "",
      slug: p.slug,
      category: p.category,
      cost_price: num(p.cost_price),
      stock: p.stock,
      subtitle: p.subtitle ?? "",
      description: p.description ?? "",
      badge: p.badge ?? "",
      weight_kg: num(p.weight_kg),
      images: Array.isArray(p.images) ? [...p.images] : [],
      card_image: p.card_image ?? null,
      specs: specsToRows(p.specs),
      colors: colorsFromJson(p.colors),
      sizes: listFromJson(p.sizes),
      moodLabel: mood.label,
      moodQuiet: mood.quiet,
      moodUrban: mood.urban,
      moodTrip: mood.trip,
      packItems: listFromJson(p.pack_items),
      passportService: p.passport_service ?? "",
      passportRole: p.passport_role ?? "",
      materials: p.materials ?? "",
      careInstructions: p.care_instructions ?? "",
      productStory: p.product_story ?? "",
      warrantyInfo: p.warranty_info ?? "",
      blueprintJson: JSON.stringify(p.blueprint ?? {}, null, 2),
    });
    setOpen(true);
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const remaining = MAX_IMAGES - form.images.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_IMAGES} images per item`);
      return;
    }
    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      toast.error(`Only room for ${remaining} more image(s) — uploaded the first ${remaining}`);
    }
    const slug = form.slug.trim() || slugify(form.name) || "untitled";
    setUploading(true);
    try {
      const paths = await Promise.all(
        toUpload.map((file) => uploadProductImage(file, { productSlug: slug, kind: "gallery" })),
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

  function openAdjust(row: InventoryOverviewRow) {
    setAdjustFor(row);
    setAdjustQty(row.stock);
    setAdjustReason("");
  }

  function exportCsv() {
    const rows = (allItems.data ?? []).map((r) => ({
      code: r.code,
      name: r.name,
      category: r.category,
      available: r.stock,
      damaged_returned: r.damaged_returned,
      incoming: r.incoming,
      cost_price: r.cost_price,
      inventory_value: r.inventory_value,
    }));
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadFile(`habaene-inventory-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  const items = allItems.data ?? [];
  const outOfStockCount = items.filter((r) => r.stock === 0).length;
  const lowStockCount = items.filter((r) => r.stock > 0 && r.stock < LOW_STOCK_THRESHOLD).length;
  const totalUnits = items.reduce((s, r) => s + r.stock, 0);
  const totalValue = items.reduce((s, r) => s + r.inventory_value, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="E-Commerce"
        title="Inventory Management"
        description="Create and maintain every item here — cost, stock, images and full storefront content. Push an item to Products when it's ready for pricing; going live on the website is set there."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button onClick={openCreate}>+ Add item</Button>
          </div>
        }
      />

      {outOfStockCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">
            Out of Stock Alert: {outOfStockCount} product(s) have 0 available units.
          </p>
          <Button size="sm" variant="outline" onClick={() => setTab("out")}>
            View Out of Stock
          </Button>
        </div>
      )}
      {lowStockCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-semibold text-warning-foreground">
            Low Stock Alert: {lowStockCount} product(s) are low in stock.
          </p>
          <Button size="sm" variant="outline" onClick={() => setTab("low")}>
            View Low Stock
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Total Inventory Valuation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{money(totalValue)}</p>
            <p className="text-xs text-muted-foreground">Cost basis (stock × cost price)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Total Stock Units
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{totalUnits.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-warning-foreground">{lowStockCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Out of Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-destructive">{outOfStockCount}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="all">All Items ({items.length})</TabsTrigger>
            <TabsTrigger value="low">Low Stock ({lowStockCount})</TabsTrigger>
            <TabsTrigger value="out">Out of Stock ({outOfStockCount})</TabsTrigger>
            <TabsTrigger value="log">Movement &amp; Adjustments Log</TabsTrigger>
          </TabsList>
          {tab !== "log" && (
            <div className="flex flex-wrap gap-3">
              <Input
                placeholder="Search item name or code…"
                className="max-w-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={category} onValueChange={setCategory}>
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
            </div>
          )}
        </div>

        {(["all", "low", "out"] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            {overview.isLoading ? (
              <LoadingState />
            ) : overview.error ? (
              <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
            ) : (overview.data ?? []).length === 0 ? (
              <EmptyState title="No items" description="Nothing matches this view yet." />
            ) : (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item / Batch Details</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">Damaged / Returned</TableHead>
                      <TableHead className="text-right">Incoming</TableHead>
                      <TableHead className="text-right">Cost / Value</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(overview.data ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {r.card_image && (
                              <img
                                src={imageUrl(r.card_image) ?? undefined}
                                alt=""
                                className="h-10 w-10 rounded-md object-cover"
                              />
                            )}
                            <div>
                              <p className="font-medium">{r.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {r.code} · {r.weight_kg}kg
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">{r.category}</TableCell>
                        <TableCell className={"text-right " + stockClass(r.stock)}>
                          {r.stock} units
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {r.damaged_returned}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {r.incoming}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          <p>Cost: {money(r.cost_price)}</p>
                          <p className="text-muted-foreground">Value: {money(r.inventory_value)}</p>
                        </TableCell>
                        <TableCell className="space-x-1 text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(r.id)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openAdjust(r)}>
                            Update Stock
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={togglePush.isPending && togglePush.variables?.id === r.id}
                            onClick={() => togglePush.mutate({ id: r.id, active: !r.is_active })}
                          >
                            {r.is_active ? "In Products" : "Push to Products"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={archive.isPending && archive.variables === r.id}
                            onClick={() => archive.mutate(r.id)}
                          >
                            {archive.isPending && archive.variables === r.id
                              ? "Deleting…"
                              : "Delete"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        ))}

        <TabsContent value="log" className="mt-4">
          {movements.isLoading ? (
            <LoadingState />
          ) : (movements.data ?? []).length === 0 ? (
            <EmptyState
              title="No movements"
              description="Stock adjustments and receipts will show up here."
            />
          ) : (
            <div className="space-y-2 rounded-lg border border-border bg-card p-5">
              {(movements.data ?? []).map((m) => (
                <div key={m.id} className="flex items-baseline justify-between text-sm">
                  <div>
                    <StatusBadge value={m.movement_type} />
                    <span
                      className={`ml-2 font-medium ${m.quantity_change > 0 ? "text-success" : "text-destructive"}`}
                    >
                      {m.quantity_change > 0 ? "+" : ""}
                      {m.quantity_change}
                    </span>
                    {m.reason && (
                      <span className="ml-2 text-xs text-muted-foreground">({m.reason})</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {m.quantity_before} → {m.quantity_after} ·{" "}
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Update stock dialog */}
      <Dialog open={!!adjustFor} onOpenChange={(o) => !o && setAdjustFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update stock — {adjustFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>New quantity</Label>
              <Input
                type="number"
                min={0}
                value={adjustQty}
                onChange={(e) => setAdjustQty(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                placeholder="e.g. Stock count correction"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustFor(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => adjust.mutate()}
              disabled={adjust.isPending || !adjustReason.trim()}
            >
              {adjust.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/edit item dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit item" : "New item"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="general">
            <TabsList className="grid grid-cols-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="images">Images</TabsTrigger>
              <TabsTrigger value="variants">Specs &amp; Variants</TabsTrigger>
              <TabsTrigger value="content">Story &amp; Content</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="grid gap-4 pt-4 sm:grid-cols-2">
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
                  <Label>Cost price (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.cost_price}
                    onChange={(e) => setForm((f) => ({ ...f, cost_price: Number(e.target.value) }))}
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
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Sell price and display priority are set on the Products page once this item is
                pushed live.
              </p>
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
            </TabsContent>

            <TabsContent value="images" className="space-y-2 pt-4">
              <Label>
                Images ({form.images.length}/{MAX_IMAGES}) — first is the storefront cover image
              </Label>
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
                {form.images.length < MAX_IMAGES && (
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
                )}
              </div>
            </TabsContent>

            <TabsContent value="variants" className="grid gap-4 pt-4 sm:grid-cols-2">
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
                    setForm((f) => ({
                      ...f,
                      colors: [...f.colors, { name: "", hex: "#000000" }],
                    }))
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
            </TabsContent>

            <TabsContent value="content" className="grid gap-4 pt-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Product Mood DNA</Label>
                <Input
                  placeholder="Label, e.g. Focused / Architectural"
                  value={form.moodLabel}
                  onChange={(e) => setForm((f) => ({ ...f, moodLabel: e.target.value }))}
                />
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Quiet ↔ Electric</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={form.moodQuiet}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, moodQuiet: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Urban ↔ Remote</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={form.moodUrban}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, moodUrban: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Short ↔ Long</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={form.moodTrip}
                      onChange={(e) => setForm((f) => ({ ...f, moodTrip: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Pack-it items</Label>
                {form.packItems.map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={item}
                      onChange={(e) =>
                        setForm((f) => {
                          const packItems = [...f.packItems];
                          packItems[i] = e.target.value;
                          return { ...f, packItems };
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          packItems: f.packItems.filter((_, j) => j !== i),
                        }))
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
                  onClick={() => setForm((f) => ({ ...f, packItems: [...f.packItems, ""] }))}
                >
                  Add pack item
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Passport — service path</Label>
                <Input
                  value={form.passportService}
                  onChange={(e) => setForm((f) => ({ ...f, passportService: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Passport — travel role</Label>
                <Input
                  value={form.passportRole}
                  onChange={(e) => setForm((f) => ({ ...f, passportRole: e.target.value }))}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Product details / story</Label>
                <Textarea
                  rows={3}
                  value={form.productStory}
                  onChange={(e) => setForm((f) => ({ ...f, productStory: e.target.value }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Materials</Label>
                <Textarea
                  rows={2}
                  value={form.materials}
                  onChange={(e) => setForm((f) => ({ ...f, materials: e.target.value }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Care &amp; service</Label>
                <Textarea
                  rows={2}
                  value={form.careInstructions}
                  onChange={(e) => setForm((f) => ({ ...f, careInstructions: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Warranty info</Label>
                <Input
                  value={form.warrantyInfo}
                  onChange={(e) => setForm((f) => ({ ...f, warrantyInfo: e.target.value }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Blueprint (advanced — raw JSON)</Label>
                <Textarea
                  rows={4}
                  className="font-mono text-xs"
                  value={form.blueprintJson}
                  onChange={(e) => setForm((f) => ({ ...f, blueprintJson: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {'{ "callouts": [{"x":"20%","y":"30%","label":"..."}], "dimensions": [...] }'} —
                  leave as {"{}"} if you don't need the technical-blueprint overlay.
                </p>
              </div>
            </TabsContent>
          </Tabs>

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

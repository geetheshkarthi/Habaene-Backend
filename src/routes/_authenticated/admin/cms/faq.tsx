import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getFaqItems,
  createFaqItem,
  updateFaqItem,
  deleteFaqItem,
  reorderFaqItems,
  type FaqItem,
} from "@/lib/api/cms";
import { getProducts } from "@/lib/api/products";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/cms/faq")({
  head: () => ({ meta: [{ title: "FAQ — HABÄNE Admin" }] }),
  component: FaqPage,
});

type FormState = {
  question: string;
  answer: string;
  category: string;
  product_id: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  question: "",
  answer: "",
  category: "general",
  product_id: "",
  is_active: true,
};

function FaqPage() {
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FaqItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cms", "faq", category],
    queryFn: () => getFaqItems(category === "all" ? undefined : category),
  });
  const products = useQuery({ queryKey: ["products"], queryFn: () => getProducts() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cms", "faq"] });

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<FaqItem> = {
        question: form.question.trim(),
        answer: form.answer.trim(),
        category: form.category.trim() || "general",
        product_id: form.product_id || null,
        is_active: form.is_active,
      };
      return editing ? updateFaqItem(editing.id, payload) : createFaqItem(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "FAQ updated" : "FAQ created");
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteFaqItem,
    onSuccess: () => {
      toast.success("FAQ deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = useMutation({
    mutationFn: reorderFaqItems,
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;

  const rows = data ?? [];
  const productList = products.data ?? [];
  const productById = new Map(productList.map((p) => [p.id, p.name]));
  const categories = [...new Set((data ?? []).map((f) => f.category))];

  /** Swap an item with its neighbour and persist the new order. */
  function move(index: number, direction: -1 | 1) {
    const next = [...rows];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const a = next[index]!;
    next[index] = next[target]!;
    next[target] = a;
    reorder.mutate(next.map((f) => f.id));
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(f: FaqItem) {
    setEditing(f);
    setForm({
      question: f.question,
      answer: f.answer,
      category: f.category,
      product_id: f.product_id ?? "",
      is_active: f.is_active,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Content"
        title="FAQ"
        description="General and product-specific questions shown on the storefront."
        actions={
          <Button size="sm" onClick={openNew}>
            New FAQ
          </Button>
        }
      />

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {["all", ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-md border px-3 py-1.5 text-xs capitalize transition-colors ${
                category === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No FAQs"
          description="Create a frequently asked question."
          action={
            <Button size="sm" onClick={openNew}>
              New FAQ
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Order</TableHead>
                <TableHead>Question</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>State</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((f, i) => (
                <TableRow key={f.id}>
                  <TableCell className="space-x-1 whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={i === 0 || reorder.isPending}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={i === rows.length - 1 || reorder.isPending}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </Button>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <span className="block font-medium">{f.question}</span>
                    <span className="block truncate text-xs text-muted-foreground">{f.answer}</span>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">{f.category}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {f.product_id ? (productById.get(f.product_id) ?? "—") : "General"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        f.is_active
                          ? "bg-green-500/10 text-green-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {f.is_active ? "active" : "hidden"}
                    </span>
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(f)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => remove.mutate(f.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit FAQ" : "New FAQ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Question</Label>
              <Input
                value={form.question}
                onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Answer</Label>
              <Textarea
                rows={5}
                value={form.answer}
                onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="general, shipping, returns…"
                />
              </div>
              <div className="space-y-2">
                <Label>Product (optional)</Label>
                <select
                  value={form.product_id}
                  onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                >
                  <option value="">General FAQ</option>
                  {productList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Visible on the storefront
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!form.question.trim() || !form.answer.trim() || save.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

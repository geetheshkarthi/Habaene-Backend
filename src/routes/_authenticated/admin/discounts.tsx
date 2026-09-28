import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getDiscountCodes,
  createDiscountCode,
  updateDiscountCode,
  setDiscountActive,
  deleteDiscountCode,
} from "@/lib/api/discounts";
import type { DiscountCode, DiscountType } from "@/lib/api/types";
import { money, dateShort, num } from "@/lib/format";
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

export const Route = createFileRoute("/_authenticated/admin/discounts")({
  head: () => ({
    meta: [
      { title: "Discounts — HABÄNE Admin" },
      { name: "description", content: "Create and manage discount codes and usage limits." },
      { property: "og:title", content: "Discounts — HABÄNE Admin" },
      { property: "og:description", content: "Create and manage discount codes and usage limits." },
    ],
  }),
  component: DiscountsPage,
});

const EMPTY = {
  code: "",
  type: "percent" as DiscountType,
  value: 10,
  min_order: 0,
  max_uses: 0,
  description: "",
  expires_at: "",
  is_active: true,
};

function DiscountsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountCode | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const codes = useQuery({
    queryKey: ["discounts", search],
    queryFn: () => getDiscountCodes(search),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["discounts"] });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code,
        type: form.type,
        value: num(form.value),
        min_order: num(form.min_order),
        max_uses: form.max_uses ? Math.trunc(num(form.max_uses)) : null,
        description: form.description,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        is_active: form.is_active,
      };
      if (editing) return updateDiscountCode(editing.id, payload);
      return createDiscountCode(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Code updated" : "Code created");
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setDiscountActive(id, active),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDiscountCode(id),
    onSuccess: () => {
      toast.success("Code archived");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Promotions"
        title="Discount codes"
        description="Percentage or fixed-amount codes, with optional minimum order value, usage cap and validity window."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setForm({ ...EMPTY });
              setOpen(true);
            }}
          >
            New code
          </Button>
        }
      />

      <Input
        placeholder="Search code"
        className="max-w-xs"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {codes.isLoading ? (
        <LoadingState />
      ) : codes.error ? (
        <ErrorState error={codes.error} onRetry={() => codes.refetch()} />
      ) : codes.data!.length === 0 ? (
        <EmptyState title="No discount codes" description="Create your first promotion." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead>State</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.data!.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.code}</TableCell>
                  <TableCell>
                    {c.type === "percent" ? `${num(c.value)}%` : money(c.value)}
                    {num(c.min_order) > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        min {money(c.min_order)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.expires_at ? `until ${dateShort(c.expires_at)}` : "no expiry"}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.uses_so_far}
                    {c.max_uses ? ` / ${c.max_uses}` : ""}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={c.is_active ? "active" : "inactive"} />
                  </TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(c);
                        setForm({
                          code: c.code,
                          type: c.type,
                          value: num(c.value),
                          min_order: num(c.min_order),
                          max_uses: c.max_uses ?? 0,
                          description: c.description ?? "",
                          expires_at: c.expires_at?.slice(0, 10) ?? "",
                          is_active: c.is_active,
                        });
                        setOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggle.mutate({ id: c.id, active: !c.is_active })}
                    >
                      {c.is_active ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => remove.mutate(c.id)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit code" : "New code"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as DiscountType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <Input
                type="number"
                step="0.01"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Min order (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.min_order}
                onChange={(e) => setForm((f) => ({ ...f, min_order: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Max uses (0 = unlimited)</Label>
              <Input
                type="number"
                value={form.max_uses}
                onChange={(e) => setForm((f) => ({ ...f, max_uses: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Expires at</Label>
              <Input
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.code.trim()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

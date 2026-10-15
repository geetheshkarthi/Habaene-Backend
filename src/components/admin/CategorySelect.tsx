import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addProductCategory, getProductCategories } from "@/lib/api/categories";
import { PRODUCT_CATEGORIES } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ADD_NEW = "__add_new__";

/**
 * Product category dropdown with a built-in "+ Add new category…" option.
 * Pass `allLabel` to include an "all" entry (for filters).
 */
export function CategorySelect({
  value,
  onChange,
  allLabel,
  triggerClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
  triggerClassName?: string;
}) {
  const qc = useQueryClient();
  const categories = useQuery({
    queryKey: ["product-categories"],
    queryFn: getProductCategories,
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const add = useMutation({
    mutationFn: () => addProductCategory(name),
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ["product-categories"] });
      toast.success(`Category "${created}" added`);
      setOpen(false);
      setName("");
      onChange(created);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = categories.data ?? [...PRODUCT_CATEGORIES];
  const options = value && value !== "all" && !list.includes(value) ? [...list, value] : list;

  return (
    <>
      <Select value={value} onValueChange={(v) => (v === ADD_NEW ? setOpen(true) : onChange(v))}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allLabel && <SelectItem value="all">{allLabel}</SelectItem>}
          {options.map((c) => (
            <SelectItem key={c} value={c} className="capitalize">
              {c.replace(/-/g, " ")}
            </SelectItem>
          ))}
          <SelectItem value={ADD_NEW} className="font-medium">
            + Add new category…
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a category</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Category name</Label>
            <Input
              autoFocus
              placeholder="e.g. accessories"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !add.isPending) {
                  e.preventDefault();
                  add.mutate();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Letters, numbers, spaces and hyphens. It's stored in lower case and can't be renamed or
              removed later.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
              {add.isPending ? "Adding…" : "Add category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

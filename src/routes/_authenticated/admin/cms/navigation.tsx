import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getNavigationMenus,
  updateNavigationMenu,
  type NavigationItem,
  type NavigationMenu,
} from "@/lib/api/cms";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/admin/cms/navigation")({
  head: () => ({ meta: [{ title: "Navigation — HABÄNE Admin" }] }),
  component: NavigationPage,
});

function NavigationPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<NavigationMenu | null>(null);
  const [items, setItems] = useState<NavigationItem[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cms", "navigation"],
    queryFn: getNavigationMenus,
  });

  useEffect(() => {
    setItems(editing ? [...(editing.items ?? [])].sort((a, b) => a.position - b.position) : []);
  }, [editing]);

  const save = useMutation({
    mutationFn: () =>
      updateNavigationMenu(
        editing!.id,
        items.map((it, i) => ({ ...it, position: i })),
      ),
    onSuccess: () => {
      toast.success("Menu saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["cms", "navigation"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;

  const menus = data ?? [];
  const incomplete = items.some((it) => !it.label.trim() || !it.url.trim());

  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: "", url: "", target: "_self", position: prev.length },
    ]);
  }

  function patch(index: number, change: Partial<NavigationItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...change } : it)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const a = next[index]!;
      next[index] = next[target]!;
      next[target] = a;
      return next;
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Content"
        title="Navigation"
        description="Header, mega menu and footer links, with their order."
      />

      {isLoading ? (
        <LoadingState />
      ) : menus.length === 0 ? (
        <EmptyState title="No menus found" description="No navigation menus exist in the system." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Menu Name</TableHead>
                <TableHead>Location Key</TableHead>
                <TableHead>Items</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {menus.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.location}</TableCell>
                  <TableCell>{m.items?.length || 0} items</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(m)}>
                      Edit Menu
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing?.name}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 p-4">
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">No links yet. Add the first one.</p>
            )}

            {items.map((it, i) => (
              <div key={it.id} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Position {i + 1}</span>
                  <div className="space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={i === items.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setItems((prev) => prev.filter((_, x) => x !== i))}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input value={it.label} onChange={(e) => patch(i, { label: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">URL</Label>
                  <Input
                    value={it.url}
                    placeholder="/shop"
                    onChange={(e) => patch(i, { url: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={it.target === "_blank"}
                    onChange={(e) => patch(i, { target: e.target.checked ? "_blank" : "_self" })}
                  />
                  Open in a new tab
                </label>
              </div>
            ))}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={addItem}>
                Add link
              </Button>
              <Button
                className="flex-1"
                disabled={save.isPending || incomplete}
                onClick={() => save.mutate()}
              >
                Save menu
              </Button>
            </div>
            {incomplete && (
              <p className="text-xs text-destructive">Every link needs a label and a URL.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

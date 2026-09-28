import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getAnnouncementBars,
  createAnnouncementBar,
  updateAnnouncementBar,
  deleteAnnouncementBar,
  type AnnouncementBar,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/cms/announcements")({
  head: () => ({ meta: [{ title: "Announcements — HABÄNE Admin" }] }),
  component: AnnouncementsPage,
});

type FormState = {
  message: string;
  link_text: string;
  link_url: string;
  background_color: string;
  text_color: string;
  is_active: boolean;
  start_at: string;
  end_at: string;
  position: string;
};

const EMPTY: FormState = {
  message: "",
  link_text: "",
  link_url: "",
  background_color: "#111111",
  text_color: "#ffffff",
  is_active: true,
  start_at: "",
  end_at: "",
  position: "0",
};

/** A bar is only on the storefront when active and inside its date window. */
function liveNow(a: AnnouncementBar): boolean {
  if (!a.is_active) return false;
  const now = Date.now();
  if (a.start_at && new Date(a.start_at).getTime() > now) return false;
  if (a.end_at && new Date(a.end_at).getTime() < now) return false;
  return true;
}

function AnnouncementsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementBar | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cms", "announcements"],
    queryFn: () => getAnnouncementBars(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cms", "announcements"] });

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<AnnouncementBar> = {
        message: form.message.trim(),
        link_text: form.link_text.trim() || null,
        link_url: form.link_url.trim() || null,
        background_color: form.background_color,
        text_color: form.text_color,
        is_active: form.is_active,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        position: Number(form.position) || 0,
      };
      return editing ? updateAnnouncementBar(editing.id, payload) : createAnnouncementBar(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Announcement updated" : "Announcement created");
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (a: AnnouncementBar) => updateAnnouncementBar(a.id, { is_active: !a.is_active }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteAnnouncementBar,
    onSuccess: () => {
      toast.success("Announcement deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;

  const rows = data ?? [];

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(a: AnnouncementBar) {
    setEditing(a);
    setForm({
      message: a.message,
      link_text: a.link_text ?? "",
      link_url: a.link_url ?? "",
      background_color: a.background_color,
      text_color: a.text_color,
      is_active: a.is_active,
      start_at: a.start_at ? a.start_at.slice(0, 16) : "",
      end_at: a.end_at ? a.end_at.slice(0, 16) : "",
      position: String(a.position),
    });
    setOpen(true);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Content"
        title="Announcements"
        description="The promotional bar at the top of the storefront, with its own schedule."
        actions={
          <Button size="sm" onClick={openNew}>
            New announcement
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No announcements"
          description="Create an announcement bar."
          action={
            <Button size="sm" onClick={openNew}>
              New announcement
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Message</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>State</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <span
                      className="inline-block rounded px-2 py-1 text-xs"
                      style={{ background: a.background_color, color: a.text_color }}
                    >
                      {a.message}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.link_url ? `${a.link_text || "Link"} → ${a.link_url}` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.start_at ? dateShort(a.start_at) : "—"} →{" "}
                    {a.end_at ? dateShort(a.end_at) : "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        liveNow(a)
                          ? "bg-green-500/10 text-green-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {liveNow(a) ? "live" : a.is_active ? "scheduled" : "off"}
                    </span>
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggle.mutate(a)}>
                      {a.is_active ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => remove.mutate(a.id)}
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
            <DialogTitle>{editing ? "Edit announcement" : "New announcement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Message</Label>
              <Input
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Free shipping on orders over €150"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Link text</Label>
                <Input
                  value={form.link_text}
                  onChange={(e) => setForm((f) => ({ ...f, link_text: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Link URL</Label>
                <Input
                  value={form.link_url}
                  onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
                  placeholder="/shop"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Background</Label>
                <Input
                  type="color"
                  value={form.background_color}
                  onChange={(e) => setForm((f) => ({ ...f, background_color: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Text colour</Label>
                <Input
                  type="color"
                  value={form.text_color}
                  onChange={(e) => setForm((f) => ({ ...f, text_color: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Position</Label>
                <Input
                  type="number"
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Starts</Label>
                <Input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Ends</Label>
                <Input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active
            </label>
            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs text-muted-foreground">Preview</p>
              <div
                className="rounded px-4 py-2 text-center text-sm"
                style={{ background: form.background_color, color: form.text_color }}
              >
                {form.message || "Your message here"}
                {form.link_text && <span className="ml-2 underline">{form.link_text}</span>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!form.message.trim() || save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

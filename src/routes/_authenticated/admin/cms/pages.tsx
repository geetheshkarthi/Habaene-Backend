import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getCmsPages,
  createCmsPage,
  updateCmsPage,
  deleteCmsPage,
  type CmsPage,
} from "@/lib/api/cms";
import { dateShort, slugify } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatusBadge } from "@/components/admin/StatusBadge";
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

export const Route = createFileRoute("/_authenticated/admin/cms/pages")({
  head: () => ({ meta: [{ title: "Pages — HABÄNE Admin" }] }),
  component: CmsPagesPage,
});

/** Draft → Review → Approved → Scheduled → Published → Archived, per the scope document. */
const STATUSES: CmsPage["status"][] = [
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
  "archived",
];

type FormState = {
  title: string;
  slug: string;
  page_type: string;
  body: string;
  status: CmsPage["status"];
  scheduled_at: string;
  seo_title: string;
  seo_description: string;
};

const EMPTY: FormState = {
  title: "",
  slug: "",
  page_type: "standard",
  body: "",
  status: "draft",
  scheduled_at: "",
  seo_title: "",
  seo_description: "",
};

/** Page bodies live inside the free-form `content` jsonb column. */
function bodyOf(page: CmsPage): string {
  const c = page.content as Record<string, unknown> | null;
  return typeof c?.["body"] === "string" ? (c["body"] as string) : "";
}

function CmsPagesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CmsPage | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cms", "pages", filter],
    queryFn: () => getCmsPages(filter === "all" ? undefined : filter),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cms", "pages"] });

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<CmsPage> = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        page_type: form.page_type.trim() || "standard",
        content: { body: form.body },
        status: form.status,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        seo_title: form.seo_title.trim() || null,
        seo_description: form.seo_description.trim() || null,
        published_at:
          form.status === "published"
            ? (editing?.published_at ?? new Date().toISOString())
            : (editing?.published_at ?? null),
      };
      return editing ? updateCmsPage(editing.id, payload) : createCmsPage(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Page updated" : "Page created");
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteCmsPage,
    onSuccess: () => {
      toast.success("Page deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;

  const rows = data ?? [];

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setSlugTouched(false);
    setOpen(true);
  }

  function openEdit(p: CmsPage) {
    setEditing(p);
    setForm({
      title: p.title,
      slug: p.slug,
      page_type: p.page_type,
      body: bodyOf(p),
      status: p.status,
      scheduled_at: p.scheduled_at ? p.scheduled_at.slice(0, 16) : "",
      seo_title: p.seo_title ?? "",
      seo_description: p.seo_description ?? "",
    });
    setSlugTouched(true);
    setOpen(true);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Content"
        title="Pages"
        description="About, brand story, service pages and any other standalone page."
        actions={
          <Button size="sm" onClick={openNew}>
            Create page
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {["all", ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-md border px-3 py-1.5 text-xs capitalize transition-colors ${
              filter === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No pages yet"
          description="Create your first CMS page."
          action={
            <Button size="sm" onClick={openNew}>
              Create page
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell className="text-muted-foreground">/{p.slug}</TableCell>
                  <TableCell className="capitalize">{p.page_type}</TableCell>
                  <TableCell>
                    <StatusBadge value={p.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{dateShort(p.updated_at)}</TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => remove.mutate(p.id)}
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit page" : "Create page"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: e.target.value }));
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                rows={10}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="HTML or plain text"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Page type</Label>
                <Input
                  value={form.page_type}
                  onChange={(e) => setForm((f) => ({ ...f, page_type: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as CmsPage["status"] }))
                  }
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm capitalize"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Publish at</Label>
                <Input
                  type="datetime-local"
                  disabled={form.status !== "scheduled"}
                  value={form.scheduled_at}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-border p-4">
              <p className="text-sm font-medium">SEO</p>
              <div className="space-y-2">
                <Label>SEO title</Label>
                <Input
                  value={form.seo_title}
                  onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Meta description</Label>
                <Textarea
                  rows={2}
                  value={form.seo_description}
                  onChange={(e) => setForm((f) => ({ ...f, seo_description: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!form.title.trim() || !form.slug.trim() || save.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

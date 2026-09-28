import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getJournalArticles,
  createJournalArticle,
  updateJournalArticle,
  deleteJournalArticle,
  type JournalArticle,
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

export const Route = createFileRoute("/_authenticated/admin/cms/journal")({
  head: () => ({ meta: [{ title: "Journal — HABÄNE Admin" }] }),
  component: JournalPage,
});

const STATUSES: JournalArticle["status"][] = [
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
  excerpt: string;
  content: string;
  author_name: string;
  category: string;
  tags: string;
  featured_image: string;
  video_url: string;
  status: JournalArticle["status"];
  scheduled_at: string;
  seo_title: string;
  seo_description: string;
};

const EMPTY: FormState = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  author_name: "",
  category: "",
  tags: "",
  featured_image: "",
  video_url: "",
  status: "draft",
  scheduled_at: "",
  seo_title: "",
  seo_description: "",
};

function JournalPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<JournalArticle | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cms", "journal", filter],
    queryFn: () => getJournalArticles(filter === "all" ? undefined : filter),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cms", "journal"] });

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<JournalArticle> = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        excerpt: form.excerpt.trim() || null,
        content: form.content,
        author_name: form.author_name.trim() || null,
        category: form.category.trim() || null,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        featured_image: form.featured_image.trim() || null,
        video_url: form.video_url.trim() || null,
        status: form.status,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        seo_title: form.seo_title.trim() || null,
        seo_description: form.seo_description.trim() || null,
        published_at:
          form.status === "published"
            ? (editing?.published_at ?? new Date().toISOString())
            : (editing?.published_at ?? null),
      };
      return editing ? updateJournalArticle(editing.id, payload) : createJournalArticle(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Article updated" : "Article created");
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteJournalArticle,
    onSuccess: () => {
      toast.success("Article deleted");
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

  function openEdit(a: JournalArticle) {
    setEditing(a);
    setForm({
      title: a.title,
      slug: a.slug,
      excerpt: a.excerpt ?? "",
      content: a.content ?? "",
      author_name: a.author_name ?? "",
      category: a.category ?? "",
      tags: (a.tags ?? []).join(", "),
      featured_image: a.featured_image ?? "",
      video_url: a.video_url ?? "",
      status: a.status,
      scheduled_at: a.scheduled_at ? a.scheduled_at.slice(0, 16) : "",
      seo_title: a.seo_title ?? "",
      seo_description: a.seo_description ?? "",
    });
    setSlugTouched(true);
    setOpen(true);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Content"
        title="Journal"
        description="Editorial articles with drafting, scheduling and per-article SEO."
        actions={
          <Button size="sm" onClick={openNew}>
            New article
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
          title="No articles"
          description="Create your first journal entry."
          action={
            <Button size="sm" onClick={openNew}>
              New article
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Views</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <span className="block font-medium">{a.title}</span>
                    <span className="block font-mono text-xs text-muted-foreground">/{a.slug}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{a.category ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{a.author_name ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge value={a.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.published_at ? dateShort(a.published_at) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{a.view_count}</TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                      Edit
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit article" : "New article"}</DialogTitle>
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
              <Label>Excerpt</Label>
              <Textarea
                rows={2}
                value={form.excerpt}
                onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                rows={12}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="HTML or Markdown"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Author</Label>
                <Input
                  value={form.author_name}
                  onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Tags (comma separated)</Label>
                <Input
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Featured image URL</Label>
                <Input
                  value={form.featured_image}
                  onChange={(e) => setForm((f) => ({ ...f, featured_image: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Video URL</Label>
                <Input
                  value={form.video_url}
                  onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as JournalArticle["status"] }))
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

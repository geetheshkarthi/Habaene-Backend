import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  getMediaItems,
  addMediaItem,
  updateMediaItem,
  deleteMediaItem,
  type MediaItem,
} from "@/lib/api/cms";
import { uploadProductImage, getImageUrl } from "@/lib/api/storage";
import { dateShort } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
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

export const Route = createFileRoute("/_authenticated/admin/cms/media")({
  head: () => ({ meta: [{ title: "Media Library — HABÄNE Admin" }] }),
  component: MediaLibraryPage,
});

function typeOf(file: File): MediaItem["type"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

function humanSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaLibraryPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState<string>("all");
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["cms", "media", folder],
    queryFn: () => getMediaItems(folder === "all" ? undefined : folder),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cms", "media"] });

  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      for (const file of Array.from(files)) {
        // Reuse the product-images bucket; `cms` acts as the folder prefix.
        const path = await uploadProductImage(file, { productSlug: "cms", kind: "gallery" });
        const url = (await getImageUrl(path)) ?? path;
        await addMediaItem({
          filename: path,
          original_filename: file.name,
          url,
          type: typeOf(file),
          size_bytes: file.size,
          folder: "cms",
        });
      }
    },
    onSuccess: () => {
      toast.success("Upload complete");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMeta = useMutation({
    mutationFn: () =>
      updateMediaItem(editing!.id, { alt_text: alt || null, caption: caption || null }),
    onSuccess: () => {
      toast.success("Media updated");
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteMediaItem,
    onSuccess: () => {
      toast.success("Media deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;

  const rows = data ?? [];
  const folders = [...new Set(rows.map((m) => m.folder))];
  const missingAlt = rows.filter((m) => m.type === "image" && !m.alt_text).length;

  function openEdit(m: MediaItem) {
    setEditing(m);
    setAlt(m.alt_text ?? "");
    setCaption(m.caption ?? "");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Content"
        title="Media Library"
        description="Images, video and documents used across the site."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) upload.mutate(e.target.files);
                e.target.value = "";
              }}
            />
            <Button size="sm" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
              {upload.isPending ? "Uploading…" : "Upload media"}
            </Button>
          </>
        }
      />

      {missingAlt > 0 && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600">
          {missingAlt} image{missingAlt === 1 ? "" : "s"} without ALT text. Add it for accessibility
          and SEO.
        </p>
      )}

      {folders.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {["all", ...folders].map((f) => (
            <button
              key={f}
              onClick={() => setFolder(f)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                folder === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No media"
          description="Upload images to the media library."
          action={
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              Upload media
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((m) => (
            <div key={m.id} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex aspect-square items-center justify-center bg-muted">
                {m.type === "image" ? (
                  <img
                    src={m.url}
                    alt={m.alt_text ?? m.original_filename}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs uppercase text-muted-foreground">{m.type}</span>
                )}
              </div>
              <div className="space-y-1 p-3">
                <p className="truncate text-xs font-medium">{m.original_filename}</p>
                <p className="text-xs text-muted-foreground">
                  {humanSize(m.size_bytes)} · {dateShort(m.created_at)}
                </p>
                {m.type === "image" && !m.alt_text && (
                  <p className="text-xs text-amber-600">No ALT text</p>
                )}
                <div className="flex gap-1 pt-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => remove.mutate(m.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.original_filename}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ALT text</Label>
              <Input value={alt} onChange={(e) => setAlt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Caption</Label>
              <Input value={caption} onChange={(e) => setCaption(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input readOnly value={editing?.url ?? ""} className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => saveMeta.mutate()} disabled={saveMeta.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

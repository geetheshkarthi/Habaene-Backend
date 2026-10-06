import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getHomepage, updateHomepage, type CmsHomepage, type HeroSlide } from "@/lib/api/cms";
import { getProducts } from "@/lib/api/products";
import { uploadProductImage } from "@/lib/api/storage";
import { imageUrl } from "@/lib/config";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

const MAX_HERO_SLIDES = 10;
const EMPTY_SLIDE: HeroSlide = { image_url: "", eyebrow: "", heading: "", sub: "" };

export const Route = createFileRoute("/_authenticated/admin/cms/homepage")({
  head: () => ({ meta: [{ title: "Homepage — HABÄNE Admin" }] }),
  component: HomepageEditor,
});

type FormState = {
  hero_slides: HeroSlide[];
  homepage_reviews_count: number;
  featured_product_ids: string[];
};

const EMPTY: FormState = {
  hero_slides: [],
  homepage_reviews_count: 8,
  featured_product_ids: [],
};

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function HomepageEditor() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [uploadingSlide, setUploadingSlide] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cms", "homepage"],
    queryFn: getHomepage,
  });
  const products = useQuery({ queryKey: ["products"], queryFn: () => getProducts() });

  useEffect(() => {
    if (!data) return;
    setForm({
      hero_slides: data.hero_slides ?? [],
      homepage_reviews_count: data.homepage_reviews_count ?? 8,
      featured_product_ids: data.featured_product_ids ?? [],
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<CmsHomepage> = {
        hero_slides: form.hero_slides,
        homepage_reviews_count: Math.max(1, Math.trunc(form.homepage_reviews_count) || 8),
        featured_product_ids: form.featured_product_ids,
      };
      return updateHomepage(payload);
    },
    onSuccess: () => {
      toast.success("Homepage updated");
      qc.invalidateQueries({ queryKey: ["cms", "homepage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  const productList = products.data ?? [];

  function toggleFeatured(id: string) {
    setForm((f) => ({
      ...f,
      featured_product_ids: f.featured_product_ids.includes(id)
        ? f.featured_product_ids.filter((x) => x !== id)
        : [...f.featured_product_ids, id],
    }));
  }

  function addSlide() {
    setForm((f) =>
      f.hero_slides.length >= MAX_HERO_SLIDES ? f : { ...f, hero_slides: [...f.hero_slides, { ...EMPTY_SLIDE }] },
    );
  }

  function updateSlide(index: number, patch: Partial<HeroSlide>) {
    setForm((f) => ({
      ...f,
      hero_slides: f.hero_slides.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }

  function removeSlide(index: number) {
    setForm((f) => ({ ...f, hero_slides: f.hero_slides.filter((_, i) => i !== index) }));
  }

  async function uploadSlideImage(index: number, file: File) {
    setUploadingSlide(index);
    try {
      const path = await uploadProductImage(file, { productSlug: "homepage-hero", kind: "gallery" });
      updateSlide(index, { image_url: path });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingSlide(null);
    }
  }

  return (
    <div className="space-y-8 pb-20">
      <PageHeader
        eyebrow="Content"
        title="Homepage"
        description="Only what the storefront homepage actually renders: the hero carousel, the reviews strip and the featured-products grid."
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      {/* The page is long once a few slides are added — the header's Save
          button scrolls out of view, so nothing visible confirms changes
          can be saved while editing further down. This bar stays on screen
          the whole time and is the same mutation as the header button. */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center border-t border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="flex w-full max-w-3xl items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {save.isPending
              ? "Saving…"
              : save.isSuccess
                ? "Saved."
                : "Remember to save after adding, editing or removing a slide."}
          </p>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <Section
        title="Hero carousel"
        hint={`Up to ${MAX_HERO_SLIDES} slides. Each has its own image, small eyebrow text above the title, the title itself, and the sub text shown beside it.`}
      >
        <div className="space-y-4">
          {form.hero_slides.map((slide, i) => (
            <div key={i} className="space-y-3 rounded-md border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Slide {i + 1}</p>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeSlide(i)}>
                  <X className="h-4 w-4" />
                  Remove
                </Button>
              </div>
              <div className="flex items-center gap-3">
                {slide.image_url && (
                  <img
                    src={imageUrl(slide.image_url) ?? undefined}
                    alt=""
                    className="h-16 w-16 rounded-md border border-border object-cover"
                  />
                )}
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Image</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={uploadingSlide === i}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadSlideImage(i, file);
                    }}
                  />
                  {uploadingSlide === i && <p className="text-xs text-muted-foreground">Uploading…</p>}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Small text above title (eyebrow)</Label>
                <Input
                  value={slide.eyebrow}
                  onChange={(e) => updateSlide(i, { eyebrow: e.target.value })}
                  placeholder="01 / SIGNATURE CARRY"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input
                  value={slide.heading}
                  onChange={(e) => updateSlide(i, { heading: e.target.value })}
                  placeholder="Travel Intelligently."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Right-side text</Label>
                <Textarea
                  rows={2}
                  value={slide.sub}
                  onChange={(e) => updateSlide(i, { sub: e.target.value })}
                />
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addSlide} disabled={form.hero_slides.length >= MAX_HERO_SLIDES}>
            + Add slide ({form.hero_slides.length}/{MAX_HERO_SLIDES})
          </Button>
        </div>
      </Section>

      <Section title="Reviews" hint="How many approved reviews the homepage review strip shows.">
        <div className="max-w-xs space-y-2">
          <Label>Number of reviews to show</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={form.homepage_reviews_count}
            onChange={(e) =>
              setForm((f) => ({ ...f, homepage_reviews_count: Number(e.target.value) }))
            }
          />
        </div>
      </Section>

      <Section
        title="Featured Products"
        hint="Pick the products the homepage's product grid should showcase, and how many — leave empty to show the default live catalogue."
      >
        {productList.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products available.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {productList.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 rounded-md border border-border p-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={form.featured_product_ids.includes(p.id)}
                  onChange={() => toggleFeatured(p.id)}
                />
                <span className="truncate">{p.name}</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{form.featured_product_ids.length} selected</p>
      </Section>
    </div>
  );
}

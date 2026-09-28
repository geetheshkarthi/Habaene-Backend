import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getHomepage, updateHomepage, type CmsHomepage } from "@/lib/api/cms";
import { getProducts } from "@/lib/api/products";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect, type ReactNode } from "react";

export const Route = createFileRoute("/_authenticated/admin/cms/homepage")({
  head: () => ({ meta: [{ title: "Homepage — HABÄNE Admin" }] }),
  component: HomepageEditor,
});

type FormState = {
  hero_heading: string;
  hero_subheading: string;
  hero_cta_text: string;
  hero_cta_url: string;
  hero_images: string;
  hero_video_url: string;
  featured_product_ids: string[];
  promotional_sections: string;
  editorial_sections: string;
  faq_section: string;
  newsletter_heading: string;
  newsletter_body: string;
  newsletter_cta: string;
};

const EMPTY: FormState = {
  hero_heading: "",
  hero_subheading: "",
  hero_cta_text: "",
  hero_cta_url: "",
  hero_images: "",
  hero_video_url: "",
  featured_product_ids: [],
  promotional_sections: "[]",
  editorial_sections: "[]",
  faq_section: "[]",
  newsletter_heading: "",
  newsletter_body: "",
  newsletter_cta: "",
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

/** Parse a JSON textarea, falling back when the author left it invalid. */
function parseJson(value: string, fallback: unknown[]): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function isValidJsonArray(value: string): boolean {
  if (value.trim() === "") return true;
  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
}

function HomepageEditor() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cms", "homepage"],
    queryFn: getHomepage,
  });
  const products = useQuery({ queryKey: ["products"], queryFn: () => getProducts() });

  useEffect(() => {
    if (!data) return;
    const news = (data.newsletter_section ?? {}) as Record<string, unknown>;
    setForm({
      hero_heading: data.hero_heading ?? "",
      hero_subheading: data.hero_subheading ?? "",
      hero_cta_text: data.hero_cta_text ?? "",
      hero_cta_url: data.hero_cta_url ?? "",
      hero_images: (data.hero_images ?? []).join("\n"),
      hero_video_url: data.hero_video_url ?? "",
      featured_product_ids: data.featured_product_ids ?? [],
      promotional_sections: JSON.stringify(data.promotional_sections ?? [], null, 2),
      editorial_sections: JSON.stringify(data.editorial_sections ?? [], null, 2),
      faq_section: JSON.stringify(data.faq_section ?? [], null, 2),
      newsletter_heading: String(news["heading"] ?? ""),
      newsletter_body: String(news["body"] ?? ""),
      newsletter_cta: String(news["cta"] ?? ""),
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<CmsHomepage> = {
        hero_heading: form.hero_heading || null,
        hero_subheading: form.hero_subheading || null,
        hero_cta_text: form.hero_cta_text || null,
        hero_cta_url: form.hero_cta_url || null,
        hero_images: form.hero_images
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        hero_video_url: form.hero_video_url || null,
        featured_product_ids: form.featured_product_ids,
        promotional_sections: parseJson(form.promotional_sections, []),
        editorial_sections: parseJson(form.editorial_sections, []),
        faq_section: parseJson(form.faq_section, []),
        newsletter_section: {
          heading: form.newsletter_heading,
          body: form.newsletter_body,
          cta: form.newsletter_cta,
        },
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
  const jsonFieldsValid =
    isValidJsonArray(form.promotional_sections) &&
    isValidJsonArray(form.editorial_sections) &&
    isValidJsonArray(form.faq_section);

  function toggleFeatured(id: string) {
    setForm((f) => ({
      ...f,
      featured_product_ids: f.featured_product_ids.includes(id)
        ? f.featured_product_ids.filter((x) => x !== id)
        : [...f.featured_product_ids, id],
    }));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Content"
        title="Homepage"
        description="Everything the storefront homepage renders, without touching code."
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending || !jsonFieldsValid}>
            Save changes
          </Button>
        }
      />

      <Section title="Hero">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input
              value={form.hero_heading}
              onChange={(e) => setForm((f) => ({ ...f, hero_heading: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Subheading</Label>
            <Input
              value={form.hero_subheading}
              onChange={(e) => setForm((f) => ({ ...f, hero_subheading: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>CTA text</Label>
              <Input
                value={form.hero_cta_text}
                onChange={(e) => setForm((f) => ({ ...f, hero_cta_text: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>CTA URL</Label>
              <Input
                value={form.hero_cta_url}
                onChange={(e) => setForm((f) => ({ ...f, hero_cta_url: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Hero images — one URL per line</Label>
            <Textarea
              rows={4}
              className="font-mono text-xs"
              value={form.hero_images}
              onChange={(e) => setForm((f) => ({ ...f, hero_images: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Hero video URL</Label>
            <Input
              value={form.hero_video_url}
              onChange={(e) => setForm((f) => ({ ...f, hero_video_url: e.target.value }))}
            />
          </div>
        </div>
      </Section>

      <Section title="Featured Products" hint="Pick the products the homepage should showcase.">
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

      <Section title="Newsletter Section">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input
              value={form.newsletter_heading}
              onChange={(e) => setForm((f) => ({ ...f, newsletter_heading: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Body</Label>
            <Textarea
              rows={2}
              value={form.newsletter_body}
              onChange={(e) => setForm((f) => ({ ...f, newsletter_body: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Button text</Label>
            <Input
              value={form.newsletter_cta}
              onChange={(e) => setForm((f) => ({ ...f, newsletter_cta: e.target.value }))}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Promotional, Editorial and FAQ Blocks"
        hint="Free-form section lists. Edit as JSON arrays until a visual block builder is added."
      >
        <div className="space-y-4">
          {(
            [
              ["Promotional sections", "promotional_sections"],
              ["Editorial sections", "editorial_sections"],
              ["FAQ section", "faq_section"],
            ] as const
          ).map(([label, key]) => (
            <div key={key} className="space-y-2">
              <Label>{label}</Label>
              <Textarea
                rows={6}
                className="font-mono text-xs"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
              {!isValidJsonArray(form[key]) && (
                <p className="text-xs text-destructive">Must be a valid JSON array.</p>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

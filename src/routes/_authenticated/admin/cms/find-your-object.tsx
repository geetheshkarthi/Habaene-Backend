import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { getHomepage, updateHomepage } from "@/lib/api/cms";
import { getProducts } from "@/lib/api/products";
import {
  MATCHER_OPTION_KEYS,
  normalizeMatcher,
  type MatcherConfig,
  type MatcherGroup,
  type MatcherRule,
} from "@/lib/api/matcher";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/cms/find-your-object")({
  head: () => ({ meta: [{ title: "Find Your Object — HABÄNE Admin" }] }),
  component: FindYourObjectEditor,
});

const GROUPS: MatcherGroup[] = ["duration", "mode", "mood"];
const ANY = "any";
const NONE = "none";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
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

function FindYourObjectEditor() {
  const qc = useQueryClient();
  const [form, setForm] = useState<MatcherConfig>(normalizeMatcher(null));

  const homepage = useQuery({ queryKey: ["cms", "homepage"], queryFn: getHomepage });
  const products = useQuery({
    queryKey: ["products", "matcher"],
    queryFn: () => getProducts({ activeOnly: true }),
  });

  useEffect(() => {
    if (homepage.data) {
      setForm(normalizeMatcher((homepage.data as unknown as { matcher?: unknown }).matcher));
    }
  }, [homepage.data]);

  const save = useMutation({
    mutationFn: () => updateHomepage({ matcher: form } as never),
    onSuccess: () => {
      toast.success("Saved — the homepage section is updated");
      qc.invalidateQueries({ queryKey: ["cms", "homepage"] });
    },
    onError: (e: Error) => {
      toast.error(
        /matcher/i.test(e.message)
          ? "The database isn't ready for this yet — run the Find Your Object SQL first."
          : e.message,
      );
    },
  });

  if (homepage.isLoading) return <LoadingState />;
  if (homepage.error) return <ErrorState error={homepage.error} onRetry={() => homepage.refetch()} />;

  const items = products.data ?? [];
  const set = <K extends keyof MatcherConfig>(key: K, value: MatcherConfig[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function setQuestion(g: MatcherGroup, patch: { title?: string; option?: [string, string] }) {
    setForm((f) => ({
      ...f,
      questions: {
        ...f.questions,
        [g]: {
          title: patch.title ?? f.questions[g].title,
          options: patch.option
            ? { ...f.questions[g].options, [patch.option[0]]: patch.option[1] }
            : f.questions[g].options,
        },
      },
    }));
  }

  function setRule(i: number, patch: Partial<MatcherRule>) {
    setForm((f) => ({ ...f, rules: f.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  }
  function moveRule(i: number, dir: -1 | 1) {
    setForm((f) => {
      const rules = [...f.rules];
      const j = i + dir;
      if (j < 0 || j >= rules.length) return f;
      [rules[i], rules[j]] = [rules[j]!, rules[i]!];
      return { ...f, rules };
    });
  }

  const productSelect = (value: string, onChange: (v: string) => void) => (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger className="h-9 min-w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— choose a product —</SelectItem>
        {items.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Content"
        title="Find Your Object"
        description='The "What are you moving toward?" guided match on the homepage: edit its text, the three questions, and which product gets recommended for which answers.'
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      <Section title="Section text" hint="The heading area above the quiz.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Small heading</Label>
            <Input value={form.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Tag line</Label>
            <Input value={form.label} onChange={(e) => set("label", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Big heading — line 1</Label>
            <Input value={form.heading_1} onChange={(e) => set("heading_1", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Big heading — line 2</Label>
            <Input value={form.heading_2} onChange={(e) => set("heading_2", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Highlighted word</Label>
            <Input
              value={form.heading_accent}
              onChange={(e) => set("heading_accent", e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Questions"
        hint="Edit the wording of each question and its three answers. The answers themselves stay in the same order."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {GROUPS.map((g, i) => (
            <div key={g} className="space-y-3 rounded-md border border-border p-4">
              <p className="text-xs text-muted-foreground">Question {i + 1}</p>
              <Input
                value={form.questions[g].title}
                onChange={(e) => setQuestion(g, { title: e.target.value })}
              />
              {MATCHER_OPTION_KEYS[g].map((key) => (
                <Input
                  key={key}
                  value={form.questions[g].options[key] ?? ""}
                  onChange={(e) => setQuestion(g, { option: [key, e.target.value] })}
                />
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Recommendations"
        hint="Rules are checked from the top; the first one that matches the customer's answers decides the product. “Any” matches every answer. If nothing matches, the default product is shown."
      >
        <div className="space-y-3">
          {form.rules.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No rules yet — add one, or just set a default product below.
            </p>
          )}
          {form.rules.map((r, i) => (
            <div
              key={i}
              className="space-y-3 rounded-md border border-border p-4"
            >
              <div className="flex flex-wrap items-end gap-3">
                {GROUPS.map((g) => (
                  <div key={g} className="space-y-1">
                    <Label className="text-xs">{form.questions[g].title}</Label>
                    <Select
                      value={r[g] || ANY}
                      onValueChange={(v) => setRule(i, { [g]: v === ANY ? "" : v })}
                    >
                      <SelectTrigger className="h-9 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ANY}>Any</SelectItem>
                        {MATCHER_OPTION_KEYS[g].map((key) => (
                          <SelectItem key={key} value={key}>
                            {form.questions[g].options[key]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <div className="space-y-1">
                  <Label className="text-xs">Recommend</Label>
                  {productSelect(r.product_id, (v) => setRule(i, { product_id: v }))}
                </div>
                <div className="ml-auto flex gap-1">
                  <Button type="button" size="icon" variant="ghost" onClick={() => moveRule(i, -1)} aria-label="Move up">
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => moveRule(i, 1)} aria-label="Move down">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setForm((f) => ({ ...f, rules: f.rules.filter((_, j) => j !== i) }))}
                    aria-label="Remove rule"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Input
                placeholder="Sentence shown under the recommendation (optional) — e.g. Built for fast city breaks."
                value={r.reason}
                onChange={(e) => setRule(i, { reason: e.target.value })}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setForm((f) => ({
                ...f,
                rules: [...f.rules, { duration: "", mode: "", mood: "", product_id: "", reason: "" }],
              }))
            }
          >
            Add rule
          </Button>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <Label>Default product (when no rule matches)</Label>
          {productSelect(form.default_product_id, (v) => set("default_product_id", v))}
        </div>
      </Section>
    </div>
  );
}

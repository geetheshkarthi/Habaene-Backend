import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { getHomepage, updateHomepage } from "@/lib/api/cms";
import { getProducts } from "@/lib/api/products";
import {
  newId,
  normalizeMatcher,
  type MatcherConfig,
  type MatcherQuestion,
  type MatcherRule,
} from "@/lib/api/matcher";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
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

export const Route = createFileRoute("/_authenticated/admin/cms/find-your-object")({
  head: () => ({ meta: [{ title: "Find Your Object — HABÄNE Admin" }] }),
  component: FindYourObjectEditor,
});

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
    mutationFn: () => {
      if (form.questions.some((q) => !q.title.trim() || q.options.length < 2 || q.options.some((o) => !o.label.trim()))) {
        throw new Error("Each question needs a title and at least two answers, all filled in.");
      }
      // Drop conditions that point at deleted questions / answers.
      const rules = form.rules.map((r) => ({
        ...r,
        conditions: Object.fromEntries(
          Object.entries(r.conditions).filter(([qid, val]) =>
            form.questions.some((q) => q.id === qid && q.options.some((o) => o.value === val)),
          ),
        ),
      }));
      return updateHomepage({ matcher: { ...form, rules } } as never);
    },
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

  function setQuestion(i: number, patch: Partial<MatcherQuestion>) {
    setForm((f) => ({ ...f, questions: f.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));
  }
  function moveQuestion(i: number, dir: -1 | 1) {
    setForm((f) => {
      const qs = [...f.questions];
      const j = i + dir;
      if (j < 0 || j >= qs.length) return f;
      [qs[i], qs[j]] = [qs[j]!, qs[i]!];
      return { ...f, questions: qs };
    });
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
        description='The "What are you moving toward?" guided match on the homepage: edit its questions and answers, and choose which product gets recommended for which answers.'
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      <Section
        title="Questions"
        hint="Add as many questions as you like, each with its own answers. Rename, reorder or remove any of them."
      >
        <div className="space-y-4">
          {form.questions.map((q, i) => (
            <div key={q.id} className="space-y-3 rounded-md border border-border p-4">
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">Question {i + 1}</span>
                <Input
                  placeholder="e.g. Where are you headed?"
                  value={q.title}
                  onChange={(e) => setQuestion(i, { title: e.target.value })}
                />
                <Button type="button" size="icon" variant="ghost" onClick={() => moveQuestion(i, -1)} aria-label="Move up">
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" onClick={() => moveQuestion(i, 1)} aria-label="Move down">
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={form.questions.length <= 1}
                  onClick={() =>
                    setForm((f) => ({ ...f, questions: f.questions.filter((_, j) => j !== i) }))
                  }
                >
                  Delete question
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {q.options.map((o, k) => (
                  <div key={o.value} className="flex items-center gap-1">
                    <Input
                      placeholder="Answer"
                      value={o.label}
                      onChange={(e) =>
                        setQuestion(i, {
                          options: q.options.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)),
                        })
                      }
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={q.options.length <= 2}
                      onClick={() => setQuestion(i, { options: q.options.filter((_, j) => j !== k) })}
                      aria-label="Remove answer"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setQuestion(i, { options: [...q.options, { value: newId("opt"), label: "" }] })
                }
              >
                Add answer
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setForm((f) => ({
                ...f,
                questions: [
                  ...f.questions,
                  {
                    id: newId("q"),
                    title: "",
                    options: [
                      { value: newId("opt"), label: "" },
                      { value: newId("opt"), label: "" },
                    ],
                  },
                ],
              }))
            }
          >
            Add question
          </Button>
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
            <div key={i} className="space-y-3 rounded-md border border-border p-4">
              <div className="flex flex-wrap items-end gap-3">
                {form.questions.map((q) => (
                  <div key={q.id} className="space-y-1">
                    <Label className="text-xs">{q.title || "Untitled question"}</Label>
                    <Select
                      value={r.conditions[q.id] || ANY}
                      onValueChange={(v) =>
                        setRule(i, { conditions: { ...r.conditions, [q.id]: v === ANY ? "" : v } })
                      }
                    >
                      <SelectTrigger className="h-9 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ANY}>Any</SelectItem>
                        {q.options.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label || "Untitled answer"}
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
                rules: [...f.rules, { conditions: {}, product_id: "", reason: "" }],
              }))
            }
          >
            Add rule
          </Button>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <Label>Default product (when no rule matches)</Label>
          {productSelect(form.default_product_id, (v) => setForm((f) => ({ ...f, default_product_id: v })))}
        </div>
      </Section>
    </div>
  );
}

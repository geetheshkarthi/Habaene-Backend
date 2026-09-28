import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getEmailTemplates,
  updateEmailTemplate,
  interpolateTemplate,
  type EmailTemplate,
} from "@/lib/api/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/email-templates")({
  head: () => ({ meta: [{ title: "Email Templates — HABÄNE Admin" }] }),
  component: EmailTemplatesPage,
});

/** Sample values so the preview renders something readable. */
const PREVIEW_VARS: Record<string, string | number> = {
  customer_name: "Anna Schmidt",
  order_number: "HB-2026-000123",
  order_total: "€349,00",
  tracking_number: "00340434123456789012",
  carrier: "DHL",
  refund_amount: "€89,00",
  store_name: "HABÄNE",
};

function EmailTemplatesPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: "", body_html: "", body_text: "", is_active: true });

  const { data, isLoading, error } = useQuery({
    queryKey: ["email-templates"],
    queryFn: getEmailTemplates,
  });

  const templates = data ?? [];
  const selected: EmailTemplate | undefined =
    templates.find((t) => t.id === selectedId) ?? templates[0];

  useEffect(() => {
    if (selected) {
      setForm({
        subject: selected.subject,
        body_html: selected.body_html,
        body_text: selected.body_text ?? "",
        is_active: selected.is_active,
      });
    }
    // Only reset the form when a different template is selected; depending on
    // `selected` itself would clobber in-progress edits on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const save = useMutation({
    mutationFn: () =>
      updateEmailTemplate(selected!.id, {
        subject: form.subject,
        body_html: form.body_html,
        body_text: form.body_text || null,
        is_active: form.is_active,
      }),
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;
  if (isLoading) return <LoadingState />;

  if (templates.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Administration" title="Email Templates" />
        <EmptyState
          title="No templates"
          description="Seed the email_templates table to manage transactional emails here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Email Templates"
        description="Subject and body for every automated customer email."
        actions={
          <Button size="sm" onClick={() => save.mutate()} disabled={!selected || save.isPending}>
            Save changes
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="space-y-1">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                selected?.id === t.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              <span className="truncate">{t.name}</span>
              {!t.is_active && <span className="ml-2 text-xs opacity-70">off</span>}
            </button>
          ))}
        </nav>

        {selected && (
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{selected.name}</p>
                    <p className="text-xs text-muted-foreground">{selected.slug}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                    />
                    Active
                  </label>
                </div>

                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>HTML body</Label>
                  <Textarea
                    rows={14}
                    className="font-mono text-xs"
                    value={form.body_html}
                    onChange={(e) => setForm((f) => ({ ...f, body_html: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Plain-text fallback</Label>
                  <Textarea
                    rows={6}
                    className="font-mono text-xs"
                    value={form.body_text}
                    onChange={(e) => setForm((f) => ({ ...f, body_text: e.target.value }))}
                  />
                </div>

                {Array.isArray(selected.variables) && selected.variables.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Available variables:{" "}
                    {(selected.variables as string[]).map((v) => `{{${v}}}`).join(", ")}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="mb-3 text-sm font-semibold">Preview</h2>
              <p className="mb-3 text-sm">
                <span className="text-muted-foreground">Subject: </span>
                {interpolateTemplate(form.subject, PREVIEW_VARS)}
              </p>
              <div
                className="prose prose-sm max-w-none rounded border border-border bg-background p-4 dark:prose-invert"
                dangerouslySetInnerHTML={{
                  __html: interpolateTemplate(form.body_html, PREVIEW_VARS),
                }}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Preview uses sample values and is rendered from the template you are editing.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

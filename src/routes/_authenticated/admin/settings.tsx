import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStoreSettings, updateStoreSettings } from "@/lib/api/settings";
import type { Address } from "@/lib/api/types";
import { num } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — HABÄNE Admin" },
      {
        name: "description",
        content: "Legal identity, VAT rate, shipping costs and withdrawal window.",
      },
      { property: "og:title", content: "Settings — HABÄNE Admin" },
      {
        property: "og:description",
        content: "Legal identity, VAT rate, shipping costs and withdrawal window.",
      },
    ],
  }),
  component: SettingsPage,
});

function addressToText(value: unknown): string {
  const a = (value ?? {}) as Address;
  return [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(" "), a.country]
    .filter(Boolean)
    .join("\n");
}

function textToAddress(text: string): Record<string, string> {
  const [line1 = "", line2 = "", postal = "", country = ""] = text.split("\n");
  const [postal_code = "", ...cityParts] = postal.trim().split(" ");
  return { line1, line2, postal_code, city: cityParts.join(" "), country };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <span className="eyebrow text-muted-foreground">{title}</span>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["store-settings"], queryFn: getStoreSettings });
  const [form, setForm] = useState<Record<string, string | number>>({});

  useEffect(() => {
    const s = settings.data;
    if (!s) return;
    setForm({
      legal_company_name: s.legal_company_name,
      vat_id: s.vat_id,
      commercial_register_number: s.commercial_register_number,
      support_email: s.support_email,
      support_phone: s.support_phone,
      invoice_prefix: s.invoice_prefix,
      default_vat_rate: num(s.default_vat_rate) * 100,
      shipping_cost: num(s.shipping_cost),
      free_shipping_threshold: num(s.free_shipping_threshold),
      withdrawal_window_days: s.withdrawal_window_days,
      business_address: addressToText(s.business_address),
      returns_address: addressToText(s.returns_address),
    });
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      updateStoreSettings(settings.data!.id, {
        legal_company_name: String(form["legal_company_name"] ?? ""),
        vat_id: String(form["vat_id"] ?? ""),
        commercial_register_number: String(form["commercial_register_number"] ?? ""),
        support_email: String(form["support_email"] ?? ""),
        support_phone: String(form["support_phone"] ?? ""),
        invoice_prefix: String(form["invoice_prefix"] ?? ""),
        default_vat_rate: num(form["default_vat_rate"]) / 100,
        shipping_cost: num(form["shipping_cost"]),
        free_shipping_threshold: num(form["free_shipping_threshold"]),
        withdrawal_window_days: Math.trunc(num(form["withdrawal_window_days"])),
        business_address: textToAddress(String(form["business_address"] ?? "")),
        returns_address: textToAddress(String(form["returns_address"] ?? "")),
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["store-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (settings.isLoading) return <LoadingState />;
  if (settings.error)
    return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;

  const field = (key: string, label: string, type = "text") => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        step={type === "number" ? "0.01" : undefined}
        value={form[key] ?? ""}
        onChange={(e) =>
          setForm((f) => ({
            ...f,
            [key]: type === "number" ? Number(e.target.value) : e.target.value,
          }))
        }
      />
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Configuration"
        title="Store settings"
        description="These values feed the storefront's legal notice, invoices and checkout maths. Placeholders can be replaced once the company data is final."
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      <Section title="Legal identity">
        {field("legal_company_name", "Legal company name")}
        {field("vat_id", "VAT ID (USt-IdNr.)")}
        {field("commercial_register_number", "Commercial register number")}
        {field("invoice_prefix", "Invoice number prefix")}
        <div className="space-y-2">
          <Label>Business address</Label>
          <Textarea
            rows={4}
            placeholder={"Street 1\nAddition\n10115 Berlin\nGermany"}
            value={String(form["business_address"] ?? "")}
            onChange={(e) => setForm((f) => ({ ...f, business_address: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Returns address</Label>
          <Textarea
            rows={4}
            value={String(form["returns_address"] ?? "")}
            onChange={(e) => setForm((f) => ({ ...f, returns_address: e.target.value }))}
          />
        </div>
      </Section>

      <Section title="Contact">
        {field("support_email", "Support email", "email")}
        {field("support_phone", "Support phone")}
      </Section>

      <Section title="Commerce">
        {field("default_vat_rate", "Default VAT rate (%)", "number")}
        {field("shipping_cost", "Shipping cost (€)", "number")}
        {field("free_shipping_threshold", "Free shipping from (€)", "number")}
        {field("withdrawal_window_days", "Withdrawal window (days)", "number")}
      </Section>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getCampaigns,
  getCampaignStats,
  createCampaign,
  updateCampaign,
  type Campaign,
  type CampaignStats,
} from "@/lib/api/marketing";
import { money, dateShort, toCsv, downloadFile } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { StatCard, DateRangePicker } from "@/components/admin/AnalyticsKit";
import { useDateRange } from "@/lib/analytics-ui";
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

export const Route = createFileRoute("/_authenticated/admin/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — HABÄNE Admin" }] }),
  component: CampaignsPage,
});

type FormState = {
  name: string;
  description: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  budget: string;
  start_at: string;
  end_at: string;
};

const EMPTY: FormState = {
  name: "",
  description: "",
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  utm_content: "",
  budget: "",
  start_at: "",
  end_at: "",
};

function toIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

function CampaignsPage() {
  const qc = useQueryClient();
  const { range, pickerProps } = useDateRange();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: getCampaigns });
  const campaignIds = (campaigns.data ?? []).map((c) => c.id);
  // getCampaignStats resolves one campaign at a time, so fan out across the list.
  const stats = useQuery({
    queryKey: ["campaign-stats", range, campaignIds],
    enabled: campaignIds.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        campaignIds.map((id) => getCampaignStats(id, range.start, range.end)),
      );
      return results.filter((r): r is CampaignStats => r !== null);
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["campaigns"] });
    qc.invalidateQueries({ queryKey: ["campaign-stats"] });
  };

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<Campaign> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        utm_source: form.utm_source.trim() || null,
        utm_medium: form.utm_medium.trim() || null,
        utm_campaign: form.utm_campaign.trim() || null,
        utm_content: form.utm_content.trim() || null,
        budget: form.budget === "" ? null : Number(form.budget),
        start_at: toIso(form.start_at),
        end_at: toIso(form.end_at),
      };
      return editing ? updateCampaign(editing.id, payload) : createCampaign(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Campaign updated" : "Campaign created");
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (c: Campaign) => updateCampaign(c.id, { is_active: !c.is_active }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const error = campaigns.error ?? stats.error;
  if (error) return <ErrorState error={error} />;

  const rows = campaigns.data ?? [];
  const statRows = stats.data ?? [];
  const statsById = new Map(statRows.map((s) => [s.campaign.id, s]));

  const totalRevenue = statRows.reduce((a, s) => a + s.revenue, 0);
  const totalOrders = statRows.reduce((a, s) => a + s.orders, 0);
  const totalCustomers = statRows.reduce((a, s) => a + s.customers, 0);
  const totalBudget = rows.reduce((a, c) => a + (c.budget ?? 0), 0);
  const roas = totalBudget > 0 ? Math.round((totalRevenue / totalBudget) * 100) / 100 : null;

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(c: Campaign) {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description ?? "",
      utm_source: c.utm_source ?? "",
      utm_medium: c.utm_medium ?? "",
      utm_campaign: c.utm_campaign ?? "",
      utm_content: c.utm_content ?? "",
      budget: c.budget == null ? "" : String(c.budget),
      start_at: c.start_at ? c.start_at.slice(0, 16) : "",
      end_at: c.end_at ? c.end_at.slice(0, 16) : "",
    });
    setOpen(true);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Marketing"
        title="Campaigns"
        description="UTM-tagged campaigns and the revenue attributed to them."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!statRows.length}
              onClick={() =>
                downloadFile(
                  "campaigns.csv",
                  toCsv(
                    statRows.map((s) => ({
                      campaign: s.campaign.name,
                      utm_source: s.campaign.utm_source ?? "",
                      utm_medium: s.campaign.utm_medium ?? "",
                      utm_campaign: s.campaign.utm_campaign ?? "",
                      revenue: s.revenue,
                      orders: s.orders,
                      customers: s.customers,
                    })),
                  ),
                )
              }
            >
              Export CSV
            </Button>
            <Button size="sm" onClick={openNew}>
              New campaign
            </Button>
          </div>
        }
      />

      <DateRangePicker {...pickerProps} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Attributed Revenue" value={money(totalRevenue)} />
        <StatCard label="Attributed Orders" value={totalOrders} />
        <StatCard label="Customers Acquired" value={totalCustomers} />
        <StatCard
          label="Return on Spend"
          value={roas === null ? "—" : `${roas}x`}
          sub={money(totalBudget) + " budget"}
        />
      </div>

      {campaigns.isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No campaigns"
          description="Add a campaign with UTM parameters to attribute traffic and revenue."
          action={
            <Button size="sm" onClick={openNew}>
              New campaign
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">Campaign</th>
                <th className="p-3">UTM</th>
                <th className="p-3">Runs</th>
                <th className="p-3 text-right">Revenue</th>
                <th className="p-3 text-right">Orders</th>
                <th className="p-3 text-right">Customers</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const s = statsById.get(c.id);
                return (
                  <tr key={c.id} className="border-b border-border/50">
                    <td className="p-3">
                      <span className="block">{c.name}</span>
                      <span
                        className={`text-xs ${c.is_active ? "text-green-600" : "text-muted-foreground"}`}
                      >
                        {c.is_active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {[c.utm_source, c.utm_medium, c.utm_campaign].filter(Boolean).join(" / ") ||
                        "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {c.start_at ? dateShort(c.start_at) : "—"} →{" "}
                      {c.end_at ? dateShort(c.end_at) : "—"}
                    </td>
                    <td className="p-3 text-right">{money(s?.revenue ?? 0)}</td>
                    <td className="p-3 text-right">{s?.orders ?? 0}</td>
                    <td className="p-3 text-right">{s?.customers ?? 0}</td>
                    <td className="space-x-1 whitespace-nowrap p-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggle.mutate(c)}>
                        {c.is_active ? "Pause" : "Activate"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit campaign" : "New campaign"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>utm_source</Label>
                <Input
                  value={form.utm_source}
                  placeholder="instagram"
                  onChange={(e) => setForm((f) => ({ ...f, utm_source: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>utm_medium</Label>
                <Input
                  value={form.utm_medium}
                  placeholder="paid_social"
                  onChange={(e) => setForm((f) => ({ ...f, utm_medium: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>utm_campaign</Label>
                <Input
                  value={form.utm_campaign}
                  placeholder="spring_launch"
                  onChange={(e) => setForm((f) => ({ ...f, utm_campaign: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>utm_content</Label>
                <Input
                  value={form.utm_content}
                  onChange={(e) => setForm((f) => ({ ...f, utm_content: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Budget (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.budget}
                  onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                />
              </div>
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

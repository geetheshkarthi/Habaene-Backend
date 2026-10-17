import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createAnnouncementBar,
  deleteAnnouncementBar,
  getAnnouncementBars,
  updateAnnouncementBar,
  type AnnouncementBar,
} from "@/lib/api/cms";
import { getDiscountCodes } from "@/lib/api/discounts";
import type { DiscountCode } from "@/lib/api/types";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Draft = {
  id: string | null;
  message: string;
  link_text: string;
  link_url: string;
  start_at: string; // datetime-local value, "" = no start
  end_at: string; // datetime-local value, "" = no end
  is_active: boolean;
};

const fromRow = (a: AnnouncementBar): Draft => ({
  id: a.id,
  message: a.message,
  link_text: a.link_text ?? "",
  link_url: a.link_url ?? "",
  start_at: a.start_at ? toLocalInput(a.start_at) : "",
  end_at: a.end_at ? toLocalInput(a.end_at) : "",
  is_active: a.is_active,
});

/** ISO timestamp -> value for <input type="datetime-local"> in the viewer's timezone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "10% OFF — CODE WELCOME10", optionally followed by the coupon's description. */
function couponMessage(c: DiscountCode): string {
  const off = c.type === "percent" ? `${Number(c.value)}% OFF` : `${money(Number(c.value))} OFF`;
  const desc = c.description?.trim();
  return `${off}${desc ? ` ${desc.toUpperCase()}` : ""} — CODE ${c.code}`;
}

/**
 * The rotating promo bar at the top of the storefront. Each message is saved on
 * its own; coupons can be promoted with one click.
 */
export function AnnouncementBarSection() {
  const qc = useQueryClient();
  const bars = useQuery({
    queryKey: ["cms", "announcements"],
    queryFn: () => getAnnouncementBars(),
  });
  const coupons = useQuery({ queryKey: ["discounts", "for-announcements"], queryFn: () => getDiscountCodes() });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [added, setAdded] = useState<Draft[]>([]);
  const [couponId, setCouponId] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["cms", "announcements"] });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const message = d.message.trim();
      if (!message) throw new Error("Write the message first.");
      const payload = {
        message,
        link_text: d.link_text.trim() || null,
        link_url: d.link_url.trim() || null,
        start_at: d.start_at ? new Date(d.start_at).toISOString() : null,
        end_at: d.end_at ? new Date(d.end_at).toISOString() : null,
        is_active: d.is_active,
      };
      if (d.id) return updateAnnouncementBar(d.id, payload);
      const position = (bars.data ?? []).reduce((m, b) => Math.max(m, b.position), -1) + 1;
      return createAnnouncementBar({ ...payload, position });
    },
    onSuccess: (_, d) => {
      toast.success("Announcement saved");
      const id = d.id;
      if (id) {
        setDrafts((m) => {
          const rest = { ...m };
          delete rest[id];
          return rest;
        });
      } else {
        setAdded((a) => a.filter((x) => x !== d));
      }
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAnnouncementBar(id),
    onSuccess: () => {
      toast.success("Announcement deleted");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows: Draft[] = [
    ...(bars.data ?? []).map((a) => drafts[a.id] ?? fromRow(a)),
    ...added,
  ];

  function patch(d: Draft, change: Partial<Draft>) {
    const next = { ...d, ...change };
    if (d.id) setDrafts((m) => ({ ...m, [d.id!]: next }));
    else setAdded((a) => a.map((x) => (x === d ? next : x)));
  }

  const activeCoupons = (coupons.data ?? []).filter((c) => c.is_active);

  function promoteCoupon() {
    const c = activeCoupons.find((x) => x.id === couponId);
    if (!c) return;
    setAdded((a) => [
      ...a,
      {
        id: null,
        message: couponMessage(c),
        link_text: "",
        link_url: "",
        start_at: "",
        end_at: c.expires_at ? toLocalInput(c.expires_at) : "",
        is_active: true,
      },
    ]);
    setCouponId("");
  }

  return (
    <div className="space-y-4">
      {bars.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No messages yet — the bar is hidden on the storefront. Add one below.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((d, i) => {
            const original = d.id ? bars.data?.find((b) => b.id === d.id) : null;
            const dirty = !d.id || (original && JSON.stringify(fromRow(original)) !== JSON.stringify(d));
            return (
              <li key={d.id ?? `new-${i}`} className="space-y-3 rounded-lg border border-border p-4">
                <div className="space-y-2">
                  <Label>Message</Label>
                  <Input
                    placeholder="e.g. 10% OFF YOUR FIRST ORDER — CODE WELCOME10"
                    value={d.message}
                    onChange={(e) => patch(d, { message: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Link text (optional)</Label>
                    <Input
                      placeholder="Shop now"
                      value={d.link_text}
                      onChange={(e) => patch(d, { link_text: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Link address (optional)</Label>
                    <Input
                      placeholder="/shop.html"
                      value={d.link_url}
                      onChange={(e) => patch(d, { link_url: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Show from (optional)</Label>
                    <Input
                      type="datetime-local"
                      value={d.start_at}
                      onChange={(e) => patch(d, { start_at: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Show until (optional)</Label>
                    <Input
                      type="datetime-local"
                      value={d.end_at}
                      onChange={(e) => patch(d, { end_at: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={d.is_active} onCheckedChange={(v) => patch(d, { is_active: v })} />
                    Show on the website
                  </label>
                  <div className="flex gap-2">
                    {d.id ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(d.id!)}
                      >
                        Delete
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setAdded((a) => a.filter((x) => x !== d))}
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      disabled={!dirty || save.isPending}
                      onClick={() => save.mutate(d)}
                    >
                      {save.isPending ? "Saving…" : d.id ? "Save changes" : "Add message"}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setAdded((a) => [
              ...a,
              {
                id: null,
                message: "",
                link_text: "",
                link_url: "",
                start_at: "",
                end_at: "",
                is_active: true,
              },
            ])
          }
        >
          Add message
        </Button>
        <span className="text-xs text-muted-foreground">or promote a coupon:</span>
        <Select value={couponId} onValueChange={setCouponId}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue placeholder={activeCoupons.length ? "Choose a coupon…" : "No active coupons"} />
          </SelectTrigger>
          <SelectContent>
            {activeCoupons.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code} — {c.type === "percent" ? `${Number(c.value)}%` : money(Number(c.value))} off
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" disabled={!couponId} onClick={promoteCoupon}>
          Use coupon
        </Button>
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  confirmed: "bg-accent/20 text-accent-foreground",
  processing: "bg-accent/30 text-accent-foreground",
  shipped: "bg-chart-2/15 text-foreground",
  delivered: "bg-success/15 text-success",
  cancelled: "bg-destructive/10 text-destructive",
  returned: "bg-warning/20 text-warning-foreground",
  paid: "bg-success/15 text-success",
  failed: "bg-destructive/10 text-destructive",
  refunded: "bg-warning/20 text-warning-foreground",
  submitted: "bg-muted text-muted-foreground",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/10 text-destructive",
  items_received: "bg-chart-2/15 text-foreground",
  active: "bg-success/15 text-success",
  inactive: "bg-muted text-muted-foreground",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase",
        TONES[value] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

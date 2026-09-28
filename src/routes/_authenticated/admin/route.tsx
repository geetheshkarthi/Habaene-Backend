import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  Undo2,
  Mail,
  Ticket,
  Settings,
  LogOut,
  BarChart3,
  Warehouse,
  Megaphone,
  FileText,
  Search,
  Shield,
  MessageSquare,
  Tag,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { useIsAdmin, signOut } from "@/hooks/useAdmin";
import { LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";

type NavGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: { to: string; label: string }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Analytics",
    icon: BarChart3,
    items: [
      { to: "/admin/analytics", label: "Overview" },
      { to: "/admin/analytics/sales", label: "Sales" },
      { to: "/admin/analytics/products", label: "Products" },
      { to: "/admin/analytics/customers", label: "Customers" },
      { to: "/admin/analytics/financial", label: "Financial" },
      { to: "/admin/analytics/geographic", label: "Geographic" },
      { to: "/admin/analytics/day-of-week", label: "Day of Week" },
      { to: "/admin/analytics/reports", label: "Custom Reports" },
    ],
  },
  {
    label: "Products & Inventory",
    icon: Package,
    items: [
      { to: "/admin/products", label: "Products" },
      { to: "/admin/inventory", label: "Inventory" },
      { to: "/admin/warehouses", label: "Warehouses" },
      { to: "/admin/purchase-orders", label: "Purchase Orders" },
      { to: "/admin/product-drops", label: "Product Drops" },
    ],
  },
  {
    label: "Orders & Operations",
    icon: ShoppingBag,
    items: [
      { to: "/admin/orders", label: "Orders" },
      { to: "/admin/returns", label: "Returns" },
      { to: "/admin/refunds", label: "Refunds" },
    ],
  },
  {
    label: "Customers",
    icon: Users,
    items: [
      { to: "/admin/customers", label: "All Customers" },
      { to: "/admin/wishlists", label: "Wishlists" },
      { to: "/admin/abandoned-carts", label: "Abandoned Carts" },
      { to: "/admin/reviews", label: "Reviews" },
    ],
  },
  {
    label: "Marketing",
    icon: Megaphone,
    items: [
      { to: "/admin/discounts", label: "Coupons" },
      { to: "/admin/promotions", label: "Promotions" },
      { to: "/admin/campaigns", label: "Campaigns" },
      { to: "/admin/newsletter", label: "Subscribers" },
      { to: "/admin/early-access", label: "Early Access" },
      { to: "/admin/back-in-stock", label: "Back in Stock" },
    ],
  },
  {
    label: "Content",
    icon: FileText,
    items: [
      { to: "/admin/cms/homepage", label: "Homepage" },
      { to: "/admin/cms/pages", label: "Pages" },
      { to: "/admin/cms/navigation", label: "Navigation" },
      { to: "/admin/cms/announcements", label: "Announcements" },
      { to: "/admin/cms/journal", label: "Journal" },
      { to: "/admin/cms/faq", label: "FAQ" },
      { to: "/admin/cms/media", label: "Media Library" },
    ],
  },
  {
    label: "SEO",
    icon: Search,
    items: [
      { to: "/admin/seo", label: "SEO Dashboard" },
      { to: "/admin/seo/redirects", label: "Redirects" },
      { to: "/admin/seo/search-analytics", label: "Search Analytics" },
    ],
  },
  {
    label: "Administration",
    icon: Shield,
    items: [
      { to: "/admin/team", label: "Team" },
      { to: "/admin/audit-log", label: "Audit Log" },
      { to: "/admin/email-templates", label: "Email Templates" },
      { to: "/admin/notifications", label: "Notifications" },
      { to: "/admin/webhooks", label: "Webhooks" },
      { to: "/admin/settings", label: "Settings" },
    ],
  },
  {
    label: "Inbox",
    icon: MessageSquare,
    items: [{ to: "/admin/messages", label: "Contact Messages" }],
  },
];

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function NavGroupItem({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(true);
  const Icon = group.icon;
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <span className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" />
          {group.label}
        </span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
          {group.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminLayout() {
  const { user, isAdmin, loading } = useIsAdmin();
  const navigate = useNavigate();

  if (loading) return <LoadingState label="Checking access…" />;

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="eyebrow text-muted-foreground">Access denied</span>
        <h1 className="text-3xl">This account is not an administrator</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {user?.email} has no admin role assigned. Ask an existing administrator to grant access.
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            await signOut();
            navigate({ to: "/auth" });
          }}
        >
          Sign out
        </Button>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="px-4 py-5 border-b border-sidebar-border">
          <Link to="/admin" className="text-lg tracking-tight text-sidebar-foreground">
            HABÄNE
            <span className="mt-0.5 block text-[10px] tracking-[0.2em] text-sidebar-foreground/50 uppercase">
              Admin console
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          <Link
            to="/admin"
            activeOptions={{ exact: true }}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground mb-2"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          {NAV_GROUPS.map((group) => (
            <NavGroupItem key={group.label} group={group} />
          ))}
        </nav>

        <div className="border-t border-sidebar-border px-4 py-4">
          <p className="truncate px-1 text-xs text-sidebar-foreground/60">{user?.email}</p>
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
            className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-sidebar px-4 py-2 md:hidden">
          <Link
            to="/admin"
            className="rounded-md px-3 py-1.5 text-xs whitespace-nowrap text-sidebar-foreground/70 data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
          >
            Dashboard
          </Link>
          <Link
            to="/admin/orders"
            className="rounded-md px-3 py-1.5 text-xs whitespace-nowrap text-sidebar-foreground/70 data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
          >
            Orders
          </Link>
          <Link
            to="/admin/products"
            className="rounded-md px-3 py-1.5 text-xs whitespace-nowrap text-sidebar-foreground/70 data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
          >
            Products
          </Link>
          <Link
            to="/admin/customers"
            className="rounded-md px-3 py-1.5 text-xs whitespace-nowrap text-sidebar-foreground/70 data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
          >
            Customers
          </Link>
          <Link
            to="/admin/settings"
            className="rounded-md px-3 py-1.5 text-xs whitespace-nowrap text-sidebar-foreground/70 data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
          >
            Settings
          </Link>
        </nav>
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

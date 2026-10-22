import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  Undo2,
  Mail,
  Ticket,
  LogOut,
  BarChart3,
  Warehouse,
  Megaphone,
  FileText,
  Search,
  MessageSquare,
  Tag,
  ChevronDown,
  Shield,
  Eye,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useIsAdmin, usePermissions, signOut } from "@/hooks/useAdmin";
import { emailToLoginId } from "@/lib/permissions";
import { LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";

/**
 * perm: a permission key from lib/permissions.ts, or
 *   "self"  — everyone who can open the dashboard
 *   "super" — main administrators only
 */
type NavItem = { to: string; label: string; perm?: string };
type NavGroup = {
  label: string;
  perm: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

const GROUP_PERMS: Record<string, string> = {
  Analytics: "analytics",
  "Products & Inventory": "catalogue",
  "Orders & Operations": "orders",
  Customers: "customers",
  Marketing: "marketing",
  Content: "content",
  "Visitor Insights": "insights",
  SEO: "seo",
  Administration: "self",
  Inbox: "inbox",
};

function itemAllowed(permissions: string[] | undefined, perm: string): boolean {
  if (!permissions) return false;
  if (perm === "self") return true;
  if (permissions.includes("*")) return true;
  if (perm === "super") return false;
  return permissions.includes(perm);
}

/** Which permission a dashboard URL needs. Unknown URLs are main-administrator only. */
function requiredPermFor(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin") return "dashboard";
  let best: { len: number; perm: string } | null = null;
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if ((path === it.to || path.startsWith(it.to + "/")) && (!best || it.to.length > best.len)) {
        best = { len: it.to.length, perm: it.perm ?? g.perm };
      }
    }
  }
  return best?.perm ?? "super";
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Analytics",
    perm: GROUP_PERMS["Analytics"]!,
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
    perm: GROUP_PERMS["Products & Inventory"]!,
    icon: Package,
    items: [
      { to: "/admin/products", label: "Products" },
      { to: "/admin/inventory", label: "Inventory" },
    ],
  },
  {
    label: "Orders & Operations",
    perm: GROUP_PERMS["Orders & Operations"]!,
    icon: ShoppingBag,
    items: [
      { to: "/admin/orders", label: "Orders" },
      { to: "/admin/returns", label: "Returns" },
      { to: "/admin/refunds", label: "Refunds" },
    ],
  },
  {
    label: "Customers",
    perm: GROUP_PERMS["Customers"]!,
    icon: Users,
    items: [
      { to: "/admin/customers", label: "All Customers" },
      { to: "/admin/reviews", label: "Reviews" },
    ],
  },
  {
    label: "Marketing",
    perm: GROUP_PERMS["Marketing"]!,
    icon: Megaphone,
    items: [
      { to: "/admin/discounts", label: "Coupons" },
      { to: "/admin/newsletter", label: "Subscribers" },
    ],
  },
  {
    label: "Content",
    perm: GROUP_PERMS["Content"]!,
    icon: FileText,
    items: [
      { to: "/admin/cms/homepage", label: "Homepage" },
      { to: "/admin/cms/announcements", label: "Announcement" },
      { to: "/admin/cms/find-your-object", label: "Find Your Object" },
      { to: "/admin/cms/journal", label: "Journal" },
      { to: "/admin/cms/faq", label: "FAQ" },
    ],
  },
  {
    label: "Visitor Insights",
    perm: GROUP_PERMS["Visitor Insights"]!,
    icon: Eye,
    items: [
      { to: "/admin/insights/products", label: "Product Interest" },
      { to: "/admin/insights/pages", label: "Pages & Time" },
      { to: "/admin/insights/visitors", label: "Visitors" },
    ],
  },
  {
    label: "SEO",
    perm: GROUP_PERMS["SEO"]!,
    icon: Search,
    items: [
      { to: "/admin/seo", label: "SEO Dashboard" },
      { to: "/admin/seo/redirects", label: "Redirects" },
      { to: "/admin/seo/search-analytics", label: "Search Analytics" },
    ],
  },
  {
    label: "Administration",
    perm: GROUP_PERMS["Administration"]!,
    icon: Shield,
    items: [
      { to: "/admin/team", label: "Admin Roles", perm: "super" },
      { to: "/admin/change-password", label: "Passwords" },
    ],
  },
  {
    label: "Inbox",
    perm: GROUP_PERMS["Inbox"]!,
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
  const permsQuery = usePermissions(isAdmin);
  const perms = permsQuery.data;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (st) => st.location.pathname });

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => itemAllowed(perms, it.perm ?? g.perm)),
  })).filter((g) => g.items.length > 0);
  const canDashboard = itemAllowed(perms, "dashboard");
  const required = requiredPermFor(pathname);
  const allowedHere = itemAllowed(perms, required);
  const firstAllowed = visibleGroups.flatMap((g) => g.items)[0];

  // Staff without the dashboard permission land on their first allowed page.
  useEffect(() => {
    if (perms && pathname.replace(/\/+$/, "") === "/admin" && !canDashboard && firstAllowed) {
      navigate({ to: firstAllowed.to });
    }
  }, [perms, pathname, canDashboard, firstAllowed, navigate]);

  if (loading || (isAdmin && permsQuery.isLoading)) return <LoadingState label="Checking access…" />;

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
          <Link to="/admin" className="inline-flex flex-col gap-2 text-sidebar-foreground" aria-label="HABÄNE admin console">
            <span className="flex items-center gap-2.5">
              <img src="/brand/icon-navy.png" alt="" className="h-[22px] w-auto" />
              <img src="/brand/wordmark-navy.png" alt="HABÄNE" className="h-[13px] w-auto" />
            </span>
            <span className="block text-[10px] tracking-[0.2em] text-sidebar-foreground/50 uppercase">
              Admin console
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {canDashboard && (
            <Link
              to="/admin"
              activeOptions={{ exact: true }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground mb-2"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
          )}
          {visibleGroups.map((group) => (
            <NavGroupItem key={group.label} group={group} />
          ))}
        </nav>

        <div className="border-t border-sidebar-border px-4 py-4">
          <p className="truncate px-1 text-xs text-sidebar-foreground/60">{emailToLoginId(user?.email)}</p>
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
          {[
            { to: "/admin", label: "Dashboard", perm: "dashboard" },
            { to: "/admin/orders", label: "Orders", perm: "orders" },
            { to: "/admin/products", label: "Products", perm: "catalogue" },
            { to: "/admin/customers", label: "Customers", perm: "customers" },
          ]
            .filter((l) => itemAllowed(perms, l.perm))
            .map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-md px-3 py-1.5 text-xs whitespace-nowrap text-sidebar-foreground/70 data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
              >
                {l.label}
              </Link>
            ))}
        </nav>
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
          {allowedHere ? (
            <Outlet />
          ) : (
            <div className="mx-auto max-w-md space-y-3 py-24 text-center">
              <span className="eyebrow text-muted-foreground">No access</span>
              <h1 className="text-2xl">Your role can't open this page</h1>
              <p className="text-sm text-muted-foreground">
                Ask a main administrator to add this section to your role.
              </p>
              {firstAllowed && (
                <Button asChild variant="outline">
                  <Link to={firstAllowed.to}>Go to {firstAllowed.label}</Link>
                </Button>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * Dashboard permissions. A role is a list of these keys; main administrators
 * hold "*" (everything). Each key matches a section of the sidebar.
 */
export interface PermissionModule {
  key: string;
  label: string;
  /** what it unlocks, shown under the checkbox when creating a role */
  description: string;
}

export const PERMISSION_MODULES: PermissionModule[] = [
  { key: "dashboard", label: "Dashboard overview", description: "The home page with today's totals." },
  { key: "analytics", label: "Analytics", description: "Sales, customers, products, financial and geographic reports." },
  { key: "catalogue", label: "Products & Inventory", description: "Products, inventory and stock." },
  { key: "orders", label: "Orders & Operations", description: "Orders, returns and refunds." },
  { key: "customers", label: "Customers", description: "Customer list and reviews." },
  { key: "marketing", label: "Marketing", description: "Coupons and newsletter subscribers." },
  { key: "content", label: "Content", description: "Homepage, announcement bar, find-your-object, journal and FAQ." },
  { key: "insights", label: "Visitor Insights", description: "Product interest, pages & time, visitors." },
  { key: "seo", label: "SEO", description: "SEO dashboard, redirects and search analytics." },
  { key: "inbox", label: "Inbox", description: "Contact messages." },
];

/** Staff sign in with a User ID; behind the scenes it is stored as this email. */
export const STAFF_EMAIL_DOMAIN = "staff.habane.invalid";

export function loginIdToEmail(loginId: string): string {
  const id = loginId.trim();
  return id.includes("@") ? id : `${id.toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
}

export function emailToLoginId(email: string | undefined | null): string {
  if (!email) return "";
  return email.endsWith(`@${STAFF_EMAIL_DOMAIN}`) ? email.split("@")[0]! : email;
}

export function canAccess(permissions: string[] | undefined, key: string): boolean {
  if (!permissions) return false;
  return permissions.includes("*") || permissions.includes(key);
}

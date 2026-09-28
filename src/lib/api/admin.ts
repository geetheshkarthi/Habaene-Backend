/**
 * admin.ts — Admin Control Panel & Security service.
 * Team management, RBAC, audit trail, notifications, webhooks.
 */
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ─── Types ──────────────────────────────────────────────────────────────────

export type AppRole =
  | "admin"
  | "content_manager"
  | "seo_manager"
  | "sales_manager"
  | "inventory_manager"
  | "order_manager"
  | "customer_support"
  | "marketing_manager"
  | "finance_manager";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrator",
  content_manager: "Content Manager",
  seo_manager: "SEO Manager",
  sales_manager: "Sales Manager",
  inventory_manager: "Inventory Manager",
  order_manager: "Order Manager",
  customer_support: "Customer Support",
  marketing_manager: "Marketing Manager",
  finance_manager: "Finance Manager",
};

// Permissions: which roles can access which modules
export const ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  admin: ["*"], // all
  content_manager: ["cms", "products", "media", "journal", "faq", "reviews"],
  seo_manager: ["seo", "journal", "products", "redirects", "sitemap", "search_analytics"],
  sales_manager: ["orders", "customers", "analytics_sales", "products"],
  inventory_manager: ["products", "inventory", "warehouses", "stock", "purchase_orders"],
  order_manager: ["orders", "returns", "customers", "shipping"],
  customer_support: ["orders", "customers", "returns", "messages"],
  marketing_manager: ["marketing", "campaigns", "discounts", "promotions", "newsletter", "early_access"],
  finance_manager: ["analytics_financial", "payments", "refunds", "analytics"],
};

export interface TeamMember {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  email?: string;
}

export interface AuditTrailEntry {
  id: string;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_by: string | null;
  changed_by_email: string | null;
  changed_by_role: string | null;
  ip_address: string | null;
  module: string | null;
  description: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  recipient_id: string | null;
  created_at: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  status: "active" | "inactive" | "failed";
  last_triggered_at: string | null;
  last_response_code: number | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplate {
  id: string;
  slug: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  variables: unknown[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Team Management ──────────────────────────────────────────────────────────

export async function getTeamMembers(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("*")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as TeamMember[];
}

export async function assignRole(userId: string, role: AppRole): Promise<void> {
  const { error } = await db
    .from("user_roles")
    .upsert({ user_id: userId, role: role as any }, { onConflict: "user_id,role" });
  if (error) throw new Error(error.message);
}

export async function removeRole(userId: string, role: AppRole): Promise<void> {
  const { error } = await db
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", role as any);
  if (error) throw new Error(error.message);
}

export function canAccess(role: AppRole, module: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes("*") || perms.includes(module);
}

// ─── Audit Trail ─────────────────────────────────────────────────────────────

export async function getAuditTrail(options?: {
  tableName?: string;
  module?: string;
  changedBy?: string;
  limit?: number;
  offset?: number;
  start?: string;
  end?: string;
}): Promise<AuditTrailEntry[]> {
  let q: any = db
    .from("audit_trail")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 100)
    .range(options?.offset ?? 0, (options?.offset ?? 0) + (options?.limit ?? 100) - 1);

  if (options?.tableName) q = q.eq("table_name", options.tableName);
  if (options?.module) q = q.eq("module", options.module);
  if (options?.changedBy) q = q.eq("changed_by", options.changedBy);
  if (options?.start) q = q.gte("created_at", options.start);
  if (options?.end) q = q.lte("created_at", options.end);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown) as AuditTrailEntry[];
}

export async function writeAuditLog(entry: {
  table_name: string;
  record_id?: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  previous_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  changed_by_email?: string;
  changed_by_role?: string;
  module?: string;
  description?: string;
}): Promise<void> {
  const { error } = await db.from("audit_trail").insert(entry);
  if (error) console.error("Audit log failed:", error.message);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getNotifications(userId: string, unreadOnly = false): Promise<Notification[]> {
  let q: any = db
    .from("notifications")
    .select("*")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (unreadOnly) q = q.eq("is_read", false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown) as Notification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await db
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await db
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .eq("is_read", false);
  if (error) throw new Error(error.message);
}

export async function createNotification(payload: {
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  recipient_id?: string;
}): Promise<void> {
  const { error } = await db.from("notifications").insert({
    ...payload,
    metadata: payload.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export async function getWebhooks(): Promise<Webhook[]> {
  const { data, error } = await db.from("webhooks").select("*").order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown) as Webhook[];
}

export async function createWebhook(payload: Partial<Webhook>): Promise<Webhook> {
  const { data, error } = await db.from("webhooks").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as Webhook;
}

export async function updateWebhook(id: string, payload: Partial<Webhook>): Promise<Webhook> {
  const { data, error } = await db.from("webhooks").update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as Webhook;
}

export async function deleteWebhook(id: string): Promise<void> {
  const { error } = await db.from("webhooks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function triggerWebhook(
  webhookId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { data: wh } = await db.from("webhooks").select("*").eq("id", webhookId).single();
  if (!wh || wh.status !== "active") return;

  try {
    const res = await fetch(wh.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": event,
        ...(wh.secret ? { "X-Webhook-Secret": wh.secret } : {}),
      },
      body: JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
    });

    await db.from("webhooks").update({
      last_triggered_at: new Date().toISOString(),
      last_response_code: res.status,
      failure_count: res.ok ? 0 : (wh.failure_count || 0) + 1,
      status: !res.ok && (wh.failure_count || 0) >= 5 ? "failed" : wh.status,
    }).eq("id", webhookId);
  } catch (err) {
    await db.from("webhooks").update({
      failure_count: (wh.failure_count || 0) + 1,
      status: (wh.failure_count || 0) >= 5 ? "failed" : wh.status,
    }).eq("id", webhookId);
  }
}

// ─── Email Templates ──────────────────────────────────────────────────────────

export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await db.from("email_templates").select("*").order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown) as EmailTemplate[];
}

export async function getEmailTemplate(slug: string): Promise<EmailTemplate | null> {
  const { data, error } = await db.from("email_templates").select("*").eq("slug", slug).single();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data as EmailTemplate | null;
}

export async function updateEmailTemplate(id: string, payload: Partial<EmailTemplate>): Promise<EmailTemplate> {
  const { data, error } = await db.from("email_templates").update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as EmailTemplate;
}

/** Interpolate template variables: {{variable_name}} → value */
export function interpolateTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ""));
}

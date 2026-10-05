/**
 * Implementation of every public v1 endpoint. Server-only: uses the service
 * role client, so each handler is responsible for exposing safe fields only.
 */
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  checkoutSchema,
  createOrderRecord,
  getStoreSettings,
  legalFooter,
  orderInputSchema,
  priceCart,
} from "@/lib/checkout.server";
import { newsletterWelcomeEmail, sendEmail, contactFormEmail } from "@/lib/email.server";
import { StripeNotConfiguredError } from "@/lib/stripe.server";
import { RazorpayNotConfiguredError } from "@/lib/razorpay.server";
import { SliceNotConfiguredError } from "@/lib/slice.server";
import { LOG_EVENTS, logEvent } from "@/lib/logger.server";
import { badRequest, conflict, notFound, unavailable } from "./response";
import type {
  CheckoutSessionResult,
  ContactResult,
  CreatedOrder,
  DiscountValidation,
  HealthResult,
  HealthState,
  NewsletterResult,
  ProductListResult,
  PublicOrder,
  PublicProduct,
  PublicReturn,
  PublicStoreSettings,
  SystemCheckComponent,
  SystemCheckDetail,
  SystemCheckResult,
} from "./contract";
import { SYSTEM_CHECK_COMPONENTS } from "./contract";

export const APP_VERSION = "1.0.0";

const PRODUCT_COLUMNS =
  "id, code, name, slug, subtitle, description, badge, category, price, vat_rate, stock, images, card_image, passport_code, specs, colors, sizes, weight_kg, mood, pack_items, passport_service, passport_role, materials, care_instructions, product_story, warranty_info, blueprint, position";

type ProductRow = {
  price: number | string;
  vat_rate: number | string;
  weight_kg: number | string;
  stock: number;
} & Record<string, unknown>;

const num = (v: unknown) => Number(v ?? 0);

function toPublicProduct(row: ProductRow): PublicProduct {
  return {
    ...(row as unknown as PublicProduct),
    price: num(row.price),
    // Public API always expresses VAT in percentage points (19), never 0.19.
    vat_rate:
      num(row.vat_rate) > 1 ? num(row.vat_rate) : Math.round(num(row.vat_rate) * 10000) / 100,
    weight_kg: num(row.weight_kg),
    stock: row.stock,
    in_stock: row.stock > 0,
  };
}

function parse<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw badRequest("Request body failed validation", result.error.issues);
  }
  return result.data;
}

/* -------------------------------- products -------------------------------- */

export async function listProducts(url: URL): Promise<ProductListResult> {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  const category = url.searchParams.get("category");
  const search = url.searchParams.get("search");
  const inStock = url.searchParams.get("in_stock");

  let query = supabaseAdmin
    .from("products")
    .select(PRODUCT_COLUMNS, { count: "exact" })
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category && category !== "all") {
    if (!["system", "carry", "luggage"].includes(category)) {
      throw badRequest("Unknown category", { category });
    }
    query = query.eq("category", category as "system");
  }
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`name.ilike.${term},code.ilike.${term},slug.ilike.${term}`);
  }
  if (inStock === "true") query = query.gt("stock", 0);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    items: (data ?? []).map((row) => toPublicProduct(row as unknown as ProductRow)),
    total: count ?? 0,
    limit,
    offset,
  };
}

export async function getProductBySlug(slug: string): Promise<PublicProduct> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("slug", slug)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound(`No product with slug "${slug}"`);
  return toPublicProduct(data as unknown as ProductRow);
}

/** Cart pricing failures are either stock/state conflicts (409) or bad input (400). */
function pricingError(error: unknown) {
  const message = error instanceof Error ? error.message : "Cart could not be priced";
  if (/stock|unavailable|no longer|inactive|sold out/i.test(message)) return conflict(message);
  if (/not found|unknown product/i.test(message)) return notFound(message);
  return badRequest(message);
}

/* --------------------------------- orders --------------------------------- */

export async function createOrder(payload: unknown): Promise<CreatedOrder> {
  const input = parse(orderInputSchema, payload);
  let priced;
  try {
    priced = await priceCart(input);
  } catch (error) {
    throw pricingError(error);
  }
  const order = await createOrderRecord(input, priced, "manual");

  await logEvent(LOG_EVENTS.orderCreated, {
    message: `Order ${order.order_number} created`,
    orderId: order.id,
    context: { total: priced.total, items: priced.lines.length, source: "api_v1" },
  });

  return {
    order_id: order.id,
    order_number: order.order_number,
    status: order.status,
    payment_status: order.payment_status,
    subtotal: priced.subtotal,
    discount_amount: priced.discount_amount,
    shipping_cost: priced.shipping_cost,
    vat_rate: priced.vat_rate,
    vat_amount: priced.vat_amount,
    total: priced.total,
    currency: "EUR",
  };
}

/** Order lookup is guarded by the email that placed it — no account needed. */
export async function getOrder(orderNumber: string, url: URL): Promise<PublicOrder> {
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  if (!email) throw badRequest("Query parameter `email` is required to look up an order");

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*, order_items(*)")
    .eq("order_number", orderNumber)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.customer_email.toLowerCase() !== email) {
    throw notFound("No order matches that order number and email");
  }

  const settings = await getStoreSettings();
  const withdrawal_deadline = data.delivered_at
    ? new Date(
        new Date(data.delivered_at).getTime() +
          settings.withdrawal_window_days * 24 * 60 * 60 * 1000,
      ).toISOString()
    : null;

  return {
    order_number: data.order_number,
    status: data.status,
    payment_status: data.payment_status,
    created_at: data.created_at,
    shipped_at: data.shipped_at,
    delivered_at: data.delivered_at,
    shipping_carrier: data.shipping_carrier,
    tracking_number: data.tracking_number,
    subtotal: num(data.subtotal),
    discount_amount: num(data.discount_amount),
    shipping_cost: num(data.shipping_cost),
    vat_rate:
      num(data.vat_rate) > 1 ? num(data.vat_rate) : Math.round(num(data.vat_rate) * 10000) / 100,
    vat_amount: num(data.vat_amount),
    total: num(data.total),
    currency: data.currency,
    withdrawal_deadline,
    items: data.order_items.map((i) => ({
      product_name: i.product_name,
      product_code: i.product_code,
      quantity: i.quantity,
      unit_price: num(i.unit_price),
      subtotal: num(i.subtotal),
      size: i.size,
      color: i.color,
      product_image: i.product_image,
    })),
  };
}

/* -------------------------------- checkout -------------------------------- */

export async function createCheckout(payload: unknown): Promise<CheckoutSessionResult> {
  const input = parse(checkoutSchema, payload);
  const { startCheckout } = await import("@/lib/checkout.server");

  await logEvent(LOG_EVENTS.checkoutStarted, {
    message: `Checkout started for ${input.email}`,
    context: { items: input.items.length, discount_code: input.discount_code ?? null },
  });

  try {
    const result = await startCheckout(input);
    return {
      order_id: result.order_id,
      order_number: result.order_number,
      payment_provider: result.payment_provider,
      checkout_url: result.checkout_url,
      ...("razorpay_order_id" in result
        ? { razorpay_order_id: result.razorpay_order_id, razorpay_key_id: result.razorpay_key_id }
        : {}),
      subtotal: result.subtotal,
      discount_amount: result.discount_amount,
      shipping_cost: result.shipping_cost,
      vat_rate: result.vat_rate,
      vat_amount: result.vat_amount,
      total: result.total,
      currency: result.currency,
      support_email: result.support_email,
    };
  } catch (error) {
    if (
      error instanceof StripeNotConfiguredError ||
      error instanceof RazorpayNotConfiguredError ||
      error instanceof SliceNotConfiguredError
    ) {
      await logEvent(LOG_EVENTS.paymentFailed, {
        level: "error",
        message: `${error.name}: payment provider is not configured`,
      });
      throw unavailable("Payments are not configured yet");
    }
    const message = error instanceof Error ? error.message : "Checkout failed";
    await logEvent(LOG_EVENTS.paymentFailed, { level: "error", message });
    throw pricingError(error);
  }
}

/* --------------------------------- returns -------------------------------- */

const returnSchema = z.object({
  order_number: z.string().trim().min(3).max(40),
  email: z.string().trim().email().max(255),
  type: z.enum(["withdrawal", "defect", "exchange_request"]),
  reason: z.string().trim().min(3).max(2000),
});

export async function createReturn(payload: unknown): Promise<PublicReturn> {
  const input = parse(returnSchema, payload);

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, customer_email, delivered_at")
    .eq("order_number", input.order_number)
    .maybeSingle();
  if (!order || order.customer_email.toLowerCase() !== input.email.toLowerCase()) {
    throw notFound("No order matches that order number and email");
  }

  const settings = await getStoreSettings();
  if (input.type === "withdrawal" && order.delivered_at) {
    const deadline =
      new Date(order.delivered_at).getTime() +
      settings.withdrawal_window_days * 24 * 60 * 60 * 1000;
    if (Date.now() > deadline) {
      throw conflict(
        `The ${settings.withdrawal_window_days}-day withdrawal window for this order has expired`,
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("returns")
    .insert({
      order_id: order.id,
      order_number: input.order_number,
      customer_email: input.email,
      type: input.type,
      reason: input.reason,
      status: "submitted",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logEvent(LOG_EVENTS.orderUpdated, {
    message: `Return submitted for ${input.order_number}`,
    orderId: order.id,
    context: { return_id: data.id, type: input.type },
  });

  return toPublicReturn(data);
}

function toPublicReturn(row: {
  id: string;
  order_number: string | null;
  type: string;
  status: string;
  reason: string;
  submitted_at: string;
  refund_amount: number | null;
  return_label_url: string | null;
}): PublicReturn {
  return {
    id: row.id,
    order_number: row.order_number,
    type: row.type,
    status: row.status,
    reason: row.reason,
    submitted_at: row.submitted_at,
    refund_amount: row.refund_amount == null ? null : num(row.refund_amount),
    return_label_url: row.return_label_url,
  };
}

export async function getReturn(id: string, url: URL): Promise<PublicReturn> {
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  if (!email) throw badRequest("Query parameter `email` is required to look up a return");
  const { data, error } = await supabaseAdmin
    .from("returns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.customer_email.toLowerCase() !== email) {
    throw notFound("No return matches that id and email");
  }
  return toPublicReturn(data);
}

/* ------------------------------- newsletter ------------------------------- */

const subscribeSchema = z.object({
  email: z.string().trim().email().max(255),
  consent_text: z.string().trim().max(500).optional(),
  source: z.string().trim().max(40).optional(),
});

export async function subscribeNewsletter(
  payload: unknown,
  request: Request,
): Promise<NewsletterResult> {
  const input = parse(subscribeSchema, payload);
  const email = input.email.toLowerCase();
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");

  const { data, error } = await supabaseAdmin
    .from("newsletter_subscribers")
    .upsert(
      {
        email,
        is_active: true,
        unsubscribed_at: null,
        ip_address: ip ? ip.split(",")[0]!.trim() : null,
        ...(input.consent_text ? { consent_text: input.consent_text } : {}),
        ...(input.source ? { source: input.source } : {}),
      },
      { onConflict: "email" },
    )
    .select("email, unsubscribe_token")
    .single();
  if (error) throw new Error(error.message);

  try {
    const settings = await getStoreSettings();
    const mail = newsletterWelcomeEmail(email, legalFooter(settings));
    await sendEmail({ to: email, ...mail });
    await logEvent(LOG_EVENTS.emailSent, {
      message: "Newsletter welcome sent",
      context: { to: email, template: "newsletter_welcome" },
    });
  } catch (mailError) {
    await logEvent(LOG_EVENTS.emailSent, {
      level: "warn",
      message: "Newsletter welcome failed",
      context: { to: email, error: String(mailError) },
    });
  }

  return { email: data.email, subscribed: true, unsubscribe_token: data.unsubscribe_token };
}

const unsubscribeSchema = z
  .object({
    token: z.string().trim().max(200).optional(),
    email: z.string().trim().email().max(255).optional(),
  })
  .refine((v) => Boolean(v.token || v.email), { message: "Provide either `token` or `email`" });

export async function unsubscribeNewsletter(payload: unknown): Promise<NewsletterResult> {
  const input = parse(unsubscribeSchema, payload);
  const query = supabaseAdmin
    .from("newsletter_subscribers")
    .update({ is_active: false, unsubscribed_at: new Date().toISOString() });

  const { data, error } = input.token
    ? await query.eq("unsubscribe_token", input.token).select("email").maybeSingle()
    : await query.eq("email", input.email!.toLowerCase()).select("email").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("No active subscription found");
  return { email: data.email, subscribed: false };
}

/* --------------------------------- contact -------------------------------- */

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(5).max(5000),
});

export async function submitContact(payload: unknown): Promise<ContactResult> {
  const input = parse(contactSchema, payload);
  const { data, error } = await supabaseAdmin
    .from("contact_messages")
    .insert({
      name: input.name,
      email: input.email.toLowerCase(),
      subject: input.subject ?? "Contact form",
      message: input.message,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  try {
    const mail = contactFormEmail({
      name: input.name,
      email: input.email,
      message: input.message,
      ...(input.subject ? { subject: input.subject } : {}),
    });
    await sendEmail({ to: "support@habaene.com", ...mail });
  } catch (err) {
    console.error("Failed to send contact notification email:", err);
  }

  return { id: data.id, received: true };
}

/* -------------------------------- discounts ------------------------------- */

const discountSchema = z.object({
  code: z.string().trim().min(1).max(40),
  subtotal: z.number().nonnegative().max(1_000_000),
});

export async function validateDiscount(payload: unknown): Promise<DiscountValidation> {
  const input = parse(discountSchema, payload);
  const { data: code } = await supabaseAdmin
    .from("discount_codes")
    .select("*")
    .ilike("code", input.code)
    .is("deleted_at", null)
    .eq("is_active", true)
    .maybeSingle();

  const invalid = (reason: string): DiscountValidation => ({
    valid: false,
    code: input.code.toUpperCase(),
    reason,
  });

  if (!code) return invalid("This code does not exist");
  if (code.expires_at && new Date(code.expires_at) < new Date())
    return invalid("This code expired");
  if (code.max_uses != null && code.uses_so_far >= code.max_uses) {
    return invalid("This code has reached its usage limit");
  }
  if (input.subtotal < num(code.min_order)) {
    return invalid(`A minimum order value of ${num(code.min_order)} EUR is required`);
  }

  const discount_amount =
    code.type === "percent"
      ? Math.round(((input.subtotal * num(code.value)) / 100) * 100) / 100
      : Math.min(num(code.value), input.subtotal);

  return {
    valid: true,
    code: code.code,
    type: code.type as "percent" | "fixed",
    value: num(code.value),
    discount_amount,
  };
}

/* ------------------------------ store settings ----------------------------- */

export async function getPublicStore(): Promise<PublicStoreSettings> {
  const s = await getStoreSettings();
  const rate = num(s.default_vat_rate);
  return {
    brand_name: s.brand_name,
    company_name: s.legal_company_name,
    support_email: s.support_email,
    support_phone: s.support_phone,
    currency: s.currency,
    vat_rate: rate > 1 ? rate : Math.round(rate * 10000) / 100,
    shipping_cost: num(s.shipping_cost),
    free_shipping_threshold:
      s.free_shipping_threshold == null ? null : num(s.free_shipping_threshold),
    withdrawal_window_days: s.withdrawal_window_days,
    social_links: (s.social_links ?? {}) as Record<string, string>,
    logo_url: s.logo_url,
    favicon_url: s.favicon_url,
  };
}

/* --------------------------------- health --------------------------------- */

export async function healthCheck(): Promise<HealthResult> {
  const checks: HealthResult["checks"] = {
    database: { status: "ok" },
    storage: { status: "ok" },
    stripe: { status: "ok" },
    razorpay: { status: "ok" },
    slice: { status: "ok" },
    dhl: { status: "ok" },
    delhivery: { status: "ok" },
    email: { status: "ok" },
  };

  try {
    const { error } = await supabaseAdmin
      .from("store_settings")
      .select("id", { head: true, count: "exact" });
    if (error) throw new Error(error.message);
  } catch (error) {
    checks.database = { status: "error", message: (error as Error).message };
  }

  try {
    const { error } = await supabaseAdmin.storage.from("product-images").list("", { limit: 1 });
    if (error) throw new Error(error.message);
  } catch (error) {
    checks.storage = { status: "error", message: (error as Error).message };
  }

  checks.stripe = process.env["STRIPE_SECRET_KEY"]
    ? {
        status: process.env["STRIPE_WEBHOOK_SECRET"] ? "ok" : "degraded",
        ...(process.env["STRIPE_WEBHOOK_SECRET"]
          ? {}
          : { message: "STRIPE_WEBHOOK_SECRET is missing" }),
      }
    : { status: "not_configured", message: "STRIPE_SECRET_KEY is missing" };

  checks.razorpay =
    process.env["RAZORPAY_KEY_ID"] && process.env["RAZORPAY_KEY_SECRET"]
      ? {
          status: process.env["RAZORPAY_WEBHOOK_SECRET"] ? "ok" : "degraded",
          ...(process.env["RAZORPAY_WEBHOOK_SECRET"]
            ? {}
            : { message: "RAZORPAY_WEBHOOK_SECRET is missing" }),
        }
      : { status: "not_configured", message: "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET is missing" };

  checks.slice =
    process.env["SLICE_API_KEY"] && process.env["SLICE_API_SECRET"]
      ? {
          status: process.env["SLICE_WEBHOOK_SECRET"] ? "ok" : "degraded",
          ...(process.env["SLICE_WEBHOOK_SECRET"]
            ? {}
            : { message: "SLICE_WEBHOOK_SECRET is missing" }),
        }
      : { status: "not_configured", message: "SLICE_API_KEY / SLICE_API_SECRET is missing" };

  checks.dhl =
    process.env["DHL_API_KEY"] && process.env["DHL_API_SECRET"] && process.env["DHL_ACCOUNT_NUMBER"]
      ? { status: "ok" }
      : {
          status: "not_configured",
          message: "DHL_API_KEY / DHL_API_SECRET / DHL_ACCOUNT_NUMBER is missing",
        };

  checks.delhivery =
    process.env["DELHIVERY_API_TOKEN"] && process.env["DELHIVERY_CLIENT_NAME"]
      ? { status: "ok" }
      : {
          status: "not_configured",
          message: "DELHIVERY_API_TOKEN / DELHIVERY_CLIENT_NAME is missing",
        };

  checks.email = process.env["RESEND_API_KEY"]
    ? { status: "ok" }
    : { status: "not_configured", message: "RESEND_API_KEY is missing — emails are logged only" };

  const degraded = (Object.values(checks) as { status: HealthState }[]).some(
    (c) => c.status !== "ok",
  );

  return {
    status: degraded ? "degraded" : "ok",
    version: APP_VERSION,
    api_version: "v1",
    timestamp: new Date().toISOString(),
    checks,
  };
}

/* ------------------------------ system check ------------------------------ */

type Detail = SystemCheckDetail;

const okDetail = (info?: Record<string, unknown>): Detail => ({
  status: "ok",
  ...(info ? { info } : {}),
});
const errDetail = (message: string): Detail => ({ status: "error", message });

async function safe(run: () => Promise<Detail>): Promise<Detail> {
  try {
    return await run();
  } catch (error) {
    return errDetail(error instanceof Error ? error.message : String(error));
  }
}

async function countOf(table: "products" | "orders" | "customers" | "event_logs") {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { head: true, count: "exact" });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Confirms anonymous callers cannot read private tables but can read the catalogue. */
async function checkRls(): Promise<Detail> {
  const url = process.env["SUPABASE_URL"];
  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !anonKey) {
    return {
      status: "not_configured",
      message: "Anonymous key is unavailable in this environment",
    };
  }

  const anonGet = async (path: string) =>
    fetch(`${url}/rest/v1/${path}`, { headers: { apikey: anonKey } });

  const orders = await anonGet("orders?select=id&limit=1");
  const ordersBody = await orders.text();
  const leaked = orders.ok && ordersBody.trim() !== "[]";
  if (leaked)
    return errDetail("Anonymous role can read orders — RLS is not protecting private data");

  const products = await anonGet("products?select=id&limit=1");
  if (!products.ok) {
    return {
      status: "degraded",
      message: "Anonymous role cannot read the public product catalogue",
    };
  }
  return okDetail({ private_tables_blocked: true, public_catalogue_readable: true });
}

export async function systemCheck(): Promise<SystemCheckResult> {
  const [
    database,
    storage,
    productImages,
    auth,
    adminRole,
    rls,
    publicApi,
    products,
    orders,
    customers,
    inventory,
    settings,
    logs,
  ] = await Promise.all([
    safe(async () => {
      const { error } = await supabaseAdmin
        .from("store_settings")
        .select("id", { head: true, count: "exact" });
      if (error) throw new Error(error.message);
      return okDetail();
    }),
    safe(async () => {
      const { data, error } = await supabaseAdmin.storage.listBuckets();
      if (error) throw new Error(error.message);
      return okDetail({ buckets: (data ?? []).map((b) => b.name) });
    }),
    safe(async () => {
      const { data, error } = await supabaseAdmin.storage.getBucket("product-images");
      if (error || !data) throw new Error(error?.message ?? "Bucket product-images is missing");
      const { error: listError } = await supabaseAdmin.storage
        .from("product-images")
        .list("", { limit: 1 });
      if (listError) throw new Error(listError.message);
      return okDetail({ public: data.public });
    }),
    safe(async () => {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) throw new Error(error.message);
      const total = (data as { total?: number }).total ?? data.users.length;
      if (total === 0) {
        return {
          status: "degraded",
          message: "No auth users exist yet — create the first admin account",
        };
      }
      return okDetail({ users: total });
    }),
    safe(async () => {
      const { count, error } = await supabaseAdmin
        .from("user_roles")
        .select("id", { head: true, count: "exact" })
        .eq("role", "admin");
      if (error) throw new Error(error.message);
      if (!count) return { status: "degraded", message: "No user has the admin role yet" };
      return okDetail({ admins: count });
    }),
    safe(checkRls),
    safe(async () => {
      const result = await listProducts(new URL("https://internal/api/v1/products?limit=1"));
      const store = await getPublicStore();
      return okDetail({
        catalogue_reachable: true,
        brand_name: store.brand_name,
        total_products: result.total,
      });
    }),
    safe(async () => {
      const total = await countOf("products");
      const { count: active, error } = await supabaseAdmin
        .from("products")
        .select("id", { head: true, count: "exact" })
        .eq("is_active", true)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      if (!active) return { status: "degraded", message: "No active products are published" };
      return okDetail({ total, active });
    }),
    safe(async () => okDetail({ total: await countOf("orders") })),
    safe(async () => okDetail({ total: await countOf("customers") })),
    safe(async () => {
      const { data, error } = await supabaseAdmin
        .from("products")
        .select("code, stock")
        .eq("is_active", true)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const negative = rows.filter((r) => r.stock < 0);
      if (negative.length)
        return errDetail(`Negative stock on: ${negative.map((r) => r.code).join(", ")}`);
      const outOfStock = rows.filter((r) => r.stock === 0);
      if (rows.length && outOfStock.length === rows.length) {
        return { status: "degraded", message: "Every active product is out of stock" };
      }
      return okDetail({ tracked: rows.length, out_of_stock: outOfStock.length });
    }),
    safe(async () => {
      const s = await getStoreSettings();
      const missing = [
        !s.legal_company_name && "legal_company_name",
        !s.vat_id && "vat_id",
        !s.support_email && "support_email",
      ].filter(Boolean) as string[];
      if (missing.length) {
        return { status: "degraded", message: `Store settings incomplete: ${missing.join(", ")}` };
      }
      return okDetail({ currency: s.currency, withdrawal_window_days: s.withdrawal_window_days });
    }),
    safe(async () => okDetail({ entries: await countOf("event_logs") })),
  ]);

  const stripe: Detail = process.env["STRIPE_SECRET_KEY"]
    ? process.env["STRIPE_WEBHOOK_SECRET"]
      ? okDetail()
      : { status: "degraded", message: "STRIPE_WEBHOOK_SECRET is missing" }
    : { status: "not_configured", message: "STRIPE_SECRET_KEY is missing" };

  const razorpay: Detail =
    process.env["RAZORPAY_KEY_ID"] && process.env["RAZORPAY_KEY_SECRET"]
      ? process.env["RAZORPAY_WEBHOOK_SECRET"]
        ? okDetail()
        : { status: "degraded", message: "RAZORPAY_WEBHOOK_SECRET is missing" }
      : { status: "not_configured", message: "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET is missing" };

  const slice: Detail =
    process.env["SLICE_API_KEY"] && process.env["SLICE_API_SECRET"]
      ? process.env["SLICE_WEBHOOK_SECRET"]
        ? okDetail()
        : { status: "degraded", message: "SLICE_WEBHOOK_SECRET is missing" }
      : { status: "not_configured", message: "SLICE_API_KEY / SLICE_API_SECRET is missing" };

  const dhl: Detail =
    process.env["DHL_API_KEY"] && process.env["DHL_API_SECRET"] && process.env["DHL_ACCOUNT_NUMBER"]
      ? okDetail()
      : {
          status: "not_configured",
          message: "DHL_API_KEY / DHL_API_SECRET / DHL_ACCOUNT_NUMBER is missing",
        };

  const delhivery: Detail =
    process.env["DELHIVERY_API_TOKEN"] && process.env["DELHIVERY_CLIENT_NAME"]
      ? okDetail()
      : {
          status: "not_configured",
          message: "DELHIVERY_API_TOKEN / DELHIVERY_CLIENT_NAME is missing",
        };

  const email: Detail = process.env["RESEND_API_KEY"]
    ? process.env["EMAIL_FROM"]
      ? okDetail()
      : { status: "degraded", message: "EMAIL_FROM is missing — using the default sender" }
    : { status: "not_configured", message: "RESEND_API_KEY is missing — emails are logged only" };

  const details = {
    database,
    storage,
    auth,
    rls,
    admin_role: adminRole,
    product_images: productImages,
    public_api: publicApi,
    products,
    orders,
    customers,
    inventory,
    settings,
    logs,
    stripe,
    razorpay,
    slice,
    dhl,
    delhivery,
    email,
  } as Record<SystemCheckComponent, Detail>;

  const statuses = {} as Record<SystemCheckComponent, HealthState>;
  for (const key of SYSTEM_CHECK_COMPONENTS) statuses[key] = details[key].status;

  const values = Object.values(statuses);
  const status = values.includes("error")
    ? "error"
    : values.every((v) => v === "ok")
      ? "ok"
      : "degraded";

  return {
    ...statuses,
    status,
    version: APP_VERSION,
    api_version: "v1",
    timestamp: new Date().toISOString(),
    details,
  };
}

/* ─── Tracking handlers ───────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

export async function trackCartEvent(body: Record<string, unknown>) {
  const { error } = await db.from("cart_events").insert({
    session_id: String(body["session_id"] ?? ""),
    event_type: String(body["event_type"] ?? ""),
    customer_email: body["customer_email"] ? String(body["customer_email"]) : null,
    product_id: body["product_id"] ? String(body["product_id"]) : null,
    product_name: body["product_name"] ? String(body["product_name"]) : null,
    quantity: body["quantity"] ? Number(body["quantity"]) : null,
    unit_price: body["unit_price"] ? Number(body["unit_price"]) : null,
    cart_total: body["cart_total"] ? Number(body["cart_total"]) : null,
    cart_items: body["cart_items"] ?? null,
    checkout_stage: body["checkout_stage"] ? String(body["checkout_stage"]) : null,
    utm_source: body["utm_source"] ? String(body["utm_source"]) : null,
    utm_medium: body["utm_medium"] ? String(body["utm_medium"]) : null,
    utm_campaign: body["utm_campaign"] ? String(body["utm_campaign"]) : null,
    utm_content: body["utm_content"] ? String(body["utm_content"]) : null,
    referrer: body["referrer"] ? String(body["referrer"]) : null,
  });
  if (error) throw new Error(error.message);
  return { tracked: true };
}

export async function trackProductView(body: Record<string, unknown>) {
  const { error } = await db.from("product_views").insert({
    product_id: String(body["product_id"] ?? ""),
    session_id: body["session_id"] ? String(body["session_id"]) : null,
    referrer: body["referrer"] ? String(body["referrer"]) : null,
    utm_source: body["utm_source"] ? String(body["utm_source"]) : null,
    utm_medium: body["utm_medium"] ? String(body["utm_medium"]) : null,
    utm_campaign: body["utm_campaign"] ? String(body["utm_campaign"]) : null,
    country_code: body["country_code"] ? String(body["country_code"]) : null,
  });
  if (error) throw new Error(error.message);
  return { tracked: true };
}

export async function trackSearch(body: Record<string, unknown>) {
  const { error } = await db.from("search_logs").insert({
    query: String(body["query"] ?? ""),
    results_count: Number(body["results_count"] ?? 0),
    session_id: body["session_id"] ? String(body["session_id"]) : null,
    led_to_purchase: Boolean(body["led_to_purchase"]),
  });
  if (error) throw new Error(error.message);
  return { tracked: true };
}

/* ─── Back-in-stock ──────────────────────────────────────────────────────── */

const bisSchema = z.object({
  email: z.string().email(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
});

export async function registerBackInStock(body: unknown) {
  const { email, product_id, variant_id } = parse(bisSchema, body);
  const { error } = await db
    .from("back_in_stock_requests")
    .upsert(
      { email, product_id, variant_id: variant_id ?? null, is_active: true },
      { onConflict: "email,product_id" },
    );
  if (error) throw new Error(error.message);
  return { registered: true };
}

/* ─── Wishlists ──────────────────────────────────────────────────────────── */

const wishlistSchema = z.object({
  customer_email: z.string().email(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
  product_name: z.string(),
});

export async function addToWishlist(body: unknown) {
  const { customer_email, product_id, variant_id, product_name } = parse(wishlistSchema, body);
  const { error } = await db
    .from("wishlists")
    .upsert(
      { customer_email, product_id, variant_id: variant_id ?? null, product_name },
      { onConflict: "customer_email,product_id" },
    );
  if (error) throw new Error(error.message);
  return { added: true };
}

export async function removeFromWishlist(id: string) {
  const { error } = await db.from("wishlists").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { removed: true };
}

/* ─── Announcements ─────────────────────────────────────────────────────── */

export async function getActiveAnnouncements() {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("announcement_bars")
    .select("id, message, link_text, link_url, background_color, text_color, position")
    .eq("is_active", true)
    .or(`start_at.is.null,start_at.lte.${now}`)
    .or(`end_at.is.null,end_at.gte.${now}`)
    .order("position");
  if (error) throw new Error(error.message);
  return { announcements: data ?? [] };
}

/* ─── Navigation ────────────────────────────────────────────────────────── */

export async function getNavigation(location: string) {
  const { data, error } = await db
    .from("navigation_menus")
    .select("id, location, items")
    .eq("location", location)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return { navigation: data ?? null };
}

/* ─── FAQ ───────────────────────────────────────────────────────────────── */

export async function getFaqItems(url: URL) {
  const category = url.searchParams.get("category");
  const productId = url.searchParams.get("product_id");
  let q = db
    .from("faq_items")
    .select("id, question, answer, category, position")
    .eq("is_active", true)
    .order("category")
    .order("position");
  if (category) q = q.eq("category", category);
  if (productId) q = q.eq("product_id", productId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { faqs: data ?? [] };
}

/* ─── Reviews ───────────────────────────────────────────────────────────── */

export async function getReviews(url: URL) {
  const productId = url.searchParams.get("product_id");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  let q = db
    .from("reviews")
    .select(
      "id, product_id, customer_name, rating, title, body, is_verified_purchase, helpful_count, photos, created_at",
    )
    .in("status", ["approved", "featured"])
    .order("helpful_count", { ascending: false })
    .range(offset, offset + limit - 1);
  if (productId) q = q.eq("product_id", productId);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { reviews: data ?? [], total: count ?? 0 };
}

const reviewSchema = z.object({
  product_id: z.string().uuid(),
  customer_name: z.string().min(1),
  customer_email: z.string().email(),
  rating: z.number().int().min(1).max(5),
  title: z.string().optional(),
  body: z.string().min(10),
  order_id: z.string().uuid().optional(),
});

export async function submitReview(body: unknown) {
  const {
    product_id,
    customer_name,
    customer_email,
    rating,
    title,
    body: reviewBody,
    order_id,
  } = parse(reviewSchema, body);
  let isVerified = false;
  if (order_id) {
    const { data } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("id", order_id)
      .eq("customer_email", customer_email)
      .eq("payment_status", "paid")
      .single();
    isVerified = !!data;
  }
  const { data, error } = await db
    .from("reviews")
    .insert({
      product_id,
      customer_name,
      customer_email,
      rating,
      title: title ?? null,
      body: reviewBody,
      order_id: order_id ?? null,
      is_verified_purchase: isVerified,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, status: "pending", message: "Review submitted and awaiting approval" };
}

/* ─── Redirects ─────────────────────────────────────────────────────────── */

export async function resolveRedirect(url: URL) {
  const path = url.searchParams.get("path");
  if (!path) throw badRequest("path query parameter is required", []);
  const { data, error } = await db
    .from("redirects")
    .select("from_path, to_path, type, hit_count")
    .eq("from_path", path)
    .eq("is_active", true)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  if (data) {
    db.from("redirects")
      .update({ hit_count: data.hit_count + 1 })
      .eq("from_path", path)
      .then(() => {});
  }
  return {
    redirect: data ? { from_path: data.from_path, to_path: data.to_path, type: data.type } : null,
  };
}

/* ─── Product Drops ─────────────────────────────────────────────────────── */

export async function getActiveDrops() {
  const { data, error } = await db
    .from("product_drops")
    .select(
      "id, name, description, status, launch_at, end_at, purchase_limit_per_customer, is_early_access_only, products",
    )
    .eq("status", "active")
    .order("launch_at");
  if (error) throw new Error(error.message);
  return { drops: data ?? [] };
}

export async function getDrop(id: string) {
  const { data, error } = await db.from("product_drops").select("*").eq("id", id).single();
  if (error) {
    if (error.code === "PGRST116") throw notFound(`Drop ${id} not found`);
    throw new Error(error.message);
  }
  return { drop: data };
}

/* ─── Early Access ──────────────────────────────────────────────────────── */

const earlyAccessSchema = z.object({
  email: z.string().email(),
  drop_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  source: z.string().optional(),
});

export async function joinEarlyAccess(body: unknown) {
  const { email, drop_id, product_id, source } = parse(earlyAccessSchema, body);
  const { error } = await db.from("early_access_list").upsert(
    {
      email,
      drop_id: drop_id ?? null,
      product_id: product_id ?? null,
      source: source ?? "website",
    },
    { onConflict: "email,drop_id" },
  );
  if (error) throw new Error(error.message);
  return { registered: true };
}

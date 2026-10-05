/**
 * Server-only commerce engine: price recalculation, order creation, payment
 * session creation (Stripe, Razorpay, Slice) and webhook fulfilment. Prices
 * always come from the database — never from the client payload.
 */
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { LOG_EVENTS, logEvent } from "./logger.server";
import { createCheckoutSession, stripeRequest, type StripeEvent } from "./stripe.server";
import {
  createOrder as createRazorpayOrder,
  refundPayment as refundRazorpayPayment,
} from "./razorpay.server";
import {
  createOrder as createSliceOrder,
  refundPayment as refundSlicePayment,
} from "./slice.server";
import type { RazorpayEvent } from "./razorpay.server";
import type { SliceEvent } from "./slice.server";
import {
  orderConfirmationEmail,
  sendEmail,
  type LegalFooter,
  type OrderEmailData,
} from "./email.server";

export const paymentProviderSchema = z.enum(["stripe", "razorpay", "slice"]);
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

export const cartItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
  size: z.string().trim().max(20).optional(),
  color: z.string().trim().max(40).optional(),
});

export const addressSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  line1: z.string().trim().min(1).max(160),
  line2: z.string().trim().max(160).optional(),
  postal_code: z.string().trim().min(1).max(20),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().max(80).optional(),
  country: z.string().trim().min(2).max(2),
  phone: z.string().trim().max(40).optional(),
});

export const orderInputSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(50),
  email: z.string().trim().email().max(255),
  shipping_address: addressSchema,
  billing_address: addressSchema.optional(),
  discount_code: z.string().trim().max(40).optional(),
  newsletter_opt_in: z.boolean().optional(),
  gdpr_consent_text: z.string().trim().max(500).optional(),
});

export const checkoutSchema = orderInputSchema.extend({
  success_url: z.string().url().max(500),
  cancel_url: z.string().url().max(500),
  payment_provider: paymentProviderSchema.default("stripe"),
});

export type OrderInput = z.infer<typeof orderInputSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;

const round = (n: number) => Math.round(n * 100) / 100;

const descriptionOf = (l: { size: string | null; color: string | null }) =>
  [l.size, l.color].filter(Boolean).join(" · ");

export async function getStoreSettings() {
  const { data, error } = await supabaseAdmin
    .from("store_settings")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Store settings are not configured");
  return data;
}

export function legalFooter(settings: Awaited<ReturnType<typeof getStoreSettings>>): LegalFooter {
  return {
    legal_company_name: settings.legal_company_name,
    vat_id: settings.vat_id,
    support_email: settings.support_email,
    withdrawal_window_days: settings.withdrawal_window_days,
  };
}

/** Recalculate the whole basket from database prices, stock and discounts. */
export async function priceCart(input: OrderInput) {
  const settings = await getStoreSettings();

  const ids = [...new Set(input.items.map((i) => i.product_id))];
  const { data: products, error } = await supabaseAdmin
    .from("products")
    .select("id, name, code, price, stock, is_active, deleted_at, card_image")
    .in("id", ids);
  if (error) throw new Error(error.message);

  const lines = input.items.map((item) => {
    const product = products?.find((p) => p.id === item.product_id);
    if (!product || !product.is_active || product.deleted_at) {
      throw new Error(`Product ${item.product_id} is not available`);
    }
    if (product.stock < item.quantity) {
      throw new Error(`Not enough stock for ${product.name}`);
    }
    const unit_price = Number(product.price);
    return {
      product_id: product.id,
      product_code: product.code ?? "",
      product_name: product.name,
      product_image: product.card_image ?? null,
      quantity: item.quantity,
      size: item.size ?? null,
      color: item.color ?? null,
      unit_price,
      subtotal: round(unit_price * item.quantity),
    };
  });

  const subtotal = round(lines.reduce((sum, l) => sum + l.subtotal, 0));

  // Discount
  let discount_amount = 0;
  let discount_code: string | null = null;
  if (input.discount_code) {
    const { data: code } = await supabaseAdmin
      .from("discount_codes")
      .select("*")
      .ilike("code", input.discount_code)
      .is("deleted_at", null)
      .eq("is_active", true)
      .maybeSingle();
    const expired = code?.expires_at ? new Date(code.expires_at) < new Date() : false;
    const exhausted = code?.max_uses != null && code.uses_so_far >= code.max_uses;
    if (code && !expired && !exhausted && subtotal >= Number(code.min_order)) {
      discount_amount =
        code.type === "percent"
          ? round((subtotal * Number(code.value)) / 100)
          : Math.min(round(Number(code.value)), subtotal);
      discount_code = code.code;
    } else {
      throw new Error("Discount code is not valid for this order");
    }
  }

  const netAfterDiscount = round(subtotal - discount_amount);
  const threshold = settings.free_shipping_threshold;
  const shipping_cost =
    threshold != null && netAfterDiscount >= Number(threshold) ? 0 : Number(settings.shipping_cost);

  const total = round(netAfterDiscount + shipping_cost);
  // Prices are gross (VAT included), as required for EU consumer pricing.
  const rate = Number(settings.default_vat_rate);
  const vat_rate = rate > 1 ? rate : round(rate * 100);
  const vat_amount = round(total - total / (1 + vat_rate / 100));

  return {
    settings,
    lines,
    subtotal,
    discount_amount,
    discount_code,
    shipping_cost,
    vat_rate,
    vat_amount,
    total,
  };
}

/** Create a pending order + its line items from a freshly priced cart. */
export async function createOrderRecord(
  input: OrderInput,
  priced: Awaited<ReturnType<typeof priceCart>>,
  // "manual" is used by the plain POST /api/v1/orders endpoint (createOrder
  // in handlers.server.ts), which creates a pending order with no payment
  // session at all — distinct from the three real gateways, and never
  // reaches fulfilOrder/PAYMENT_REFERENCE_COLUMN since it has no checkout.
  paymentMethod: PaymentProvider | "manual" = "stripe",
) {
  const customer_name =
    `${input.shipping_address.first_name} ${input.shipping_address.last_name}`.trim();
  const now = new Date().toISOString();

  // Upsert customer record
  const { data: customer } = await supabaseAdmin
    .from("customers")
    .upsert(
      {
        email: input.email,
        first_name: input.shipping_address.first_name,
        last_name: input.shipping_address.last_name,
        phone: input.shipping_address.phone ?? null,
        newsletter_opt_in: input.newsletter_opt_in ?? false,
        gdpr_consent_at: now,
        gdpr_consent_text: input.gdpr_consent_text ?? "Checkout privacy policy accepted",
      },
      { onConflict: "email" },
    )
    .select("id")
    .maybeSingle();

  const { data: numberRow, error: numberError } = await supabaseAdmin.rpc("generate_order_number");
  if (numberError) throw new Error(numberError.message);

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .insert({
      order_number: numberRow as unknown as string,
      customer_id: customer?.id ?? null,
      customer_email: input.email,
      customer_name,
      customer_phone: input.shipping_address.phone ?? null,
      shipping_address: input.shipping_address,
      billing_address: input.billing_address ?? input.shipping_address,
      subtotal: priced.subtotal,
      discount_amount: priced.discount_amount,
      discount_code: priced.discount_code,
      shipping_cost: priced.shipping_cost,
      // orders.vat_rate is numeric(5,4) — stored as a fraction (0.19), not 19.
      vat_rate: round((priced.vat_rate / 100) * 10000) / 10000,
      vat_amount: priced.vat_amount,
      total: priced.total,
      currency: "EUR",
      status: "pending",
      payment_status: "pending",
      payment_method: paymentMethod,
      gdpr_consent_at: now,
      gdpr_consent_text: input.gdpr_consent_text ?? "Checkout privacy policy accepted",
    })
    .select("*")
    .single();
  if (orderError) throw new Error(orderError.message);

  const { error: itemsError } = await supabaseAdmin.from("order_items").insert(
    priced.lines.map((l) => ({
      order_id: order.id,
      product_id: l.product_id,
      product_code: l.product_code,
      product_name: l.product_name,
      product_image: l.product_image,
      quantity: l.quantity,
      size: l.size,
      color: l.color,
      unit_price: l.unit_price,
      subtotal: l.subtotal,
    })),
  );
  if (itemsError) throw new Error(itemsError.message);

  return order;
}

/** Create a pending order + its items, then open a payment session with the chosen provider. */
export async function startCheckout(input: CheckoutInput) {
  const priced = await priceCart(input);
  const { settings } = priced;
  const provider = input.payment_provider;
  const order = await createOrderRecord(input, priced, provider);

  const totals = {
    order_id: order.id,
    order_number: order.order_number,
    payment_provider: provider,
    subtotal: priced.subtotal,
    total: priced.total,
    currency: "EUR",
    vat_rate: priced.vat_rate,
    vat_amount: priced.vat_amount,
    shipping_cost: priced.shipping_cost,
    discount_amount: priced.discount_amount,
    support_email: settings.support_email,
  };

  if (provider === "razorpay") {
    const rpOrder = await createRazorpayOrder({
      amountCents: Math.round(priced.total * 100),
      currency: "EUR",
      receipt: order.order_number,
      notes: { order_id: order.id, order_number: order.order_number },
    });
    await supabaseAdmin.from("orders").update({ razorpay_order_id: rpOrder.id }).eq("id", order.id);
    return {
      ...totals,
      checkout_url: null,
      razorpay_order_id: rpOrder.id,
      razorpay_key_id: process.env["RAZORPAY_KEY_ID"] ?? "",
    };
  }

  if (provider === "slice") {
    const sliceOrder = await createSliceOrder({
      amountCents: Math.round(priced.total * 100),
      currency: "EUR",
      receipt: order.order_number,
      customerEmail: input.email,
      successUrl: input.success_url,
      cancelUrl: input.cancel_url,
      notes: { order_id: order.id, order_number: order.order_number },
    });
    await supabaseAdmin.from("orders").update({ slice_order_id: sliceOrder.id }).eq("id", order.id);
    return { ...totals, checkout_url: sliceOrder.checkout_url ?? null };
  }

  // Default: Stripe.
  const discountRatio =
    priced.subtotal > 0 ? (priced.subtotal - priced.discount_amount) / priced.subtotal : 1;

  const session = await createCheckoutSession({
    currency: "eur",
    customerEmail: input.email,
    successUrl: input.success_url,
    cancelUrl: input.cancel_url,
    metadata: { order_id: order.id, order_number: order.order_number },
    shippingCents: Math.round(priced.shipping_cost * 100),
    discountCents: Math.round(priced.discount_amount * 100),
    lineItems: priced.lines.map((l) => ({
      name: l.product_name,
      ...(descriptionOf(l) ? { description: descriptionOf(l) } : {}),
      quantity: l.quantity,
      // Discount is spread proportionally so the Stripe total matches ours.
      amountCents: Math.round(l.unit_price * discountRatio * 100),
    })),
  });

  await supabaseAdmin.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);

  return { ...totals, checkout_url: session.url };
}

/** Which order column stores a given provider's payment reference id. */
const PAYMENT_REFERENCE_COLUMN = {
  stripe: "payment_intent_id",
  razorpay: "razorpay_payment_id",
  slice: "slice_payment_id",
} as const satisfies Record<PaymentProvider, string>;

/** Mark an order paid, decrement stock, count discount use, send confirmation. */
export async function fulfilOrder(
  orderId: string,
  paymentReferenceId: string | null,
  provider: PaymentProvider = "stripe",
) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) throw new Error(`Order ${orderId} not found`);
  if (order.payment_status === "paid") return { alreadyProcessed: true };

  // Built as two steps rather than one object literal with a computed key:
  // TS treats a union-typed computed key in an object literal as a generic
  // index signature rather than expanding it per-key, which conflicts with
  // exactOptionalPropertyTypes on the generated Update type.
  const patch: Record<string, unknown> = { payment_status: "paid", status: "confirmed" };
  patch[PAYMENT_REFERENCE_COLUMN[provider]] = paymentReferenceId;
  await supabaseAdmin
    .from("orders")
    .update(patch as Database["public"]["Tables"]["orders"]["Update"])
    .eq("id", order.id);

  for (const item of order.order_items) {
    if (!item.product_id) continue;
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("stock")
      .eq("id", item.product_id)
      .maybeSingle();
    if (product) {
      await supabaseAdmin
        .from("products")
        .update({ stock: Math.max(0, product.stock - item.quantity) })
        .eq("id", item.product_id);
    }
  }

  if (order.discount_code) {
    const { data: code } = await supabaseAdmin
      .from("discount_codes")
      .select("id, uses_so_far")
      .eq("code", order.discount_code)
      .maybeSingle();
    if (code) {
      await supabaseAdmin
        .from("discount_codes")
        .update({ uses_so_far: code.uses_so_far + 1 })
        .eq("id", code.id);
    }
  }

  const settings = await getStoreSettings();
  const emailData: OrderEmailData = {
    order_number: order.order_number,
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    items: order.order_items.map((i) => ({
      product_name: i.product_name,
      quantity: i.quantity,
      subtotal: Number(i.subtotal),
    })),
    subtotal: Number(order.subtotal),
    shipping_cost: Number(order.shipping_cost),
    discount_amount: Number(order.discount_amount),
    vat_amount: Number(order.vat_amount),
    total: Number(order.total),
    currency: order.currency,
  };
  const mail = orderConfirmationEmail(emailData, legalFooter(settings));
  await sendEmail({ to: order.customer_email, ...mail });

  await logEvent(LOG_EVENTS.checkoutCompleted, {
    message: `Order ${order.order_number} paid`,
    orderId: order.id,
    context: { total: Number(order.total), provider, payment_reference_id: paymentReferenceId },
  });

  return { alreadyProcessed: false };
}

export async function markPaymentFailed(orderId: string) {
  await logEvent(LOG_EVENTS.paymentFailed, {
    level: "warn",
    message: "Payment failed or session expired",
    orderId,
  });
  await supabaseAdmin
    .from("orders")
    .update({
      payment_status: "failed",
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", orderId);
}

export async function markRefunded(
  paymentReferenceId: string,
  provider: PaymentProvider = "stripe",
) {
  await logEvent(LOG_EVENTS.refund, {
    message: `${provider} reported a refund`,
    context: { provider, payment_reference_id: paymentReferenceId },
  });
  await supabaseAdmin
    .from("orders")
    .update({ payment_status: "refunded" })
    .eq(PAYMENT_REFERENCE_COLUMN[provider], paymentReferenceId);
}

/** Route a verified Stripe event to the right fulfilment action. */
export async function handleStripeEvent(event: StripeEvent) {
  const object = event.data.object as Record<string, unknown>;
  const metadata = (object["metadata"] ?? {}) as Record<string, string>;

  switch (event.type) {
    case "checkout.session.completed": {
      const orderId = metadata["order_id"];
      if (!orderId) return { handled: false };
      const paymentIntent =
        typeof object["payment_intent"] === "string" ? (object["payment_intent"] as string) : null;
      await fulfilOrder(orderId, paymentIntent, "stripe");
      return { handled: true };
    }
    case "checkout.session.expired":
    case "payment_intent.payment_failed": {
      const orderId = metadata["order_id"];
      if (orderId) await markPaymentFailed(orderId);
      return { handled: Boolean(orderId) };
    }
    case "charge.refunded": {
      const paymentIntent =
        typeof object["payment_intent"] === "string" ? (object["payment_intent"] as string) : null;
      if (paymentIntent) await markRefunded(paymentIntent, "stripe");
      return { handled: Boolean(paymentIntent) };
    }
    default:
      return { handled: false };
  }
}

/** Route a verified Razorpay event to the right fulfilment action. */
export async function handleRazorpayEvent(event: RazorpayEvent) {
  switch (event.event) {
    case "payment.captured": {
      const payment = event.payload.payment?.entity;
      const notes = (payment?.["notes"] ?? {}) as Record<string, string>;
      const orderId = notes["order_id"];
      const paymentId = typeof payment?.["id"] === "string" ? (payment["id"] as string) : null;
      if (!orderId) return { handled: false };
      await fulfilOrder(orderId, paymentId, "razorpay");
      return { handled: true };
    }
    case "payment.failed": {
      const payment = event.payload.payment?.entity;
      const notes = (payment?.["notes"] ?? {}) as Record<string, string>;
      const orderId = notes["order_id"];
      if (orderId) await markPaymentFailed(orderId);
      return { handled: Boolean(orderId) };
    }
    case "refund.processed": {
      const refund = event.payload.refund?.entity;
      const paymentId =
        typeof refund?.["payment_id"] === "string" ? (refund["payment_id"] as string) : null;
      if (paymentId) await markRefunded(paymentId, "razorpay");
      return { handled: Boolean(paymentId) };
    }
    default:
      return { handled: false };
  }
}

/** Route a verified Slice event to the right fulfilment action (see slice.server.ts's ASSUMPTION note). */
export async function handleSliceEvent(event: SliceEvent) {
  const data = event.data;
  const orderId = typeof data["order_id"] === "string" ? (data["order_id"] as string) : undefined;
  const paymentId = typeof data["payment_id"] === "string" ? (data["payment_id"] as string) : null;

  switch (event.event) {
    case "payment.completed":
    case "payment.captured": {
      if (!orderId) return { handled: false };
      await fulfilOrder(orderId, paymentId, "slice");
      return { handled: true };
    }
    case "payment.failed": {
      if (orderId) await markPaymentFailed(orderId);
      return { handled: Boolean(orderId) };
    }
    case "refund.processed": {
      if (paymentId) await markRefunded(paymentId, "slice");
      return { handled: Boolean(paymentId) };
    }
    default:
      return { handled: false };
  }
}

/** Issue a refund for an order through whichever provider it was paid with. */
export async function refundOrder(orderId: string, amount?: number) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("payment_method, payment_intent_id, razorpay_payment_id, slice_payment_id, total")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("Order not found");

  const provider = (order.payment_method as PaymentProvider | null) ?? "stripe";
  const amountCents = Math.round((amount ?? Number(order.total)) * 100);

  if (provider === "razorpay") {
    if (!order.razorpay_payment_id) throw new Error("This order has no Razorpay payment to refund");
    await refundRazorpayPayment(order.razorpay_payment_id, amountCents);
  } else if (provider === "slice") {
    if (!order.slice_payment_id) throw new Error("This order has no Slice payment to refund");
    await refundSlicePayment(order.slice_payment_id, amountCents);
  } else {
    if (!order.payment_intent_id) throw new Error("This order has no Stripe payment to refund");
    await stripeRequest("/refunds", {
      payment_intent: order.payment_intent_id,
      amount: amountCents,
    });
  }

  await supabaseAdmin.from("orders").update({ payment_status: "refunded" }).eq("id", orderId);
  await logEvent(LOG_EVENTS.refund, {
    message: "Refund issued from the admin panel",
    orderId,
    context: { provider, amount: amount ?? Number(order.total) },
  });
  return { ok: true };
}

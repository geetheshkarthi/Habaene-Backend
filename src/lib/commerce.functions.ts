import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orderIdSchema = z.object({ orderId: z.string().uuid() });

type AdminCheckClient = { rpc: (fn: "is_admin") => PromiseLike<{ data: unknown }> };

async function assertAdmin(supabase: AdminCheckClient) {
  const { data } = await supabase.rpc("is_admin");
  if (data !== true) throw new Error("Forbidden");
}

/** Refund a paid order through Stripe (admin only). */
export const refundOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    orderIdSchema.extend({ amount: z.number().positive().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { refundOrder } = await import("./checkout.server");
    return refundOrder(data.orderId, data.amount);
  });

/** Re-send the order confirmation email (admin only). */
export const resendOrderConfirmationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getStoreSettings, legalFooter } = await import("./checkout.server");
    const { orderConfirmationEmail, sendEmail } = await import("./email.server");

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Order not found");

    const settings = await getStoreSettings();
    const mail = orderConfirmationEmail(
      {
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
      },
      legalFooter(settings),
    );
    return sendEmail({ to: order.customer_email, ...mail });
  });

/** Create a shipment via DHL or Delhivery and store the tracking number (admin only). */
export const createShipmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    orderIdSchema.extend({ carrier: z.enum(["dhl", "delhivery"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("order_number, shipping_address, total, currency, order_items(quantity, product_id)")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Order not found");

    const address = order.shipping_address as {
      first_name: string;
      last_name: string;
      line1: string;
      line2?: string;
      postal_code: string;
      city: string;
      state?: string;
      country: string;
      phone?: string;
    };

    // Weight isn't stored per line item on the order, so sum from the live
    // product records — good enough for a shipment estimate.
    const productIds = order.order_items.map((i) => i.product_id).filter((id): id is string => !!id);
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, weight_kg")
      .in("id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]);
    const weightKg = order.order_items.reduce((sum, item) => {
      const product = products?.find((p) => p.id === item.product_id);
      return sum + (Number(product?.weight_kg ?? 0) || 0.5) * item.quantity;
    }, 0);

    const shipmentParams = {
      shipTo: address,
      weightKg: Math.max(weightKg, 0.1),
      orderNumber: order.order_number,
      declaredValue: Number(order.total),
    };

    const result =
      data.carrier === "dhl"
        ? await (await import("./dhl.server")).createShipment({ ...shipmentParams, currency: order.currency })
        : await (await import("./delhivery.server")).createShipment(shipmentParams);

    await supabaseAdmin
      .from("orders")
      .update({
        shipping_carrier: data.carrier === "dhl" ? "DHL" : "Delhivery",
        tracking_number: result.trackingNumber,
        carrier_shipment_id: result.carrierShipmentId,
      })
      .eq("id", data.orderId);

    return result;
  });

/** Notify the customer that their order has shipped (admin only). */
export const sendShippingNotificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getStoreSettings, legalFooter } = await import("./checkout.server");
    const { shippingNotificationEmail, sendEmail } = await import("./email.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("order_number, customer_name, customer_email, tracking_number, shipping_carrier")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Order not found");

    const settings = await getStoreSettings();
    const mail = shippingNotificationEmail(order, legalFooter(settings));
    return sendEmail({ to: order.customer_email, ...mail });
  });

/** Send a free-form message to one or more customers (admin only). */
export const sendCustomerMessageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        customerIds: z.array(z.string().uuid()).min(1),
        subject: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getStoreSettings, legalFooter } = await import("./checkout.server");
    const { customerMessageEmail, sendEmail } = await import("./email.server");

    const { data: customers, error } = await supabaseAdmin
      .from("customers")
      .select("id, email")
      .in("id", data.customerIds)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    if (!customers?.length) throw new Error("No matching customers");

    const settings = await getStoreSettings();
    const mail = customerMessageEmail({ subject: data.subject, body: data.body }, legalFooter(settings));

    const results = await Promise.allSettled(
      customers.map((c) => sendEmail({ to: c.email, ...mail })),
    );
    const sent = results.filter((r) => r.status === "fulfilled" && r.value.sent).length;
    return { sent, total: customers.length };
  });

/** Notify the customer about a return status change (admin only). */
export const sendReturnUpdateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ returnId: z.string().uuid(), message: z.string().trim().max(2000).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getStoreSettings, legalFooter } = await import("./checkout.server");
    const { returnStatusEmail, sendEmail } = await import("./email.server");

    const { data: ret } = await supabaseAdmin
      .from("returns")
      .select("order_number, customer_email, status")
      .eq("id", data.returnId)
      .maybeSingle();
    if (!ret) throw new Error("Return not found");

    const settings = await getStoreSettings();
    const mail = returnStatusEmail(
      {
        order_number: ret.order_number ?? "—",
        customer_name: ret.customer_email,
        status: ret.status,
        ...(data.message ? { message: data.message } : {}),
      },
      legalFooter(settings),
    );
    return sendEmail({ to: ret.customer_email, ...mail });
  });

/**
 * Transactional email delivery via Resend (REST, edge-safe).
 * When RESEND_API_KEY is absent the message is logged instead of sent, so the
 * whole checkout flow still works before the key is provisioned.
 */

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendArgs): Promise<{ sent: boolean }> {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["EMAIL_FROM"] ?? "Habané <onboarding@resend.dev>";

  const { LOG_EVENTS, logEvent } = await import("./logger.server");

  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY missing — skipped "${subject}" to ${to}`);
    await logEvent(LOG_EVENTS.emailSent, {
      level: "warn",
      message: `Skipped "${subject}" — RESEND_API_KEY missing`,
      context: { to, subject, delivered: false },
    });
    return { sent: false };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error(`[email] Resend error ${res.status}: ${detail}`);
    await logEvent(LOG_EVENTS.emailSent, {
      level: "error",
      message: `Resend rejected "${subject}"`,
      context: { to, subject, status: res.status, delivered: false },
    });
    throw new Error("Email delivery failed");
  }
  await logEvent(LOG_EVENTS.emailSent, {
    message: `Sent "${subject}"`,
    context: { to, subject, delivered: true },
  });
  return { sent: true };
}

const eur = (value: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);

function layout(title: string, body: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Georgia,'Times New Roman',serif;color:#1c1b18">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <h1 style="font-size:22px;font-weight:400;letter-spacing:.04em;margin:0 0 24px">${title}</h1>
    ${body}
    <hr style="border:none;border-top:1px solid #ddd7cb;margin:32px 0" />
    <p style="font-size:12px;color:#6b675e;line-height:1.6;margin:0">${footer}</p>
  </div></body></html>`;
}

export interface OrderEmailItem {
  product_name: string;
  quantity: number;
  subtotal: number;
}

export interface OrderEmailData {
  order_number: string;
  customer_name: string;
  customer_email: string;
  items: OrderEmailItem[];
  subtotal: number;
  shipping_cost: number;
  discount_amount: number;
  vat_amount: number;
  total: number;
  currency: string;
}

export interface LegalFooter {
  legal_company_name: string;
  vat_id: string;
  support_email: string;
  withdrawal_window_days: number;
}

function itemsTable(items: OrderEmailItem[]): string {
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${i.quantity} × ${i.product_name}</td><td style="padding:6px 0;text-align:right">${eur(i.subtotal)}</td></tr>`,
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`;
}

function totals(o: OrderEmailData): string {
  const line = (label: string, value: string) =>
    `<tr><td style="padding:4px 0">${label}</td><td style="padding:4px 0;text-align:right">${value}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px">
    ${line("Subtotal", eur(o.subtotal))}
    ${o.discount_amount > 0 ? line("Discount", `-${eur(o.discount_amount)}`) : ""}
    ${line("Shipping", o.shipping_cost > 0 ? eur(o.shipping_cost) : "Free")}
    ${line("Incl. VAT", eur(o.vat_amount))}
    ${line("<strong>Total</strong>", `<strong>${eur(o.total)}</strong>`)}
  </table>`;
}

export function orderConfirmationEmail(o: OrderEmailData, legal: LegalFooter) {
  return {
    subject: `Order ${o.order_number} confirmed`,
    html: layout(
      "Thank you for your order",
      `<p style="font-size:14px;line-height:1.7">Dear ${o.customer_name}, we have received your payment for order <strong>${o.order_number}</strong>.</p>
       ${itemsTable(o.items)}${totals(o)}`,
      `${legal.legal_company_name} · VAT ID ${legal.vat_id} · ${legal.support_email}<br/>
       You may withdraw from this contract within ${legal.withdrawal_window_days} days of receiving the goods, without giving reasons.`,
    ),
  };
}

export function shippingNotificationEmail(
  o: { order_number: string; customer_name: string; tracking_number?: string | null; shipping_carrier?: string | null },
  legal: LegalFooter,
) {
  const tracking = o.tracking_number
    ? `<p style="font-size:14px">Carrier: ${o.shipping_carrier ?? "—"}<br/>Tracking number: <strong>${o.tracking_number}</strong></p>`
    : "";
  return {
    subject: `Order ${o.order_number} has shipped`,
    html: layout(
      "Your order is on its way",
      `<p style="font-size:14px;line-height:1.7">Dear ${o.customer_name}, order <strong>${o.order_number}</strong> has left our workshop.</p>${tracking}`,
      `${legal.legal_company_name} · ${legal.support_email}`,
    ),
  };
}

export function returnStatusEmail(
  r: { order_number: string; customer_name: string; status: string; message?: string },
  legal: LegalFooter,
) {
  return {
    subject: `Return update for order ${r.order_number}`,
    html: layout(
      "Return update",
      `<p style="font-size:14px;line-height:1.7">Dear ${r.customer_name}, the return linked to order <strong>${r.order_number}</strong> is now <strong>${r.status.replace(/_/g, " ")}</strong>.</p>` +
        (r.message
          ? `<p style="font-size:14px;line-height:1.7">${r.message.replace(/\n/g, "<br/>")}</p>`
          : ""),
      `${legal.legal_company_name} · ${legal.support_email}`,
    ),
  };
}

/** Free-form message an admin sends from the Customers page (individually or in bulk). */
export function customerMessageEmail(
  msg: { subject: string; body: string },
  legal: LegalFooter,
) {
  return {
    subject: msg.subject,
    html: layout(
      msg.subject,
      `<p style="font-size:14px;line-height:1.7;white-space:pre-wrap">${msg.body}</p>`,
      `${legal.legal_company_name} · ${legal.support_email}`,
    ),
  };
}

export function newsletterWelcomeEmail(email: string, legal: LegalFooter) {
  return {
    subject: "Welcome to the Habané list",
    html: layout(
      "You're on the list",
      `<p style="font-size:14px;line-height:1.7">Thank you for subscribing with ${email}. You will hear from us only when there is something worth saying.</p>`,
      `${legal.legal_company_name} · ${legal.support_email}<br/>You can unsubscribe at any time by replying to this email.`,
    ),
  };
}

export function contactFormEmail(msg: { name: string; email: string; subject?: string; message: string }) {
  return {
    subject: `New Contact Request: ${msg.subject ?? "General Inquiry"}`,
    html: layout(
      "New Contact Form Submission",
      `<p style="font-size:14px;line-height:1.7"><strong>Name:</strong> ${msg.name}<br/>
       <strong>Email:</strong> ${msg.email}<br/>
       <strong>Subject:</strong> ${msg.subject ?? "—"}</p>
       <p style="font-size:14px;line-height:1.7;white-space:pre-wrap;"><strong>Message:</strong><br/>${msg.message}</p>`,
      `This is an automated notification from your Habané contact form.`,
    ),
  };
}

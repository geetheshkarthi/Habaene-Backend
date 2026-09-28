/**
 * Centralised structured logging. Every notable system event goes through
 * `logEvent`: it prints one JSON line to the server log and persists a row in
 * `public.event_logs` (admin-readable) so the panel can audit activity.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const LOG_EVENTS = {
  checkoutStarted: "checkout_started",
  checkoutCompleted: "checkout_completed",
  paymentFailed: "payment_failed",
  refund: "refund",
  orderCreated: "order_created",
  orderUpdated: "order_updated",
  productUpdated: "product_updated",
  adminLogin: "admin_login",
  failedLogin: "failed_login",
  emailSent: "email_sent",
  webhookReceived: "webhook_received",
  apiError: "api_error",
} as const;

export type LogEvent = (typeof LOG_EVENTS)[keyof typeof LOG_EVENTS];
export type LogLevel = "info" | "warn" | "error";

export interface LogPayload {
  level?: LogLevel;
  message?: string;
  context?: Record<string, unknown>;
  orderId?: string | null;
  actor?: string | null;
  requestId?: string | null;
}

function redact(context: Record<string, unknown> = {}): Record<string, unknown> {
  const secretish = /(secret|token|password|apikey|api_key|authorization)/i;
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) =>
      secretish.test(key) ? [key, "[redacted]"] : [key, value],
    ),
  );
}

/** Never throws — logging must not break a request. */
export async function logEvent(event: LogEvent | string, payload: LogPayload = {}): Promise<void> {
  const resolvedLevel: LogLevel = payload.level ?? "info";
  const context = redact(payload.context);

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    level: resolvedLevel,
    message: payload.message ?? null,
    order_id: payload.orderId ?? null,
    actor: payload.actor ?? null,
    request_id: payload.requestId ?? null,
    context,
  });
  if (resolvedLevel === "error") console.error(line);
  else if (resolvedLevel === "warn") console.warn(line);
  else console.log(line);

  try {
    await supabaseAdmin.from("event_logs").insert({
      event,
      level: resolvedLevel,
      message: payload.message ?? null,
      context: context as never,
      order_id: payload.orderId ?? null,
      actor: payload.actor ?? null,
      request_id: payload.requestId ?? null,
    });
  } catch (error) {
    console.error("[logger] failed to persist event", event, error);
  }
}

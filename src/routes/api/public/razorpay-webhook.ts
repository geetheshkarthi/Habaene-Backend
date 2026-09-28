import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyWebhook, RazorpayNotConfiguredError } = await import("@/lib/razorpay.server");
        const { handleRazorpayEvent } = await import("@/lib/checkout.server");

        // Raw body is required for signature verification — never parse first.
        const rawBody = await request.text();

        let event;
        try {
          event = await verifyWebhook(rawBody, request.headers.get("x-razorpay-signature"));
        } catch (error) {
          if (error instanceof RazorpayNotConfiguredError) {
            console.error(error.message);
            return new Response("Webhook secret not configured", { status: 503 });
          }
          console.error("[razorpay-webhook] verification failed", error);
          return new Response("Invalid signature", { status: 401 });
        }

        const { LOG_EVENTS, logEvent } = await import("@/lib/logger.server");
        await logEvent(LOG_EVENTS.webhookReceived, {
          message: `Razorpay event ${event.event}`,
          context: { event_id: event.id, type: event.event },
        });

        try {
          const result = await handleRazorpayEvent(event);
          return Response.json({ received: true, ...result });
        } catch (error) {
          console.error(`[razorpay-webhook] ${event.event} failed`, error);
          await logEvent(LOG_EVENTS.webhookReceived, {
            level: "error",
            message: `Razorpay event ${event.event} failed`,
            context: { event_id: event.id, error: String(error) },
          });
          // 500 makes Razorpay retry the delivery.
          return new Response("Handler error", { status: 500 });
        }
      },
    },
  },
});

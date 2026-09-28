import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyWebhook, StripeNotConfiguredError } = await import("@/lib/stripe.server");
        const { handleStripeEvent } = await import("@/lib/checkout.server");

        // Raw body is required for signature verification — never parse first.
        const rawBody = await request.text();

        let event;
        try {
          event = await verifyWebhook(rawBody, request.headers.get("stripe-signature"));
        } catch (error) {
          if (error instanceof StripeNotConfiguredError) {
            console.error(error.message);
            return new Response("Webhook secret not configured", { status: 503 });
          }
          console.error("[stripe-webhook] verification failed", error);
          return new Response("Invalid signature", { status: 401 });
        }

        const { LOG_EVENTS, logEvent } = await import("@/lib/logger.server");
        await logEvent(LOG_EVENTS.webhookReceived, {
          message: `Stripe event ${event.type}`,
          context: { event_id: event.id, type: event.type },
        });

        try {
          const result = await handleStripeEvent(event);
          return Response.json({ received: true, ...result });
        } catch (error) {
          console.error(`[stripe-webhook] ${event.type} failed`, error);
          await logEvent(LOG_EVENTS.webhookReceived, {
            level: "error",
            message: `Stripe event ${event.type} failed`,
            context: { event_id: event.id, error: String(error) },
          });
          // 500 makes Stripe retry the delivery.
          return new Response("Handler error", { status: 500 });
        }
      },
    },
  },
});

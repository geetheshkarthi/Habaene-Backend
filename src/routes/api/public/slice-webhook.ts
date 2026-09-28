import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/slice-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyWebhook, SliceNotConfiguredError } = await import("@/lib/slice.server");
        const { handleSliceEvent } = await import("@/lib/checkout.server");

        // Raw body is required for signature verification — never parse first.
        const rawBody = await request.text();

        let event;
        try {
          event = await verifyWebhook(rawBody, request.headers.get("x-slice-signature"));
        } catch (error) {
          if (error instanceof SliceNotConfiguredError) {
            console.error(error.message);
            return new Response("Webhook secret not configured", { status: 503 });
          }
          console.error("[slice-webhook] verification failed", error);
          return new Response("Invalid signature", { status: 401 });
        }

        const { LOG_EVENTS, logEvent } = await import("@/lib/logger.server");
        await logEvent(LOG_EVENTS.webhookReceived, {
          message: `Slice event ${event.event}`,
          context: { event_id: event.id, type: event.event },
        });

        try {
          const result = await handleSliceEvent(event);
          return Response.json({ received: true, ...result });
        } catch (error) {
          console.error(`[slice-webhook] ${event.event} failed`, error);
          await logEvent(LOG_EVENTS.webhookReceived, {
            level: "error",
            message: `Slice event ${event.event} failed`,
            context: { event_id: event.id, error: String(error) },
          });
          // 500 makes Slice retry the delivery.
          return new Response("Handler error", { status: 500 });
        }
      },
    },
  },
});

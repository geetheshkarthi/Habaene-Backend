import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

export const Route = createFileRoute("/api/public/checkout")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { checkoutSchema, startCheckout } = await import("@/lib/checkout.server");
        const { StripeNotConfiguredError } = await import("@/lib/stripe.server");
        const { RazorpayNotConfiguredError } = await import("@/lib/razorpay.server");
        const { SliceNotConfiguredError } = await import("@/lib/slice.server");

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const parsed = checkoutSchema.safeParse(payload);
        if (!parsed.success) {
          return json({ error: "Invalid checkout payload", issues: parsed.error.issues }, 400);
        }

        try {
          return json(await startCheckout(parsed.data));
        } catch (error) {
          if (
            error instanceof StripeNotConfiguredError ||
            error instanceof RazorpayNotConfiguredError ||
            error instanceof SliceNotConfiguredError
          ) {
            console.error(error.message);
            return json({ error: "Payments are not configured yet" }, 503);
          }
          const message = error instanceof Error ? error.message : "Checkout failed";
          console.error("[checkout]", message);
          return json({ error: message }, 400);
        }
      },
    },
  },
});

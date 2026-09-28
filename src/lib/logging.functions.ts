import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Client-callable audit hook for the two events that only the browser can see.
 * Only these event names are accepted, and the payload is bounded.
 */
const schema = z.object({
  event: z.enum(["admin_login", "failed_login"]),
  email: z.string().trim().email().max(255).optional(),
  reason: z.string().trim().max(200).optional(),
});

export const logAuthEventFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    const { logEvent } = await import("./logger.server");
    await logEvent(data.event, {
      level: data.event === "failed_login" ? "warn" : "info",
      message: data.event === "admin_login" ? "Admin signed in" : "Admin sign-in failed",
      actor: data.email ?? null,
      context: data.reason ? { reason: data.reason } : {},
    });
    return { logged: true };
  });

/**
 * Tiny path router shared by `/api/v1/*` and its auth-exempt mirror
 * `/api/public/v1/*`. Every response uses the standard envelope.
 */
import { LOG_EVENTS, logEvent } from "@/lib/logger.server";
import * as h from "./handlers.server";
import { fail, HttpError, ok, preflight } from "./response";

async function body(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "validation_error", "Request body is not valid JSON");
  }
}

/** `path` is the part after the version prefix, e.g. "products/atlas-40". */
export async function dispatch(request: Request, path: string): Promise<Response> {
  if (request.method === "OPTIONS") return preflight();

  const url = new URL(request.url);
  const segments = path.split("/").filter(Boolean);
  const [root, second] = segments;
  const method = request.method.toUpperCase();

  try {
    switch (root) {
      case undefined:
      case "":
        return ok({ api_version: "v1", docs: "/openapi.json" });

      case "health":
        if (method !== "GET") return methodNotAllowed(method);
        return ok(await h.healthCheck());

      case "system":
        if (method !== "GET") return methodNotAllowed(method);
        if (second === "check") return ok(await h.systemCheck());
        return fail(404, "not_found", `Unknown endpoint /system/${second ?? ""}`);


      case "store":
        if (method !== "GET") return methodNotAllowed(method);
        return ok(await h.getPublicStore());

      case "products":
        if (method !== "GET") return methodNotAllowed(method);
        return second ? ok(await h.getProductBySlug(second)) : ok(await h.listProducts(url));

      case "orders":
        if (method === "POST" && !second) return ok(await h.createOrder(await body(request)), 201);
        if (method === "GET" && second) return ok(await h.getOrder(second, url));
        return methodNotAllowed(method);

      case "checkout":
        if (method !== "POST") return methodNotAllowed(method);
        return ok(await h.createCheckout(await body(request)), 201);

      case "returns":
        if (method === "POST" && !second) return ok(await h.createReturn(await body(request)), 201);
        if (method === "GET" && second) return ok(await h.getReturn(second, url));
        return methodNotAllowed(method);

      case "newsletter": {
        if (method !== "POST") return methodNotAllowed(method);
        if (second === "unsubscribe") return ok(await h.unsubscribeNewsletter(await body(request)));
        if (second === "subscribe" || !second) {
          return ok(await h.subscribeNewsletter(await body(request), request), 201);
        }
        return fail(404, "not_found", `Unknown endpoint /newsletter/${second}`);
      }

      case "contact":
        if (method !== "POST") return methodNotAllowed(method);
        return ok(await h.submitContact(await body(request)), 201);

      case "discounts":
        if (method === "POST" && second === "validate") {
          return ok(await h.validateDiscount(await body(request)));
        }
        return fail(404, "not_found", "Unknown discounts endpoint");

      case "track": {
        // Storefront tracking: cart events, product views, searches
        if (method !== "POST") return methodNotAllowed(method);
        const trackBody = await body(request) as Record<string, unknown>;
        if (second === "cart") return ok(await h.trackCartEvent(trackBody));
        if (second === "view") return ok(await h.trackProductView(trackBody));
        if (second === "search") return ok(await h.trackSearch(trackBody));
        return fail(404, "not_found", `Unknown track endpoint /track/${second}`);
      }

      case "back-in-stock": {
        if (method === "POST" && !second) return ok(await h.registerBackInStock(await body(request)), 201);
        return fail(404, "not_found", "Unknown back-in-stock endpoint");
      }

      case "wishlist": {
        if (method === "POST" && !second) return ok(await h.addToWishlist(await body(request)), 201);
        if (method === "DELETE" && second) return ok(await h.removeFromWishlist(second));
        return fail(404, "not_found", "Unknown wishlist endpoint");
      }

      case "announcements": {
        if (method !== "GET") return methodNotAllowed(method);
        return ok(await h.getActiveAnnouncements());
      }

      case "navigation": {
        if (method !== "GET") return methodNotAllowed(method);
        return ok(await h.getNavigation(second ?? "header"));
      }

      case "faq": {
        if (method !== "GET") return methodNotAllowed(method);
        return ok(await h.getFaqItems(url));
      }

      case "reviews": {
        if (method === "GET") return ok(await h.getReviews(url));
        if (method === "POST" && !second) return ok(await h.submitReview(await body(request)), 201);
        return methodNotAllowed(method);
      }

      case "redirects": {
        if (method !== "GET") return methodNotAllowed(method);
        return ok(await h.resolveRedirect(url));
      }

      case "drops": {
        if (method !== "GET") return methodNotAllowed(method);
        return second ? ok(await h.getDrop(second)) : ok(await h.getActiveDrops());
      }

      case "early-access": {
        if (method !== "POST") return methodNotAllowed(method);
        return ok(await h.joinEarlyAccess(await body(request)), 201);
      }

      default:
        return fail(404, "not_found", `Unknown endpoint /${path}`);
    }
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status >= 500) {
        await logEvent(LOG_EVENTS.apiError, {
          level: "error",
          message: error.message,
          context: { path, method, status: error.status },
        });
      }
      return fail(error.status, error.code, error.message, error.details);
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    await logEvent(LOG_EVENTS.apiError, {
      level: "error",
      message,
      context: { path, method },
    });
    return fail(500, "internal_error", "Something went wrong handling this request");
  }
}

function methodNotAllowed(method: string): Response {
  return fail(405, "method_not_allowed", `${method} is not allowed on this endpoint`);
}

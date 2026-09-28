// Auth-exempt mirror of /api/v1/* — identical behaviour, guaranteed reachable
// from external callers on the published site.
import { createFileRoute } from "@tanstack/react-router";

const handler = async ({ request, params }: { request: Request; params: { _splat?: string } }) => {
  const { dispatch } = await import("@/lib/api-v1/router.server");
  return dispatch(request, params._splat ?? "");
};

export const Route = createFileRoute("/api/public/v1/$")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
      PUT: handler,
      PATCH: handler,
      DELETE: handler,
      OPTIONS: handler,
    },
  },
});

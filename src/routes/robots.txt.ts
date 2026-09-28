import { createFileRoute } from "@tanstack/react-router";

const handler = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const text = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400",
    },
  });
};

export const Route = createFileRoute("/robots/txt")({
  server: {
    handlers: {
      GET: handler,
    },
  },
});

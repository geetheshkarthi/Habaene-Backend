import { createFileRoute } from "@tanstack/react-router";
import { generateSitemapEntries } from "@/lib/api/seo";

const handler = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const entries = await generateSitemapEntries(baseUrl);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${entries
    .map(
      (entry) => `
    <url>
      <loc>${entry.loc}</loc>
      ${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ""}
      ${entry.changefreq ? `<changefreq>${entry.changefreq}</changefreq>` : ""}
      ${entry.priority ? `<priority>${entry.priority.toFixed(1)}</priority>` : ""}
    </url>
  `
    )
    .join("")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
};

export const Route = createFileRoute("/sitemap/xml")({
  server: {
    handlers: {
      GET: handler,
    },
  },
});

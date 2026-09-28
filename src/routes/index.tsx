import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
  head: () => ({
    meta: [
      { title: "HABÄNE Admin" },
      { name: "description", content: "Operations console for the HABÄNE store." },
      { property: "og:title", content: "HABÄNE Admin" },
      { property: "og:description", content: "Operations console for the HABÄNE store." },
    ],
  }),
  component: () => null,
});

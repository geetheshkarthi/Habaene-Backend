// Plain Vite + TanStack Start config (replaces the Lovable-editor-only
// @lovable.dev/vite-tanstack-config preset, which isn't available outside
// Lovable's platform). No nitro `preset` is set on purpose — Nitro
// auto-detects the target host (Vercel, Netlify, Cloudflare, Node, etc.) from
// the deploy environment; set `NITRO_PRESET` explicitly only if auto-detection
// picks the wrong one for your host.
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    viteReact(),
  ],
});

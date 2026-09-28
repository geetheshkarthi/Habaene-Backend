// Plain Vite + TanStack Start config (replaces the Lovable-editor-only
// @lovable.dev/vite-tanstack-config preset, which isn't available outside
// Lovable's platform). Targets Cloudflare Workers explicitly via the
// `cloudflare_module` Nitro preset — see wrangler.jsonc for the Worker
// config `npm run build` outputs into `.output/`. Override with
// NITRO_PRESET if you ever deploy this elsewhere instead.
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
      server: {
        entry: "server",
        preset: process.env["NITRO_PRESET"] || "cloudflare_module",
      },
    }),
    viteReact(),
  ],
});

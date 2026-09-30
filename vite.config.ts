// Plain Vite + TanStack Start config (replaces the Lovable-editor-only
// @lovable.dev/vite-tanstack-config preset, which isn't available outside
// Lovable's platform). This version of @tanstack/react-start has no
// Nitro-preset system (checked node_modules' schema.d.ts directly — no
// "preset"/"cloudflare"/"nitro" key exists), so Cloudflare Workers support
// comes from Cloudflare's own official `@cloudflare/vite-plugin`, which
// reads wrangler.jsonc and handles the Workers-target build itself.
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    viteReact(),
  ],
});

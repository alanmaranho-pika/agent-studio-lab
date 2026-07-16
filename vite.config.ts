import { fileURLToPath } from "node:url";
// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: [
        // pkce-challenge's package.json exports lack a default condition for
        // the Cloudflare Worker/edge build target; alias to its node ESM entry.
        {
          find: "pkce-challenge",
          replacement: fileURLToPath(
            new URL(
              "./node_modules/pkce-challenge/dist/index.node.js",
              import.meta.url,
            ),
          ),
        },
      ],
    },
  },
});

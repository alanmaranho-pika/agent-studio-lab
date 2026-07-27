import { fileURLToPath } from "node:url";
// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const VERCEL_BLOB_CLIENT_STUB = "\0virtual:vercel-blob-server-only";
const VERCEL_OIDC_STUB = "\0virtual:vercel-oidc-disabled";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
        name: "vercel-blob-server-only",
        enforce: "pre",
        resolveId(source, _importer, options) {
          if (source === "@vercel/blob" && !options.ssr) {
            return VERCEL_BLOB_CLIENT_STUB;
          }
          if (source === "@vercel/oidc") {
            return VERCEL_OIDC_STUB;
          }
        },
        load(id) {
          if (id === VERCEL_OIDC_STUB) {
            // This project uses its dedicated BLOB_READ_WRITE_TOKEN, so the
            // optional CLI/OIDC discovery path is intentionally unavailable.
            return `
              export function getContext() { return { headers: {} }; }
              export async function getVercelOidcToken() { return ""; }
            `;
          }
          if (id !== VERCEL_BLOB_CLIENT_STUB) return;
          return `
            const serverOnly = () => {
              throw new Error("@vercel/blob is only available on the server");
            };
            export const copy = serverOnly;
            export const del = serverOnly;
            export const issueSignedToken = serverOnly;
            export const list = serverOnly;
            export const presignUrl = serverOnly;
            export const put = serverOnly;
          `;
        },
      },
    ],
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

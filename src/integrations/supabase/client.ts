import { createAuthClient } from "@neondatabase/auth";
import { SupabaseAuthAdapter } from "@neondatabase/auth/vanilla/adapters";

function createNeonAuthClient(authUrl: string) {
  return createAuthClient(authUrl.replace(/\/+$/, ""), {
    adapter: SupabaseAuthAdapter(),
  });
}

export type BrowserAuthClient = ReturnType<typeof createNeonAuthClient>;

let authClient: BrowserAuthClient | null = null;
let configuredUrl: string | null = null;

export function configureBrowserAuth(authUrl: string): BrowserAuthClient {
  const normalized = authUrl.trim().replace(/\/+$/, "");
  if (!normalized) throw new Error("Neon Auth is not configured");
  if (!authClient || configuredUrl !== normalized) {
    authClient = createNeonAuthClient(normalized);
    configuredUrl = normalized;
  }
  return authClient;
}

export function getConfiguredBrowserAuth(): BrowserAuthClient | null {
  return authClient;
}

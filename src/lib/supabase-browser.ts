import {
  getConfiguredBrowserAuth,
  type BrowserAuthClient,
} from "@/integrations/supabase/client";

type BrowserSupabase = { auth: BrowserAuthClient };

export function hasBrowserSupabaseConfig(): boolean {
  return getConfiguredBrowserAuth() !== null;
}

export function getBrowserSupabase(): BrowserSupabase | null {
  const auth = getConfiguredBrowserAuth();
  return auth ? { auth } : null;
}

export async function getBrowserAccessToken(): Promise<string | null> {
  const client = getBrowserSupabase();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  } catch (error) {
    console.warn("[auth] browser session unavailable", error);
    return null;
  }
}

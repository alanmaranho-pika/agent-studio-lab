import { supabase } from "@/integrations/supabase/client";

type BrowserSupabase = typeof supabase;

export function hasBrowserSupabaseConfig(): boolean {
  // Personal Supabase project config is hardcoded — always available.
  return true;
}

export function getBrowserSupabase(): BrowserSupabase | null {
  return hasBrowserSupabaseConfig() ? supabase : null;
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
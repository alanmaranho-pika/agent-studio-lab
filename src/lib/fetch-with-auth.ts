// Browser fetch that attaches the current Supabase access token so
// server routes (e.g. /api/chat) can identify the caller.
import { getBrowserAccessToken } from "@/lib/supabase-browser";

async function getAccessToken(): Promise<string | null> {
  return getBrowserAccessToken();
}

export async function fetchWithAuth(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

// Useful for clients like useChat's DefaultChatTransport.
export async function buildAuthHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { ...(extra ?? {}) };
  if (token) headers["authorization"] = `Bearer ${token}`;
  return headers;
}

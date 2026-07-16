// Browser fetch for local mode. Server routes use the local workspace and
// don't require an authentication header.
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, init);
}

// Useful for clients like useChat's DefaultChatTransport.
export async function buildAuthHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  return { ...(extra ?? {}) };
}

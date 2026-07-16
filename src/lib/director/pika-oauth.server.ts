/**
 * Pika MCP OAuth (RFC 8414 + RFC 7591 DCR + PKCE) — hosted-app port of
 * the Suite's local-loopback flow.
 *
 * Differences from Suite:
 *  - Redirect URI is a real hosted URL (`<origin>/api/oauth/pika/callback`)
 *    instead of a 127.0.0.1 loopback.
 *  - We register a single OAuth client per origin (cached in
 *    `director_pika_client`) rather than a port ladder.
 *  - Tokens/pending flows live in Supabase, not `~/.config/pika.json`.
 *
 * Resource URL: https://mcp.pika.me/api/mcp
 * Metadata:     https://mcp.pika.me/.well-known/oauth-protected-resource
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RESOURCE_URL = "https://mcp.pika.me/api/mcp";
const RESOURCE_METADATA_URL =
  "https://mcp.pika.me/.well-known/oauth-protected-resource";
const CALLBACK_PATH = "/api/oauth/pika/callback";
const CLIENT_NAME = "Pika Director (Lovable)";

export function pikaResourceUrl(): string {
  return RESOURCE_URL;
}

export function callbackPath(): string {
  return CALLBACK_PATH;
}

// ---------- discovery ----------

type OAuthMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
};

async function discoverMetadata(): Promise<OAuthMetadata> {
  const rr = await fetch(RESOURCE_METADATA_URL, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!rr.ok)
    throw new Error(`pika resource metadata failed: ${rr.status}`);
  const resource = (await rr.json()) as { authorization_servers?: string[] };
  const authServer = resource.authorization_servers?.[0];
  if (!authServer) throw new Error("no authorization server advertised");
  const ar = await fetch(
    `${authServer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!ar.ok) throw new Error(`auth server metadata failed: ${ar.status}`);
  return (await ar.json()) as OAuthMetadata;
}

// ---------- PKCE helpers (Web Crypto, Workers-safe) ----------

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return arr;
}

async function sha256(input: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return new Uint8Array(buf);
}

// ---------- client registration ----------

type ClientRow = {
  origin: string;
  client_id: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string | null;
  redirect_uri: string;
};

async function getOrCreateClient(origin: string): Promise<ClientRow> {
  const redirectUri = `${origin}${CALLBACK_PATH}`;
  const { data: existing } = await supabaseAdmin
    .from("director_pika_client")
    .select(
      "origin, client_id, authorization_endpoint, token_endpoint, registration_endpoint, redirect_uri",
    )
    .eq("origin", origin)
    .maybeSingle();
  if (existing && (existing as ClientRow).client_id) {
    return existing as ClientRow;
  }

  const metadata = await discoverMetadata();
  if (!metadata.registration_endpoint) {
    throw new Error("pika auth server has no registration endpoint (DCR)");
  }
  const res = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      client_name: CLIENT_NAME,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `dynamic client registration failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as { client_id?: string };
  if (!data.client_id)
    throw new Error("registration response missing client_id");

  const row: ClientRow = {
    origin,
    client_id: data.client_id,
    authorization_endpoint: metadata.authorization_endpoint,
    token_endpoint: metadata.token_endpoint,
    registration_endpoint: metadata.registration_endpoint,
    redirect_uri: redirectUri,
  };
  await supabaseAdmin
    .from("director_pika_client")
    .upsert(row, { onConflict: "origin" });
  return row;
}

// ---------- flow ----------

export async function startFlow(
  userId: string,
  origin: string,
): Promise<{ authorizeUrl: string }> {
  const client = await getOrCreateClient(origin);
  const state = b64url(randomBytes(16));
  const codeVerifier = b64url(randomBytes(32));
  const codeChallenge = b64url(await sha256(codeVerifier));

  await supabaseAdmin.from("director_pika_pending").insert({
    state,
    user_id: userId,
    origin,
    code_verifier: codeVerifier,
    redirect_uri: client.redirect_uri,
  });

  const url = new URL(client.authorization_endpoint);
  url.searchParams.set("client_id", client.client_id);
  url.searchParams.set("redirect_uri", client.redirect_uri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return { authorizeUrl: url.toString() };
}

export type CompleteResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function completeFlow(
  code: string,
  state: string,
): Promise<CompleteResult> {
  const { data: pending } = await supabaseAdmin
    .from("director_pika_pending")
    .select("state, user_id, origin, code_verifier, redirect_uri")
    .eq("state", state)
    .maybeSingle();
  if (!pending) return { ok: false, error: "invalid_or_expired_state" };
  await supabaseAdmin.from("director_pika_pending").delete().eq("state", state);

  const p = pending as {
    user_id: string;
    origin: string;
    code_verifier: string;
    redirect_uri: string;
  };

  const { data: client } = await supabaseAdmin
    .from("director_pika_client")
    .select("client_id, token_endpoint")
    .eq("origin", p.origin)
    .maybeSingle();
  const clientRow = client as
    | { client_id: string; token_endpoint: string }
    | null;
  if (!clientRow)
    return { ok: false, error: "client_not_found_for_origin" };

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: p.redirect_uri,
    client_id: clientRow.client_id,
    code_verifier: p.code_verifier,
  });
  const res = await fetch(clientRow.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `token_exchange_failed_${res.status}: ${text.slice(0, 200)}`,
    };
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const expiresAt = tok.expires_in
    ? new Date(Date.now() + tok.expires_in * 1000).toISOString()
    : null;

  await supabaseAdmin.from("director_pika_tokens").upsert(
    {
      user_id: p.user_id,
      origin: p.origin,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? null,
      expires_at: expiresAt,
    },
    { onConflict: "user_id" },
  );
  return { ok: true, userId: p.user_id };
}

// ---------- token access + refresh ----------

let inflightRefresh = new Map<string, Promise<string | null>>();

export async function getAccessToken(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("director_pika_tokens")
    .select("access_token, refresh_token, expires_at, origin")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as
    | {
        access_token: string | null;
        refresh_token: string | null;
        expires_at: string | null;
        origin: string;
      }
    | null;
  if (!row?.access_token) return null;
  const expMs = row.expires_at ? Date.parse(row.expires_at) : 0;
  if (!row.expires_at || expMs - Date.now() > 60_000) return row.access_token;
  if (!row.refresh_token) return null;

  const key = `${userId}:${row.origin}`;
  const inflight = inflightRefresh.get(key);
  if (inflight) return inflight;
  const p = doRefresh(userId, row.origin, row.refresh_token).finally(() =>
    inflightRefresh.delete(key),
  );
  inflightRefresh.set(key, p);
  return p;
}

async function doRefresh(
  userId: string,
  origin: string,
  refreshToken: string,
): Promise<string | null> {
  const { data: client } = await supabaseAdmin
    .from("director_pika_client")
    .select("client_id, token_endpoint")
    .eq("origin", origin)
    .maybeSingle();
  const c = client as
    | { client_id: string; token_endpoint: string }
    | null;
  if (!c) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: c.client_id,
  });
  let res: Response;
  try {
    res = await fetch(c.token_endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) {
    // Refresh failed — wipe tokens so the user reconnects. Keep the client.
    await supabaseAdmin
      .from("director_pika_tokens")
      .delete()
      .eq("user_id", userId);
    return null;
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const expiresAt = tok.expires_in
    ? new Date(Date.now() + tok.expires_in * 1000).toISOString()
    : null;
  await supabaseAdmin
    .from("director_pika_tokens")
    .update({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? refreshToken,
      expires_at: expiresAt,
    })
    .eq("user_id", userId);
  return tok.access_token;
}

export async function isConnected(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("director_pika_tokens")
    .select("access_token")
    .eq("user_id", userId)
    .maybeSingle();
  return !!(data as { access_token?: string | null } | null)?.access_token;
}

export async function disconnect(userId: string): Promise<void> {
  await supabaseAdmin
    .from("director_pika_tokens")
    .delete()
    .eq("user_id", userId);
}

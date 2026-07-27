import { createAuthClient } from "@neondatabase/auth";
import { SupabaseAuthAdapter } from "@neondatabase/auth/vanilla/adapters";
import { createRemoteJWKSet, jwtVerify } from "jose";

const EXISTING_WORKSPACE_USER_ID = "cb0228ce-9b0e-4046-89aa-989b8846c553";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getNeonAuthBaseUrl(): string {
  const url = process.env.NEON_AUTH_BASE_URL ?? process.env.NEON_VITE_NEON_AUTH_URL;
  if (!url) throw new Error("Neon Auth is not configured");
  return url.replace(/\/+$/, "");
}

export function createNeonServerAuthClient() {
  const baseUrl = getNeonAuthBaseUrl();
  return createAuthClient(baseUrl, {
    adapter: SupabaseAuthAdapter({
      fetchOptions: {
        // Browser requests include Origin automatically. Server-to-server auth
        // calls need one explicitly so Better Auth can validate the request.
        headers: { Origin: new URL(baseUrl).origin },
      },
    }),
  });
}

const AUTH_VERIFY_TIMEOUT_MS = 10_000;

let neonJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let neonJwksUrl: string | undefined;

function getNeonJwks() {
  const url = new URL(`${getNeonAuthBaseUrl()}/.well-known/jwks.json`);
  if (!neonJwks || neonJwksUrl !== url.href) {
    neonJwks = createRemoteJWKSet(url, {
      cooldownDuration: 30_000,
      timeoutDuration: 5_000,
    });
    neonJwksUrl = url.href;
  }
  return neonJwks;
}

async function withAuthTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Neon Auth token verification timed out")),
          AUTH_VERIFY_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function getWorkspaceUserId(): string {
  const userId = process.env.APP_WORKSPACE_USER_ID ?? EXISTING_WORKSPACE_USER_ID;
  if (!UUID_RE.test(userId)) throw new Error("APP_WORKSPACE_USER_ID must be a UUID");
  return userId;
}

export async function validateNeonAuthToken(token: string): Promise<{
  authUserId: string;
  claims: Record<string, unknown>;
  userId: string;
}> {
  // SupabaseAuthAdapter#getUser() does not accept a bearer token. Passing one
  // is silently ignored and makes the server look for a browser cookie that
  // cannot exist on a serverFn request. Verify the supplied JWT locally with
  // Neon Auth's branch-scoped public signing keys instead.
  const { payload } = await withAuthTimeout(
    jwtVerify(token, getNeonJwks(), {
      algorithms: ["EdDSA"],
    }),
  );
  const claims = payload as Record<string, unknown>;
  const authUserId = typeof claims.sub === "string" ? claims.sub : "";
  if (!authUserId) throw new Error("Invalid token subject");

  return {
    authUserId,
    claims,
    userId: getWorkspaceUserId(),
  };
}

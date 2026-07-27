import { createAuthClient } from "@neondatabase/auth";
import { SupabaseAuthAdapter } from "@neondatabase/auth/vanilla/adapters";

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
  const auth = createNeonServerAuthClient();
  const { data, error } = await auth.getUser(token);
  if (error || !data.user) throw new Error(error?.message ?? "Invalid token");

  const user = data.user;
  const metadata =
    user.user_metadata && typeof user.user_metadata === "object"
      ? user.user_metadata
      : {};
  return {
    authUserId: user.id,
    claims: {
      email: user.email,
      sub: user.id,
      user_metadata: metadata,
    },
    userId: getWorkspaceUserId(),
  };
}

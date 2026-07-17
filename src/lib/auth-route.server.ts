export type AuthedUser = { userId: string; token: string };

// LOCAL MODE: Supabase auth is disabled for local development. This no longer
// validates a bearer token — it returns a fixed "local-user" identity so the
// chat/agent API route runs without a hosted database or a real session.
// The original token-validating implementation is preserved in git history
// (before the "localhost" branch). Restore it there to re-enable real auth.
export async function requireUser(_request: Request): Promise<AuthedUser> {
  return { userId: "local-user", token: "local" };
}

export function unauthorizedResponse(message = "Unauthorized"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

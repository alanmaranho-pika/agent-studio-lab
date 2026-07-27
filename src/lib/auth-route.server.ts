export type AuthedUser = { userId: string; token: string };

// Validate the Neon Auth bearer token and map it to the existing workspace.
export async function requireUser(request: Request): Promise<AuthedUser> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) throw unauthorized("Missing bearer token");

  const { validateNeonAuthToken } = await import("@/lib/neon/auth.server");
  try {
    const identity = await validateNeonAuthToken(token);
    return { userId: identity.userId, token };
  } catch (error) {
    throw unauthorized(error instanceof Error ? error.message : "Invalid token");
  }
}

function unauthorized(reason: string): Error & { statusCode: number } {
  const err = new Error(`Unauthorized: ${reason}`) as Error & {
    statusCode: number;
  };
  err.statusCode = 401;
  return err;
}

export function unauthorizedResponse(message = "Unauthorized"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

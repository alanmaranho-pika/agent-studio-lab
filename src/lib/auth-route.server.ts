export type AuthedUser = { userId: string; token: string };

// Local mode has a single browser-local workspace, so server routes do not
// require a hosted identity or bearer token.
export async function requireUser(_request: Request): Promise<AuthedUser> {
  return { userId: "local-user", token: "" };
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

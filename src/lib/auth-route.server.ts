export type AuthedUser = { userId: string; token: string };

// Validate the Supabase bearer token on the request and return the user id.
export async function requireUser(request: Request): Promise<AuthedUser> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) throw unauthorized("Missing bearer token");

  const { createClient } = await import("@supabase/supabase-js");
  const { MY_SUPABASE_URL, MY_SUPABASE_PUBLISHABLE_KEY } = await import(
    "@/integrations/supabase/my-config"
  );
  const supabase = createClient(
    MY_SUPABASE_URL,
    MY_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw unauthorized(error?.message ?? "Invalid token");
  return { userId: data.user.id, token };
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

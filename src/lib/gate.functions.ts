import { createServerFn } from "@tanstack/react-start";

// Constant-time-ish string compare so the verify endpoint doesn't leak the
// password length / prefix via response timing. Not a hard guarantee in JS,
// but removes the trivial early-exit signal.
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

/**
 * Site password gate. Compares a submitted password to SITE_GATE_PASSWORD
 * SERVER-SIDE so the key never ships in the client bundle. Returns:
 *   - { configured: false } when no gate password is set (open — local dev
 *     convenience; set the var on any shared/deployed environment).
 *   - { configured: true, ok } otherwise.
 * The client re-checks its stored password here on every load, so rotating
 * SITE_GATE_PASSWORD immediately locks everyone out.
 */
export const verifySitePassword = createServerFn({ method: "POST" })
  .inputValidator((data: { password?: string }) => ({
    password: typeof data?.password === "string" ? data.password : "",
  }))
  .handler(async ({ data }) => {
    const expected = process.env.SITE_GATE_PASSWORD;
    if (!expected) return { configured: false as const, ok: true };
    return { configured: true as const, ok: safeEqual(data.password, expected) };
  });

/**
 * Returns the shared Supabase account's credentials so the browser can
 * silently `signInWithPassword` and get a real session (keeps RLS +
 * user_id-scoped features working) without showing any login UI.
 */
export const getSharedCredentials = createServerFn({ method: "GET" }).handler(async () => {
  const sharedEmail = process.env.SHARED_ACCOUNT_EMAIL;
  const sharedPassword = process.env.SITE_PASSWORD;
  if (!sharedEmail || !sharedPassword) {
    throw new Error("Shared account secrets not configured");
  }

  // Ensure the shared Supabase user exists (idempotent). Best-effort: this
  // needs the service-role key, which may be absent in local dev — the client
  // sign-in below only needs the email+password, so a missing admin client
  // must not block it (the shared user already exists in any real project).
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: sharedEmail,
      password: sharedPassword,
      email_confirm: true,
    });
    if (createErr && !/already|exists|registered/i.test(createErr.message)) {
      console.warn("[gate] createUser:", createErr.message);
    }
  } catch (error) {
    console.warn("[gate] admin createUser skipped:", (error as Error).message);
  }

  return { email: sharedEmail, password: sharedPassword };
});

import { createServerFn } from "@tanstack/react-start";

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

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";

function match(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Validates the shared username+password gate. On success ensures a single
 * shared Supabase auth user exists and returns its credentials so the browser
 * can complete `signInWithPassword` and get a real session (keeps RLS +
 * user_id-scoped features working).
 */
export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ username: z.string().max(200), password: z.string().max(500) }).parse(data),
  )
  .handler(async ({ data }) => {
    const expectedUser = process.env.SITE_USERNAME;
    const expectedPass = process.env.SITE_PASSWORD;
    const sharedEmail = process.env.SHARED_ACCOUNT_EMAIL;
    if (!expectedUser || !expectedPass || !sharedEmail) {
      throw new Error("Gate secrets not configured");
    }

    if (
      data.username.length !== expectedUser.length ||
      data.password.length !== expectedPass.length ||
      !match(data.username, expectedUser) ||
      !match(data.password, expectedPass)
    ) {
      return { ok: false as const };
    }

    // Ensure the shared Supabase user exists (idempotent).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Try to create; ignore "already exists" errors.
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: sharedEmail,
      password: expectedPass,
      email_confirm: true,
    });
    if (createErr && !/already|exists|registered/i.test(createErr.message)) {
      // Fall through — signInWithPassword will surface a clearer error on the client.
      console.warn("[gate] createUser:", createErr.message);
    }

    return { ok: true as const, email: sharedEmail, password: expectedPass };
  });
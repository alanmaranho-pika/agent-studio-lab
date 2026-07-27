import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { createNeonDataClient } from "@/lib/neon/supabase-adapter.server";
import { validateNeonAuthToken } from "@/lib/neon/auth.server";
import { supabaseAdmin } from "./client.server";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Bearer token required");
    }

    const token = authHeader.slice(7).trim();
    if (!token) throw new Error("Unauthorized: No token provided");

    let identity: Awaited<ReturnType<typeof validateNeonAuthToken>>;
    try {
      identity = await validateNeonAuthToken(token);
    } catch (error) {
      throw new Error(
        `Unauthorized: ${error instanceof Error ? error.message : "Invalid token"}`,
      );
    }

    const dataClient = createNeonDataClient(supabaseAdmin, {
      userId: identity.userId,
    });

    return next({
      context: {
        supabase: dataClient,
        userId: identity.userId,
        claims: identity.claims,
      },
    });
  },
);

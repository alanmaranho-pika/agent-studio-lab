import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { getBrowserAccessToken, hasBrowserSupabaseConfig } from "@/lib/supabase-browser";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    // For server-function RPC calls, let the framework serialize the error so
    // the client receives a real Error (instead of an HTML page that the RPC
    // client silently parses to `undefined`).
    try {
      const url = new URL((request as Request).url);
      if (url.pathname.startsWith("/_serverFn")) throw error;
    } catch {
      throw error;
    }
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const safeAttachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    if (!hasBrowserSupabaseConfig()) return next({ headers: {} });
    const token = await getBrowserAccessToken();
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [attachSupabaseAuth, safeAttachSupabaseAuth],
}));

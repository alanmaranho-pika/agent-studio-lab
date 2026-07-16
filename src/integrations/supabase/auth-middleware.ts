import { createMiddleware } from "@tanstack/react-start";
import { createLocalDatabaseShim } from "@/lib/local-database-shim";

// Local mode has one browser-local workspace and no account gate.
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => next({ context: { supabase: createLocalDatabaseShim(), userId: "local-user", claims: { sub: "local-user" } } }),
);

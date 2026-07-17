// Compatibility boundary for server workflows that have not yet been
// rewritten for browser-local persistence. It deliberately returns empty
// results instead of contacting a hosted database.
/* eslint-disable @typescript-eslint/no-explicit-any -- deliberate any-typed proxy shim */

import type { SupabaseClient } from "@supabase/supabase-js";

const emptyResult = { data: [], error: null, count: 0 };

export function createLocalDatabaseShim(): any {
  const query = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") {
          return (resolve: (value: typeof emptyResult) => unknown) => resolve(emptyResult);
        }
        if (property === "catch") return () => query;
        if (property === "finally")
          return (callback: () => void) => {
            callback();
            return query;
          };
        return (..._args: unknown[]) => query;
      },
    },
  );

  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "auth") {
          return {
            getUser: async () => ({ data: { user: null }, error: null }),
            getSession: async () => ({ data: { session: null }, error: null }),
            getClaims: async () => ({ data: { claims: { sub: "local-user" } }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            signInWithPassword: async () => ({ error: null }),
            signUp: async () => ({ error: null }),
            signOut: async () => ({ error: null }),
            setSession: async () => ({ error: null }),
            admin: { getUserById: async () => ({ data: { user: null }, error: null }) },
          };
        }
        if (property === "channel") {
          return () => ({ on: () => ({ subscribe: () => ({}) }) });
        }
        if (property === "removeChannel") return async () => undefined;
        return (..._args: unknown[]) => query;
      },
    },
  );
}

// Typed as a real SupabaseClient so downstream query-builder inference (and
// the server-fn return types derived from it) stay identical to the hosted
// client — only the runtime behavior is shimmed.
export function createLocalClient<Schema = any>(..._args: unknown[]): SupabaseClient<Schema> {
  return createLocalDatabaseShim() as SupabaseClient<Schema>;
}

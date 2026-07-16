import { createLocalDatabaseShim } from "@/lib/local-database-shim";

// Local-only replacement for the former hosted database admin client.
export const supabaseAdmin = createLocalDatabaseShim();

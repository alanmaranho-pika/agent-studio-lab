import { createLocalDatabaseShim } from "@/lib/local-database-shim";

// Kept as an adapter name while older server feature modules are migrated.
// It has no Supabase runtime or network dependency.
export const supabase = createLocalDatabaseShim();

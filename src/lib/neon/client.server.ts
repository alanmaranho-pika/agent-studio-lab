import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let neonSql: NeonQueryFunction<false, false> | undefined;

export function hasNeonDatabase(): boolean {
  return Boolean(process.env.NEON_URL);
}

export function getNeonSql(): NeonQueryFunction<false, false> {
  if (neonSql) return neonSql;

  const connectionString = process.env.NEON_URL;
  if (!connectionString) {
    throw new Error(
      "Missing NEON_URL. Connect the Neon Marketplace resource to this Vercel environment.",
    );
  }

  neonSql = neon(connectionString);
  return neonSql;
}

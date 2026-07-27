import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let neonSql: NeonQueryFunction<false, false> | undefined;

export function getNeonConnectionString(): string | undefined {
  return process.env.NEON_DATABASE_URL ?? process.env.NEON_POSTGRES_URL ?? process.env.NEON_URL;
}

export function hasNeonDatabase(): boolean {
  return Boolean(getNeonConnectionString());
}

export function getNeonSql(): NeonQueryFunction<false, false> {
  if (neonSql) return neonSql;

  const connectionString = getNeonConnectionString();
  if (!connectionString) {
    throw new Error(
      "Missing NEON_DATABASE_URL. Connect the Neon Marketplace resource to this environment.",
    );
  }

  neonSql = neon(connectionString);
  return neonSql;
}

import { readFile } from "node:fs/promises";

import { neon } from "@neondatabase/serverless";
import { createClient } from "@supabase/supabase-js";

const TABLES = [
  "profiles",
  "projects",
  "project_assets",
  "project_messages",
  "project_jobs",
  "skill_playbook_overrides",
  "agent_skills",
  "agent_skill_versions",
];

const isMigrationPreview =
  process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "vercel";

if (!isMigrationPreview) {
  console.log("[neon-migration] skipped outside the vercel preview branch");
  process.exit(0);
}

const neonUrl =
  process.env.NEON_URL ??
  process.env.NEON_DATABASE_URL ??
  process.env.NEON_POSTGRES_URL ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.STORAGE_URL;
const supabaseKey =
  process.env.MY_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_KEY;
if (!neonUrl || !supabaseKey) {
  const relevantVariableNames = Object.keys(process.env)
    .filter((name) => /^(NEON|POSTGRES|DATABASE_URL$|STORAGE|.*SUPABASE.*)/.test(name))
    .sort();
  console.log(
    `[neon-migration] available migration variables: ${relevantVariableNames.join(", ") || "none"}`,
  );
  throw new Error(
    `[neon-migration] missing ${
      !neonUrl ? "a supported Neon connection variable" : "a Supabase service-role key"
    }`,
  );
}

function supabaseFetch(apiKey) {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      (apiKey.startsWith("sb_secret_") || apiKey.startsWith("sb_publishable_")) &&
      headers.get("Authorization") === `Bearer ${apiKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", apiKey);
    return fetch(input, { ...init, headers });
  };
}

const source = createClient("https://igsepvhlwuasodrkadug.supabase.co", supabaseKey, {
  global: { fetch: supabaseFetch(supabaseKey) },
  auth: {
    storage: undefined,
    persistSession: false,
    autoRefreshToken: false,
  },
});
const sql = neon(neonUrl);
const schemaSql = await readFile(new URL("../src/lib/neon/schema.sql", import.meta.url), "utf8");

await sql.query(schemaSql);

const sourceData = {};
for (const table of TABLES) {
  const { data, error } = await source.from(table).select("*");
  if (error) throw new Error(`[neon-migration] Supabase ${table}: ${error.message}`);
  sourceData[table] = data ?? [];
}

await sql.query(`
  truncate table
    public.agent_skill_versions,
    public.skill_playbook_overrides,
    public.project_jobs,
    public.project_messages,
    public.project_assets,
    public.agent_skills,
    public.projects,
    public.profiles
  restart identity cascade
`);

await sql.query("alter table public.agent_skills disable trigger trg_agent_skills_version_record");
try {
  for (const table of TABLES) {
    const rows = sourceData[table];
    if (rows.length === 0) continue;
    const identityOverride = table === "agent_skill_versions" ? " OVERRIDING SYSTEM VALUE" : "";
    await sql.query(
      `insert into public.${table}${identityOverride}
       select * from jsonb_populate_recordset(null::public.${table}, $1::jsonb)`,
      [JSON.stringify(rows)],
    );
  }
} finally {
  await sql.query("alter table public.agent_skills enable trigger trg_agent_skills_version_record");
}

await sql.query(`
  select setval(
    pg_get_serial_sequence('public.agent_skill_versions', 'id'),
    greatest(
      coalesce((select max(id) from public.agent_skill_versions), 1),
      1
    ),
    true
  )
`);

for (const table of TABLES) {
  const rows = await sql.query(`select count(*)::int as count from public.${table}`);
  const sourceCount = sourceData[table].length;
  const targetCount = Number(rows[0]?.count ?? 0);
  if (sourceCount !== targetCount) {
    throw new Error(
      `[neon-migration] ${table} count mismatch: source=${sourceCount} target=${targetCount}`,
    );
  }
  console.log(`[neon-migration] ${table}: ${targetCount}`);
}

console.log("[neon-migration] preview copy verified");

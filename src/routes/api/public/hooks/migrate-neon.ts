import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getNeonSql, hasNeonDatabase } from "@/lib/neon/client.server";
import schemaSql from "@/lib/neon/schema.sql?raw";

const TABLES = [
  "profiles",
  "projects",
  "project_assets",
  "project_messages",
  "project_jobs",
  "skill_playbook_overrides",
  "agent_skills",
  "agent_skill_versions",
] as const;

type TableName = (typeof TABLES)[number];
type JsonRow = Record<string, unknown>;
type SourceClient = {
  from(table: string): {
    select(columns: string): Promise<{
      data: JsonRow[] | null;
      error: { message: string } | null;
    }>;
  };
};

function isAuthorized(request: Request): boolean {
  const supplied = request.headers.get("apikey");
  const expected = process.env.LOCAL_HOOK_TOKEN ?? process.env.SITE_GATE_PASSWORD;
  return Boolean(expected && supplied === expected);
}

function isPreviewEnvironment(): boolean {
  return process.env.VERCEL_ENV !== "production";
}

async function sourceRows(table: TableName): Promise<JsonRow[]> {
  const sourceClient = supabaseAdmin as unknown as SourceClient;
  const { data, error } = await sourceClient.from(table).select("*");
  if (error) throw new Error(`Supabase ${table}: ${error.message}`);
  return (data ?? []) as JsonRow[];
}

async function targetCounts(): Promise<Record<TableName, number>> {
  const sql = getNeonSql();
  const counts = {} as Record<TableName, number>;
  for (const table of TABLES) {
    const rows = await sql.query(`select count(*)::int as count from public.${table}`);
    counts[table] = Number(rows[0]?.count ?? 0);
  }
  return counts;
}

async function copyTable(table: TableName, rows: JsonRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sql = getNeonSql();
  const identityOverride = table === "agent_skill_versions" ? " OVERRIDING SYSTEM VALUE" : "";

  await sql.query(
    `insert into public.${table}${identityOverride}
     select * from jsonb_populate_recordset(null::public.${table}, $1::jsonb)`,
    [JSON.stringify(rows)],
  );
}

async function migrate(): Promise<{
  source: Record<TableName, number>;
  target: Record<TableName, number>;
}> {
  const sql = getNeonSql();
  await sql.query(schemaSql);

  const sourceData = {} as Record<TableName, JsonRow[]>;
  for (const table of TABLES) {
    sourceData[table] = await sourceRows(table);
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

  await sql.query(
    "alter table public.agent_skills disable trigger trg_agent_skills_version_record",
  );
  try {
    for (const table of TABLES) {
      await copyTable(table, sourceData[table]);
    }
  } finally {
    await sql.query(
      "alter table public.agent_skills enable trigger trg_agent_skills_version_record",
    );
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

  const source = Object.fromEntries(
    TABLES.map((table) => [table, sourceData[table].length]),
  ) as Record<TableName, number>;
  const target = await targetCounts();

  for (const table of TABLES) {
    if (source[table] !== target[table]) {
      throw new Error(
        `Verification failed for ${table}: source=${source[table]} target=${target[table]}`,
      );
    }
  }

  return { source, target };
}

export const Route = createFileRoute("/api/public/hooks/migrate-neon")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const connectorCopy = url.searchParams.get("confirm") === "copy-supabase-to-neon-preview";

        if (connectorCopy) {
          if (!isPreviewEnvironment() || process.env.VERCEL_GIT_COMMIT_REF !== "vercel") {
            return Response.json(
              { ok: false, error: "Connector copy is locked to the vercel preview" },
              { status: 409 },
            );
          }
          if (!hasNeonDatabase()) {
            return Response.json({ ok: false, error: "NEON_URL is unavailable" }, { status: 503 });
          }

          try {
            const result = await migrate();
            return Response.json({ ok: true, ...result });
          } catch (error) {
            console.error("[migrate-neon]", error instanceof Error ? error.message : error);
            return Response.json(
              {
                ok: false,
                error: error instanceof Error ? error.message : "Migration failed",
              },
              { status: 500 },
            );
          }
        }

        if (!isAuthorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        if (!hasNeonDatabase()) {
          return Response.json(
            { ok: false, neon: false, message: "NEON_URL is unavailable" },
            { status: 503 },
          );
        }

        try {
          const sql = getNeonSql();
          const rows = await sql`select current_database() as database, now() as checked_at`;
          return Response.json({
            ok: true,
            neon: true,
            environment: process.env.VERCEL_ENV ?? "local",
            database: rows[0]?.database ?? null,
          });
        } catch (error) {
          return Response.json(
            {
              ok: false,
              neon: true,
              error: error instanceof Error ? error.message : "Connection failed",
            },
            { status: 500 },
          );
        }
      },
      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!isPreviewEnvironment()) {
          return Response.json(
            { ok: false, error: "Production migration is locked" },
            { status: 409 },
          );
        }
        if (!hasNeonDatabase()) {
          return Response.json({ ok: false, error: "NEON_URL is unavailable" }, { status: 503 });
        }

        try {
          const result = await migrate();
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("[migrate-neon]", error instanceof Error ? error.message : error);
          return Response.json(
            {
              ok: false,
              error: error instanceof Error ? error.message : "Migration failed",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});

// @ts-nocheck — legacy feature file; feature tables (characters, library_subjects, render_jobs, etc.) are not part of the projects-first Supabase migration.
/**
 * Pika async job poller — public cron endpoint.
 *
 * Invoked every minute by pg_cron. Loops internally with short sleeps so
 * jobs get roughly 15s-cadence updates without needing sub-minute cron.
 *
 * Auth: requires the project's publishable `apikey` header. `/api/public/*`
 * bypasses gateway auth, so we verify here.
 */
import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  callPikaToolWithClient,
  openPikaClient,
} from "@/lib/director/pika-mcp.server";
import { classifyPoll, persistPikaResultAsset } from "@/lib/director/pika-jobs.server";

const MAX_ROWS_PER_PASS = 25;
const MAX_USERS_PARALLEL = 5;
const PASSES = 3;
const PASS_SLEEP_MS = 15_000;
const POLL_BUDGET_MS = 50_000;

type Row = {
  id: string;
  user_id: string;
  project_id: string;
  external_id: string | null;
  status_url: string | null;
  kind: string;
  attempts: number;
  max_attempts: number;
};

async function processUserRows(userId: string, rows: Row[]): Promise<void> {
  const client = await openPikaClient(userId).catch(() => null);
  if (!client) {
    // User disconnected Pika — mark their rows failed so the workspace can tell.
    await supabaseAdmin
      .from("project_jobs")
      .update({
        status: "failed",
        error: "Pika disconnected before render completed.",
      })
      .in(
        "id",
        rows.map((r) => r.id),
      );
    return;
  }
  try {
    for (const row of rows) {
      if (!row.external_id) {
        await supabaseAdmin
          .from("project_jobs")
          .update({ status: "failed", error: "missing external_id" })
          .eq("id", row.id);
        continue;
      }
      const toolName = row.status_url || "check_task";
      const result = await callPikaToolWithClient(client, toolName, {
        task_id: row.external_id,
      });
      const outcome = classifyPoll(
        result as { text?: string; urls?: string[]; ok?: boolean } & Record<
          string,
          unknown
        >,
      );

      if (outcome.status === "succeeded") {
        const firstUrl = outcome.urls[0] ?? null;
        let assetId: string | null = null;
        if (firstUrl) {
          const saved = await persistPikaResultAsset({
            projectId: row.project_id,
            kind: row.kind,
            url: firstUrl,
          });
          assetId = saved.assetId;
        }
        await supabaseAdmin
          .from("project_jobs")
          .update({
            status: "succeeded",
            result_url: firstUrl,
            asset_id: assetId,
          })
          .eq("id", row.id);
      } else if (outcome.status === "failed") {
        await supabaseAdmin
          .from("project_jobs")
          .update({ status: "failed", error: outcome.error })
          .eq("id", row.id);
      } else {
        const nextAttempts = (row.attempts ?? 0) + 1;
        if (nextAttempts >= row.max_attempts) {
          await supabaseAdmin
            .from("project_jobs")
            .update({
              status: "failed",
              error: "max_attempts_exceeded",
              attempts: nextAttempts,
            })
            .eq("id", row.id);
        } else {
          await supabaseAdmin
            .from("project_jobs")
            .update({ status: "running", attempts: nextAttempts })
            .eq("id", row.id);
        }
      }
    }
  } finally {
    await client.close().catch(() => {});
  }
}

async function runOnePass(deadline: number): Promise<number> {
  if (Date.now() >= deadline) return 0;
  const { data: rows } = await supabaseAdmin
    .from("project_jobs")
    .select(
      "id, user_id, project_id, external_id, status_url, kind, attempts, max_attempts",
    )
    .eq("provider", "pika")
    .in("status", ["queued", "running"])
    .order("updated_at", { ascending: true })
    .limit(MAX_ROWS_PER_PASS);
  if (!rows || rows.length === 0) return 0;

  // Group by user for MCP client reuse.
  const byUser = new Map<string, Row[]>();
  for (const r of rows as Row[]) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r);
    byUser.set(r.user_id, list);
  }

  const entries = Array.from(byUser.entries());
  // Simple concurrency window.
  for (let i = 0; i < entries.length; i += MAX_USERS_PARALLEL) {
    if (Date.now() >= deadline) break;
    const chunk = entries.slice(i, i + MAX_USERS_PARALLEL);
    await Promise.all(
      chunk.map(([userId, r]) =>
        processUserRows(userId, r).catch((err) =>
          console.warn("[pika-poller] user failed", userId, err),
        ),
      ),
    );
  }
  return rows.length;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export const Route = createFileRoute("/api/public/hooks/pika-poller")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("apikey");
        const expected = process.env.LOCAL_HOOK_TOKEN;
        if (!expected || auth !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const started = Date.now();
        const deadline = started + POLL_BUDGET_MS;
        let processed = 0;
        for (let pass = 0; pass < PASSES; pass++) {
          if (Date.now() >= deadline) break;
          processed += await runOnePass(deadline);
          if (pass < PASSES - 1 && Date.now() + PASS_SLEEP_MS < deadline) {
            await sleep(PASS_SLEEP_MS);
          }
        }
        return Response.json({
          ok: true,
          processed,
          elapsed_ms: Date.now() - started,
        });
      },
      // Also allow GET for manual smoke checks (still auth'd).
      GET: async ({ request }) => {
        const auth = request.headers.get("apikey");
        const expected = process.env.LOCAL_HOOK_TOKEN;
        if (!expected || auth !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { count } = await supabaseAdmin
          .from("project_jobs")
          .select("id", { count: "exact", head: true })
          .eq("provider", "pika")
          .in("status", ["queued", "running"]);
        return Response.json({ ok: true, pending: count ?? 0 });
      },
    },
  },
});

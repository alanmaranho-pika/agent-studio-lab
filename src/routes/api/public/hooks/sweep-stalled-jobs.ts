// Cron-only stalled-job sweeper.
//
// pg_cron POSTs here every 5 minutes with the project's anon apikey header.
// We mark any project_jobs row that has been `queued`/`running` for >10
// minutes as `timeout` so the UI stops showing a stuck spinner.
//
// Lives under /api/public/* so the published-app auth gate doesn't block it;
// the route is harmless if hit externally (only the service-role write path
// matters and the worst case is an idempotent UPDATE on already-timed-out
// rows).

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sweep-stalled-jobs")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data, error } = await supabaseAdmin
          .from("project_jobs")
          .update({
            status: "timeout",
            error: "Generation exceeded 10 minute timeout",
            updated_at: new Date().toISOString(),
          })
          .in("status", ["queued", "running"])
          .lt("updated_at", cutoff)
          .select("id");
        if (error) {
          return new Response(
            JSON.stringify({ ok: false, error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ ok: true, swept: data?.length ?? 0 }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});

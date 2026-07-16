// Project background-job watcher.
//
// Subscribes to `project_jobs` via Supabase Realtime for the current project
// and falls back to a 5s poll (covers Realtime hiccups + initial backlog).
// When a job lands `succeeded`, we hand its asset_id to `onComplete` so the
// Studio can patch it into project_state and announce it in chat.
//
// When a job is still `queued`/`running`, we proactively call `pollProjectJob`
// which makes a single fal status check server-side — this is what actually
// transitions a job to `succeeded` (the chat tool only submits + persists).

import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listProjectJobs, pollProjectJob } from "@/lib/projects.functions";

export type ProjectJobRow = {
  id: string;
  project_id: string;
  status: string;
  app_id: string | null;
  app_label: string | null;
  mode: string | null;
  model: string;
  prompt: string | null;
  result_url: string | null;
  asset_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectJobCompletion = {
  jobId: string;
  appLabel: string | null;
  mode: string | null;
  assetId: string;
  resultUrl: string | null;
  prompt: string | null;
};

export type ProjectJobFailure = {
  jobId: string;
  appLabel: string | null;
  prompt: string | null;
  error: string;
};

const POLL_INTERVAL_MS = 5000;

export function useProjectJobs(
  projectId: string | null | undefined,
  opts: {
    onComplete: (job: ProjectJobCompletion) => void;
    onFail?: (job: ProjectJobFailure) => void;
  },
) {
  const list = useServerFn(listProjectJobs);
  const poll = useServerFn(pollProjectJob);
  const seenTerminal = useRef<Set<string>>(new Set());
  const pollingNow = useRef<Set<string>>(new Set());
  // Keep handlers in refs so the effect doesn't tear down on each render.
  const onComplete = useRef(opts.onComplete);
  const onFail = useRef(opts.onFail);
  onComplete.current = opts.onComplete;
  onFail.current = opts.onFail;

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const announce = (row: ProjectJobRow) => {
      if (seenTerminal.current.has(row.id)) return;
      if (row.status === "succeeded" && row.asset_id) {
        seenTerminal.current.add(row.id);
        onComplete.current({
          jobId: row.id,
          appLabel: row.app_label,
          mode: row.mode,
          assetId: row.asset_id,
          resultUrl: row.result_url,
          prompt: row.prompt,
        });
      } else if (row.status === "failed" || row.status === "timeout") {
        seenTerminal.current.add(row.id);
        onFail.current?.({
          jobId: row.id,
          appLabel: row.app_label,
          prompt: row.prompt,
          error: row.error ?? "Generation failed",
        });
      }
    };

    const advance = async (rows: ProjectJobRow[]) => {
      for (const row of rows) {
        if (seenTerminal.current.has(row.id)) continue;
        if (row.status === "queued" || row.status === "running") {
          if (pollingNow.current.has(row.id)) continue;
          pollingNow.current.add(row.id);
          try {
            const result = await poll({ data: { jobId: row.id } });
            if (cancelled) return;
            if (result.status === "succeeded" && result.assetId) {
              announce({ ...row, status: "succeeded", asset_id: result.assetId, result_url: result.resultUrl });
            } else if (result.status === "failed") {
              announce({ ...row, status: "failed", error: result.error ?? "Generation failed" });
            }
          } catch {
            // Transient — next poll tick will retry.
          } finally {
            pollingNow.current.delete(row.id);
          }
        } else {
          announce(row);
        }
      }
    };

    const tick = async () => {
      try {
        const res = await list({ data: { projectId } });
        if (cancelled) return;
        await advance(res.jobs as ProjectJobRow[]);
      } catch {
        // ignore — next interval retries.
      }
    };

    void tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);

    const channel = supabase
      .channel(`project-jobs-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_jobs",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const row = payload.new as ProjectJobRow | undefined;
          if (row) void advance([row]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(id);
      void supabase.removeChannel(channel);
    };
  }, [projectId, list, poll]);
}

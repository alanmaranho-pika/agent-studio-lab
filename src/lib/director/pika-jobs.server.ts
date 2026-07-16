/**
 * Async Pika generation jobs — enqueue + finalize helpers.
 *
 * When a Pika gen tool (image/video/music/sfx/speech) returns a task_id,
 * we persist a row in `project_jobs` and hand the id back to the agent.
 * The `/api/public/hooks/pika-poller` cron endpoint later calls
 * `pika_check_task` and finalizes the row when the render completes.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ProjectAsset } from "@/lib/project-state";

import { mutateProjectState, readProjectState } from "./state.server";

const MAX_ATTEMPTS = 60; // ~ 30 minutes at 1 poll/30s effective cadence

export type EnqueueArgs = {
  userId: string;
  projectId: string;
  underlying: string; // bare pika tool name, e.g. "generate_image"
  externalId: string; // task_id from Pika
  input: unknown;
  model?: string;
};

export async function enqueueJob({
  userId,
  projectId,
  underlying,
  externalId,
  input,
  model,
}: EnqueueArgs): Promise<{ jobId: string } | null> {
  const kind = kindFor(underlying);
  const { data, error } = await supabaseAdmin
    .from("project_jobs")
    .insert({
      user_id: userId,
      project_id: projectId,
      provider: "pika",
      model: model ?? underlying,
      kind,
      mode: "async",
      external_id: externalId,
      status_url: "check_task", // MCP tool used to poll
      status: "queued",
      attempts: 0,
      max_attempts: MAX_ATTEMPTS,
      input: (input ?? {}) as never,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.warn("[pika-jobs] enqueue failed:", error);
    return null;
  }
  return { jobId: data.id };
}

export function kindFor(underlying: string): string {
  const u = underlying.toLowerCase();
  if (u.includes("video")) return "video";
  if (u.includes("music")) return "audio";
  if (u.includes("sfx")) return "audio";
  if (u.includes("speech") || u.includes("voice")) return "audio";
  return "image";
}

export function mimeFor(kind: string): string {
  if (kind === "video") return "video/mp4";
  if (kind === "audio") return "audio/mpeg";
  return "image/png";
}

function shouldAddToTimeline(kind: string, mime: string): boolean {
  return (
    kind === "image" ||
    kind === "keyframe" ||
    kind === "video" ||
    kind === "audio" ||
    kind === "music" ||
    kind === "voiceover" ||
    mime.startsWith("image/") ||
    mime.startsWith("video/") ||
    mime.startsWith("audio/")
  );
}

function pickSceneToPatch(
  assetsKind: string,
  state: Awaited<ReturnType<typeof readProjectState>>,
): string | null {
  if (assetsKind === "video") {
    const target = state.scenes.find(
      (s) => !s.clipUrl && (s.status === "rendering" || s.status === "drafting"),
    );
    return target?.id ?? null;
  }
  if (assetsKind === "image" || assetsKind === "keyframe") {
    const target = state.scenes.find(
      (s) => !s.thumb && (s.status === "rendering" || s.status === "drafting"),
    );
    return target?.id ?? null;
  }
  return null;
}

export async function persistPikaResultAsset({
  projectId,
  kind,
  url,
  name,
  label,
  attachToSceneId,
}: {
  projectId: string;
  kind: string;
  url: string;
  name?: string;
  label?: string;
  attachToSceneId?: string | null;
}): Promise<{ assetId: string | null }> {
  const mime = mimeFor(kind);
  const safeName = name ?? `pika-${kind}-${Date.now()}`;
  const state = await readProjectState(projectId);
  const existingByUrl = state.assets.find((a) => a.url === url);
  if (existingByUrl) return { assetId: existingByUrl.id };

  const { data: asset, error } = await supabaseAdmin
    .from("project_assets")
    .insert({
      project_id: projectId,
      kind,
      mime,
      name: safeName,
      url,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[pika-jobs] asset insert failed:", error);
  }

  const assetId = asset?.id ?? `ast_${Date.now()}`;
  const sceneIdToPatch = attachToSceneId ?? pickSceneToPatch(kind, state);
  const existingTimelineOrder = state.timeline?.order ?? [];
  const assetPatch: ProjectAsset = {
    id: assetId,
    kind: kind as ProjectAsset["kind"],
    mime,
    name: safeName,
    url,
    label: label ?? `Pika ${kind}`,
    attachedTo: sceneIdToPatch ?? undefined,
  };

  await mutateProjectState(projectId, {
    assetsAppend: [assetPatch],
    timeline: shouldAddToTimeline(kind, mime) && !existingTimelineOrder.includes(assetId)
      ? {
          ...(state.timeline ?? { order: [], hidden: [] }),
          order: [...existingTimelineOrder, assetId],
        }
      : state.timeline,
    ...(sceneIdToPatch
      ? {
          scenes: [
            {
              id: sceneIdToPatch,
              thumb: url,
              status: "ready" as const,
              ...(kind === "video" ? { clipUrl: url } : {}),
            },
          ],
        }
      : {}),
  });

  // Post-persist: for produce_scene video landings, run cloud scene-detect
  // and auto-split any internal cuts as trim overrides on the timeline
  // clip. Best-effort — a failure or a single-scene result leaves the clip
  // whole. This mirrors the desktop Director Suite's ffmpeg scene-detect
  // pass ("one 15s Seedance call yields N per-cut timeline clips").
  if (kind === "video" && asset?.id) {
    autoSplitOnCuts({ projectId, assetId: asset.id, url }).catch((err) => {
      console.warn("[pika-jobs] auto-split failed:", err);
    });
  }

  return { assetId: asset?.id ?? null };
}

async function autoSplitOnCuts({
  projectId,
  assetId,
  url,
}: {
  projectId: string;
  assetId: string;
  url: string;
}): Promise<void> {
  const { detectSceneCuts } = await import("./scene-detect.server");
  const cuts = await detectSceneCuts(url);
  if (cuts.length < 2) return; // nothing to split
  // Sanity: sort + dedupe, drop tiny sub-1s slices, cap at 12.
  const useful = cuts
    .filter((c) => c.endSec - c.startSec >= 1)
    .slice(0, 12);
  if (useful.length < 2) return;

  const state = await readProjectState(projectId);
  const tl = state.timeline ?? {};
  const order = (tl.order ?? []).slice();
  const idx = order.indexOf(assetId);
  if (idx < 0) return;
  const trims = { ...(tl.trims ?? {}) };
  const newOrder: string[] = [...order.slice(0, idx)];
  useful.forEach((cut, i) => {
    const ref =
      i === 0 ? assetId : `${assetId}::timeline-instance::cut_${i}_${Date.now().toString(36)}`;
    trims[ref] = { start: cut.startSec, end: cut.endSec };
    newOrder.push(ref);
  });
  newOrder.push(...order.slice(idx + 1));
  await mutateProjectState(projectId, {
    timeline: { ...tl, order: newOrder, trims } as never,
  });
}

/**
 * Best-effort extraction of a task id from a coalesced Pika MCP result.
 * Pika's async tools return JSON-in-text like `{"task_id":"abc123", ...}`
 * or explicit `task_id: xyz` lines. Fall back to null (caller then treats
 * the call as sync).
 */
export function extractTaskId(
  result: { text?: string; urls?: string[] } | Record<string, unknown>,
): string | null {
  const text = typeof (result as { text?: unknown }).text === "string"
    ? ((result as { text: string }).text)
    : "";
  if (!text) return null;
  // Try JSON first
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const id = parsed.task_id ?? parsed.taskId ?? parsed.id;
    if (typeof id === "string" && id.length > 0 && id.length < 200) return id;
  } catch {
    /* not json, continue */
  }
  // Regex fallbacks
  const m = text.match(
    /(?:task[_-]?id|taskId)"?\s*[:=]\s*"?([a-zA-Z0-9_\-]{6,})/,
  );
  if (m) return m[1];
  return null;
}

/**
 * Result of a `check_task` poll, normalized.
 */
export type PollOutcome =
  | { status: "succeeded"; urls: string[] }
  | { status: "failed"; error: string }
  | { status: "running" };

export function classifyPoll(
  result: { text?: string; urls?: string[]; ok?: boolean } & Record<
    string,
    unknown
  >,
): PollOutcome {
  const text = (result.text ?? "").toLowerCase();
  const urls = Array.isArray(result.urls) ? result.urls : [];

  // Explicit failure signals
  if (result.ok === false || text.includes("\"status\":\"failed\"") ||
      text.includes("error") && !urls.length && text.includes("failed")) {
    return { status: "failed", error: (result.text ?? "unknown_error").slice(0, 500) };
  }
  if (urls.length > 0 && (text.includes("complete") || text.includes("success") || text.includes("finished") || text.includes("\"status\":\"succ"))) {
    return { status: "succeeded", urls };
  }
  // Sometimes the response is just the asset URL(s) with no explicit status word
  if (urls.length > 0 && !text.includes("pending") && !text.includes("running") && !text.includes("queued") && !text.includes("progress")) {
    return { status: "succeeded", urls };
  }
  return { status: "running" };
}

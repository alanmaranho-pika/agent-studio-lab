// Shared helpers for creating/swapping/dropping "pending" placeholder
// assets used by Agent Mode's run_model_app + pollProjectJob and other
// callers that want the "rendering slot in the timeline" UX pioneered
// by short-film / product-ad in Default mode.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  applyPatch,
  INITIAL_PROJECT,
  PENDING_MIME,
  type ProjectPatch,
  type ProjectState,
} from "@/lib/project-state";

const SEP = "::timeline-instance::";
const newOrderUid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export type PlaceholderTarget = "video" | "audio";

/** Create a pending asset row and append a ref to the timeline. */
export async function createProjectPlaceholder(opts: {
  projectId: string;
  target: PlaceholderTarget;
  label: string;
  durationSec: number;
}): Promise<{ placeholderId: string }> {
  const { projectId, target, label, durationSec } = opts;

  const { data: proj, error: projErr } = await supabaseAdmin
    .from("projects")
    .select("project_state")
    .eq("id", projectId)
    .maybeSingle();
  if (projErr || !proj) throw new Error(projErr?.message ?? "Project not found");

  const { data: row, error: insErr } = await supabaseAdmin
    .from("project_assets")
    .insert({
      project_id: projectId,
      kind: "pending",
      mime: PENDING_MIME,
      name: label,
      label,
      duration: durationSec,
      url: "",
      storage_path: null,
    })
    .select("id")
    .single();
  if (insErr || !row) throw new Error(insErr?.message ?? "placeholder insert failed");

  const placeholderId = row.id as string;
  const baseState =
    (proj.project_state as ProjectState | null) ?? INITIAL_PROJECT;
  const ref = `${placeholderId}${SEP}${newOrderUid()}`;

  let patch: ProjectPatch;
  if (target === "video") {
    const curOrder = baseState.timeline?.order ?? [];
    patch = { timeline: { order: [...curOrder, ref], seeded: true } };
  } else {
    const curTracks = baseState.timeline?.tracks ?? [];
    const a1Idx = curTracks.findIndex((t) => t.id === "a1");
    const nextTracks =
      a1Idx >= 0
        ? curTracks.map((t, i) =>
            i === a1Idx ? { ...t, order: [...t.order, ref] } : t,
          )
        : [
            ...curTracks,
            { id: "a1", kind: "audio" as const, name: "A1", order: [ref] },
          ];
    patch = { timeline: { tracks: nextTracks, seeded: true } };
  }

  const nextState = applyPatch(baseState, patch);
  const { error: upErr } = await supabaseAdmin
    .from("projects")
    .update({
      project_state: nextState as unknown as never,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (upErr) throw new Error(upErr.message);

  return { placeholderId };
}

/**
 * Swap a placeholder ref for the real asset id in timeline order + tracks,
 * or drop it entirely when realAssetId is null (failure path). Deletes the
 * placeholder row so nothing dangling is left behind.
 */
export async function finalizeProjectPlaceholder(opts: {
  projectId: string;
  placeholderId: string;
  realAssetId: string | null;
}): Promise<void> {
  const { projectId, placeholderId, realAssetId } = opts;
  const { data: proj, error: projErr } = await supabaseAdmin
    .from("projects")
    .select("project_state")
    .eq("id", projectId)
    .maybeSingle();
  if (projErr || !proj) return;
  const state =
    (proj.project_state as ProjectState | null) ?? INITIAL_PROJECT;
  const curOrder = state.timeline?.order ?? [];
  const curTracks = state.timeline?.tracks ?? [];
  const idOf = (ref: string) =>
    ref.includes(SEP) ? ref.split(SEP)[0] : ref;
  const swapOrDrop = (refs: string[]) =>
    realAssetId
      ? refs.map((ref) =>
          idOf(ref) === placeholderId
            ? `${realAssetId}${SEP}${newOrderUid()}`
            : ref,
        )
      : refs.filter((ref) => idOf(ref) !== placeholderId);
  const nextOrder = swapOrDrop(curOrder);
  const nextTracks = curTracks.map((t) => ({
    ...t,
    order: swapOrDrop(t.order),
  }));
  const nextState = applyPatch(state, {
    timeline: { order: nextOrder, tracks: nextTracks, seeded: true },
  });
  await supabaseAdmin
    .from("projects")
    .update({
      project_state: nextState as unknown as never,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  await supabaseAdmin
    .from("project_assets")
    .delete()
    .eq("id", placeholderId)
    .eq("project_id", projectId);
}

/**
 * Append a finished asset directly to the timeline. Used as a fallback in
 * pollProjectJob when a placeholder was never created (older jobs or the
 * placeholder insert failed at submit time). Without this, finished renders
 * would land in Outputs but never on the timeline — the agent would claim
 * clips are on the timeline that aren't.
 */
export async function appendAssetToTimeline(opts: {
  projectId: string;
  assetId: string;
  target: PlaceholderTarget;
}): Promise<void> {
  const { projectId, assetId, target } = opts;
  const { data: proj, error: projErr } = await supabaseAdmin
    .from("projects")
    .select("project_state")
    .eq("id", projectId)
    .maybeSingle();
  if (projErr || !proj) return;
  const state = (proj.project_state as ProjectState | null) ?? INITIAL_PROJECT;
  const ref = `${assetId}${SEP}${newOrderUid()}`;
  let patch: ProjectPatch;
  if (target === "video") {
    const curOrder = state.timeline?.order ?? [];
    if (curOrder.some((r) => (r.includes(SEP) ? r.split(SEP)[0] : r) === assetId)) return;
    patch = { timeline: { order: [...curOrder, ref], seeded: true } };
  } else {
    const curTracks = state.timeline?.tracks ?? [];
    const a1Idx = curTracks.findIndex((t) => t.id === "a1");
    const already = curTracks.some((t) =>
      t.order.some((r) => (r.includes(SEP) ? r.split(SEP)[0] : r) === assetId),
    );
    if (already) return;
    const nextTracks =
      a1Idx >= 0
        ? curTracks.map((t, i) =>
            i === a1Idx ? { ...t, order: [...t.order, ref] } : t,
          )
        : [
            ...curTracks,
            { id: "a1", kind: "audio" as const, name: "A1", order: [ref] },
          ];
    patch = { timeline: { tracks: nextTracks, seeded: true } };
  }
  const nextState = applyPatch(state, patch);
  await supabaseAdmin
    .from("projects")
    .update({
      project_state: nextState as unknown as never,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
}

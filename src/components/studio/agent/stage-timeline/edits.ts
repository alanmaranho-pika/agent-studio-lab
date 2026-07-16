// Pure patch builders for direct timeline edits. applyPatch REPLACES
// `timeline.order` and `timeline.trims` wholesale when present, so every
// builder returns COMPLETE maps — never deltas. The shapes match what the
// v2 timeline panel persists, so a cut edited here opens identically there.

import type {
  ProjectAsset,
  ProjectPatch,
  ProjectState,
  TimelineTrim,
} from "@/lib/project-state";
import {
  MIN_CLIP_SECONDS,
  type TimelineModel,
} from "./use-timeline-model";

/**
 * First direct edit on a scene-derived timeline promotes it to canonical:
 * registers assets for clipUrls that have none, and writes the order.
 * Returns the patch AND the seeded order/refMap so the triggering gesture
 * can compute its own patch against the seeded state synchronously.
 * MUST be gesture-triggered (never from an effect — StrictMode safety).
 */
export function seedTimelinePatch(
  model: TimelineModel,
  project: ProjectState,
): {
  patch: ProjectPatch;
  order: string[];
  /** scene-derived ref (`scene:{id}`) → canonical ref */
  refMap: Map<string, string>;
} {
  const newAssets: Partial<ProjectAsset>[] = [];
  const order: string[] = [];
  const refMap = new Map<string, string>();
  for (const clip of model.clips) {
    if (clip.assetId) {
      order.push(clip.ref);
      refMap.set(clip.ref, clip.ref);
      continue;
    }
    if (!clip.url) continue; // pending clips can't be ordered yet
    const id = crypto.randomUUID();
    newAssets.push({
      id,
      kind: "video",
      mime: "video/mp4",
      name: clip.label,
      url: clip.url,
      attachedTo: clip.sceneId,
      duration: clip.naturalDuration ?? clip.duration,
    });
    order.push(id);
    refMap.set(clip.ref, id);
  }
  for (const a of model.audio) {
    if (a.asset) order.push(a.asset.id);
  }
  const patch: ProjectPatch = {
    ...(newAssets.length ? { assetsAppend: newAssets } : {}),
    timeline: { ...(project.timeline ?? {}), order, seeded: true },
  };
  return { patch, order, refMap };
}

/**
 * Drag-to-reorder: the dragged clip takes the drop position, clips re-sort
 * by start, and the new video order is spliced back into the full order
 * preserving the positions of non-clip refs (audio etc).
 */
export function buildReorderPatch(
  model: TimelineModel,
  order: string[],
  draggedRef: string,
  droppedStartSec: number,
): ProjectPatch {
  const resolved = model.clips
    .map((c) =>
      c.ref === draggedRef
        ? { ref: c.ref, start: droppedStartSec }
        : { ref: c.ref, start: c.start },
    )
    .sort((a, b) => a.start - b.start);
  const clipRefs = new Set(model.clips.map((c) => c.ref));
  let k = 0;
  const nextOrder = order.map((r) => (clipRefs.has(r) ? resolved[k++].ref : r));
  return { timeline: { order: nextOrder, trims: { ...model.trims } } };
}

/** Edge trim with the canonical clamps: min length 0.2s, start ≥ 0,
 *  end ≤ natural duration (600s ceiling for images). */
export function buildTrimPatch(
  model: TimelineModel,
  ref: string,
  next: { start: number; end: number },
  opts: { natural?: number; isImage?: boolean },
): ProjectPatch {
  const maxEnd = opts.isImage ? 600 : opts.natural ?? next.end;
  const start = Math.max(0, Math.min(next.start, next.end - MIN_CLIP_SECONDS));
  const end = Math.max(start + MIN_CLIP_SECONDS, Math.min(next.end, maxEnd));
  const trim: TimelineTrim = { ...model.trims[ref], start, end };
  return { timeline: { trims: { ...model.trims, [ref]: trim } } };
}

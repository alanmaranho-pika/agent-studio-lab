// useTimelineModel — the single source of truth every timeline variant
// renders from. Two paths:
//   • canonical: project.timeline.order is populated → deriveTracks
//     (same ref semantics as the v2 editor: bare asset ids,
//     `::timeline-instance::` clones, `::audio` detached refs)
//   • scenes fallback: no order yet → one clip per scene from clipUrl,
//     butt-joined in scene order (what the agent produces before any edit).
// All variants share this model so a cut looks identical everywhere.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deriveTracks,
  resolveThumb,
  type ProjectAsset,
  type ProjectState,
  type Scene,
  type TimelineTrim,
} from "@/lib/project-state";
import { stableAssetUrl } from "@/lib/v2/stable-asset-url";

export const CLIP_SECONDS = 5;
export const MIN_CLIP_SECONDS = 0.2;
const TIMELINE_INSTANCE_SEP = "::timeline-instance::";
const DETACHED_AUDIO_SUFFIX = "::audio";

export function assetIdFromRef(ref: string): string {
  const stripped = ref.endsWith(DETACHED_AUDIO_SUFFIX)
    ? ref.slice(0, -DETACHED_AUDIO_SUFFIX.length)
    : ref;
  return stripped.includes(TIMELINE_INSTANCE_SEP)
    ? stripped.split(TIMELINE_INSTANCE_SEP)[0]
    : stripped;
}
function isDetachedAudioRef(ref: string): boolean {
  return ref.endsWith(DETACHED_AUDIO_SUFFIX);
}

export type TimelineClip = {
  /** Canonical timeline ref, or `scene:${sceneId}` when scene-derived. */
  ref: string;
  sceneId?: string;
  assetId?: string;
  label: string;
  /** Playable URL ("" while pending). */
  url: string;
  thumb: string;
  kind: "video" | "image" | "pending";
  /** Timeline seconds. */
  start: number;
  duration: number;
  trim: { start: number; end: number };
  naturalDuration?: number;
};

export type TimelineAudio = {
  ref: string;
  asset?: ProjectAsset;
  name: string;
  role: "music" | "sfx" | "voiceover";
  start: number;
  duration: number;
  trim: { start: number; end: number };
};

export type TimelineModel = {
  source: "timeline" | "scenes";
  clips: TimelineClip[];
  audio: TimelineAudio[];
  musicRows: TimelineAudio[];
  sfxRows: TimelineAudio[];
  totalDuration: number;
  focusedScene: { scene: Scene; clips: TimelineClip[]; sfx: TimelineAudio[] } | null;
  getNatural: (assetId: string) => number | undefined;
  /** Effective trims — complete map, safe to spread into edit patches. */
  trims: Record<string, TimelineTrim>;
  /** Effective canonical order ([] when scene-derived). */
  order: string[];
};

/** Probe durations for av assets missing a stored duration (probe once;
 *  failures are marked 0 so they never retry). */
function useProbedDurations(assets: ProjectAsset[]): Record<string, number> {
  const [probed, setProbed] = useState<Record<string, number>>({});
  useEffect(() => {
    const toProbe = assets.filter(
      (a) =>
        (a.mime.startsWith("audio/") || a.mime.startsWith("video/")) &&
        !(typeof a.duration === "number" && a.duration > 0) &&
        probed[a.id] == null &&
        !!a.url,
    );
    if (toProbe.length === 0) return;
    let cancelled = false;
    toProbe.forEach((a) => {
      const el = document.createElement(
        a.mime.startsWith("video/") ? "video" : "audio",
      ) as HTMLMediaElement;
      el.preload = "metadata";
      el.src = a.url;
      el.addEventListener(
        "loadedmetadata",
        () => {
          if (cancelled) return;
          const d = el.duration;
          if (isFinite(d) && d > 0) {
            setProbed((p) => (p[a.id] ? p : { ...p, [a.id]: d }));
          }
          el.src = "";
        },
        { once: true },
      );
      el.addEventListener(
        "error",
        () => {
          if (!cancelled)
            setProbed((p) => (p[a.id] != null ? p : { ...p, [a.id]: 0 }));
        },
        { once: true },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [assets, probed]);
  return probed;
}

function audioRole(kind: ProjectAsset["kind"]): TimelineAudio["role"] {
  if (kind === "voiceover") return "voiceover";
  if (kind === "audio") return "sfx";
  return "music";
}

export function useTimelineModel(
  project: ProjectState,
  assets: ProjectAsset[],
  focusSceneId?: string,
): TimelineModel {
  const probed = useProbedDurations(assets);
  const timeline = project.timeline;
  const scenes = useMemo(() => project.scenes ?? [], [project.scenes]);

  const assetsById = useMemo(
    () => new Map(assets.map((a) => [a.id, a] as const)),
    [assets],
  );

  const getNatural = useCallback(
    (id: string): number | undefined => {
      const a = assetsById.get(id);
      if (a && typeof a.duration === "number" && a.duration > 0) return a.duration;
      const p = probed[id];
      return p && p > 0 ? p : undefined;
    },
    [assetsById, probed],
  );

  return useMemo<TimelineModel>(() => {
    const trims: Record<string, TimelineTrim> = { ...(timeline?.trims ?? {}) };
    const order = timeline?.order ?? [];
    const hasCanonical = order.some((ref) => {
      const a = assetsById.get(assetIdFromRef(ref));
      return !!a;
    });

    const getTrim = (ref: string): { start: number; end: number } => {
      const t = trims[ref];
      if (t && (t.end ?? 0) > (t.start ?? 0)) return { start: t.start, end: t.end };
      const a = assetsById.get(assetIdFromRef(ref));
      const nat =
        a && (a.mime.startsWith("video/") || a.mime.startsWith("audio/"))
          ? getNatural(a.id)
          : undefined;
      return { start: 0, end: nat ?? CLIP_SECONDS };
    };
    const getDur = (ref: string): number => {
      const t = getTrim(ref);
      return Math.max(MIN_CLIP_SECONDS, t.end - t.start);
    };

    const clips: TimelineClip[] = [];
    const audio: TimelineAudio[] = [];

    if (hasCanonical) {
      const tracks = deriveTracks({ assets, timeline });
      for (const tr of tracks) {
        let cursor = 0;
        for (const ref of tr.order) {
          const a = assetsById.get(assetIdFromRef(ref));
          if (!a) continue;
          const detached = isDetachedAudioRef(ref);
          const trim = getTrim(ref);
          const dur = getDur(ref);
          const start =
            typeof trims[ref]?.offset === "number" ? trims[ref].offset! : cursor;
          if (tr.kind === "video") {
            if (detached) continue;
            const visual =
              a.mime.startsWith("image/") ||
              a.mime.startsWith("video/") ||
              a.kind === "pending";
            if (!visual) continue;
            const scene = scenes.find(
              (s) => a.attachedTo === s.id || (s.clipUrl && resolveThumb(s.clipUrl, assets) === a.url),
            );
            clips.push({
              ref,
              sceneId: scene?.id,
              assetId: a.id,
              label: a.label ?? a.name ?? (scene ? `Shot ${scene.n}` : "Clip"),
              url: a.kind === "pending" ? "" : stableAssetUrl(a.id, a.url),
              thumb: scene
                ? stableAssetUrl(scene.id, resolveThumb(scene.thumb, assets))
                : stableAssetUrl(a.id, a.url),
              kind: a.kind === "pending"
                ? "pending"
                : a.mime.startsWith("image/")
                  ? "image"
                  : "video",
              start,
              duration: dur,
              trim,
              naturalDuration: getNatural(a.id),
            });
            cursor = start + dur;
          } else {
            const ok = a.mime.startsWith("audio/") || (detached && a.mime.startsWith("video/"));
            if (!ok) continue;
            audio.push({
              ref,
              asset: a,
              name: a.label ?? a.name ?? "Audio",
              role: audioRole(a.kind),
              start,
              duration: dur,
              trim,
            });
            cursor = start + dur;
          }
        }
      }
    } else {
      // Scene-derived fallback — one clip per scene, butt-joined.
      let cursor = 0;
      for (const s of scenes) {
        const src = s.clipUrl ? resolveThumb(s.clipUrl, assets) : "";
        const dur = Math.max(MIN_CLIP_SECONDS, s.duration || CLIP_SECONDS);
        clips.push({
          ref: `scene:${s.id}`,
          sceneId: s.id,
          label: s.title || `Shot ${s.n}`,
          url: src ? stableAssetUrl(s.id + ":clip", src) : "",
          thumb: stableAssetUrl(s.id, resolveThumb(s.thumb, assets)),
          kind: src ? "video" : "pending",
          start: cursor,
          duration: dur,
          trim: { start: 0, end: dur },
        });
        cursor += dur;
      }
      // All audio-kind assets become rows starting at 0 (music) — the agent
      // hasn't positioned anything yet.
      for (const a of assets) {
        if (!a.mime.startsWith("audio/")) continue;
        if (!(a.kind === "music" || a.kind === "voiceover" || a.kind === "audio")) continue;
        const nat = getNatural(a.id) ?? CLIP_SECONDS;
        audio.push({
          ref: a.id,
          asset: a,
          name: a.label ?? a.name ?? "Audio",
          role: audioRole(a.kind),
          start: 0,
          duration: nat,
          trim: { start: 0, end: nat },
        });
      }
    }

    const videoEnd = clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    const audioEnd = audio.reduce((m, a) => Math.max(m, a.start + a.duration), 0);
    const totalDuration = Math.max(videoEnd, audioEnd, 0.1);

    const musicRows = audio.filter((a) => a.role === "music" || a.role === "voiceover");
    const sfxRows = audio.filter((a) => a.role === "sfx");

    const focusScene =
      (focusSceneId ? scenes.find((s) => s.id === focusSceneId) : undefined) ??
      scenes[0];
    const focusedScene = focusScene
      ? {
          scene: focusScene,
          clips: clips.filter((c) => c.sceneId === focusScene.id),
          sfx: audio.filter((a) => a.asset?.attachedTo === focusScene.id),
        }
      : null;

    return {
      source: hasCanonical ? "timeline" : "scenes",
      clips,
      audio,
      musicRows,
      sfxRows,
      totalDuration,
      focusedScene,
      getNatural,
      trims,
      order: hasCanonical ? [...order] : [],
    };
  }, [timeline, scenes, assets, assetsById, getNatural, focusSceneId]);
}

// Editor variant — reference design #2: transport + timecode top-left,
// Split + zoom top-right; gutter-labeled lanes (VIDEO / MUSIC / SFX) with
// the orange playhead crossing all of them. Direct edits: drag a clip body
// to reorder, drag its edges to trim — live local preview during the
// gesture, ONE ProjectPatch committed on pointerup. The first edit on a
// scene-derived timeline seeds the canonical order in the same patch.

import { useCallback, useMemo, useRef, useState } from "react";
import { Minus, Plus, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ProjectAsset,
  ProjectPatch,
  ProjectState,
} from "@/lib/project-state";
import type { StageIntent } from "@/components/studio/agent/intents";
import {
  MIN_CLIP_SECONDS,
  type TimelineClip,
  type TimelineModel,
} from "./use-timeline-model";
import { useTimelinePlayback } from "./use-timeline-playback";
import { buildReorderPatch, buildTrimPatch, seedTimelinePatch } from "./edits";
import {
  AudioWaveRow,
  ClipChip,
  PlayheadLayer,
  TimeRuler,
  TimecodeLabel,
  TransportControls,
} from "./primitives";

const SNAP_FRACTION = 0.015; // ~12px at typical lane widths

type Gesture =
  | { type: "move"; ref: string; startX: number; laneWidth: number; deltaSec: number }
  | {
      type: "trim";
      ref: string;
      edge: "start" | "end";
      startX: number;
      laneWidth: number;
      base: { start: number; end: number };
      next: { start: number; end: number };
    };

export function TimelineEditor({
  model,
  project,
  onPatch,
  onIntent,
}: {
  model: TimelineModel;
  project: ProjectState;
  assets: ProjectAsset[];
  onPatch?: (patch: ProjectPatch) => void;
  onIntent?: (intent: StageIntent) => void;
}) {
  const playback = useTimelinePlayback(model);
  const { activeClip, isPlaying, togglePlay, stepClip, seek, pause } = playback;
  const [zoom, setZoom] = useState(1);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  gestureRef.current = gesture;

  const total = model.totalDuration;
  const editable = !!onPatch;

  // Live gesture preview: clips with the in-flight move/trim applied.
  const previewClips = useMemo<TimelineClip[]>(() => {
    const g = gesture;
    if (!g) return model.clips;
    if (g.type === "trim") {
      return model.clips.map((c) =>
        c.ref === g.ref
          ? {
              ...c,
              trim: g.next,
              duration: Math.max(MIN_CLIP_SECONDS, g.next.end - g.next.start),
            }
          : c,
      );
    }
    // move: re-sort by shifted start
    const shifted = model.clips.map((c) =>
      c.ref === g.ref ? { ...c, start: c.start + g.deltaSec } : c,
    );
    return [...shifted].sort((a, b) => a.start - b.start);
  }, [gesture, model.clips]);

  /** Commit helper — seeds the canonical order first when needed. */
  const commit = useCallback(
    (make: (m: TimelineModel, order: string[], refMap: Map<string, string>) => ProjectPatch) => {
      if (!onPatch) return;
      if (model.source === "scenes") {
        const seeded = seedTimelinePatch(model, project);
        const gesturePatch = make(model, seeded.order, seeded.refMap);
        // Merge: seed assets/order + gesture's timeline fields (gesture wins).
        onPatch({
          ...seeded.patch,
          timeline: {
            ...(seeded.patch.timeline ?? {}),
            ...(gesturePatch.timeline ?? {}),
          },
        });
      } else {
        const identity = new Map(model.clips.map((c) => [c.ref, c.ref] as const));
        onPatch(make(model, model.order, identity));
      }
    },
    [onPatch, model, project],
  );

  const secondsPerPx = useCallback(() => {
    const w = laneRef.current?.getBoundingClientRect().width ?? 1;
    return total / (w * zoom);
  }, [total, zoom]);

  const beginMove = useCallback(
    (clip: TimelineClip, e: React.PointerEvent) => {
      if (!editable || clip.kind === "pending") return;
      e.preventDefault();
      e.stopPropagation();
      pause();
      const laneWidth = laneRef.current?.getBoundingClientRect().width ?? 1;
      const start: Gesture = {
        type: "move",
        ref: clip.ref,
        startX: e.clientX,
        laneWidth,
        deltaSec: 0,
      };
      setGesture(start);
      const spp = secondsPerPx();
      const move = (ev: PointerEvent) => {
        const deltaSec = (ev.clientX - start.startX) * spp;
        setGesture({ ...start, deltaSec });
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const deltaSec = (ev.clientX - start.startX) * spp;
        setGesture(null);
        if (Math.abs(deltaSec) * (1 / spp) < 4) return; // click, not a drag
        let dropped = clip.start + deltaSec;
        // Snap to neighbor edges + playhead.
        const snapSec = total * SNAP_FRACTION;
        const targets = [
          playback.currentTimeRef.current,
          ...model.clips.filter((c) => c.ref !== clip.ref).flatMap((c) => [c.start, c.start + c.duration]),
        ];
        for (const t of targets) {
          if (Math.abs(dropped - t) < snapSec) {
            dropped = t;
            break;
          }
        }
        commit((m, order, refMap) =>
          buildReorderPatch(m, order, refMap.get(clip.ref) ?? clip.ref, dropped),
        );
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [editable, pause, secondsPerPx, total, model.clips, playback.currentTimeRef, commit],
  );

  const beginTrim = useCallback(
    (clip: TimelineClip, edge: "start" | "end", e: React.PointerEvent) => {
      if (!editable || clip.kind === "pending") return;
      e.preventDefault();
      e.stopPropagation();
      pause();
      const laneWidth = laneRef.current?.getBoundingClientRect().width ?? 1;
      const base = { ...clip.trim };
      const startState: Gesture = {
        type: "trim",
        ref: clip.ref,
        edge,
        startX: e.clientX,
        laneWidth,
        base,
        next: { ...base },
      };
      setGesture(startState);
      const spp = secondsPerPx();
      const natural = clip.assetId ? model.getNatural(clip.assetId) : clip.naturalDuration;
      const isImage = clip.kind === "image";
      const maxEnd = isImage ? 600 : natural ?? base.end;
      const compute = (ev: PointerEvent) => {
        const dSec = (ev.clientX - startState.startX) * spp;
        if (edge === "end") {
          const end = Math.max(
            base.start + MIN_CLIP_SECONDS,
            Math.min(maxEnd, base.end + dSec),
          );
          return { start: base.start, end };
        }
        const start = Math.min(
          Math.max(0, base.start + dSec),
          base.end - MIN_CLIP_SECONDS,
        );
        return { start, end: base.end };
      };
      const move = (ev: PointerEvent) => {
        setGesture({ ...startState, next: compute(ev) });
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const next = compute(ev);
        setGesture(null);
        if (
          Math.abs(next.start - base.start) < 0.01 &&
          Math.abs(next.end - base.end) < 0.01
        )
          return;
        commit((m, _order, refMap) =>
          buildTrimPatch(m, refMap.get(clip.ref) ?? clip.ref, next, {
            natural,
            isImage,
          }),
        );
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [editable, pause, secondsPerPx, model, commit],
  );

  const gutter = "w-14 shrink-0 pt-1 text-right pr-3";
  const laneWrap = { width: `${zoom * 100}%` };

  return (
    <div className="flex h-full min-h-[380px] w-full flex-col gap-3">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TransportControls
            isPlaying={isPlaying}
            onToggle={togglePlay}
            onPrev={() => stepClip(-1)}
            onNext={() => stepClip(1)}
          />
          <TimecodeLabel
            subscribeTime={playback.subscribeTime}
            totalDuration={total}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {onIntent && (
            <button
              type="button"
              onClick={() =>
                onIntent({
                  kind: "compose",
                  text: "Split the clip under the playhead.",
                })
              }
              className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-foreground transition hover:bg-[color:var(--surface-dark-5)]"
              style={{ background: "var(--surface-dark-6)" }}
            >
              <Scissors className="h-3.5 w-3.5" />
              Split
            </button>
          )}
          {([["-", -0.25, Minus] as const, ["+", 0.25, Plus] as const]).map(
            ([label, delta, Icon]) => (
              <button
                key={label}
                type="button"
                aria-label={`Zoom ${label}`}
                onClick={() =>
                  setZoom((z) => Math.min(2.5, Math.max(0.5, +(z + delta).toFixed(2))))
                }
                className="grid h-8 w-8 place-items-center rounded-full text-foreground transition hover:bg-[color:var(--surface-dark-5)]"
                style={{ background: "var(--surface-dark-6)" }}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ),
          )}
        </div>
      </div>

      {/* Lanes */}
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex" style={laneWrap}>
          <div className={gutter} />
          <div className="min-w-0 flex-1">
            <TimeRuler totalDuration={total} onSeek={seek} labelStyle="timecode" />
          </div>
        </div>
        <div className="flex" style={laneWrap}>
          <div className={cn(gutter, "flex flex-col gap-[26px] pt-4")}>
            <span
              className="font-display text-[10px] font-medium uppercase tracking-[0.22em]"
              style={{ color: "var(--content-dark-tertiary)" }}
            >
              Video
            </span>
            {model.musicRows.length > 0 && (
              <span
                className="font-display text-[10px] font-medium uppercase tracking-[0.22em]"
                style={{ color: "var(--content-dark-tertiary)" }}
              >
                Music
              </span>
            )}
            {model.sfxRows.length > 0 && (
              <span
                className="font-display text-[10px] font-medium uppercase tracking-[0.22em]"
                style={{ color: "var(--content-dark-tertiary)" }}
              >
                SFX
              </span>
            )}
          </div>
          <div ref={laneRef} className="relative min-w-0 flex-1 pt-2">
            <div className="flex flex-col gap-2">
              {/* VIDEO lane */}
              <div className="flex items-stretch gap-1">
                {previewClips.length === 0 && (
                  <div
                    className="flex h-14 w-full items-center justify-center rounded-[var(--radius-sm)] font-mono text-[10px] uppercase tracking-[0.18em]"
                    style={{
                      color: "var(--content-dark-tertiary)",
                      background: "var(--surface-dark-6)",
                    }}
                  >
                    No clips yet
                  </div>
                )}
                {previewClips.map((clip) => {
                  const dragging = gesture?.type === "move" && gesture.ref === clip.ref;
                  return (
                    <div
                      key={clip.ref}
                      className={cn(
                        "group/clip relative flex min-w-[44px] items-stretch",
                        editable && clip.kind !== "pending" && "cursor-grab",
                        dragging && "cursor-grabbing opacity-80",
                      )}
                      style={{ flexGrow: clip.duration || 1, flexBasis: 0 }}
                      onPointerDown={(e) => {
                        // Edge zones trim; body drags (or seeks on click).
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        if (editable && x <= 8) return beginTrim(clip, "start", e);
                        if (editable && x >= rect.width - 8) return beginTrim(clip, "end", e);
                        if (editable) return beginMove(clip, e);
                        const frac = Math.max(0, Math.min(1, x / rect.width));
                        seek(clip.start + frac * clip.duration);
                      }}
                    >
                      <div className="w-full [&>*]:w-full">
                        <ClipChip
                          clip={clip}
                          active={activeClip?.ref === clip.ref}
                          showLabel
                        />
                      </div>
                      {editable && clip.kind !== "pending" && (
                        <>
                          <span className="absolute inset-y-1 left-0.5 w-1 rounded-full bg-white/70 opacity-0 transition group-hover/clip:opacity-100" />
                          <span className="absolute inset-y-1 right-0.5 w-1 rounded-full bg-white/70 opacity-0 transition group-hover/clip:opacity-100" />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* MUSIC lane */}
              {model.musicRows.length > 0 && (
                <AudioWaveRow entries={model.musicRows} totalDuration={total} />
              )}
              {/* SFX lane */}
              {model.sfxRows.length > 0 && (
                <AudioWaveRow entries={model.sfxRows} totalDuration={total} compact />
              )}
            </div>
            <PlayheadLayer
              subscribeTime={playback.subscribeTime}
              range={{ start: 0, end: total }}
            />
          </div>
        </div>
      </div>

      {/* Hidden audio pool */}
      {model.audio.map(
        (a) =>
          a.asset && (
            <audio
              key={a.ref}
              src={a.asset.url}
              ref={(el) => playback.registerAudio(a.ref, el)}
              preload="auto"
              className="hidden"
            />
          ),
      )}
    </div>
  );
}

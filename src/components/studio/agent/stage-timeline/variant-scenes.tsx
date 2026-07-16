// Scenes variant — one focused scene (reference design #3): hero player
// with a "Scene 1 · Convoy at dusk" chip and big display title, then a
// light panel: "Scene 1 · 3 clips", the scene's clip strip with playhead,
// right-aligned cumulative time markers, and SFX/VO chips.

import { Loader2, Play, Pause, AudioLines } from "lucide-react";
import type { ProjectAsset, ProjectState } from "@/lib/project-state";
import type { TimelineModel } from "./use-timeline-model";
import { useTimelinePlayback } from "./use-timeline-playback";
import {
  ClipStrip,
  PlayheadLayer,
  formatTimecode,
} from "./primitives";

export function TimelineScenes({
  model,
  project,
}: {
  model: TimelineModel;
  project: ProjectState;
  assets: ProjectAsset[];
}) {
  const focus = model.focusedScene;
  const sceneClips = focus?.clips ?? [];
  const first = sceneClips[0];
  const last = sceneClips[sceneClips.length - 1];
  const range = first
    ? { start: first.start, end: last.start + last.duration }
    : { start: 0, end: model.totalDuration };
  const playback = useTimelinePlayback(model, { range });
  const { activeClip, isPlaying, togglePlay, seek } = playback;

  if (!focus) {
    return (
      <div
        className="grid h-full min-h-[300px] w-full place-items-center rounded-[var(--radius-xl)] font-mono text-[10px] uppercase tracking-[0.22em]"
        style={{ background: "var(--surface-dark-6)", color: "var(--content-dark-tertiary)" }}
      >
        No scenes yet
      </div>
    );
  }

  const { scene } = focus;
  const heroClip =
    (activeClip && sceneClips.some((c) => c.ref === activeClip.ref) && activeClip) ||
    sceneClips.find((c) => c.url) ||
    null;
  // Cumulative markers: 0:00 … scene length, one per clip boundary.
  const markers: number[] = [0];
  let acc = 0;
  for (const c of sceneClips) {
    acc += c.duration;
    markers.push(Math.round(acc));
  }

  return (
    <div className="flex h-full min-h-[420px] w-full flex-col gap-3">
      {/* Hero player */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[var(--radius-xl)] bg-black text-white">
        {heroClip && heroClip.kind === "video" && heroClip.url ? (
          <video
            key={heroClip.ref}
            ref={playback.videoRef}
            src={heroClip.url}
            className="h-full w-full object-cover"
            playsInline
            muted={playback.muted}
          />
        ) : scene.thumb ? (
          <img
            src={focus.clips[0]?.thumb || scene.thumb}
            alt={scene.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/50">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
              Rendering…
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50" />
        {/* Scene chip */}
        <span className="absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-medium text-white/95">
          Scene {scene.n}{scene.title ? ` · ${scene.title}` : ""}
        </span>
        {/* Display title */}
        <div className="absolute bottom-5 left-5 right-5">
          <div className="font-display text-[clamp(22px,3vw,40px)] font-medium uppercase leading-none tracking-wide text-white drop-shadow">
            {project.meta?.title ?? scene.title}
          </div>
        </div>
        {sceneClips.some((c) => c.url) && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="group absolute inset-0 flex items-center justify-center"
          >
            <span
              className={
                "grid h-14 w-14 place-items-center rounded-full bg-white/90 text-black transition " +
                (isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100")
              }
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6 translate-x-[2px]" />
              )}
            </span>
          </button>
        )}
      </div>

      {/* Scene clips panel */}
      <div
        className="flex flex-col gap-2 rounded-[var(--radius-md)] p-3"
        style={{ background: "var(--surface-light-1)", border: "1px solid var(--surface-dark-6)" }}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-semibold text-foreground">
            Scene {scene.n} · {sceneClips.length} clip{sceneClips.length === 1 ? "" : "s"}
          </span>
          <span
            className="flex gap-3 font-mono text-[10px]"
            style={{ color: "var(--content-dark-tertiary)" }}
          >
            {markers.map((m, i) => (
              <span key={i}>{formatTimecode(m)}</span>
            ))}
          </span>
        </div>
        <div className="relative">
          <ClipStrip
            clips={sceneClips}
            onSeek={seek}
            activeRef={activeClip?.ref ?? null}
          />
          <PlayheadLayer subscribeTime={playback.subscribeTime} range={range} />
        </div>
        {(focus.sfx.length > 0 || scene.voPrompt) && (
          <div
            className="flex items-center gap-2 rounded-[var(--radius-xs)] px-2.5 py-1.5 text-[11px] font-medium"
            style={{
              background: "var(--surface-accent-4, rgba(207,195,255,0.25))",
              color: "#806ECA",
            }}
          >
            <AudioLines className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {focus.sfx.length > 0
                ? `SFX · ${focus.sfx.map((s) => s.name).join(", ")}`
                : `VO · ${scene.voPrompt}`}
            </span>
          </div>
        )}
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

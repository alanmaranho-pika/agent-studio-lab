// Preview variant — the default timeline surface (reference design #1):
// black letterboxed player on the light stage canvas, seconds ruler, one
// proportional clip strip with a "+" add tile, a lavender audio row, and
// the orange playhead crossing strip + audio. CTAs come from the stage
// actions row rendered by StageGenerationView.

import { Play, Pause, Plus } from "lucide-react";
import { RenderingCell } from "@/components/studio/agent/rendering-cell";
import type { ProjectAsset, ProjectState } from "@/lib/project-state";
import type { StageIntent } from "@/components/studio/agent/intents";
import type { TimelineModel } from "./use-timeline-model";
import { useTimelinePlayback } from "./use-timeline-playback";
import {
  AudioWaveRow,
  ClipStrip,
  PlayheadLayer,
  TimeRuler,
} from "./primitives";

export function TimelinePreview({
  model,
  project,
  onIntent,
}: {
  model: TimelineModel;
  project: ProjectState;
  assets: ProjectAsset[];
  onIntent?: (intent: StageIntent) => void;
}) {
  const playback = useTimelinePlayback(model);
  const { activeClip, isPlaying, togglePlay, seek } = playback;
  const hasClips = model.clips.length > 0;
  const playableClip = activeClip ?? model.clips.find((c) => c.url) ?? null;

  return (
    <div className="flex h-full min-h-[420px] w-full flex-col gap-3">
      {/* Player — black letterbox frame */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[var(--radius-xl)] bg-black text-white">
        {playableClip && playableClip.kind === "video" && playableClip.url ? (
          <video
            key={playableClip.ref}
            ref={playback.videoRef}
            src={playableClip.url}
            className="h-full w-full object-contain"
            playsInline
            muted={playback.muted}
          />
        ) : playableClip && playableClip.kind === "image" && playableClip.url ? (
          <img
            key={playableClip.ref}
            src={playableClip.url}
            alt={playableClip.label}
            className="h-full w-full object-contain"
          />
        ) : playableClip && playableClip.kind === "pending" ? (
          <RenderingCell />
        ) : (
          <div className="grid h-full w-full place-items-center font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
            Waiting for a first clip…
          </div>
        )}
        {hasClips && (
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

      {/* Ruler */}
      <TimeRuler
        totalDuration={model.totalDuration}
        onSeek={seek}
        labelStyle="seconds"
        className="px-0.5"
      />

      {/* Tracks + playhead */}
      <div className="relative flex flex-col gap-2">
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1">
            <ClipStrip
              clips={model.clips}
              onSeek={seek}
              activeRef={activeClip?.ref ?? null}
            />
          </div>
          {onIntent && (
            <button
              type="button"
              aria-label="Add another clip"
              title="Add another clip"
              onClick={() =>
                onIntent({
                  kind: "compose",
                  text: "Add another clip to the timeline.",
                })
              }
              className="grid h-14 w-10 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-dashed transition hover:bg-[color:var(--surface-dark-6)]"
              style={{
                borderColor: "var(--surface-dark-5)",
                color: "var(--content-dark-tertiary)",
              }}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
        {model.audio.length > 0 && (
          <div style={{ paddingRight: onIntent ? 48 : 0 }}>
            <AudioWaveRow
              name={
                model.audio[0]?.name ?? project.music?.title ?? "Audio"
              }
              entries={model.audio}
              totalDuration={model.totalDuration}
            />
          </div>
        )}
        {/* Playhead spans strip + audio (excludes the add tile column). */}
        <div
          className="pointer-events-none absolute inset-y-0"
          style={{ left: 0, right: onIntent ? 48 : 0 }}
        >
          <div className="relative h-full w-full">
            <PlayheadLayer
              subscribeTime={playback.subscribeTime}
              range={{ start: 0, end: model.totalDuration }}
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

// Shared timeline primitives — every variant composes ONLY these, so a
// timeline reads identically whether it's the preview strip, the full
// editor, or a focused scene panel. Visual language (from the reference):
// light stage canvas, Space Mono meta, dark filmstrip clip chips with
// 12px radius, lavender audio lanes, orange --timeline-playhead line.

import { useEffect, useRef } from "react";
import { Music, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { RenderingCell } from "@/components/studio/agent/rendering-cell";
import type { TimelineAudio, TimelineClip } from "./use-timeline-model";
import { WaveformSlice } from "./waveform";

export function formatTimecode(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Pointer-drag scrub shared by ruler + strips: converts clientX within the
 *  element to seconds and keeps reporting through a window-level drag. */
export function attachScrub(
  el: HTMLElement,
  totalDuration: number,
  onSeek: (t: number) => void,
  e: React.PointerEvent,
) {
  const rect = el.getBoundingClientRect();
  const toSeconds = (clientX: number) =>
    Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * totalDuration;
  onSeek(toSeconds(e.clientX));
  const move = (ev: PointerEvent) => onSeek(toSeconds(ev.clientX));
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// ─── Ruler ───────────────────────────────────────────────────────────────────

export function TimeRuler({
  totalDuration,
  onSeek,
  labelStyle = "seconds",
  className,
}: {
  totalDuration: number;
  onSeek?: (t: number) => void;
  labelStyle?: "seconds" | "timecode";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Major label every ~5s, capped to a sane count for long timelines.
  const step = totalDuration <= 20 ? 5 : totalDuration <= 60 ? 10 : 30;
  const majors: number[] = [];
  for (let t = 0; t <= totalDuration + 0.01; t += step) majors.push(t);

  return (
    <div
      ref={ref}
      className={cn(
        "relative h-5 w-full select-none font-mono text-[10px] leading-none",
        onSeek && "cursor-ew-resize",
        className,
      )}
      style={{ color: "var(--content-dark-tertiary)" }}
      onPointerDown={(e) => {
        if (onSeek && ref.current) attachScrub(ref.current, totalDuration, onSeek, e);
      }}
    >
      {/* minor ticks */}
      <div
        className="absolute inset-x-0 bottom-0 h-1.5"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px calc(100% / 60))",
          opacity: 0.35,
        }}
      />
      {majors.map((t) => (
        <span
          key={t}
          className="absolute bottom-1.5"
          style={{
            left: `${(t / totalDuration) * 100}%`,
            transform: t === 0 ? "none" : "translateX(-50%)",
          }}
        >
          {labelStyle === "seconds" ? `${Math.round(t)}s` : formatTimecode(t)}
        </span>
      ))}
    </div>
  );
}

// ─── Playhead ────────────────────────────────────────────────────────────────

/** Absolute overlay line driven imperatively via subscribeTime — zero React
 *  re-renders. Mount inside a `relative` container spanning the lanes.
 *  `range` maps timeline seconds → the container's 0..100% span. */
export function PlayheadLayer({
  subscribeTime,
  range,
}: {
  subscribeTime: (cb: (t: number) => void) => () => void;
  range: { start: number; end: number };
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    return subscribeTime((t) => {
      const el = ref.current;
      if (!el) return;
      const span = Math.max(0.001, range.end - range.start);
      const pct = Math.max(0, Math.min(1, (t - range.start) / span)) * 100;
      el.style.left = `${pct}%`;
    });
  }, [subscribeTime, range.start, range.end]);
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 z-10 w-[2px] -translate-x-1/2"
      style={{ background: "var(--timeline-playhead)", left: "0%" }}
    >
      <span
        className="absolute -top-[3px] left-1/2 h-[6px] w-[6px] -translate-x-1/2 rounded-full"
        style={{ background: "var(--timeline-playhead)" }}
      />
    </div>
  );
}

/** "00:14 / 00:48" — subscribes to the clock, writes textContent directly. */
export function TimecodeLabel({
  subscribeTime,
  totalDuration,
  className,
}: {
  subscribeTime: (cb: (t: number) => void) => () => void;
  totalDuration: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    let lastText = "";
    return subscribeTime((t) => {
      const el = ref.current;
      if (!el) return;
      const text = formatTimecode(t);
      if (text !== lastText) {
        lastText = text;
        el.textContent = text;
      }
    });
  }, [subscribeTime]);
  return (
    <span
      className={cn("font-mono text-[11px]", className)}
      style={{ color: "var(--content-dark-secondary)" }}
    >
      <span ref={ref}>00:00</span>
      <span style={{ color: "var(--content-dark-tertiary)" }}>
        {" "}
        / {formatTimecode(totalDuration)}
      </span>
    </span>
  );
}

// ─── Transport ───────────────────────────────────────────────────────────────

export function TransportControls({
  isPlaying,
  onToggle,
  onPrev,
  onNext,
}: {
  isPlaying: boolean;
  onToggle: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const btn =
    "grid h-8 w-8 place-items-center rounded-full text-foreground transition hover:bg-[color:var(--surface-dark-5)]";
  return (
    <div className="flex items-center gap-1">
      {onPrev && (
        <button type="button" aria-label="Previous clip" onClick={onPrev} className={btn}>
          <SkipBack className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={onToggle}
        className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-accent-3,#806ECA)] text-white transition hover:opacity-90"
        style={{ background: "#806ECA" }}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
      </button>
      {onNext && (
        <button type="button" aria-label="Next clip" onClick={onNext} className={btn}>
          <SkipForward className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Left-gutter lane label: "VIDEO" / "MUSIC" / "SFX". */
export function TrackLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-display text-[10px] font-medium uppercase tracking-[0.22em]"
      style={{ color: "var(--content-dark-tertiary)" }}
    >
      {children}
    </span>
  );
}

// ─── Clips ───────────────────────────────────────────────────────────────────

export function ClipChip({
  clip,
  active,
  showLabel,
  className,
}: {
  clip: TimelineClip;
  active?: boolean;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative h-14 min-w-[44px] overflow-hidden rounded-[var(--radius-sm)] border bg-black",
        active ? "border-[color:var(--timeline-playhead)]" : "border-black/10",
        className,
      )}
      style={{ flexGrow: clip.duration || 1, flexBasis: 0 }}
      title={`${clip.label} · ${Math.round(clip.duration * 10) / 10}s`}
    >
      {clip.kind === "pending" ? (
        <RenderingCell shader={false} size="sm" label={null} />
      ) : clip.thumb ? (
        <div
          className="h-full w-full"
          style={{
            backgroundImage: `url(${clip.thumb})`,
            backgroundRepeat: "repeat-x",
            backgroundSize: "auto 100%",
          }}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-[10px] text-white/50">
          {clip.label}
        </div>
      )}
      {showLabel && clip.kind !== "pending" && (
        <span className="absolute bottom-1 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white/90">
          {clip.label}
        </span>
      )}
    </div>
  );
}

/**
 * Proportional clip row. Chips flex-grow by duration; clicking seeks to the
 * exact time under the pointer (per-chip rect math so min-width floors don't
 * skew it).
 */
export function ClipStrip({
  clips,
  onSeek,
  activeRef,
  showLabels,
  renderTrailing,
  renderChip,
  className,
}: {
  clips: TimelineClip[];
  onSeek?: (t: number) => void;
  activeRef?: string | null;
  showLabels?: boolean;
  renderTrailing?: () => React.ReactNode;
  /** Editor override — wraps/decorates each chip (drag + trim handles). */
  renderChip?: (clip: TimelineClip, chip: React.ReactNode) => React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full items-stretch gap-1", className)}>
      {clips.length === 0 && (
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
      {clips.map((clip) => {
        const chip = <ClipChip clip={clip} active={activeRef === clip.ref} showLabel={showLabels} />;
        const body = renderChip ? renderChip(clip, chip) : chip;
        return (
          <div
            key={clip.ref}
            className="flex min-w-[44px] items-stretch"
            style={{ flexGrow: clip.duration || 1, flexBasis: 0 }}
            onPointerDown={
              onSeek
                ? (e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const frac = Math.max(
                      0,
                      Math.min(1, (e.clientX - rect.left) / rect.width),
                    );
                    onSeek(clip.start + frac * clip.duration);
                  }
                : undefined
            }
          >
            <div className="flex w-full items-stretch [&>*]:w-full">{body}</div>
          </div>
        );
      })}
      {renderTrailing?.()}
    </div>
  );
}

// ─── Audio ───────────────────────────────────────────────────────────────────

/**
 * Lavender audio lane. Entries are positioned by start/duration within
 * totalDuration; a leading icon + name chip identifies the row.
 */
export function AudioWaveRow({
  name,
  entries,
  totalDuration,
  compact,
  className,
}: {
  name?: string;
  entries: TimelineAudio[];
  totalDuration: number;
  /** SFX-style: short blips without the leading name. */
  compact?: boolean;
  className?: string;
}) {
  if (entries.length === 0) return null;
  const label = name ?? entries[0]?.name ?? "Audio";
  return (
    <div
      className={cn(
        "relative flex h-10 items-center gap-2 overflow-hidden rounded-[var(--radius-sm)] px-2",
        className,
      )}
      style={{
        background: "var(--surface-accent-4, rgba(207,195,255,0.25))",
        color: "#806ECA",
      }}
    >
      {!compact && (
        <>
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
            style={{ background: "rgba(128,110,202,0.25)" }}
          >
            <Music className="h-3 w-3" />
          </span>
          <span className="max-w-[160px] shrink-0 truncate text-[11px] font-medium">
            {label}
          </span>
        </>
      )}
      <div className="relative h-full min-w-0 flex-1">
        {entries.map((a) => (
          <div
            key={a.ref}
            className="absolute inset-y-2"
            style={{
              left: `${(a.start / totalDuration) * 100}%`,
              width: `${Math.max(1.5, (a.duration / totalDuration) * 100)}%`,
            }}
          >
            <WaveformSlice
              asset={a.asset}
              trim={a.trim}
              naturalDuration={a.asset ? undefined : a.duration}
              className="h-full w-full overflow-hidden rounded"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

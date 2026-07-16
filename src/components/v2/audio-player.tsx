import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX, Download } from "lucide-react";
import { cn } from "@/lib/utils";

// Chunky, branded audio player. Replaces the default <audio controls>.
// - Big play/pause
// - Animated bar visualization (deterministic — driven by playback time)
// - Scrubbable progress, current/total time, mute toggle, download link
export function AudioPlayer({
  src,
  title,
  className,
  compact = false,
}: {
  src: string;
  title?: string;
  className?: string;
  /** Tighter layout for inline use in galleries */
  compact?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  // Stabilize src: signed storage URLs get re-signed on every refetch, which
  // would otherwise force the <audio> element to reload mid-playback. Re-mount
  // the audio only when the underlying path (ignoring query/signature) changes.
  const stableSrc = useMemo(() => src, [src.split("?")[0]]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onLoaded = () => setDuration(a.duration || 0);
    const onEnded = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("ended", onEnded);
    };
  }, [stableSrc]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      await a.play().catch(() => {});
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = pct * duration;
    setCurrent(a.currentTime);
  };

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration ? current / duration : 0;
  // Deterministic bar heights — same heights every render, no SSR drift.
  const BARS = compact ? 40 : 64;
  const bars = Array.from({ length: BARS }, (_, i) => {
    // Pseudo-random but stable
    const seed = (Math.sin(i * 1.7) + 1) / 2;
    const env = 0.45 + 0.55 * Math.sin((i / BARS) * Math.PI);
    return 0.25 + 0.75 * seed * env;
  });

  return (
    <div
      className={cn(
        "@container group relative",
        compact ? "p-0" : "py-1",
        className,
      )}
    >
      <audio ref={audioRef} src={stableSrc} preload="metadata" muted={muted} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className={cn(
            "grid shrink-0 place-items-center rounded-full bg-primary/40 text-foreground transition hover:bg-primary/60 active:scale-95",
            compact ? "h-9 w-9" : "h-12 w-12",
          )}
        >
          {playing ? (
            <Pause className={compact ? "h-4 w-4" : "h-5 w-5"} fill="currentColor" />
          ) : (
            <Play
              className={cn(compact ? "h-4 w-4" : "h-5 w-5", "translate-x-[1px]")}
              fill="currentColor"
            />
          )}
        </button>

        <div className="min-w-0 flex-1">
          {/* Waveform-style bars (scrubbable) — hidden when too narrow */}
          <div
            onClick={seek}
            className={cn(
              "hidden cursor-pointer items-center gap-[2px] @[200px]:flex",
              compact ? "h-8" : "h-12",
            )}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={duration || 0}
            aria-valuenow={current}
            tabIndex={0}
          >
            {bars.map((h, i) => {
              const active = i / BARS <= progress;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex-1 rounded-full transition-colors",
                    active ? "bg-primary" : "bg-muted-foreground/25",
                  )}
                  style={{ height: `${h * 100}%` }}
                />
              );
            })}
          </div>

          <div className="mt-1 flex items-center justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
            <span>{fmt(current)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-1 @[240px]:flex">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <a
            href={src}
            download
            target="_blank"
            rel="noreferrer"
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Download"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

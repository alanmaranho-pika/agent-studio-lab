// Audio waveform rendering for the stage timeline. Decoded peaks are cached
// per asset id (module-level) so stage re-renders, variant switches, and
// N segment slices of the same asset never re-fetch or re-decode the audio.
// Moved from stage-generations.tsx; extended with usePeaks + WaveformSlice.

import { useEffect, useState } from "react";
import type { ProjectAsset } from "@/lib/project-state";

const WAVEFORM_BUCKETS = 200;
const waveformPeaksCache = new Map<string, number[]>();

function computePeaks(data: Float32Array, buckets: number): number[] {
  const bucketSize = Math.max(1, Math.floor(data.length / buckets));
  const peaks: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const start = i * bucketSize;
    if (start >= data.length) break;
    const end = Math.min(data.length, start + bucketSize);
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(data[j]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  return peaks;
}

/** Striped placeholder — the pre-waveform look, kept as the fallback. */
export function StripedAudioBar({ className }: { className?: string }) {
  return (
    <div
      className={className ?? "h-4 w-full rounded"}
      style={{
        backgroundImage:
          "repeating-linear-gradient(90deg, rgba(128,110,202,0.55) 0 2px, transparent 2px 4px)",
      }}
    />
  );
}

/** Fetch + decode an audio asset into peak buckets (cached per asset id). */
export function usePeaks(asset?: ProjectAsset): {
  peaks: number[] | null;
  failed: boolean;
} {
  const [peaks, setPeaks] = useState<number[] | null>(() =>
    asset ? waveformPeaksCache.get(asset.id) ?? null : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!asset?.url) return;
    const cached = waveformPeaksCache.get(asset.id);
    if (cached) {
      setPeaks(cached);
      setFailed(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) throw new Error("AudioContext unavailable");
        const res = await fetch(asset.url);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const buf = await res.arrayBuffer();
        const audioCtx = new Ctor();
        try {
          const decoded = await audioCtx.decodeAudioData(buf);
          const next = computePeaks(decoded.getChannelData(0), WAVEFORM_BUCKETS);
          waveformPeaksCache.set(asset.id, next);
          if (!cancelled) {
            setPeaks(next);
            setFailed(false);
          }
        } finally {
          void audioCtx.close();
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset?.id, asset?.url]);

  return { peaks, failed };
}

/** Bars-only SVG renderer for a peaks array. Color via currentColor. */
export function WaveformSvg({
  peaks,
  className,
  barW = 2,
  gap = 1,
  height = 32,
}: {
  peaks: number[];
  className?: string;
  barW?: number;
  gap?: number;
  height?: number;
}) {
  const width = peaks.length * (barW + gap);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className ?? "h-full w-full"}
      aria-hidden
    >
      {peaks.map((p, i) => {
        const h = Math.max(1.5, p * (height - 2));
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={(height - h) / 2}
            width={barW}
            height={h}
            rx={1}
            fill="currentColor"
            opacity={0.7}
          />
        );
      })}
    </svg>
  );
}

/**
 * Waveform for a trimmed window of an audio asset. Slices the cached
 * full-asset peaks by the trim's share of the natural duration — one decode
 * per asset regardless of how many segments reference it.
 */
export function WaveformSlice({
  asset,
  trim,
  naturalDuration,
  className,
}: {
  asset?: ProjectAsset;
  trim?: { start: number; end: number };
  naturalDuration?: number;
  className?: string;
}) {
  const { peaks, failed } = usePeaks(asset);
  if (!asset?.url || failed || !peaks || peaks.length === 0) {
    return <StripedAudioBar className={className ?? "h-4 w-full rounded"} />;
  }
  let sliced = peaks;
  const nat = naturalDuration ?? asset.duration;
  if (trim && nat && nat > 0) {
    const from = Math.max(0, Math.floor((trim.start / nat) * peaks.length));
    const to = Math.min(
      peaks.length,
      Math.max(from + 2, Math.ceil((trim.end / nat) * peaks.length)),
    );
    sliced = peaks.slice(from, to);
  }
  return (
    <div className={className ?? "h-4 w-full overflow-hidden rounded"}>
      <WaveformSvg peaks={sliced} />
    </div>
  );
}

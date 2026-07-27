/**
 * Cloud scene-cut detection via the legacy fal.ai `pyscenedetect` utility.
 *
 * Takes a video URL, returns a list of cut boundaries in seconds. Used by
 * the produce_scene landing path (`pika-jobs.server.ts`) to auto-split a
 * multi-cut Seedance mp4 into per-beat timeline clips, and by the manual
 * `detect_cuts` agent tool.
 *
 * Failure is soft: any error returns an empty list so the caller can fall
 * back to the single-clip path.
 */
import { legacyFalRun } from "@/lib/fal.server";

export type SceneCut = { startSec: number; endSec: number };

type PySceneDetectResponse = {
  scenes?: Array<
    | { start_time?: number; end_time?: number }
    | { start?: number; end?: number }
    | [number, number]
  >;
  cuts?: number[]; // some model versions return raw cut timestamps
};

function normalize(resp: PySceneDetectResponse): SceneCut[] {
  const out: SceneCut[] = [];
  if (Array.isArray(resp.scenes)) {
    for (const s of resp.scenes) {
      if (Array.isArray(s) && s.length >= 2) {
        const [a, b] = s;
        if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
          out.push({ startSec: Number(a), endSec: Number(b) });
        }
        continue;
      }
      const start =
        typeof (s as { start_time?: number }).start_time === "number"
          ? (s as { start_time: number }).start_time
          : typeof (s as { start?: number }).start === "number"
            ? (s as { start: number }).start
            : null;
      const end =
        typeof (s as { end_time?: number }).end_time === "number"
          ? (s as { end_time: number }).end_time
          : typeof (s as { end?: number }).end === "number"
            ? (s as { end: number }).end
            : null;
      if (start !== null && end !== null && end > start) {
        out.push({ startSec: start, endSec: end });
      }
    }
  } else if (Array.isArray(resp.cuts) && resp.cuts.length > 0) {
    // `cuts` is a list of cut TIMESTAMPS; synthesize scenes from them.
    const sorted = [...resp.cuts].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    let prev = 0;
    for (const t of sorted) {
      if (t > prev) out.push({ startSec: prev, endSec: t });
      prev = t;
    }
    // Trailing scene from last cut to end is unknown; leave it out.
  }
  return out;
}

/**
 * Detect cuts in a video URL. Returns an empty array on any failure so the
 * caller can degrade to a single-clip result.
 */
export async function detectSceneCuts(videoUrl: string): Promise<SceneCut[]> {
  if (!videoUrl || !/^https?:/.test(videoUrl)) return [];
  try {
    const resp = await legacyFalRun<PySceneDetectResponse>(
      "fal-ai/pyscenedetect",
      { video_url: videoUrl },
      { label: "pyscenedetect", timeoutMs: 3 * 60_000 },
    );
    return normalize(resp);
  } catch (err) {
    console.warn("[scene-detect] failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

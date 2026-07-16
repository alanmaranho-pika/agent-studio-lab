// Server-only helpers for building Shotstack edit JSON and calling the
// Shotstack API. Keep all process.env reads inside functions, not at
// module scope.

import type { ProjectAsset, TimelineState, TimelineTrim } from "@/lib/project-state";
import type { ExportSettings, ExportResolution, ExportAspect } from "@/lib/export-types";

export type { ExportSettings, ExportResolution, ExportAspect } from "@/lib/export-types";

const TIMELINE_INSTANCE_SEP = "::timeline-instance::";
const DEFAULT_IMAGE_SECONDS = 5;

function assetIdFromRef(ref: string): string {
  return ref.includes(TIMELINE_INSTANCE_SEP)
    ? ref.split(TIMELINE_INSTANCE_SEP)[0]
    : ref;
}

function resolutionToShotstack(r: ExportResolution): string {
  if (r === "480p") return "mobile";
  if (r === "720p") return "hd";
  return "1080";
}

function aspectToShotstack(a: ExportAspect): string | undefined {
  if (a === "original") return undefined;
  return a;
}

// Pick the closest Shotstack-supported aspect ratio for a given w/h.
function inferAspect(width: number, height: number): string {
  const r = width / height;
  const candidates: Array<[string, number]> = [
    ["9:16", 9 / 16],
    ["4:5", 4 / 5],
    ["1:1", 1],
    ["16:9", 16 / 9],
  ];
  let best = candidates[0];
  let bestDiff = Math.abs(Math.log(r / best[1]));
  for (const c of candidates.slice(1)) {
    const d = Math.abs(Math.log(r / c[1]));
    if (d < bestDiff) {
      bestDiff = d;
      best = c;
    }
  }
  return best[0];
}

function trimFor(
  ref: string,
  trims: Record<string, TimelineTrim> | undefined,
  fallback: number,
): TimelineTrim {
  const t = trims?.[ref];
  if (t) return { start: t.start ?? 0, end: t.end ?? fallback, offset: t.offset };
  return { start: 0, end: fallback };
}

export function buildShotstackEdit(args: {
  assets: ProjectAsset[];
  timeline: TimelineState | undefined;
  settings: ExportSettings;
}) {
  const { assets, timeline, settings } = args;
  const byId = new Map(assets.map((a) => [a.id, a] as const));
  const order = timeline?.order ?? [];
  const trims = timeline?.trims ?? {};

  type ClipKind = "video" | "image" | "audio";
  const visualClips: Array<{
    asset: { type: ClipKind; src: string; trim?: number };
    start: number;
    length: number;
  }> = [];
  const audioClips: Array<{
    asset: { type: "audio"; src: string; trim?: number };
    start: number;
    length: number;
  }> = [];

  let visualCursor = 0;
  for (const ref of order) {
    const a = byId.get(assetIdFromRef(ref));
    if (!a?.url) continue;
    const isVideo = a.mime.startsWith("video/");
    const isImage = a.mime.startsWith("image/");
    const isAudio = a.mime.startsWith("audio/");

    if (isImage) {
      const t = trimFor(ref, trims, DEFAULT_IMAGE_SECONDS);
      const length = Math.max(0.2, t.end - t.start);
      visualClips.push({
        asset: { type: "image", src: a.url },
        start: visualCursor,
        length,
      });
      visualCursor += length;
    } else if (isVideo) {
      // For videos with no stored duration, fall back to a generous
      // ceiling instead of the image default (5s) — otherwise the export
      // truncates the clip to 5 seconds while the preview plays in full.
      const natural = typeof a.duration === "number" && a.duration > 0 ? a.duration : 60;
      const t = trimFor(ref, trims, natural);
      const length = Math.max(0.2, t.end - t.start);
      visualClips.push({
        asset: { type: "video", src: a.url, trim: t.start },
        start: visualCursor,
        length,
      });
      visualCursor += length;
    } else if (isAudio && settings.includeMusic) {
      const natural = typeof a.duration === "number" && a.duration > 0 ? a.duration : 30;
      const t = trimFor(ref, trims, natural);
      const length = Math.max(0.2, t.end - t.start);
      audioClips.push({
        asset: { type: "audio", src: a.url, trim: t.start },
        start: 0,
        length,
      });
    }
  }

  if (visualClips.length === 0 && audioClips.length === 0) {
    throw new Error("Timeline is empty — add at least one clip before exporting.");
  }

  // For audio-only export (mp3), require at least one audio clip.
  if (settings.format === "mp3" && audioClips.length === 0) {
    throw new Error("MP3 export requires music on the timeline.");
  }

  // Trim or extend music to visual length if both present.
  if (visualClips.length > 0 && audioClips.length > 0) {
    const total = visualCursor;
    audioClips.forEach((c) => {
      c.length = Math.min(c.length, total);
    });
  }

  const tracks: Array<{ clips: unknown[] }> = [];
  if (visualClips.length > 0) tracks.push({ clips: visualClips });
  if (audioClips.length > 0) tracks.push({ clips: audioClips });

  const bg =
    settings.background === "white"
      ? "#ffffff"
      : settings.background === "transparent"
        ? "#00000000"
        : "#000000";

  const output: Record<string, unknown> = {
    format: settings.format,
    fps: settings.fps,
  };
  if (settings.format !== "mp3") {
    output.resolution = resolutionToShotstack(settings.resolution);
    let ar = aspectToShotstack(settings.aspect);
    if (!ar) {
      // "original" — infer from the first visual clip's source dimensions.
      for (const ref of order) {
        const a = byId.get(assetIdFromRef(ref));
        if (!a) continue;
        if (!a.mime.startsWith("video/") && !a.mime.startsWith("image/")) continue;
        if (a.width && a.height) {
          ar = inferAspect(a.width, a.height);
          break;
        }
      }
    }
    if (ar) output.aspectRatio = ar;
  }
  if (settings.quality === "high") output.quality = "high";
  if (settings.quality === "low") output.quality = "low";

  return {
    timeline: {
      background: bg,
      tracks,
    },
    output,
  };
}

function shotstackHost(): string {
  // Default to production. Set SHOTSTACK_ENV=stage to use the sandbox.
  const env = (process.env.SHOTSTACK_ENV || "v1").toLowerCase();
  const stage = env === "stage" || env === "sandbox" ? "stage" : "v1";
  return `https://api.shotstack.io/edit/${stage}`;
}

export async function shotstackSubmitRender(edit: unknown): Promise<string> {
  const key = process.env.SHOTSTACK_API_KEY;
  if (!key) throw new Error("SHOTSTACK_API_KEY is not configured");
  const host = shotstackHost();
  const res = await fetch(`${host}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify(edit),
  });
  const raw = await res.text();
  let json: {
    success?: boolean;
    message?: string;
    response?: { id?: string; message?: string };
    errors?: Array<{ title?: string; detail?: string }>;
  } = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    // non-JSON body
  }
  if (!res.ok || !json.success || !json.response?.id) {
    const detail =
      json.errors?.map((err) => err.detail || err.title).filter(Boolean).join("; ") ||
      json.response?.message ||
      json.message ||
      (raw && raw.length < 300 ? raw : "") ||
      `HTTP ${res.status}`;
    const hint =
      res.status === 401 || res.status === 403
        ? " — the rendering API key is invalid, disabled, or for the wrong environment. Update SHOTSTACK_API_KEY."
        : "";
    throw new Error(`Render failed (${res.status}): ${detail}${hint}`);
  }
  return json.response.id;
}

export type ShotstackStatus =
  | "queued"
  | "fetching"
  | "rendering"
  | "saving"
  | "done"
  | "failed";

export async function shotstackPollRender(renderId: string): Promise<{
  status: ShotstackStatus;
  url?: string;
  error?: string;
}> {
  const key = process.env.SHOTSTACK_API_KEY;
  if (!key) throw new Error("SHOTSTACK_API_KEY is not configured");
  const res = await fetch(`${shotstackHost()}/render/${renderId}`, {
    headers: { "x-api-key": key },
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    response?: { status?: ShotstackStatus; url?: string; error?: string };
    message?: string;
  };
  if (!res.ok || !json.success || !json.response) {
    throw new Error(json.message || `Shotstack status failed (${res.status})`);
  }
  return {
    status: json.response.status ?? "queued",
    url: json.response.url,
    error: json.response.error,
  };
}

export function statusProgress(status: ShotstackStatus): number {
  switch (status) {
    case "queued":
      return 5;
    case "fetching":
      return 25;
    case "rendering":
      return 60;
    case "saving":
      return 90;
    case "done":
      return 100;
    case "failed":
      return 0;
  }
}

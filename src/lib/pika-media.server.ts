// Server-side adapter for Pika's unified media API.
//
// Pika uses one asynchronous contract for every media model:
//   POST /v1/media/{vendor}/{model}/{function}
//   GET  /v1/media/jobs/{request_id}
//   GET  /v1/media/jobs/{request_id}/content

export type PikaRunOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  label?: string;
};

const DEFAULT_TIMEOUT = 10 * 60_000;
const DEFAULT_INTERVAL = 3_000;
const DEFAULT_BASE_URL = "https://api.dev.pika.art";

export function pikaApiBaseUrl(): string {
  return (process.env.PIKA_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

export function requirePikaApiKey(): string {
  const key = process.env.PIKA_API_KEY;
  if (!key) throw new Error("Missing PIKA_API_KEY");
  return key;
}

function authHeaders(): Record<string, string> {
  return { "X-API-Key": requirePikaApiKey() };
}

export type PikaSubmitResult = {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
};

export type PikaPollResult =
  | { status: "in_progress" }
  | { status: "completed"; response: unknown }
  | { status: "failed"; error: string };

const MODEL_ALIASES: Array<[RegExp, string]> = [
  [/^(?:fal-ai\/)?nano-banana(?:-2)?(?:\/edit)?$/, "google/gemini-3.1-flash-image"],
  [/^(?:fal-ai\/)?openai\/gpt-image-2(?:\/edit)?$/, "openai/gpt-image-2"],
  [/^fal-ai\/bytedance\/seedream\/v4\/(?:text-to-image|edit)$/, "bytedance/seedream-4.5"],
  [/^fal-ai\/bytedance\/seedance-2\.0\/(.*)$/, "bytedance/seedance-2.0/$1"],
  [/^fal-ai\/pika\/v2\.2\/(?:image-to-video|pikaframes|pikascenes)$/, "pika/pika-2.5"],
  [/^fal-ai\/pika\/v2\.2\/text-to-video$/, "pika/pika-2.5"],
  [/^fal-ai\/pika\/v2\/turbo\/image-to-video$/, "pika/pika-2.5"],
  [/^fal-ai\/pika\/v2\/pikadditions$/, "pika/pikadditions"],
  [/^fal-ai\/pika\/v2\/pikaswaps$/, "pika/pikaswaps"],
  [/^fal-ai\/kling-video\/v(?:2\.1|2\.5-turbo)\/(?:standard|pro|master)\/image-to-video$/, "kling/kling-v3/standard/image-to-video"],
  [/^fal-ai\/kling-video\/v(?:2\.1|2\.5-turbo)\/(?:standard|pro|master)\/text-to-video$/, "kling/kling-v3/standard/text-to-video"],
  [/^fal-ai\/kling-video\/v3\/pro\/motion-control$/, "kling/kling-v3/motion-control"],
  [/^fal-ai\/veo3\/fast$/, "google/veo-3.1-fast/text-to-video"],
  [/^fal-ai\/veo3\/image-to-video$/, "google/veo-3.1-lite/image-to-video"],
  [/^fal-ai\/veo3$/, "google/veo-3.1-fast/text-to-video"],
  [/^fal-ai\/(?:wan-25-preview|minimax\/video-01)\/text-to-video$/, "minimax/hailuo-2.3/text-to-video"],
  [/^fal-ai\/elevenlabs\/music$/, "elevenlabs/eleven-music/sound-effects"],
  [/^fal-ai\/elevenlabs\/sound-effects$/, "elevenlabs/eleven-text-to-sound-v2/sound-effects"],
  [/^fal-ai\/minimax-music\/v(?:2|2\.6)$/, "minimax/minimax-music-2.6/sound-effects"],
  [/^(?:fal-ai\/stable-audio-25|fal-ai\/stable-audio)\/text-to-audio$/, "google/lyria-2/sound-effects"],
  [/^cassetteai\/(?:music-generator|sound-effects-generator)$/, "elevenlabs/eleven-music/sound-effects"],
  [/^beatoven\/sound-effect-generation$/, "elevenlabs/eleven-text-to-sound-v2/sound-effects"],
  [/^fal-ai\/elevenlabs\/tts\/multilingual-v2$/, "elevenlabs/eleven-multilingual-v2/text-to-speech"],
  [/^fal-ai\/elevenlabs\/tts\/turbo-v2\.5$/, "elevenlabs/eleven-turbo-v2-5/text-to-speech"],
  [/^fal-ai\/minimax\/speech-02-hd$/, "minimax/minimax-speech-02-hd/text-to-speech"],
  [/^fal-ai\/minimax\/speech-02-turbo$/, "minimax/minimax-speech-02-turbo/text-to-speech"],
  [/^fal-ai\/(?:chatterbox\/text-to-speech|inworld-tts)$/, "elevenlabs/eleven-multilingual-v2/text-to-speech"],
  [/^fal-ai\/bytedance\/seed-speech\/tts\/v2$/, "bytedance/seed-audio-1.0/text-to-audio"],
  [/^fal-ai\/(?:sync-lipsync|infinitalk|kling-video\/ai-avatar\/.*|ai-avatar\/.*)$/, "kling/kling-v3/pro/image-to-video"],
  [/^bytedance\/seed-audio-1\.0$/, "bytedance/seed-audio-1.0/text-to-audio"],
  [/^fal-ai\/flux(?:-pro)?(?:\/.*)?$/, "google/gemini-3.1-flash-image/text-to-image"],
  [/^fal-ai\/ideogram(?:\/.*)?$/, "google/gemini-3.1-flash-image/text-to-image"],
  [/^(?:fal-ai\/)?luma(?:\/dream-machine)?(?:\/.*)?$/, "google/veo-3.1-fast/text-to-video"],
];

/** Convert the app's historical Fal/catalog ids to Pika API endpoint ids. */
export function normalizePikaModelPath(model: string): string {
  if (/^(?:fal\/|fal-ai\/)?nano-banana(?:-2)?$/.test(model)) return "google/gemini-3.1-flash-image/text-to-image";
  if (/^(?:fal\/|fal-ai\/)?nano-banana(?:-2)?\/edit$/.test(model)) return "google/gemini-3.1-flash-image/image-to-image";
  if (/^fal-ai\/openai\/gpt-image-2$/.test(model)) return "openai/gpt-image-2/text-to-image";
  if (/^fal-ai\/openai\/gpt-image-2\/edit$/.test(model)) return "openai/gpt-image-2/image-to-image";
  if (/^openai\/gpt-image-2$/.test(model)) return "openai/gpt-image-2/text-to-image";
  if (/^openai\/gpt-image-2\/edit$/.test(model)) return "openai/gpt-image-2/image-to-image";
  if (/^fal-ai\/bytedance\/seedream\/v4\/(?:text-to-image|edit)$/.test(model)) return model.endsWith("edit") ? "bytedance/seedream-5.0-lite/image-to-image" : "bytedance/seedream-4.5/text-to-image";
  if (/^fal-ai\/pika\/v2\.2\/(?:image-to-video|pikaframes|pikascenes)$/.test(model)) return "pika/pika-2.5/image-to-video";
  if (/^fal-ai\/pika\/v2\.2\/text-to-video$/.test(model)) return "pika/pika-2.5/text-to-video";
  if (/^fal-ai\/pika\/v2\/turbo\/image-to-video$/.test(model)) return "pika/pika-2.5/image-to-video";
  if (/^fal-ai\/pika\/v2\/pikadditions$/.test(model)) return "pika/pikadditions/video-to-video";
  if (/^fal-ai\/pika\/v2\/pikaswaps$/.test(model)) return "pika/pikaswaps/video-to-video";
  if (/^fal-ai\/pika\/v2\.2\/pikatwists$/.test(model)) return "pika/pikaffects/image-to-video";
  if (model.startsWith("google/") || model.startsWith("openai/") || model.startsWith("pika/") || model.startsWith("kling/") || model.startsWith("bytedance/") || model.startsWith("minimax/") || model.startsWith("elevenlabs/")) {
    if (model === "openai/gpt-image-2") return "openai/gpt-image-2/text-to-image";
    if (model === "openai/gpt-image-2/edit") return "openai/gpt-image-2/image-to-image";
    if (model === "bytedance/seedance-2.0/mini/text-to-video") return "bytedance/seedance-2.0/text-to-video";
    if (model === "bytedance/seedance-2.0/mini/reference-to-video") return "bytedance/seedance-2.0/reference-to-video";
    return model;
  }
  for (const [pattern, replacement] of MODEL_ALIASES) {
    if (pattern.test(model)) return model.replace(pattern, replacement);
  }
  return model;
}

function cloneInput(input: Record<string, unknown>): Record<string, unknown> {
  return { ...input };
}

/** Normalize legacy Fal field names to the selected Pika model's schema. */
export function normalizePikaInput(model: string, input: Record<string, unknown>): Record<string, unknown> {
  const path = normalizePikaModelPath(model);
  const body = cloneInput(input);

  if (path.includes("seedance-2.0/")) {
    if (body.aspect_ratio !== undefined && body.ratio === undefined) body.ratio = body.aspect_ratio;
    delete body.aspect_ratio;
    if (body.duration !== undefined) {
      const n = Number(body.duration);
      body.duration = Number.isFinite(n) ? Math.max(4, Math.min(15, Math.round(n))) : 5;
    }
    if (body.resolution === undefined) body.resolution = "720p";
  }

  if (path.includes("pika/pika-2.5/")) {
    if (body.aspect_ratio !== undefined) {
      const ratio = String(body.aspect_ratio);
      body.aspect_ratio = ratio;
    }
    if (body.duration !== undefined) {
      const n = Number(body.duration);
      body.duration_s = Number.isFinite(n) && n >= 7 ? 5 : 5;
      delete body.duration;
    }
    if (body.image_url !== undefined && body.image === undefined) {
      body.image = body.image_url;
      delete body.image_url;
    }
    if (body.image_urls !== undefined && body.image === undefined) {
      const refs = Array.isArray(body.image_urls) ? body.image_urls : [];
      if (refs[0]) body.image = refs[0];
      delete body.image_urls;
    }
  }

  if (path.includes("pika/pikadditions/") || path.includes("pika/pikaswaps/")) {
    if (body.video_url !== undefined && body.video === undefined) {
      body.video = body.video_url;
      delete body.video_url;
    }
    if (body.image_url !== undefined && body.image === undefined) {
      body.image = body.image_url;
      delete body.image_url;
    }
  }

  if (path.includes("kling/") && path.endsWith("/image-to-video")) {
    if (body.image_url !== undefined && body.image === undefined) {
      body.image = body.image_url;
      delete body.image_url;
    }
  }

  if (path.endsWith("/image-to-image") && body.image_urls === undefined && body.image_url !== undefined) {
    body.image_urls = [body.image_url];
    delete body.image_url;
  }

  if (path.includes("elevenlabs/eleven-music/")) {
    if (body.duration !== undefined && body.music_length_ms === undefined) {
      body.music_length_ms = Math.max(3000, Math.min(300000, Math.round(Number(body.duration) * 1000)));
      delete body.duration;
    }
    if (body.text !== undefined && body.prompt === undefined) {
      body.prompt = body.text;
      delete body.text;
    }
  }
  if (path.includes("elevenlabs/eleven-text-to-sound")) {
    if (body.prompt !== undefined && body.text === undefined) {
      body.text = body.prompt;
      delete body.prompt;
    }
    if (body.duration !== undefined && body.duration_seconds === undefined) {
      body.duration_seconds = Number(body.duration);
      delete body.duration;
    }
  }
  if (path.includes("elevenlabs/eleven-multilingual") || path.includes("elevenlabs/eleven-turbo")) {
    if (body.voice !== undefined && body.voice_id === undefined) {
      body.voice_id = body.voice;
      delete body.voice;
    }
  }
  if (path.includes("minimax/minimax-speech")) {
    if (body.voice === undefined) body.voice_id = "Wise_Woman";
    else if (body.voice_id === undefined) {
      body.voice_id = body.voice;
      delete body.voice;
    }
  }
  if (path.includes("bytedance/seed-audio")) {
    if (body.text !== undefined && body.prompt === undefined) {
      body.prompt = body.text;
      delete body.text;
    }
  }
  if (path.includes("google/lyria-2")) {
    if (body.text !== undefined && body.prompt === undefined) {
      body.prompt = body.text;
      delete body.text;
    }
  }

  return body;
}

export async function pikaSubmit(
  model: string,
  input: Record<string, unknown>,
  label?: string,
): Promise<PikaSubmitResult> {
  let path = normalizePikaModelPath(model);
  const body = normalizePikaInput(model, input);
  if (path === "pika/pika-2.5/image-to-video" && !body.image && body.prompt) path = "pika/pika-2.5/text-to-video";
  if (path === "pika/pikaffects/image-to-video" && !body.image && body.prompt) path = "pika/pika-2.5/text-to-video";
  const tag = label ?? model;
  const res = await fetch(`${pikaApiBaseUrl()}/v1/media/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`pika ${tag} submit ${res.status}: ${txt.slice(0, 500)}`);
  }
  const json = (await res.json()) as { id?: string; request_id?: string };
  const requestId = json.id ?? json.request_id;
  if (!requestId) throw new Error(`pika ${tag} submit returned no request id`);
  return {
    requestId,
    statusUrl: `${pikaApiBaseUrl()}/v1/media/jobs/${requestId}`,
    responseUrl: `${pikaApiBaseUrl()}/v1/media/jobs/${requestId}/content`,
  };
}

export async function pikaUpload(bytes: Uint8Array, contentType: string): Promise<string> {
  const init = await fetch(`${pikaApiBaseUrl()}/v1/media/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ content_type: contentType, size_bytes: bytes.byteLength }),
  });
  if (!init.ok) throw new Error(`pika upload init ${init.status}: ${(await init.text()).slice(0, 300)}`);
  const payload = (await init.json()) as { upload_url?: string; url?: string };
  if (!payload.upload_url || !payload.url) throw new Error("pika upload init returned no URLs");
  const uploaded = await fetch(payload.upload_url, { method: "PUT", headers: { "Content-Type": contentType }, body: Buffer.from(bytes) });
  if (!uploaded.ok) throw new Error(`pika upload ${uploaded.status}`);
  return payload.url;
}

export async function pikaPollOnce(statusUrl: string, responseUrl: string): Promise<PikaPollResult> {
  const sRes = await fetch(statusUrl, { headers: authHeaders() });
  if (!sRes.ok) return { status: "in_progress" };
  const sJson = (await sRes.json().catch(() => ({}))) as { status?: string; error?: unknown };
  const status = String(sJson.status ?? "").toLowerCase();
  if (["failed", "cancelled", "error"].includes(status)) {
    return { status: "failed", error: `pika job ${status}: ${String(sJson.error ?? "unknown error")}` };
  }
  if (status !== "completed") return { status: "in_progress" };
  const rRes = await fetch(responseUrl, { headers: authHeaders() });
  if (!rRes.ok) {
    const txt = await rRes.text().catch(() => "");
    return { status: "failed", error: `pika response ${rRes.status}: ${txt.slice(0, 300)}` };
  }
  return { status: "completed", response: await rRes.json() };
}

export async function pikaRun<T = unknown>(model: string, input: Record<string, unknown>, opts: PikaRunOptions = {}): Promise<T> {
  const label = opts.label ?? model;
  const submitted = await pikaSubmit(model, input, label);
  const deadline = Date.now() + (opts.timeoutMs ?? DEFAULT_TIMEOUT);
  const interval = opts.intervalMs ?? DEFAULT_INTERVAL;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    const tick = await pikaPollOnce(submitted.statusUrl, submitted.responseUrl);
    if (tick.status === "completed") return tick.response as T;
    if (tick.status === "failed") throw new Error(`pika ${label}: ${tick.error}`);
  }
  throw new Error(`pika ${label} timed out after ${(opts.timeoutMs ?? DEFAULT_TIMEOUT) / 1000}s`);
}

const URL_RE = /https?:\/\/[^\s"'<>\)]+/g;
function sweep(out: unknown, predicate: (url: string) => boolean): string[] {
  const found = new Set<string>();
  const visit = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      for (const url of value.match(URL_RE) ?? []) if (predicate(url)) found.add(url);
      return;
    }
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value === "object") Object.values(value as Record<string, unknown>).forEach(visit);
  };
  visit(out);
  return [...found];
}

export function pikaPickImageUrl(out: unknown): string | null {
  const urls = sweep(out, (url) => /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url) || /storage|cdn|media/i.test(url));
  return urls.find((url) => /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url)) ?? urls.find((url) => !/\.(mp3|wav|mp4|mov|webm|m4a)(\?|$)/i.test(url)) ?? null;
}

export function pikaPickVideoUrl(out: unknown): string | null {
  const urls = sweep(out, (url) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || /storage|cdn|media/i.test(url));
  return urls.find((url) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) ?? urls[0] ?? null;
}

export function pikaPickAudioUrl(out: unknown): string | null {
  const urls = sweep(out, (url) => /\.(mp3|wav|m4a|ogg|flac)(\?|$)/i.test(url) || /storage|cdn|media/i.test(url));
  return urls.find((url) => /\.(mp3|wav|m4a|ogg|flac)(\?|$)/i.test(url)) ?? urls[0] ?? null;
}

export function normalizeAspect(raw: string | undefined | null): "16:9" | "9:16" | "1:1" {
  if (!raw) return "16:9";
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) return "16:9";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (Math.abs(width - height) < 0.01) return "1:1";
  return width > height ? "16:9" : "9:16";
}

export async function pikaGenerateImage(args: { prompt: string; aspect?: string; referenceImageUrls?: string[] }): Promise<string> {
  const refs = (args.referenceImageUrls ?? []).filter((url) => /^https?:/.test(url));
  const model = refs.length ? "google/gemini-3.1-flash-image/image-to-image" : "google/gemini-3.1-flash-image/text-to-image";
  const out = await pikaRun(model, { prompt: args.prompt, aspect_ratio: normalizeAspect(args.aspect), num_images: 1, ...(refs.length ? { image_urls: refs } : {}) }, { label: model });
  const url = pikaPickImageUrl(out);
  if (!url) throw new Error(`${model} returned no image URL`);
  return url;
}

export async function pikaAnimateImage(args: { prompt: string; imageUrl: string; durationSeconds: number; aspect?: string }): Promise<string> {
  const out = await pikaRun("kling/kling-v3/standard/image-to-video", { prompt: args.prompt, image: args.imageUrl, duration: args.durationSeconds <= 6 ? 5 : 10, aspect_ratio: normalizeAspect(args.aspect) }, { label: "kling-i2v", timeoutMs: 15 * 60_000 });
  const url = pikaPickVideoUrl(out);
  if (!url) throw new Error("kling-i2v returned no video URL");
  return url;
}

export async function pikaGenerateMusic(args: { prompt: string; durationSeconds: number }): Promise<string> {
  const out = await pikaRun("elevenlabs/eleven-music/sound-effects", { prompt: args.prompt, music_length_ms: Math.max(3000, Math.min(300000, Math.round(args.durationSeconds * 1000))), force_instrumental: true }, { label: "elevenlabs-music" });
  const url = pikaPickAudioUrl(out);
  if (!url) throw new Error("elevenlabs-music returned no audio URL");
  return url;
}

export async function pikaGenerateVoiceover(args: { text: string; voice?: string }): Promise<string> {
  const out = await pikaRun("elevenlabs/eleven-multilingual-v2/text-to-speech", { text: args.text, voice_id: args.voice ?? "Rachel" }, { label: "elevenlabs-tts" });
  const url = pikaPickAudioUrl(out);
  if (!url) throw new Error("elevenlabs-tts returned no audio URL");
  return url;
}

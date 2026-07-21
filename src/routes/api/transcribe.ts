// Speech-to-text for voice mode. The client records short utterances
// (webm/opus or mp4) and posts them here as data URIs; we push the bytes to
// fal storage (wizper rejects data URLs), then run Whisper via fal's
// synchronous endpoint (fal-ai/wizper — fast Whisper v3) and return the
// transcript. Synchronous because dictation needs ~1–2s turnaround, not the
// 3s-interval queue polling used by the media-generation jobs.
import { createFileRoute } from "@tanstack/react-router";
import { requireUser, unauthorizedResponse } from "@/lib/auth-route.server";

// ~8MB of base64 ≈ 6MB audio ≈ several minutes of opus — far above any
// single utterance; guards against runaway payloads.
const MAX_AUDIO_CHARS = 8 * 1024 * 1024;

type TranscribeBody = {
  audio?: string; // data URI (e.g. data:audio/webm;base64,…)
  language?: string;
};

/** Upload raw bytes to fal storage; returns a fetchable CDN URL. */
async function falUpload(key: string, bytes: Buffer, contentType: string): Promise<string> {
  const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("wav") ? "wav" : "webm";
  const initRes = await fetch(
    "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${key}` },
      body: JSON.stringify({ content_type: contentType, file_name: `utterance.${ext}` }),
    },
  );
  if (!initRes.ok) {
    const txt = await initRes.text().catch(() => "");
    throw new Error(`fal storage initiate ${initRes.status}: ${txt.slice(0, 300)}`);
  }
  const { upload_url, file_url } = (await initRes.json()) as {
    upload_url?: string;
    file_url?: string;
  };
  if (!upload_url || !file_url) throw new Error("fal storage initiate returned no URLs");
  const putRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(bytes),
  });
  if (!putRes.ok) throw new Error(`fal storage upload ${putRes.status}`);
  return file_url;
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireUser(request);
        } catch (err) {
          return unauthorizedResponse(err instanceof Error ? err.message : "Unauthorized");
        }
        const key = process.env.FAL_KEY;
        if (!key) return new Response("Missing FAL_KEY", { status: 500 });

        const { audio, language } = (await request.json().catch(() => ({}))) as TranscribeBody;
        if (typeof audio !== "string" || !audio.startsWith("data:audio/")) {
          return new Response("audio (data URI) is required", { status: 400 });
        }
        if (audio.length > MAX_AUDIO_CHARS) {
          return new Response("audio too large", { status: 413 });
        }
        const m = audio.match(/^data:(audio\/[\w.+-]+)(?:;codecs=[\w.+-]+)?;base64,(.+)$/s);
        if (!m) return new Response("malformed audio data URI", { status: 400 });
        const contentType = m[1];
        const bytes = Buffer.from(m[2], "base64");

        try {
          const audioUrl = await falUpload(key, bytes, contentType);
          const res = await fetch("https://fal.run/fal-ai/wizper", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Key ${key}`,
            },
            body: JSON.stringify({
              audio_url: audioUrl,
              task: "transcribe",
              language: typeof language === "string" && language ? language : "en",
            }),
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            throw new Error(`wizper ${res.status}: ${txt.slice(0, 300)}`);
          }
          const json = (await res.json().catch(() => ({}))) as { text?: string };
          return new Response(JSON.stringify({ text: (json.text ?? "").trim() }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[transcribe]", err instanceof Error ? err.message : err);
          return new Response(JSON.stringify({ text: "" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

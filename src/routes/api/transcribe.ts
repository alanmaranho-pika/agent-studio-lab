// Speech-to-text for voice mode using Pika's Whisper media endpoint.
import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/lib/auth-route.server";
import { pikaPollOnce, pikaSubmit, pikaUpload, requirePikaApiKey } from "@/lib/pika-media.server";

const MAX_AUDIO_CHARS = 8 * 1024 * 1024;
type TranscribeBody = { audio?: string; language?: string };

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireUser(request);
          requirePikaApiKey();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unauthorized";
          return new Response(message, { status: message === "Unauthorized" ? 401 : 500 });
        }

        const { audio, language } = (await request.json().catch(() => ({}))) as TranscribeBody;
        if (typeof audio !== "string" || !audio.startsWith("data:audio/")) return new Response("audio (data URI) is required", { status: 400 });
        if (audio.length > MAX_AUDIO_CHARS) return new Response("audio too large", { status: 413 });
        const match = audio.match(/^data:(audio\/[\w.+-]+)(?:;codecs=[\w.+-]+)?;base64,(.+)$/s);
        if (!match) return new Response("malformed audio data URI", { status: 400 });

        try {
          const contentType = match[1];
          const bytes = Buffer.from(match[2], "base64");
          const audioUrl = await pikaUpload(new Uint8Array(bytes), contentType);
          const submitted = await pikaSubmit("openai/whisper/transcription", {
            audio_url: audioUrl,
            // The browser does not currently send duration metadata. Whisper
            // accepts this upper bound and the short dictation payloads remain
            // within it; callers can add exact duration later without changing
            // the endpoint contract.
            duration_seconds: 60,
            language: typeof language === "string" && language ? language : "en",
            response_format: "json",
          }, "whisper");

          const deadline = Date.now() + 90_000;
          let result: unknown = null;
          while (Date.now() < deadline) {
            const tick = await pikaPollOnce(submitted.statusUrl, submitted.responseUrl);
            if (tick.status === "failed") throw new Error(tick.error);
            if (tick.status === "completed") {
              result = tick.response;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
          const payload = (result ?? {}) as { text?: string; url?: string };
          let text = payload.text ?? "";
          if (!text && payload.url) {
            const transcript = await fetch(payload.url, { headers: { "X-API-Key": requirePikaApiKey() } });
            text = ((await transcript.json().catch(() => ({}))) as { text?: string }).text ?? "";
          }
          return new Response(JSON.stringify({ text: text.trim() }), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (err) {
          console.error("[transcribe]", err instanceof Error ? err.message : err);
          return new Response(JSON.stringify({ text: "" }), { status: 502, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});

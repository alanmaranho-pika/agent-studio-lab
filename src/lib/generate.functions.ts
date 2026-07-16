// Direct (single-shot) generation for the studio's non-agent modes.
// The agent path goes through src/routes/api/chat.ts; this is the simple
// "type a prompt → get one image/video/clip" pipeline that powers the
// Image / Video / Music / Speech modes in the studio toolbar.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import {
  falPickAudioUrl,
  falPickImageUrl,
  falPickVideoUrl,
  normalizeAspect,
  normalizeFalModelPath,
} from "@/lib/fal.server";
import { downloadAndStoreUrl } from "@/lib/project-assets.server";
import type { AssetKind, ProjectState } from "@/lib/project-state";
import { applyPatch, INITIAL_PROJECT } from "@/lib/project-state";

const ModeSchema = z.enum(["image", "video", "audio", "speech"]);

const InputSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1).max(8000),
  mode: ModeSchema,
  model: z.string().min(3).max(255),
  userMessageId: z.string().min(1).max(64),
  assistantMessageId: z.string().min(1).max(64),
  referenceImageUrls: z.array(z.string().url()).max(8).optional(),
  referenceVideoUrl: z.string().url().optional(),
  params: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    .optional(),
});

function fallbackMimeFor(mode: z.infer<typeof ModeSchema>): string {
  if (mode === "image") return "image/png";
  if (mode === "video") return "video/mp4";
  return "audio/mpeg";
}

function friendlyGenerationError(raw: string): string {
  const msg = raw || "";
  // Try to extract the upstream detail message from JSON error bodies
  let detail = "";
  const jsonStart = msg.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(msg.slice(jsonStart));
      const d = (parsed as { detail?: unknown }).detail;
      if (Array.isArray(d) && d[0] && typeof d[0] === "object") {
        detail = String((d[0] as { msg?: string }).msg ?? "");
      } else if (typeof d === "string") {
        detail = d;
      }
    } catch {
      // ignore
    }
  }
  const lower = (detail + " " + msg).toLowerCase();

  if (/content_policy|content checker|sensitive content|partner_validation|moderation|safety/i.test(lower)) {
    return "That prompt was blocked by the model's content filter. Try rephrasing — avoid named real people, copyrighted characters, or sensitive scenes — or switch to a different model.";
  }
  if (/rate.?limit|429/i.test(lower)) {
    return "The model is rate-limited right now. Please wait a moment and try again.";
  }
  if (/quota|credits|402|insufficient/i.test(lower)) {
    return "You're out of credits for this model. Add credits and try again.";
  }
  if (/timeout|timed out|deadline/i.test(lower)) {
    return "The model took too long to respond. Please try again.";
  }
  if (/invalid.*(image|url|reference)|failed to (download|fetch)/i.test(lower)) {
    return "The reference image couldn't be loaded. Try a different image or re-upload.";
  }
  if (detail) {
    return `Couldn't generate that — ${detail}`;
  }
  // Strip verbose HTTP/JSON noise from the fallback
  const cleaned = msg.replace(/\s*response \d+:.*$/s, "").trim();
  return `Couldn't generate that${cleaned ? ` — ${cleaned}` : "."}`;
}

function assetKindFor(mode: z.infer<typeof ModeSchema>): AssetKind {
  if (mode === "image") return "reference";
  if (mode === "video") return "video";
  if (mode === "speech") return "voiceover";
  return "music";
}

function falAuthHeader(): Record<string, string> {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("Missing FAL_KEY");
  return { Authorization: `Key ${key}` };
}

function isTransientFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|fetch failed|network|econnreset|etimedout/i.test(message);
}

// Submit a fal job WITHOUT polling. Returns the queue urls so the client
// can poll via `directGeneratePoll`. We do this so single-shot generations
// (especially video) don't hold a Worker request open past its wall-clock
// limit and surface as "Load failed" in the browser.
export const directGenerateStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("id, project_state")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");

    const state = (proj.project_state as ProjectState | null) ?? INITIAL_PROJECT;
    const aspect = normalizeAspect(state.meta?.aspectRatio || "16:9");

    // Persist the user message immediately.
    await supabaseAdmin.from("project_messages").upsert(
      {
        id: data.userMessageId,
        project_id: data.projectId,
        role: "user",
        parts: [{ type: "text", text: data.prompt }] as unknown as never,
      },
      { onConflict: "id" },
    );

    // Build the fal input by mode.
    let body: Record<string, unknown>;
    const refImageUrls = (data.referenceImageUrls ?? []).filter((u) => /^https?:/.test(u));
    const model = data.model;
    const isGptImage2Text = model === "openai/gpt-image-2" || model === "fal-ai/openai/gpt-image-2";
    const isGptImage2Edit =
      model === "openai/gpt-image-2/edit" || model === "fal-ai/openai/gpt-image-2/edit";
    const isPikaframes = model === "fal-ai/pika/v2.2/pikaframes";
    const isPikascenes = model === "fal-ai/pika/v2.2/pikascenes";
    const isPikaswaps = model === "fal-ai/pika/v2/pikaswaps";
    const isPikaSpecial = isPikaframes || isPikascenes || isPikaswaps;
    const isPikaFal = model.startsWith("fal-ai/pika/");
    const isVeo3 = model.startsWith("fal-ai/veo3");
    const isKlingMotionControl = model === "fal-ai/kling-video/v3/pro/motion-control";
    const isSeedream = model.startsWith("fal-ai/bytedance/seedream/v4");
    const isLipsync =
      model.startsWith("fal-ai/sync-lipsync") ||
      model.startsWith("fal-ai/infinitalk") ||
      model.startsWith("fal-ai/kling-video/ai-avatar") ||
      model.startsWith("fal-ai/ai-avatar");

    // Per-endpoint quirks for audio/speech (different field names).
    const isElevenMusic = model === "fal-ai/elevenlabs/music";
    const isElevenSfx = model === "fal-ai/elevenlabs/sound-effects";
    const isElevenTts = model.startsWith("fal-ai/elevenlabs/tts/");
    const isStableAudio = model.startsWith("fal-ai/stable-audio");
    const isMinimaxSpeech = model.startsWith("fal-ai/minimax/speech");
    const isChatterbox = model.startsWith("fal-ai/chatterbox");
    const isInworld = model.startsWith("fal-ai/inworld");
    const isMinimaxMusic = model.startsWith("fal-ai/minimax-music");

    // Some models route to a different endpoint when reference images are
    // attached (e.g. Seedream t2i → /edit). Track the effective model so the
    // fetch URL below uses it.
    let effectiveModel = isGptImage2Text
      ? "openai/gpt-image-2"
      : isGptImage2Edit
        ? "openai/gpt-image-2/edit"
        : model;

    if (isPikaframes) {
      // fal pikaframes expects `image_urls`: array of 2-5 keyframe URLs.
      body = { prompt: data.prompt, image_urls: refImageUrls };
    } else if (isPikascenes) {
      // fal pikascenes expects `image_urls`: array of image URLs (not `images`).
      body = { prompt: data.prompt, image_urls: refImageUrls };
    } else if (isPikaswaps) {
      body = { prompt: data.prompt };
      if (data.referenceVideoUrl) body.video_url = data.referenceVideoUrl;
      if (refImageUrls[0]) body.image_url = refImageUrls[0];
    } else if (isPikaSpecial) {
      body = { prompt: data.prompt };
    } else if (isKlingMotionControl) {
      // Kling v3 Motion Control: character image + motion reference video.
      body = { prompt: data.prompt };
      if (refImageUrls[0]) body.image_url = refImageUrls[0];
      if (data.referenceVideoUrl) body.video_url = data.referenceVideoUrl;
    } else if (isSeedream) {
      // Seedream v4: prompt + image_size (string enum or {width,height}) +
      // num_images/max_images/seed/enhance_prompt_mode/enable_safety_checker.
      // If refs are attached, auto-route to the /edit endpoint which requires
      // image_urls. Don't pass aspect_ratio — Seedream rejects it.
      body = { prompt: data.prompt };
      if (refImageUrls.length > 0) {
        effectiveModel = "fal-ai/bytedance/seedream/v4/edit";
        body.image_urls = refImageUrls;
      }
    } else if (isPikaFal || isVeo3 || isLipsync) {
      body = { prompt: data.prompt };
      if (refImageUrls.length > 0) {
        if (isLipsync) body.image_url = refImageUrls[0];
        else if (model.includes("image-to-video")) body.image_url = refImageUrls[0];
      }
    } else if (data.mode === "image") {
      body = { prompt: data.prompt, aspect_ratio: aspect, num_images: 1 };
      if (refImageUrls.length > 0) {
        body.image_urls = refImageUrls;
        // gpt-image-2 text-to-image ignores reference images; auto-route to
        // the /edit endpoint which accepts image_urls.
        if (isGptImage2Text) {
          effectiveModel = "openai/gpt-image-2/edit";
        }
      }
    } else if (data.mode === "video") {
      body = { prompt: data.prompt, aspect_ratio: aspect, duration: "5" };
      if (refImageUrls.length > 0) {
        // Seedance reference-to-video takes a LIST under `image_urls`; every
        // other i2v endpoint takes a single `image_url`.
        if (
          model === "bytedance/seedance-2.0/reference-to-video" ||
          model === "bytedance/seedance-2.0/fast/reference-to-video" ||
          model === "bytedance/seedance-2.0/mini/reference-to-video"
        ) {
          body.image_urls = refImageUrls;
        } else {
          body.image_url = refImageUrls[0];
        }
      }
    } else if (data.mode === "audio") {
      // Audio endpoints have different field names — start minimal per-model.
      if (isElevenMusic) body = { prompt: data.prompt };
      else if (isElevenSfx) body = { text: data.prompt };
      else if (isStableAudio) body = { prompt: data.prompt };
      else if (isMinimaxMusic) body = { prompt: data.prompt };
      else body = { prompt: data.prompt };
    } else {
      // speech mode
      if (isElevenTts) body = { text: data.prompt, voice: "Rachel" };
      else if (isMinimaxSpeech) body = { text: data.prompt };
      else if (isChatterbox) body = { text: data.prompt };
      else if (isInworld) body = { text: data.prompt };
      else body = { text: data.prompt };
    }

    // Merge in per-model overrides (aspect_ratio, duration, voice, count, ...).
    if (data.params) {
      for (const [k, v] of Object.entries(data.params)) {
        if (v !== undefined && v !== null && v !== "") body[k] = v;
      }
    }

    // Per-endpoint param remapping (after merge).
    if (isMinimaxSpeech) {
      const voice = body.voice;
      const speed = body.speed;
      delete body.voice;
      delete body.speed;
      const voiceSetting: Record<string, unknown> = {};
      if (typeof voice === "string") voiceSetting.voice_id = voice;
      if (typeof speed === "number") voiceSetting.speed = speed;
      if (Object.keys(voiceSetting).length > 0) body.voice_setting = voiceSetting;
    }
    if (isElevenTts) {
      const stability = body.stability;
      if (typeof stability === "number") {
        delete body.stability;
        body.voice_settings = { stability };
      }
    }

    // Veo 3 i2v: drop "auto" sentinel — fal expects the field omitted.
    if (isVeo3 && body.aspect_ratio === "auto") delete body.aspect_ratio;

    // Pika expects `duration` as an integer (5 or 10), not a string.
    if (data.model.includes("pika") && body.duration !== undefined) {
      const n = Number(body.duration);
      if (Number.isFinite(n)) body.duration = n;
    }

    // Seedance 2.0 (all variants) requires duration to be a string enum:
    // 'auto' or '4'..'15'. Clamp any numeric/string input into range and
    // stringify — otherwise fal rejects with a 422 literal_error.
    if (model.startsWith("bytedance/seedance-2.0") && body.duration !== undefined) {
      const raw = body.duration;
      if (raw === "auto") {
        body.duration = "auto";
      } else {
        const n = Number(raw);
        if (Number.isFinite(n)) {
          const clamped = Math.max(4, Math.min(15, Math.round(n)));
          body.duration = String(clamped);
        } else {
          body.duration = "auto";
        }
      }
    }

    // Seedream rejects aspect_ratio — it uses image_size instead. Strip it
    // in case anything upstream merged it in.
    if (isSeedream) {
      delete body.aspect_ratio;
    }

    // GPT Image 2 uses `image_size`; `aspect_ratio` is not in its fal schema.
    if (isGptImage2Text || isGptImage2Edit) {
      delete body.aspect_ratio;
    }

    // ByteDance Seed-Audio / Seed-Speech: sample_rate must be a number, and
    // empty-string language should be dropped (auto-detect).
    const isSeedAudio = model === "bytedance/seed-audio-1.0";
    const isSeedSpeech = model === "fal-ai/bytedance/seed-speech/tts/v2";
    if (isSeedAudio || isSeedSpeech) {
      if (typeof body.sample_rate === "string") {
        const n = Number(body.sample_rate);
        if (Number.isFinite(n)) body.sample_rate = n;
      }
      if (body.language === "") delete body.language;
      if (body.voice === "") delete body.voice;
    }

    // Create a "pending" placeholder asset so a Rendering… tile shows up in
    // Outputs immediately (matches Default-mode app behavior). We swap this
    // row for the real asset in directGeneratePoll on success, or delete it
    // on failure.
    let placeholderId: string | null = null;
    try {
      const { data: ph } = await supabaseAdmin
        .from("project_assets")
        .insert({
          project_id: data.projectId,
          kind: "pending",
          mime: fallbackMimeFor(data.mode),
          name: data.prompt.slice(0, 80),
          label: data.prompt.slice(0, 80),
          url: "",
          storage_path: null,
        })
        .select("id")
        .single();
      placeholderId = (ph?.id as string | undefined) ?? null;
    } catch {
      // Non-fatal — placeholder is UX only.
    }

    try {
      const submitRes = await fetch(`https://queue.fal.run/${normalizeFalModelPath(effectiveModel)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...falAuthHeader() },
        body: JSON.stringify(body),
      });
      if (!submitRes.ok) {
        const txt = await submitRes.text().catch(() => "");
        throw new Error(`fal ${effectiveModel} submit ${submitRes.status}: ${txt.slice(0, 400)}`);
      }
      const j = (await submitRes.json()) as {
        request_id?: string;
        status_url?: string;
        response_url?: string;
      };
      if (!j.status_url || !j.response_url) {
        throw new Error(`fal ${data.model} submit returned no status_url/response_url`);
      }
      return {
        ok: true as const,
        statusUrl: j.status_url,
        responseUrl: j.response_url,
        placeholderId,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errorText = `Couldn't start generation — ${msg}`;
      await supabaseAdmin.from("project_messages").upsert(
        {
          id: data.assistantMessageId,
          project_id: data.projectId,
          role: "assistant",
          parts: [{ type: "text", text: errorText }] as unknown as never,
        },
        { onConflict: "id" },
      );
      if (placeholderId) {
        await supabaseAdmin
          .from("project_assets")
          .delete()
          .eq("id", placeholderId)
          .eq("project_id", data.projectId);
      }
      return { ok: false as const, error: msg, assistantText: errorText };
    }
  });

const PollSchema = z.object({
  projectId: z.string().uuid(),
  mode: ModeSchema,
  model: z.string().min(3).max(255),
  prompt: z.string().min(1).max(8000),
  assistantMessageId: z.string().min(1).max(64),
  statusUrl: z.string().url(),
  responseUrl: z.string().url(),
  placeholderId: z.string().uuid().optional(),
  params: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    .optional(),
});

// One-shot poll: checks status, and if completed, downloads the asset,
// persists it, patches project state, and writes the assistant message.
// The client calls this every few seconds until status !== "pending".
export const directGeneratePoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PollSchema.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("id, project_state")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");
    const state = (proj.project_state as ProjectState | null) ?? INITIAL_PROJECT;

    let sourceUrl: string | null = null;
    try {
      const sRes = await fetch(data.statusUrl, { headers: falAuthHeader() });
      if (!sRes.ok) return { ok: true as const, status: "pending" as const };
      const sJson = (await sRes.json().catch(() => ({}))) as { status?: string };
      const status = (sJson.status || "").toUpperCase();
      if (status === "FAILED" || status === "CANCELLED" || status === "ERROR") {
        throw new Error(`fal ${data.model} job ${status.toLowerCase()}`);
      }
      if (status !== "COMPLETED") {
        return { ok: true as const, status: "pending" as const };
      }
      const rRes = await fetch(data.responseUrl, { headers: falAuthHeader() });
      if (!rRes.ok) {
        const txt = await rRes.text().catch(() => "");
        throw new Error(`fal ${data.model} response ${rRes.status}: ${txt.slice(0, 400)}`);
      }
      const out = await rRes.json();
      if (data.mode === "image") sourceUrl = falPickImageUrl(out);
      else if (data.mode === "video") sourceUrl = falPickVideoUrl(out);
      else sourceUrl = falPickAudioUrl(out);
    } catch (err) {
      if (isTransientFetchError(err)) {
        return { ok: true as const, status: "pending" as const };
      }
      const msg = err instanceof Error ? err.message : String(err);
      const errorText = friendlyGenerationError(msg);
      await supabaseAdmin.from("project_messages").upsert(
        {
          id: data.assistantMessageId,
          project_id: data.projectId,
          role: "assistant",
          parts: [{ type: "text", text: errorText }] as unknown as never,
        },
        { onConflict: "id" },
      );
      if (data.placeholderId) {
        await supabaseAdmin
          .from("project_assets")
          .delete()
          .eq("id", data.placeholderId)
          .eq("project_id", data.projectId);
      }
      return { ok: false as const, status: "done" as const, error: msg, assistantText: errorText };
    }

    if (!sourceUrl) {
      const errorText = `${data.model} returned no asset URL.`;
      await supabaseAdmin.from("project_messages").upsert(
        {
          id: data.assistantMessageId,
          project_id: data.projectId,
          role: "assistant",
          parts: [{ type: "text", text: errorText }] as unknown as never,
        },
        { onConflict: "id" },
      );
      if (data.placeholderId) {
        await supabaseAdmin
          .from("project_assets")
          .delete()
          .eq("id", data.placeholderId)
          .eq("project_id", data.projectId);
      }
      return {
        ok: false as const,
        status: "done" as const,
        error: errorText,
        assistantText: errorText,
      };
    }

    // For video, if the caller passed a duration param, persist it so
    // downstream export/timeline math doesn't fall back to the 5s default.
    let knownDuration: number | undefined;
    if (data.mode === "video" && data.params) {
      const raw = data.params.duration;
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
      if (Number.isFinite(n) && n > 0) knownDuration = n;
    }

    const stored = await downloadAndStoreUrl({
      projectId: data.projectId,
      userId,
      sourceUrl,
      kind: assetKindFor(data.mode),
      label: data.prompt.slice(0, 80),
      attachedTo: `run:${data.assistantMessageId}`,
      fallbackMime: fallbackMimeFor(data.mode),
      duration: knownDuration,
    });

    if (data.placeholderId) {
      await supabaseAdmin
        .from("project_assets")
        .delete()
        .eq("id", data.placeholderId)
        .eq("project_id", data.projectId);
    }



    const patch = {
      assetsAppend: [
        {
          id: stored.id,
          kind: assetKindFor(data.mode),
          mime: stored.mime,
          name: `${data.prompt.slice(0, 40)}.${stored.mime.split("/")[1] ?? "bin"}`,
          url: stored.url,
          label: data.prompt.slice(0, 80),
          attachedTo: `run:${data.assistantMessageId}`,
          duration: knownDuration,
        },
      ],
    };
    const assistantText = `<div data-direct-result><script type="application/json" data-project-patch>${JSON.stringify(patch)}</script></div>`;

    await supabaseAdmin.from("project_messages").upsert(
      {
        id: data.assistantMessageId,
        project_id: data.projectId,
        role: "assistant",
        parts: [{ type: "text", text: assistantText }] as unknown as never,
      },
      { onConflict: "id" },
    );

    const next = applyPatch(state, patch as never);
    await supabaseAdmin
      .from("projects")
      .update({
        project_state: next as unknown as never,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.projectId)
      .eq("user_id", userId);

    return {
      ok: true as const,
      status: "done" as const,
      assistantText,
      assetId: stored.id,
      assetUrl: stored.url,
      mime: stored.mime,
    };
  });

// @ts-nocheck — legacy feature file; feature tables (characters, library_subjects, render_jobs, etc.) are not part of the projects-first Supabase migration.
// Kling Standard per-shot render pipeline for the Short Film and Product Ad
// special apps. Builds a keyframe per beat with nano-banana, animates each
// keyframe with Kling Standard image-to-video, optionally generates VO/music
// in parallel, then stitches everything together via fal's ffmpeg-compose.
// Returns the stored final asset; the panel appends it to the timeline.
//
// All work happens inside one server call. Beats are processed in parallel
// to keep total wall time roughly equal to the slowest shot (~60-180s for
// Kling Standard) plus a stitching pass (~30-60s).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const FilmBeatSchema = z.object({
  timecode: z.string(),
  camera: z.string(),
  action: z.string(),
  voiceover: z.string().optional(),
});

const FilmConceptSchema = z.object({
  title: z.string(),
  characterDesc: z.string(),
  environmentDesc: z.string(),
  beats: z.array(FilmBeatSchema).min(1).max(8),
  voiceoverScript: z.string(),
  musicMood: z.string(),
});

const AdBeatSchema = z.object({
  timecode: z.string(),
  action: z.string(),
  voiceover: z.string().optional(),
});

const AdConceptSchema = z.object({
  logline: z.string(),
  beats: z.array(AdBeatSchema).min(1).max(8),
  cta: z.string().optional(),
  musicMood: z.string().optional(),
  voiceoverScript: z.string().optional(),
  dialogue: z
    .array(z.object({ speaker: z.string().optional(), line: z.string() }))
    .optional(),
});

const FilmInput = z.object({
  projectId: z.string().uuid(),
  concept: FilmConceptSchema,
  style: z.string().max(80).optional(),
  characterUrl: z.string().url().optional(),
  environmentUrl: z.string().url().optional(),
  audioMode: z.enum(["voiceover", "music", "silent"]),
  totalDurationSec: z.union([z.literal(8), z.literal(15), z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
  aspect: z.string().max(8).optional(),
  // Optional per-beat first frame. If a slot is null/undefined we generate
  // a keyframe server-side as before; if a URL is provided we skip
  // generation and animate that frame directly.
  keyframeUrls: z.array(z.string().url().nullable()).optional(),
});

const AdInput = z.object({
  projectId: z.string().uuid(),
  concept: AdConceptSchema,
  look: z.string().max(80).optional(),
  productHint: z.string().max(200).optional(),
  productUrl: z.string().url().optional(),
  totalDurationSec: z.number().int().min(6).max(120),
  aspect: z.string().max(8).optional(),
  // Optional: "music" generates a music bed; "voiceover" generates VO from
  // per-beat lines (or voiceoverScript fallback); "silent" skips audio.
  audioMode: z.enum(["voiceover", "music", "voiceover+music", "silent"]).default("silent"),
});

type RenderedAsset = { assetId: string; assetUrl: string; mime: string };

// Kling Standard i2v only supports "5" or "10" second clips.
function pickKlingDuration(perShotSec: number): 5 | 10 {
  return perShotSec <= 6 ? 5 : 10;
}

// Compose the keyframe prompt for a single beat — nano-banana is conditioned
// on the character/environment refs when present, so we just describe the
// moment cleanly.
function composeKeyframePrompt(args: {
  style?: string;
  characterDesc?: string;
  environmentDesc?: string;
  camera?: string;
  action: string;
}): string {
  const parts = [
    args.style ? `${args.style} style.` : null,
    args.characterDesc ? `Character: ${args.characterDesc}.` : null,
    args.environmentDesc ? `Environment: ${args.environmentDesc}.` : null,
    args.camera ? `Shot: ${args.camera}.` : null,
    args.action,
    "Single frame, cinematic still, sharp focus.",
  ].filter(Boolean);
  return parts.join(" ");
}

// Motion prompt for a single Kling i2v call. Keep it short — Kling responds
// better to camera + action directives than to long descriptions.
function composeMotionPrompt(args: {
  camera?: string;
  action: string;
}): string {
  return [args.camera ? `${args.camera}.` : null, args.action]
    .filter(Boolean)
    .join(" ");
}

export const produceKlingFilm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FilmInput.parse(d))
  .handler(async ({ data, context }): Promise<RenderedAsset> => {
    const { falAnimateImage, falGenerateImage, falGenerateMusic, falGenerateVoiceover, falStitchFilm, normalizeAspect } =
      await import("@/lib/fal.server");
    const { downloadAndStoreUrl } = await import("@/lib/project-assets.server");

    const aspect = normalizeAspect(data.aspect ?? "16:9");
    const beats = data.concept.beats;
    const perShotSec = Math.max(5, Math.round(data.totalDurationSec / beats.length));
    const klingDur = pickKlingDuration(perShotSec);

    const refs = [data.characterUrl, data.environmentUrl].filter(
      (u): u is string => !!u,
    );

    // 1. Per-shot keyframes (parallel). Use any user-provided URL as-is.
    const provided = data.keyframeUrls ?? [];
    const keyframeUrls = await Promise.all(
      beats.map((b, i) => {
        const userUrl = provided[i];
        if (userUrl) return Promise.resolve(userUrl);
        return falGenerateImage({
          prompt: composeKeyframePrompt({
            style: data.style,
            characterDesc: data.concept.characterDesc,
            environmentDesc: data.concept.environmentDesc,
            camera: b.camera,
            action: b.action,
          }),
          aspect,
          referenceImageUrls: refs,
        });
      }),
    );

    // 2. Animate each keyframe (parallel).
    const clipUrls = await Promise.all(
      beats.map((b, i) =>
        falAnimateImage({
          prompt: composeMotionPrompt({ camera: b.camera, action: b.action }),
          imageUrl: keyframeUrls[i],
          durationSeconds: klingDur,
          aspect,
        }),
      ),
    );

    // 3. Audio (in parallel with… nothing — must complete before stitch).
    const totalDuration = clipUrls.length * klingDur;
    const audioJobs: Array<Promise<unknown>> = [];
    let musicUrl: string | undefined;
    const voClips: Array<{ url: string; startSeconds: number; durationSeconds: number }> = [];

    if (data.audioMode === "music" && data.concept.musicMood) {
      audioJobs.push(
        falGenerateMusic({
          prompt: data.concept.musicMood,
          durationSeconds: totalDuration,
        }).then((u) => {
          musicUrl = u;
        }),
      );
    }

    if (data.audioMode === "voiceover") {
      // One VO line per beat, placed at the shot's start.
      const voBeats = beats.map((b, i) => ({
        idx: i,
        text: (b.voiceover ?? "").trim(),
      }));
      const withText = voBeats.filter((v) => v.text.length > 0);
      if (withText.length > 0) {
        audioJobs.push(
          Promise.all(
            withText.map(async (v) => {
              const url = await falGenerateVoiceover({ text: v.text, voice: "Rachel" });
              voClips.push({
                url,
                startSeconds: v.idx * klingDur,
                durationSeconds: klingDur,
              });
            }),
          ),
        );
      } else if (data.concept.voiceoverScript.trim()) {
        // Single narration covering the whole film.
        audioJobs.push(
          falGenerateVoiceover({
            text: data.concept.voiceoverScript.trim().slice(0, 2000),
            voice: "Rachel",
          }).then((url) => {
            voClips.push({ url, startSeconds: 0, durationSeconds: totalDuration });
          }),
        );
      }
    }

    await Promise.all(audioJobs);

    // 4. Stitch.
    const finalUrl = await falStitchFilm({
      clips: clipUrls.map((url) => ({ url, durationSeconds: klingDur })),
      musicUrl,
      voiceovers: voClips.length > 0 ? voClips : undefined,
    });

    // 5. Store the final MP4 as a project asset.
    const stored = await downloadAndStoreUrl({
      projectId: data.projectId,
      userId: context.userId,
      sourceUrl: finalUrl,
      kind: "video",
      label: `Kling: ${data.concept.title.slice(0, 80)}`,
      fallbackMime: "video/mp4",
      duration: totalDuration,
    });

    return { assetId: stored.id, assetUrl: stored.url, mime: stored.mime };
  });

export const produceKlingAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AdInput.parse(d))
  .handler(async ({ data, context }): Promise<RenderedAsset> => {
    const { falAnimateImage, falGenerateImage, falGenerateMusic, falGenerateVoiceover, falStitchFilm, normalizeAspect } =
      await import("@/lib/fal.server");
    const { downloadAndStoreUrl } = await import("@/lib/project-assets.server");

    // Track this generation in render_jobs so it surfaces in the Jobs page
    // (and Jobs popover) alongside other in-flight renders across projects.
    const { data: jobRow } = await context.supabase
      .from("render_jobs")
      .insert({
        project_id: data.projectId,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const renderJobId = (jobRow?.id as string | undefined) ?? null;

    const markFailed = async (err: unknown) => {
      if (!renderJobId) return;
      await context.supabase
        .from("render_jobs")
        .update({
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          finished_at: new Date().toISOString(),
        })
        .eq("id", renderJobId);
    };

    try {


    const aspect = normalizeAspect(data.aspect ?? "16:9");
    const beats = data.concept.beats;
    const perShotSec = Math.max(5, Math.round(data.totalDurationSec / beats.length));
    const klingDur = pickKlingDuration(perShotSec);

    const refs = data.productUrl ? [data.productUrl] : [];

    // 1. Keyframes — bias toward product-focused stills.
    const keyframeUrls = await Promise.all(
      beats.map((b) =>
        falGenerateImage({
          prompt: composeKeyframePrompt({
            style: data.look,
            environmentDesc: data.productHint
              ? `Featuring ${data.productHint}`
              : undefined,
            action: b.action,
          }),
          aspect,
          referenceImageUrls: refs,
        }),
      ),
    );

    // 2. Animate.
    const clipUrls = await Promise.all(
      beats.map((b, i) =>
        falAnimateImage({
          prompt: composeMotionPrompt({ action: b.action }),
          imageUrl: keyframeUrls[i],
          durationSeconds: klingDur,
          aspect,
        }),
      ),
    );

    const totalDuration = clipUrls.length * klingDur;
    const wantsMusic = data.audioMode === "music" || data.audioMode === "voiceover+music";
    const wantsVoice = data.audioMode === "voiceover" || data.audioMode === "voiceover+music";

    // 3. Audio (music + voiceover in parallel).
    const audioJobs: Array<Promise<unknown>> = [];
    let musicUrl: string | undefined;
    const voClips: Array<{ url: string; startSeconds: number; durationSeconds: number }> = [];

    if (wantsMusic) {
      const musicPrompt =
        data.concept.musicMood?.trim() ||
        `Instrumental score for: ${data.concept.logline}`;
      audioJobs.push(
        falGenerateMusic({
          prompt: musicPrompt,
          durationSeconds: totalDuration,
        }).then((u) => {
          musicUrl = u;
        }),
      );
    }

    if (wantsVoice) {
      const voBeats = beats
        .map((b, i) => ({ idx: i, text: (b.voiceover ?? "").trim() }))
        .filter((v) => v.text.length > 0);

      if (voBeats.length > 0) {
        audioJobs.push(
          Promise.all(
            voBeats.map(async (v) => {
              const url = await falGenerateVoiceover({ text: v.text, voice: "Rachel" });
              voClips.push({
                url,
                startSeconds: v.idx * klingDur,
                durationSeconds: klingDur,
              });
            }),
          ),
        );
      } else if (data.concept.voiceoverScript?.trim()) {
        audioJobs.push(
          falGenerateVoiceover({
            text: data.concept.voiceoverScript.trim().slice(0, 2000),
            voice: "Rachel",
          }).then((url) => {
            voClips.push({ url, startSeconds: 0, durationSeconds: totalDuration });
          }),
        );
      }
    }

    await Promise.all(audioJobs);

    // 4. Stitch.
    const finalUrl = await falStitchFilm({
      clips: clipUrls.map((url) => ({ url, durationSeconds: klingDur })),
      musicUrl,
      voiceovers: voClips.length > 0 ? voClips : undefined,
    });
    void totalDuration; // currently unused — stitch derives duration from clips

    // 5. Store.
    const stored = await downloadAndStoreUrl({
      projectId: data.projectId,
      userId: context.userId,
      sourceUrl: finalUrl,
      kind: "video",
      label: `Kling ad: ${data.concept.logline.slice(0, 80)}`,
      fallbackMime: "video/mp4",
      duration: totalDuration,
    });

    if (renderJobId) {
      await context.supabase
        .from("render_jobs")
        .update({
          status: "done",
          final_asset_id: stored.id,
          finished_at: new Date().toISOString(),
        })
        .eq("id", renderJobId);
    }

    return { assetId: stored.id, assetUrl: stored.url, mime: stored.mime };
    } catch (err) {
      await markFailed(err);
      throw err;
    }
  });

// ── Single-shot Kling render (streams into timeline as each shot resolves) ─

const ShotInput = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(1200),
  imageUrl: z.string().url(),
  durationSec: z.number().int().min(5).max(10),
  aspect: z.string().max(8).optional(),
  label: z.string().max(200).optional(),
});

export const renderKlingShot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ShotInput.parse(d))
  .handler(async ({ data, context }): Promise<RenderedAsset & { durationSec: number }> => {
    const { falAnimateImage, normalizeAspect } = await import("@/lib/fal.server");
    const { downloadAndStoreUrl } = await import("@/lib/project-assets.server");

    const dur: 5 | 10 = data.durationSec <= 6 ? 5 : 10;
    const aspect = normalizeAspect(data.aspect ?? "16:9");

    const clipUrl = await falAnimateImage({
      prompt: data.prompt,
      imageUrl: data.imageUrl,
      durationSeconds: dur,
      aspect,
    });

    const stored = await downloadAndStoreUrl({
      projectId: data.projectId,
      userId: context.userId,
      sourceUrl: clipUrl,
      kind: "video",
      label: data.label ?? `Kling shot (${dur}s)`,
      fallbackMime: "video/mp4",
      duration: dur,
    });

    return {
      assetId: stored.id,
      assetUrl: stored.url,
      mime: stored.mime,
      durationSec: dur,
    };
  });

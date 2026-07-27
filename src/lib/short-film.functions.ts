// @ts-nocheck — legacy feature file; feature tables (characters, library_subjects, render_jobs, etc.) are not part of the projects-first Supabase migration.
// Server functions for the Short Film Special App — concept generation,
// reference-image generation (character + environment), music generation,
// and a pure prompt-assembly helper. Voiceover reuses the existing
// generateVoiceoverAsset in tts.functions.ts.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { falGenerateImage, falGenerateMusic } from "@/lib/fal.server";
import { downloadAndStoreUrl } from "@/lib/project-assets.server";
import {
  applyPatch,
  INITIAL_PROJECT,
  PENDING_MIME,
  type ProjectAsset,
  type ProjectPatch,
  type ProjectState,
} from "@/lib/project-state";

// ── Brief analysis (cast & setting up front) ────────────────────────

const BriefInput = z.object({
  logline: z.string().trim().min(1).max(2000),
  lengthSec: z.union([z.literal(8), z.literal(15), z.literal(30), z.literal(60), z.literal(90), z.literal(120)]).optional(),
  style: z.string().trim().max(80).optional(),
});

const EntitySchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(600),
});

const BriefAnalysisSchema = z.object({
  characters: z.array(EntitySchema).max(6),
  environments: z.array(EntitySchema).max(6),
  product: EntitySchema.nullable().optional(),
  notes: z.string().max(400).optional(),
});

export type ShortFilmEntity = z.infer<typeof EntitySchema>;
export type ShortFilmBriefAnalysis = z.infer<typeof BriefAnalysisSchema>;

export const analyzeShortFilmBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => BriefInput.parse(data))
  .handler(async ({ data }): Promise<ShortFilmBriefAnalysis> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);

    const system =
      "You analyze a logline for a very short cinematic film and extract the entities needed to keep visuals consistent across shots. " +
      "Return ONLY valid JSON, no markdown, with this exact shape:\n" +
      "{\n" +
      '  "characters": [{ "name": string, "description": string (image-prompt ready, <= 600 chars) }],\n' +
      '  "environments": [{ "name": string, "description": string (image-prompt ready, <= 600 chars) }],\n' +
      '  "product": { "name": string, "description": string } | null,\n' +
      '  "notes": string?\n' +
      "}\n" +
      "Rules:\n" +
      "- Include every named or strongly-implied character (1-4 typical). Use a short descriptive name if unnamed (e.g. 'The Gardener').\n" +
      "- Include every distinct setting that will appear (1-3 typical).\n" +
      "- Set product to a non-null object ONLY if the logline implies a hero product, brand, or specific object that needs to look identical across shots (e.g. 'a short film featuring the XYZ headphones'). Otherwise return null.\n" +
      "- descriptions must be vivid, visual, and ready to drop into an image generator (appearance, wardrobe, lighting, materials, era).";

    const userPrompt =
      `Logline: ${data.logline}\n` +
      (data.lengthSec ? `Length: ${data.lengthSec}s\n` : "") +
      (data.style ? `Style: ${data.style}\n` : "");

    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system,
        prompt: userPrompt,
      });
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
      const parsed = JSON.parse(jsonStr);
      return BriefAnalysisSchema.parse(parsed);
    } catch (err) {
      console.error("[short-film] analyzeShortFilmBrief failed", err);
      throw err;
    }
  });

// ── Concept ─────────────────────────────────────────────────────────

const ConceptInput = z.object({
  logline: z.string().trim().min(1).max(2000),
  lengthSec: z.union([z.literal(8), z.literal(15), z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
  style: z.string().trim().max(80).optional(),
  cast: z.array(EntitySchema).max(6).optional(),
  setting: z.array(EntitySchema).max(6).optional(),
  product: EntitySchema.nullable().optional(),
  audioPlan: z.string().trim().max(2000).optional(),
});

const ShotSchema = z.object({
  timecode: z.string(),       // "0.0-3.5s" relative to beat start
  framing: z.string(),         // "medium close-up on Aria"
  cameraMove: z.string(),      // "slow dolly-in, 35mm"
  action: z.string(),          // prose: what happens on-screen
});

const DialogueLineSchema = z.object({
  speaker: z.string(),         // cast name or "Narrator"
  line: z.string(),
  delivery: z.string().optional(), // "whispered", "shouted", "tearful"
});

const ShortFilmConceptSchema = z.object({
  title: z.string(),
  characterDesc: z.string(),
  environmentDesc: z.string(),
  beats: z.array(
    z.object({
      // Legacy/required fields — still drive existing editors & TTS.
      timecode: z.string(),
      camera: z.string(),
      action: z.string(),
      voiceover: z.string().optional(),
      // Rich fields — populated when the LLM produces a richer storyboard.
      // All optional so older saved concepts keep loading.
      title: z.string().optional(),
      durationSec: z.number().optional(),
      setting: z.string().optional(),
      lighting: z.string().optional(),
      wardrobeContinuity: z.string().optional(),
      shots: z.array(ShotSchema).max(3).optional(),
      dialogue: z.array(DialogueLineSchema).max(8).optional(),
      sfx: z.string().optional(),
      musicCue: z.string().optional(),
      // When true (or omitted for back-compat), Seedance bakes the music
      // for this beat into the clip. When false, no music is generated
      // inside Seedance — an external track from `musicTracks` covers it.
      musicInSeedance: z.boolean().optional(),
    }),
  ),
  voiceoverScript: z.string(),
  musicMood: z.string(),
  // Optional dedicated music tracks generated by a music model and laid
  // across the timeline. Used for sustained score that spans multiple
  // beats. Beats covered by a track should set musicInSeedance=false.
  musicTracks: z
    .array(
      z.object({
        label: z.string().max(60),
        prompt: z.string().min(1).max(400),
        // 1-indexed inclusive beat range this track covers.
        beatStart: z.number().int().min(1),
        beatEnd: z.number().int().min(1),
        durationSec: z.number().int().min(8).max(60),
      }),
    )
    .optional(),
});

export type ShortFilmConcept = z.infer<typeof ShortFilmConceptSchema>;

export const generateShortFilmConcept = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ConceptInput.parse(data))
  .handler(async ({ data }): Promise<ShortFilmConcept> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);

    // Seedance renders one beat per clip and supports 4–15s per clip. We
    // let the LLM decide both how many beats and how long each one is, so
    // pacing is dictated by the story instead of a fixed grid. We only
    // hand it the bounds and the total budget.
    const minBeatSec = 4;
    const maxBeatSec = 15;
    const minBeats = Math.max(2, Math.ceil(data.lengthSec / maxBeatSec));
    const maxBeats = Math.max(minBeats, Math.min(10, Math.floor(data.lengthSec / minBeatSec)));
    // Soft hint only — used for dialogue pacing math, not enforced.
    const avgBeatSec = Math.max(minBeatSec, Math.min(maxBeatSec, Math.round(data.lengthSec / Math.max(2, Math.round(data.lengthSec / 9)))));

    const system =
      "You are a director and screenwriter prepping a very short cinematic film that will be rendered ONE BEAT AT A TIME by a text-to-video model (Seedance 2.0). " +
      "Each beat becomes a single continuous video clip — write each one as a self-contained mini-scene with full visual + audio direction. " +
      "Return ONLY valid JSON (no markdown, no code fences, no commentary) with this exact shape:\n" +
      "{\n" +
      '  "title": string,\n' +
      '  "characterDesc": string (image-prompt ready, <= 400 chars, summarises the protagonist),\n' +
      '  "environmentDesc": string (image-prompt ready, <= 400 chars, summarises the primary setting),\n' +
      '  "beats": [{\n' +
      '    "title": string (3-6 word beat label),\n' +
      '    "durationSec": number (you decide — pick what the beat needs within the allowed window),\n' +
      '    "timecode": string (e.g. "0-10s" within the film),\n' +
      '    "setting": string (location, time of day, weather, ambience),\n' +
      '    "lighting": string (key light direction, mood, color temperature),\n' +
      '    "wardrobeContinuity": string (what each named character wears this beat — keep it consistent with prior beats),\n' +
      '    "camera": string (one-phrase summary of the primary camera move for legacy use),\n' +
      '    "action": string (one-sentence summary of what happens in the beat — used in legacy UI),\n' +
      '    "shots": [{ "timecode": "0.0-4.0s", "framing": string, "cameraMove": string (camera + lens), "action": string (vivid prose: subject, motion, blocking) }],\n' +
      '    "dialogue": [{ "speaker": string (MUST match a cast name above, or "Narrator"), "line": string, "delivery": string? }],\n' +
      '    "voiceover": string (legacy: the first dialogue line joined for the per-beat TTS path),\n' +
      '    "sfx": string (diegetic sound cues),\n' +
      '    "musicCue": string (how the music shifts in this beat),\n' +
      '    "musicInSeedance": boolean (see music routing rules below)\n' +
      '  }],\n' +
      '  "voiceoverScript": string (full performable narration assembled from every beat\'s dialogue in order, <= 2000 chars),\n' +
      '  "musicMood": string (one-line description of the music bed),\n' +
      '  "musicTracks": [{ "label": string (3-5 word act/section name), "prompt": string (rich music-model prompt, <=400 chars: genre, instrumentation, tempo, mood arc), "beatStart": int (1-indexed), "beatEnd": int (1-indexed, inclusive), "durationSec": int 8-60 }]\n' +
      "}\n" +
      "Hard rules:\n" +
      `- Produce between ${minBeats} and ${maxBeats} beats. YOU choose the count AND the durationSec of each beat based on what the story needs — do NOT default every beat to the same length. Vary pacing (fast cuts, longer holds) as the drama demands.\n` +
      `- Each beat's durationSec must be an integer between ${minBeatSec} and ${maxBeatSec}. The sum of all beat durationSec must equal ${data.lengthSec} (±2s).\n` +
      `- Dialogue pacing: a beat of N seconds fits roughly N×2.3 spoken words across all lines. Do NOT exceed this for the beat's chosen duration.\n` +
      "- 1 to 3 shots per beat. Shot timecodes are RELATIVE to the beat start and must sum to the beat's duration.\n" +
      "- When cast/setting are provided, refer to characters and environments by their exact names in shot action AND dialogue.speaker. Never invent new names.\n" +
      "- Continuity is critical: wardrobeContinuity must reference the same outfits across beats unless the story demands a change.\n" +
      "- Every shot's action must be vivid, image-promptable prose (subject + motion + blocking + lens feel). No bullet points inside fields.\n" +
      "Music routing rules (decide per act, not per beat):\n" +
      "- Group consecutive beats into 1–3 acts (e.g. setup, midpoint, climax). For each act, decide whether the music should be GENERATED INSIDE Seedance (per-beat) or as a SEPARATE EXTERNAL TRACK laid across the timeline.\n" +
      "- Prefer EXTERNAL tracks when an act has a sustained mood/score spanning multiple beats (cohesive score, ambient bed, song-like underscore). Add one entry to musicTracks covering that beat range, and set musicInSeedance=false on every beat in that range.\n" +
      "- Prefer INSIDE-Seedance music when the cue is short, tightly synced to on-screen action, diegetic (radio, instrument played on screen), or a one-shot stinger/transition. Set musicInSeedance=true on that beat and do NOT add a musicTracks entry for it.\n" +
      "- Silent beats (musicCue empty) should set musicInSeedance=false and not appear in any musicTracks entry.\n" +
      "- musicTracks may be empty if every beat handles music inside Seedance. A project can mix both — external acts and inside-Seedance beats may coexist.\n" +
      "- For each musicTracks entry, durationSec must roughly equal the sum of its covered beats' durationSec, clamped to 8–60.";

    const castBlock = data.cast && data.cast.length > 0
      ? `Cast (use these exact names):\n${data.cast.map((c) => `- ${c.name}: ${c.description}`).join("\n")}\n`
      : "";
    const settingBlock = data.setting && data.setting.length > 0
      ? `Settings (use these exact names):\n${data.setting.map((s) => `- ${s.name}: ${s.description}`).join("\n")}\n`
      : "";
    const productBlock = data.product
      ? `Hero product: ${data.product.name} — ${data.product.description}\n`
      : "";

    const audioBlock = data.audioPlan ? `\n${data.audioPlan}\n` : "";

    const userPrompt =
      `Logline: ${data.logline}\n` +
      `Total length: ${data.lengthSec}s\n` +
      `Beat plan: ${minBeats}–${maxBeats} beats, each ${minBeatSec}–${maxBeatSec}s (you decide both count and individual durations; total must equal ${data.lengthSec}s; typical beat ≈ ${avgBeatSec}s).\n` +
      (data.style ? `Style: ${data.style}\n` : "") +
      castBlock + settingBlock + productBlock + audioBlock;

    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system,
        prompt: userPrompt,
      });
      const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
      const parsed = JSON.parse(jsonStr);
      return ShortFilmConceptSchema.parse(parsed);
    } catch (err) {
      console.error("[short-film] generateShortFilmConcept failed", err);
      throw err;
    }
  });


// ── Reference image (character / environment) ───────────────────────

const RefImageInput = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(["character", "environment", "keyframe", "product"]),
  prompt: z.string().trim().min(1).max(1200),
  style: z.string().trim().max(80).optional(),
  aspect: z.string().max(8).optional(),
  referenceImageUrls: z.array(z.string().url()).max(4).optional(),
});

export const generateShortFilmReferenceImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RefImageInput.parse(data))
  .handler(async ({ data, context }): Promise<ProjectAsset> => {
    const userId = context.userId;
    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");

    const stylePrefix = data.style ? `${data.style} style. ` : "";
    const kindPrefix =
      data.kind === "character"
        ? "Character portrait, full body, neutral background. "
        : data.kind === "environment"
          ? "Cinematic establishing shot of the environment. "
          : data.kind === "product"
            ? "Product hero shot, centered, studio lighting, neutral background. "
            : "Cinematic still, single frame, sharp focus. ";
    const prompt = `${stylePrefix}${kindPrefix}${data.prompt}`;

    const defaultAspect =
      data.kind === "character" ? "9:16" : "16:9";
    const sourceUrl = await falGenerateImage({
      prompt,
      aspect: data.aspect ?? defaultAspect,
      referenceImageUrls: data.referenceImageUrls,
    });
    const stored = await downloadAndStoreUrl({
      projectId: data.projectId,
      userId,
      sourceUrl,
      kind: "reference",
      label: `${data.kind}: ${data.prompt.slice(0, 80)}`,
      fallbackMime: "image/png",
    });
    return {
      id: stored.id,
      kind: "reference",
      mime: stored.mime,
      name: `${data.kind}.${stored.mime.split("/")[1] ?? "png"}`,
      url: stored.url,
      label: `${data.kind}: ${data.prompt.slice(0, 80)}`,
    };
  });

// ── Music ───────────────────────────────────────────────────────────

const MusicInput = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(400),
  durationSec: z.number().int().min(8).max(60),
});

export const generateShortFilmMusic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => MusicInput.parse(data))
  .handler(async ({ data, context }): Promise<ProjectAsset> => {
    const userId = context.userId;
    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");

    const sourceUrl = await falGenerateMusic({
      prompt: data.prompt,
      durationSeconds: data.durationSec,
    });
    const stored = await downloadAndStoreUrl({
      projectId: data.projectId,
      userId,
      sourceUrl,
      kind: "music",
      label: data.prompt.slice(0, 80),
      fallbackMime: "audio/mpeg",
    });
    return {
      id: stored.id,
      kind: "music",
      mime: stored.mime,
      name: `music.${stored.mime.split("/")[1] ?? "mp3"}`,
      url: stored.url,
      label: data.prompt.slice(0, 80),
    };
  });

// ── Pure prompt assembly ────────────────────────────────────────────

export function composeShortFilmPrompt({
  concept,
  style,
}: {
  concept: ShortFilmConcept;
  style?: string;
}): string {
  const header = [
    style ? `Style: ${style}.` : null,
    `Title: ${concept.title}.`,
    `Character: ${concept.characterDesc}`,
    `Environment: ${concept.environmentDesc}`,
  ]
    .filter(Boolean)
    .join("\n");
  const beats = concept.beats
    .map((b, i) => {
      const vo = b.voiceover ? ` Voiceover: "${b.voiceover}"` : "";
      return `Shot ${i + 1} [${b.timecode}] (${b.camera}): ${b.action}.${vo}`;
    })
    .join("\n");
  return `${header}\n\n${beats}`;
}

// ── Dynamic per-step suggestions ────────────────────────────────────

const SuggestInput = z.object({
  logline: z.string().trim().min(1).max(2000),
  lengthSec: z.union([z.literal(8), z.literal(15), z.literal(30), z.literal(60), z.literal(90), z.literal(120)]).optional(),
  style: z.string().trim().max(80).optional(),
  hasCharacter: z.boolean().optional(),
  hasEnvironment: z.boolean().optional(),
  shotCount: z.number().int().min(0).max(20).optional(),
  keyframeCount: z.number().int().min(0).max(20).optional(),
  renderPathIds: z.array(z.string()).max(10).optional(),
});

const SuggestionsSchema = z.object({
  logline: z.object({
    styleChips: z.array(z.string().max(40)).min(3).max(8),
    recommendedLengthSec: z.union([z.literal(8), z.literal(15), z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
  }),
  storyboard: z.object({
    suggestedBeatCount: z.number().int().min(2).max(8),
    cameraHints: z.array(z.string().max(60)).max(6),
    perBeat: z
      .array(
        z.object({
          cameraSuggestion: z.string().max(200),
          keyframeRecommended: z.boolean(),
          keyframeReason: z.string().max(120).optional(),
        }),
      )
      .max(8),
  }),
  character: z.object({
    applicable: z.boolean(),
    seedPrompt: z.string().max(400).optional(),
    aspect: z.enum(["9:16", "1:1"]).optional(),
  }),
  environment: z.object({
    applicable: z.boolean(),
    seedPrompt: z.string().max(400).optional(),
    aspect: z.enum(["16:9", "1:1"]).optional(),
  }),
  animate: z.object({
    recommendedPathId: z.string().max(40),
    reason: z.string().max(160),
    pathOrder: z.array(z.string().max(40)).max(10),
  }),
  audio: z.object({
    musicMoodChips: z.array(z.string().max(40)).max(8),
    suggestedMusicDurationSec: z.number().int().min(8).max(60),
    voEnabled: z.boolean(),
  }),
});

export type ShortFilmSuggestions = z.infer<typeof SuggestionsSchema>;

export const suggestShortFilmOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SuggestInput.parse(data))
  .handler(async ({ data }): Promise<ShortFilmSuggestions> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);

    const pathList = (data.renderPathIds && data.renderPathIds.length > 0
      ? data.renderPathIds
      : ["seedance", "kling-cheap"]
    ).join(", ");

    const system =
      "You are a director's assistant tailoring the option set of a short-film creation tool to the user's brief. " +
      "Return ONLY valid JSON, no markdown, with this exact shape:\n" +
      "{\n" +
      '  "logline": { "styleChips": string[3-8], "recommendedLengthSec": 8|15|30 },\n' +
      '  "storyboard": { "suggestedBeatCount": int 2-8, "cameraHints": string[0-6], "perBeat": [{ "cameraSuggestion": string, "keyframeRecommended": boolean, "keyframeReason": string? }] (length = suggestedBeatCount) },\n' +
      '  "character": { "applicable": boolean, "seedPrompt": string?, "aspect": "9:16"|"1:1"? },\n' +
      '  "environment": { "applicable": boolean, "seedPrompt": string?, "aspect": "16:9"|"1:1"? },\n' +
      `  "animate": { "recommendedPathId": one of [${pathList}], "reason": string, "pathOrder": string[] (subset of the same ids, recommended first) },\n` +
      '  "audio": { "musicMoodChips": string[0-8], "suggestedMusicDurationSec": int 8-60, "voEnabled": boolean }\n' +
      "}\n" +
      "Rules: styleChips fit the logline's tone (cinematic vs playful vs doc, etc). " +
      "applicable=false for character if the logline has no protagonist; for environment if it's abstract/typographic. " +
      "keyframeRecommended=true for shots with specific composition or props that benefit from a fixed first frame. " +
      "voEnabled=false if narration would not fit (e.g. purely visual/musical pieces).";

    const userPrompt =
      `Logline: ${data.logline}\n` +
      (data.lengthSec ? `Current length: ${data.lengthSec}s\n` : "") +
      (data.style ? `Current style: ${data.style}\n` : "") +
      (typeof data.shotCount === "number" ? `Shot count so far: ${data.shotCount}\n` : "") +
      (typeof data.keyframeCount === "number" ? `Keyframes set: ${data.keyframeCount}\n` : "") +
      (typeof data.hasCharacter === "boolean" ? `Character image set: ${data.hasCharacter}\n` : "") +
      (typeof data.hasEnvironment === "boolean" ? `Environment image set: ${data.hasEnvironment}\n` : "") +
      `Available render path ids: ${pathList}`;

    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system,
        prompt: userPrompt,
      });
      const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
      const parsed = JSON.parse(jsonStr);
      return SuggestionsSchema.parse(parsed);
    } catch (err) {
      console.error("[short-film] suggestShortFilmOptions failed", err);
      throw err;
    }
  });

// ── Per-beat Seedance 2.0 render (queue-based start + poll) ─────────
//
// Seedance generations routinely take 2-5 minutes per beat. A
// Cloudflare Worker request can't stay open that long, so we split
// the render into two server functions: `startShortFilmBeat` submits
// to the fal queue and returns the queue URLs; the client polls
// `pollShortFilmBeat` every few seconds until it reports completed
// or failed. All beats share the same reference image set so
// characters/environments stay consistent across cuts. Content-policy
// retries are driven by the client (re-submit with safePrompt).

const StartBeatInput = z.object({
  prompt: z.string().trim().min(1).max(7800),
  durationSec: z.number().int().min(4).max(15),
  referenceImageUrls: z.array(z.string().url()).max(9).optional(),
  generateAudio: z.boolean().optional(),
  aspect: z.string().max(8).optional(),
  resolution: z.enum(["480p", "720p", "1080p"]).optional(),
});

export const startShortFilmBeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => StartBeatInput.parse(data))
  .handler(async ({ data }) => {
    const refs = data.referenceImageUrls ?? [];
    const modelId =
      refs.length > 0
        ? "bytedance/seedance-2.0/reference-to-video"
        : "bytedance/seedance-2.0/text-to-video";
    const body: Record<string, unknown> = {
      prompt: data.prompt,
      aspect_ratio: data.aspect ?? "16:9",
      resolution: data.resolution ?? "1080p",
      duration: data.durationSec,
      generate_audio: data.generateAudio ?? true,
    };
    if (refs.length > 0) body.image_urls = refs;

    const { falSubmit } = await import("@/lib/fal.server");
    const submitted = await falSubmit(modelId, body, "seedance-2.0");
    return {
      statusUrl: submitted.statusUrl,
      responseUrl: submitted.responseUrl,
      requestId: submitted.requestId,
    };
  });

const PollBeatInput = z.object({
  projectId: z.string().uuid(),
  statusUrl: z.string().url(),
  responseUrl: z.string().url(),
  durationSec: z.number().int().min(4).max(15),
  label: z.string().max(200).optional(),
});

export const pollShortFilmBeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PollBeatInput.parse(data))
  .handler(async ({ data, context }) => {
    const { falPickVideoUrl, falPollOnce } = await import("@/lib/fal.server");
    const tick = await falPollOnce(data.statusUrl, data.responseUrl);
    if (tick.status === "in_progress") return { status: "pending" as const };
    if (tick.status === "failed") return { status: "failed" as const, error: tick.error };
    const out = tick.response;
    const videoUrl = falPickVideoUrl(out);
    if (!videoUrl) {
      return {
        status: "failed" as const,
        error: `Seedance returned no video URL. Raw: ${JSON.stringify(out).slice(0, 300)}`,
      };
    }

    const stored = await downloadAndStoreUrl({
      projectId: data.projectId,
      userId: context.userId,
      sourceUrl: videoUrl,
      kind: "video",
      label: data.label ?? `Seedance beat (${data.durationSec}s)`,
      fallbackMime: "video/mp4",
      duration: data.durationSec,
    });
    return {
      status: "completed" as const,
      assetId: stored.id,
      assetUrl: stored.url,
      mime: stored.mime,
      durationSec: data.durationSec,
    };
  });



// ── Beat placeholder lifecycle ──────────────────────────────────────
//
// While each beat renders (Seedance can take several minutes), we drop a
// "pending" placeholder asset into the project + timeline so the user
// can see N rendering slots in Outputs and on the timeline. When the
// real beat lands we swap the placeholder in-place; on failure we drop
// the placeholder so nothing visual is left behind.

const SEP = "::timeline-instance::";
const newOrderUid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const PlaceholderInput = z.object({
  projectId: z.string().uuid(),
  label: z.string().trim().min(1).max(200),
  durationSec: z.number().min(1).max(120),
});

export const createBeatPlaceholder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PlaceholderInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: proj, error: projErr } = await supabaseAdmin
      .from("projects")
      .select("project_state")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projErr || !proj) throw new Error(projErr?.message ?? "Project not found");

    const { data: row, error: insErr } = await supabaseAdmin
      .from("project_assets")
      .insert({
        project_id: data.projectId,
        kind: "pending",
        mime: PENDING_MIME,
        name: data.label,
        label: data.label,
        duration: data.durationSec,
        url: "",
        storage_path: null,
      })
      .select("id")
      .single();
    if (insErr || !row) throw new Error(insErr?.message ?? "placeholder insert failed");

    const placeholderId = row.id as string;
    const baseState =
      (proj.project_state as ProjectState | null) ?? INITIAL_PROJECT;
    const curOrder = baseState.timeline?.order ?? [];
    const nextOrder = [...curOrder, `${placeholderId}${SEP}${newOrderUid()}`];
    const patch: ProjectPatch = {
      timeline: { order: nextOrder, seeded: true },
    };
    const nextState = applyPatch(baseState, patch);
    const { error: upErr } = await supabaseAdmin
      .from("projects")
      .update({
        project_state: nextState as unknown as never,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.projectId)
      .eq("user_id", context.userId);
    if (upErr) throw new Error(upErr.message);

    return { placeholderId };
  });

const FinalizeInput = z.object({
  projectId: z.string().uuid(),
  placeholderId: z.string().uuid(),
  // null => drop placeholder (beat failed). Otherwise swap for the
  // real rendered asset id in timeline order.
  realAssetId: z.string().uuid().nullable(),
});

export const createAudioPlaceholder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PlaceholderInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: proj, error: projErr } = await supabaseAdmin
      .from("projects")
      .select("project_state")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projErr || !proj) throw new Error(projErr?.message ?? "Project not found");

    const { data: row, error: insErr } = await supabaseAdmin
      .from("project_assets")
      .insert({
        project_id: data.projectId,
        kind: "pending",
        mime: PENDING_MIME,
        name: data.label,
        label: data.label,
        duration: data.durationSec,
        url: "",
        storage_path: null,
      })
      .select("id")
      .single();
    if (insErr || !row) throw new Error(insErr?.message ?? "placeholder insert failed");

    const placeholderId = row.id as string;
    const baseState =
      (proj.project_state as ProjectState | null) ?? INITIAL_PROJECT;
    const ref = `${placeholderId}${SEP}${newOrderUid()}`;
    const curTracks = baseState.timeline?.tracks ?? [];
    const a1Idx = curTracks.findIndex((t) => t.id === "a1");
    let nextTracks;
    if (a1Idx >= 0) {
      nextTracks = curTracks.map((t, i) =>
        i === a1Idx ? { ...t, order: [...t.order, ref] } : t,
      );
    } else {
      nextTracks = [
        ...curTracks,
        { id: "a1", kind: "audio" as const, name: "A1", order: [ref] },
      ];
    }
    const patch: ProjectPatch = {
      timeline: { tracks: nextTracks, seeded: true },
    };
    const nextState = applyPatch(baseState, patch);
    const { error: upErr } = await supabaseAdmin
      .from("projects")
      .update({
        project_state: nextState as unknown as never,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.projectId)
      .eq("user_id", context.userId);
    if (upErr) throw new Error(upErr.message);

    return { placeholderId };
  });

export const finalizeBeatPlaceholder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => FinalizeInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: proj, error: projErr } = await supabaseAdmin
      .from("projects")
      .select("project_state")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projErr || !proj) throw new Error(projErr?.message ?? "Project not found");
    const state =
      (proj.project_state as ProjectState | null) ?? INITIAL_PROJECT;
    const curOrder = state.timeline?.order ?? [];
    const curTracks = state.timeline?.tracks ?? [];
    const idOf = (ref: string) =>
      ref.includes(SEP) ? ref.split(SEP)[0] : ref;
    const swapOrDrop = (refs: string[]) =>
      data.realAssetId
        ? refs.map((ref) =>
            idOf(ref) === data.placeholderId
              ? `${data.realAssetId}${SEP}${newOrderUid()}`
              : ref,
          )
        : refs.filter((ref) => idOf(ref) !== data.placeholderId);
    const nextOrder = swapOrDrop(curOrder);
    const nextTracks = curTracks.map((t) => ({
      ...t,
      order: swapOrDrop(t.order),
    }));
    const nextState = applyPatch(state, {
      timeline: { order: nextOrder, tracks: nextTracks, seeded: true },
    });
    const { error: upErr } = await supabaseAdmin
      .from("projects")
      .update({
        project_state: nextState as unknown as never,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.projectId)
      .eq("user_id", context.userId);
    if (upErr) throw new Error(upErr.message);

    // Drop the placeholder row regardless of swap vs. drop — once the
    // timeline order no longer references it, nothing else uses it.
    await supabaseAdmin
      .from("project_assets")
      .delete()
      .eq("id", data.placeholderId)
      .eq("project_id", data.projectId);
    return { ok: true };
  });

// ── Stalled-beat recovery ───────────────────────────────────────────
// Renders are kicked off and polled from the browser. If a tab is
// closed mid-render, the placeholder row + timeline ref stick around
// forever — the user sees a spinner that never resolves. This server
// fn finds pending placeholders older than the staleness threshold,
// removes them from the timeline order/tracks, and deletes the rows
// so the UI can prompt the user to retry cleanly.
const RecoverInput = z.object({
  projectId: z.string().uuid(),
  // Anything older than this is presumed dead. Seedance beats top out
  // around 5 minutes in normal conditions; 15 minutes is a safe floor.
  staleMinutes: z.number().min(2).max(120).default(15),
});

export const recoverStalledBeats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RecoverInput.parse(data))
  .handler(async ({ data, context }) => {
    const cutoff = new Date(Date.now() - data.staleMinutes * 60_000).toISOString();
    const { data: stalled, error: qErr } = await supabaseAdmin
      .from("project_assets")
      .select("id,label,name,created_at")
      .eq("project_id", data.projectId)
      .eq("kind", "pending")
      .lt("created_at", cutoff);
    if (qErr) throw new Error(qErr.message);
    if (!stalled || stalled.length === 0) {
      return { recovered: [] as Array<{ id: string; label: string }> };
    }

    const { data: proj, error: projErr } = await supabaseAdmin
      .from("projects")
      .select("project_state")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projErr || !proj) throw new Error(projErr?.message ?? "Project not found");

    const stalledIds = new Set(stalled.map((r) => r.id as string));
    const idOf = (ref: string) =>
      ref.includes(SEP) ? ref.split(SEP)[0] : ref;
    const drop = (refs: string[]) =>
      refs.filter((ref) => !stalledIds.has(idOf(ref)));
    const state =
      (proj.project_state as ProjectState | null) ?? INITIAL_PROJECT;
    const nextOrder = drop(state.timeline?.order ?? []);
    const nextTracks = (state.timeline?.tracks ?? []).map((t) => ({
      ...t,
      order: drop(t.order),
    }));
    const nextState = applyPatch(state, {
      timeline: { order: nextOrder, tracks: nextTracks, seeded: true },
    });
    const { error: upErr } = await supabaseAdmin
      .from("projects")
      .update({
        project_state: nextState as unknown as never,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.projectId)
      .eq("user_id", context.userId);
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin
      .from("project_assets")
      .delete()
      .in("id", Array.from(stalledIds))
      .eq("project_id", data.projectId);

    return {
      recovered: stalled.map((r) => ({
        id: r.id as string,
        label: (r.label as string) ?? (r.name as string) ?? "Beat",
      })),
    };
  });



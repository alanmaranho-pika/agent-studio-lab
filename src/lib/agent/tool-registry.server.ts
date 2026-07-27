// Agent tool registry — a single shared catalog the Agent draws from via
// the `tool_search` / `tool_invoke` meta-tools in `src/routes/api/chat.ts`.
//
// The point: stop spot-treating every Default-mode app function as a new
// hand-written agent tool. Each entry below wraps an existing
// `createServerFn` (the same one that powers the Default-mode app), so
// adding a new agent capability = add a 5–10 line descriptor here, not
// a new branch in `chat.ts`.
//
// Wrappers call the underlying serverFn with `{ data: input }`. The
// serverFn's own `requireSupabaseAuth` middleware reads the bearer token
// from the live request scope (the same Authorization header the agent
// chat route already authenticated against), so RLS-scoped DB access
// behaves identically to the Default-mode UI.
//
// Every entry carries a REAL Zod inputSchema mirroring the wrapped
// serverFn's validator (field names, types, optionality), plus an
// `example` invocation. `tool_search` serializes the schema to JSON
// Schema so smaller models get structured, self-correctable errors
// instead of silent shape mismatches.

import { z } from "zod";

import { analyzeShortFilmBrief, generateShortFilmConcept, generateShortFilmMusic, generateShortFilmReferenceImage, suggestShortFilmOptions, startShortFilmBeat, pollShortFilmBeat, recoverStalledBeats } from "@/lib/short-film.functions";
import { generateAdConcept, suggestAdLooks } from "@/lib/special-product-ad.functions";
import { produceKlingAd, produceKlingFilm, renderKlingShot } from "@/lib/kling-render.functions";
import { produceWorldCup2026Video, WORLD_CUP_LANGUAGES } from "@/lib/world-cup.functions";
import { listCharacters, getCharacter, upsertCharacter, deleteCharacter } from "@/lib/characters.functions";
import { listLibraryAssets } from "@/lib/library.functions";
import {
  listLibrarySubjects,
  getLibrarySubject,
  upsertLibrarySubject,
  deleteLibrarySubject,
  attachSubjectToProject,
} from "@/lib/library-subjects.functions";
import { generateVoiceoverAsset } from "@/lib/tts.functions";
import { startRender, retryRenderScene, renderFinalVideo, listProjectRenders } from "@/lib/render.functions";
import { shareToCommunity, deleteCommunityShare } from "@/lib/community.functions";
import { startExport, getExportStatus } from "@/lib/export.functions";
import { pikaGenerateStart, pikaGeneratePoll } from "@/lib/pika.functions";
import { directGenerateStart, directGeneratePoll } from "@/lib/generate.functions";
import { attachLibraryAssetToProject } from "@/lib/projects.functions";

export type AgentToolCtx = {
  projectId: string;
  userId: string;
};

export type AgentTool = {
  /** Namespaced tool name, e.g. "short_film.generate_concept". */
  name: string;
  /** App/group bucket for filtered search. */
  group: string;
  /** One-line, model-facing description. */
  description: string;
  /** Zod schema for input validation. */
  inputSchema: z.ZodTypeAny;
  /** One realistic example arg object matching inputSchema (shown by tool_search). */
  example?: Record<string, unknown>;
  /** Run the wrapped server function and return its result. */
  execute: (input: unknown, ctx: AgentToolCtx) => Promise<unknown>;
};

// Convenience: call a serverFn with the given JSON payload. Most of our
// fns expect `{ data }`. The Tanstack serverFn callable runs middleware
// in the live request scope, so `requireSupabaseAuth` works as long as
// this is invoked from inside an authenticated route handler.
const call = <T>(fn: (args: { data: T }) => Promise<unknown>, data: T) =>
  fn({ data });

// Shared field helpers.
const optionalProjectId = z
  .string()
  .uuid()
  .optional()
  .describe("Project id. Defaults to the current project — usually omit.");

/** Merge ctx.projectId as a default; explicit input.projectId wins. */
const withProjectDefault = (input: unknown, ctx: AgentToolCtx) => ({
  projectId: ctx.projectId,
  ...(input as object),
});

const shortFilmEntity = z.object({
  name: z.string().min(1).max(60).describe("Entity name, e.g. 'The Gardener'."),
  description: z.string().min(1).max(600).describe("Image-prompt-ready visual description."),
});

const shortFilmLengthSec = z
  .union([z.literal(8), z.literal(15), z.literal(30), z.literal(60), z.literal(90), z.literal(120)])
  .describe("Total film length in seconds: 8 | 15 | 30 | 60 | 90 | 120.");

// ───────── Short Film ─────────
const shortFilm: AgentTool[] = [
  {
    name: "short_film.analyze_brief",
    group: "short_film",
    description: "Analyze a logline and extract a cast + environments list for a short film.",
    inputSchema: z.object({
      logline: z.string().min(1).max(2000).describe("The film logline / brief."),
      lengthSec: shortFilmLengthSec.optional(),
      style: z.string().max(80).optional().describe("Visual style, e.g. 'grainy 16mm'."),
    }),
    example: { logline: "A lonely lighthouse keeper befriends a storm.", lengthSec: 30, style: "grainy 16mm" },
    execute: (input) => call(analyzeShortFilmBrief, input as never),
  },
  {
    name: "short_film.generate_concept",
    group: "short_film",
    description: "Generate a structured short-film concept (title, beats, characters, environments) from a brief.",
    inputSchema: z.object({
      logline: z.string().min(1).max(2000).describe("The film logline / brief."),
      lengthSec: shortFilmLengthSec,
      style: z.string().max(80).optional().describe("Visual style, e.g. 'grainy 16mm'."),
      cast: z.array(shortFilmEntity).max(6).optional().describe("Known characters (from analyze_brief)."),
      setting: z.array(shortFilmEntity).max(6).optional().describe("Known environments (from analyze_brief)."),
      product: shortFilmEntity.nullable().optional().describe("Hero product to keep consistent, or null."),
      audioPlan: z.string().max(2000).optional().describe("Audio direction: music mood, VO, silence."),
    }),
    example: { logline: "A lonely lighthouse keeper befriends a storm.", lengthSec: 30 },
    execute: (input) => call(generateShortFilmConcept, input as never),
  },
  {
    name: "short_film.generate_reference_image",
    group: "short_film",
    description: "Generate a single reference image (character or environment) for a short film and persist it as a project asset.",
    inputSchema: z.object({
      kind: z.enum(["character", "environment", "keyframe", "product"]).describe("What the image depicts."),
      prompt: z.string().min(1).max(1200).describe("Visual description of the subject."),
      style: z.string().max(80).optional().describe("Style prefix, e.g. 'watercolor'."),
      aspect: z.string().max(8).optional().describe("Aspect ratio, e.g. '16:9', '9:16'."),
      referenceImageUrls: z.array(z.string().url()).max(4).optional().describe("Existing reference image URLs to stay on-model."),
    }),
    example: { kind: "character", prompt: "Weathered lighthouse keeper, 60s, yellow raincoat, lantern light", aspect: "9:16" },
    execute: (input, ctx) => call(generateShortFilmReferenceImage, { ...(input as object), projectId: ctx.projectId } as never),
  },
  {
    name: "short_film.generate_music",
    group: "short_film",
    description: "Generate a music bed for a short film and attach as a project asset.",
    inputSchema: z.object({
      prompt: z.string().min(1).max(400).describe("Music brief: mood, genre, instrumentation."),
      durationSec: z.number().int().min(8).max(60).describe("Track length in seconds (8-60)."),
    }),
    example: { prompt: "Melancholy piano over distant thunder, slow build", durationSec: 30 },
    execute: (input, ctx) => call(generateShortFilmMusic, { ...(input as object), projectId: ctx.projectId } as never),
  },
  {
    name: "short_film.suggest_options",
    group: "short_film",
    description: "Get LLM-suggested option chips (e.g. visual styles, pacing) for the short-film wizard.",
    inputSchema: z.object({
      logline: z.string().min(1).max(2000).describe("The film logline / brief."),
      lengthSec: shortFilmLengthSec.optional(),
      style: z.string().max(80).optional(),
      hasCharacter: z.boolean().optional().describe("Whether a character reference already exists."),
      hasEnvironment: z.boolean().optional().describe("Whether an environment reference already exists."),
      shotCount: z.number().int().min(0).max(20).optional().describe("Current storyboard shot count."),
      keyframeCount: z.number().int().min(0).max(20).optional().describe("Keyframes already generated."),
      renderPathIds: z.array(z.string()).max(10).optional().describe("Candidate render paths, e.g. ['seedance','kling-cheap']."),
    }),
    example: { logline: "A lonely lighthouse keeper befriends a storm.", lengthSec: 30 },
    execute: (input) => call(suggestShortFilmOptions, input as never),
  },
  {
    name: "short_film.start_beat",
    group: "short_film",
    description: "Kick off rendering a single short-film beat. Returns a job handle (statusUrl/responseUrl) for polling.",
    inputSchema: z.object({
      prompt: z.string().min(1).max(7800).describe("Full beat prompt: action, camera, style anchor."),
      durationSec: z.number().int().min(4).max(15).describe("Beat length in seconds (4-15)."),
      referenceImageUrls: z.array(z.string().url()).max(9).optional().describe("Character/environment/keyframe reference URLs."),
      generateAudio: z.boolean().optional().describe("Generate diegetic audio (default true)."),
      aspect: z.string().max(8).optional().describe("Aspect ratio, default '16:9'."),
      resolution: z.enum(["480p", "720p", "1080p"]).optional().describe("Output resolution, default '1080p'."),
    }),
    example: { prompt: "Beat 1: keeper climbs the spiral stairs, storm light through windows, handheld", durationSec: 8, aspect: "16:9" },
    execute: (input) => call(startShortFilmBeat, input as never),
  },
  {
    name: "short_film.poll_beat",
    group: "short_film",
    description: "Poll a short-film beat render job until it completes.",
    inputSchema: z.object({
      projectId: optionalProjectId,
      statusUrl: z.string().url().describe("statusUrl returned by start_beat."),
      responseUrl: z.string().url().describe("responseUrl returned by start_beat."),
      durationSec: z.number().int().min(4).max(15).describe("The beat's duration in seconds (same as start_beat)."),
      label: z.string().max(200).optional().describe("Label for the stored clip asset."),
    }),
    example: { statusUrl: "https://api.dev.pika.art/v1/media/jobs/...", responseUrl: "https://api.dev.pika.art/v1/media/jobs/.../content", durationSec: 8, label: "Beat 1" },
    execute: (input, ctx) => call(pollShortFilmBeat, withProjectDefault(input, ctx) as never),
  },
  {
    name: "short_film.recover_stalled_beats",
    group: "short_film",
    description: "Retry any stalled or failed short-film beat renders for this project.",
    inputSchema: z.object({
      staleMinutes: z.number().min(2).max(120).optional().describe("Pending beats older than this are presumed dead (default 15)."),
    }),
    example: { staleMinutes: 15 },
    execute: (input, ctx) => call(recoverStalledBeats, { ...(input as object), projectId: ctx.projectId } as never),
  },
];

// ───────── Product Ad ─────────
const productAd: AgentTool[] = [
  {
    name: "product_ad.scrape_url",
    group: "product_ad",
    description: "Scrape a product URL (Shopify, brand site, Amazon) and import the hero photo as a project reference asset. Returns { productName, brief, look, image: { id, url } }. Use image.id in referenceAssetIds on subsequent renders.",
    inputSchema: z.object({ url: z.string().url().max(2000).describe("Public product page URL.") }),
    example: { url: "https://shop.example.com/products/aero-water-bottle" },
    execute: async (input, ctx) => {
      const { scrapeProductCore } = await import("@/lib/product-scrape.server");
      const { url } = input as { url: string };
      return scrapeProductCore({ url, projectId: ctx.projectId, userId: ctx.userId });
    },
  },
  {
    name: "product_ad.generate_concept",
    group: "product_ad",
    description: "Generate an ad concept (hooks, beats, scenes) for a scraped or described product.",
    inputSchema: z.object({
      brief: z.string().min(1).max(2000).describe("What the ad should communicate."),
      productHint: z.string().max(200).optional().describe("Product name / short descriptor."),
      lengthSec: z.number().int().min(4).max(600).describe("Target ad length in seconds."),
      look: z.string().max(80).optional().describe("Visual look, e.g. 'studio minimal'."),
    }),
    example: { brief: "Launch ad for an insulated water bottle, energetic outdoor vibe", productHint: "Aero Bottle", lengthSec: 15 },
    execute: (input) => call(generateAdConcept, input as never),
  },
  {
    name: "product_ad.suggest_looks",
    group: "product_ad",
    description: "Suggest visual looks (style chips) for a product ad concept.",
    inputSchema: z.object({
      brief: z.string().max(2000).optional().describe("The ad brief."),
      productHint: z.string().max(200).optional().describe("Product name / short descriptor."),
      concept: z.string().max(4000).optional().describe("Existing concept text to tailor looks to."),
    }),
    example: { brief: "Launch ad for an insulated water bottle", productHint: "Aero Bottle" },
    execute: (input) => call(suggestAdLooks, input as never),
  },
];

// ───────── Kling renders ─────────
const klingFilmBeat = z.object({
  timecode: z.string().describe("e.g. '0:00-0:08'."),
  camera: z.string().describe("Camera direction for the beat."),
  action: z.string().describe("What happens on screen."),
  voiceover: z.string().optional().describe("VO line for this beat."),
});

const klingAdBeat = z.object({
  timecode: z.string().describe("e.g. '0:00-0:04'."),
  action: z.string().describe("What happens on screen."),
  voiceover: z.string().optional().describe("VO line for this beat."),
});

const kling: AgentTool[] = [
  {
    name: "kling.produce_film",
    group: "kling",
    description: "Render a full short film via Kling. Returns the final video asset.",
    inputSchema: z.object({
      projectId: optionalProjectId,
      concept: z.object({
        title: z.string(),
        characterDesc: z.string().describe("Visual description of the lead character."),
        environmentDesc: z.string().describe("Visual description of the setting."),
        beats: z.array(klingFilmBeat).min(1).max(8),
        voiceoverScript: z.string().describe("Full VO script (empty string if none)."),
        musicMood: z.string().describe("Music mood brief."),
      }),
      style: z.string().max(80).optional().describe("Visual style, e.g. 'noir'."),
      characterUrl: z.string().url().optional().describe("Character reference image URL."),
      environmentUrl: z.string().url().optional().describe("Environment reference image URL."),
      audioMode: z.enum(["voiceover", "music", "silent"]).describe("Which audio track to generate."),
      totalDurationSec: shortFilmLengthSec,
      aspect: z.string().max(8).optional().describe("Aspect ratio, e.g. '16:9'."),
      keyframeUrls: z
        .array(z.string().url().nullable())
        .optional()
        .describe("Optional per-beat first-frame URLs; null slots are generated server-side."),
    }),
    example: {
      concept: {
        title: "The Keeper",
        characterDesc: "Weathered lighthouse keeper in a yellow raincoat",
        environmentDesc: "Storm-battered lighthouse on a cliff",
        beats: [{ timecode: "0:00-0:08", camera: "slow push-in", action: "Keeper lights the lantern", voiceover: "Every storm has a voice." }],
        voiceoverScript: "Every storm has a voice.",
        musicMood: "melancholy piano",
      },
      audioMode: "voiceover",
      totalDurationSec: 30,
    },
    execute: (input, ctx) => call(produceKlingFilm, withProjectDefault(input, ctx) as never),
  },
  {
    name: "kling.produce_ad",
    group: "kling",
    description: "Render a full product ad via Kling. Returns the final video asset.",
    inputSchema: z.object({
      projectId: optionalProjectId,
      concept: z.object({
        logline: z.string().describe("One-line ad concept."),
        beats: z.array(klingAdBeat).min(1).max(8),
        cta: z.string().optional().describe("Call to action."),
        musicMood: z.string().optional(),
        voiceoverScript: z.string().optional(),
        dialogue: z.array(z.object({ speaker: z.string().optional(), line: z.string() })).optional(),
      }),
      look: z.string().max(80).optional().describe("Visual look, e.g. 'studio minimal'."),
      productHint: z.string().max(200).optional(),
      productUrl: z.string().url().optional().describe("Hero product image URL."),
      totalDurationSec: z.number().int().min(6).max(120).describe("Total ad length in seconds."),
      aspect: z.string().max(8).optional(),
      audioMode: z.enum(["voiceover", "music", "voiceover+music", "silent"]).optional().describe("Audio to generate (default 'silent')."),
    }),
    example: {
      concept: { logline: "The bottle that keeps up.", beats: [{ timecode: "0:00-0:05", action: "Bottle slams onto a trailhead rock, condensation beads" }], cta: "Aero. Stay cold." },
      totalDurationSec: 15,
      audioMode: "music",
    },
    execute: (input, ctx) => call(produceKlingAd, withProjectDefault(input, ctx) as never),
  },
  {
    name: "kling.render_shot",
    group: "kling",
    description: "Render a single shot via Kling. Returns the video asset + duration.",
    inputSchema: z.object({
      projectId: optionalProjectId,
      prompt: z.string().min(1).max(1200).describe("Motion prompt for the shot."),
      imageUrl: z.string().url().describe("First-frame keyframe image URL to animate."),
      durationSec: z.number().int().min(5).max(10).describe("Shot length in seconds (5-10)."),
      aspect: z.string().max(8).optional(),
      label: z.string().max(200).optional().describe("Label for the stored clip asset."),
    }),
    example: { prompt: "Slow push-in as the keeper lights the lantern, rain streaks", imageUrl: "https://example.com/keyframe.png", durationSec: 5 },
    execute: (input, ctx) => call(renderKlingShot, withProjectDefault(input, ctx) as never),
  },
];

// ───────── World Cup ─────────
const worldCup: AgentTool[] = [
  {
    name: "world_cup.produce_video",
    group: "world_cup",
    description: "Produce an Anime World Cup 2026 video for the given teams / mode / likeness.",
    inputSchema: z.object({
      projectId: optionalProjectId,
      refImageUrl: z.string().url().describe("User likeness photo URL."),
      team: z.string().min(1).max(80).describe("Team the user supports, e.g. 'Brazil'."),
      opponent: z.string().min(1).max(80).optional().describe("Opposing team."),
      name: z.string().min(1).max(80).describe("The fan's display name."),
      scenario: z
        .enum([
          "score_goal", "spill_drink", "announcer_callout", "kiss_cam", "wild_celebration",
          "catch_souvenir", "wave_flag", "halftime_dance", "mascot_tackle", "vuvuzela_solo",
          "nacho_helmet", "proposal_fail", "streaker_chase", "ref_argument", "crowd_surf",
          "shirtless_paint", "tifo_unveil", "name_chant", "anthem_solo", "photobomb_reporter",
          "beer_snake",
        ])
        .describe("Which stadium scenario to render."),
      language: z.enum(WORLD_CUP_LANGUAGES).optional().describe("Announcer language (defaults to team's language)."),
    }),
    example: { refImageUrl: "https://example.com/selfie.jpg", team: "Brazil", name: "Alan", scenario: "score_goal" },
    execute: (input, ctx) => call(produceWorldCup2026Video, withProjectDefault(input, ctx) as never),
  },
];

// ───────── Characters ─────────
const characters: AgentTool[] = [
  {
    name: "character.list",
    group: "character",
    description: "List all saved Characters in the user's Library (name, description, image, voice).",
    inputSchema: z.object({}),
    example: {},
    execute: () => listCharacters(),
  },
  {
    name: "character.get",
    group: "character",
    description: "Get one Character by id.",
    inputSchema: z.object({ id: z.string().uuid().describe("Character id from character.list.") }),
    example: { id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" },
    execute: (input) => call(getCharacter, input as never),
  },
  {
    name: "character.upsert",
    group: "character",
    description: "Create or update a Character in the user's Library. Optional image via imageSourceUrl or projectAssetId.",
    inputSchema: z.object({
      id: z.string().uuid().optional().describe("Existing character id to update; omit to create."),
      name: z.string().min(1).max(120).optional().describe("Character name (required when creating)."),
      description: z.string().max(4000).optional().describe("Visual description used in prompts."),
      backstory: z.string().max(4000).optional(),
      voiceProvider: z.string().max(40).nullable().optional().describe("TTS provider, e.g. 'elevenlabs'."),
      voiceId: z.string().max(120).nullable().optional(),
      voiceLabel: z.string().max(120).nullable().optional(),
      imageBytesB64: z.string().optional().describe("Base64 image bytes (with imageMime + imageFilename)."),
      imageMime: z.string().max(80).optional(),
      imageFilename: z.string().max(200).optional(),
      imageSourceUrl: z.string().url().optional().describe("Server-fetches this URL as the portrait."),
      projectAssetId: z.string().uuid().optional().describe("Copy the portrait from an existing project asset."),
      clearImage: z.boolean().optional().describe("Remove the existing portrait."),
    }),
    example: { name: "Rus", description: "Tall skater in a red beanie, sun-faded denim", imageSourceUrl: "https://example.com/rus.png" },
    execute: (input) => call(upsertCharacter, input as never),
  },
  {
    name: "character.delete",
    group: "character",
    description: "Delete a Character from the Library.",
    inputSchema: z.object({ id: z.string().uuid().describe("Character id to delete.") }),
    example: { id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" },
    execute: (input) => call(deleteCharacter, input as never),
  },
];

// ───────── Library ─────────
const library: AgentTool[] = [
  {
    name: "library.list_assets",
    group: "library",
    description: "List the user's Library assets (cross-project outputs, uploads, exports).",
    inputSchema: z.object({}),
    example: {},
    execute: () => listLibraryAssets(),
  },
  {
    name: "project.attach_library_asset",
    group: "library",
    description: "Attach an existing Library asset (project output) to the current project as a reference.",
    inputSchema: z.object({
      sourceAssetId: z.string().uuid().describe("Library asset id to copy in (from library.list_assets)."),
      targetProjectId: z.string().uuid().optional().describe("Destination project. Defaults to the current project — usually omit."),
    }),
    example: { sourceAssetId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" },
    execute: (input, ctx) => {
      const { sourceAssetId, targetProjectId } = input as { sourceAssetId: string; targetProjectId?: string };
      return call(attachLibraryAssetToProject, { sourceAssetId, targetProjectId: targetProjectId ?? ctx.projectId } as never);
    },
  },
  {
    name: "library.list_subjects",
    group: "library",
    description: "List reusable Library Subjects (characters, products, scenes, logos, brand assets). Optionally filter by { kind }.",
    inputSchema: z.object({ kind: z.enum(["character", "product", "scene", "logo", "brand_asset"]).optional() }),
    example: { kind: "product" },
    execute: (input) => call(listLibrarySubjects, input as never),
  },
  {
    name: "library.get_subject",
    group: "library",
    description: "Fetch one Library Subject by id.",
    inputSchema: z.object({ id: z.string().uuid().describe("Subject id from library.list_subjects.") }),
    example: { id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" },
    execute: (input) => call(getLibrarySubject, input as never),
  },
  {
    name: "library.upsert_subject",
    group: "library",
    description: "Create or update a reusable Library Subject. Required for new: { kind, name }. Image via imageSourceUrl | projectAssetId | imageBytesB64. Extra refs via extraReferenceUrls.",
    inputSchema: z.object({
      id: z.string().uuid().optional().describe("Existing subject id to update; omit to create."),
      kind: z.enum(["character", "product", "scene", "logo", "brand_asset"]).optional().describe("Required when creating."),
      name: z.string().min(1).max(160).optional().describe("Required when creating."),
      aliases: z.array(z.string().max(80)).max(20).optional().describe("Alternate names the agent should match on."),
      description: z.string().max(4000).nullable().optional().describe("Visual description used in prompts."),
      brand: z.string().max(120).nullable().optional(),
      favorite: z.boolean().optional(),
      imageBytesB64: z.string().optional().describe("Base64 image bytes (with imageMime + imageFilename)."),
      imageMime: z.string().max(80).optional(),
      imageFilename: z.string().max(200).optional(),
      imageSourceUrl: z.string().url().optional().describe("Server-fetches this URL as the primary image."),
      projectAssetId: z.string().uuid().optional().describe("Copy the primary image from an existing project asset."),
      clearImage: z.boolean().optional().describe("Remove the existing primary image."),
      extraReferenceUrls: z.array(z.string().url()).max(12).optional().describe("Already-hosted reference URLs to append."),
      replaceReferenceUrls: z.boolean().optional().describe("Replace reference_urls instead of appending."),
    }),
    example: { kind: "product", name: "Aero Bottle", description: "Matte teal insulated bottle, bamboo cap", imageSourceUrl: "https://example.com/bottle.png" },
    execute: (input) => call(upsertLibrarySubject, input as never),
  },
  {
    name: "library.delete_subject",
    group: "library",
    description: "Delete a Library Subject by id.",
    inputSchema: z.object({ id: z.string().uuid().describe("Subject id to delete.") }),
    example: { id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" },
    execute: (input) => call(deleteLibrarySubject, input as never),
  },
  {
    name: "library.attach_subject_to_project",
    group: "library",
    description: "Copy a Library Subject's primary image + reference URLs into the current project as reference assets. Call BEFORE rendering when the user picks a saved subject.",
    inputSchema: z.object({ subjectId: z.string().uuid().describe("Subject id from library.list_subjects.") }),
    example: { subjectId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" },
    execute: (input, ctx) => call(attachSubjectToProject, { subjectId: (input as { subjectId: string }).subjectId, projectId: ctx.projectId } as never),
  },
];


// ───────── TTS / Voice ─────────
const tts: AgentTool[] = [
  {
    name: "tts.generate_voiceover",
    group: "tts",
    description: "Generate a voiceover audio asset from text. Attaches to the project.",
    inputSchema: z.object({
      text: z.string().min(1).max(2000).describe("The VO script to synthesize."),
      voice: z.string().min(1).max(64).optional().describe("Voice id/name; omit for the default voice."),
    }),
    example: { text: "Every storm has a voice. He learned to listen.", voice: "Rachel" },
    execute: (input, ctx) => call(generateVoiceoverAsset, { ...(input as object), projectId: ctx.projectId } as never),
  },
];

// ───────── Render pipeline ─────────
const render: AgentTool[] = [
  {
    name: "render.start",
    group: "render",
    description: "Start rendering all unrendered scenes for a project.",
    inputSchema: z.object({ projectId: optionalProjectId }),
    example: {},
    execute: (input, ctx) => call(startRender, { projectId: (input as { projectId?: string }).projectId ?? ctx.projectId } as never),
  },
  {
    name: "render.retry_scene",
    group: "render",
    description: "Retry a single failed scene render by scene output id.",
    inputSchema: z.object({ sceneOutputId: z.string().uuid().describe("Failed scene output id from render.list.") }),
    example: { sceneOutputId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" },
    execute: (input) => call(retryRenderScene, input as never),
  },
  {
    name: "render.render_final",
    group: "render",
    description: "Render the final stitched video for a project.",
    inputSchema: z.object({ projectId: optionalProjectId }),
    example: {},
    execute: (input, ctx) => call(renderFinalVideo, { projectId: (input as { projectId?: string }).projectId ?? ctx.projectId } as never),
  },
  {
    name: "render.list",
    group: "render",
    description: "List all render jobs for the current project (status, urls).",
    inputSchema: z.object({ projectId: optionalProjectId }),
    example: {},
    execute: (input, ctx) => call(listProjectRenders, { projectId: (input as { projectId?: string }).projectId ?? ctx.projectId } as never),
  },
];

// ───────── Export + Community ─────────
const exportTools: AgentTool[] = [
  {
    name: "export.start",
    group: "export",
    description: "Start a Shotstack export of the project timeline. Returns a jobId for polling.",
    inputSchema: z.object({
      settings: z.object({
        format: z.enum(["mp4", "gif", "webm", "mp3"]).describe("Output container."),
        resolution: z.enum(["480p", "720p", "1080p"]),
        fps: z.number().int().min(8).max(60).describe("Frames per second."),
        aspect: z.enum(["16:9", "9:16", "1:1", "4:5", "original"]).describe("Output aspect ('original' keeps the timeline aspect)."),
        quality: z.enum(["low", "medium", "high"]),
        background: z.enum(["black", "white", "transparent"]).describe("Letterbox/background fill."),
        includeMusic: z.boolean().describe("Whether to include the audio tracks."),
      }),
    }),
    example: { settings: { format: "mp4", resolution: "1080p", fps: 30, aspect: "original", quality: "high", background: "black", includeMusic: true } },
    execute: (input, ctx) => call(startExport, { ...(input as object), projectId: ctx.projectId } as never),
  },
  {
    name: "export.get_status",
    group: "export",
    description: "Poll an export job by jobId.",
    inputSchema: z.object({ jobId: z.string().uuid().describe("Job id returned by export.start.") }),
    example: { jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" },
    execute: (input) => call(getExportStatus, input as never),
  },
];

const community: AgentTool[] = [
  {
    name: "community.share",
    group: "community",
    description: "Share a finished project to the public Community feed.",
    inputSchema: z.object({
      projectId: z.string().uuid().nullable().optional().describe("Project to credit. Defaults to the current project — usually omit."),
      videoUrl: z.string().url().max(2048).describe("Public/signed URL of the finished video."),
      thumbUrl: z.string().url().max(2048).nullable().optional().describe("Poster/thumbnail image URL."),
      mime: z.string().max(80).optional().describe("Video MIME type (default 'video/mp4')."),
      width: z.number().int().positive().nullable().optional(),
      height: z.number().int().positive().nullable().optional(),
      duration: z.number().positive().nullable().optional().describe("Video duration in seconds."),
    }),
    example: { videoUrl: "https://example.com/final.mp4", thumbUrl: "https://example.com/final.jpg", duration: 30 },
    execute: (input, ctx) => call(shareToCommunity, withProjectDefault(input, ctx) as never),
  },
  {
    name: "community.delete_share",
    group: "community",
    description: "Remove a previously-shared item from the Community feed.",
    inputSchema: z.object({ id: z.string().uuid().describe("Community share id to remove.") }),
    example: { id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" },
    execute: (input) => call(deleteCommunityShare, input as never),
  },
];

// ───────── Generic fal generation (Pika + direct) ─────────
const generateParams = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
  .optional()
  .describe("Extra model params passed through verbatim (e.g. { duration: 5, resolution: '1080p' }).");

const direct: AgentTool[] = [
  {
    name: "pika.generate_start",
    group: "pika",
    description: "Start a Pika generation. Returns a request id (jobId) for polling with pika.generate_poll.",
    inputSchema: z.object({
      projectId: optionalProjectId,
      model: z.string().min(3).max(255).describe("Pika model id, e.g. 'pika:image-to-video-v2'."),
      prompt: z.string().min(1).max(8000),
      userMessageId: z.string().min(1).max(64).describe("Unique id for the chat user message this generation belongs to."),
      assistantMessageId: z.string().min(1).max(64).describe("Unique id for the chat assistant message the result attaches to."),
      imageUrl: z.string().url().optional().describe("Input image URL — required for image-to-video."),
      audioUrl: z.string().url().optional().describe("Input audio URL for audio-to-video."),
      params: generateParams,
    }),
    example: { model: "pika:image-to-video-v2", prompt: "Camera orbits the bottle, splash freeze", userMessageId: "msg_u1", assistantMessageId: "msg_a1", imageUrl: "https://example.com/frame.png" },
    execute: (input, ctx) => call(pikaGenerateStart, withProjectDefault(input, ctx) as never),
  },
  {
    name: "pika.generate_poll",
    group: "pika",
    description: "Poll a Pika generation job.",
    inputSchema: z.object({
      projectId: optionalProjectId,
      model: z.string().min(3).max(255).describe("Same model id passed to generate_start."),
      prompt: z.string().min(1).max(8000).describe("Same prompt passed to generate_start."),
      assistantMessageId: z.string().min(1).max(64).describe("Same assistantMessageId passed to generate_start."),
      jobId: z.string().min(1).max(128).describe("jobId returned by generate_start."),
    }),
    example: { model: "pika:image-to-video-v2", prompt: "Camera orbits the bottle, splash freeze", assistantMessageId: "msg_a1", jobId: "job_123" },
    execute: (input, ctx) => call(pikaGeneratePoll, withProjectDefault(input, ctx) as never),
  },
  {
    name: "generate.direct_start",
    group: "generate",
    description: "Start a direct Pika generation job (single shot). Returns statusUrl/responseUrl for generate.direct_poll.",
    inputSchema: z.object({
      projectId: optionalProjectId,
      prompt: z.string().min(1).max(8000),
      mode: z.enum(["image", "video", "audio", "speech"]).describe("What the model produces."),
      model: z.string().min(3).max(255).describe("Pika model id, e.g. 'bytedance/seedance-2.0/text-to-video'."),
      userMessageId: z.string().min(1).max(64).describe("Unique id for the chat user message this generation belongs to."),
      assistantMessageId: z.string().min(1).max(64).describe("Unique id for the chat assistant message the result attaches to."),
      referenceImageUrls: z.array(z.string().url()).max(8).optional().describe("Reference image URLs (likeness/keyframes)."),
      referenceVideoUrl: z.string().url().optional().describe("Reference video URL (video-to-video models)."),
      params: generateParams,
    }),
    example: { prompt: "Keeper lights the lantern, storm outside", mode: "video", model: "bytedance/seedance-2.0/text-to-video", userMessageId: "msg_u1", assistantMessageId: "msg_a1" },
    execute: (input, ctx) => call(directGenerateStart, withProjectDefault(input, ctx) as never),
  },
  {
    name: "generate.direct_poll",
    group: "generate",
    description: "Poll a direct Pika generation job.",
    inputSchema: z.object({
      projectId: optionalProjectId,
      mode: z.enum(["image", "video", "audio", "speech"]).describe("Same mode passed to direct_start."),
      model: z.string().min(3).max(255).describe("Same model id passed to direct_start."),
      prompt: z.string().min(1).max(8000).describe("Same prompt passed to direct_start."),
      assistantMessageId: z.string().min(1).max(64).describe("Same assistantMessageId passed to direct_start."),
      statusUrl: z.string().url().describe("statusUrl returned by direct_start."),
      responseUrl: z.string().url().describe("responseUrl returned by direct_start."),
      placeholderId: z.string().uuid().optional().describe("Placeholder asset id returned by direct_start, if any."),
      params: generateParams,
    }),
    example: { mode: "video", model: "bytedance/seedance-2.0/text-to-video", prompt: "Keeper lights the lantern, storm outside", assistantMessageId: "msg_a1", statusUrl: "https://api.dev.pika.art/v1/media/jobs/...", responseUrl: "https://api.dev.pika.art/v1/media/jobs/.../content" },
    execute: (input, ctx) => call(directGeneratePoll, withProjectDefault(input, ctx) as never),
  },
];

export const AGENT_TOOL_REGISTRY: AgentTool[] = [
  ...shortFilm,
  ...productAd,
  ...kling,
  ...worldCup,
  ...characters,
  ...library,
  ...tts,
  ...render,
  ...exportTools,
  ...community,
  ...direct,
];

const REGISTRY_BY_NAME = new Map(AGENT_TOOL_REGISTRY.map((t) => [t.name, t]));

export function findAgentTool(name: string): AgentTool | undefined {
  return REGISTRY_BY_NAME.get(name);
}

// ───────── Zod → JSON Schema (compact, zod v3) ─────────
// The installed zod is v3 (no z.toJSONSchema), so we hand-roll a serializer
// for the subset used in this registry: object / string / number / boolean /
// enum / literal / union / array / record / optional / nullable / default.
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = (schema as unknown as { _def: Record<string, unknown> })._def ?? {};
  const typeName = def.typeName as string | undefined;
  const description = def.description as string | undefined;
  const withDesc = (o: Record<string, unknown>): Record<string, unknown> =>
    description ? { description, ...o } : o;

  switch (typeName) {
    case "ZodOptional":
      return withDesc(zodToJsonSchema(def.innerType as z.ZodTypeAny));
    case "ZodDefault": {
      const inner = zodToJsonSchema(def.innerType as z.ZodTypeAny);
      try {
        inner.default = (def.defaultValue as () => unknown)();
      } catch {
        // ignore — default stays undocumented
      }
      return withDesc(inner);
    }
    case "ZodNullable":
      return withDesc({ ...zodToJsonSchema(def.innerType as z.ZodTypeAny), nullable: true });
    case "ZodEffects":
      return withDesc(zodToJsonSchema(def.schema as z.ZodTypeAny));
    case "ZodObject": {
      const shape = (def.shape as () => Record<string, z.ZodTypeAny>)();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        if (!value.isOptional()) required.push(key);
      }
      const out: Record<string, unknown> = { type: "object", properties };
      if (required.length) out.required = required;
      if (def.unknownKeys === "passthrough") out.additionalProperties = true;
      return withDesc(out);
    }
    case "ZodString":
      return withDesc({ type: "string" });
    case "ZodNumber": {
      const checks = (def.checks as Array<{ kind: string }> | undefined) ?? [];
      return withDesc({ type: checks.some((c) => c.kind === "int") ? "integer" : "number" });
    }
    case "ZodBoolean":
      return withDesc({ type: "boolean" });
    case "ZodEnum":
      return withDesc({ type: "string", enum: def.values as string[] });
    case "ZodLiteral":
      return withDesc({ const: def.value });
    case "ZodUnion": {
      const options = def.options as z.ZodTypeAny[];
      const defs = options.map((o) => (o as unknown as { _def: { typeName?: string; value?: unknown } })._def);
      if (defs.length > 0 && defs.every((d) => d.typeName === "ZodLiteral")) {
        return withDesc({ enum: defs.map((d) => d.value) });
      }
      return withDesc({ anyOf: options.map((o) => zodToJsonSchema(o)) });
    }
    case "ZodArray":
      return withDesc({ type: "array", items: zodToJsonSchema(def.type as z.ZodTypeAny) });
    case "ZodRecord":
      return withDesc({ type: "object", additionalProperties: zodToJsonSchema(def.valueType as z.ZodTypeAny) });
    case "ZodNull":
      return withDesc({ type: "null" });
    case "ZodUnknown":
    case "ZodAny":
    default:
      return withDesc({});
  }
}

export type AgentToolSearchResult = {
  name: string;
  group: string;
  description: string;
  /** JSON Schema of the tool's input, for structured self-correction. */
  inputSchema: Record<string, unknown>;
  /** One realistic example arg object. */
  example?: Record<string, unknown>;
};

export function searchAgentTools(opts: {
  query?: string;
  group?: string;
  limit?: number;
}): AgentToolSearchResult[] {
  const limit = Math.max(1, Math.min(opts.limit ?? 12, 30));
  const q = (opts.query ?? "").trim().toLowerCase();
  const g = (opts.group ?? "").trim().toLowerCase();
  return AGENT_TOOL_REGISTRY.filter((t) => {
    if (g && t.group.toLowerCase() !== g) return false;
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.group.toLowerCase().includes(q)
    );
  })
    .slice(0, limit)
    .map((t) => ({
      name: t.name,
      group: t.group,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
      ...(t.example ? { example: t.example } : {}),
    }));
}

export function listAgentToolGroups(): string[] {
  return Array.from(new Set(AGENT_TOOL_REGISTRY.map((t) => t.group))).sort();
}

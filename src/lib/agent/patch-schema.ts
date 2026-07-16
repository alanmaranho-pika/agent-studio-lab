// Zod schema mirroring `ProjectPatch` from `src/lib/project-state.ts`.
// This is the typed input for the `commit_project_patch` agent tool, so a
// malformed patch fails validation with a structured error the model can
// self-correct on (instead of the old JSON-string-in-JSON silent drop).
//
// Every top-level field is optional — a patch only carries the slices it
// changes. Field `.describe()` strings are model-facing documentation.

import { z } from "zod";
import type { ProjectPatch } from "@/lib/project-state";

const SceneSchema = z
  .object({
    id: z
      .string()
      .optional()
      .describe("Scene id (e.g. 's1010'). Include to upsert an existing scene; omit to create a new one."),
    n: z.number().optional().describe("1-based beat/shot number. Auto-assigned if omitted."),
    title: z.string().optional().describe("Short shot title, e.g. 'Beat 3: Rooftop reveal'."),
    prompt: z
      .string()
      .optional()
      .describe("Visual description of the shot — subject, setting, framing, lighting, mood."),
    duration: z.number().optional().describe("Shot duration in seconds (typically 3-8)."),
    thumb: z.string().optional().describe("Keyframe image URL (or project asset id) shown as the shot thumbnail."),
    status: z
      .enum(["ready", "drafting", "rendering"])
      .optional()
      .describe("Shot readiness: 'drafting' (default), 'ready' (keyframe approved), 'rendering'."),
    motionPrompt: z
      .string()
      .optional()
      .describe("Camera movement + action over time, e.g. 'slow push-in, board flips up at 0:02'."),
    voPrompt: z.string().optional().describe("Voiceover line read during this shot."),
    clipUrl: z.string().optional().describe("URL of the rendered video clip for this scene."),
    anchorAssetIds: z
      .array(z.string())
      .optional()
      .describe("Reference keyframe asset ids: [0]=first frame, [1]=optional last frame."),
    anchorApproved: z
      .boolean()
      .optional()
      .describe("Whether the user approved the anchor keyframe(s) — gates video rendering."),
  })
  .describe("Partial scene/shot. With an existing id it merges; without one it appends.");

const CharacterSchema = z
  .object({
    id: z.string().optional().describe("Cast member id. Include to update an existing character."),
    name: z.string().optional().describe("Character name, e.g. 'Rus'."),
    role: z.string().optional().describe("Role in the video, e.g. 'Lead vocalist'."),
    ref: z.string().optional().describe("Reference image: project asset id (ast_xxx) or URL."),
    notes: z.string().optional().describe("Appearance/wardrobe/personality notes used in prompts."),
  })
  .describe("Partial cast member. Upserts by id or case-insensitive name match.");

const MusicSchema = z
  .object({
    title: z.string().optional().describe("Track name or short audio brief, e.g. 'VO: warm female narrator, slow'."),
    artist: z.string().optional().describe("Performer / composer / VO talent."),
    bpm: z.number().optional().describe("Beats per minute."),
    key: z.string().optional().describe("Musical key, e.g. 'A minor'."),
    beats: z.array(z.number()).optional().describe("Beat timestamps in seconds."),
    duration: z.number().optional().describe("Track duration in seconds."),
  })
  .describe("Audio brief for the project (music, score, VO, ambient). Merged into existing music.");

const AssetKindSchema = z.enum([
  "likeness",
  "logo",
  "reference",
  "keyframe",
  "image",
  "music",
  "voiceover",
  "final",
  "voice",
  "audio",
  "video",
  "pending",
  "other",
]);

const AssetSchema = z
  .object({
    id: z.string().optional().describe("Asset id, e.g. 'ast_xxx'. Auto-generated if omitted."),
    kind: AssetKindSchema.optional().describe("Where the asset surfaces: likeness → Cast, audio → Audio, etc."),
    mime: z.string().optional().describe("MIME type, e.g. 'image/png'."),
    name: z.string().optional().describe("File name."),
    url: z.string().optional().describe("Asset URL (https or blob)."),
    label: z.string().optional().describe("Human-readable label shown in the panel."),
    attachedTo: z.string().optional().describe("Owning entity id, e.g. a character or scene id."),
    createdAt: z.string().optional().describe("ISO timestamp."),
    width: z.number().optional(),
    height: z.number().optional(),
    duration: z.number().optional().describe("Media duration in seconds."),
  })
  .describe("Partial project asset descriptor.");

const TimelineTrimSchema = z.object({
  start: z.number().describe("Trim in-point in seconds."),
  end: z.number().describe("Trim out-point in seconds."),
  offset: z.number().optional().describe("Playback offset in seconds."),
});

const TimelineFadeSchema = z.object({
  in: z.number().optional().describe("Fade-in duration in seconds."),
  out: z.number().optional().describe("Fade-out duration in seconds."),
});

const TimelineTrackSchema = z.object({
  id: z.string().describe("Track id, e.g. 'v1', 'a2'."),
  kind: z.enum(["video", "audio"]).describe("Track type."),
  name: z.string().describe("Display name, e.g. 'V2'."),
  order: z.array(z.string()).describe("Ordered clip refs (asset ids) on this track."),
  mute: z.boolean().optional(),
  solo: z.boolean().optional(),
  lock: z.boolean().optional(),
  volume: z.number().optional().describe("Per-track fader gain, 0..1.5 (1 = unity)."),
  pan: z.number().optional().describe("Per-track pan, -1 (L) .. 1 (R). Audio tracks only."),
});

const TimelineCommentSchema = z.object({
  id: z.string().describe("Comment id."),
  at: z.number().describe("Timeline time in milliseconds."),
  text: z.string().describe("Comment body."),
  author: z.string().optional(),
  clipId: z.string().optional().describe("Clip ref the comment is pinned to."),
  createdAt: z.string().describe("ISO timestamp."),
  resolved: z.boolean().optional(),
});

const TimelineSchema = z
  .object({
    order: z.array(z.string()).optional().describe("Ordered asset refs on the main V1/A1 tracks."),
    hidden: z.array(z.string()).optional().describe("Asset refs hidden from the timeline."),
    seeded: z.boolean().optional().describe("Whether the timeline was auto-seeded from scenes."),
    trims: z
      .record(z.string(), TimelineTrimSchema)
      .optional()
      .describe("Per-clip trim, keyed by clip ref."),
    volumes: z
      .record(z.string(), z.number())
      .optional()
      .describe("Per-clip gain 0..1.5, keyed by clip ref."),
    videoMuted: z
      .record(z.string(), z.boolean())
      .optional()
      .describe("Per-clip video-audio mute flags, keyed by clip ref."),
    fades: z
      .record(z.string(), TimelineFadeSchema)
      .optional()
      .describe("Per-clip fade in/out seconds, keyed by clip ref."),
    tracks: z.array(TimelineTrackSchema).optional().describe("Extra tracks beyond the default V1/A1."),
    offsets: z
      .record(z.string(), z.number())
      .optional()
      .describe("Leading gap in seconds before a clip ref on its track."),
    masterVolume: z.number().optional().describe("Master mixer gain, 0..1.5."),
    comments: z.array(TimelineCommentSchema).optional().describe("Review comments pinned to timeline time."),
  })
  .describe("Partial timeline state — provided fields replace that timeline slice.");

const NoteSchema = z.object({
  at: z.string().optional().describe("ISO timestamp. Defaults to now."),
  text: z.string().describe("1-2 sentence, decision-shaped note, e.g. 'User locked 9:16 aspect'."),
  tag: z.string().optional().describe("Short bucket: 'model' | 'concept' | 'audio' | 'aspect' | 'style'."),
});

const DocSchema = z
  .object({
    id: z.string().optional().describe("Doc slug, e.g. 'brief', 'script', 'style'. Upserts by id."),
    title: z.string().optional().describe("Doc title."),
    body: z.string().optional().describe("Markdown body (max ~40k chars)."),
    updatedAt: z.string().optional().describe("ISO timestamp. Defaults to now."),
  })
  .describe("Partial project doc (brief, script, style notes). Upserts by id.");

const ReferenceTileSchema = z
  .object({
    id: z.string().optional().describe("Tile id. Upserts by id, or dedupes by url when id omitted."),
    url: z.string().optional().describe("Reference image/page URL."),
    thumb: z.string().optional().describe("Thumbnail URL."),
    source: z.string().optional().describe("Origin: 'pinterest', 'instagram', 'web', ..."),
    handle: z.string().optional().describe("Creator handle, e.g. '@wavykings'."),
    caption: z.string().optional(),
    addedAt: z.string().optional().describe("ISO timestamp. Defaults to now."),
    selected: z.boolean().optional().describe("Whether the tile is selected on the mood board."),
  })
  .describe("Partial mood-board reference tile.");

const LocationSchema = z
  .object({
    id: z.string().optional().describe("Location id. Upserts by id or case-insensitive name."),
    name: z.string().optional().describe("Location name, e.g. 'Rooftop at dusk'."),
    description: z.string().optional().describe("Visual description used in prompts."),
    ref: z.string().optional().describe("Reference image URL."),
    notes: z.string().optional(),
  })
  .describe("Partial typed location.");

const StyleLockSchema = z
  .object({
    anchor: z.string().describe("1-3 sentence style-anchor paragraph prepended to every render prompt."),
    updatedAt: z.string().optional().describe("ISO timestamp. Defaults to now."),
    sources: z.array(z.string()).optional().describe("Reference tile ids or URLs the lock was derived from."),
  })
  .nullable()
  .describe("Project-wide style lock. Pass null to clear it.");

export const ProjectPatchSchema = z
  .object({
    meta: z
      .object({
        title: z.string().optional().describe("Project title shown in the top pill."),
        format: z.string().optional().describe("Video format, e.g. 'Music video', 'Short film'."),
        aspectRatio: z.string().optional().describe("Aspect ratio, e.g. '9:16', '16:9', '1:1'."),
        logline: z.string().optional().describe("1-2 sentence living description of the video."),
        targetDuration: z.string().optional().describe("Human-readable length, e.g. '30s', '2 min'."),
        fps: z.string().optional().describe("Frame rate: '24', '30', '60'."),
        resolution: z.string().optional().describe("'1080p', '4K', ..."),
      })
      .optional()
      .describe("Partial project meta — provided fields merge over existing meta."),
    scenes: z
      .array(SceneSchema)
      .optional()
      .describe("UPSERT scenes: entries with an existing id merge in place; new/missing ids append."),
    scenesReplace: z
      .array(SceneSchema)
      .optional()
      .describe("DESTRUCTIVE full rewrite of the scene list. Use sparingly."),
    scenesAppend: z.array(SceneSchema).optional().describe("Append new scenes after the existing ones."),
    cast: z
      .array(CharacterSchema)
      .optional()
      .describe("UPSERT cast: merges by id or case-insensitive name; new entries append."),
    castReplace: z.array(CharacterSchema).optional().describe("DESTRUCTIVE full rewrite of the cast list."),
    castAppend: z
      .array(CharacterSchema)
      .optional()
      .describe("Append cast members (deduped by name against existing cast)."),
    music: MusicSchema.optional(),
    assets: z.array(AssetSchema).optional().describe("Replace the asset list (rare — prefer assetsAppend)."),
    assetsReplace: z.array(AssetSchema).optional().describe("DESTRUCTIVE full rewrite of the asset list."),
    assetsAppend: z.array(AssetSchema).optional().describe("Append assets to the project."),
    timeline: TimelineSchema.optional(),
    notesAppend: z
      .array(NoteSchema)
      .optional()
      .describe("Append durable decisions to the agent decision log (PROJECT MEMORY)."),
    docs: z.array(DocSchema).optional().describe("Upsert project docs by id."),
    docsReplace: z.array(DocSchema).optional().describe("DESTRUCTIVE full rewrite of the docs list."),
    references: z.array(ReferenceTileSchema).optional().describe("Upsert mood-board tiles by id (dedupe by url)."),
    referencesReplace: z.array(ReferenceTileSchema).optional().describe("DESTRUCTIVE full rewrite of reference tiles."),
    referencesAppend: z.array(ReferenceTileSchema).optional().describe("Append/upsert mood-board tiles."),
    locations: z.array(LocationSchema).optional().describe("Upsert locations by id or name."),
    locationsReplace: z.array(LocationSchema).optional().describe("DESTRUCTIVE full rewrite of locations."),
    locationsAppend: z.array(LocationSchema).optional().describe("Append/upsert locations."),
    styleLock: StyleLockSchema.optional(),
  })
  .describe(
    "Project patch. Include ONLY the slices you are changing — plain fields (scenes, cast, references, locations, docs) upsert; *Append extends; *Replace destructively rewrites.",
  );

export type ProjectPatchInput = z.infer<typeof ProjectPatchSchema>;

// Compile-time check: the schema's output must be a valid ProjectPatch.
// notesAppend / styleLock are excluded — ProjectNote.at and StyleLock.updatedAt
// are required in the types, but applyPatch defaults them to "now" at runtime,
// so the schema deliberately keeps them optional for the model.
const _assertAssignable: Omit<ProjectPatch, "notesAppend" | "styleLock"> = {} as Omit<
  ProjectPatchInput,
  "notesAppend" | "styleLock"
>;
void _assertAssignable;

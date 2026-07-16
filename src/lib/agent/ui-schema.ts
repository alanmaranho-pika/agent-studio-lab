// RenderTurn — the typed Gen-UI contract between the agent and the center
// stage. The model ends every turn by calling the `render_turn` tool with
// this shape; the runtime serializes it into the existing stage HTML dialect
// (see render-turn-html.ts) and renders it through GenerativeCard /
// StageGenerationView. The schema (not prose rules) carries the UI contract:
// a small model filling a discriminated union is far more reliable than one
// obeying forty prose rules about handwritten HTML.
//
// `custom_html` is the escape hatch for genuinely novel UI — sanitized
// through the same DOMPurify pipeline as everything else.

import { z } from "zod";

export const ICON_SLUGS = [
  "music", "users", "user", "voice", "mic", "camera", "film", "image",
  "palette", "sparkles", "wand", "zap", "sun", "moon", "cloud", "star",
  "heart", "play", "volume", "speaker", "video", "clapperboard", "type",
  "layers", "square", "circle", "triangle", "smile", "bag", "shirt",
  "coffee", "flame", "waves", "tree", "building", "car", "rocket", "globe",
  "message", "arrow",
] as const;

// Shapes the composing skeleton can take while the NEXT turn is built —
// declared ahead of time so the placeholder is representative from the very
// first frame ("in the chamber"), not guessed from runtime signals.
export const NEXT_UI_HINTS = [
  "options",
  "form",
  "upload",
  "media",
  "gallery",
  "moodboard",
  "storyboard",
  "list",
  "stage",
  "none",
] as const;

const NextHintSchema = z
  .enum(NEXT_UI_HINTS)
  .optional()
  .describe(
    "What the NEXT turn will most likely show once the user answers — powers the placeholder shown while you compose. Follow your playbook: another question → options; model pick made → media; beats locked → stage; prose-only reply → none.",
  );

const VisualSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ratio"),
    ratio: z.enum(["9:16", "16:9", "1:1"]).describe("Rule-of-thirds aspect box — use for aspect-ratio choices"),
  }),
  z.object({
    kind: z.literal("icon"),
    icon: z.enum(ICON_SLUGS),
    bg: z
      .string()
      .regex(/^#[0-9a-fA-F]{3,8}$/)
      .optional()
      .describe("Hex tint behind the icon, e.g. #FFD43B"),
  }),
  z.object({
    kind: z.literal("image"),
    url: z.string().describe("Image URL from project assets / tool results — never invent one"),
  }),
]);

const OptionItemSchema = z.object({
  value: z
    .string()
    .min(1)
    .max(160)
    .describe("Echoed verbatim as the user's reply when tapped — write it as natural language ('Describe it to you'), never snake_case ids"),
  title: z.string().min(1).max(48),
  subtitle: z.string().max(72).optional().describe("One short line, ~6 words"),
  visual: VisualSchema.optional().describe("Strongly recommended — options look empty without one"),
  next: NextHintSchema.describe(
    "Per-option override of the turn-level `next` when answers diverge (e.g. 'Upload photo' → upload, 'Describe it' → form)",
  ),
  ack: z
    .string()
    .max(60)
    .optional()
    .describe(
      "Pre-written reaction (≤8 words, no question) shown INSTANTLY when the user picks this, while you compose the next turn. Mirror the ack you'd open the next turn with.",
    ),
});

const ActionButtonSchema = z.object({
  value: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Echoed as the user's reply when clicked. Must express the SAME choice as `label` (a fuller sentence of it is fine) — never a different idea.",
    ),
  label: z.string().min(1).max(40).describe("What the user sees on the button"),
  primary: z.boolean().optional().describe("Mark at most one confirm/primary action"),
  next: NextHintSchema.describe(
    "Per-action override of the turn-level `next` when actions diverge (e.g. 'Approve' → media render vs 'Rework a beat' → form)",
  ),
  ack: z
    .string()
    .max(60)
    .optional()
    .describe(
      "Pre-written reaction (≤8 words, no question) shown INSTANTLY when the user picks this, while you compose the next turn. Mirror the ack you'd open the next turn with.",
    ),
});

const FormFieldSchema = z.object({
  type: z.enum(["text", "textarea", "url", "number", "slider", "color", "date", "checkboxes", "chips"]),
  key: z.string().min(1).max(48).describe("Field name, snake_case"),
  label: z.string().min(1).max(60),
  placeholder: z.string().max(140).optional(),
  options: z
    .array(z.string().max(60))
    .max(12)
    .optional()
    .describe("Required for checkboxes/chips — the selectable values"),
  multi: z.boolean().optional().describe("chips only: allow selecting several"),
  min: z.number().optional().describe("slider/number"),
  max: z.number().optional().describe("slider/number"),
  step: z.number().optional().describe("slider/number"),
  value: z.union([z.string(), z.number()]).optional().describe("Prefill / default"),
});

const OptionsBlockSchema = z.object({
  type: z.literal("options"),
  cols: z
    .enum(["2", "3", "4", "2x2", "3x3"])
    .optional()
    .describe(
      "Advisory only — the layout is computed from the option count (the full-width stage centers ≤5 options in one row and wraps 6+ into two wide rows, never taller). Just pick a sensible option count; you may omit this.",
    ),
  items: z.array(OptionItemSchema).min(2).max(9),
});

const FormBlockSchema = z.object({
  type: z.literal("form"),
  fields: z.array(FormFieldSchema).min(1).max(4),
  submitLabel: z.string().max(28).optional().describe("Defaults to 'Continue'"),
});

const UploadBlockSchema = z.object({
  type: z.literal("upload"),
  kind: z.enum(["likeness", "logo", "reference", "voice", "audio", "video", "other"]),
  label: z.string().min(1).max(80).describe("Tile label, e.g. 'Upload product photo'"),
  hint: z.string().max(80).optional().describe("Second line, e.g. 'PNG, JPG, or WEBP'"),
  allowCamera: z.boolean().optional().describe("Also offer live camera capture"),
  allowUrl: z
    .boolean()
    .optional()
    .describe(
      "Offer a 'Paste URL' card beside the upload when the asset can also come from a web link (e.g. a product photo). Adds a Continue button to submit either path.",
    ),
  skipValue: z
    .string()
    .max(160)
    .optional()
    .describe("If skipping is valid, the answer sent when the user skips (e.g. 'No reference — describe instead')"),
});

const MediaBlockSchema = z.object({
  type: z.literal("media"),
  url: z.string().min(1).describe("Media URL from a tool result THIS turn or project assets — never invent one"),
  mediaKind: z
    .enum(["image", "video", "audio"])
    .describe(
      "A single finished clip to play/approve. For still images shown for review or comparison, prefer a `gallery` block instead.",
    ),
  title: z.string().max(48).optional().describe("Short overlay title, ≤6 words"),
  caption: z.string().max(140).optional(),
  variants: z
    .array(z.string())
    .max(6)
    .optional()
    .describe("URLs of previous takes of the same shot; omit when there's one take"),
  actions: z
    .array(ActionButtonSchema)
    .max(4)
    .optional()
    .describe("Next-step CTAs below the media (Approve / Regenerate / …)"),
});

const GalleryBlockSchema = z.object({
  type: z.literal("gallery"),
  title: z.string().max(48).optional().describe("Card eyebrow above the images, e.g. 'Character concepts'"),
  items: z
    .array(
      z.object({
        url: z
          .string()
          .min(1)
          .describe("Image URL from a tool result THIS turn or project assets — never invent one"),
        label: z
          .string()
          .max(40)
          .optional()
          .describe(
            "Short chip shown bottom-left, e.g. the concept / character / style name. Add it when the images are distinct options the user might name; omit for a single review.",
          ),
      }),
    )
    .min(1)
    .max(6),
  actions: z
    .array(ActionButtonSchema)
    .max(4)
    .optional()
    .describe("Shared next-step CTAs for the whole set (Lock it in / Try again / …)"),
}).describe(
  "1–6 still IMAGES shown for review or comparison — concepts, scene anchors, style / character references. Layout is automatic and count-driven (1 centered, 2–3 across, 4–6 wrap); you never choose it. Use for images the user looks at, judges, or picks among. A finished video or audio clip is a `media` block; a forced pick of exactly ONE image is an `options` block.",
);

const HEX_COLOR = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);

const MoodboardTileSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    url: z
      .string()
      .min(1)
      .describe("Image URL from a tool result THIS turn or project assets — never invent one"),
    label: z
      .string()
      .max(40)
      .optional()
      .describe("Short chip naming what this tile contributes, e.g. 'Costume', 'Landscape', 'Texture'"),
  }),
  z.object({
    kind: z.literal("palette"),
    colors: z
      .array(HEX_COLOR)
      .min(3)
      .max(6)
      .describe("The direction's color story, pulled from the imagery — 3–6 hexes, dominant first"),
  }),
  z.object({
    kind: z.literal("type"),
    text: z
      .string()
      .min(1)
      .max(80)
      .describe("Short type specimen — a word or evocative fragment shown large, newlines allowed"),
    bg: HEX_COLOR.optional().describe("Tile background hex; defaults to the theme lavender"),
    label: z.string().max(40).optional(),
  }),
]);

const MoodboardBlockSchema = z.object({
  type: z.literal("moodboard"),
  title: z.string().max(48).optional().describe("Card eyebrow, e.g. 'Dune western — visual direction'"),
  items: z.array(MoodboardTileSchema).min(3).max(10),
  actions: z
    .array(ActionButtonSchema)
    .max(4)
    .optional()
    .describe("Shared CTAs for the whole board (Lock it in / Let's rework / …)"),
}).describe(
  "ONE composed visual direction shown as a masonry collage — mixed tiles laid out automatically, every image at its native aspect ratio. Use when proposing a style / vibe / world for sign-off: 4–8 labeled image tiles, usually ONE palette tile (colors pulled from the imagery), optionally ONE type-specimen tile. It presents a single direction to lock or rework — comparing alternatives is a gallery or options block.",
);

const ListBlockSchema = z.object({
  type: z.literal("list"),
  title: z.string().max(48).optional(),
  items: z
    .array(
      z.object({
        meta: z.string().max(64).optional().describe("Small eyebrow, e.g. 'Shot 1 · 3s · Wide'"),
        text: z.string().max(280),
      }),
    )
    .min(1)
    .max(12),
  actions: z.array(ActionButtonSchema).max(4).optional(),
});

const StoryboardBlockSchema = z.object({
  type: z.literal("storyboard"),
  title: z.string().max(48).optional().describe("Card eyebrow, e.g. 'Lumen Lamp Ad Storyboard'"),
  items: z
    .array(
      z.object({
        meta: z.string().max(64).optional().describe("Slide eyebrow, e.g. 'Shot 1 · 5s'"),
        title: z.string().min(1).max(64).describe("Big display title, ≤6 words"),
        text: z.string().max(280).optional().describe("Shot description / visual prompt"),
        vo: z.string().max(160).optional().describe("Voiceover line read during this shot"),
      }),
    )
    .min(1)
    .max(12),
  actions: z.array(ActionButtonSchema).max(4).optional(),
}).describe(
  "Cinematic shot-by-shot storyboard shown one slide at a time. Use for shot lists / beat breakdowns — never a plain list.",
);

const StageBlockSchema = z.object({
  type: z.literal("stage"),
  view: z
    .enum(["script-beats", "storyboard", "timeline", "character"])
    .describe("Full-stage React view rendered from project state — use for beat/storyboard/timeline/character review"),
  variant: z
    .enum(["preview", "editor", "scenes"])
    .optional()
    .describe(
      "timeline view only — preview (default: player + clip strip), editor (multi-track editing), scenes (one focused scene, pair with focusSceneId)",
    ),
  focusSceneId: z.string().max(120).optional(),
  focusCastId: z.string().max(120).optional(),
  actions: z.array(ActionButtonSchema).min(1).max(4).describe("2–4 short contextual next steps"),
});

const ActionsBlockSchema = z.object({
  type: z.literal("actions"),
  buttons: z
    .array(ActionButtonSchema)
    .min(1)
    .max(4)
    .describe(
      "Confirm/next-step row rendered UNDER a content block (media, list, stage). Never the turn's primary choice — when the turn asks the user to pick between things, use an `options` block instead.",
    ),
});

const CustomHtmlBlockSchema = z.object({
  type: z.literal("custom_html"),
  html: z
    .string()
    .min(1)
    .max(8000)
    .describe(
      "Escape hatch for UI no typed block can express. Raw HTML, sanitized at render. Interactive elements must use <button data-action=\"answer\" data-value=\"…\">. Prefer typed blocks whenever they fit.",
    ),
});

export const TurnBlockSchema = z.discriminatedUnion("type", [
  OptionsBlockSchema,
  FormBlockSchema,
  UploadBlockSchema,
  MediaBlockSchema,
  GalleryBlockSchema,
  MoodboardBlockSchema,
  ListBlockSchema,
  StoryboardBlockSchema,
  StageBlockSchema,
  ActionsBlockSchema,
  CustomHtmlBlockSchema,
]);

// NOTE: kept as a plain object schema (no .superRefine) so the AI SDK can
// serialize it to JSON Schema for the tool definition. Cross-field
// invariants are enforced in turn-guard.server.ts, whose errors are
// returned from the tool execute so the model self-corrects in-loop.
export const RenderTurnSchema = z.object({
  ack: z
    .string()
    .max(60)
    .optional()
    .describe("Ultra-short reaction to the user's last answer, ≤8 words ('Got it — widescreen.'). Omit on a first turn."),
  prose: z
    .string()
    .min(1)
    .max(160)
    .describe("The ONE question or statement of this turn, ≤14 words, warm director's voice"),
  blocks: z
    .array(TurnBlockSchema)
    .max(2)
    .optional()
    .describe("The turn's UI. At most ONE interactive block (options/form/upload) — one decision per turn."),
  next: NextHintSchema,
});

export type RenderTurn = z.infer<typeof RenderTurnSchema>;
export type TurnBlock = z.infer<typeof TurnBlockSchema>;
export type TurnOptionItem = z.infer<typeof OptionItemSchema>;
export type TurnActionButton = z.infer<typeof ActionButtonSchema>;
export type TurnFormField = z.infer<typeof FormFieldSchema>;

export function isInteractiveBlock(block: TurnBlock): boolean {
  return block.type === "options" || block.type === "form" || block.type === "upload";
}

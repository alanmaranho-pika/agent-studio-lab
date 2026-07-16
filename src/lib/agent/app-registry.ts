// Agent v3.1 — flat catalog of apps the agent can route the user into.
//
// Each wizard app exposes a faithful, ordered list of the SAME inputs the
// underlying app collects. The agent uses this as the canonical playbook
// when serving one decision per turn — but is free to skip, reorder, or
// loop back based on what the user has already said. The agent may also
// diverge mid-flow into model apps (Nano Banana, GPT Image 2, …) or the
// Character Creator and return to the wizard afterward.
//
// Kinds:
//   - "wizard" — multi-step creative flows (Short Film, Product Ad, …)
//     The agent walks `steps` as gen-UI cards. Each step lists `inputs`
//     describing concrete controls + the exact option set.
//   - "model"  — single-shot model apps (Seedance, Nano Banana, Veo, …)
//     The agent gathers params in ONE card, then calls `run_model_app`.

import { WORLD_CUP_TEAMS } from "@/lib/world-cup.functions";
import { ANIME_MODES } from "@/lib/anime-world-cup.functions";

const ALL_TEAMS = [...WORLD_CUP_TEAMS] as string[];
const ALL_ANIME_MODES = ANIME_MODES.map((m) => m.label);

export type StepInput =
  | { kind: "upload"; key: string; label: string; accepts: string; required?: boolean }
  | { kind: "url"; key: string; label: string; placeholder?: string }
  | { kind: "text"; key: string; label: string; placeholder?: string; long?: boolean }
  | { kind: "choice"; key: string; label: string; options: string[]; multi?: boolean }
  | { kind: "character"; key: string; label: string; multi?: boolean }
  | { kind: "environment"; key: string; label: string }
  | { kind: "voice"; key: string; label: string }
  | { kind: "asset-picker"; key: string; label: string; mediaKinds: Array<"image" | "video" | "audio"> };

export type AppStep = {
  id: string;
  /** Short intent shown to the LLM. */
  intent: string;
  /** Concrete UI inputs for this step. Mirrors the real app. */
  inputs: StepInput[];
  /** Optional hint to LLM about ordering/UX nuance. */
  notes?: string;
};

export type AppEntry = {
  id: string;
  label: string;
  kind: "wizard" | "model";
  oneLiner: string;
  /** For model apps: the fal/openai model id passed to run_model_app. */
  model?: string;
  /** image | video | audio | speech — used to pick the run mode. */
  mode?: "image" | "video" | "audio" | "speech";
  /** Wizard apps: ordered steps the agent walks as gen-UI cards. */
  steps?: AppStep[];
};

export const APP_REGISTRY: AppEntry[] = [
  // ── Wizard apps (multi-step) ───────────────────────────────────
  {
    id: "short-film",
    label: "Short Film",
    kind: "wizard",
    oneLiner:
      "Take an idea to a finished multi-shot short — logline, cast, storyboard, animate, audio, produce.",
    steps: [
      {
        id: "logline",
        intent: "Logline + length + aspect ratio.",
        inputs: [
          { kind: "text", key: "logline", label: "Logline (1–2 sentences)", long: true },
          { kind: "choice", key: "lengthSec", label: "Length", options: ["8s", "15s", "30s", "1m", "1m 30s", "2m"] },
          { kind: "choice", key: "aspect", label: "Aspect ratio", options: ["16:9", "9:16", "1:1"] },
        ],
      },
      {
        id: "cast",
        intent: "Pick or create characters / environments / products. Pull from Library; offer Create Character which opens Character Creator inline.",
        inputs: [
          { kind: "character", key: "characters", label: "Add character(s) from Library", multi: true },
          { kind: "environment", key: "environments", label: "Add environment(s)" },
        ],
      },
      {
        id: "audio",
        intent: "Audio plan FIRST — music bed, voiceover narration, talking characters, or a mix. This informs beat pacing, dialogue, and whether characters need to speak on screen, so collect it BEFORE storyboard.",
        inputs: [
          { kind: "choice", key: "audioMode", label: "Audio", options: ["Music bed only", "Voiceover narration", "Talking characters", "Mix (music + VO + dialogue)", "No audio"], multi: true },
          { kind: "text", key: "audioNotes", label: "Audio direction (genre, narrator tone, who speaks what)", long: true },
        ],
      },
      {
        id: "storyboard",
        intent: "Generate beat list (shots with description + duration), informed by the audio plan (pacing to music, VO lines per beat, on-screen dialogue). Show beats as a storyboard block (per shot: meta 'Shot N · Xs', short title, description, vo line when planned) for review.",
        inputs: [
          { kind: "text", key: "styleNotes", label: "Style / visual look notes", long: true },
        ],
      },
      {
        id: "animate",
        intent: "Pick render model per beat (Seedance 2.0 vs Kling Standard).",
        inputs: [
          { kind: "choice", key: "videoPath", label: "Video model", options: ["Seedance 2.0", "Kling Standard"] },
        ],
      },
      { id: "produce", intent: "Render and review.", inputs: [] },
    ],
  },
  {
    id: "product-ad",
    label: "Product Ad",
    kind: "wizard",
    oneLiner:
      "Turn a product photo (or product URL) into a polished ad — concept, style, model choice, render.",
    steps: [
      {
        id: "product",
        intent: "Get the product. Offer BOTH a URL import AND an upload tile in the SAME card — user picks one. URL import scrapes title/image; upload accepts an image file.",
        inputs: [
          { kind: "url", key: "productUrl", label: "Paste product URL (Shopify, Amazon, etc.)", placeholder: "https://…" },
          { kind: "upload", key: "productImage", label: "…or upload a product photo", accepts: "image/*" },
        ],
        notes: "These are alternatives — once one is provided, advance.",
      },
      {
        id: "brief",
        intent: "Brief: tagline, audience, length, aspect ratio.",
        inputs: [
          { kind: "text", key: "tagline", label: "Tagline or hook (optional)" },
          { kind: "text", key: "audience", label: "Target audience" },
          { kind: "choice", key: "lengthSec", label: "Length", options: ["8s", "15s", "30s", "1m"] },
          { kind: "choice", key: "aspect", label: "Aspect ratio", options: ["16:9", "9:16", "1:1", "4:5"] },
        ],
      },
      {
        id: "concept",
        intent: "Generate 2–3 ad concepts. Render them as a visible list in the card; user picks one or asks to regenerate.",
        inputs: [],
      },
      {
        id: "style",
        intent: "Pick a visual look.",
        inputs: [
          { kind: "choice", key: "look", label: "Look", options: ["Cinematic", "Clean studio", "Lifestyle", "Editorial"] },
          { kind: "character", key: "talent", label: "Add on-screen talent (optional)", multi: true },
        ],
      },
      {
        id: "audio",
        intent: "Audio choice + direction.",
        inputs: [
          { kind: "choice", key: "audioMode", label: "Audio", options: ["Music bed", "Voiceover narration", "Talking characters"] },
          { kind: "text", key: "audioNotes", label: "Audio direction", long: true },
        ],
      },
      {
        id: "produce",
        intent: "Pick render model (Seedance vs Kling) and render.",
        inputs: [
          { kind: "choice", key: "videoPath", label: "Render with", options: ["Seedance 2.0", "Kling Standard (cheaper)"] },
        ],
      },
    ],
  },
  {
    id: "music-video",
    label: "Music Video",
    kind: "wizard",
    oneLiner:
      "Generate a music video around an uploaded track or AI-generated song.",
    steps: [
      {
        id: "track",
        intent: "Get the track. Offer upload OR generate-music in the same card.",
        inputs: [
          { kind: "upload", key: "trackUpload", label: "Upload your track", accepts: "audio/*" },
          { kind: "text", key: "musicPrompt", label: "…or describe a track to generate", long: true },
        ],
      },
      {
        id: "style",
        intent: "Visual style + aspect ratio.",
        inputs: [
          { kind: "text", key: "styleNotes", label: "Visual look", long: true },
          { kind: "choice", key: "aspect", label: "Aspect ratio", options: ["16:9", "9:16", "1:1"] },
        ],
      },
      { id: "storyboard", intent: "Beat-synced shot list — render as a storyboard block (one slide per shot) and let user revise.", inputs: [] },
      { id: "produce", intent: "Render and review.", inputs: [] },
    ],
  },
  {
    id: "character-creator",
    label: "Character Creator",
    kind: "wizard",
    oneLiner:
      "Create a reusable character with name, look, and voice — saved to the library.",
    steps: [
      {
        id: "brief",
        intent: "Name, role, vibe.",
        inputs: [
          { kind: "text", key: "name", label: "Character name" },
          { kind: "text", key: "brief", label: "Role + vibe", long: true },
        ],
      },
      {
        id: "look",
        intent: "Generate 4 look options (Nano Banana). User picks one or regenerates.",
        inputs: [],
      },
      {
        id: "voice",
        intent: "Pick a voice or clone one.",
        inputs: [
          { kind: "voice", key: "voice", label: "Voice" },
        ],
      },
      { id: "save", intent: "Save to library.", inputs: [] },
    ],
  },
  {
    id: "talking-head",
    label: "Talking Head Studio",
    kind: "wizard",
    oneLiner: "Lipsync a portrait to a script or uploaded audio.",
    steps: [
      {
        id: "portrait",
        intent: "Get the portrait — upload OR pick from Library OR generate (Nano Banana).",
        inputs: [
          { kind: "upload", key: "portrait", label: "Upload portrait", accepts: "image/*" },
          { kind: "asset-picker", key: "portraitFromLibrary", label: "…or pick from Library", mediaKinds: ["image"] },
        ],
      },
      {
        id: "script",
        intent: "Script + voice OR uploaded audio.",
        inputs: [
          { kind: "text", key: "script", label: "What should they say?", long: true },
          { kind: "voice", key: "voice", label: "Voice" },
          { kind: "upload", key: "audio", label: "…or upload audio instead", accepts: "audio/*" },
        ],
      },
      { id: "render", intent: "Render and review.", inputs: [] },
    ],
  },
  {
    id: "anime-world-cup",
    label: "Anime World Cup 2026",
    kind: "wizard",
    oneLiner:
      "Anime-style World Cup 2026 highlight — selfie + team + anime genre mode.",
    steps: [
      {
        id: "selfie",
        intent: "Get a selfie reference for the player. Offer upload, camera, AND library picker in the same card (the real app accepts all three).",
        inputs: [
          { kind: "upload", key: "selfie", label: "Upload selfie", accepts: "image/*" },
          { kind: "asset-picker", key: "selfieFromLibrary", label: "…or pick from Library", mediaKinds: ["image"] },
        ],
      },
      {
        id: "team",
        intent: "Pick country/team AND opponent — show the FULL FIFA World Cup 2026 roster as pills, exactly like the real app. Do not truncate to a subset.",
        inputs: [
          { kind: "choice", key: "team", label: "Your team", options: ALL_TEAMS },
          { kind: "choice", key: "opponent", label: "Opponent", options: ALL_TEAMS },
        ],
      },
      {
        id: "mode",
        intent: "Pick anime genre mode. Render each option as a large text-and-emoji tile (use the mode's emoji + label + a short descriptor). DO NOT reference any /anime-modes/*.jpg image path — those files do not exist and will render as broken thumbnails.",
        inputs: [
          { kind: "choice", key: "modeId", label: "Anime mode", options: ALL_ANIME_MODES },
        ],
        notes: "Emoji+label pairs: " + ANIME_MODES.map((m) => `${m.emoji} ${m.label}`).join(", "),
      },
      {
        id: "moment",
        intent: "Describe the moment (optional — model is free to interpret).",
        inputs: [
          { kind: "text", key: "moment", label: "The moment", long: true },
        ],
      },
      {
        id: "render",
        intent: "Single-shot render via run_model_app (model: bytedance/seedance-2.0/text-to-video). This is a ONE-SHOT app — generate exactly ONE video clip; do NOT propose multi-beat storyboards, do NOT offer to 'fix timing on shot 3', and do NOT loop into more shots after the render. ALWAYS pass the selfie asset URL via referenceImageUrls so the player looks like the user.",
        inputs: [],
      },
    ],
  },

  // ── Model apps (single-shot) ──────────────────────────────────
  // Video
  { id: "model-seedance-2", label: "Seedance 2.0", kind: "model", oneLiner: "Flagship cinematic text-to-video. Best for hero shots.", model: "bytedance/seedance-2.0/text-to-video", mode: "video" },
  { id: "model-seedance-2-mini", label: "Seedance 2.0 Mini", kind: "model", oneLiner: "Fast, lower-cost Seedance — best default for quick clips.", model: "bytedance/seedance-2.0/mini/text-to-video", mode: "video" },
  { id: "model-veo-3", label: "Google Veo 3", kind: "model", oneLiner: "Veo 3 cinematic t2v with native audio.", model: "fal-ai/veo3", mode: "video" },
  { id: "model-veo-3-i2v", label: "Veo 3 Image-to-Video", kind: "model", oneLiner: "Animate any still image with Veo 3 + native audio.", model: "fal-ai/veo3/image-to-video", mode: "video" },
  { id: "model-kling-3", label: "Kling 3.0", kind: "model", oneLiner: "Kling 3 t2v — strong motion and dynamics.", model: "fal-ai/kling-video/v2.5-turbo/pro/text-to-video", mode: "video" },
  // Image
  { id: "model-nano-banana-2", label: "Nano Banana 2", kind: "model", oneLiner: "Sharp, prompt-faithful t2i. Best default for stills.", model: "fal-ai/nano-banana-2", mode: "image" },
  { id: "model-gpt-image-2", label: "GPT Image 2", kind: "model", oneLiner: "OpenAI GPT Image 2 — strong typography and text in image.", model: "openai/gpt-image-2", mode: "image" },
  { id: "model-seedream", label: "Seedream", kind: "model", oneLiner: "High-fidelity t2i from ByteDance.", model: "fal-ai/bytedance/seedream/v4/text-to-image", mode: "image" },
  // Audio / Speech
  { id: "model-eleven-tts", label: "ElevenLabs TTS", kind: "model", oneLiner: "Multilingual high-quality text-to-speech.", model: "fal-ai/elevenlabs/tts/multilingual-v2", mode: "speech" },
  { id: "model-cassette-music", label: "Cassette Music", kind: "model", oneLiner: "Generate original music beds.", model: "cassetteai/music-generator", mode: "audio" },
  { id: "model-stable-audio", label: "Stable Audio SFX", kind: "model", oneLiner: "One-shot sound effects from a description.", model: "fal-ai/stable-audio-25/text-to-audio", mode: "audio" },
];

export const APP_BY_ID: Record<string, AppEntry> = Object.fromEntries(
  APP_REGISTRY.map((a) => [a.id, a]),
);

function renderInput(i: StepInput): string {
  switch (i.kind) {
    case "upload":
      return `upload(${i.key}) "${i.label}" accepts=${i.accepts}`;
    case "url":
      return `url(${i.key}) "${i.label}"`;
    case "text":
      return `text(${i.key}) "${i.label}"${i.long ? " [long]" : ""}`;
    case "choice":
      return `choice(${i.key}) "${i.label}" [${i.options.join(" | ")}]${i.multi ? " multi" : ""}`;
    case "character":
      return `character-picker(${i.key}) "${i.label}"${i.multi ? " multi" : ""} — supports "Create new" → Character Creator inline`;
    case "environment":
      return `environment-picker(${i.key}) "${i.label}"`;
    case "voice":
      return `voice-picker(${i.key}) "${i.label}"`;
    case "asset-picker":
      return `library-picker(${i.key}) "${i.label}" kinds=${i.mediaKinds.join(",")}`;
  }
}

/** Full playbook for ONE app — injected only when that app is selected
 * (or fetched on demand via the get_app_playbook tool). */
export function renderAppPlaybook(appId: string): string | null {
  const app = APP_BY_ID[appId];
  if (!app) return null;
  if (app.kind === "model") {
    return `MODEL APP ${app.id} (${app.label}, ${app.mode}) — ${app.oneLiner}\nCollect params in ONE turn, then call run_model_app with appId "${app.id}".`;
  }
  const steps = (app.steps ?? [])
    .map((s) => {
      const inputs = s.inputs.length
        ? s.inputs.map((i) => `    - ${renderInput(i)}`).join("\n")
        : "    - (no input — show result/list for review)";
      const notes = s.notes ? `\n    note: ${s.notes}` : "";
      return `  • ${s.id} — ${s.intent}\n${inputs}${notes}`;
    })
    .join("\n");
  return `SELECTED APP PLAYBOOK — ${app.id} (${app.label}): ${app.oneLiner}\nWalk these steps one decision per turn. Skip, reorder, or loop back based on what the user already answered; detour into a model app when an input is missing, then resume.\n${steps}`;
}

/** Human-readable catalog for the agent system prompt. */
export function renderAppCatalogForPrompt(): string {
  const wizard = APP_REGISTRY.filter((a) => a.kind === "wizard");
  const model = APP_REGISTRY.filter((a) => a.kind === "model");
  const fmtWizard = wizard
    .map((a) => {
      const steps = (a.steps ?? [])
        .map((s) => {
          const inputs = s.inputs.length
            ? s.inputs.map((i) => `         - ${renderInput(i)}`).join("\n")
            : "         - (no input — show result/list for review)";
          const notes = s.notes ? `\n         note: ${s.notes}` : "";
          return `      • ${s.id} — ${s.intent}\n${inputs}${notes}`;
        })
        .join("\n");
      return `  ${a.id} (${a.label}) — ${a.oneLiner}\n${steps}`;
    })
    .join("\n\n");
  const fmtModel = model
    .map((a) => `  • ${a.id} (${a.label}, ${a.mode}) — ${a.oneLiner}`)
    .join("\n");
  return `WIZARD APPS — canonical playbook. Walk these steps as gen-UI cards, ONE step per turn. You may skip, reorder, or loop back based on what the user already said; you may also diverge into a MODEL APP mid-flow (e.g. generate a hero still in Nano Banana, then resume) and you may open Character Creator from any "character-picker" input. Always nudge the user forward toward render.\n\n${fmtWizard}\n\nMODEL APPS (single-shot — collect params in ONE card then call run_model_app):\n${fmtModel}`;
}

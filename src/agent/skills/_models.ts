// Single-shot model skills. Each entry maps to a backing model on fal/openai
// and is invoked in ONE turn via run_model_app. Model skills don't have a
// step playbook, so they live in one shared file rather than a folder each.
// Their body Markdown is generated from the manifest so every model still
// exposes the same skill.md-shaped documentation to the agent.

import type { SkillPack } from "./types";

type ModelDef = {
  id: string;           // SKL_MODEL_*
  appId: string;        // legacy app id (e.g. "model-seedance-2")
  label: string;
  oneLiner: string;
  model: string;
  mode: "image" | "video" | "audio" | "speech";
  matches?: string[];
};

const MODELS: ModelDef[] = [
  // Video
  { id: "SKL_MODEL_SEEDANCE_2", appId: "model-seedance-2", label: "Seedance 2.0", oneLiner: "Flagship cinematic text-to-video. Best for hero shots.", model: "bytedance/seedance-2.0/text-to-video", mode: "video", matches: ["seedance", "hero shot", "cinematic clip"] },
  { id: "SKL_MODEL_SEEDANCE_2_MINI", appId: "model-seedance-2-mini", label: "Seedance 2.0 Mini", oneLiner: "Fast, lower-cost Seedance — best default for quick clips.", model: "bytedance/seedance-2.0/mini/text-to-video", mode: "video", matches: ["quick clip", "fast video"] },
  { id: "SKL_MODEL_VEO_3", appId: "model-veo-3", label: "Google Veo 3", oneLiner: "Veo 3 cinematic t2v with native audio.", model: "fal-ai/veo3", mode: "video", matches: ["veo", "with sound"] },
  { id: "SKL_MODEL_VEO_3_I2V", appId: "model-veo-3-i2v", label: "Veo 3 Image-to-Video", oneLiner: "Animate any still image with Veo 3 + native audio.", model: "fal-ai/veo3/image-to-video", mode: "video", matches: ["animate image", "image to video"] },
  { id: "SKL_MODEL_KLING_3", appId: "model-kling-3", label: "Kling 3.0", oneLiner: "Kling 3 t2v — strong motion and dynamics.", model: "fal-ai/kling-video/v2.5-turbo/pro/text-to-video", mode: "video", matches: ["kling", "motion"] },
  // Image
  { id: "SKL_MODEL_NANO_BANANA_2", appId: "model-nano-banana-2", label: "Nano Banana 2", oneLiner: "Sharp, prompt-faithful t2i. Best default for stills.", model: "fal-ai/nano-banana-2", mode: "image", matches: ["still image", "concept art", "nano banana"] },
  { id: "SKL_MODEL_GPT_IMAGE_2", appId: "model-gpt-image-2", label: "GPT Image 2", oneLiner: "OpenAI GPT Image 2 — strong typography and text in image.", model: "openai/gpt-image-2", mode: "image", matches: ["poster", "text in image", "typography"] },
  { id: "SKL_MODEL_SEEDREAM", appId: "model-seedream", label: "Seedream", oneLiner: "High-fidelity t2i from ByteDance.", model: "fal-ai/bytedance/seedream/v4/text-to-image", mode: "image", matches: ["seedream", "photoreal"] },
  // Audio / Speech
  { id: "SKL_MODEL_ELEVEN_TTS", appId: "model-eleven-tts", label: "ElevenLabs TTS", oneLiner: "Multilingual high-quality text-to-speech.", model: "fal-ai/elevenlabs/tts/multilingual-v2", mode: "speech", matches: ["tts", "voice over", "narration"] },
  { id: "SKL_MODEL_CASSETTE_MUSIC", appId: "model-cassette-music", label: "Cassette Music", oneLiner: "Generate original music beds.", model: "cassetteai/music-generator", mode: "audio", matches: ["music bed", "song", "score"] },
  { id: "SKL_MODEL_STABLE_AUDIO", appId: "model-stable-audio", label: "Stable Audio SFX", oneLiner: "One-shot sound effects from a description.", model: "fal-ai/stable-audio-25/text-to-audio", mode: "audio", matches: ["sfx", "sound effect"] },
];

function renderModelMd(m: ModelDef): string {
  return [
    "---",
    `id: ${m.id}`,
    `appId: ${m.appId}`,
    `label: ${m.label}`,
    `kind: model`,
    `intent: ${m.oneLiner}`,
    `oneLiner: ${m.oneLiner}`,
    `outputs: [${m.mode}]`,
    `model: ${m.model}`,
    `matches: [${(m.matches ?? []).join(", ")}]`,
    `usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]`,
    "---",
    "",
    `# ${m.label}`,
    "",
    m.oneLiner,
    "",
    "Collect the model's params in ONE `BLK_FORM` turn (prompt + optional reference images), then call `run_model_app` with this app id. Show the returned URL as a `BLK_MEDIA` block.",
  ].join("\n");
}

export const MODEL_SKILLS: SkillPack[] = MODELS.map((m) => ({
  id: m.id,
  appId: m.appId,
  label: m.label,
  kind: "model",
  intent: m.oneLiner,
  oneLiner: m.oneLiner,
  outputs: [m.mode],
  matches: m.matches,
  usesBlocks: ["BLK_FORM", "BLK_MEDIA", "BLK_ACTIONS"],
  model: m.model,
  mode: m.mode,
  bodyMd: renderModelMd(m),
}));
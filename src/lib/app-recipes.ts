// Typed App recipes. The same data drives both the "How it works" diagram
// (HowItWorks in studio.$projectId.tsx) and the guided AppWizard composer.
//
// Authoring note: most recipes today are still written as a 3-step copy
// sequence (`{ title, desc }`). We classify each step into a typed kind
// (upload / choice / prompt) using keyword inference so the wizard can
// render the right control without us hand-editing 30+ entries. The LAST
// step in each recipe is treated as the terminal "generate / export" node:
// it shows up in the diagram but is not interactively collected — clicking
// the wizard's primary button IS that step.

import type { Skill } from "@/lib/skills";

export type StepKind = "upload" | "choice" | "prompt" | "generate";

export type AppStep = {
  id: string;
  title: string;
  desc: string;
  kind: StepKind;
  // For uploads
  accept?: "image" | "video" | "audio" | "any";
  // For choices (optional starter chips; the wizard always allows free text)
  options?: string[];
  // For prompt steps
  placeholder?: string;
};

export type AppRecipe = {
  steps: AppStep[];
  // Free-text template used to compose the final prompt sent to the agent.
  // Placeholders: {{stepId}} (collected input) and {{upload:stepId}}
  // (human-readable note that the upload is attached).
  template: string;
};

// ── Source data: per-app step copy ──────────────────────────────
// Identical strings to the previous STEPS_BY_SKILL_ID; structure-only refactor.

type CopyStep = { title: string; desc: string };

const COPY_BY_KIND: Record<Skill["kind"], CopyStep[]> = {
  image: [
    { title: "Describe it", desc: "Type what you want to see — subject, mood, style, details." },
    { title: "Generate", desc: "The model renders a fresh image." },
    { title: "Save or remix", desc: "Download, drop it into a project, or iterate with another prompt." },
  ],
  video: [
    { title: "Set the scene", desc: "Write a motion prompt — or attach a still you want to animate." },
    { title: "Animate", desc: "The model produces a short cinematic clip." },
    { title: "Export", desc: "Preview, then download the clip or send it to your timeline." },
  ],
  audio: [
    { title: "Describe the vibe", desc: "Genre, tempo, instruments, mood — tell it what you want to hear." },
    { title: "Compose", desc: "The model generates an original audio bed." },
    { title: "Use it", desc: "Listen, download, or layer it under your video." },
  ],
  speech: [
    { title: "Write your script", desc: "Paste the line or paragraph you want spoken." },
    { title: "Synthesize", desc: "The model renders studio-grade voiceover." },
    { title: "Listen & save", desc: "Download the audio or drop it into a project." },
  ],
};

const COPY_BY_SKILL_ID: Record<string, CopyStep[]> = {
  // ── Photo Apps ───────────────────────────────────────────────
  "app-character-swap": [
    { title: "Upload the scene", desc: "Drop in the source photo whose pose, lighting, and composition you want to keep." },
    { title: "Describe the new character", desc: "Tell us who steps into the frame — gender, age, vibe, wardrobe." },
    { title: "Swap & refine", desc: "Get the re-cast shot back; tweak the prompt until the new character lands." },
  ],
  "app-background-swap": [
    { title: "Upload your subject", desc: "Pick a photo with a clear subject — person, product, pet." },
    { title: "Pick a destination", desc: "Describe the new backdrop: Tokyo street, studio cyc, alien planet." },
    { title: "Place & download", desc: "The subject is composited into the new world with matched lighting." },
  ],
  "app-outfit-try-on": [
    { title: "Upload a portrait", desc: "Full-body or half-body works best — clear lighting helps." },
    { title: "Describe the look", desc: "Outfit, color palette, accessories, era — be as specific as you like." },
    { title: "Restyle", desc: "Identity stays; clothing transforms. Iterate to nail the fit." },
  ],
  "app-room-redesign": [
    { title: "Upload the room", desc: "A clear photo of the interior you want re-decorated." },
    { title: "Pick a style", desc: "Scandi, brutalist, cottagecore, mid-century — name the vibe." },
    { title: "Re-decorate", desc: "Walls stay; furniture and finishes change to match the brief." },
  ],
  "app-headshot-studio": [
    { title: "Upload a selfie", desc: "Any casual front-facing photo with decent light." },
    { title: "Pick a setting", desc: "Office, studio backdrop, outdoor — plus wardrobe and crop." },
    { title: "Get LinkedIn-ready", desc: "Receive a polished, photoreal portrait you can post anywhere." },
  ],
  "app-glow-up": [
    { title: "Upload an image", desc: "Any photo you want to push toward a cohesive look." },
    { title: "Pick a grade", desc: "Film stock, color palette, lighting mood — describe the destination." },
    { title: "Apply the glow-up", desc: "Style lands across the whole frame without breaking the subject." },
  ],
  "app-object-remove": [
    { title: "Upload the photo", desc: "The shot with the distraction — tourist, wire, logo, sign." },
    { title: "Point at what to remove", desc: "Describe the unwanted element in plain language." },
    { title: "Clean & fill", desc: "It's erased and the gap is painted back in seamlessly." },
  ],
  "app-pet-portrait": [
    { title: "Upload your pet", desc: "A sharp, well-lit photo gives the best likeness." },
    { title: "Pick a persona", desc: "Renaissance noble, astronaut, rockstar — describe the costume and setting." },
    { title: "Get the hero portrait", desc: "A framed, gallery-ready portrait of your pet." },
  ],

  // ── Marketing Apps ───────────────────────────────────────────
  "app-poster-maker": [
    { title: "Write the headline", desc: "Event name, date, location, supporting copy — exactly as it should appear." },
    { title: "Set the art direction", desc: "Style, palette, typography mood, layout cues." },
    { title: "Render the poster", desc: "Get a print-ready poster with crisp, legible type baked in." },
  ],
  "app-product-shot": [
    { title: "Upload the product", desc: "A plain catalog or phone shot — background doesn't matter." },
    { title: "Describe the set", desc: "Lighting, surface, background, mood — like briefing a studio photographer." },
    { title: "Get the hero shot", desc: "A campaign-ready product image rendered to your spec." },
  ],
  "app-logo-mockup": [
    { title: "Upload the logo", desc: "Transparent PNG works best." },
    { title: "Pick the surface", desc: "T-shirt, billboard, packaging, storefront — describe the scene." },
    { title: "Render the mockup", desc: "Logo is placed in context, ready for decks and pitches." },
  ],
  "app-album-cover": [
    { title: "Set the concept", desc: "Genre, mood, color story, optional title and artist name." },
    { title: "Render the cover", desc: "Square, high-fidelity art with optional title typography baked in." },
    { title: "Export", desc: "Download at full resolution, ready for streaming platforms." },
  ],
  "app-ad-creative": [
    { title: "Write the headline", desc: "The hook that has to sell the product in two seconds." },
    { title: "Describe the visual", desc: "Product, scene, emotion — what stops the scroll." },
    { title: "Get the ad", desc: "Punchy social creative with headline and image composed together." },
  ],
  "app-storyboard-frames": [
    { title: "Sketch the scene", desc: "Characters, setting, key beats you want covered." },
    { title: "Generate the frames", desc: "Rapid-fire keyframes — same cast and style, different moments." },
    { title: "Edit the sequence", desc: "Re-roll any frame, then export the storyboard." },
  ],

  // ── Video Apps ───────────────────────────────────────────────
  "app-animate-photo": [
    { title: "Upload the still", desc: "Any photo you'd like to bring to life." },
    { title: "Describe the motion", desc: "Parallax, camera push, atmosphere, weather — set the mood." },
    { title: "Animate", desc: "Get a short clip with subtle, cinematic motion." },
  ],
  "app-cinematic-broll": [
    { title: "Brief the shot", desc: "Subject, environment, lens feel, lighting, mood." },
    { title: "Render the clip", desc: "Luma Dream Machine produces a dreamy, filmic take." },
    { title: "Drop into your edit", desc: "Download and drag straight into intros, mood reels, or cuts." },
  ],
  "app-music-video-clip": [
    { title: "Describe the moment", desc: "Performer, location, energy, color palette, camera move." },
    { title: "Generate the clip", desc: "Kling renders a short, punchy text-to-video take." },
    { title: "Stitch into the video", desc: "Repeat with new prompts to build out a full sequence." },
  ],
  "app-product-demo-loop": [
    { title: "Upload the product still", desc: "A clean catalog image of the product on a simple background." },
    { title: "Pick the motion", desc: "Spin, float, reveal, unbox — describe the loop." },
    { title: "Get the demo loop", desc: "A seamless looping clip ready for landing pages and ads." },
  ],
  "app-trailer-snippet": [
    { title: "Set the beat", desc: "Genre, tone, character, location, single dramatic moment." },
    { title: "Render the shot", desc: "MiniMax produces a fast, cinematic text-to-video take." },
    { title: "Cut into the trailer", desc: "Stack snippets to assemble a teaser or concept trailer." },
  ],

  // ── Audio Apps ───────────────────────────────────────────────
  "app-lofi-beat": [
    { title: "Set the mood", desc: "Tempo, mood (chill, rainy, late-night), key instruments." },
    { title: "Generate the beat", desc: "Get a smooth, loopable lo-fi instrumental." },
    { title: "Loop & use", desc: "Drop under videos, streams, or focus sessions." },
  ],
  "app-trailer-score": [
    { title: "Brief the cue", desc: "Genre, intensity arc, hits and risers, orchestration." },
    { title: "Score it", desc: "Stable Audio composes a tension-building cinematic cue." },
    { title: "Sync to picture", desc: "Drop the cue under your trailer cut and align the hits." },
  ],
  "app-sound-fx": [
    { title: "Describe the FX", desc: "Whoosh, impact, ambience, UI ping — what does it need to do?" },
    { title: "Generate", desc: "Get one-shot SFX tailored to your scene." },
    { title: "Drop into the edit", desc: "Layer onto cuts, transitions, or UI moments." },
  ],

  // ── Voice Apps ───────────────────────────────────────────────
  "app-audiobook-narrator": [
    { title: "Paste the chapter", desc: "Long-form text up to thousands of words." },
    { title: "Pick the narrator", desc: "Choose a voice and pacing that fits the book." },
    { title: "Render the audio", desc: "Get studio-grade narration ready to publish." },
  ],
  "app-podcast-host": [
    { title: "Paste the script", desc: "Intro, segment, or full episode script." },
    { title: "Pick the host voice", desc: "Warm, conversational voices ideal for podcasts." },
    { title: "Export the audio", desc: "Drop straight into your podcast edit." },
  ],
  "app-ad-voiceover": [
    { title: "Paste the script", desc: "Short, punchy ad copy works best." },
    { title: "Pick voice & language", desc: "Dozens of voices in many languages." },
    { title: "Get the read", desc: "Polished, multilingual ad-read voiceover." },
  ],

  // ── Raw model apps ───────────────────────────────────────────
  "image-nano-banana": [
    { title: "Type a prompt", desc: "One line describing what to make." },
    { title: "Nano Banana renders", desc: "Fast, vivid text-to-image — great for moodboards." },
    { title: "Iterate quickly", desc: "Tweak prompt, re-roll, or save." },
  ],
  "image-nano-banana-edit": [
    { title: "Upload the image", desc: "The image you want to remix or edit." },
    { title: "Describe the change", desc: "What to add, remove, or restyle — identity is preserved." },
    { title: "Get the edit", desc: "A re-mixed version that still looks like the original subject." },
  ],
  "image-flux-schnell": [
    { title: "Prompt it", desc: "Subject, style, composition — be specific." },
    { title: "Flux Schnell renders", desc: "Snappy Flux variant with high quality at low latency." },
    { title: "Save or iterate", desc: "Quickly explore many variants." },
  ],
  "image-flux-pro": [
    { title: "Brief the shot", desc: "Subject, lens, lighting, materials, atmosphere." },
    { title: "Flux Pro renders", desc: "Top-tier photoreal output — slower, premium fidelity." },
    { title: "Export at full res", desc: "Ready for hero use." },
  ],
  "image-ideogram": [
    { title: "Write the copy", desc: "The exact text you want rendered on the image." },
    { title: "Set the art direction", desc: "Style, layout, palette, typography mood." },
    { title: "Render with type", desc: "Best-in-class text-in-image, posters, and typography." },
  ],
  "video-kling-i2v": [
    { title: "Upload a still", desc: "The image you want animated." },
    { title: "Describe the motion", desc: "Camera move, subject motion, atmosphere." },
    { title: "Kling animates it", desc: "Returns a short, motion-directed clip." },
  ],
  "video-kling-t2v": [
    { title: "Write a prompt", desc: "Subject, action, environment, camera." },
    { title: "Kling renders the clip", desc: "Generates a short clip from your description." },
    { title: "Download or iterate", desc: "Save the take, or refine the prompt." },
  ],
  "video-luma": [
    { title: "Brief the shot", desc: "Dreamy, cinematic — what's the vibe?" },
    { title: "Luma Ray 2 renders", desc: "Filmic motion ideal for montages and mood." },
    { title: "Use it", desc: "Download and cut into your edit." },
  ],
  "video-minimax": [
    { title: "Write the prompt", desc: "Subject, action, setting." },
    { title: "MiniMax renders", desc: "Fast text-to-video with crisp subjects." },
    { title: "Export", desc: "Download the clip when it's ready." },
  ],
  "audio-cassette": [
    { title: "Describe the bed", desc: "Genre, tempo, instruments, length." },
    { title: "Cassette composes", desc: "Quick original music bed from your prompt." },
    { title: "Drop into the project", desc: "Use as background music or a scratch track." },
  ],
  "audio-stable": [
    { title: "Describe the audio", desc: "Music, SFX, ambience — be specific about texture." },
    { title: "Stable Audio renders", desc: "High-quality original music and SFX." },
    { title: "Download", desc: "Ready to drop into your edit." },
  ],
  "speech-elevenlabs": [
    { title: "Paste the text", desc: "Whatever you want spoken — short line or long passage." },
    { title: "Pick a voice", desc: "Dozens of voices and languages." },
    { title: "Render the audio", desc: "Studio-grade voiceover ready to use." },
  ],
  "speech-playht": [
    { title: "Paste the text", desc: "Script or narration copy." },
    { title: "Pick a voice", desc: "Natural, conversational TTS voices." },
    { title: "Get the audio", desc: "Great for narration and explainers." },
  ],
};

// ── Inference: copy step → typed step ───────────────────────────

const UPLOAD_RE = /\b(upload|drop in|attach)\b/i;
const CHOICE_RE = /\b(pick|choose|select)\b/i;
const PROMPT_RE = /\b(describe|write|brief|prompt|paste|set the|sketch|point at|type)\b/i;

function classifyKind(copy: CopyStep, skillKind: Skill["kind"]): StepKind {
  if (UPLOAD_RE.test(copy.title) || UPLOAD_RE.test(copy.desc)) return "upload";
  if (CHOICE_RE.test(copy.title)) return "choice";
  if (PROMPT_RE.test(copy.title)) return "prompt";
  // Fallback: text input is the safest default for any "interactive" step.
  void skillKind;
  return "prompt";
}

function uploadAcceptFor(skillKind: Skill["kind"]): AppStep["accept"] {
  // Most upload steps live inside image/photo apps and want still images.
  // Video apps occasionally take a starting still — also image. Audio apps
  // rarely ask for uploads. Default to "image"; refine when we see explicit
  // audio/video upload steps.
  if (skillKind === "audio") return "audio";
  return "image";
}

// Heuristic placeholder & starter chips for the wizard UI.
function placeholderFor(copy: CopyStep): string {
  const first = copy.desc.split(/[.—]/)[0]?.trim();
  return first ? `e.g. ${first.toLowerCase()}` : "Type here…";
}

// A small curated set of starter chips per known app. Falls back to empty
// (the wizard always shows a free-text field for "Other").
const CHOICE_STARTERS: Record<string, string[]> = {
  "app-background-swap": ["Tokyo street at dusk", "Clean studio cyc", "Alien jungle", "Snowy mountain pass"],
  "app-room-redesign": ["Scandinavian minimal", "Mid-century modern", "Cottagecore", "Brutalist concrete"],
  "app-headshot-studio": ["Modern office", "Studio black backdrop", "Outdoor golden hour", "Editorial white"],
  "app-glow-up": ["Kodak Portra 400", "Moody teal & orange", "Sun-bleached pastel", "High-contrast B&W"],
  "app-pet-portrait": ["Renaissance noble", "Astronaut in space", "Rockstar on stage", "Royal coronation"],
  "app-logo-mockup": ["T-shirt", "Billboard at night", "Product packaging", "Storefront window"],
  "app-product-demo-loop": ["Slow 360° spin", "Floating reveal", "Unbox animation", "Hero zoom-in"],
  "app-audiobook-narrator": ["Warm male baritone", "Calm female alto", "Crisp British male", "Soft female narrator"],
  "app-podcast-host": ["Conversational male", "Energetic female", "NPR-style host", "Late-night radio"],
  "app-ad-voiceover": ["English – upbeat", "Spanish – warm", "French – polished", "German – authoritative"],
  "speech-elevenlabs": ["Adam (deep male)", "Bella (warm female)", "Antoni (smooth male)", "Domi (energetic female)"],
  "speech-playht": ["Natural male", "Natural female", "Friendly host", "News anchor"],
};

function toRecipe(steps: CopyStep[], skillKind: Skill["kind"], skillId: string): AppRecipe {
  const typed: AppStep[] = steps.map((s, i): AppStep => {
    const isLast = i === steps.length - 1;
    if (isLast) {
      return { id: `step${i + 1}`, title: s.title, desc: s.desc, kind: "generate" };
    }
    const kind = classifyKind(s, skillKind);
    const base: AppStep = { id: `step${i + 1}`, title: s.title, desc: s.desc, kind };
    if (kind === "upload") base.accept = uploadAcceptFor(skillKind);
    if (kind === "choice") base.options = CHOICE_STARTERS[skillId] ?? [];
    if (kind === "prompt") base.placeholder = placeholderFor(s);
    return base;
  });

  // Default compose template: a readable, label-prefixed prompt that the
  // agent (or direct generator) can act on. Mentions uploads inline so the
  // model knows assets are attached.
  const lines = typed
    .filter((s) => s.kind !== "generate")
    .map((s) =>
      s.kind === "upload" ? `${s.title}: {{upload:${s.id}}}` : `${s.title}: {{${s.id}}}`,
    );
  const template = lines.join("\n");

  return { steps: typed, template };
}

// ── Public API ──────────────────────────────────────────────────

export function getRecipeForSkill(skill: Skill): AppRecipe {
  const copy = COPY_BY_SKILL_ID[skill.id] ?? COPY_BY_KIND[skill.kind];
  return toRecipe(copy, skill.kind, skill.id);
}

// Compose a final prompt string from a wizard's collected inputs.
// `uploads` maps stepId → human-readable description of attached assets.
export function composePrompt(
  recipe: AppRecipe,
  inputs: Record<string, string>,
  uploads: Record<string, string> = {},
): string {
  return recipe.template.replace(/\{\{(upload:)?([a-zA-Z0-9_]+)\}\}/g, (_, isUpload, id) => {
    if (isUpload) return uploads[id] ?? "(no file attached)";
    return inputs[id] ?? "";
  });
}

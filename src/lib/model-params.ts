// Per-model parameter schema. Each entry lists the extra controls the Create
// app surfaces for a given fal model. Values selected by the user are merged
// into the upstream fal input body via directGenerateStart.

export type ParamControl =
  | {
      key: string;
      type: "select";
      label: string;
      options: { value: string; label: string }[];
      default: string;
    }
  | {
      key: string;
      type: "slider";
      label: string;
      min: number;
      max: number;
      step: number;
      default: number;
      unit?: string;
    }
  | {
      key: string;
      type: "toggle";
      label: string;
      default: boolean;
    };

const ASPECT_OPTIONS = [
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "21:9", label: "21:9" },
];

const IMAGE_COUNT: ParamControl = {
  key: "num_images",
  type: "slider",
  label: "Count",
  min: 1,
  max: 4,
  step: 1,
  default: 1,
};

const IMAGE_BASE: ParamControl[] = [
  {
    key: "aspect_ratio",
    type: "select",
    label: "Aspect",
    options: ASPECT_OPTIONS,
    default: "1:1",
  },
  IMAGE_COUNT,
];

const VIDEO_BASE: ParamControl[] = [
  {
    key: "aspect_ratio",
    type: "select",
    label: "Aspect",
    options: ASPECT_OPTIONS,
    default: "16:9",
  },
  {
    key: "duration",
    type: "select",
    label: "Duration",
    options: [
      { value: "5", label: "5s" },
      { value: "10", label: "10s" },
    ],
    default: "5",
  },
];

// Reserved for future use; per-endpoint duration sliders live inline below.
// (Kept exported via underscore to avoid unused-const lint noise.)
const _AUDIO_BASE: ParamControl[] = [
  {
    key: "duration",
    type: "slider",
    label: "Duration",
    min: 5,
    max: 60,
    step: 5,
    default: 30,
    unit: "s",
  },
];
void _AUDIO_BASE;


// ElevenLabs voice library (subset matching the TTS quickstart).
const ELEVEN_VOICES = [
  { value: "Rachel", label: "Rachel — warm female" },
  { value: "Adam", label: "Adam — deep male" },
  { value: "Bella", label: "Bella — soft female" },
  { value: "Antoni", label: "Antoni — smooth male" },
  { value: "Domi", label: "Domi — energetic female" },
  { value: "Sarah", label: "Sarah — friendly female" },
  { value: "Charlie", label: "Charlie — natural male" },
  { value: "George", label: "George — British male" },
  { value: "Liam", label: "Liam — youthful male" },
  { value: "Lily", label: "Lily — soft female" },
  { value: "Brian", label: "Brian — narrator male" },
  { value: "Jessica", label: "Jessica — expressive female" },
];

// MiniMax Speech 02 voice presets.
const MINIMAX_VOICES = [
  { value: "Wise_Woman", label: "Wise Woman" },
  { value: "Friendly_Person", label: "Friendly Person" },
  { value: "Inspirational_girl", label: "Inspirational Girl" },
  { value: "Deep_Voice_Man", label: "Deep Voice Man" },
  { value: "Calm_Woman", label: "Calm Woman" },
  { value: "Casual_Guy", label: "Casual Guy" },
  { value: "Lively_Girl", label: "Lively Girl" },
  { value: "Patient_Man", label: "Patient Man" },
  { value: "Young_Knight", label: "Young Knight" },
  { value: "Determined_Man", label: "Determined Man" },
  { value: "Lovely_Girl", label: "Lovely Girl" },
  { value: "Decent_Boy", label: "Decent Boy" },
];

const SPEECH_BASE: ParamControl[] = [
  {
    key: "voice",
    type: "select",
    label: "Voice",
    options: ELEVEN_VOICES,
    default: "Rachel",
  },
  {
    key: "stability",
    type: "slider",
    label: "Stability",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.5,
  },
];

const SEEDREAM_PARAMS: ParamControl[] = [
  {
    key: "image_size",
    type: "select",
    label: "Image size",
    options: [
      { value: "square_hd", label: "Square HD (2048×2048)" },
      { value: "square", label: "Square (1024×1024)" },
      { value: "portrait_4_3", label: "Portrait 4:3" },
      { value: "portrait_16_9", label: "Portrait 9:16" },
      { value: "landscape_4_3", label: "Landscape 4:3" },
      { value: "landscape_16_9", label: "Landscape 16:9" },
      { value: "4k_landscape", label: "4K Landscape (3840×2160)" },
      { value: "4k_square", label: "4K Square (4096×4096)" },
    ],
    default: "square_hd",
  },
  {
    key: "num_images",
    type: "slider",
    label: "Count",
    min: 1,
    max: 6,
    step: 1,
    default: 1,
  },
  {
    key: "max_images",
    type: "slider",
    label: "Max per gen",
    min: 1,
    max: 6,
    step: 1,
    default: 1,
  },
  {
    key: "enhance_prompt_mode",
    type: "select",
    label: "Prompt enhancement",
    options: [
      { value: "standard", label: "Standard (better quality)" },
      { value: "fast", label: "Fast (lower latency)" },
    ],
    default: "standard",
  },
  {
    key: "enable_safety_checker",
    type: "toggle",
    label: "Safety checker",
    default: true,
  },
  {
    key: "seed",
    type: "slider",
    label: "Seed",
    min: 0,
    max: 999999,
    step: 1,
    default: 0,
  },
];

const GPT_IMAGE_2_PARAMS: ParamControl[] = [
  {
    key: "image_size",
    type: "select",
    label: "Size",
    options: [
      { value: "auto", label: "Auto" },
      { value: "square_hd", label: "Square HD" },
      { value: "square", label: "Square" },
      { value: "portrait_4_3", label: "Portrait 4:3" },
      { value: "portrait_16_9", label: "Portrait 16:9" },
      { value: "landscape_4_3", label: "Landscape 4:3" },
      { value: "landscape_16_9", label: "Landscape 16:9" },
    ],
    default: "auto",
  },
  {
    key: "quality",
    type: "select",
    label: "Quality",
    options: [
      { value: "auto", label: "Auto" },
      { value: "low", label: "Low (fastest)" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
    default: "low",
  },
  {
    key: "background",
    type: "select",
    label: "Background",
    options: [
      { value: "auto", label: "Auto" },
      { value: "opaque", label: "Opaque" },
      { value: "transparent", label: "Transparent (PNG/WebP)" },
    ],
    default: "auto",
  },
  {
    key: "output_format",
    type: "select",
    label: "Format",
    options: [
      { value: "png", label: "PNG" },
      { value: "jpeg", label: "JPEG" },
      { value: "webp", label: "WebP" },
    ],
    default: "png",
  },
  {
    key: "num_images",
    type: "slider",
    label: "Count",
    min: 1,
    max: 4,
    step: 1,
    default: 1,
  },
];

const GPT_IMAGE_2_EDIT_PARAMS: ParamControl[] = [
  ...GPT_IMAGE_2_PARAMS,
  {
    key: "input_fidelity",
    type: "select",
    label: "Input fidelity",
    options: [
      { value: "low", label: "Low (more creative)" },
      { value: "high", label: "High (preserve details)" },
    ],
    default: "low",
  },
];


// Full aspect ratio set supported by Nano Banana (Google Imagen).
const NANO_BANANA_RATIOS = [
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "3:2", label: "3:2" },
  { value: "2:3", label: "2:3" },
  { value: "4:5", label: "4:5" },
  { value: "5:4", label: "5:4" },
  { value: "21:9", label: "21:9" },
];

const NANO_BANANA_PARAMS: ParamControl[] = [
  { key: "aspect_ratio", type: "select", label: "Aspect", options: NANO_BANANA_RATIOS, default: "1:1" },
  { key: "num_images", type: "slider", label: "Count", min: 1, max: 4, step: 1, default: 1 },
  {
    key: "output_format",
    type: "select",
    label: "Format",
    options: [
      { value: "png", label: "PNG" },
      { value: "jpeg", label: "JPEG" },
      { value: "webp", label: "WebP" },
    ],
    default: "png",
  },
];

const NANO_BANANA_EDIT_PARAMS: ParamControl[] = [
  {
    key: "aspect_ratio",
    type: "select",
    label: "Aspect",
    options: [{ value: "auto", label: "Auto" }, ...NANO_BANANA_RATIOS],
    default: "auto",
  },
  { key: "num_images", type: "slider", label: "Count", min: 1, max: 4, step: 1, default: 1 },
  {
    key: "output_format",
    type: "select",
    label: "Format",
    options: [
      { value: "png", label: "PNG" },
      { value: "jpeg", label: "JPEG" },
      { value: "webp", label: "WebP" },
    ],
    default: "png",
  },
];

// Nano Banana 2 (fal-ai/nano-banana-2). Skills.ts uses the /text-to-image
// suffix slug — key both so params surface regardless of the routed slug.
const NANO_BANANA_2_PARAMS: ParamControl[] = [
  {
    key: "resolution",
    type: "select",
    label: "Resolution",
    options: [
      { value: "0.5K", label: "0.5K" },
      { value: "1K", label: "1K" },
      { value: "2K", label: "2K (1.5× cost)" },
      { value: "4K", label: "4K (2× cost)" },
    ],
    default: "1K",
  },
  {
    key: "aspect_ratio",
    type: "select",
    label: "Aspect",
    options: [{ value: "auto", label: "Auto" }, ...NANO_BANANA_RATIOS],
    default: "auto",
  },
  { key: "num_images", type: "slider", label: "Count", min: 1, max: 4, step: 1, default: 1 },
  {
    key: "output_format",
    type: "select",
    label: "Format",
    options: [
      { value: "png", label: "PNG" },
      { value: "jpeg", label: "JPEG" },
      { value: "webp", label: "WebP" },
    ],
    default: "png",
  },
];

// Flux Pro v1.1 — image_size enum + num_images + format + enhance_prompt.
const FLUX_PRO_V1_1_PARAMS: ParamControl[] = [
  {
    key: "image_size",
    type: "select",
    label: "Size",
    options: [
      { value: "square_hd", label: "Square HD" },
      { value: "square", label: "Square" },
      { value: "portrait_4_3", label: "Portrait 4:3" },
      { value: "portrait_16_9", label: "Portrait 16:9" },
      { value: "landscape_4_3", label: "Landscape 4:3" },
      { value: "landscape_16_9", label: "Landscape 16:9" },
    ],
    default: "landscape_4_3",
  },
  { key: "num_images", type: "slider", label: "Count", min: 1, max: 4, step: 1, default: 1 },
  {
    key: "output_format",
    type: "select",
    label: "Format",
    options: [
      { value: "jpeg", label: "JPEG" },
      { value: "png", label: "PNG" },
    ],
    default: "jpeg",
  },
  { key: "enhance_prompt", type: "toggle", label: "Enhance prompt", default: false },
];

// Ideogram v3 — image_size + num_images (1-8) + rendering speed + style + expand_prompt.
const IDEOGRAM_V3_PARAMS: ParamControl[] = [
  {
    key: "image_size",
    type: "select",
    label: "Size",
    options: [
      { value: "square_hd", label: "Square HD" },
      { value: "square", label: "Square" },
      { value: "portrait_4_3", label: "Portrait 4:3" },
      { value: "portrait_16_9", label: "Portrait 16:9" },
      { value: "landscape_4_3", label: "Landscape 4:3" },
      { value: "landscape_16_9", label: "Landscape 16:9" },
    ],
    default: "square_hd",
  },
  { key: "num_images", type: "slider", label: "Count", min: 1, max: 8, step: 1, default: 1 },
  {
    key: "rendering_speed",
    type: "select",
    label: "Rendering",
    options: [
      { value: "TURBO", label: "Turbo (fastest)" },
      { value: "BALANCED", label: "Balanced" },
      { value: "QUALITY", label: "Quality" },
    ],
    default: "BALANCED",
  },
  {
    key: "style",
    type: "select",
    label: "Style",
    options: [
      { value: "AUTO", label: "Auto" },
      { value: "GENERAL", label: "General" },
      { value: "REALISTIC", label: "Realistic" },
      { value: "DESIGN", label: "Design" },
    ],
    default: "AUTO",
  },
  { key: "expand_prompt", type: "toggle", label: "Magic Prompt", default: true },
];

export const MODEL_PARAMS: Record<string, ParamControl[]> = {
  // Image models
  "fal-ai/nano-banana": NANO_BANANA_PARAMS,
  "fal-ai/nano-banana/edit": NANO_BANANA_EDIT_PARAMS,
  "fal-ai/nano-banana-2": NANO_BANANA_2_PARAMS,
  // Skills.ts wires the /text-to-image suffix — alias to the same schema.
  "fal-ai/nano-banana-2/text-to-image": NANO_BANANA_2_PARAMS,
  "fal-ai/bytedance/seedream/v4/text-to-image": SEEDREAM_PARAMS,
  "fal-ai/bytedance/seedream/v4/edit": SEEDREAM_PARAMS,
  "openai/gpt-image-2": GPT_IMAGE_2_PARAMS,
  "openai/gpt-image-2/edit": GPT_IMAGE_2_EDIT_PARAMS,
  "fal-ai/flux/schnell": [
    ...IMAGE_BASE,
    {
      key: "num_inference_steps",
      type: "slider",
      label: "Steps",
      min: 1,
      max: 12,
      step: 1,
      default: 4,
    },
  ],
  "fal-ai/flux-pro/v1.1": FLUX_PRO_V1_1_PARAMS,
  "fal-ai/ideogram/v3": IDEOGRAM_V3_PARAMS,


  // Video models
  // Kling 2.1 standard i2v — aspect inherits from source image; only duration + cfg.
  "fal-ai/kling-video/v2.1/standard/image-to-video": [
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [
        { value: "5", label: "5s" },
        { value: "10", label: "10s" },
      ],
      default: "5",
    },
    { key: "cfg_scale", type: "slider", label: "Prompt adherence", min: 0, max: 1, step: 0.05, default: 0.5 },
  ],
  "fal-ai/kling-video/v2.1/master/text-to-video": [
    {
      key: "aspect_ratio",
      type: "select",
      label: "Aspect",
      options: [
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
        { value: "1:1", label: "1:1" },
      ],
      default: "16:9",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [
        { value: "5", label: "5s" },
        { value: "10", label: "10s" },
      ],
      default: "5",
    },
    { key: "cfg_scale", type: "slider", label: "Prompt adherence", min: 0, max: 1, step: 0.05, default: 0.5 },
  ],
  // Kling 3.0 motion control — character orientation + keep-sound toggle.
  "fal-ai/kling-video/v3/pro/motion-control": [
    {
      key: "character_orientation",
      type: "select",
      label: "Character source",
      options: [
        { value: "image", label: "Reference image" },
        { value: "video", label: "Reference video" },
      ],
      default: "image",
    },
    { key: "keep_original_sound", type: "toggle", label: "Keep original sound", default: true },
  ],

  "fal-ai/kling-video/v2.5-turbo/pro/text-to-video": [
    {
      key: "aspect_ratio",
      type: "select",
      label: "Aspect",
      options: [
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
        { value: "1:1", label: "1:1" },
      ],
      default: "16:9",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [
        { value: "5", label: "5s" },
        { value: "10", label: "10s" },
      ],
      default: "5",
    },
    {
      key: "cfg_scale",
      type: "slider",
      label: "Prompt adherence",
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
    },
  ],
  "fal-ai/kling-video/v2.5-turbo/pro/image-to-video": [
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [
        { value: "5", label: "5s" },
        { value: "10", label: "10s" },
      ],
      default: "5",
    },
    {
      key: "cfg_scale",
      type: "slider",
      label: "Prompt adherence",
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
    },
  ],
  // Luma Ray 2 — supports 5s/9s, 540/720/1080, expanded aspect set, loop.
  "fal-ai/luma-dream-machine/ray-2": [
    {
      key: "aspect_ratio",
      type: "select",
      label: "Aspect",
      options: [
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
        { value: "4:3", label: "4:3" },
        { value: "3:4", label: "3:4" },
        { value: "21:9", label: "21:9" },
        { value: "9:21", label: "9:21" },
      ],
      default: "16:9",
    },
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "540p", label: "540p" },
        { value: "720p", label: "720p (2× cost)" },
        { value: "1080p", label: "1080p (4× cost)" },
      ],
      default: "540p",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [
        { value: "5s", label: "5s" },
        { value: "9s", label: "9s (2× cost)" },
      ],
      default: "5s",
    },
    { key: "loop", type: "toggle", label: "Loop", default: false },
  ],
  // MiniMax video-01 — only prompt_optimizer is exposed by the API.
  "fal-ai/minimax/video-01": [
    { key: "prompt_optimizer", type: "toggle", label: "Prompt optimizer", default: true },
  ],
  // Wan 2.7 (wan-25-preview) text-to-video.
  "fal-ai/wan-25-preview/text-to-video": [
    {
      key: "aspect_ratio",
      type: "select",
      label: "Aspect",
      options: [
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
        { value: "1:1", label: "1:1" },
      ],
      default: "16:9",
    },
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "480p", label: "480p" },
        { value: "720p", label: "720p" },
        { value: "1080p", label: "1080p" },
      ],
      default: "1080p",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [
        { value: "5", label: "5s" },
        { value: "10", label: "10s" },
      ],
      default: "5",
    },
    { key: "enable_prompt_expansion", type: "toggle", label: "Expand prompt", default: true },
    { key: "enable_safety_checker", type: "toggle", label: "Safety checker", default: true },
  ],
  // Pika 2.5 Keyframe (pikaframes) — keyframe-based; only resolution + seed.
  "fal-ai/pika/v2.2/pikaframes": [
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "720p", label: "720p" },
        { value: "1080p", label: "1080p" },
      ],
      default: "720p",
    },
    { key: "seed", type: "slider", label: "Seed", min: 0, max: 9999, step: 1, default: 42 },
  ],
  // Pikascenes — combine multiple images into a coherent scene.
  "fal-ai/pika/v2.2/pikascenes": [
    {
      key: "aspect_ratio",
      type: "select",
      label: "Aspect",
      options: [
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
        { value: "1:1", label: "1:1" },
        { value: "4:5", label: "4:5" },
        { value: "5:4", label: "5:4" },
        { value: "3:2", label: "3:2" },
        { value: "2:3", label: "2:3" },
      ],
      default: "16:9",
    },
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "720p", label: "720p" },
        { value: "1080p", label: "1080p" },
      ],
      default: "1080p",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [
        { value: "5", label: "5s" },
        { value: "10", label: "10s" },
      ],
      default: "5",
    },
    {
      key: "ingredients_mode",
      type: "select",
      label: "Ingredients mode",
      options: [
        { value: "precise", label: "Precise (faithful)" },
        { value: "creative", label: "Creative (looser)" },
      ],
      default: "precise",
    },
    { key: "seed", type: "slider", label: "Seed", min: 0, max: 9999, step: 1, default: 42 },
  ],
  // Pikaswap — swap an object/region in a video. Just seed (modify_region is a text input).
  "fal-ai/pika/v2/pikaswaps": [
    { key: "seed", type: "slider", label: "Seed", min: 0, max: 9999, step: 1, default: 42 },
  ],
  // Pikaddition — drop a subject from an image into a video. Only seed.
  "fal-ai/pika/v2/pikadditions": [
    { key: "seed", type: "slider", label: "Seed", min: 0, max: 9999, step: 1, default: 42 },
  ],
  "bytedance/seedance-2.0/text-to-video": [
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "480p", label: "480p" },
        { value: "720p", label: "720p" },
        { value: "1080p", label: "1080p" },
      ],
      default: "720p",
    },
    {
      key: "aspect_ratio",
      type: "select",
      label: "Aspect",
      options: [
        { value: "auto", label: "Auto" },
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
        { value: "1:1", label: "1:1" },
        { value: "21:9", label: "21:9" },
        { value: "4:3", label: "4:3" },
        { value: "3:4", label: "3:4" },
      ],
      default: "auto",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [
        { value: "auto", label: "Auto" },
        { value: "4", label: "4s" },
        { value: "5", label: "5s" },
        { value: "6", label: "6s" },
        { value: "8", label: "8s" },
        { value: "10", label: "10s" },
        { value: "12", label: "12s" },
        { value: "15", label: "15s" },
      ],
      default: "auto",
    },
    {
      key: "generate_audio",
      type: "toggle",
      label: "Generate audio",
      default: true,
    },
  ],

  // Seedance 2.0 Mini — same shape as full Seedance 2.0 but resolution is
  // capped at 720p (no 1080p) per fal's OpenAPI schema.
  "bytedance/seedance-2.0/mini/text-to-video": [
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "480p", label: "480p" },
        { value: "720p", label: "720p" },
      ],
      default: "720p",
    },
    {
      key: "aspect_ratio",
      type: "select",
      label: "Aspect",
      options: [
        { value: "auto", label: "Auto" },
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
        { value: "1:1", label: "1:1" },
        { value: "21:9", label: "21:9" },
        { value: "4:3", label: "4:3" },
        { value: "3:4", label: "3:4" },
      ],
      default: "auto",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [
        { value: "auto", label: "Auto" },
        { value: "4", label: "4s" },
        { value: "5", label: "5s" },
        { value: "6", label: "6s" },
        { value: "7", label: "7s" },
        { value: "8", label: "8s" },
        { value: "9", label: "9s" },
        { value: "10", label: "10s" },
        { value: "11", label: "11s" },
        { value: "12", label: "12s" },
        { value: "13", label: "13s" },
        { value: "14", label: "14s" },
        { value: "15", label: "15s" },
      ],
      default: "auto",
    },
    {
      key: "generate_audio",
      type: "toggle",
      label: "Generate audio",
      default: true,
    },
  ],
  "bytedance/seedance-2.0/mini/reference-to-video": [
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "480p", label: "480p" },
        { value: "720p", label: "720p" },
      ],
      default: "720p",
    },
    {
      key: "aspect_ratio",
      type: "select",
      label: "Aspect",
      options: [
        { value: "auto", label: "Auto" },
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
        { value: "1:1", label: "1:1" },
        { value: "21:9", label: "21:9" },
        { value: "4:3", label: "4:3" },
        { value: "3:4", label: "3:4" },
      ],
      default: "auto",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [
        { value: "auto", label: "Auto" },
        { value: "4", label: "4s" },
        { value: "5", label: "5s" },
        { value: "6", label: "6s" },
        { value: "7", label: "7s" },
        { value: "8", label: "8s" },
        { value: "9", label: "9s" },
        { value: "10", label: "10s" },
        { value: "11", label: "11s" },
        { value: "12", label: "12s" },
        { value: "13", label: "13s" },
        { value: "14", label: "14s" },
        { value: "15", label: "15s" },
      ],
      default: "auto",
    },
    {
      key: "generate_audio",
      type: "toggle",
      label: "Generate audio",
      default: true,
    },
  ],

  // Pika (Parrot v0 / pikai2v worker). Only resolution + seed are accepted
  // upstream — no aspect_ratio, duration, fps, or guidance knobs.
  "pika:image-to-video-v2": [
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "720p", label: "720p" },
        { value: "1080p", label: "1080p" },
      ],
      default: "720p",
    },
    {
      key: "seed",
      type: "slider",
      label: "Seed",
      min: 0,
      max: 9999,
      step: 1,
      default: 42,
    },
  ],

  // Pika via fal.ai. Image-to-video variants take the aspect ratio from the
  // source image, so we only surface resolution + duration + seed. The
  // text-to-video variant additionally exposes an aspect ratio.
  "fal-ai/pika/v2.2/image-to-video": [
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "720p", label: "720p" },
        { value: "1080p", label: "1080p" },
      ],
      default: "720p",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [
        { value: "5", label: "5s" },
        { value: "10", label: "10s" },
      ],
      default: "5",
    },
    { key: "seed", type: "slider", label: "Seed", min: 0, max: 9999, step: 1, default: 42 },
  ],
  "fal-ai/pika/v2/turbo/image-to-video": [
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "720p", label: "720p" },
        { value: "1080p", label: "1080p" },
      ],
      default: "720p",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [
        { value: "5", label: "5s" },
        { value: "10", label: "10s" },
      ],
      default: "5",
    },
    { key: "seed", type: "slider", label: "Seed", min: 0, max: 9999, step: 1, default: 42 },
  ],
  "fal-ai/pika/v2.2/text-to-video": [
    {
      key: "aspect_ratio",
      type: "select",
      label: "Aspect",
      options: [
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
        { value: "1:1", label: "1:1" },
        { value: "4:5", label: "4:5" },
        { value: "5:4", label: "5:4" },
        { value: "4:3", label: "4:3" },
        { value: "3:4", label: "3:4" },
      ],
      default: "16:9",
    },
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "720p", label: "720p" },
        { value: "1080p", label: "1080p" },
      ],
      default: "720p",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [
        { value: "5", label: "5s" },
        { value: "10", label: "10s" },
      ],
      default: "5",
    },
    { key: "seed", type: "slider", label: "Seed", min: 0, max: 9999, step: 1, default: 42 },
  ],

  // Google Veo 3 via fal.ai. Veo 3 produces 8s clips natively with audio.
  "fal-ai/veo3": [
    {
      key: "aspect_ratio",
      type: "select",
      label: "Aspect",
      options: [
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
        { value: "1:1", label: "1:1" },
      ],
      default: "16:9",
    },
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "720p", label: "720p" },
        { value: "1080p", label: "1080p" },
      ],
      default: "720p",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [{ value: "8s", label: "8s" }],
      default: "8s",
    },
    { key: "generate_audio", type: "toggle", label: "Generate audio", default: true },
    { key: "enhance_prompt", type: "toggle", label: "Enhance prompt", default: true },
  ],
  "fal-ai/veo3/fast": [
    {
      key: "aspect_ratio",
      type: "select",
      label: "Aspect",
      options: [
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
        { value: "1:1", label: "1:1" },
      ],
      default: "16:9",
    },
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "720p", label: "720p" },
        { value: "1080p", label: "1080p" },
      ],
      default: "720p",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [{ value: "8s", label: "8s" }],
      default: "8s",
    },
    { key: "generate_audio", type: "toggle", label: "Generate audio", default: true },
    { key: "enhance_prompt", type: "toggle", label: "Enhance prompt", default: true },
  ],
  "fal-ai/veo3/image-to-video": [
    {
      key: "aspect_ratio",
      type: "select",
      label: "Aspect",
      options: [
        { value: "auto", label: "Auto" },
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
      ],
      default: "auto",
    },
    {
      key: "resolution",
      type: "select",
      label: "Resolution",
      options: [
        { value: "720p", label: "720p" },
        { value: "1080p", label: "1080p" },
      ],
      default: "720p",
    },
    {
      key: "duration",
      type: "select",
      label: "Duration",
      options: [{ value: "8s", label: "8s" }],
      default: "8s",
    },
    { key: "generate_audio", type: "toggle", label: "Generate audio", default: true },
  ],

  // ── Music / SFX models ──────────────────────────────────────────
  "cassetteai/music-generator": [
    { key: "duration", type: "slider", label: "Duration", min: 5, max: 180, step: 5, default: 30, unit: "s" },
  ],
  "cassetteai/sound-effects-generator": [
    { key: "duration", type: "slider", label: "Duration", min: 1, max: 30, step: 1, default: 5, unit: "s" },
  ],
  "fal-ai/stable-audio-25/text-to-audio": [
    { key: "seconds_total", type: "slider", label: "Duration", min: 5, max: 190, step: 5, default: 30, unit: "s" },
    { key: "steps", type: "slider", label: "Steps", min: 4, max: 50, step: 1, default: 8 },
  ],
  "fal-ai/elevenlabs/music": [
    {
      key: "music_length_ms",
      type: "slider",
      label: "Length",
      min: 10000,
      max: 240000,
      step: 5000,
      default: 30000,
      unit: "ms",
    },
  ],
  "fal-ai/elevenlabs/sound-effects": [
    { key: "duration_seconds", type: "slider", label: "Duration", min: 1, max: 22, step: 1, default: 5, unit: "s" },
    { key: "prompt_influence", type: "slider", label: "Prompt influence", min: 0, max: 1, step: 0.05, default: 0.3 },
  ],
  "fal-ai/minimax-music/v2": [],
  "fal-ai/minimax-music/v2.6": [],
  "beatoven/sound-effect-generation": [
    { key: "duration", type: "slider", label: "Duration", min: 1, max: 30, step: 1, default: 5, unit: "s" },
  ],

  // ── Speech models ──────────────────────────────────────────────
  "fal-ai/elevenlabs/tts/multilingual-v2": SPEECH_BASE,
  "fal-ai/elevenlabs/tts/turbo-v2.5": SPEECH_BASE,
  "fal-ai/minimax/speech-02-hd": [
    { key: "voice", type: "select", label: "Voice", options: MINIMAX_VOICES, default: "Wise_Woman" },
    { key: "speed", type: "slider", label: "Speed", min: 0.5, max: 2, step: 0.05, default: 1 },
  ],
  "fal-ai/minimax/speech-02-turbo": [
    { key: "voice", type: "select", label: "Voice", options: MINIMAX_VOICES, default: "Wise_Woman" },
    { key: "speed", type: "slider", label: "Speed", min: 0.5, max: 2, step: 0.05, default: 1 },
  ],
  "fal-ai/chatterbox/text-to-speech": [
    { key: "exaggeration", type: "slider", label: "Expression", min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: "temperature", type: "slider", label: "Temperature", min: 0, max: 1, step: 0.05, default: 0.7 },
  ],
  "fal-ai/inworld-tts": [
    {
      key: "voice",
      type: "select",
      label: "Voice",
      options: [
        { value: "Ashley", label: "Ashley" },
        { value: "Hades", label: "Hades" },
        { value: "Wendy", label: "Wendy" },
        { value: "Mark", label: "Mark" },
        { value: "Olivia", label: "Olivia" },
        { value: "Edward", label: "Edward" },
      ],
      default: "Ashley",
    },
  ],

  // ── ByteDance Seed-Audio 1.0 (text-to-audio with voices) ───────
  "bytedance/seed-audio-1.0": [
    {
      key: "voice",
      type: "select",
      label: "Voice (optional)",
      options: [
        { value: "", label: "None (auto)" },
        { value: "vivi_mixed_en_zh_ja_es_id", label: "Vivi — multilingual" },
        { value: "mindy_en_es_id_pt_zh", label: "Mindy — multilingual" },
        { value: "kian_en_zh", label: "Kian — EN/ZH male" },
        { value: "cedric_en_zh", label: "Cedric — EN/ZH male" },
        { value: "sophie_en_zh", label: "Sophie — EN/ZH female" },
        { value: "jean_en_zh", label: "Jean — EN/ZH female" },
        { value: "magnus_en_zh", label: "Magnus — EN/ZH male" },
        { value: "mabel_en_zh", label: "Mabel — EN/ZH female" },
        { value: "nadia_en_zh", label: "Nadia — EN/ZH female" },
        { value: "opal_en_zh", label: "Opal — EN/ZH female" },
        { value: "pearl_en_zh", label: "Pearl — EN/ZH female" },
        { value: "quentin_en_zh", label: "Quentin — EN/ZH male" },
        { value: "corinne_mixed_en_zh", label: "Corinne — mixed EN/ZH" },
        { value: "esther_mixed_en_zh", label: "Esther — mixed EN/ZH" },
        { value: "lyla_mixed_en_zh", label: "Lyla — mixed EN/ZH" },
        { value: "tracy_es_zh", label: "Tracy — ES/ZH" },
        { value: "sandy_es_mixed_en_zh", label: "Sandy — ES/EN/ZH" },
        { value: "felix_zh", label: "Felix — ZH male" },
        { value: "celeste_zh", label: "Celeste — ZH female" },
        { value: "monkey_king_zh", label: "Monkey King — ZH character" },
      ],
      default: "",
    },
    {
      key: "output_format",
      type: "select",
      label: "Format",
      options: [
        { value: "mp3", label: "MP3" },
        { value: "wav", label: "WAV" },
        { value: "pcm", label: "PCM" },
        { value: "ogg_opus", label: "Ogg Opus" },
      ],
      default: "mp3",
    },
    {
      key: "sample_rate",
      type: "select",
      label: "Sample rate",
      options: [
        { value: "16000", label: "16 kHz" },
        { value: "24000", label: "24 kHz" },
        { value: "32000", label: "32 kHz" },
        { value: "44100", label: "44.1 kHz" },
        { value: "48000", label: "48 kHz" },
      ],
      default: "24000",
    },
    { key: "speed", type: "slider", label: "Speed", min: 0.5, max: 2, step: 0.05, default: 1 },
    { key: "volume", type: "slider", label: "Volume", min: 0.5, max: 2, step: 0.05, default: 1 },
    { key: "pitch", type: "slider", label: "Pitch (semitones)", min: -12, max: 12, step: 1, default: 0 },
  ],

  // ── ByteDance Seed-Speech TTS v2 ───────────────────────────────
  "fal-ai/bytedance/seed-speech/tts/v2": [
    {
      key: "voice",
      type: "select",
      label: "Voice",
      options: [
        { value: "stokie_en", label: "Stokie — EN" },
        { value: "dacey_en", label: "Dacey — EN" },
        { value: "tim_en", label: "Tim — EN" },
        { value: "vivi_mixed_en_zh_ja_es_id", label: "Vivi — multilingual" },
        { value: "mindy_en_es_id_pt_zh", label: "Mindy — multilingual" },
        { value: "kian_en_zh", label: "Kian — EN/ZH" },
        { value: "cedric_en_zh", label: "Cedric — EN/ZH" },
        { value: "sophie_en_zh", label: "Sophie — EN/ZH" },
        { value: "jean_en_zh", label: "Jean — EN/ZH" },
        { value: "magnus_en_zh", label: "Magnus — EN/ZH" },
        { value: "mabel_en_zh", label: "Mabel — EN/ZH" },
        { value: "nadia_en_zh", label: "Nadia — EN/ZH" },
        { value: "opal_en_zh", label: "Opal — EN/ZH" },
        { value: "pearl_en_zh", label: "Pearl — EN/ZH" },
        { value: "quentin_en_zh", label: "Quentin — EN/ZH" },
        { value: "vienna_mixed_en_zh", label: "Vienna — mixed EN/ZH" },
        { value: "alina_mixed_en_zh", label: "Alina — mixed EN/ZH" },
        { value: "corinne_mixed_en_zh", label: "Corinne — mixed EN/ZH" },
        { value: "esther_mixed_en_zh", label: "Esther — mixed EN/ZH" },
        { value: "freya_mixed_en_zh", label: "Freya — mixed EN/ZH" },
        { value: "gigi_mixed_en_zh", label: "Gigi — mixed EN/ZH" },
        { value: "holly_mixed_en_zh", label: "Holly — mixed EN/ZH" },
        { value: "lyla_mixed_en_zh", label: "Lyla — mixed EN/ZH" },
        { value: "daisy_mixed_en_zh", label: "Daisy — mixed EN/ZH" },
        { value: "sven_de", label: "Sven — German" },
        { value: "minimi_ja", label: "Minimi — Japanese" },
        { value: "usseau_fr", label: "Usseau — French" },
        { value: "felipe_es", label: "Felipe — Spanish" },
        { value: "han_id", label: "Han — Indonesian" },
        { value: "martins_pt", label: "Martins — Portuguese" },
        { value: "enzo_it", label: "Enzo — Italian" },
        { value: "shane_ko", label: "Shane — Korean" },
        { value: "bonnie_zh", label: "Bonnie — ZH" },
        { value: "felix_zh", label: "Felix — ZH" },
        { value: "celeste_zh", label: "Celeste — ZH" },
        { value: "monkey_king_zh", label: "Monkey King — ZH character" },
      ],
      default: "stokie_en",
    },
    {
      key: "language",
      type: "select",
      label: "Language",
      options: [
        { value: "", label: "Auto-detect" },
        { value: "en", label: "English" },
        { value: "zh", label: "Chinese" },
        { value: "ja", label: "Japanese" },
        { value: "es-mx", label: "Spanish (MX)" },
        { value: "pt-br", label: "Portuguese (BR)" },
        { value: "id", label: "Indonesian" },
        { value: "ko", label: "Korean" },
        { value: "it", label: "Italian" },
        { value: "de", label: "German" },
        { value: "fr", label: "French" },
      ],
      default: "",
    },
    {
      key: "output_format",
      type: "select",
      label: "Format",
      options: [
        { value: "mp3", label: "MP3" },
        { value: "opus", label: "Opus" },
      ],
      default: "mp3",
    },
    {
      key: "sample_rate",
      type: "select",
      label: "Sample rate",
      options: [
        { value: "16000", label: "16 kHz" },
        { value: "22050", label: "22.05 kHz" },
        { value: "24000", label: "24 kHz" },
        { value: "32000", label: "32 kHz" },
        { value: "44100", label: "44.1 kHz" },
        { value: "48000", label: "48 kHz" },
      ],
      default: "24000",
    },
    { key: "speed", type: "slider", label: "Speed", min: 0.5, max: 2, step: 0.05, default: 1 },
    { key: "volume", type: "slider", label: "Volume", min: 0.5, max: 2, step: 0.05, default: 1 },
    { key: "pitch", type: "slider", label: "Pitch (semitones)", min: -12, max: 12, step: 1, default: 0 },
  ],
};

export function paramsFor(model: string): ParamControl[] {
  return MODEL_PARAMS[model] ?? [];
}

export function defaultValuesFor(
  model: string,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const p of paramsFor(model)) out[p.key] = p.default;
  return out;
}

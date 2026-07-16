// Rich "showcase" content for select apps. When a skill id has an entry
// here, the apps middle column renders <AppShowcase /> instead of the
// default <HowItWorksV2 />. Build these progressively per app.

import seedanceHero from "@/assets/showcases/seedance-hero.mp4.asset.json";
import seedanceMiniHero from "@/assets/showcases/seedance-mini-hero.mp4.asset.json";
import worldCup1 from "@/assets/showcases/world-cup-brazil-1.mp4.asset.json";
import worldCup2 from "@/assets/showcases/world-cup-brazil-2.mp4.asset.json";
import worldCup3 from "@/assets/showcases/world-cup-brazil-3.mp4.asset.json";
import worldCup4 from "@/assets/showcases/world-cup-netherlands.mp4.asset.json";
import worldCupBodyPaint from "@/assets/showcases/world-cup-usa-bodypaint.mp4.asset.json";
import worldCupFeature1 from "@/assets/showcases/world-cup-feature-1.mp4.asset.json";
import worldCupFeature2 from "@/assets/showcases/world-cup-feature-2.mp4.asset.json";
import animeWc1 from "@/assets/showcases/anime-wc-1.mp4.asset.json";
import animeWc2 from "@/assets/showcases/anime-wc-2.mp4.asset.json";
import animeWc3 from "@/assets/showcases/anime-wc-3.mp4.asset.json";
import animeWc4 from "@/assets/showcases/anime-wc-4.mp4.asset.json";
import animeWc5 from "@/assets/showcases/anime-wc-5.mp4.asset.json";
import animeWc6 from "@/assets/showcases/anime-wc-6.mp4.asset.json";
import animeWc7 from "@/assets/showcases/anime-wc-7.mp4.asset.json";
import animeWcHero from "@/assets/anime-world-cup-hero.mp4.asset.json";
import { DIRECTOR_SUITE_VIDEOS, INFLUENCER_VIDEOS, MADE_WITH_PIKA_VIDEOS, MARKETING_VIDEOS } from "@/lib/sample-videos";

export type ShowcaseFeature = {
  title: string;
  body: string;
  mediaUrl: string;
  mediaKind: "video" | "image";
};

export type ShowcaseExample = {
  prompt: string;
  mediaUrl: string;
};

export type ShowcaseFaq = {
  question: string;
  answer: string;
};

export type ShowcaseStep = {
  title: string;
  body: string;
};

export type AppShowcase = {
  eyebrow: string;
  title: string;
  subtitle: string;
  heroVideoUrl: string;
  highlights: { label: string; value: string }[];
  features: ShowcaseFeature[];
  useCases: { title: string; body: string }[];
  examples: ShowcaseExample[];
  howItWorks?: { title: string; steps: ShowcaseStep[] };
  faqs?: ShowcaseFaq[];
};

export const APP_SHOWCASES: Record<string, AppShowcase> = {
  "app-character-creator": {
    eyebrow: "Pika Special App",
    title: "Character Creator",
    subtitle:
      "Design a consistent character once, then summon them in any pose, angle, outfit and expression — always on a clean white background, ready to drop into any scene, ad or short film.",
    heroVideoUrl:
      "https://cdn.openart.ai/openart-strapi-assets/Hero_8814511bf0_1080p/Hero_8814511bf0_1080p.mp4",
    howItWorks: {
      title: "Build a character you can re-use anywhere",
      steps: [
        {
          title: "Start from a photo or prompt",
          body: "Upload a reference or describe the character in one line.",
        },
        {
          title: "Lock the look",
          body: "Pin face, hair and wardrobe as a single identity.",
        },
        {
          title: "Pick style, angle & expression",
          body: "Re-roll variations — front, profile, smiling, mid-action.",
        },
        {
          title: "Export or send to other apps",
          body: "Save a sheet, or pipe straight into I2V, Short Film or Ads.",
        },
      ],
    },

    highlights: [
      { label: "Background", value: "Pure white" },
      { label: "Angles", value: "Front · 3/4 · profile · back" },
      { label: "Identity", value: "Locked across shots" },
      { label: "Hand-off", value: "I2V · Short Film · Ads" },
    ],
    features: [
      {
        title: "One identity, infinite shots",
        body: "Lock face, hair and wardrobe from a single reference. Re-generate the same character in any pose, angle or outfit and they stay recognizable — no more 'cousin of the character' problem on shot 4.",
        mediaUrl:
          "https://cdn.openart.ai/openart-strapi-assets/3_30_2_9dbe92dae8_720p/3_30_2_9dbe92dae8_720p.mp4",
        mediaKind: "video",
      },
      {
        title: "Clean white background, every time",
        body: "Outputs land on a pure white background so you can mask, composite and drop the character into any scene, product shot or storyboard without extra cleanup.",
        mediaUrl:
          "https://stream.mux.com/zzFP116BRnk02fb9yEovU65aoyFKetEsiDM3zxnk00lPA.m3u8",
        mediaKind: "video",
      },
      {
        title: "Style, angle and expression on demand",
        body: "Dial in the visual style — photoreal, anime, claymation, 3D — then pick the camera angle and an expression. Generate a full character sheet in a single pass instead of fighting prompts shot by shot.",
        mediaUrl:
          "https://cdn.openart.ai/openart-strapi-assets/openart_video_494fdf2e_1770794029700_6afb47d825_1080p/openart_video_494fdf2e_1770794029700_6afb47d825_1080p.mp4",
        mediaKind: "video",
      },
      {
        title: "Plugs straight into the rest of Pika",
        body: "Send your locked character into Image-to-Video to animate them, into Short Film Studio as the lead, or into Product Ad as the spokesperson. The same identity carries across every app.",
        mediaUrl:
          "https://stream.mux.com/vSDkd9NnRJ029bxFjA701dMgviepuuRdx01aBT76AgL8pY.m3u8",
        mediaKind: "video",
      },
    ],
    useCases: [
      {
        title: "Recurring brand mascots & spokespeople",
        body: "Design a face for the brand once and reuse them across every ad, explainer and social post — without re-casting or re-shooting.",
      },
      {
        title: "Short film & series leads",
        body: "Lock your protagonist before you storyboard. Every shot in the film inherits the same person, wardrobe and look.",
      },
      {
        title: "Game & comic character design",
        body: "Spin up a full turnaround sheet — front, three-quarter, profile, back — in minutes, ready for concept review or downstream rigging.",
      },
      {
        title: "Influencer & UGC personas",
        body: "Build a consistent digital creator with a defined face and style, then post a steady drip of in-character content without booking a person.",
      },
    ],
    examples: [
      {
        prompt:
          "Young woman with auburn curls, freckles, cream linen shirt — front-facing portrait, soft daylight, clean white background.",
        mediaUrl:
          "https://cdn.openart.ai/openart-strapi-assets/3_30_2_9dbe92dae8_720p/3_30_2_9dbe92dae8_720p.mp4",
      },
      {
        prompt:
          "Same character, three-quarter angle, slight smile, neutral wardrobe — keep the face identical to the reference.",
        mediaUrl: INFLUENCER_VIDEOS[0],
      },
      {
        prompt:
          "Stylized anime version of the same character, dynamic action pose, clean white background, sheet-ready.",
        mediaUrl:
          "https://cdn.openart.ai/openart-strapi-assets/openart_video_494fdf2e_1770794029700_6afb47d825_1080p/openart_video_494fdf2e_1770794029700_6afb47d825_1080p.mp4",
      },
      {
        prompt:
          "Recurring digital creator persona — talking to camera in a soft-lit bedroom, identity locked across every post.",
        mediaUrl: INFLUENCER_VIDEOS[2],
      },
      {
        prompt:
          "Full body turnaround of a brand mascot — friendly robot in pastel colors, four angles on a single sheet.",
        mediaUrl:
          "https://stream.mux.com/qyYLnHqboE7mTjVjbTl01WJkBqKfxqlCkdaTdGXAZzCk.m3u8",
      },
      {
        prompt:
          "Same persona holding a product, three-quarter angle, warm smile — ready to drop into a Reels ad.",
        mediaUrl: INFLUENCER_VIDEOS[3],
      },
    ],

    faqs: [
      {
        question: "Can I use a real person as a reference?",
        answer:
          "Yes — upload a clear photo (yourself, an actor, a model) and the app will lock that identity. Only use likenesses you have the right to use.",
      },
      {
        question: "How consistent is the character across shots?",
        answer:
          "Very consistent. Face, hair and proportions are pinned to your reference, so re-generating new angles, outfits or expressions keeps the same person rather than a similar-looking one.",
      },
      {
        question: "Why is the background always white?",
        answer:
          "Clean white backgrounds make masking and compositing trivial. You can drop the character into any scene, product shot or video without spending time cutting them out.",
      },
      {
        question: "Can I animate the character?",
        answer:
          "Yes. Send any generated character straight into Image-to-Video, Short Film Studio or Product Ad and the same locked identity carries through.",
      },
      {
        question: "Do I need to re-create the character every session?",
        answer:
          "No. Save the character to your library and re-use it across projects and other Pika apps whenever you need them on screen.",
      },
    ],
  },

  "model-seedance-2": {
    eyebrow: "Bytedance Flaship Model",
    title: "Seedance 2.0 Video Generator",
    subtitle:
      "Turn ideas, photos and clips into high-impact 1080p AI videos. Multimodal control, consistent characters and cinematic motion — in one model.",
    heroVideoUrl: seedanceHero.url,
    howItWorks: {
      title: "Easily generate videos up to 15 sec",
      steps: [
        {
          title: "Input image reference",
          body: "Upload reference images to guide your vision.",
        },
        {
          title: "Write the prompt",
          body: "Use natural language to describe desired scenario and sounds.",
        },
        {
          title: "Generate with Seedance 2.0",
          body: "Click \"Generate\" and receive a high-fidelity video in seconds.",
        },
      ],
    },
    highlights: [
      { label: "Resolution", value: "Up to 1080p" },
      { label: "Duration", value: "5 – 12s" },
      { label: "Refs / project", value: "9 img · 3 vid · 3 audio" },
      { label: "Aspect ratios", value: "16:9 · 9:16 · 1:1" },
    ],
    features: [
      {
        title: "Advanced multimodal reference input",
        body: "Combine up to 9 images, 3 videos and 3 audio clips per project. Seedance 2.0 learns effects, camera moves, actions and editing styles — and replicates complex or popular scenes with a single click while keeping characters consistent.",
        mediaUrl: "https://stream.mux.com/T3MxHKsagNzekzmQK4dWkxm01bAW00Rki7Kzg6odj4rIQ.m3u8",
        mediaKind: "video",
      },
      {
        title: "Precise control for effortless creation",
        body: "Reproduce character details, composition and sound from your references. Unify font styles and precisely control pace and rhythm so scene transitions feel natural — the full creative process stays controllable and convenient.",
        mediaUrl: "https://stream.mux.com/gnsO5v2XqzW8KnuLDtAPXctofug00Yzz00k006sbUyZjpQ.m3u8",
        mediaKind: "video",
      },
      {
        title: "Seamless multi-camera storytelling",
        body: "Generate new storylines or continue existing videos with natural plot and shot connection. Audio-visual sync stays tight in single- and multi-person scenes — narration, environmental SFX and visuals locked together for real cinematic feel.",
        mediaUrl: "https://stream.mux.com/vAEakae6R9rsfPZ8M9zKbC2epGJEDycCDVYl3Gi45mU.m3u8",
        mediaKind: "video",
      },
      {
        title: "End-to-end AI video creation",
        body: "From concept to final cut in one place — storyboard with image models, plan shots and scenes, bring characters to life with lifelike digital humans. Story, visuals and scenes work together as a complete one-stop solution.",
        mediaUrl: "https://stream.mux.com/EzMLWiHVPypfpM4oWuBXqlC7o3X8gUJ6OVur8ILLOik.m3u8",
        mediaKind: "video",
      },
    ],
    useCases: [
      {
        title: "Creators & social content",
        body: "Produce distinctive short videos, animations and music videos. Use image, video, audio and text references to guide action, camera work and composition — ideal for social, storytelling and UGC.",
      },
      {
        title: "Brand campaigns & marketing",
        body: "Make product demos, hero videos and promo content that preserve logos, packaging, color grading and continuity. Spin up fast cross-platform variations without a complex production pipeline.",
      },
      {
        title: "Film, game & creative previz",
        body: "Turn storyboards, sketches or rough clips into cinematic previews with accurate motion, lighting and continuity. Perfect for previsualizing shots and planning multi-scene sequences before full production.",
      },
      {
        title: "Creative & interactive design",
        body: "Animate comics, bring game IP to life, and test effects, camera moves and voice-driven characters for rapid prototyping and design iteration.",
      },
    ],
    examples: [
      {
        prompt:
          "A cinematic shot of a man in black fleeing at high speed through a crowded street, the camera tracking behind him as he knocks over a fruit stand and keeps running.",
        mediaUrl: "https://stream.mux.com/77OFfce6RtUsHBXdRS8QObyOpJkJ6Z02x1ilJUmGWZNA.m3u8",
      },
      {
        prompt:
          "Slow drone push-in over a neon Tokyo alley at night, soft rain on the pavement, anamorphic lens, 16:9, 1080p.",
        mediaUrl: "https://stream.mux.com/T3MxHKsagNzekzmQK4dWkxm01bAW00Rki7Kzg6odj4rIQ.m3u8",
      },
      {
        prompt:
          "A young woman turns to camera and smiles in golden-hour backlight, hair catching the wind, soft bokeh background.",
        mediaUrl: "https://stream.mux.com/gnsO5v2XqzW8KnuLDtAPXctofug00Yzz00k006sbUyZjpQ.m3u8",
      },
      {
        prompt:
          "Macro shot of a coffee being poured into a glass cup, slow motion, dramatic lighting on a dark wood table.",
        mediaUrl: "https://stream.mux.com/vAEakae6R9rsfPZ8M9zKbC2epGJEDycCDVYl3Gi45mU.m3u8",
      },
    ],
    faqs: [
      {
        question: "What is Seedance 2.0?",
        answer:
          "Seedance 2.0 is a multimodal video generation model. You can use text, images, video clips and audio as inputs and produce multi-shot video sequences with built-in sound design.",
      },
      {
        question: "What plan do I need to use Seedance 2.0?",
        answer:
          "Seedance 2.0 is available on all paid and Enterprise plans. Free plan users can upgrade to get access.",
      },
      {
        question: "Is Seedance 2.0 available in my country?",
        answer: "Yes. Seedance 2.0 is available worldwide.",
      },
      {
        question: "What inputs does Seedance 2.0 support?",
        answer:
          "You can use text prompts, reference images, video clips, audio clips or any combination of these. The model will use your references to create a video that fits what you're looking for.",
      },
      {
        question: "How long can generated videos be?",
        answer:
          "Individual generations can be up to 15 seconds long. You can choose your preferred duration, aspect ratio and resolution before generating.",
      },
      {
        question: "What other models are available?",
        answer:
          "You get access to the world's leading image, video and audio models, all in one place — including third-party models like Kling 3.0, Veo 3.1, WAN 2.2 and more.",
      },
    ],
  },
  "model-seedance-2-mini": {
    eyebrow: "Bytedance · Fast & Affordable",
    title: "Seedance 2.0 Mini",
    subtitle:
      "The same ByteDance engine as Seedance 2.0 — tuned for speed and ~3x lower cost. Iterate fast on ideas, ship more variations, then upgrade the keeper to full Seedance 2.0.",
    heroVideoUrl: seedanceMiniHero.url,
    howItWorks: {
      title: "Iterate fast, then upgrade",
      steps: [
        {
          title: "Prompt or drop a reference",
          body: "Type a description or add reference images. Mini accepts the same multimodal inputs as full Seedance 2.0.",
        },
        {
          title: "Generate in seconds",
          body: "Mini runs significantly faster and cheaper — great for exploring directions, A/B testing prompts and burning through ideas.",
        },
        {
          title: "Upgrade the winners",
          body: "Found a shot you love? Re-run it on full Seedance 2.0 for 1080p, max detail and the final master.",
        },
      ],
    },
    highlights: [
      { label: "Resolution", value: "480p · 720p" },
      { label: "Duration", value: "4 – 15s" },
      { label: "Aspect ratios", value: "16:9 · 9:16 · 1:1 · 21:9 · 4:3 · 3:4" },
      { label: "Cost vs Seedance 2.0", value: "~3x cheaper" },
    ],
    features: [
      {
        title: "Same model family, faster turnarounds",
        body: "Mini shares the ByteDance Seedance backbone — cinematic motion, prompt fidelity and audio sync — at a fraction of the latency and cost. Built for rapid prototyping and high-volume generation.",
        mediaUrl: seedanceMiniHero.url,
        mediaKind: "video",
      },
      {
        title: "Text-to-video and image-to-video",
        body: "Generate from a prompt, or animate one or more reference images. Same controls you already know: aspect ratio, duration, resolution and audio toggle.",
        mediaUrl: "https://stream.mux.com/T3MxHKsagNzekzmQK4dWkxm01bAW00Rki7Kzg6odj4rIQ.m3u8",
        mediaKind: "video",
      },
      {
        title: "Audio baked in",
        body: "Generations come with ambient sound, foley and voice when relevant — no second pass required. Toggle audio off when you want a clean plate.",
        mediaUrl: "https://stream.mux.com/vAEakae6R9rsfPZ8M9zKbC2epGJEDycCDVYl3Gi45mU.m3u8",
        mediaKind: "video",
      },
      {
        title: "Seamless upgrade path",
        body: "When a Mini result clicks, promote it to full Seedance 2.0 for 1080p and maximum fidelity. Same prompt, same references — just the final master pass.",
        mediaUrl: "https://stream.mux.com/gnsO5v2XqzW8KnuLDtAPXctofug00Yzz00k006sbUyZjpQ.m3u8",
        mediaKind: "video",
      },
    ],
    useCases: [
      {
        title: "Rapid prompt exploration",
        body: "Burn through 10–20 directions in the time it takes to render one full-quality shot. Find the winning concept before you commit credits.",
      },
      {
        title: "High-volume social content",
        body: "Spin up dozens of short videos for TikTok, Reels and Shorts — vertical, square or wide — without blowing your monthly budget.",
      },
      {
        title: "Storyboarding & previz",
        body: "Sketch out scenes for short films, ads and music videos before locking the final render. Quick, cheap, directionally accurate.",
      },
      {
        title: "Agent & batch workflows",
        body: "Ideal for automated pipelines and Agent Mode skills that need many fast generations rather than one hero shot.",
      },
    ],
    examples: [
      {
        prompt:
          "Slow drone push-in over a neon Tokyo alley at night, soft rain on the pavement, anamorphic lens.",
        mediaUrl: seedanceMiniHero.url,
      },
      {
        prompt:
          "A cinematic shot of a man in black fleeing at high speed through a crowded street.",
        mediaUrl: "https://stream.mux.com/77OFfce6RtUsHBXdRS8QObyOpJkJ6Z02x1ilJUmGWZNA.m3u8",
      },
      {
        prompt:
          "Macro shot of coffee being poured into a glass cup, slow motion, dramatic lighting.",
        mediaUrl: "https://stream.mux.com/vAEakae6R9rsfPZ8M9zKbC2epGJEDycCDVYl3Gi45mU.m3u8",
      },
      {
        prompt:
          "A young woman turns to camera and smiles in golden-hour backlight, hair catching the wind.",
        mediaUrl: "https://stream.mux.com/gnsO5v2XqzW8KnuLDtAPXctofug00Yzz00k006sbUyZjpQ.m3u8",
      },
    ],
    faqs: [
      {
        question: "How is Mini different from Seedance 2.0?",
        answer:
          "Mini is the same ByteDance model family, tuned for speed and ~3x lower cost. Max output is 720p (vs 1080p on full Seedance 2.0), but motion quality, prompt fidelity and audio sync stay close to the flagship.",
      },
      {
        question: "When should I use Mini vs full Seedance 2.0?",
        answer:
          "Use Mini when you're exploring ideas, A/B testing prompts, or producing high volumes of social content. Switch to full Seedance 2.0 for the final master, hero shots, or anything needing 1080p.",
      },
      {
        question: "What inputs does Mini support?",
        answer:
          "Text-to-video and reference-to-video (one or more images). You control resolution, aspect ratio, duration and whether to generate audio.",
      },
      {
        question: "What plan do I need?",
        answer:
          "Mini is available on all paid plans. Free users can upgrade to unlock it alongside the rest of the Seedance family.",
      },
    ],
  },
  "app-short-film": {
    eyebrow: "Pika Special App",
    title: "Short Film Studio",
    subtitle:
      "Go from a one-line idea to a finished short film — script, shot list, voiceover, score and final cut, all assembled on your timeline. A guided five-step wizard that directs the whole production for you.",
    heroVideoUrl: DIRECTOR_SUITE_VIDEOS[0],
    howItWorks: {
      title: "From logline to finished cut in five steps",
      steps: [
        {
          title: "Pitch your story",
          body: "Type a logline, pick a genre, length and tone. The studio drafts a beat sheet you can edit before anything is shot.",
        },
        {
          title: "Write the script",
          body: "An AI screenwriter turns the beats into a scene-by-scene script with dialogue, action lines and a narrator pass.",
        },
        {
          title: "Build the storyboard",
          body: "Each scene becomes a shot with a prompt, aspect ratio and reference look. Reroll any frame until the boards feel right.",
        },
        {
          title: "Render shots, VO & score",
          body: "Hit produce and the studio renders every shot, records the voiceover and composes an original score in parallel.",
        },
        {
          title: "Land on the timeline",
          body: "Clips, narration and music drop into your project timeline in order — ready to trim, swap or export.",
        },
      ],
    },
    highlights: [
      { label: "Length", value: "30s – 3 min" },
      { label: "Shots", value: "Up to 24" },
      { label: "Aspect", value: "16:9 · 9:16 · 1:1" },
      { label: "Output", value: "Timeline-ready" },
    ],
    features: [
      {
        title: "A director's room, on rails",
        body: "The wizard walks you through pitch → script → boards → production in clear steps. You can jump back any time to tweak a beat, rewrite a line or reshoot a frame without losing the rest of your film.",
        mediaUrl: DIRECTOR_SUITE_VIDEOS[1],
        mediaKind: "video",
      },
      {
        title: "Consistent characters and look",
        body: "Lock a character, a palette and a camera language up front. Every shot inherits the same wardrobe, lighting and lens so your film feels like one piece, not a stack of clips.",
        mediaUrl: DIRECTOR_SUITE_VIDEOS[2],
        mediaKind: "video",
      },
      {
        title: "Voiceover and score, in one pass",
        body: "Pick a narrator voice and a musical direction and the studio generates VO and an original score that matches the cut. Both land on the timeline on their own tracks, perfectly placed.",
        mediaUrl: DIRECTOR_SUITE_VIDEOS[4],
        mediaKind: "video",
      },
      {
        title: "Everything ends up on the timeline",
        body: "There is no \"download and re-import\" step. Shots, narration and music append themselves to your project so you can iterate, swap a single take, or export the film as one render.",
        mediaUrl: DIRECTOR_SUITE_VIDEOS[3],
        mediaKind: "video",
      },
    ],
    useCases: [
      {
        title: "Pitch films & sizzle reels",
        body: "Turn a logline into a one-minute proof-of-concept you can send to collaborators, festivals or investors the same afternoon.",
      },
      {
        title: "Music videos & visual poems",
        body: "Drop a track or a poem, pick a tone, and get a fully scored short cut to the beat — perfect for releases and visualizers.",
      },
      {
        title: "Brand & founder stories",
        body: "Tell the origin story of a product or a company as a short narrative film, not another talking-head explainer.",
      },
      {
        title: "Episodic experiments",
        body: "Spin up self-contained 60–90 second episodes with recurring characters and a consistent world — ideal for serialized social drops.",
      },
    ],
    examples: [
      {
        prompt:
          "A lonely lighthouse keeper befriends a glowing creature from the sea. Three acts, melancholic, 90 seconds, 16:9, orchestral score.",
        mediaUrl: DIRECTOR_SUITE_VIDEOS[5],
      },
      {
        prompt:
          "Documentary-style short about a hamster running an underground noodle shop in the Backrooms. Deadpan narrator, handheld camera.",
        mediaUrl: DIRECTOR_SUITE_VIDEOS[2],
      },
      {
        prompt:
          "45-second cinematic ad for a fictional electric motorcycle brand called VOLT. Neon Tokyo at night, no dialogue, driving synth score.",
        mediaUrl: DIRECTOR_SUITE_VIDEOS[6],
      },
      {
        prompt:
          "A claymation-style short about a tiny astronaut who finds a garden on a dead planet. Whimsical, soft piano, 60 seconds.",
        mediaUrl: DIRECTOR_SUITE_VIDEOS[7],
      },
      {
        prompt:
          "A Silicon Valley NPC realises he's stuck in a loop of standup meetings. Mockumentary tone, dry narrator, 75 seconds.",
        mediaUrl: DIRECTOR_SUITE_VIDEOS[3],
      },
      {
        prompt:
          "Surreal vignette: a man wakes up and every object in his apartment is also him. Voiceover monologue, ambient score, 60 seconds.",
        mediaUrl: MADE_WITH_PIKA_VIDEOS[4],
      },
    ],
    faqs: [
      {
        question: "How long does a short film take to produce?",
        answer:
          "Most 60–90 second films render in a few minutes once you hit produce. Longer films with more shots take proportionally longer because each shot is generated individually.",
      },
      {
        question: "Can I edit the script or storyboard before producing?",
        answer:
          "Yes. The wizard pauses after the script and again after the storyboard. You can rewrite lines, reroll a shot, change an aspect ratio or swap a reference image before committing to the final render.",
      },
      {
        question: "Where does the finished film end up?",
        answer:
          "Every shot, the voiceover and the score are appended directly to your project's timeline in the correct order. You can re-arrange, trim or replace any clip, then export the full film as a single video.",
      },
      {
        question: "Can I keep characters consistent across shots?",
        answer:
          "Yes. Lock a reference image for your main character (or use a saved Character) and the studio carries that look across every shot in the storyboard.",
      },
      {
        question: "Can I iterate after the film is rendered?",
        answer:
          "Absolutely. Re-open the Short Film app on the same project to tweak the brief, rewrite a scene or re-render a single shot. New takes drop back onto the timeline so you can A/B them against the original.",
      },
      {
        question: "What aspect ratios and lengths are supported?",
        answer:
          "16:9, 9:16 and 1:1, anywhere from a 30-second teaser up to a roughly 3-minute short. You pick this in the pitch step and every shot inherits it.",
      },
    ],
  },
  "app-special-product-ad": {
    eyebrow: "Pika Special App",
    title: "Product Ad Studio",
    subtitle:
      "Turn a product photo and a one-line brief into a finished, on-brand ad — concept, shot list, hero stills, voiceover and final cut, assembled on your timeline. A guided five-step wizard that directs the whole spot for you.",
    heroVideoUrl: MARKETING_VIDEOS[0],
    howItWorks: {
      title: "From product photo to finished ad in five steps",
      steps: [
        {
          title: "Drop in your product",
          body: "Upload one clean product photo (or pick one from your library). Pika locks in geometry, color and packaging so every shot keeps the product on-brand.",
        },
        {
          title: "Write the brief",
          body: "Type the value prop, audience and tone. The studio drafts a concept and shot list you can edit before anything is rendered.",
        },
        {
          title: "Lock the look",
          body: "Pick a palette, lighting style and aspect ratio. Reroll the hero frame until the boards match the campaign mood.",
        },
        {
          title: "Render shots, VO & music",
          body: "Hit produce and the studio renders every shot, records the voiceover and scores a music bed in parallel.",
        },
        {
          title: "Land on the timeline",
          body: "Clips, narration and music drop into your project timeline in order — ready to trim, swap captions or export for paid, organic and email.",
        },
      ],
    },
    highlights: [
      { label: "Length", value: "6s – 60s" },
      { label: "Shots", value: "Up to 8" },
      { label: "Aspect", value: "16:9 · 9:16 · 1:1" },
      { label: "Output", value: "Timeline-ready" },
    ],
    features: [
      {
        title: "Your product, kept on-model",
        body: "Lock packaging, logo, color and silhouette from a single reference photo. Every shot in the spot keeps the SKU recognizable — no more 'AI got the bottle wrong' notes from the brand team.",
        mediaUrl: MARKETING_VIDEOS[0],
        mediaKind: "video",
      },
      {
        title: "A creative director on rails",
        body: "The wizard walks you through brief → concept → boards → production in clear steps. Jump back any time to tweak the hook, change the audience or reshoot a frame without losing the rest of the cut.",
        mediaUrl: MARKETING_VIDEOS[1],
        mediaKind: "video",
      },
      {
        title: "Endless variants for every channel",
        body: "Re-run the same brief at 16:9 for YouTube, 9:16 for Reels and 1:1 for feed — or fork the concept into five hooks for your media buyer to test. Variant cost is measured in cents, not days.",
        mediaUrl: MARKETING_VIDEOS[2],
        mediaKind: "video",
      },
      {
        title: "Voiceover and music, in one pass",
        body: "Pick a narrator voice and a music direction and the studio generates VO plus an original royalty-free bed that matches the cut. Both land on their own timeline tracks, perfectly placed.",
        mediaUrl: MARKETING_VIDEOS[3],
        mediaKind: "video",
      },
    ],
    useCases: [
      {
        title: "Paid social & UGC-style ads",
        body: "Spin up native-feeling Meta and TikTok ads from a product photo and a hook. Feed your performance team a steady drip of fresh creative so ROAS stops sliding in week three.",
      },
      {
        title: "Launch & explainer videos",
        body: "Turn a 3–4 sentence value prop into a 15–30s launch clip with voiceover, b-roll and music — homepage, PDP and pre-roll ready the same afternoon.",
      },
      {
        title: "Seasonal & regional refreshes",
        body: "Re-skin the same SKU for summer, holiday or a new region without booking another shoot. Lock the master brief once, regenerate when the calendar flips.",
      },
      {
        title: "Sales decks & enablement",
        body: "Drop in a feature, get a short animated explainer for the deck. The sales team finally stops pasting screenshots into PowerPoint.",
      },
    ],
    examples: [
      {
        prompt:
          "30-second hero ad for a minimalist ceramic coffee dripper. Slow-mo pour, morning light, calm piano bed, voiceover: 'Brew like a barista, at home.'",
        mediaUrl: MARKETING_VIDEOS[0],
      },
      {
        prompt:
          "15-second TikTok ad for a sparkling probiotic soda. Bright UGC energy, fast cuts, hook: 'Three reasons your gut wants this in your fridge.'",
        mediaUrl: MARKETING_VIDEOS[1],
      },
      {
        prompt:
          "20-second launch video for an electric mountain bike called VOLT. Cinematic dusk trail riding, driving synth score, no dialogue, 16:9.",
        mediaUrl: MARKETING_VIDEOS[2],
      },
      {
        prompt:
          "12-second product shot loop for a new fragrance. Macro of the bottle, slow rotation, warm amber light, soft strings, 1:1 feed-ready.",
        mediaUrl: MARKETING_VIDEOS[3],
      },
      {
        prompt:
          "45-second explainer for a B2B analytics dashboard. Animated UI walkthrough, friendly narrator, upbeat indie bed, captions burned in.",
        mediaUrl: MARKETING_VIDEOS[4],
      },
      {
        prompt:
          "9:16 Reels ad for a running shoe drop. Street-style talent unboxing, kinetic captions, hook: 'The lightest trainer we've ever shipped.'",
        mediaUrl: MARKETING_VIDEOS[5],
      },
    ],
    faqs: [
      {
        question: "How long does a product ad take to produce?",
        answer:
          "Most 15–30 second spots render in a few minutes once you hit produce. Longer cuts or multi-aspect variants take proportionally longer because each shot is generated individually.",
      },
      {
        question: "Can I edit the concept or storyboard before rendering?",
        answer:
          "Yes. The wizard pauses after the concept and again after the storyboard. You can rewrite the hook, swap the voiceover script, reroll a frame or change the aspect ratio before committing to the final render.",
      },
      {
        question: "Will the product actually look like my product?",
        answer:
          "Pika locks geometry, color and packaging from your reference photo and carries that across every shot. For tight brand work, upload 2–3 reference angles and the studio will hold the SKU steady.",
      },
      {
        question: "Can I produce vertical and square variants from the same brief?",
        answer:
          "Yes. Re-run the same project at 9:16 and 1:1 — concept, voiceover and music are re-used, only the framing and shot composition are regenerated.",
      },
      {
        question: "What about commercial rights?",
        answer:
          "Outputs are royalty-free for marketing use, including paid social, owned channels and email. Check each model's terms inside the app for regulated industries or talent likeness edge cases.",
      },
      {
        question: "Where does the finished ad end up?",
        answer:
          "Every shot, the voiceover and the music bed are appended directly to your project timeline in order. Trim, swap a take or export the full ad as a single MP4 in any aspect.",
      },
    ],
  },
  "app-pika-lipsync": {
    eyebrow: "Pika Special App",
    title: "Talking Head Studio",
    subtitle:
      "Turn a single portrait and a script into a natural, lip-synced talking clip. Pick a voice, type the line, and ship creator-style UGC, explainers and avatar reads in minutes — not a shoot day.",
    heroVideoUrl: "https://videos.ctfassets.net/91663d1w6kgm/729Gwsd63EuagSeZoqqK5N/ab092d06db6f1e7b86428594066a1330/Web_16_9.mp4",
    howItWorks: {
      title: "From portrait to talking head in four steps",
      steps: [
        {
          title: "Upload a face",
          body: "Drop in a clean front-facing portrait — a real photo, a generated character, or an avatar from your library. Eyes forward, mouth visible.",
        },
        {
          title: "Write the script",
          body: "Type what they should say, or upload your own voice clip. Edit the line as many times as you want before committing to a render.",
        },
        {
          title: "Pick the voice",
          body: "Choose a narrator voice and tone — calm, energetic, warm, authoritative — or bring your own audio for full creative control.",
        },
        {
          title: "Render the talking clip",
          body: "The studio synthesizes speech, syncs the lips and lands the finished MP4 on your project timeline, ready to caption and ship.",
        },
      ],
    },
    highlights: [
      { label: "Input", value: "1 photo · script or audio" },
      { label: "Length", value: "Up to 60s" },
      { label: "Aspect", value: "9:16 · 1:1 · 16:9" },
      { label: "Output", value: "Timeline-ready MP4" },
    ],
    features: [
      {
        title: "Natural lip-sync from one photo",
        body: "Drive a still portrait with any audio and get mouth shapes, micro-expressions and head motion that actually read as a human talking — not a puppet.",
        mediaUrl: INFLUENCER_VIDEOS[0],
        mediaKind: "video",
      },
      {
        title: "Bring your own voice — or pick one",
        body: "Upload a voice clip for full control, or generate the line with a built-in narrator voice. Swap voices on the same script without redoing the visual.",
        mediaUrl: INFLUENCER_VIDEOS[1],
        mediaKind: "video",
      },
      {
        title: "Creator-style UGC at scale",
        body: "Spin up dozens of native-feeling talking-head ads from one face. Test hooks, hooks, hooks — the talent never gets tired, never needs a re-shoot.",
        mediaUrl: INFLUENCER_VIDEOS[2],
        mediaKind: "video",
      },
      {
        title: "Multilingual reads, same face",
        body: "Run the same portrait through scripts in any language with a matching voice — global launches, localized ads and dubbed explainers from a single asset.",
        mediaUrl: INFLUENCER_VIDEOS[3],
        mediaKind: "video",
      },
    ],
    useCases: [
      {
        title: "UGC-style ads",
        body: "Native creator-feeling talking heads for Meta and TikTok — straight-to-camera hooks, testimonials and demos without booking talent.",
      },
      {
        title: "Avatar spokespeople",
        body: "Give your brand a recurring on-camera face. Same character, infinite scripts, consistent delivery across every campaign.",
      },
      {
        title: "Explainers & onboarding",
        body: "Walk users through features, policies or product changes with a friendly face. Update the script the next quarter without re-recording.",
      },
      {
        title: "Localized reads",
        body: "Same portrait, every market. Swap the audio language and ship region-specific cuts without flying anyone anywhere.",
      },
      {
        title: "Training & internal comms",
        body: "Stand up a calm narrator for course modules, SOPs and exec announcements when scheduling a human take would slow the team down.",
      },
      {
        title: "Pitch & sales videos",
        body: "Personalized intro clips for outbound, demo recaps, or founder-led explainers — recorded in the time it takes to write the script.",
      },
    ],
    examples: [
      {
        prompt:
          "Founder-style talking head: 'In 2026, your customers don't want another dashboard — they want answers.' Warm, conversational, 9:16.",
        mediaUrl: INFLUENCER_VIDEOS[0],
      },
      {
        prompt:
          "UGC ad read for a skincare brand: 'I genuinely didn't expect this to clear my skin in two weeks.' Energetic, gen-z, 9:16.",
        mediaUrl: INFLUENCER_VIDEOS[1],
      },
      {
        prompt:
          "Calm narrator for a meditation app onboarding: 'Take a slow breath in. Welcome back.' Soft, soothing, 1:1.",
        mediaUrl: INFLUENCER_VIDEOS[2],
      },
      {
        prompt:
          "Explainer for a B2B fintech: 'Here's how we cut your reconciliation time by 80%.' Confident, professional, 16:9.",
        mediaUrl: INFLUENCER_VIDEOS[3],
      },
      {
        prompt:
          "Localized launch in Spanish: 'Ya está disponible en México — bienvenidos.' Friendly, upbeat, 9:16.",
        mediaUrl: INFLUENCER_VIDEOS[4],
      },
      {
        prompt:
          "Course intro: 'Welcome to Module 3 — today we're talking about retention loops.' Instructor energy, 16:9.",
        mediaUrl: INFLUENCER_VIDEOS[5],
      },
    ],
    faqs: [
      {
        question: "What kind of photo works best?",
        answer:
          "A clean, front-facing portrait with the eyes forward and the mouth fully visible. Good lighting and a neutral expression give the lip-sync model the most to work with. Sunglasses, heavy occlusion or extreme angles can degrade the result.",
      },
      {
        question: "Can I use my own voice instead of a generated one?",
        answer:
          "Yes. Upload an audio clip and the studio will sync the portrait directly to that recording. This is the right path when you need a specific human voice, an accent or a brand spokesperson.",
      },
      {
        question: "How long can a talking clip be?",
        answer:
          "Most renders top out around a minute. For longer formats, break the script into segments and string the clips together on the project timeline.",
      },
      {
        question: "Will it work for non-English scripts?",
        answer:
          "Yes. Pick a voice in the target language (or upload your own audio) and the lip-sync model will match the phonemes. Same portrait, any language.",
      },
      {
        question: "What about commercial rights and likeness?",
        answer:
          "Outputs of generated characters or your own avatars are royalty-free for marketing use. If you upload a real person's photo, you're responsible for having their permission to use their likeness.",
      },
      {
        question: "Where does the finished clip end up?",
        answer:
          "Every render lands on your project timeline as an MP4 — ready to trim, caption, layer with b-roll or export in 9:16, 1:1 or 16:9.",
      },
    ],
  },

  "app-world-cup-2026": {
    eyebrow: "Pika Special App",
    title: "World Cup 2026 Video",
    subtitle:
      "Star in your own FIFA World Cup 2026 broadcast. Upload a selfie, pick your team and your moment, and we cut you straight into the live TV feed — scorebug, crowd, commentary and all — as a finished 10-second clip you can post in minutes.",
    heroVideoUrl: worldCup1.url,
    howItWorks: {
      title: "From selfie to broadcast in three steps",
      steps: [
        {
          title: "Drop in a selfie",
          body: "One clean, front-facing photo. Your face is locked so the broadcast version is unmistakably you — same eyes, same smile, same haircut.",
        },
        {
          title: "Pick your team & moment",
          body: "Choose your national team and the moment you want to live — score the winning goal, get caught on the kiss cam, wave a giant flag, or bust out a halftime dance.",
        },
        {
          title: "We cut you into the feed",
          body: "We render a real-looking broadcast still — scorebug, network logo, packed stadium — then animate it into a 10-second clip with motion and sound. Drops straight onto your timeline, ready to share.",
        },
      ],
    },
    highlights: [
      { label: "Input", value: "1 selfie · 30 seconds" },
      { label: "Length", value: "10s · with sound" },
      { label: "Aspect", value: "16:9 broadcast" },
      { label: "Output", value: "Timeline-ready MP4" },
    ],
    features: [
      {
        title: "Your face, locked into the broadcast",
        body: "Identity stays pinned to your reference photo. The crowd-cam version of you is recognizably you — not a vague lookalike — wearing your team's colors in premium lower-bowl seats.",
        mediaUrl: worldCupFeature1.url,
        mediaKind: "video",
      },
      {
        title: "A real-looking TV feed, not a meme template",
        body: "Authentic broadcast color grading, official-style scorebug, network watermark, match clock, scoreline and a packed, energized stadium. The frame reads as a live TV cutaway, which is what makes the joke land.",
        mediaUrl: worldCupFeature2.url,
        mediaKind: "video",
      },
      {
        title: "Pick your moment, not just your shot",
        body: "Eight pre-baked scenarios — score a goal, kiss cam, spill your drink on the JumboTron, wave the flag, halftime dance — each with its own framing, motion and crowd reaction so the clip feels intentional, not generic.",
        mediaUrl: worldCup3.url,
        mediaKind: "video",
      },
      {
        title: "10 seconds of motion + sound, in one pass",
        body: "We don't stop at the still. Seedance 2.0 animates the broadcast frame into a 10-second clip with crowd noise and stadium ambience baked in — vertical-ready for stories, square for feed, 16:9 for everything else.",
        mediaUrl: worldCup4.url,
        mediaKind: "video",
      },
    ],
    useCases: [
      {
        title: "Group-chat flex",
        body: "Send your friends a 10-second clip of you scoring the winner against their team. The kind of thing screenshots can't compete with.",
      },
      {
        title: "Watch-party reveal",
        body: "Drop a clip of yourself getting kiss-cammed or flag-waving on the broadcast right before kickoff. Instant party trick.",
      },
      {
        title: "Stories & reels",
        body: "Cinema-grade broadcast realism in a 16:9 clip with stadium audio — fits straight into a feed post or story without any cleanup.",
      },
      {
        title: "Fan-club & creator content",
        body: "Run the same selfie through every team color and every moment for a full week of native World Cup content with one shoot.",
      },
    ],
    examples: [
      {
        prompt:
          "Star in the World Cup 2026 — Brazil vs Argentina quarterfinal, score the winning goal in the 78th minute, full broadcast cutaway with scorebug.",
        mediaUrl: worldCup1.url,
      },
      {
        prompt:
          "Brazil vs Argentina — wild celebration when my team scores. Camera finds me in the lower bowl in a Brazil shirt, crowd losing it around me.",
        mediaUrl: worldCup2.url,
      },
      {
        prompt:
          "Brazil vs Argentina — caught on the kiss cam during a tense quarterfinal, surprise reaction, packed stadium in the background.",
        mediaUrl: worldCup3.url,
      },
      {
        prompt:
          "Netherlands vs Belgium — waving a massive Netherlands flag dramatically as the broadcast cuts to the crowd. Orange wall behind me.",
        mediaUrl: worldCup4.url,
      },
    ],
    faqs: [
      {
        question: "What kind of selfie works best?",
        answer:
          "A clean, front-facing photo with good lighting and your face fully visible. Skip sunglasses and heavy filters — the more your face reads as itself, the more the broadcast version reads as you.",
      },
      {
        question: "Can I pick any team?",
        answer:
          "Yes. Pick from the 2026 men's tournament squad list — your team's colors are used for the kit and crowd, and we pair you against a pre-baked rival (Brazil vs Argentina, England vs Germany, etc.) for narrative flair.",
      },
      {
        question: "How long does each clip take?",
        answer:
          "About 30–60 seconds for the broadcast still, then another minute or two for Seedance 2.0 to animate it into a 10-second clip with sound. Both show up in your project Outputs as they finish.",
      },
      {
        question: "Is this an official FIFA product?",
        answer:
          "No. This is a fan-style template that generates a broadcast-look video for personal sharing — the scorebug, logos and graphics are AI-generated in the style of a live sports broadcast, not the actual FIFA broadcast feed.",
      },
      {
        question: "Can I use the clip commercially?",
        answer:
          "Personal use, fan content and social posts are the intended use. For brand campaigns or anything that implies an official endorsement, talk to a legal team first — sports IP and likeness rights vary by region.",
      },
      {
        question: "Where does the clip end up?",
        answer:
          "Both the broadcast screenshot and the 10-second animated clip drop into your project Outputs and onto your timeline, ready to download, trim, or post.",
      },
    ],
  },
  "app-anime-world-cup-2026": (() => {
    // Real outputs from the Anime World Cup 2026 app, mirrored to the
    // Lovable CDN. The original Shotstack S3 URLs that were shared to the
    // community expired (403); these are the durable copies.
    const ANIME_WC = {
      a: animeWc1.url,
      b: animeWc2.url,
      c: animeWc3.url,
      d: animeWc4.url,
      e: animeWc5.url,
      f: animeWc6.url,
      g: animeWc7.url,
    } as const;
    return {
    eyebrow: "Pika Special App",
    title: "Anime World Cup 2026",
    subtitle:
      "Become an original anime hero of the FIFA World Cup 2026. Upload a selfie, pick your team and an anime mode — Battle Shonen, Magical Girl, Sports Anime, Mecha and more — and Seedance 2.0 invents a wild ~15-second match-day scene, in your language, with stylized on-screen kanji and a hero title card when the genre calls for it.",
    heroVideoUrl: animeWcHero.url,
    howItWorks: {
      title: "From selfie to anime hero in three steps",
      steps: [
        {
          title: "Upload a selfie",
          body: "One clean, front-facing photo. Your face stays locked to the hero across every mode.",
        },
        {
          title: "Pick team & anime mode",
          body: "Choose your 2026 squad and one of 12 anime genres — each reshapes art direction, palette and pacing.",
        },
        {
          title: "Seedance writes the scene",
          body: "A ~15s cinematic stadium vignette with native VO and stylized on-screen lettering when the genre calls for it.",
        },
      ],
    },

    highlights: [
      { label: "Input", value: "1 selfie · 60 seconds" },
      { label: "Length", value: "~15s · with sound" },
      { label: "Modes", value: "12 anime genres" },
      { label: "Concurrency", value: "Up to 3 at once" },
    ],
    features: [
      {
        title: "Your face, locked into the anime",
        body: "Identity stays pinned to your reference photo across every mode. The hero on the pitch — or in the stands, or in the tunnel — is recognizably you, not a generic anime lookalike, wearing your nation's colors.",
        mediaUrl: ANIME_WC.b,
        mediaKind: "video",
      },
      {
        title: "Twelve anime modes, not twelve filters",
        body: "We organize around genre and production aesthetic — Battle Shonen, Magical Girl, Mecha, Cyberpunk, Romance — so the entire frame shifts: linework, palette, camera FX vocabulary, pacing, even how subtitles and SFX appear. Large models read genre much better than they read 'studio X style'.",
        mediaUrl: ANIME_WC.c,
        mediaKind: "video",
      },
      {
        title: "Open-ended stadium vignettes",
        body: "Every clip doesn't have to be a goal or a rivalry. The model picks from a broad pool of match-day moments — keeper save, coach reaction, fans in the stands, kid on shoulders at the anthem, tunnel walk, full-time embrace — so generations feel varied and authored, not formulaic.",
        mediaUrl: ANIME_WC.d,
        mediaKind: "video",
      },
      {
        title: "Native VO, captions and stylized kanji",
        body: "Language defaults to Japanese but switches to your team's native language with one tap. The model adds burned-in captions, optional SFX kanji at action peaks and a hero title card at the end — only when the chosen anime mode actually calls for it, never crowding the hero.",
        mediaUrl: ANIME_WC.e,
        mediaKind: "video",
      },
    ],
    useCases: [
      {
        title: "Group-chat flex",
        body: "Send your friends a 15-second anime episode where you're the hero scoring against their team. Screenshots can't compete.",
      },
      {
        title: "Watch-party openers",
        body: "Drop an anime intro of yourself walking out of the tunnel before kickoff. Instant party trick on the projector.",
      },
      {
        title: "Stories & reels",
        body: "Vertical-friendly anime aesthetic with stylized lettering and stadium audio — fits straight into a feed post or story with zero cleanup.",
      },
      {
        title: "Fan-club & creator content",
        body: "Run the same selfie through all 12 anime modes and a handful of opponents for a full month of native World Cup content from one upload.",
      },
    ],
    examples: [
      {
        prompt:
          "Battle Shonen, Argentina vs Brazil — captain raises the armband in the tunnel as teammates roar behind him, dramatic backlight and rim-lit dust motes.",
        mediaUrl: ANIME_WC.a,
      },
      {
        prompt:
          "Sports Anime, Japan vs Spain — keeper full-stretch save in the 89th minute, freeze-frame on the fingertip touch as the crowd erupts.",
        mediaUrl: ANIME_WC.f,
      },
      {
        prompt:
          "Magical Girl, Brazil vs Germany — fan in the lower bowl summons a giant glowing flag as samba drums kick in, sparkle FX swirl across the frame.",
        mediaUrl: ANIME_WC.g,
      },
      {
        prompt:
          "Mecha, Netherlands vs France — striker walks onto the pitch in slow-motion, orange visor reflecting the floodlights, mechanical anthem pulses in the background.",
        mediaUrl: ANIME_WC.c,
      },
      {
        prompt:
          "Sports Anime stadium vignette — kids on shoulders for the anthem, samba drums, captain's armband glow.",
        mediaUrl: ANIME_WC.b,
      },
      {
        prompt:
          "Battle Shonen finale — coach's reaction at full time, slow zoom on tear-streaked smile under floodlights.",
        mediaUrl: ANIME_WC.d,
      },
    ],

    faqs: [
      {
        question: "What kind of selfie works best?",
        answer:
          "A clean, front-facing photo with good lighting and your face fully visible. Skip sunglasses and heavy filters — the more recognizable your face, the stronger the anime likeness across all 12 modes.",
      },
      {
        question: "How is this different from the regular World Cup 2026 app?",
        answer:
          "The regular app cuts you into a real-looking live TV broadcast — scorebug, network watermark, packed stadium. The anime version reimagines the same moment as an original ~15-second anime scene, with stylized art direction, kanji SFX and a hero title card when the genre calls for it.",
      },
      {
        question: "Can I pick which anime style?",
        answer:
          "You pick one of 12 anime modes — Battle Shonen, Magical Girl, Sports Anime, Mecha, Cyberpunk, Fantasy Adventure, Sci-Fi Epic, Horror, Slice of Life, Romance, Isekai, Cyber Noir. We deliberately avoid emulating individual studios; large models read 'genre' much better than 'studio X style' and the results look more original.",
      },
      {
        question: "What language is the voiceover in?",
        answer:
          "Defaults to Japanese for the classic anime feel, but switches to your team's native language with one tap — and you can override to any of our supported languages. Burned-in captions match the spoken language.",
      },
      {
        question: "Is every clip a goal or a rivalry?",
        answer:
          "No. The model picks from a broad pool of match-day vignettes — keeper saves, captain anthems, fans in the stands, coach reactions, kids on shoulders, tunnel walks, full-time embraces — so generations feel varied and authored instead of all looking like the same goal celebration.",
      },
      {
        question: "How long does each clip take?",
        answer:
          "About 2–3 minutes per ~15-second clip. You can fire off up to 3 generations concurrently — kick off a Battle Shonen, a Magical Girl and a Mecha render in parallel and pick your favorite.",
      },
      {
        question: "Is this an official FIFA product?",
        answer:
          "No. This is a fan-style anime template for personal sharing. Team colors, stadiums and motifs are AI-generated in the style of an original anime — not the actual FIFA broadcast feed or any licensed anime IP.",
      },
      {
        question: "Where does the clip end up?",
        answer:
          "Each ~15-second clip drops into your project Outputs and onto your timeline, ready to download, trim, or share to the Pika community.",
      },
    ],
    };
  })(),
};



export function hasShowcase(skillId: string): boolean {
  return skillId in APP_SHOWCASES;
}

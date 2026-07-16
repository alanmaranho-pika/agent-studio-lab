// Anime World Cup 2026 — pure prompt-assembly helpers and curated
// "Anime Mode" presets. The panel calls the existing
// directGenerateStart / directGeneratePoll server functions for the
// actual Seedance run, so no server functions live here yet.
//
// The prompt is open-ended: instead of always being a goal/rivalry
// moment, we pick from a wide pool of stadium vignettes (hero striker,
// fan in the stands, child on parent's shoulders, goalkeeper save,
// coach on the touchline, pre-match ritual, etc.) so the output varies
// run-to-run. Voice-over language is configurable and defaults to the
// hero team's primary language.

import { WORLD_CUP_TEAMS } from "@/lib/world-cup.functions";

export { WORLD_CUP_TEAMS };

export type AnimeModeId =
  | "battle_shonen"
  | "magical_girl"
  | "sports_anime"
  | "fantasy_adventure"
  | "cinematic_anime"
  | "superhero"
  | "psychic"
  | "mecha"
  | "cyberpunk"
  | "retro_90s_cel"
  | "romance_drama"
  | "comedy";

export type AnimeMode = {
  id: AnimeModeId;
  label: string;
  emoji: string;
  /** Internal descriptor injected into the Seedance prompt. */
  descriptor: string;
};

export const ANIME_MODES: ReadonlyArray<AnimeMode> = [
  {
    id: "battle_shonen",
    label: "Battle Shonen",
    emoji: "⚔️",
    descriptor:
      "Modern battle shonen — the world of Naruto, My Hero Academia, Demon Slayer, Jujutsu Kaisen, Bleach. Hand-drawn 2D anime action with explosive energy, dramatic poses and over-the-top emotion. Lean into the genre.",
  },
  {
    id: "magical_girl",
    label: "Magical Girl",
    emoji: "🌸",
    descriptor:
      "Magical girl anime — the world of Sailor Moon, Cardcaptor Sakura, Madoka Magica, Precure, Tokyo Mew Mew. Hand-drawn 2D cel animation with transformation sequences, sparkles and pastel magic. Lean fully into the genre's look and energy.",
  },
  {
    id: "sports_anime",
    label: "Sports Anime",
    emoji: "⚽",
    descriptor:
      "Classic sports anime — the world of Haikyuu, Blue Lock, Kuroko no Basket, Captain Tsubasa, Slam Dunk, Ace of Diamond. Hand-drawn 2D anime with hyper-kinetic athletic drama and burning rivalry. Lean into the genre.",
  },
  {
    id: "fantasy_adventure",
    label: "Fantasy Adventure",
    emoji: "✨",
    descriptor:
      "Painterly fantasy adventure anime — the world of Studio Ghibli, Makoto Shinkai, Mary and the Witch's Flower, The Boy and the Heron, Nausicaä. Hand-painted backgrounds, gentle wonder, soft natural light. Lean into the genre.",
  },
  {
    id: "cinematic_anime",
    label: "Cinematic Anime",
    emoji: "🌌",
    descriptor:
      "Cinematic prestige anime — the world of Your Name, Weathering With You, Suzume, Violet Evergarden, A Silent Voice. Hand-drawn characters against photoreal lighting and breathtaking skies, with quiet emotional realism. Lean into the genre.",
  },
  {
    id: "superhero",
    label: "Superhero",
    emoji: "💥",
    descriptor:
      "Modern superhero anime — the world of My Hero Academia, Tiger & Bunny, One-Punch Man, Concrete Revolutio. Hand-drawn 2D anime with bold costumes, colorful powers and comic-book energy. Lean into the genre.",
  },
  {
    id: "psychic",
    label: "Psychic",
    emoji: "🧠",
    descriptor:
      "Psychic and supernatural anime — the world of Mob Psycho 100, Akira, Chainsaw Man, Devilman Crybaby, Paranoia Agent. Hand-drawn 2D anime where reality visibly warps around the hero. Lean fully into the genre's surreal energy.",
  },
  {
    id: "mecha",
    label: "Mecha",
    emoji: "🤖",
    descriptor:
      "Classic Japanese mecha anime — the world of Gundam, Macross, Evangelion, Patlabor, Escaflowne, Code Geass. Hand-drawn 2D cel animation of giant piloted robots brought into a football context. Lean fully into the look, energy and iconography of the genre. Not 3D CG, not photoreal.",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    emoji: "🌃",
    descriptor:
      "Cyberpunk anime — the world of Akira, Ghost in the Shell, Cyberpunk Edgerunners, Serial Experiments Lain, Texhnolyze. Hand-drawn 2D anime with rain-slick neon cities, chrome and holograms. Lean fully into the genre.",
  },
  {
    id: "retro_90s_cel",
    label: "Retro 90s Cel",
    emoji: "🎞️",
    descriptor:
      "Retro 1990s hand-painted cel anime — the world of Cowboy Bebop, Sailor Moon, Slam Dunk, Trigun, Outlaw Star. Real cel paint and gouache backgrounds, slight film grain, limited animation. Lean fully into the era's look.",
  },
  {
    id: "romance_drama",
    label: "Romance Drama",
    emoji: "❤️",
    descriptor:
      "Romance drama anime — the world of Your Name, Toradora, Fruits Basket, Clannad, Horimiya. Hand-drawn 2D anime with tender closeups, soft light and quiet emotional beats. Lean into the genre.",
  },
  {
    id: "comedy",
    label: "Comedy",
    emoji: "😂",
    descriptor:
      "Comedy anime — the world of Gintama, KonoSuba, Nichijou, The Disastrous Life of Saiki K, Pop Team Epic. Hand-drawn 2D anime with chibi reactions, screen-filling faces and unhinged punchline timing. Lean fully into the genre.",
  },
];

export type AnimeAspect = "9:16" | "16:9" | "1:1";

// Kit color palettes per team. Colors only — no crests, sponsors, or
// trademarked motifs (those trip Seedance sensitive-content filters).
const TEAM_KITS: Record<string, string> = {
  Brazil: "canary yellow shirt with green trim, blue shorts",
  Argentina: "sky-blue and white vertical stripes, black shorts",
  France: "deep navy blue shirt, white shorts",
  Germany: "white shirt with bold black trim, black shorts",
  Spain: "scarlet red shirt, navy shorts",
  England: "crisp white shirt, navy shorts",
  Portugal: "deep crimson shirt with green trim, green shorts",
  Netherlands: "bright orange shirt, white shorts",
  Italy: "royal blue shirt, white shorts",
  Belgium: "rich red shirt with black and gold accents, red shorts",
  Croatia: "red and white checkered shirt, white shorts",
  Uruguay: "sky-blue shirt, black shorts",
  Mexico: "forest-green shirt with white trim, white shorts",
  USA: "white shirt with red and blue accents, navy shorts",
  Canada: "bold red shirt with white trim, red shorts",
  Japan: "deep indigo blue shirt, white shorts",
  "South Korea": "bright red shirt, blue shorts",
  Morocco: "red shirt with green trim, green shorts",
  Senegal: "white shirt with green and red trim, white shorts",
  Australia: "gold-yellow shirt with green trim, green shorts",
};

function kitFor(team: string): string {
  return TEAM_KITS[team] ?? `${team}'s national team kit colors`;
}

// ───────────────────────── Language ──────────────────────────

export type LanguageId =
  | "japanese"
  | "english"
  | "spanish"
  | "portuguese"
  | "french"
  | "german"
  | "italian"
  | "dutch"
  | "croatian"
  | "korean"
  | "arabic";

export const LANGUAGES: ReadonlyArray<{ id: LanguageId; label: string; tag: string }> = [
  { id: "japanese", label: "Japanese", tag: "JP" },
  { id: "english", label: "English", tag: "EN" },
  { id: "spanish", label: "Spanish", tag: "ES" },
  { id: "portuguese", label: "Portuguese", tag: "PT" },
  { id: "french", label: "French", tag: "FR" },
  { id: "german", label: "German", tag: "DE" },
  { id: "italian", label: "Italian", tag: "IT" },
  { id: "dutch", label: "Dutch", tag: "NL" },
  { id: "croatian", label: "Croatian", tag: "HR" },
  { id: "korean", label: "Korean", tag: "KR" },
  { id: "arabic", label: "Arabic", tag: "AR" },
];

const TEAM_LANGUAGE: Record<string, LanguageId> = {
  Brazil: "portuguese",
  Portugal: "portuguese",
  Argentina: "spanish",
  Spain: "spanish",
  Mexico: "spanish",
  Uruguay: "spanish",
  France: "french",
  Belgium: "french",
  Senegal: "french",
  Germany: "german",
  England: "english",
  USA: "english",
  Canada: "english",
  Australia: "english",
  Italy: "italian",
  Netherlands: "dutch",
  Croatia: "croatian",
  Japan: "japanese",
  "South Korea": "korean",
  Morocco: "arabic",
};

export function languageForTeam(team: string): LanguageId {
  return TEAM_LANGUAGE[team] ?? "english";
}

function langMeta(id: LanguageId) {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0];
}

// ───────────────────── Scene vignettes ─────────────────────
//
// Open-ended pool of moments that can happen anywhere in or around
// the stadium. The hero is not always the striker scoring a goal —
// they can be a fan, a kid in the stands, the keeper, the coach,
// even a vendor. Beats reference HERO (focal character) and may
// reference OPP_KIT for opposition-color characters when relevant.

type Vignette = {
  label: string;
  /** The role HERO plays in this scene, used in the hero block. */
  role: string;
  beat: string;
};

const SCENE_VIGNETTES: ReadonlyArray<Vignette> = [
  {
    label: "thunderous volley",
    role: "the team's star striker in a HERO_KIT",
    beat: "a cross whips in from the wing; HERO meets it on the half-volley, boot through the ball, bullet-time on the strike, an impact frame flashes pure white then SNAPS to full speed as the net ripples and a keeper in an OPP_KIT is frozen mid-dive",
  },
  {
    label: "diving header",
    role: "the team's star striker in a HERO_KIT",
    beat: "a teammate floats a cross to the back post; HERO launches into a diving header, anime smear frames trailing behind, the ball rockets past a keeper in an OPP_KIT, slow-motion knee-slide on the wet pitch with golden particles bursting around them",
  },
  {
    label: "solo dribble",
    role: "the team's playmaker in a HERO_KIT",
    beat: "HERO picks up the ball at the halfway line, slaloms past two defenders in an OPP_KIT with anime smear frames and speed lines, a step-over, then a clinical low finish, the goal lighting up in a golden particle burst",
  },
  {
    label: "fingertip save",
    role: "the team's goalkeeper in a HERO_KIT goalkeeper jersey and gloves",
    beat: "a thunderous strike flies toward the top corner; HERO launches full-stretch through the air, fingertip claw, the ball pings the underside of the bar, slow-motion as they crash to the turf and roar at the sky",
  },
  {
    label: "captain's anthem",
    role: "the team captain in a HERO_KIT, arm wrapped in the captain's armband",
    beat: "HERO stands on the centre line during the pre-match anthem, hand on chest, slow dolly-in on their face, a single tear catching the floodlights, then a deep breath and a determined nod as the lights bloom around them",
  },
  {
    label: "tunnel walk",
    role: "a player in a HERO_KIT",
    beat: "HERO walks out of the dark tunnel into the light of the stadium, lacing the captain's armband, slow tracking shot from behind, the roar of the crowd swelling, a fist-bump with a teammate, the floodlights flaring as they step onto the grass",
  },
  {
    label: "bench leap",
    role: "a substitute on the bench in a HERO_KIT and a team tracksuit",
    beat: "HERO is sat on the bench, leaning forward, jaw clenched; a teammate scores and HERO explodes upward, arms wide, the bench erupts around them, anime impact frame, then a freeze on the joy on their face",
  },
  {
    label: "coach on the touchline",
    role: "the team's head coach on the sideline, in a sharp dark suit with a HERO_KIT-colored scarf or pin",
    beat: "HERO paces the technical area, sleeves rolled, shouting tactical instructions, gesturing wildly; a chance falls and they freeze, then leap, fists clenched, as the camera whips past their face",
  },
  {
    label: "fan in the stands",
    role: "a passionate adult fan in the stands wearing a HERO_KIT replica shirt and HERO_KIT face paint",
    beat: "HERO is packed shoulder-to-shoulder in the supporters' end, scarf raised above their head, singing at the top of their lungs; a goal goes in and the stand erupts around them, HERO falls to their knees with tears of joy, confetti raining down",
  },
  {
    label: "kid on shoulders",
    role: "a wide-eyed child in a HERO_KIT mini replica shirt, sat on a parent's shoulders in the stands",
    beat: "HERO watches the pitch with their mouth open, holding a hand-drawn cardboard sign; a player runs to the corner flag and points up to them, HERO's eyes go huge, the parent below cheers, slow push-in on the pure wonder on their face",
  },
  {
    label: "pre-match ritual",
    role: "a player in a HERO_KIT base layer in the locker room",
    beat: "HERO sits alone on the locker-room bench, headphones on, eyes closed, lips moving to a private mantra; the camera orbits slowly as steam rises and teammates blur past in the background, HERO opens their eyes and looks straight to camera with quiet fire",
  },
  {
    label: "full-time embrace",
    role: "a player in a HERO_KIT, sweat-soaked, after the final whistle",
    beat: "the final whistle blows; HERO collapses to their knees on the centre circle, head in hands, then looks up to the sky as a teammate sprints in and lifts them into a roaring embrace, the whole stadium a blur of color and confetti behind them",
  },
  {
    label: "flag spiral",
    role: "a player in a HERO_KIT after the match",
    beat: "HERO grabs a huge HERO_KIT-colored flag from the front row and holds it above their head with both arms; the camera spirals around them as flares pop in the background, the flag rippling in slow motion, their face lit by red and white light",
  },
  {
    label: "halftime team talk",
    role: "a player in a HERO_KIT, jersey untucked",
    beat: "the locker room at halftime; HERO sits forward with elbows on knees, breathing hard, sweat dripping; the coach paces in the background, HERO looks up with a fire in their eyes and the camera pushes in as the rest of the team gathers around",
  },
];

function pickVignette(seed: number): Vignette {
  return SCENE_VIGNETTES[Math.abs(seed) % SCENE_VIGNETTES.length];
}

/** Sentence-case the hero name for natural prose, plus a CAPS form for the formula. */
function heroForms(rawName: string | undefined): { caps: string; pretty: string } {
  const trimmed = (rawName ?? "").trim();
  if (!trimmed) {
    return { caps: "THE HERO", pretty: "The Hero" };
  }
  const first = trimmed.split(/\s+/)[0];
  return { caps: first.toUpperCase(), pretty: first };
}

export function buildAnimePrompt(args: {
  team: string;
  opponent?: string;
  heroName?: string;
  modeIds: AnimeModeId[];
  /** Voice-over language. Defaults to the hero team's primary language. */
  language?: LanguageId;
  /** Optional integer to deterministically pick a scene. */
  seed?: number;
}): string {
  const modes = args.modeIds
    .map((id) => ANIME_MODES.find((m) => m.id === id))
    .filter((m): m is AnimeMode => !!m);

  const primary = modes[0];
  const secondary = modes[1];

  const modeHeader = primary
    ? `ANIME MODE — ${primary.label.toUpperCase()}${secondary ? ` × ${secondary.label.toUpperCase()}` : ""}`
    : "ANIME MODE — CINEMATIC ANIME";

  const modeBody = primary
    ? secondary
      ? `Primary style (dominant): ${primary.descriptor}\n\nSecondary accent (supporting flavor only, must not overpower the primary): ${secondary.descriptor}`
      : primary.descriptor
    : "cinematic anime, dramatic closeups, exaggerated emotion";

  const modeDirective = `The visual language, signature subjects, props, costumes, environments, color palette and iconography of this Anime Mode MUST visibly dominate every frame. The mode is the lead creative direction — the football match is the situation, the mode is the show. If the mode calls for a mecha, magical transformation, neon city, psychic warp, etc., those elements must be clearly visible on screen, not implied.`;

  const heroKit = kitFor(args.team);
  const opponent = args.opponent && args.opponent !== args.team ? args.opponent : null;
  const oppKit = opponent ? kitFor(opponent) : null;

  const { caps: HERO, pretty: heroPretty } = heroForms(args.heroName);
  const lang = langMeta(args.language ?? languageForTeam(args.team));
  const vignette = pickVignette(args.seed ?? Date.now());

  const styleTag = `Japanese anime style, cel-shaded, high contrast, cinematic color grade, maximum emotional intensity. The setting is a high-stakes international football match, but the scene must be reinterpreted through the Anime Mode above — environments, props, characters and effects all bend to the mode rather than to a realistic broadcast.`;

  const role = vignette.role
    .replaceAll("HERO_KIT", heroKit)
    .replaceAll("OPP_KIT", oppKit ?? "opposition-color kit");

  const heroBlock = `${HERO} — ${role} — immediately recognizable as the person in the reference image, anime-stylized but with their exact face, hair, skin tone, eye color, age and body type preserved.`;

  const actionBlock = vignette.beat
    .replaceAll("HERO", HERO)
    .replaceAll("OPP_KIT", oppKit ?? "opposition-color kit")
    .replaceAll("HERO_KIT", heroKit);

  const reinterpretLine = `Reinterpret this moment through the Anime Mode — props, characters, environment and effects should reflect the mode's signature iconography, not a realistic stadium.`;

  const moodLine = `Mood arc: charged anticipation → peak emotion → release. Vary the camera (handheld push-in, slow dolly, orbit, whip pan, low heroic angle) — do not lock to one shot.`;

  const voBlock = [
    `VO/subtitle in ${lang.label} (${lang.tag}):`,
    `• one short line from ${heroPretty} (or the focal character), spoken naturally in ${lang.label}, with an English gloss in parentheses.`,
    `• one short commentator or crowd line in ${lang.label}, also with an English gloss in parentheses.`,
    `Use authentic, idiomatic ${lang.label} — not a translated cliché. Keep each line under 8 words. No other languages.`,
  ].join("\n");

  const letteringBlock = `On-screen lettering (REQUIRED): always burn in short ${lang.label} captions for every spoken line (commentator, crowd, or hero), styled to match the anime mode. In addition, include at least one piece of stylized on-screen text somewhere in the shot — pick whichever fits best: a bold hero name plate / nickname card, a punchy anime-style title or end card (original wordmark, no real tournament or team names), or hand-painted SFX kanji / ${lang.label} lettering on a big action beat. One is enough; do not overdo it. Match the mode's typography (bold brushed kanji and impact frames for battle shonen; delicate handwritten script for romance; chunky retro logos for 90s cel; sparkling script for magical girl; glitchy neon type for cyberpunk). Integrate lettering with the camera and composition so it feels designed, not pasted on. Never add scoreboards, lower-thirds, broadcast graphics, real team crests, sponsor logos, or real tournament names.`;

  const safetyLine = `Pure in-and-around-the-stadium footage only — no scoreboards, no broadcast graphics, no team crests, no sponsor logos, no tournament names anywhere in the frame. Describe teams by KIT COLORS only.`;

  return [
    modeHeader,
    modeDirective,
    "",
    modeBody,
    "",
    styleTag,
    "",
    `Scene: ${vignette.label}.`,
    heroBlock,
    "",
    actionBlock,
    "",
    reinterpretLine,
    "",
    moodLine,
    "",
    safetyLine,
    "",
    `Likeness is critical: the anime hero must stay clearly recognizable as the specific person in the reference image across every shot. Stylize only the rendering (linework, shading, color). Do not redesign the face, swap ethnicity, change hair, or replace them with a different person. Keep their face on-screen, in focus, and well-lit for most of the runtime.`,
    "",
    voBlock,
    "",
    letteringBlock,
  ].join("\n");
}

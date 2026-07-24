-- Supabase is the single source of truth for every built-in agent skill.
-- Each row contains the former skill.ts manifest plus the full skill.md body.

CREATE TABLE public.agent_skills (
  id text PRIMARY KEY CHECK (id ~ '^SKL_[A-Z0-9_]+$'),
  app_id text NOT NULL UNIQUE CHECK (app_id ~ '^[a-z0-9][a-z0-9-]*$'),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK (kind IN ('wizard', 'model', 'meta')),
  intent text NOT NULL CHECK (char_length(intent) BETWEEN 1 AND 1000),
  one_liner text NOT NULL CHECK (char_length(one_liner) BETWEEN 1 AND 1000),
  outputs text[] NOT NULL DEFAULT ARRAY[]::text[],
  matches text[] NOT NULL DEFAULT ARRAY[]::text[],
  uses_blocks text[] NOT NULL DEFAULT ARRAY[]::text[],
  model text,
  mode text CHECK (mode IS NULL OR mode IN ('image', 'video', 'audio', 'speech')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(steps) = 'array'),
  body_md text NOT NULL CHECK (char_length(body_md) BETWEEN 1 AND 200000),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'model' AND model IS NOT NULL AND mode IS NOT NULL)
    OR (kind <> 'model' AND model IS NULL AND mode IS NULL)
  )
);

CREATE INDEX agent_skills_active_order_idx
  ON public.agent_skills (is_active, sort_order, app_id);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.agent_skills
  FROM anon, authenticated;
GRANT SELECT ON public.agent_skills TO anon, authenticated;
GRANT ALL ON public.agent_skills TO service_role;
ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active agent skills are readable"
  ON public.agent_skills
  FOR SELECT
  TO anon, authenticated
  USING (is_active);

CREATE TRIGGER trg_agent_skills_touch
  BEFORE UPDATE ON public.agent_skills
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.agent_skills (
  id,
  app_id,
  label,
  kind,
  intent,
  one_liner,
  outputs,
  matches,
  uses_blocks,
  model,
  mode,
  steps,
  body_md,
  sort_order
)
VALUES
  (
    'SKL_SHORT_FILM',
    'short-film',
    'Short Film',
    'wizard',
    'Take an idea to a finished multi-shot short.',
    'Take an idea to a finished multi-shot short — logline, cast, storyboard, animate, audio, produce.',
    ARRAY['video']::text[],
    ARRAY['short film', 'narrative video', 'multi-shot', 'movie']::text[],
    ARRAY['BLK_OPTIONS', 'BLK_FORM', 'BLK_UPLOAD', 'BLK_MOODBOARD', 'BLK_STORYBOARD', 'BLK_GALLERY', 'BLK_MEDIA', 'BLK_STAGE', 'BLK_ACTIONS']::text[],
    NULL,
    NULL,
    '[{"id":"logline","intent":"Logline + length.","presents":["BLK_FORM"],"inputs":[{"kind":"text","key":"logline","label":"Logline (1–2 sentences)","long":true},{"kind":"choice","key":"lengthSec","label":"Length","options":["8s","15s","30s","1m","1m 30s","2m"]}]},{"id":"aspect","intent":"Aspect ratio — its own turn as options with ratio visuals, never a form field.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"aspect","label":"Aspect ratio","options":["16:9","9:16","1:1"]}]},{"id":"cast","intent":"Pick or create characters / environments / products. Pull from Library; offer Create Character which opens Character Creator inline.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"character","key":"characters","label":"Add character(s) from Library","multi":true},{"kind":"environment","key":"environments","label":"Add environment(s)"}]},{"id":"audio","intent":"Audio plan FIRST, in TWO turns (never one card): (1) approach as a BLK_OPTIONS choice — music bed / voiceover / talking / mix / silent, multi; then (2) an OPTIONAL BLK_FORM audioNotes field, only when the approach needs direction. Informs beat pacing, dialogue, and whether characters speak on screen, so collect it BEFORE storyboard.","presents":["BLK_OPTIONS","BLK_FORM"],"inputs":[{"kind":"choice","key":"audioMode","label":"Audio","options":["Music bed only","Voiceover narration","Talking characters","Mix (music + VO + dialogue)","No audio"],"multi":true},{"kind":"text","key":"audioNotes","label":"Audio direction (genre, narrator tone, who speaks what)","long":true}]},{"id":"storyboard","intent":"Generate beat list (shots with description + duration), informed by the audio plan (pacing to music, VO lines per beat, on-screen dialogue). Show beats as a storyboard block (per shot: meta ''Shot N · Xs'', short title, description, vo line when planned) for review.","presents":["BLK_STORYBOARD"],"inputs":[{"kind":"text","key":"styleNotes","label":"Style / visual look notes","long":true}]},{"id":"animate","intent":"Pick render model per beat (Seedance 2.0 vs Kling Standard).","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"videoPath","label":"Video model","options":["Seedance 2.0","Kling Standard"]}]},{"id":"produce","intent":"Render and review.","presents":["BLK_STAGE","BLK_ACTIONS"],"inputs":[]}]'::jsonb,
    $skill_0$---
id: SKL_SHORT_FILM
appId: short-film
label: Short Film
kind: wizard
intent: Take an idea to a finished multi-shot short.
oneLiner: Take an idea to a finished multi-shot short — logline, cast, storyboard, animate, audio, produce.
outputs: [video]
matches: [short film, narrative video, multi-shot, movie]
usesBlocks: [BLK_OPTIONS, BLK_FORM, BLK_UPLOAD, BLK_MOODBOARD, BLK_STORYBOARD, BLK_GALLERY, BLK_MEDIA, BLK_STAGE, BLK_TIMELINE, BLK_ACTIONS]
---

# Short Film

Take an idea to a finished multi-shot short. Walk these steps one decision per turn; skip, reorder, or loop back based on what the user already answered; detour into a model skill when an input is missing, then resume. Each step is a checklist, not a script: "a 30s movie about a lost dog" answers BOTH Step 1 fields — don't serve the logline/length form again, confirm inline ("30s, a lost dog finding home — locked") and open at Step 2.

**Required result:** once specs, cast, audio, and the storyboard are set, this skill ALWAYS lands on a `BLK_TIMELINE` of the shots (Step 6) — never a written recap, `list`, or prose summary of the project. The timeline IS the review surface; a summary is not an acceptable substitute.

## Step 1 — Logline

- **Present:** `BLK_FORM` with fields `{logline, lengthSec}` (lengths: 8s, 15s, 30s, 1m, 1m 30s, 2m).
- **Persist:** `commit_project_patch({meta: {logline, targetDuration}})`.

## Step 2 — Aspect ratio

- **Present:** `BLK_OPTIONS` — 16:9 / 9:16 / 1:1, each with `visual.kind: "ratio"`. Its own turn, never a form field.
- **Persist:** `commit_project_patch({meta: {aspectRatio}})`.

## Step 3 — Cast

- **Present:** `BLK_OPTIONS` (pick from Library) OR the character-picker (multi). Offer "Create new" → open Character Creator inline.
- **Persist:** `commit_project_patch({cast})`.

## Step 4 — Audio plan (FIRST, before storyboard) — TWO turns

Approach and notes are separate rounds — never one card (guardrail 1c):

- **Turn 1 — approach (`BLK_OPTIONS`):** Music bed / Voiceover / Talking dialogue / Mix music + VO / Silent (ambience only). Multi-select. Its own turn; the approach is a choice, not a form field. Persist the picked mode(s) via `commit_project_patch`.
- **Turn 2 — notes (`BLK_FORM`, optional):** a single `audioNotes` field (genre, narrator tone, who speaks what) — shown ONLY when the approach needs direction. Skip it (or let "Agent decides" / "Skip" advance) when the mode alone is enough.
- **Why first:** pacing, dialogue, and whether characters need to speak on screen depend on this.

## Step 5 — Storyboard

- **Present:** `BLK_STORYBOARD` — one slide per shot: meta "Shot N · Xs", short title, description, `vo` line when planned.
- Also collects `styleNotes` (long text) if not already provided.
- **Persist:** `commit_project_patch({scenes})` — one scene per shot (n, title, prompt, motionPrompt, duration). These scenes are what the timeline renders.

## Step 6 — Timeline preview (REQUIRED)

- The moment the storyboard is locked and audio is planned, ALWAYS `render_turn` with a `BLK_TIMELINE` (variant `preview`) laying out every shot in order. This is the mandatory result of setup — do NOT end on a `script-beats` stage, a `list`, or a prose/`custom_html` recap.
- The timeline draws straight from `project.scenes` (patched in Step 5), so it shows the shots even before any video is rendered — pending shots appear as placeholder clips.
- Put the next steps in the timeline's `actions` (2–4): e.g. "Animate all shots", "Render one shot", "Edit the cut".
- Example: `{"prose":"Here's your five-shot cut — review the flow, then let's animate.","blocks":[{"type":"timeline","variant":"preview","actions":[{"value":"Animate all shots","label":"Animate all","primary":true},{"value":"Render one shot first","label":"Render one"},{"value":"Edit the cut","label":"Edit"}]}]}`

## Step 7 — Animate

- **Present:** `BLK_OPTIONS` for render model per beat (Seedance 2.0, Kling Standard, …).
- Follow the RENDER phase's anchor-first flow. After each shot lands, return to the `BLK_TIMELINE` so the user always sees the shots on the timeline.

## Step 8 — Produce

- **Present:** `BLK_TIMELINE` (variant `preview`) for final review, with lock/export in its own `actions` (the timeline fills the stage — don't add a separate actions block).$skill_0$,
    0
  ),
  (
    'SKL_PRODUCT_AD',
    'product-ad',
    'Product Ad',
    'wizard',
    'Turn a product photo or URL into a polished ad.',
    'Turn a product photo (or product URL) into a polished ad — concept, style, model choice, render.',
    ARRAY['video']::text[],
    ARRAY['product ad', 'commercial', 'ad', 'marketing']::text[],
    ARRAY['BLK_UPLOAD', 'BLK_FORM', 'BLK_OPTIONS', 'BLK_STORYBOARD', 'BLK_GALLERY', 'BLK_MEDIA', 'BLK_TIMELINE', 'BLK_ACTIONS']::text[],
    NULL,
    NULL,
    '[{"id":"product","intent":"Get the product. Offer BOTH a URL import AND an upload tile in the SAME card — user picks one. URL import scrapes title/image; upload accepts an image file.","presents":["BLK_UPLOAD"],"inputs":[{"kind":"url","key":"productUrl","label":"Paste product URL (Shopify, Amazon, etc.)","placeholder":"https://…"},{"kind":"upload","key":"productImage","label":"…or upload a product photo","accepts":"image/*"}],"notes":"These are alternatives — once one is provided, advance."},{"id":"brief","intent":"Brief: tagline, audience, length.","presents":["BLK_FORM"],"inputs":[{"kind":"text","key":"tagline","label":"Tagline or hook (optional)"},{"kind":"text","key":"audience","label":"Target audience"},{"kind":"choice","key":"lengthSec","label":"Length","options":["8s","15s","30s","1m"]}]},{"id":"aspect","intent":"Aspect ratio — its own turn as options with ratio visuals, never a form field. Other ratios reachable via the Custom tile.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"aspect","label":"Aspect ratio","options":["16:9","9:16","1:1"]}]},{"id":"concept","intent":"Generate 2–3 ad concepts as side-by-side BLK_OPTIONS pitch cards (subtitle ''Concept A · 30s'', title, body = the pitch) — exclusive alternatives, never a paginated storyboard. On lock, translate the chosen concept into an ordered shot list and commit_project_patch({scenes}) — one scene per shot (a single-shot ad is one scene) — so the timeline can render the shots.","presents":["BLK_OPTIONS"],"inputs":[]},{"id":"style","intent":"Pick a visual look.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"look","label":"Look","options":["Cinematic","Clean studio","Lifestyle","Editorial"]}]},{"id":"talent","intent":"On-screen talent (optional, multi) — its own turn; skip if the concept needs no one on camera.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"character","key":"talent","label":"Add on-screen talent (optional)","multi":true}]},{"id":"audio","intent":"Audio in TWO turns (never one card): (1) approach as a BLK_OPTIONS choice, then (2) an OPTIONAL BLK_FORM audioNotes field, only when the approach needs direction.","presents":["BLK_OPTIONS","BLK_FORM"],"inputs":[{"kind":"choice","key":"audioMode","label":"Audio","options":["Music bed","Voiceover narration","Talking spokesperson","Mix music + VO","Silent / ambience only"]},{"kind":"text","key":"audioNotes","label":"Audio direction","long":true}]},{"id":"timeline","intent":"REQUIRED consolidation surface. Once scenes are patched, render_turn with a BLK_TIMELINE (variant preview) showing every shot in order (placeholder clips before render). Never leave shots as loose media cards. Put next steps in its actions.","presents":["BLK_TIMELINE"],"inputs":[]},{"id":"produce","intent":"Pick render model (Seedance vs Kling), then anchor-first render per shot. After each shot lands, return to the BLK_TIMELINE so renders consolidate there — never a standalone media card. Final review + export live in the timeline''s actions.","presents":["BLK_OPTIONS","BLK_TIMELINE"],"inputs":[{"kind":"choice","key":"videoPath","label":"Render with","options":["Seedance 2.0","Kling Standard (cheaper)"]}]}]'::jsonb,
    $skill_1$---
id: SKL_PRODUCT_AD
appId: product-ad
label: Product Ad
kind: wizard
intent: Turn a product photo or URL into a polished ad.
oneLiner: Turn a product photo (or product URL) into a polished ad — concept, style, model choice, render.
outputs: [video]
matches: [product ad, commercial, ad, marketing]
usesBlocks: [BLK_UPLOAD, BLK_FORM, BLK_OPTIONS, BLK_STORYBOARD, BLK_GALLERY, BLK_MEDIA, BLK_TIMELINE, BLK_ACTIONS]
---

# Product Ad

Walk these steps one decision per turn. Each step is a checklist, not a script: skip any field — or the whole step — the user already answered ("a 30s ad for my perfume" answers length AND subject before Step 1 even runs). Confirm inherited answers inline and move to the first genuinely open question.

**Required result:** a Product Ad ALWAYS consolidates its rendered shots onto a single `BLK_TIMELINE` — never a scatter of loose `media` cards. The timeline is the review/export surface. Patch `project.scenes` the moment the concept is locked (one scene per shot, even a single-shot ad) so the timeline can show every shot — placeholder clips before render, filled clips after. Each finished render returns to the timeline, not a standalone media card.

## Step 1 — Product intake

- **Present:** `BLK_UPLOAD` with `allowUrl: true` — user pastes a Shopify/Amazon URL OR uploads a photo. Once one is provided, advance.
- On URL paste, immediately `tool_invoke product_ad.scrape_url` and reuse the imported hero image as a reference on every later render.

## Step 2 — Brief

- **Present:** `BLK_FORM` — `{tagline, audience, lengthSec (8/15/30/1m)}`.

## Step 3 — Aspect ratio

- **Present:** `BLK_OPTIONS` — 16:9 / 9:16 / 1:1, each with `visual.kind: "ratio"`. Its own turn, never a form field (4:5 etc. stay reachable via the automatic Custom tile).

## Step 4 — Audio plan (FIRST, before concepts) — TWO turns

Approach and direction are separate rounds — never one card (guardrail 1c):

- **Turn 1 — approach (`BLK_OPTIONS`):** Music bed / Voiceover / Talking spokesperson / Mix music + VO / Silent (ambience only). Its own turn; the approach is a choice, not a form field. Persist via `commit_project_patch`.
- **Turn 2 — direction (`BLK_FORM`, optional):** a single `audioNotes` field — shown ONLY when the approach needs direction. Skip when the mode alone suffices or the user said "Agent decides".
- **Why first:** concept pacing, copy lines, and whether talent must speak on camera all depend on this.

## Step 5 — Concepts

- Generate 2–3 ad concepts and present them as `BLK_OPTIONS` pitch cards — side-by-side, one card per concept: `subtitle` = "Concept A · 30s", `title` = the concept name, `body` = the 2–4 sentence pitch. Concepts are EXCLUSIVE alternatives (guardrail 1d) — never a paginated `BLK_STORYBOARD` or a `BLK_LIST`.
- Style each concept to its mood (see BLK_OPTIONS "Styling pitch cards"): give every card a distinct `titleFont` (Google Fonts family fitting the concept's feel) and a unique `palette` so the three read as genuinely different directions.
- **On lock, create scenes.** Translate the chosen concept into an ordered shot list and `commit_project_patch({scenes})` — one scene per shot (n, title, prompt, motionPrompt, duration). A single-shot ad is one scene. These scenes are what the timeline renders, so patch them here even before any video exists.

## Step 6 — Style

- **Present:** `BLK_OPTIONS` — Cinematic / Clean studio / Lifestyle / Editorial.

## Step 7 — Talent (optional)

- **Present:** `BLK_OPTIONS` — on-screen talent (multi; pick from Library or create). Skip if the concept needs no one on camera.

## Step 8 — Timeline preview (REQUIRED)

- Once the concept is locked and scenes are patched, `render_turn` with a `BLK_TIMELINE` (variant `preview`) generatng and laying out every shot anchor image in order using Nano Banana 2.0. This is the mandatory consolidation surface; do NOT end on a `list`, `stage`, or prose recap, and never leave shots as loose `media` cards.
- Put next steps in the timeline's `actions` (2–4): e.g. "Animate Ad", "Animate first shot".

## Step 9 — Produce

- **Present:** `BLK_OPTIONS` — render model (Seedance 2.0 vs Kling Standard). Model choice first.
- Follow the RENDER phase's anchor-first flow per shot. **After each shot lands, return to the `BLK_TIMELINE`** so every render consolidates there — never surface a finished clip as a standalone `media` card.
- Final review + export live in the timeline's `actions` (the timeline fills the stage — don't add a separate actions block).$skill_1$,
    1
  ),
  (
    'SKL_MUSIC_VIDEO',
    'music-video',
    'Music Video',
    'wizard',
    'Generate a music video around an uploaded track or AI-generated song.',
    'Generate a music video around an uploaded track or AI-generated song.',
    ARRAY['video']::text[],
    ARRAY['music video', 'music', 'song', 'track']::text[],
    ARRAY['BLK_UPLOAD', 'BLK_FORM', 'BLK_OPTIONS', 'BLK_STORYBOARD', 'BLK_MEDIA']::text[],
    NULL,
    NULL,
    '[{"id":"track","intent":"Get the track. Offer upload OR generate-music in the same card.","presents":["BLK_UPLOAD","BLK_FORM"],"inputs":[{"kind":"upload","key":"trackUpload","label":"Upload your track","accepts":"audio/*"},{"kind":"text","key":"musicPrompt","label":"…or describe a track to generate","long":true}]},{"id":"style","intent":"Visual style.","presents":["BLK_FORM"],"inputs":[{"kind":"text","key":"styleNotes","label":"Visual look","long":true}]},{"id":"aspect","intent":"Aspect ratio — its own turn as options with ratio visuals, never a form field.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"aspect","label":"Aspect ratio","options":["16:9","9:16","1:1"]}]},{"id":"storyboard","intent":"Beat-synced shot list — render as a storyboard block (one slide per shot) and let user revise.","presents":["BLK_STORYBOARD"],"inputs":[]},{"id":"produce","intent":"Render and review.","inputs":[]}]'::jsonb,
    $skill_2$---
id: SKL_MUSIC_VIDEO
appId: music-video
label: Music Video
kind: wizard
intent: Generate a music video around an uploaded track or AI-generated song.
oneLiner: Generate a music video around an uploaded track or AI-generated song.
outputs: [video]
matches: [music video, music, song, track]
usesBlocks: [BLK_UPLOAD, BLK_FORM, BLK_OPTIONS, BLK_STORYBOARD, BLK_MEDIA]
---

# Music Video

1. **Track** — `BLK_UPLOAD` (audio) OR `BLK_FORM` prompt to generate one.
2. **Style** — `BLK_FORM` (visual look).
3. **Aspect ratio** — `BLK_OPTIONS` — 16:9 / 9:16 / 1:1, each with `visual.kind: "ratio"`. Its own turn, never combined with the style form.
4. **Storyboard** — beat-synced shot list rendered via `BLK_STORYBOARD`.
5. **Produce** — render and review.
$skill_2$,
    2
  ),
  (
    'SKL_CHARACTER_CREATOR',
    'character-creator',
    'Character Creator',
    'wizard',
    'Create a reusable character with name, look, and voice — saved to the library.',
    'Create a reusable character with name, look, and voice — saved to the library.',
    ARRAY['image']::text[],
    ARRAY['character', 'cast', 'persona', 'portrait']::text[],
    ARRAY['BLK_FORM', 'BLK_GALLERY', 'BLK_ACTIONS']::text[],
    NULL,
    NULL,
    '[{"id":"brief","intent":"Name, role, vibe.","presents":["BLK_FORM"],"inputs":[{"kind":"text","key":"name","label":"Character name"},{"kind":"text","key":"brief","label":"Role + vibe","long":true}]},{"id":"look","intent":"Generate 4 look options (Nano Banana). User picks one or regenerates.","presents":["BLK_GALLERY"],"inputs":[]},{"id":"voice","intent":"Pick a voice or clone one.","inputs":[{"kind":"voice","key":"voice","label":"Voice"}]},{"id":"save","intent":"Save to library.","inputs":[]}]'::jsonb,
    $skill_3$---
id: SKL_CHARACTER_CREATOR
appId: character-creator
label: Character Creator
kind: wizard
intent: Create a reusable character with name, look, and voice.
oneLiner: Create a reusable character with name, look, and voice — saved to the library.
outputs: [image]
matches: [character, cast, persona, portrait]
usesBlocks: [BLK_FORM, BLK_GALLERY, BLK_ACTIONS]
---

# Character Creator

1. **Brief** — `BLK_FORM` (name, role/vibe).
2. **Look** — `BLK_GALLERY` of 4 look options (Nano Banana). Pick or regenerate.
3. **Voice** — voice picker (or clone).
4. **Save** — commit to library.
$skill_3$,
    3
  ),
  (
    'SKL_TALKING_HEAD',
    'talking-head',
    'Talking Head Studio',
    'wizard',
    'Lipsync a portrait to a script or uploaded audio.',
    'Lipsync a portrait to a script or uploaded audio.',
    ARRAY['video']::text[],
    ARRAY['talking head', 'lipsync', 'avatar', 'spokesperson']::text[],
    ARRAY['BLK_UPLOAD', 'BLK_FORM', 'BLK_MEDIA', 'BLK_ACTIONS']::text[],
    NULL,
    NULL,
    '[{"id":"portrait","intent":"Get the portrait — upload OR pick from Library OR generate (Nano Banana).","presents":["BLK_UPLOAD"],"inputs":[{"kind":"upload","key":"portrait","label":"Upload portrait","accepts":"image/*"},{"kind":"asset-picker","key":"portraitFromLibrary","label":"…or pick from Library","mediaKinds":["image"]}]},{"id":"script","intent":"Script + voice OR uploaded audio.","presents":["BLK_FORM","BLK_UPLOAD"],"inputs":[{"kind":"text","key":"script","label":"What should they say?","long":true},{"kind":"voice","key":"voice","label":"Voice"},{"kind":"upload","key":"audio","label":"…or upload audio instead","accepts":"audio/*"}]},{"id":"render","intent":"Render and review.","presents":["BLK_MEDIA"],"inputs":[]}]'::jsonb,
    $skill_4$---
id: SKL_TALKING_HEAD
appId: talking-head
label: Talking Head Studio
kind: wizard
intent: Lipsync a portrait to a script or uploaded audio.
oneLiner: Lipsync a portrait to a script or uploaded audio.
outputs: [video]
matches: [talking head, lipsync, avatar, spokesperson]
usesBlocks: [BLK_UPLOAD, BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# Talking Head Studio

1. **Portrait** — `BLK_UPLOAD` OR pick from Library OR generate (Nano Banana).
2. **Script** — `BLK_FORM` (script + voice) OR `BLK_UPLOAD` (audio).
3. **Render** — `BLK_MEDIA` for review.
$skill_4$,
    4
  ),
  (
    'SKL_ANIME_WORLD_CUP',
    'anime-world-cup',
    'Anime World Cup 2026',
    'wizard',
    'Anime-style World Cup 2026 highlight from a selfie.',
    'Anime-style World Cup 2026 highlight — selfie + team + anime genre mode.',
    ARRAY['video']::text[],
    ARRAY['world cup', 'anime', 'football', 'soccer']::text[],
    ARRAY['BLK_UPLOAD', 'BLK_OPTIONS', 'BLK_FORM', 'BLK_MEDIA']::text[],
    NULL,
    NULL,
    '[{"id":"selfie","intent":"Get a selfie reference for the player. Offer upload, camera, AND library picker in the same card (the real app accepts all three).","presents":["BLK_UPLOAD"],"inputs":[{"kind":"upload","key":"selfie","label":"Upload selfie","accepts":"image/*"},{"kind":"asset-picker","key":"selfieFromLibrary","label":"…or pick from Library","mediaKinds":["image"]}]},{"id":"team","intent":"Pick country/team AND opponent — show the FULL FIFA World Cup 2026 roster as pills, exactly like the real app. Do not truncate to a subset.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"team","label":"Your team","options":["Brazil","Argentina","France","Germany","Spain","England","Portugal","Netherlands","Italy","Belgium","Croatia","Uruguay","Mexico","USA","Canada","Japan","South Korea","Morocco","Senegal","Colombia"]},{"kind":"choice","key":"opponent","label":"Opponent","options":["Brazil","Argentina","France","Germany","Spain","England","Portugal","Netherlands","Italy","Belgium","Croatia","Uruguay","Mexico","USA","Canada","Japan","South Korea","Morocco","Senegal","Colombia"]}]},{"id":"mode","intent":"Pick anime genre mode. Render each option as a large text-and-emoji tile (use the mode''s emoji + label + a short descriptor). DO NOT reference any /anime-modes/*.jpg image path — those files do not exist and will render as broken thumbnails.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"modeId","label":"Anime mode","options":["Battle Shonen","Magical Girl","Sports Anime","Fantasy Adventure","Cinematic Anime","Superhero","Psychic","Mecha","Cyberpunk","Retro 90s Cel","Romance Drama","Comedy"]}],"notes":"Emoji+label pairs: ⚔️ Battle Shonen, 🌸 Magical Girl, ⚽ Sports Anime, ✨ Fantasy Adventure, 🌌 Cinematic Anime, 💥 Superhero, 🧠 Psychic, 🤖 Mecha, 🌃 Cyberpunk, 🎞️ Retro 90s Cel, ❤️ Romance Drama, 😂 Comedy"},{"id":"moment","intent":"Describe the moment (optional — model is free to interpret).","presents":["BLK_FORM"],"inputs":[{"kind":"text","key":"moment","label":"The moment","long":true}]},{"id":"render","intent":"Single-shot render via run_model_app (model: bytedance/seedance-2.0/text-to-video). This is a ONE-SHOT app — generate exactly ONE video clip; do NOT propose multi-beat storyboards, do NOT offer to ''fix timing on shot 3'', and do NOT loop into more shots after the render. ALWAYS pass the selfie asset URL via referenceImageUrls so the player looks like the user.","presents":["BLK_MEDIA"],"inputs":[]}]'::jsonb,
    $skill_5$---
id: SKL_ANIME_WORLD_CUP
appId: anime-world-cup
label: Anime World Cup 2026
kind: wizard
intent: Anime-style World Cup 2026 highlight from a selfie.
oneLiner: Anime-style World Cup 2026 highlight — selfie + team + anime genre mode.
outputs: [video]
matches: [world cup, anime, football, soccer]
usesBlocks: [BLK_UPLOAD, BLK_OPTIONS, BLK_FORM, BLK_MEDIA]
---

# Anime World Cup 2026

ONE-SHOT app — generate exactly ONE video clip. Do NOT propose multi-beat storyboards, do NOT offer to "fix timing on shot 3", and do NOT loop into more shots after the render.

1. **Selfie** — `BLK_UPLOAD` (with camera + Library picker). Reference image required.
2. **Team + opponent** — `BLK_OPTIONS` with the FULL FIFA World Cup 2026 roster as pills. Do not truncate.
3. **Mode** — `BLK_OPTIONS` for anime genre mode. Render each as a large text-and-emoji tile (emoji + label + short descriptor). DO NOT reference any /anime-modes/*.jpg image path — those files do not exist.
4. **Moment** — `BLK_FORM` optional text describing the moment.
5. **Render** — run_model_app with bytedance/seedance-2.0/text-to-video, ALWAYS pass the selfie asset URL via referenceImageUrls.
$skill_5$,
    5
  ),
  (
    'SKL_MODEL_SEEDANCE_2',
    'model-seedance-2',
    'Seedance 2.0',
    'model',
    'Flagship cinematic text-to-video. Best for hero shots.',
    'Flagship cinematic text-to-video. Best for hero shots.',
    ARRAY['video']::text[],
    ARRAY['seedance', 'hero shot', 'cinematic clip']::text[],
    ARRAY['BLK_FORM', 'BLK_MEDIA', 'BLK_ACTIONS']::text[],
    'bytedance/seedance-2.0/text-to-video',
    'video',
    '[]'::jsonb,
    $skill_6$---
id: SKL_MODEL_SEEDANCE_2
appId: model-seedance-2
label: Seedance 2.0
kind: model
intent: Flagship cinematic text-to-video. Best for hero shots.
oneLiner: Flagship cinematic text-to-video. Best for hero shots.
outputs: [video]
model: bytedance/seedance-2.0/text-to-video
matches: [seedance, hero shot, cinematic clip]
usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# Seedance 2.0

Flagship cinematic text-to-video. Best for hero shots.

Collect the model's params in ONE `BLK_FORM` turn (prompt + optional reference images), then call `run_model_app` with this app id. Show the returned URL as a `BLK_MEDIA` block.$skill_6$,
    6
  ),
  (
    'SKL_MODEL_SEEDANCE_2_MINI',
    'model-seedance-2-mini',
    'Seedance 2.0 Mini',
    'model',
    'Fast, lower-cost Seedance — best default for quick clips.',
    'Fast, lower-cost Seedance — best default for quick clips.',
    ARRAY['video']::text[],
    ARRAY['quick clip', 'fast video']::text[],
    ARRAY['BLK_FORM', 'BLK_MEDIA', 'BLK_ACTIONS']::text[],
    'bytedance/seedance-2.0/mini/text-to-video',
    'video',
    '[]'::jsonb,
    $skill_7$---
id: SKL_MODEL_SEEDANCE_2_MINI
appId: model-seedance-2-mini
label: Seedance 2.0 Mini
kind: model
intent: Fast, lower-cost Seedance — best default for quick clips.
oneLiner: Fast, lower-cost Seedance — best default for quick clips.
outputs: [video]
model: bytedance/seedance-2.0/mini/text-to-video
matches: [quick clip, fast video]
usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# Seedance 2.0 Mini

Fast, lower-cost Seedance — best default for quick clips.

Collect the model's params in ONE `BLK_FORM` turn (prompt + optional reference images), then call `run_model_app` with this app id. Show the returned URL as a `BLK_MEDIA` block.$skill_7$,
    7
  ),
  (
    'SKL_MODEL_VEO_3',
    'model-veo-3',
    'Google Veo 3',
    'model',
    'Veo 3 cinematic t2v with native audio.',
    'Veo 3 cinematic t2v with native audio.',
    ARRAY['video']::text[],
    ARRAY['veo', 'with sound']::text[],
    ARRAY['BLK_FORM', 'BLK_MEDIA', 'BLK_ACTIONS']::text[],
    'fal-ai/veo3',
    'video',
    '[]'::jsonb,
    $skill_8$---
id: SKL_MODEL_VEO_3
appId: model-veo-3
label: Google Veo 3
kind: model
intent: Veo 3 cinematic t2v with native audio.
oneLiner: Veo 3 cinematic t2v with native audio.
outputs: [video]
model: fal-ai/veo3
matches: [veo, with sound]
usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# Google Veo 3

Veo 3 cinematic t2v with native audio.

Collect the model's params in ONE `BLK_FORM` turn (prompt + optional reference images), then call `run_model_app` with this app id. Show the returned URL as a `BLK_MEDIA` block.$skill_8$,
    8
  ),
  (
    'SKL_MODEL_VEO_3_I2V',
    'model-veo-3-i2v',
    'Veo 3 Image-to-Video',
    'model',
    'Animate any still image with Veo 3 + native audio.',
    'Animate any still image with Veo 3 + native audio.',
    ARRAY['video']::text[],
    ARRAY['animate image', 'image to video']::text[],
    ARRAY['BLK_FORM', 'BLK_MEDIA', 'BLK_ACTIONS']::text[],
    'fal-ai/veo3/image-to-video',
    'video',
    '[]'::jsonb,
    $skill_9$---
id: SKL_MODEL_VEO_3_I2V
appId: model-veo-3-i2v
label: Veo 3 Image-to-Video
kind: model
intent: Animate any still image with Veo 3 + native audio.
oneLiner: Animate any still image with Veo 3 + native audio.
outputs: [video]
model: fal-ai/veo3/image-to-video
matches: [animate image, image to video]
usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# Veo 3 Image-to-Video

Animate any still image with Veo 3 + native audio.

Collect the model's params in ONE `BLK_FORM` turn (prompt + optional reference images), then call `run_model_app` with this app id. Show the returned URL as a `BLK_MEDIA` block.$skill_9$,
    9
  ),
  (
    'SKL_MODEL_KLING_3',
    'model-kling-3',
    'Kling 3.0',
    'model',
    'Kling 3 t2v — strong motion and dynamics.',
    'Kling 3 t2v — strong motion and dynamics.',
    ARRAY['video']::text[],
    ARRAY['kling', 'motion']::text[],
    ARRAY['BLK_FORM', 'BLK_MEDIA', 'BLK_ACTIONS']::text[],
    'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    'video',
    '[]'::jsonb,
    $skill_10$---
id: SKL_MODEL_KLING_3
appId: model-kling-3
label: Kling 3.0
kind: model
intent: Kling 3 t2v — strong motion and dynamics.
oneLiner: Kling 3 t2v — strong motion and dynamics.
outputs: [video]
model: fal-ai/kling-video/v2.5-turbo/pro/text-to-video
matches: [kling, motion]
usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# Kling 3.0

Kling 3 t2v — strong motion and dynamics.

Collect the model's params in ONE `BLK_FORM` turn (prompt + optional reference images), then call `run_model_app` with this app id. Show the returned URL as a `BLK_MEDIA` block.$skill_10$,
    10
  ),
  (
    'SKL_MODEL_NANO_BANANA_2',
    'model-nano-banana-2',
    'Nano Banana 2',
    'model',
    'Sharp, prompt-faithful t2i. Best default for stills.',
    'Sharp, prompt-faithful t2i. Best default for stills.',
    ARRAY['image']::text[],
    ARRAY['still image', 'concept art', 'nano banana']::text[],
    ARRAY['BLK_FORM', 'BLK_MEDIA', 'BLK_ACTIONS']::text[],
    'fal-ai/nano-banana-2',
    'image',
    '[]'::jsonb,
    $skill_11$---
id: SKL_MODEL_NANO_BANANA_2
appId: model-nano-banana-2
label: Nano Banana 2
kind: model
intent: Sharp, prompt-faithful t2i. Best default for stills.
oneLiner: Sharp, prompt-faithful t2i. Best default for stills.
outputs: [image]
model: fal-ai/nano-banana-2
matches: [still image, concept art, nano banana]
usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# Nano Banana 2

Sharp, prompt-faithful t2i. Best default for stills.

Collect the model's params in ONE `BLK_FORM` turn (prompt + optional reference images), then call `run_model_app` with this app id. Show the returned URL as a `BLK_MEDIA` block.$skill_11$,
    11
  ),
  (
    'SKL_MODEL_GPT_IMAGE_2',
    'model-gpt-image-2',
    'GPT Image 2',
    'model',
    'OpenAI GPT Image 2 — strong typography and text in image.',
    'OpenAI GPT Image 2 — strong typography and text in image.',
    ARRAY['image']::text[],
    ARRAY['poster', 'text in image', 'typography']::text[],
    ARRAY['BLK_FORM', 'BLK_MEDIA', 'BLK_ACTIONS']::text[],
    'openai/gpt-image-2',
    'image',
    '[]'::jsonb,
    $skill_12$---
id: SKL_MODEL_GPT_IMAGE_2
appId: model-gpt-image-2
label: GPT Image 2
kind: model
intent: OpenAI GPT Image 2 — strong typography and text in image.
oneLiner: OpenAI GPT Image 2 — strong typography and text in image.
outputs: [image]
model: openai/gpt-image-2
matches: [poster, text in image, typography]
usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# GPT Image 2

OpenAI GPT Image 2 — strong typography and text in image.

Collect the model's params in ONE `BLK_FORM` turn (prompt + optional reference images), then call `run_model_app` with this app id. Show the returned URL as a `BLK_MEDIA` block.$skill_12$,
    12
  ),
  (
    'SKL_MODEL_SEEDREAM',
    'model-seedream',
    'Seedream',
    'model',
    'High-fidelity t2i from ByteDance.',
    'High-fidelity t2i from ByteDance.',
    ARRAY['image']::text[],
    ARRAY['seedream', 'photoreal']::text[],
    ARRAY['BLK_FORM', 'BLK_MEDIA', 'BLK_ACTIONS']::text[],
    'fal-ai/bytedance/seedream/v4/text-to-image',
    'image',
    '[]'::jsonb,
    $skill_13$---
id: SKL_MODEL_SEEDREAM
appId: model-seedream
label: Seedream
kind: model
intent: High-fidelity t2i from ByteDance.
oneLiner: High-fidelity t2i from ByteDance.
outputs: [image]
model: fal-ai/bytedance/seedream/v4/text-to-image
matches: [seedream, photoreal]
usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# Seedream

High-fidelity t2i from ByteDance.

Collect the model's params in ONE `BLK_FORM` turn (prompt + optional reference images), then call `run_model_app` with this app id. Show the returned URL as a `BLK_MEDIA` block.$skill_13$,
    13
  ),
  (
    'SKL_MODEL_ELEVEN_TTS',
    'model-eleven-tts',
    'ElevenLabs TTS',
    'model',
    'Multilingual high-quality text-to-speech.',
    'Multilingual high-quality text-to-speech.',
    ARRAY['speech']::text[],
    ARRAY['tts', 'voice over', 'narration']::text[],
    ARRAY['BLK_FORM', 'BLK_MEDIA', 'BLK_ACTIONS']::text[],
    'fal-ai/elevenlabs/tts/multilingual-v2',
    'speech',
    '[]'::jsonb,
    $skill_14$---
id: SKL_MODEL_ELEVEN_TTS
appId: model-eleven-tts
label: ElevenLabs TTS
kind: model
intent: Multilingual high-quality text-to-speech.
oneLiner: Multilingual high-quality text-to-speech.
outputs: [speech]
model: fal-ai/elevenlabs/tts/multilingual-v2
matches: [tts, voice over, narration]
usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# ElevenLabs TTS

Multilingual high-quality text-to-speech.

Collect the model's params in ONE `BLK_FORM` turn (prompt + optional reference images), then call `run_model_app` with this app id. Show the returned URL as a `BLK_MEDIA` block.$skill_14$,
    14
  ),
  (
    'SKL_MODEL_CASSETTE_MUSIC',
    'model-cassette-music',
    'Cassette Music',
    'model',
    'Generate original music beds.',
    'Generate original music beds.',
    ARRAY['audio']::text[],
    ARRAY['music bed', 'song', 'score']::text[],
    ARRAY['BLK_FORM', 'BLK_MEDIA', 'BLK_ACTIONS']::text[],
    'cassetteai/music-generator',
    'audio',
    '[]'::jsonb,
    $skill_15$---
id: SKL_MODEL_CASSETTE_MUSIC
appId: model-cassette-music
label: Cassette Music
kind: model
intent: Generate original music beds.
oneLiner: Generate original music beds.
outputs: [audio]
model: cassetteai/music-generator
matches: [music bed, song, score]
usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# Cassette Music

Generate original music beds.

Collect the model's params in ONE `BLK_FORM` turn (prompt + optional reference images), then call `run_model_app` with this app id. Show the returned URL as a `BLK_MEDIA` block.$skill_15$,
    15
  ),
  (
    'SKL_MODEL_STABLE_AUDIO',
    'model-stable-audio',
    'Stable Audio SFX',
    'model',
    'One-shot sound effects from a description.',
    'One-shot sound effects from a description.',
    ARRAY['audio']::text[],
    ARRAY['sfx', 'sound effect']::text[],
    ARRAY['BLK_FORM', 'BLK_MEDIA', 'BLK_ACTIONS']::text[],
    'fal-ai/stable-audio-25/text-to-audio',
    'audio',
    '[]'::jsonb,
    $skill_16$---
id: SKL_MODEL_STABLE_AUDIO
appId: model-stable-audio
label: Stable Audio SFX
kind: model
intent: One-shot sound effects from a description.
oneLiner: One-shot sound effects from a description.
outputs: [audio]
model: fal-ai/stable-audio-25/text-to-audio
matches: [sfx, sound effect]
usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# Stable Audio SFX

One-shot sound effects from a description.

Collect the model's params in ONE `BLK_FORM` turn (prompt + optional reference images), then call `run_model_app` with this app id. Show the returned URL as a `BLK_MEDIA` block.$skill_16$,
    16
  ),
  (
    'SKL_CREATE_SKILL',
    'create-skill',
    'Create a new Skill',
    'meta',
    'Author a new Skill pack the agent can call.',
    'Walk the user through authoring a new Skill stored in Supabase.',
    ARRAY[]::text[],
    ARRAY['create skill', 'new skill', 'add app', 'add capability', 'extend agent']::text[],
    ARRAY['BLK_FORM', 'BLK_STORYBOARD', 'BLK_LIST', 'BLK_ACTIONS']::text[],
    NULL,
    NULL,
    '[{"id":"manifest","intent":"Collect skill metadata: id, label, kind, intent, outputs, matches.","presents":["BLK_FORM"],"inputs":[{"kind":"text","key":"label","label":"Skill label (human name)"},{"kind":"text","key":"intent","label":"One-sentence intent","long":true},{"kind":"choice","key":"kind","label":"Kind","options":["wizard","model"]},{"kind":"text","key":"matches","label":"Trigger phrases (comma-separated)","long":true}]},{"id":"steps","intent":"Draft the step playbook. One slide per step, each naming the BLK_* id it presents and the inputs it collects. User can add / rework / reorder.","presents":["BLK_STORYBOARD"],"inputs":[]},{"id":"review","intent":"Show the composed skill.md as a list for confirmation.","presents":["BLK_LIST","BLK_ACTIONS"],"inputs":[]},{"id":"commit","intent":"Save the confirmed skill definition and Markdown to Supabase so it becomes available without a code deploy.","inputs":[]}]'::jsonb,
    $skill_17$---
id: SKL_CREATE_SKILL
appId: create-skill
label: Create a new Skill
kind: meta
intent: Author a new Skill pack the agent can call.
oneLiner: Walk the user through authoring a new Skill stored in Supabase.
outputs: []
matches: [create skill, new skill, add app, add capability]
usesBlocks: [BLK_FORM, BLK_STORYBOARD, BLK_ACTIONS]
---

# Create a new Skill (meta-skill)

The skill that creates skills. Walk the user through authoring a new skill stored in Supabase.

1. **Manifest brief** — `BLK_FORM` for `{id (SKL_*), label, kind (wizard|model), intent (one sentence), outputs, matches}`.
2. **Steps** — `BLK_STORYBOARD` — one slide per step, each naming the `BLK_*` id it presents and the inputs it collects. User can add/rework/reorder.
3. **Review** — Show the composed skill.md as a `list` for confirmation.
4. **Commit** — Save the confirmed definition and Markdown to Supabase so the skill becomes available without a code deploy.

Reference blocks to draw on: run `get_block_reference({ ids: [BLK_OPTIONS, BLK_FORM, BLK_UPLOAD, BLK_MEDIA, BLK_GALLERY, BLK_MOODBOARD, BLK_STORYBOARD, BLK_TIMELINE, BLK_STAGE, BLK_LIST, BLK_ACTIONS, BLK_CUSTOM_HTML] })` for the full spec.
$skill_17$,
    17
  );

-- Preserve any live edits made while the hybrid implementation was active.
-- If several users edited the same app, the most recently edited body wins.
UPDATE public.agent_skills AS skill
SET
  body_md = latest.body_md,
  version = skill.version + 1,
  updated_at = latest.updated_at
FROM (
  SELECT DISTINCT ON (app_id)
    app_id,
    body_md,
    updated_at
  FROM public.skill_playbook_overrides
  ORDER BY app_id, updated_at DESC
) AS latest
WHERE skill.app_id = latest.app_id;

-- Keep the legacy override table as an unused safety archive. Runtime code no
-- longer reads or writes it; it can be removed later after a retention window.

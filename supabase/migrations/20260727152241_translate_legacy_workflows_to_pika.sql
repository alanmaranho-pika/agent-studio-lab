BEGIN;

SELECT set_config('app.skill_actor_type', 'coding_agent', true);
SELECT set_config('app.skill_actor_name', 'Codex · legacy workflow translation', true);
SELECT set_config('app.skill_action', 'edit', true);

-- The selected skill body is the detailed runtime playbook. The steps JSON is
-- also refreshed because it powers catalog summaries before a skill is selected.
UPDATE public.agent_skills AS skill
SET
  uses_blocks = source.uses_blocks,
  steps = source.steps,
  body_md = source.body_md
FROM (
  VALUES
  (
    'SKL_SHORT_FILM',
    ARRAY['BLK_OPTIONS','BLK_FORM','BLK_UPLOAD','BLK_MOODBOARD','BLK_STORYBOARD','BLK_GALLERY','BLK_MEDIA','BLK_TIMELINE','BLK_ACTIONS']::text[],
    $json$[
      {"id":"premise","intent":"Lock premise and duration; skip fields already answered.","presents":["BLK_FORM"],"inputs":[{"kind":"text","key":"logline","label":"Logline (1–2 sentences)","long":true},{"kind":"choice","key":"lengthSec","label":"Length","options":["8s","15s","30s","1m","1m 30s","2m"]}]},
      {"id":"aspect","intent":"Aspect ratio in its own visual options turn.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"aspect","label":"Aspect ratio","options":["16:9","9:16","1:1"]}]},
      {"id":"world","intent":"Reuse Library characters, products, and environments before creating new ones.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"character","key":"characters","label":"Characters from Library","multi":true},{"kind":"environment","key":"environments","label":"Environment from Library"}]},
      {"id":"audio","intent":"Choose audio approach before the storyboard; collect direction only if needed.","presents":["BLK_OPTIONS","BLK_FORM"],"inputs":[{"kind":"choice","key":"audioMode","label":"Audio approach","options":["Music bed only","Voiceover narration","Talking characters","Mix music + VO + dialogue","Ambience only"]},{"kind":"text","key":"audioNotes","label":"Audio direction","long":true}]},
      {"id":"treatment","intent":"Present 2–3 mutually exclusive treatments side by side, then lock one.","presents":["BLK_OPTIONS"],"inputs":[]},
      {"id":"storyboard","intent":"Create timed shots with still prompts, motion prompts, audio cues, and continuity locks.","presents":["BLK_STORYBOARD"],"inputs":[{"kind":"text","key":"styleNotes","label":"Visual direction","long":true}]},
      {"id":"timeline","intent":"Patch scenes and show the required timeline preview before rendering.","presents":["BLK_TIMELINE"],"inputs":[]},
      {"id":"render","intent":"Pick a Pika endpoint by shot constraint, then run anchor-first and return every result to the timeline.","presents":["BLK_OPTIONS","BLK_GALLERY","BLK_TIMELINE"],"inputs":[{"kind":"choice","key":"videoPath","label":"Render path","options":["Seedance 2.0 · multi-reference hero","Kling 3 Pro · controlled camera","Veo 3.1 Lite · native audio","Seedance Mini · fast drafts"]}]}
    ]$json$::jsonb,
    $skill$---
id: SKL_SHORT_FILM
appId: short-film
label: Short Film
kind: wizard
intent: Take an idea to a finished multi-shot short.
oneLiner: Develop, board, render, and review a continuity-safe short film.
outputs: [video]
matches: [short film, narrative video, multi-shot, movie]
usesBlocks: [BLK_OPTIONS, BLK_FORM, BLK_UPLOAD, BLK_MOODBOARD, BLK_STORYBOARD, BLK_GALLERY, BLK_MEDIA, BLK_TIMELINE, BLK_ACTIONS]
---

# Short Film

Build a coherent film, not a set of unrelated clips. Treat these steps as a stateful checklist: persist facts as soon as they appear, skip answered questions, and resume this playbook after any character/model detour.

**Required result:** once the treatment, audio plan, and shots are locked, always land on one `BLK_TIMELINE`. Pending shots are placeholders; finished shots replace them. Never scatter the film across loose media cards.

## 1 — Premise and format

- Lock `{logline, targetDuration}` in `meta`. If duration is unstated, recommend the shortest length that tells the idea cleanly.
- Ask aspect ratio in its own `BLK_OPTIONS` turn and persist it.
- Set a working title and current logline within the first two turns.

## 2 — Reuse the Library

- Search existing characters, products, scenes, and logos before asking for uploads or generating replacements.
- Attach selected assets to the project. A new character is a detour into Character Creator; after save, resume here without re-asking film decisions.
- Create a continuity bible in memory: canonical appearance, wardrobe, environment, palette, lighting logic, and authoritative reference assets.

## 3 — Audio before pictures

- Choose the audio approach in `BLK_OPTIONS`: music, VO, dialogue, mix, or ambience.
- Ask direction in a separate form only when needed. Dialogue and VO must be short enough for the target duration.
- Audio determines shot timing, performance, and where silence is useful; never write the storyboard first.

## 4 — Treatments

- Pitch 2–3 genuinely different treatments as side-by-side `BLK_OPTIONS` cards. Each pitch names its dramatic engine, visual grammar, pacing, and ending image.
- Lock one treatment with `note_decision`; do not average the options together.

## 5 — Storyboard and prompts

- Break the approved treatment into purposeful shots. Each shot stores `{id, n, title, duration, prompt, motionPrompt}` and any VO/audio cue.
- Still prompt: authoritative subject/reference, exact moment, environment, composition, lens, lighting, palette/materials, and exclusions.
- Motion prompt: opening state, subject action, camera move, environmental motion, physical response, final state, continuity locks, and sound intent.
- Repeat the continuity bible details that matter in every shot. Use one clear visual beat per shot; split overloaded actions.
- Present the ordered shots as `BLK_STORYBOARD`, then patch scenes and show `BLK_TIMELINE`.

## 6 — Model choice and anchor-first production

Offer human-readable choices, then persist the exact app/API mapping:

- Seedance 2.0 → `model-seedance-2` / `bytedance/seedance-2.0/reference-to-video`: multi-reference hero shots and native audio.
- Kling 3 Pro → `model-kling-3` / `kling/kling-v3/pro/image-to-video`: controlled cinematic movement from one frame.
- Veo 3.1 Lite → `model-veo-3-i2v` / `google/veo-3.1-lite/image-to-video`: image-led shots where native audio matters.
- Seedance Mini → `model-seedance-2-mini` / `bytedance/seedance-2.0-mini/reference-to-video`: drafts and secondary shots.

For every shot: generate still anchor → show one-image gallery → approve/regenerate/tweak → animate the approved URL via `referenceImageUrls`. Keep aspect ratio unchanged. After each completion, return to the timeline.

## 7 — Review

- Judge continuity, readable action, cut rhythm, audio sync, and whether every shot advances the film.
- Re-render only the weak shot with the same locked references and a targeted prompt change.
- Final review/export actions live on the timeline.$skill$
  ),
  (
    'SKL_PRODUCT_AD',
    ARRAY['BLK_UPLOAD','BLK_FORM','BLK_OPTIONS','BLK_STORYBOARD','BLK_GALLERY','BLK_MEDIA','BLK_TIMELINE','BLK_ACTIONS']::text[],
    $json$[
      {"id":"product","intent":"Get the authoritative product from URL, upload, or Library before ideation.","presents":["BLK_UPLOAD"],"inputs":[{"kind":"url","key":"productUrl","label":"Paste product URL","placeholder":"https://…"},{"kind":"upload","key":"productImage","label":"…or upload product photos","accepts":"image/*"}]},
      {"id":"brief","intent":"Lock hook, audience, objective, and length; default to 15s when the user delegates.","presents":["BLK_FORM"],"inputs":[{"kind":"text","key":"tagline","label":"Tagline or hook"},{"kind":"text","key":"audience","label":"Audience"},{"kind":"choice","key":"lengthSec","label":"Length","options":["8s","15s","30s","1m"]}]},
      {"id":"aspect","intent":"Aspect ratio in its own visual options turn.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"aspect","label":"Aspect ratio","options":["16:9","9:16","1:1"]}]},
      {"id":"audio","intent":"Choose audio before concepts; collect direction only when needed.","presents":["BLK_OPTIONS","BLK_FORM"],"inputs":[{"kind":"choice","key":"audioMode","label":"Audio approach","options":["Music bed","Voiceover","Talking spokesperson","Music + VO","Ambience only"]},{"kind":"text","key":"audioNotes","label":"Audio direction","long":true}]},
      {"id":"concept","intent":"Present 3 distinct strategic concepts side by side; convert the selected concept into timed scenes.","presents":["BLK_OPTIONS"],"inputs":[]},
      {"id":"style","intent":"Lock an art direction derived from the product and brand assets.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"look","label":"Look","options":["Cinematic","Clean studio","Lifestyle","Editorial"]}]},
      {"id":"timeline","intent":"Create product-locked anchors and consolidate every shot on one timeline.","presents":["BLK_GALLERY","BLK_TIMELINE"],"inputs":[]},
      {"id":"produce","intent":"Pick the endpoint by fidelity/camera/audio need and animate approved anchors only.","presents":["BLK_OPTIONS","BLK_TIMELINE"],"inputs":[{"kind":"choice","key":"videoPath","label":"Render path","options":["Seedance 2.0 · product fidelity","Kling 3 Pro · camera control","Veo 3.1 Lite · native audio"]}]}
    ]$json$::jsonb,
    $skill$---
id: SKL_PRODUCT_AD
appId: product-ad
label: Product Ad
kind: wizard
intent: Turn a product reference into a polished, brand-faithful ad.
oneLiner: Build a product-locked concept, shot plan, and finished ad timeline.
outputs: [video]
matches: [product ad, commercial, ad, marketing]
usesBlocks: [BLK_UPLOAD, BLK_FORM, BLK_OPTIONS, BLK_STORYBOARD, BLK_GALLERY, BLK_MEDIA, BLK_TIMELINE, BLK_ACTIONS]
---

# Product Ad

The product is the hero and its references are authoritative. Never invent a generic replacement, alter packaging, redraw a logo, or change materials/colorway.

**Required result:** one `BLK_TIMELINE` containing every shot. Patch scenes as soon as a concept is approved so placeholders exist before rendering.

## 1 — Product truth first

- Offer URL import, upload, and Library reuse. On URL, call `product_ad.scrape_url`; store the hero image and any useful detail angles.
- Build a product identity bible: exact silhouette, proportions, material, finish, color, hardware, label/logo placement, scale, and distinctive details.
- Derive a proposed palette and lighting direction from the product/brand asset; present it as a recommendation, not an invented brand rule.

## 2 — Brief and format

- Lock objective, audience, hook/tagline, and duration. If the user delegates length, choose 15 seconds and confirm it inline.
- Ask aspect ratio separately and preserve it through every anchor and video render.
- Choose audio before concepts so scripts and pacing are feasible.

## 3 — Concepts

- Present exactly three strategic directions side by side: each needs a different hook, product demonstration, visual grammar, and end frame.
- Make the product benefit visible through action rather than unsupported copy.
- On selection, persist the concept and translate it into 2–6 timed scenes. One shot = one clear product beat.

## 4 — Product-locked shot design

Each scene needs:

- a still prompt naming the product reference as authoritative, with composition, lens, set, lighting, material behavior, product orientation, and exact exclusions;
- a motion prompt defining product action, camera move, environmental response, opening/final states, and a hard lock against logo/packaging drift;
- VO/dialogue/music cues that fit the exact duration.

Use `referenceImageUrls` on every still and video phase. For multiple product angles, Seedance can receive ordered references; `@Image1` is the primary hero/product anchor.

## 5 — Anchor and render

- Generate every scene anchor with the product references. Show anchors in timeline order and get approval before video.
- Seedance 2.0 (`model-seedance-2`) for multi-reference product fidelity and hero shots.
- Kling 3 Pro (`model-kling-3`) for controlled camera/object motion from one approved frame.
- Veo 3.1 Lite (`model-veo-3-i2v`) when native audio is the deciding constraint.
- Return every finished clip to the timeline. Re-render only the failing shot and change one variable at a time.

Final review checks product identity, benefit clarity, first-two-second hook, readable end frame, audio fit, and continuity.$skill$
  ),
  (
    'SKL_MUSIC_VIDEO',
    ARRAY['BLK_UPLOAD','BLK_FORM','BLK_OPTIONS','BLK_MOODBOARD','BLK_STORYBOARD','BLK_GALLERY','BLK_MEDIA','BLK_TIMELINE','BLK_ACTIONS']::text[],
    $json$[
      {"id":"track","intent":"Choose upload versus generated music first; do not discuss visuals until a track direction exists.","presents":["BLK_OPTIONS","BLK_UPLOAD","BLK_FORM"],"inputs":[{"kind":"choice","key":"trackPath","label":"Track source","options":["Upload a finished track","Generate an original track"]},{"kind":"upload","key":"trackUpload","label":"Upload track","accepts":"audio/*"},{"kind":"text","key":"musicPrompt","label":"Track brief","long":true}]},
      {"id":"format","intent":"Choose performance, narrative, or visualizer structure.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"format","label":"Video structure","options":["Performance-led","Narrative-led","Abstract visualizer","Hybrid"]}]},
      {"id":"style","intent":"Lock one visual system with recurring motifs and continuity rules.","presents":["BLK_MOODBOARD"],"inputs":[{"kind":"text","key":"styleNotes","label":"Visual direction","long":true}]},
      {"id":"aspect","intent":"Aspect ratio in its own turn.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"aspect","label":"Aspect ratio","options":["16:9","9:16","1:1"]}]},
      {"id":"storyboard","intent":"Build one visual beat per roughly 4–6 seconds with musical landmarks and transition logic.","presents":["BLK_STORYBOARD"],"inputs":[]},
      {"id":"produce","intent":"Use audio-to-video for a track-driven hero clip or anchor-first video shots for an edited sequence; consolidate on timeline.","presents":["BLK_GALLERY","BLK_TIMELINE"],"inputs":[]}
    ]$json$::jsonb,
    $skill$---
id: SKL_MUSIC_VIDEO
appId: music-video
label: Music Video
kind: wizard
intent: Build a beat-aware video around an uploaded or generated track.
oneLiner: Turn a track into a coherent visual system, timed storyboard, and editable cut.
outputs: [video]
matches: [music video, music, song, track, visualizer]
usesBlocks: [BLK_UPLOAD, BLK_FORM, BLK_OPTIONS, BLK_MOODBOARD, BLK_STORYBOARD, BLK_GALLERY, BLK_MEDIA, BLK_TIMELINE, BLK_ACTIONS]
---

# Music Video

The music is the edit spine. Never choose visuals before the track source and direction are known.

## 1 — Track first

- Ask one choice: upload a finished track or generate an original track.
- Upload path: collect audio and persist its URL before discussing style.
- Generate path: collect genre, tempo/energy, instrumentation, vocal/instrumental intent, and duration; call `model-eleven-music`. Wait for the finished asset before storyboarding.

## 2 — Creative structure

- Pick one structure in `BLK_OPTIONS`: performance-led, narrative-led, abstract visualizer, or hybrid.
- Build a compact music map from available facts: intro, first downbeat, section changes, breakdown, peak, outro. Do not claim waveform/BPM analysis unless a tool actually returned it.
- Lock a visual system: recurring subject/motif, palette, lens/camera grammar, texture, and transition language. Show a moodboard or side-by-side visual directions before shot writing.
- Ask aspect ratio separately.

## 3 — Beat storyboard

- Default to one visual beat every ~4–6 seconds; use faster cuts only around a real musical peak.
- Each shot records time range, musical cue, still prompt, motion prompt, and transition into the next shot.
- Alternate scale and energy deliberately. Repeat motifs with escalation instead of generating unrelated scenes.
- Patch scenes and show one `BLK_TIMELINE`; the uploaded/generated track belongs on its audio track.

## 4 — Production paths

- **Single audio-driven hero/visualizer:** `run_model_app({appId:"model-ltx-audio-video", referenceAudioUrl:<track URL>, referenceImageUrls:[approved look anchor]})`. LTX uses the track as the motion driver.
- **Edited multi-shot video:** generate and approve one anchor per shot, then use Seedance/Kling/Veo according to reference and camera needs. Keep the original track on the timeline; shots are timed to its map.
- For performance continuity, reuse the same character and wardrobe references in every shot. For abstract work, reuse the same motif/palette bible.

Review cut rhythm, visual repetition, energy curve, continuity, and whether transitions land on musical changes. Re-render weak shots without changing the locked visual system.$skill$
  ),
  (
    'SKL_CHARACTER_CREATOR',
    ARRAY['BLK_FORM','BLK_OPTIONS','BLK_GALLERY','BLK_MEDIA','BLK_ACTIONS']::text[],
    $json$[
      {"id":"reuse","intent":"Check existing Library characters before creating a duplicate.","presents":["BLK_OPTIONS"],"inputs":[]},
      {"id":"brief","intent":"Lock identity, role, age range, defining traits, and visual medium.","presents":["BLK_FORM"],"inputs":[{"kind":"text","key":"name","label":"Character name"},{"kind":"text","key":"brief","label":"Role, personality, and defining traits","long":true}]},
      {"id":"looks","intent":"Generate four controlled variations from one identity bible and compare them side by side.","presents":["BLK_GALLERY"],"inputs":[]},
      {"id":"voice","intent":"Offer preset voices first; cloning is optional and consent-based.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"voice","key":"voice","label":"Voice"}]},
      {"id":"save","intent":"Save the approved portrait/description/voice to Library and update the parent project cast entry.","presents":["BLK_ACTIONS"],"inputs":[]}
    ]$json$::jsonb,
    $skill$---
id: SKL_CHARACTER_CREATOR
appId: character-creator
label: Character Creator
kind: wizard
intent: Create or update a reusable, reference-stable character.
oneLiner: Define a character, compare four controlled looks, choose a voice, and save to Library.
outputs: [image]
matches: [character, cast, persona, portrait]
usesBlocks: [BLK_FORM, BLK_OPTIONS, BLK_GALLERY, BLK_MEDIA, BLK_ACTIONS]
---

# Character Creator

Create one durable character identity, not four unrelated portraits.

## 1 — Reuse or create

- Call `character.list` before creating. If the same character exists, offer Use / Edit existing / Create different.
- For edits, retain the existing character id and pass the current portrait in `referenceImageUrls`. Never append a duplicate cast entry.

## 2 — Identity bible

Lock name, narrative role, personality, apparent age range, face/hair/skin details, body/build, defining features, wardrobe baseline, and visual medium. Separate canonical identity from changeable styling.

Write a reusable portrait prompt with:

- exact identity and defining features;
- front or 3/4 readable face, neutral-to-characterful expression, clean silhouette;
- consistent crop, lens, lighting, and background across options;
- exclusions for identity drift, face distortion, extra people/limbs, text, and accidental accessories.

## 3 — Four controlled looks

- Queue exactly four `model-nano-banana-2` renders. Keep identity, framing, medium, and lighting stable; vary only a controlled axis such as wardrobe, grooming, or attitude.
- On the next turn, show all four together in one `BLK_GALLERY` with Choose / Regenerate set / Tweak brief.
- Once selected, treat that image as the authoritative portrait. Any later edit must condition on it.

## 4 — Voice

- Offer preset voices first with short descriptors. Voice cloning is opt-in only; require the user to confirm they own or have permission to use the recording.
- Store provider/id/label with the character. Do not make a cloned voice mandatory.

## 5 — Save and resume

- Call `character.upsert` with the approved portrait URL, canonical description, and voice.
- If opened from another workflow, update that parent project's existing cast slot and resume at the next unanswered step. Do not restart the parent wizard.$skill$
  ),
  (
    'SKL_TALKING_HEAD',
    ARRAY['BLK_UPLOAD','BLK_FORM','BLK_OPTIONS','BLK_GALLERY','BLK_MEDIA','BLK_ACTIONS']::text[],
    $json$[
      {"id":"portrait","intent":"Get or create a clean portrait already framed for the target aspect ratio.","presents":["BLK_UPLOAD","BLK_OPTIONS"],"inputs":[{"kind":"upload","key":"portrait","label":"Upload portrait","accepts":"image/*"},{"kind":"asset-picker","key":"portraitFromLibrary","label":"…or pick from Library","mediaKinds":["image"]}]},
      {"id":"aspect","intent":"Aspect ratio in its own turn; crop/regenerate the portrait before animation.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"aspect","label":"Aspect ratio","options":["16:9","9:16","1:1"]}]},
      {"id":"audioPath","intent":"Choose script+voice versus uploaded audio; these are alternatives.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"audioPath","label":"Driving audio","options":["Write a script + choose voice","Upload finished audio"]}]},
      {"id":"audio","intent":"Collect the selected audio input only.","presents":["BLK_FORM","BLK_UPLOAD"],"inputs":[{"kind":"text","key":"script","label":"What should they say?","long":true},{"kind":"voice","key":"voice","label":"Voice"},{"kind":"upload","key":"audio","label":"Upload finished audio","accepts":"audio/*"}]},
      {"id":"render","intent":"After audio exists, animate the portrait with Kling Avatar V2 and review one clip.","presents":["BLK_MEDIA","BLK_ACTIONS"],"inputs":[]}
    ]$json$::jsonb,
    $skill$---
id: SKL_TALKING_HEAD
appId: talking-head
label: Talking Head Studio
kind: wizard
intent: Animate a portrait from a generated voice or uploaded audio.
oneLiner: Prepare a portrait, create or upload speech, and produce a natural avatar clip.
outputs: [video]
matches: [talking head, lipsync, avatar, spokesperson]
usesBlocks: [BLK_UPLOAD, BLK_FORM, BLK_OPTIONS, BLK_GALLERY, BLK_MEDIA, BLK_ACTIONS]
---

# Talking Head Studio

This is a strict portrait → audio → avatar chain. Do not call a generic image-to-video model and pretend it is lip-sync.

## 1 — Portrait

- Reuse Library, upload, or generate. The user must have permission to animate a real person's likeness.
- Require one clear person, face forward or slight 3/4, eyes and mouth visible, no hand over face, no heavy occlusion, and enough head/shoulder margin for motion.
- Ask aspect ratio separately. If needed, create an approved, identity-preserving crop with `model-nano-banana-2` before animation; keep that exact image URL.

## 2 — Driving audio

- Present one choice: Script + voice OR Upload finished audio.
- Script path: keep copy conversational and speakable, add punctuation for pauses, pick a preset voice, then call `model-eleven-tts`. Wait until its audio URL appears in memory.
- Upload path: acknowledge and store the exact audio URL. Kling Avatar accepts 2–300 seconds; ask for a shorter file if outside that range.
- Voice cloning is optional and requires permission; never imitate a public figure without authorization.

## 3 — Avatar render

When both artifacts exist, call:

`run_model_app({appId:"model-kling-avatar", prompt:<performance direction>, referenceImageUrls:[<approved portrait URL>], referenceAudioUrl:<finished audio URL>})`

Performance direction should specify eye contact, restrained head/shoulder motion, expression arc, and stable camera. Do not repeat the script in the prompt; audio drives the mouth.

Show the finished clip in one `BLK_MEDIA` block with Regenerate performance / Change audio / Change portrait. Change one source at a time so the user can judge the result.$skill$
  ),
  (
    'SKL_ANIME_WORLD_CUP',
    ARRAY['BLK_UPLOAD','BLK_OPTIONS','BLK_FORM','BLK_GALLERY','BLK_MEDIA','BLK_ACTIONS']::text[],
    $json$[
      {"id":"selfie","intent":"Get one authoritative selfie via upload, camera, or Library.","presents":["BLK_UPLOAD"],"inputs":[{"kind":"upload","key":"selfie","label":"Upload or take a selfie","accepts":"image/*"},{"kind":"asset-picker","key":"selfieFromLibrary","label":"…or pick from Library","mediaKinds":["image"]}]},
      {"id":"team","intent":"Pick team and opponent from all 48 World Cup 2026 teams.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"team","label":"Your team","options":["Canada","Mexico","USA","Australia","Iraq","IR Iran","Japan","Jordan","Korea Republic","Qatar","Saudi Arabia","Uzbekistan","Algeria","Cabo Verde","Congo DR","Côte d’Ivoire","Egypt","Ghana","Morocco","Senegal","South Africa","Tunisia","Curaçao","Haiti","Panama","Argentina","Brazil","Colombia","Ecuador","Paraguay","Uruguay","New Zealand","Austria","Belgium","Bosnia and Herzegovina","Croatia","Czechia","England","France","Germany","Netherlands","Norway","Portugal","Scotland","Spain","Sweden","Switzerland","Türkiye"]},{"kind":"choice","key":"opponent","label":"Opponent","options":["Canada","Mexico","USA","Australia","Iraq","IR Iran","Japan","Jordan","Korea Republic","Qatar","Saudi Arabia","Uzbekistan","Algeria","Cabo Verde","Congo DR","Côte d’Ivoire","Egypt","Ghana","Morocco","Senegal","South Africa","Tunisia","Curaçao","Haiti","Panama","Argentina","Brazil","Colombia","Ecuador","Paraguay","Uruguay","New Zealand","Austria","Belgium","Bosnia and Herzegovina","Croatia","Czechia","England","France","Germany","Netherlands","Norway","Portugal","Scotland","Spain","Sweden","Switzerland","Türkiye"]}]},
      {"id":"mode","intent":"Pick one anime visual language as large emoji/text tiles.","presents":["BLK_OPTIONS"],"inputs":[{"kind":"choice","key":"modeId","label":"Anime mode","options":["Battle Shonen","Magical Girl","Sports Anime","Fantasy Adventure","Cinematic Anime","Superhero","Psychic","Mecha","Cyberpunk","Retro 90s Cel","Romance Drama","Comedy"]}]},
      {"id":"moment","intent":"Choose one readable 6–10 second football moment.","presents":["BLK_FORM"],"inputs":[{"kind":"text","key":"moment","label":"The moment","long":true}]},
      {"id":"anchor","intent":"Create and approve one anime player frame from the selfie before video.","presents":["BLK_GALLERY"],"inputs":[]},
      {"id":"render","intent":"Animate only the approved anime frame with Seedance reference-to-video; one clip, same ratio.","presents":["BLK_MEDIA","BLK_ACTIONS"],"inputs":[]}
    ]$json$::jsonb,
    $skill$---
id: SKL_ANIME_WORLD_CUP
appId: anime-world-cup
label: Anime World Cup 2026
kind: wizard
intent: Turn a selfie into one identity-safe anime football highlight.
oneLiner: Selfie → approved anime player frame → one cinematic football clip.
outputs: [video]
matches: [world cup, anime, football, soccer]
usesBlocks: [BLK_UPLOAD, BLK_OPTIONS, BLK_FORM, BLK_GALLERY, BLK_MEDIA, BLK_ACTIONS]
---

# Anime World Cup 2026

ONE-SHOT app: produce exactly one 6–10 second clip. The quality-critical architecture is two phases; never send the raw selfie straight into a text-to-video prompt.

## 1 — Inputs

- Collect one selfie, team, opponent, anime mode, and one readable moment.
- Team/opponent options use the full 48-team 2026 roster. Render mode choices as emoji + label + one-line descriptor; never reference missing thumbnail paths.
- Keep the moment to one action arc: setup → decisive action → reaction/final pose.
- Ask aspect ratio only if not already known and use it unchanged in both phases.

## 2 — Anime identity anchor

- Call `run_model_app` with `appId:"model-nano-banana-2"` and the selfie in `referenceImageUrls`.
- Prompt for a broadcast-quality anime football frame: exact facial likeness and defining features, team-color-inspired kit without copied sponsor marks/official crests, chosen anime line/paint language, stadium composition, camera/lens, floodlight direction, palette, and clean anatomy.
- Reference: user selfie via `referenceImageUrls`.
- Show the result as a one-image `BLK_GALLERY`. Get explicit Approve / Regenerate / Tweak before video.

## 3 — Animate the approved frame

- Model: `model-seedance-2` → `bytedance/seedance-2.0/reference-to-video`.
- Reference: Step 2 image via `referenceImageUrls`. Pass ONLY the approved anime frame, not the raw selfie; combining both can average the face and drift.
- Motion prompt begins with `@Image1` and defines player action, camera move, ball/cloth/grass response, speed ramp or impact frame, crowd/stadium motion, final pose, identity/kit continuity, and native stadium audio.
- Keep the same aspect ratio. Queue one render and stop; do not invent extra shots.

Show the completed URL as one `BLK_MEDIA` block with Regenerate motion / Tweak moment. Never offer to edit “shot 3” because this app has one shot.$skill$
  )
) AS source(id, uses_blocks, steps, body_md)
WHERE skill.id = source.id;

UPDATE public.agent_skills AS skill
SET
  intent = source.intent,
  one_liner = source.one_liner,
  matches = source.matches
FROM (
  VALUES
    ('SKL_SHORT_FILM','Take an idea to a finished multi-shot short.','Develop, board, render, and review a continuity-safe short film.',ARRAY['short film','narrative video','multi-shot','movie']::text[]),
    ('SKL_PRODUCT_AD','Turn a product reference into a polished, brand-faithful ad.','Build a product-locked concept, shot plan, and finished ad timeline.',ARRAY['product ad','commercial','ad','marketing']::text[]),
    ('SKL_MUSIC_VIDEO','Build a beat-aware video around an uploaded or generated track.','Turn a track into a coherent visual system, timed storyboard, and editable cut.',ARRAY['music video','music','song','track','visualizer']::text[]),
    ('SKL_CHARACTER_CREATOR','Create or update a reusable, reference-stable character.','Define a character, compare four controlled looks, choose a voice, and save to Library.',ARRAY['character','cast','persona','portrait']::text[]),
    ('SKL_TALKING_HEAD','Animate a portrait from a generated voice or uploaded audio.','Prepare a portrait, create or upload speech, and produce a natural avatar clip.',ARRAY['talking head','lipsync','avatar','spokesperson']::text[]),
    ('SKL_ANIME_WORLD_CUP','Turn a selfie into one identity-safe anime football highlight.','Selfie → approved anime player frame → one cinematic football clip.',ARRAY['world cup','anime','football','soccer']::text[])
) AS source(id, intent, one_liner, matches)
WHERE skill.id = source.id;

-- Replace historical provider slugs with exact Pika catalog API ids. These
-- model rows stay available to the agent even though the old curated API
-- card section is no longer rendered on the Skills page.
UPDATE public.agent_skills AS skill
SET
  label = source.label,
  intent = source.intent,
  one_liner = source.one_liner,
  matches = source.matches,
  model = source.model,
  body_md = format(
    E'---\nid: %s\nappId: %s\nlabel: %s\nkind: model\nintent: %s\noneLiner: %s\noutputs: [%s]\nmodel: %s\nmatches: [%s]\nusesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]\n---\n\n# %s\n\n%s\n\nCollect only the fields this endpoint needs, write a production-ready prompt, then call `run_model_app` with appId `%s`. Pass approved references through `referenceImageUrls`; the runtime upgrades to the matching Pika reference/edit endpoint and keeps the exact references attached.',
    skill.id,
    skill.app_id,
    source.label,
    source.intent,
    source.one_liner,
    CASE skill.mode WHEN 'speech' THEN 'speech' WHEN 'audio' THEN 'audio' WHEN 'image' THEN 'image' ELSE 'video' END,
    source.model,
    array_to_string(source.matches, ', '),
    source.label,
    source.guidance,
    skill.app_id
  )
FROM (
  VALUES
    ('SKL_MODEL_SEEDANCE_2','Seedance 2.0','Highest-fidelity multi-reference cinematic video with optional native audio.','Hero video with strong reference fidelity and multimodal direction.',ARRAY['seedance','hero shot','cinematic clip','reference video']::text[],'bytedance/seedance-2.0/text-to-video','Prefer `reference-to-video` whenever an approved anchor exists. Seedance accepts up to nine image references; name them `@Image1`, `@Image2`, and so on.'),
    ('SKL_MODEL_SEEDANCE_2_MINI','Seedance 2.0 Mini','Fast Seedance drafts and secondary shots with reference support.','Lower-latency drafts using the same anchor-first workflow.',ARRAY['quick clip','fast video','draft video']::text[],'bytedance/seedance-2.0-mini/text-to-video','Use for drafts and secondary shots. With references the runtime selects `bytedance/seedance-2.0-mini/reference-to-video`.'),
    ('SKL_MODEL_VEO_3','Google Veo 3.1','Cinematic text-to-video with native audio.','Generate a cinematic clip with native sound from text.',ARRAY['veo','with sound','native audio']::text[],'google/veo-3.1/text-to-video','Use text-to-video only without a visual anchor. For an approved still choose the Veo image-to-video app.'),
    ('SKL_MODEL_VEO_3_I2V','Veo 3.1 Lite Image-to-Video','Animate one approved still with native audio.','Image-led video where native audio is important.',ARRAY['animate image','image to video','veo audio']::text[],'google/veo-3.1-lite/image-to-video','Requires one authoritative image. Describe action, camera, temporal end state, and desired native sound.'),
    ('SKL_MODEL_KLING_3','Kling 3 Pro','Controlled cinematic motion from text or one approved frame.','Strong camera and physical motion control for 5s or 10s shots.',ARRAY['kling','motion','camera control']::text[],'kling/kling-v3/pro/text-to-video','Prefer the image-to-video path with one approved anchor. Keep the prompt focused on movement; the image owns appearance and composition.'),
    ('SKL_MODEL_NANO_BANANA_2','Nano Banana Pro','High-fidelity still generation and reference-preserving image edits.','Best default for character, product, and scene anchors.',ARRAY['still image','concept art','nano banana','image edit']::text[],'google/gemini-3-pro-image/text-to-image','Use image-to-image whenever a character, product, logo, or approved look exists. Preserve identity and alter only the requested attributes.'),
    ('SKL_MODEL_GPT_IMAGE_2','GPT Image 2','Still generation and edits with strong typography and layout.','Use for posters, title cards, and images where readable text matters.',ARRAY['poster','text in image','typography']::text[],'openai/gpt-image-2/text-to-image','Specify exact copy once, placement hierarchy, font character, contrast, and safe margins. Use the edit path for visual references.'),
    ('SKL_MODEL_SEEDREAM','Seedream 5 Pro','High-fidelity photographic stills and image edits.','Detailed photoreal stills with reference support.',ARRAY['seedream','photoreal','image edit']::text[],'bytedance/seedream-5.0-pro/text-to-image','Use for detailed photographic anchors. State materials, optics, lighting direction, and exclusions precisely.'),
    ('SKL_MODEL_ELEVEN_TTS','ElevenLabs Multilingual V2','Multilingual natural text-to-speech.','Generate narration or dialogue from a finalized speakable script.',ARRAY['tts','voice over','narration','speech']::text[],'elevenlabs/eleven-multilingual-v2/text-to-speech','Finalize wording before generation. Use punctuation for pauses and keep delivery direction concise.'),
    ('SKL_MODEL_CASSETTE_MUSIC','Eleven Music','Generate original music beds up to ten minutes.','Create an instrumental score or song from a structured music brief.',ARRAY['music bed','song','score','soundtrack']::text[],'elevenlabs/eleven-music/sound-effects','Describe genre, tempo/energy, instrumentation, arc, duration, and whether vocals are allowed.'),
    ('SKL_MODEL_STABLE_AUDIO','Seed Audio','Generate dialogue, music, ambience, or sound effects from text.','Create a focused audio layer from a precise description.',ARRAY['sfx','sound effect','ambience','audio']::text[],'bytedance/seed-audio-1.0/text-to-audio','Describe the exact sound event, environment, perspective, intensity arc, and unwanted elements.')
) AS source(id, label, intent, one_liner, matches, model, guidance)
WHERE skill.id = source.id;

-- Native audio-driven model apps used by the upgraded Music Video and
-- Talking Head workflows.
INSERT INTO public.agent_skills (
  id, app_id, label, kind, intent, one_liner, outputs, matches, uses_blocks,
  model, mode, steps, body_md, sort_order, is_active
)
VALUES
(
  'SKL_MODEL_LTX_AUDIO_VIDEO',
  'model-ltx-audio-video',
  'LTX 2.3 Pro Audio-to-Video',
  'model',
  'Generate a video driven by an uploaded or generated audio track.',
  'Audio-led motion for music visualizers and track-driven hero clips.',
  ARRAY['video']::text[],
  ARRAY['audio to video','music visualizer','track driven video']::text[],
  ARRAY['BLK_FORM','BLK_MEDIA','BLK_ACTIONS']::text[],
  'lightricks/ltx-2.3-pro/audio-to-video',
  'video',
  '[]'::jsonb,
  $skill$---
id: SKL_MODEL_LTX_AUDIO_VIDEO
appId: model-ltx-audio-video
label: LTX 2.3 Pro Audio-to-Video
kind: model
intent: Generate video whose timing and motion are driven by audio.
oneLiner: Turn a track and optional approved still into an audio-driven clip.
outputs: [video]
model: lightricks/ltx-2.3-pro/audio-to-video
matches: [audio to video, music visualizer, track driven video]
usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# LTX 2.3 Pro Audio-to-Video

Requires `referenceAudioUrl`. Optionally pass one approved still in `referenceImageUrls`. The prompt defines visual subject, style, camera grammar, and energy arc; the audio defines timing. Call `run_model_app` with appId `model-ltx-audio-video`.$skill$,
  115,
  true
),
(
  'SKL_MODEL_KLING_AVATAR',
  'model-kling-avatar',
  'Kling Avatar V2',
  'model',
  'Animate one portrait from a finished speech or uploaded audio file.',
  'Native portrait-plus-audio avatar generation for talking-head clips.',
  ARRAY['video']::text[],
  ARRAY['avatar','talking head','lip sync','lipsync']::text[],
  ARRAY['BLK_FORM','BLK_MEDIA','BLK_ACTIONS']::text[],
  'kling/kling-ai-avatar-v2/avatar',
  'video',
  '[]'::jsonb,
  $skill$---
id: SKL_MODEL_KLING_AVATAR
appId: model-kling-avatar
label: Kling Avatar V2
kind: model
intent: Animate one portrait from a finished audio file.
oneLiner: Create a natural talking-head performance from portrait + audio.
outputs: [video]
model: kling/kling-ai-avatar-v2/avatar
matches: [avatar, talking head, lipsync]
usesBlocks: [BLK_FORM, BLK_MEDIA, BLK_ACTIONS]
---

# Kling Avatar V2

Requires exactly one portrait in `referenceImageUrls` and a 2–300 second `referenceAudioUrl`. The prompt only directs eye contact, expression, and head/shoulder performance; the audio drives the mouth. Call `run_model_app` with appId `model-kling-avatar`.$skill$,
  116,
  true
)
ON CONFLICT (id) DO UPDATE
SET
  app_id = EXCLUDED.app_id,
  label = EXCLUDED.label,
  kind = EXCLUDED.kind,
  intent = EXCLUDED.intent,
  one_liner = EXCLUDED.one_liner,
  outputs = EXCLUDED.outputs,
  matches = EXCLUDED.matches,
  uses_blocks = EXCLUDED.uses_blocks,
  model = EXCLUDED.model,
  mode = EXCLUDED.mode,
  steps = EXCLUDED.steps,
  body_md = EXCLUDED.body_md,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

COMMIT;

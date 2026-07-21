---
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

Take an idea to a finished multi-shot short. Walk these steps one decision per turn; skip, reorder, or loop back based on what the user already answered; detour into a model skill when an input is missing, then resume.

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

## Step 4 — Audio plan (FIRST, before storyboard)

- **Present:** `BLK_FORM` with `{audioMode (music bed / VO / talking / mix / none, multi), audioNotes}`.
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

- **Present:** `BLK_TIMELINE` (variant `preview`) for final review, with lock/export in its own `actions` (the timeline fills the stage — don't add a separate actions block).
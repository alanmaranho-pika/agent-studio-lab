---
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

- Generate 2–3 ad concepts and present them via `BLK_LIST` or a `BLK_STORYBOARD` for review.
- **On lock, create scenes.** Translate the chosen concept into an ordered shot list and `commit_project_patch({scenes})` — one scene per shot (n, title, prompt, motionPrompt, duration). A single-shot ad is one scene. These scenes are what the timeline renders, so patch them here even before any video exists.

## Step 6 — Style

- **Present:** `BLK_OPTIONS` — Cinematic / Clean studio / Lifestyle / Editorial.

## Step 7 — Talent (optional)

- **Present:** `BLK_OPTIONS` — on-screen talent (multi; pick from Library or create). Skip if the concept needs no one on camera.

## Step 8 — Timeline preview (REQUIRED)

- Once the concept is locked and scenes are patched, `render_turn` with a `BLK_TIMELINE` (variant `preview`) laying out every shot in order — placeholder clips before render. This is the mandatory consolidation surface; do NOT end on a `list`, `stage`, or prose recap, and never leave shots as loose `media` cards.
- Put next steps in the timeline's `actions` (2–4): e.g. "Render the ad", "Render one shot", "Edit the cut".

## Step 9 — Produce

- **Present:** `BLK_OPTIONS` — render model (Seedance 2.0 vs Kling Standard). Model choice first.
- Follow the RENDER phase's anchor-first flow per shot. **After each shot lands, return to the `BLK_TIMELINE`** so every render consolidates there — never surface a finished clip as a standalone `media` card.
- Final review + export live in the timeline's `actions` (the timeline fills the stage — don't add a separate actions block).
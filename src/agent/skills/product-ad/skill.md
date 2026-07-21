---
id: SKL_PRODUCT_AD
appId: product-ad
label: Product Ad
kind: wizard
intent: Turn a product photo or URL into a polished ad.
oneLiner: Turn a product photo (or product URL) into a polished ad — concept, style, model choice, render.
outputs: [video]
matches: [product ad, commercial, ad, marketing]
usesBlocks: [BLK_UPLOAD, BLK_FORM, BLK_OPTIONS, BLK_STORYBOARD, BLK_MEDIA, BLK_ACTIONS]
---

# Product Ad

Walk these steps one decision per turn. Each step is a checklist, not a script: skip any field — or the whole step — the user already answered ("a 30s ad for my perfume" answers length AND subject before Step 1 even runs). Confirm inherited answers inline and move to the first genuinely open question.

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

## Step 6 — Style

- **Present:** `BLK_OPTIONS` — Cinematic / Clean studio / Lifestyle / Editorial.

## Step 7 — Talent (optional)

- **Present:** `BLK_OPTIONS` — on-screen talent (multi; pick from Library or create). Skip if the concept needs no one on camera.

## Step 8 — Produce

- **Present:** `BLK_OPTIONS` — render model (Seedance 2.0 vs Kling Standard).
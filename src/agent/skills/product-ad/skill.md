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

## Step 1 — Product intake

- **Present:** `BLK_UPLOAD` with `allowUrl: true` — user pastes a Shopify/Amazon URL OR uploads a photo. Once one is provided, advance.
- On URL paste, immediately `tool_invoke product_ad.scrape_url` and reuse the imported hero image as a reference on every later render.

## Step 2 — Brief

- **Present:** `BLK_FORM` — `{tagline, audience, lengthSec (8/15/30/1m), aspect (16:9/9:16/1:1/4:5)}`.

## Step 3 — Audio plan (FIRST, before concepts)

- **Present:** `BLK_FORM` — audio mode (music bed / voiceover / talking spokesperson / mix) + direction.
- **Why first:** concept pacing, copy lines, and whether talent must speak on camera all depend on this.

## Step 4 — Concepts

- Generate 2–3 ad concepts and present them via `BLK_LIST` or a `BLK_STORYBOARD` for review.

## Step 5 — Style

- **Present:** `BLK_OPTIONS` — Cinematic / Clean studio / Lifestyle / Editorial. Also collect on-screen talent (optional, multi).

## Step 6 — Produce

- **Present:** `BLK_OPTIONS` — render model (Seedance 2.0 vs Kling Standard).
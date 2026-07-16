---
id: SKL_SHORT_FILM
appId: short-film
label: Short Film
kind: wizard
intent: Take an idea to a finished multi-shot short.
oneLiner: Take an idea to a finished multi-shot short — logline, cast, storyboard, animate, audio, produce.
outputs: [video]
matches: [short film, narrative video, multi-shot, movie]
usesBlocks: [BLK_OPTIONS, BLK_FORM, BLK_UPLOAD, BLK_MOODBOARD, BLK_STORYBOARD, BLK_GALLERY, BLK_MEDIA, BLK_STAGE, BLK_ACTIONS]
---

# Short Film

Take an idea to a finished multi-shot short. Walk these steps one decision per turn; skip, reorder, or loop back based on what the user already answered; detour into a model skill when an input is missing, then resume.

## Step 1 — Logline

- **Present:** `BLK_FORM` with fields `{logline, lengthSec, aspect}` (lengths: 8s, 15s, 30s, 1m, 1m 30s, 2m; aspects: 16:9, 9:16, 1:1).
- **Persist:** `commit_project_patch({meta: {logline, targetDuration, aspectRatio}})`.

## Step 2 — Cast

- **Present:** `BLK_OPTIONS` (pick from Library) OR the character-picker (multi). Offer "Create new" → open Character Creator inline.
- **Persist:** `commit_project_patch({cast})`.

## Step 3 — Audio plan (FIRST, before storyboard)

- **Present:** `BLK_FORM` with `{audioMode (music bed / VO / talking / mix / none, multi), audioNotes}`.
- **Why first:** pacing, dialogue, and whether characters need to speak on screen depend on this.

## Step 4 — Storyboard

- **Present:** `BLK_STORYBOARD` — one slide per shot: meta "Shot N · Xs", short title, description, `vo` line when planned.
- Also collects `styleNotes` (long text) if not already provided.

## Step 5 — Animate

- **Present:** `BLK_OPTIONS` for render model per beat (Seedance 2.0, Kling Standard, …).
- Follow the RENDER phase's anchor-first flow.

## Step 6 — Produce

- **Present:** `BLK_STAGE` view `timeline` for review, `BLK_ACTIONS` for lock/export.
---
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

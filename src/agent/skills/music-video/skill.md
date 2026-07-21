---
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

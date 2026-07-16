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
2. **Style** — `BLK_FORM` (visual look) + `BLK_OPTIONS` aspect ratio.
3. **Storyboard** — beat-synced shot list rendered via `BLK_STORYBOARD`.
4. **Produce** — render and review.

---
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

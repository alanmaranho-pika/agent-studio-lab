---
id: SKL_CHARACTER_CREATOR
appId: character-creator
label: Character Creator
kind: wizard
intent: Create a reusable character with name, look, and voice.
oneLiner: Create a reusable character with name, look, and voice — saved to the library.
outputs: [image]
matches: [character, cast, persona, portrait]
usesBlocks: [BLK_FORM, BLK_GALLERY, BLK_ACTIONS]
---

# Character Creator

1. **Brief** — `BLK_FORM` (name, role/vibe).
2. **Look** — `BLK_GALLERY` of 4 look options (Nano Banana). Pick or regenerate.
3. **Voice** — voice picker (or clone).
4. **Save** — commit to library.

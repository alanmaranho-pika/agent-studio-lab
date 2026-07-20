# INS_BLOCKS_INDEX

The Gen-UI shapes `render_turn` can emit. IDs (BLK_*) are references used from skill packs; the JSON wire uses the parenthesized `type` string.

- **BLK_OPTIONS (`options`)** — the turn's primary picker between 2–9 concrete alternatives.
- **BLK_FORM (`form`)** — 1–4 named fields for structured input (text, url, number, slider, chips, checkboxes).
- **BLK_UPLOAD (`upload`)** — ask for a file (likeness, product photo, voice); optional paste-URL and camera.
- **BLK_MEDIA (`media`)** — one finished clip for review (video / image / audio) + variants + confirm actions.
- **BLK_GALLERY (`gallery`)** — 1–6 still images for review or comparison.
- **BLK_MOODBOARD (`moodboard`)** — one composed visual direction (mixed image tiles + palette + optional type tile) for lock-in.
- **BLK_LIST (`list`)** — flat ordered list of short items (up to 12). Never for shot lists — use storyboard.
- **BLK_STORYBOARD (`storyboard`)** — cinematic shot-by-shot, one slide per shot with meta / title / text / vo.
- **BLK_TIMELINE (`timeline`)** — full-stage timeline of the cut rendered from PROJECT STATE (`preview` / `editor` / `scenes` variants).
- **BLK_STAGE (`stage`)** — full-stage React view rendered from PROJECT STATE (`script-beats` / `storyboard` / `character`).
- **BLK_ACTIONS (`actions`)** — 1–4 button row that advances/confirms content shown above. Never the primary picker.
- **BLK_CUSTOM_HTML (`custom_html`)** — escape hatch for UI no typed block can express. Prefer typed blocks.

## Global rules for choosing a block

- **Prefer typed blocks.** Reach for `custom_html` only when no typed block can express the UI.
- **Any choice between things is `options`.** An `actions` row only confirms or advances content shown above it (media, list, stage) — never use it as the turn's primary picker.
- **Shot lists / beat breakdowns are `storyboard`.** Never a plain `list`.
- **Stills for review / comparison are `gallery`.** Single image or several, layout is automatic. A forced pick of exactly ONE image is still an `options` block.
- **A composed direction is `moodboard`.** Comparing alternative directions is a `gallery` or `options` block, never several moodboards.

To read the full spec for a specific block, call `get_block_reference({ ids: ["BLK_OPTIONS", …] })`.
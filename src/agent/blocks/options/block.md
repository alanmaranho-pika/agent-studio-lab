# BLK_OPTIONS

The turn's primary picker. Use whenever the user is choosing between 2–9 concrete alternatives — models, aspect ratios, styles, cast members, next actions.

## When to use
- ANY choice between things. This is the ONE interactive block per turn most turns will use.
- 2 to 9 items. Layout is count-driven — you pick a sensible count, the stage lays it out (≤5 across, 6+ wraps to two wide rows).

## When NOT to use
- Confirming or advancing content already shown above (media, list, stage) — use `actions`.
- A forced pick of exactly ONE image is still `options` (each item's `visual.kind: "image"`).
- Comparing several finished images for review — use `gallery`.

## Author checklist
- Add a `visual` on every item (ratio, icon, or image). Options without visuals look empty.
- Write `value` as natural language ("Describe it to you"), never snake_case ids — it's echoed as the user's reply.
- Add per-option `ack` (≤8 words, no question) so the stage can react instantly while you compose the next turn.
- Set per-option `next` when different picks lead to different NEXT turn shapes.
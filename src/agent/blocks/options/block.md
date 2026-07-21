# BLK_OPTIONS

The turn's primary picker. Use whenever the user is choosing between 2–9 concrete alternatives — models, aspect ratios, styles, cast members, next actions.

## When to use
- ANY choice between things. This is the ONE interactive block per turn most turns will use.
- 2 to 9 items. Layout is count-driven — you pick a sensible count, the stage lays it out (≤5 across, 6+ wraps to two wide rows).
- EXCLUSIVE creative alternatives (pick ONE concept / treatment / direction): give each item a `body` (2–4 sentence pitch) and put the meta line in `subtitle` (e.g. "Concept A · 30s"). The stage renders these as theme-tinted pitch cards side-by-side — never present competing alternatives as a paginated storyboard, which hides them behind navigation.

## When NOT to use
- Confirming or advancing content already shown above (media, list, stage) — use `actions`.
- A forced pick of exactly ONE image is still `options` (each item's `visual.kind: "image"`).
- Comparing several finished images for review — use `gallery`.

## Styling pitch cards (mood pass)

When you emit pitch cards (`body` present), style EACH one to its own mood — the set should feel like distinct concepts, not one recolored template:

- **`titleFont`** — an exact Google Fonts family name that fits the concept's mood. The client loads it live, so any real family works. Match the feeling:
  - Elegant / editorial → "Playfair Display", "Cormorant Garamond", "DM Serif Display"
  - Bold / punchy / sport → "Bebas Neue", "Anton", "Archivo Black"
  - Warm / organic / natural → "Fraunces", "Spectral", "Newsreader"
  - Technical / futuristic → "Space Grotesk", "Space Mono", "Chakra Petch"
  - Playful / friendly → "Fredoka", "Baloo 2", "Quicksand"
  (These are starting points — pick whatever family best fits the specific mood.)
- **`palette`** — a UNIQUE `{bg, fg, accent}` per card matching that mood (earthy greens for botanical, cool blues for a storm, warm amber for a sunrise). `bg` deep, `fg` bright and high-contrast, `accent` for the eyebrow. Omit only if you truly want the shared project swatch.
- Keep it purposeful: the font + palette should telegraph the concept before the user reads a word. Different concepts → different fonts and palettes.

## Author checklist
- Add a `visual` on every item (ratio, icon, or image). Options without visuals look empty. (Pitch cards with `body` skip the visual — the tinted prose IS the visual.)
- Write `value` as natural language ("Describe it to you"), never snake_case ids — it's echoed as the user's reply.
- Add per-option `ack` (≤8 words, no question) so the stage can react instantly while you compose the next turn.
- Set per-option `next` when different picks lead to different NEXT turn shapes.

## Custom tile (automatic)
A "Custom" tile is appended by the renderer at the end of every options grid. Users tap it to type a free-text answer in place — do NOT author a "Custom / Other / Something else" option yourself; the UI already provides one.
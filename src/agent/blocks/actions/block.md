# BLK_ACTIONS

Confirm/next-step row rendered UNDER a content block (media, list, stage). Never the turn's primary picker.

## When to use
- Advancing from reviewed content: Approve / Regenerate / Save cut / Export.
- Any short 1–4 button row that finalizes or moves past shown content.

## When NOT to use
- The turn's primary choice between options — use `options`.

## Author checklist
- Mark at most one button `primary: true`.
- Every button's `value` echoes as the user's reply — make it a natural sentence.
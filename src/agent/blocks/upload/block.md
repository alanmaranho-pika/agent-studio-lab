# BLK_UPLOAD

Ask the user to hand you a file (likeness, logo, reference image, voice, audio, video). Optionally offer a paste-URL alternative and/or camera capture.

## When to use
- The user needs to bring an asset (photo of themselves, a product, a track).
- The app registry step is `upload`, or you need a reference before rendering people/products.

## When NOT to use
- Pure choice between existing library assets — use `options` with `image` visuals.
- Text-only prompts — use `form`.

## Author checklist
- Set `kind` accurately (likeness / logo / reference / voice / audio / video / other). It drives the accept filter.
- Set `allowUrl` when the same input can come from a web link (product photo, hero image).
- Set `skipValue` when the user is allowed to skip and describe instead.
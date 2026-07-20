# BLK_TIMELINE

Full-stage timeline of the project's cut, rendered from PROJECT STATE (not tool output). Variants: `preview` (default), `editor`, `scenes`.

## When to use

- Reviewing the cut after patching the `timeline` field (`variant: "preview"` — player + clip strip).
- The user wants to edit or fine-tune clips directly (`variant: "editor"` — multi-track editing).
- Discussing one scene of the cut (`variant: "scenes"`, pair with `focusSceneId`).
- Reviewing the scene previews before rendering videos.

## When NOT to use

- Showing a single finished clip — use `media`.
- Reviewing beats/script structure — use a `stage` block view `script-beats`.
- Showing raw tool output — use `media`, `gallery`, or `moodboard`.



## Author checklist

- The timeline renders straight from `project.scenes` — as soon as scenes exist (e.g. after a storyboard), a `preview` timeline shows every shot, with not-yet-rendered shots as placeholder clips. You do NOT need to patch the `timeline` field first; that field is only for a re-ordered/trimmed CUT (the `editor` variant).
- Always include 2–4 short `actions` — the timeline is not self-driving.
- Pick the variant by intent: preview to review the shots, editor to re-order/trim the cut, scenes (with `focusSceneId`) to discuss one scene.
- The timeline fills the whole stage — put next steps in its `actions`, never add a competing options/form/upload block.


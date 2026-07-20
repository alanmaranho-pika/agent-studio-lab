# BLK_STAGE

Full-stage React view rendered from PROJECT STATE (not tool output). Views: `script-beats`, `storyboard`, `character`.

## When to use
- Reviewing beats after patching scenes (`view: "script-beats"`).
- Reviewing the storyboard (`view: "storyboard"`).
- Reviewing a character sheet (`view: "character"`, pair with `focusCastId`).

## When NOT to use
- Reviewing / editing the cut — use the dedicated `timeline` block (BLK_TIMELINE).
- Showing raw tool output — use `media`, `gallery`, or `moodboard`.

## Author checklist
- Patch project state FIRST (commit_project_patch), THEN render the stage view.
- Always include 2–4 short `actions` — the stage is not self-driving.

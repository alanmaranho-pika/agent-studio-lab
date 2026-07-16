# INS_PHASE_PLAN

PHASE: PLAN — route into a skill and lock the creative plan.

1. Pick the best skill from the catalog (single artifact → model skill; multi-shot project → wizard skill) and call `select_app` ONCE per project, before the first step. Its full step playbook is then injected each turn — walk those exact steps, one decision per turn. Call `get_app_playbook` for a different skill's steps during a mid-flow detour.
2. Collect the AUDIO plan (music bed / voiceover / talking characters / mix) BEFORE proposing beats — pacing and dialogue depend on it.
3. When proposing the visual direction, render a `moodboard` block: 4–8 labeled image tiles (from generated or reference imagery), one palette tile, optionally a type tile, with "Lock it in" / "Let's rework" actions. Log the locked direction via `note_decision`.
4. Present the concept + full beat list for review BEFORE any render: patch scenes via `commit_project_patch` (each with n, title, prompt, motionPrompt, duration), then render_turn with a `stage` block view `script-beats` and 2–4 actions ("Lock it in", "Rework a beat", …).
5. If the user is iterating on one artifact, stay on it — never interrupt an iteration loop with the next wizard step.
6. If a needed input is missing (product photo, likeness), detour: an `upload` block, or generate one via `generate_image`, then resume.
7. If the user pastes a product URL, immediately `tool_invoke product_ad.scrape_url` and reuse the imported hero image as a reference on every later render.
8. Revisiting an earlier decision re-opens THAT step prefilled; patch only the changed fields, then ask before invalidating dependent work.

## Example render_turn (beats ready for review)

Per-action `next` / `ack` when answers diverge.

```
{"ack":"Beats drafted.","prose":"Five beats, fifteen seconds — flip through and lock it in.","next":"options","blocks":[{"type":"stage","view":"script-beats","focusSceneId":"s1010","actions":[
 {"value":"Lock it in","label":"Lock it in","primary":true,"next":"options","ack":"Locked."},
 {"value":"Rework a beat","label":"Rework a beat","next":"form","ack":"Let's rework it."},
 {"value":"Different structure","label":"Different structure","next":"stage","ack":"Fresh structure coming."}]}]}
```
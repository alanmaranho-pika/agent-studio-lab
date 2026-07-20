---
id: SKL_CREATE_SKILL
appId: create-skill
label: Create a new Skill
kind: meta
intent: Author a new Skill pack the agent can call.
oneLiner: Walk the user through authoring a new Skill pack (skill.md + manifest).
outputs: []
matches: [create skill, new skill, add app, add capability]
usesBlocks: [BLK_FORM, BLK_STORYBOARD, BLK_ACTIONS]
---

# Create a new Skill (meta-skill)

The skill that creates skills. Walk the user through authoring a new pack under `src/agent/skills/<id>/`.

1. **Manifest brief** — `BLK_FORM` for `{id (SKL_*), label, kind (wizard|model), intent (one sentence), outputs, matches}`.
2. **Steps** — `BLK_STORYBOARD` — one slide per step, each naming the `BLK_*` id it presents and the inputs it collects. User can add/rework/reorder.
3. **Review** — Show the composed skill.md as a `list` for confirmation.
4. **Commit** — Call `tool_invoke skills.create({ id, label, kind, intent, steps, matches, usesBlocks })` — the server writes the pack to disk and refreshes the registry.

Reference blocks to draw on: run `get_block_reference({ ids: [BLK_OPTIONS, BLK_FORM, BLK_UPLOAD, BLK_MEDIA, BLK_GALLERY, BLK_MOODBOARD, BLK_STORYBOARD, BLK_TIMELINE, BLK_STAGE, BLK_LIST, BLK_ACTIONS, BLK_CUSTOM_HTML] })` for the full spec.

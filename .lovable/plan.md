# Agent system refactor — Blocks, Skills, Instructions

Three parallel registries, each a folder of small files with stable IDs. The agent's prompt is assembled by concatenating: **global instructions → active skill → block reference for the blocks the skill needs**. Today all three live tangled together across `ui-schema.ts`, `app-registry.ts`, `prompt/*.ts`, and `render-turn-html.ts`.

## 1. Gen-UI Block registry (`src/agent/blocks/`)

One folder per block type. Each block currently defined inline in `ui-schema.ts` (options, form, upload, media, gallery, moodboard, list, storyboard, stage, actions, custom_html) becomes its own file:

```text
src/agent/blocks/
  _registry.ts              // exports BLOCKS: Record<BlockId, BlockDef>
  options/
    block.ts                // id, schema (zod), htmlRenderer, usage guide
    block.md                // "When and how the agent uses BLK_OPTIONS"
    Options.tsx             // optional React preview (Storybook-style)
  form/…
  upload/…
  media/…
  gallery/…
  moodboard/…
  storyboard/…
  stage-timeline/…          // wraps existing stage-timeline component
  stage-script-beats/…
  stage-character/…
  actions/…
  custom-html/…
```

Each `block.ts` exports:

```ts
export const OptionsBlock: BlockDef = {
  id: "BLK_OPTIONS",              // stable ID, referenced from skills + logs
  type: "options",                // discriminator used in RenderTurn JSON
  schema: OptionsBlockSchema,     // zod (moved from ui-schema.ts)
  toHtml: renderOptionsHtml,      // moved from render-turn-html.ts
  usage: BLOCK_USAGE_OPTIONS_MD,  // string import of block.md
  examples: [...],                // 1–2 concrete render_turn snippets
};
```

`_registry.ts` builds `TurnBlockSchema` (discriminated union), `blockToHtml(block)`, and `renderBlockCatalog()` — replacing the hard-coded arms in `ui-schema.ts` and `render-turn-html.ts`. Nothing about the RenderTurn wire format changes; blocks stay identified by their `type` string in JSON, and `BLK_*` IDs are the human/agent handle used in skills and docs.

Discovery for the agent: a new tool `get_block_reference({ blockIds })` returns the `block.md` for one or more IDs. Only the block IDs a skill actually uses get injected per turn — same conditional-injection pattern used today for app playbooks.

## 2. Skill packs (`src/agent/skills/`)

Every "app" today (wizard entries in `app-registry.ts` + single-shot model apps in `skills.ts`) becomes a skill pack:

```text
src/agent/skills/
  _registry.ts
  short-film/
    skill.md                // frontmatter + step-by-step
    skill.ts                // typed manifest (parses/validates skill.md)
  product-ad/…
  anime-world-cup/…
  seedance-2/…
  nano-banana/…
  meta-create-skill/        // "skill that creates skills"
```

`skill.md` shape:

```markdown
---
id: SKL_SHORT_FILM
label: Short Film
kind: wizard                # wizard | model | meta
intent: Take an idea to a finished multi-shot short.
outputs: [video]
inputs: [text, characters, audio, references]
matches: ["short film", "narrative video", "multi-shot"]
model: null                 # for model skills: fal/openai id
mode: null                  # image | video | audio | speech
usesBlocks: [BLK_OPTIONS, BLK_FORM, BLK_UPLOAD, BLK_STORYBOARD, BLK_STAGE_TIMELINE, BLK_MEDIA, BLK_GALLERY, BLK_MOODBOARD, BLK_ACTIONS]
---

## Step 1 — Logline
Present: BLK_FORM with fields {logline, lengthSec, aspect}
Then: commit_project_patch({meta})

## Step 2 — Cast
Present: BLK_OPTIONS (choose from Library) OR BLK_UPLOAD (new likeness)
...
```

`skill.ts` parses the frontmatter into a typed manifest and exports it; runtime keeps zod validation. The current `AppEntry`/`AppStep` types collapse into this manifest — no more parallel `APP_REGISTRY` and `SKILLS` arrays.

Agent-facing tools become:
- `list_skills({ query? })` — semantic-ish match on label/intent/matches (replaces the current `suggestApp`).
- `select_skill({ skillId })` — replaces `select_app`.
- `get_skill_playbook({ skillId })` — replaces `get_app_playbook`, returns skill.md + the referenced blocks' `block.md`.
- `run_skill({ skillId, params })` — replaces `run_model_app` for model skills; wizard skills use the injected playbook as today.

Meta-skill `SKL_CREATE_SKILL` walks the user through authoring a new `skill.md` (intent, inputs, outputs, step list referencing block IDs), then writes it to `src/agent/skills/<id>/` via a server tool. This is the "skill that creates skills."

## 3. Instruction files (`src/agent/instructions/`)

Extracts prompt content out of `prompt/core.ts` and `prompt/phases.ts` into editable, versioned `.md` files with stable IDs:

```text
src/agent/instructions/
  _registry.ts
  identity.md               // INS_IDENTITY — director voice, memory, turn protocol
  routing.md                // INS_ROUTING — when to call skills vs answer directly
  phases/
    discuss.md              // INS_PHASE_DISCUSS
    plan.md                 // INS_PHASE_PLAN
    render.md               // INS_PHASE_RENDER
    edit.md                 // INS_PHASE_EDIT
  blocks-overview.md        // INS_BLOCKS_INDEX — one-liner per BLK_* + when to reach for custom_html
  inline-edit.md            // INS_INLINE_EDIT — field/piece/media modes
  guardrails.md             // INS_GUARDRAILS — anti-hallucination, references, media URLs
```

`buildPrompt(phase, selectedSkillId)` composes:
```
INS_IDENTITY + INS_ROUTING + INS_GUARDRAILS
+ INS_PHASE_<current>
+ INS_BLOCKS_INDEX
+ skill manifest for selectedSkillId (or SKILL CATALOG summary if none)
+ block.md for every block that skill lists in usesBlocks
```

This makes agent behavior editable per file: tweak `routing.md` to change when apps are called; tweak `phases/plan.md` to change moodboard-vs-storyboard timing; tweak `blocks/options/block.md` to change how options are used. No code changes required for prose tuning.

## Migration order

1. **Blocks first** — move each `*BlockSchema` + its `blockToHtml` arm into `blocks/<name>/block.ts`, write `block.md` from the existing zod `.describe()` strings, wire `_registry.ts` so `ui-schema.ts` and `render-turn-html.ts` re-export from it. No behavior change. Verify with existing turn-guard tests.
2. **Instructions** — split `prompt/core.ts` + `prompt/phases.ts` into the `.md` files above; `buildCorePrompt`/`getPhasePrompt` become thin loaders. Same tokens, same order.
3. **Skills** — port `APP_REGISTRY` entries into `skills/<id>/skill.md`, then port single-shot entries from `src/lib/skills.ts`. Old `select_app`/`get_app_playbook`/`suggestApp` become deprecated aliases that forward to the new tools for one release, then get removed.
4. **Meta-skill** — add `SKL_CREATE_SKILL` + a server tool that writes new skill files.
5. **Cleanup** — delete `app-registry.ts`, collapse `skills.ts` to a re-export for legacy imports, remove now-unused arms of `ui-schema.ts` / `render-turn-html.ts`.

## Technical notes

- **IDs**: `BLK_*` for blocks, `SKL_*` for skills, `INS_*` for instruction docs. IDs live only in the manifests; wire JSON still uses the existing `type` discriminators so no schema break for the model.
- **Loading `.md`**: Vite `?raw` imports (`import md from "./block.md?raw"`). Server-only where the prompt is assembled.
- **Zod stays** — `.md` is documentation for humans and the LLM; runtime validation of `render_turn` calls still runs through the composed discriminated union.
- **Tests**: existing `turn-guard.server.ts` invariants keep working because block schemas are the same objects, just relocated. Add a small test that every `usesBlocks` ID in every skill.md resolves in the block registry.
- **No UI change** — GenerativeCard, stage-timeline variants, and gen-option-enhancer are untouched; blocks just re-export their existing HTML.

## Out of scope for this refactor

- Rewriting individual block visuals or the stage layout.
- Changing which models back which skills.
- Persisting skill.md edits to a database — files on disk are the source of truth; the meta-skill writes to the repo via a server tool.

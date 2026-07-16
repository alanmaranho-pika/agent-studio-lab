
## 1. Answer: how `skill.md` and `skill.ts` relate

Each skill folder ships two files that play different roles:

- **`skill.md`** — the human/agent-readable playbook. Loaded via `import bodyMd from "./skill.md?raw"` and exposed as `SkillPack.bodyMd`. `renderAppPlaybook()` injects this verbatim into the LLM prompt whenever the skill is selected. **This is what actually changes agent behavior at runtime.**
- **`skill.ts`** — the typed manifest (`SkillPack`): `id`, `appId`, `label`, `kind`, `oneLiner`, `outputs`, `matches`, `usesBlocks`, `steps[]`, `model`, `mode`, plus the `bodyMd` re-export. Consumed by TypeScript code (registry, catalog line, model dispatcher, `renderAppPlaybook`'s fallback when `bodyMd` is missing, and `renderAppCatalogForPrompt` step summary).

Consequences for the live editor:
- Editing `skill.md` only → changes the prompt the LLM sees for that skill. Vite `?raw` HMR picks it up instantly in dev; no `.ts` touch needed.
- Editing `skill.ts` → changes what code iterates (steps rendered by non-LLM UI, model id for `run_model_app`, block hints for prompt injection, router `matches`). Required if you rename the skill, swap the backing model, or add/remove steps that code enumerates.
- The catalog summary (`renderAppCatalogForPrompt`) reads from `.ts` step data, not `.md`. So a step-order tweak in `.md` alone won't be reflected in the one-line summary; but since the full playbook (bodyMd) is what the agent follows once a skill is selected, `.md` edits still steer the actual flow.

Recommendation for iteration: tweak `skill.md` live for prompt/behavior changes; only touch `skill.ts` for structural/runtime changes.

## 2. Transcript panel — log skill / tool / block calls

`TranscriptPanel` currently renders only user text + assistant `ack/prose/block-labels`. Extend the row builder to also emit debug rows from `m.parts` for every tool part, in call order:

- For each `m.parts[i]` where `type` starts with `tool-` emit a row `{ role: "tool", text: "<tool name> · <state>\n<compact input/output preview>" }`.
  - `tool-select_app` → `SKILL SELECTED → <label> (<appId>)`
  - `tool-render_turn` → `RENDER TURN · blocks: [<type>, <type>…]` (pull from input JSON)
  - `tool-run_model_app`, `tool-generate_image`, `tool-run_skill`, `tool-tool_invoke`, `tool-get_app_playbook`, `tool-save_skill`, `tool-commit_project_patch`, `tool-note_decision`, etc. → `<tool> · <state>` + one-line JSON preview of `input` (truncated ~140 chars).
- Style tool rows distinctly (muted mono chip label + text, e.g., `[tool]` uppercase tag like existing "You"/"Agent").
- Keep insertion order interleaved with user/assistant rows so the log reads chronologically.

No changes to the transcript toggle button or panel chrome.

## 3. Skill pill under the Export button + live `skill.md` editor

Top-nav additions in `AgentShell` (near the existing Export button around line 1824):

- Below Export, render a small pill button. Label: the currently selected skill's `label` (or `"No skill selected"`). Derive it from the latest `tool-select_app` output already scanned in `withToolAssets` — lift that scan into a memo `selectedApp = { appId, label } | null` from `messages`.
- Clicking the pill opens a new right-docked side panel `SkillEditorPanel` (styled like `TranscriptPanel` but wider, ~560px), containing:
  - Header: skill label + `appId` + a "Reload" button.
  - Body: a `<textarea>` (monospace, full-height) prefilled with the current `skill.md` contents.
  - Footer: `Save` button (disabled while unchanged/saving), plus a small note "Edits `src/agent/skills/<appId>/skill.md` on disk. Vite HMR reloads; the change applies to the next agent turn."
- Panel state is local (`skillEditorOpen`, `skillDraft`, `skillDirty`, `skillSaving`).

### Server function backing the editor

Add `src/lib/skills/skill-md.functions.ts` with two `createServerFn` endpoints (dev-only guard):

- `readSkillMd({ appId })` → reads `src/agent/skills/<appId>/skill.md` from disk via `fs/promises` and returns `{ content }`.
- `writeSkillMd({ appId, content })` → validates `appId` against the registered `SKILL_BY_APP_ID` keys (path traversal guard), writes the file, returns `{ ok: true }`.

Guardrails:
- Wrap both handlers in `if (process.env.NODE_ENV !== "development") throw new Response("Disabled in production", { status: 403 })` so the editor only works in the local/preview dev server (where the filesystem is writable). The pill still renders in prod but the panel shows a read-only banner + disabled Save.
- Use `path.resolve(process.cwd(), "src/agent/skills", appId, "skill.md")` and assert the resolved path starts with the skills directory.

On successful save, Vite's `?raw` HMR reloads `bodyMd` and `AgentShell` picks it up on the next `useChat` turn (no client reload needed). No changes to `skill.ts` are made or needed for prompt tweaks.

## 4. Files touched

- `src/components/studio/agent/agent-shell.tsx` — memoized `selectedApp`, new skill pill under Export, new `SkillEditorPanel`, extended `TranscriptPanel` rows for tool events.
- `src/lib/skills/skill-md.functions.ts` (new) — `readSkillMd` / `writeSkillMd` server fns, dev-guarded, path-validated.

No changes to skill packs, block registry, prompt composition, or `skill.ts` files.

## 5. Out of scope

- Editing `skill.ts` from the UI (structural changes still require a code edit).
- Persisting edits across redeploys in production.
- Editing block `.md` files (same pattern would work later if useful).

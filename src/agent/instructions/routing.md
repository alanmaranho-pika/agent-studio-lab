# INS_ROUTING

How the agent decides when to invoke a skill vs. keep discussing.

## Discovering skills

- The APP CATALOG summary (`renderAppCatalogSummary()`) is injected every turn — one line per skill (`id`, kind, one-liner).
- Full step playbook (`skill.md`) is injected ONLY for the skill the project has selected. Mid-flow detours fetch other playbooks on demand via `get_app_playbook({ appId })`.

## When to call `select_app` / `run_skill`

- The user is clearly ready: a concrete project described, a setup question answered, an asset uploaded, or "let's go".
- A single-artifact intent (one still, one clip) → pick a model skill.
- A multi-shot project intent (short film, music video, ad) → pick a wizard skill.
- Call `select_app` ONCE per project, before the first step. Do not re-route mid-flow unless the user asks.

## When NOT to call a skill

- The user is still exploring or negotiating what to make — stay in DISCUSS with prose + an options block.
- A skill is already selected and the user is iterating on a single artifact — stay on it. Never interrupt an iteration loop with the next wizard step.

## Mid-flow detours

- If a needed input is missing (product photo, likeness), detour: an upload block, or generate one via generate_image, then resume the skill's playbook.
- Revisiting an earlier decision re-opens THAT step prefilled; patch only the changed fields, then ask before invalidating dependent work.
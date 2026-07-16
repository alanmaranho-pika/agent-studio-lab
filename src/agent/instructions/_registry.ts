// Tier-1 agent instructions — the "above the skills" behavior control.
//
// Each .md file has a stable INS_* id, is editable in place, and is loaded
// with Vite's `?raw` import so no build step is needed. The composed
// prompt in prompt/core.ts + prompt/phases.ts assembles these in the
// canonical order:
//
//   IDENTITY + ROUTING + GUARDRAILS
//   + PHASE prompt
//   + BLOCKS index
//   + selected-skill playbook (or catalog summary)
//   + referenced blocks' block.md
//
// This means: to change how the agent decides to call a skill, edit
// routing.md. To change what a phase does, edit phases/<phase>.md. No code
// change required.

import identityMd from "./identity.md?raw";
import routingMd from "./routing.md?raw";
import guardrailsMd from "./guardrails.md?raw";
import blocksOverviewMd from "./blocks-overview.md?raw";
import inlineEditMd from "./inline-edit.md?raw";
import discussMd from "./phases/discuss.md?raw";
import planMd from "./phases/plan.md?raw";
import renderMd from "./phases/render.md?raw";
import editMd from "./phases/edit.md?raw";

export type InstructionId =
  | "INS_IDENTITY"
  | "INS_ROUTING"
  | "INS_GUARDRAILS"
  | "INS_BLOCKS_INDEX"
  | "INS_INLINE_EDIT"
  | "INS_PHASE_DISCUSS"
  | "INS_PHASE_PLAN"
  | "INS_PHASE_RENDER"
  | "INS_PHASE_EDIT";

export const INSTRUCTIONS: Record<InstructionId, string> = {
  INS_IDENTITY: identityMd,
  INS_ROUTING: routingMd,
  INS_GUARDRAILS: guardrailsMd,
  INS_BLOCKS_INDEX: blocksOverviewMd,
  INS_INLINE_EDIT: inlineEditMd,
  INS_PHASE_DISCUSS: discussMd,
  INS_PHASE_PLAN: planMd,
  INS_PHASE_RENDER: renderMd,
  INS_PHASE_EDIT: editMd,
};

export function getInstruction(id: InstructionId): string {
  return INSTRUCTIONS[id];
}

/** Strip the leading `# INS_*` header — the prompt already frames each section. */
export function stripHeader(md: string): string {
  return md.replace(/^#\s*INS_[A-Z_]+\s*\n+/, "").trim();
}
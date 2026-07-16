// Per-phase prompt modules. Exactly ONE is injected per turn, selected by
// the server-side phase machine (phase.server.ts). The bodies live in
// editable Markdown under src/agent/instructions/phases/; this module maps
// each AgentPhase to the corresponding instruction id.

import type { AgentPhase } from "../phase.server";
import { getInstruction, stripHeader, type InstructionId } from "@/agent/instructions/_registry";

const PHASE_INSTRUCTION_ID: Record<AgentPhase, InstructionId> = {
  discuss: "INS_PHASE_DISCUSS",
  plan: "INS_PHASE_PLAN",
  render: "INS_PHASE_RENDER",
  edit: "INS_PHASE_EDIT",
};

export function getPhasePrompt(phase: AgentPhase): string {
  return stripHeader(getInstruction(PHASE_INSTRUCTION_ID[phase]));
}
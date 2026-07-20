// Server-side phase machine — replaces the prose "Phase 1/2/3" doctrine and
// the director/producer/editor role addenda. The phase is derived in code
// from durable project state + the latest user message (pure logic lives in
// ./phase, shared with the client debug HUD), and it selects:
//   (a) which phase prompt module is injected (prompt/phases.ts)
//   (b) which tools are eagerly registered for the turn
// so weak-model failure modes become structurally impossible rather than
// merely discouraged.

import type { AgentPhase } from "./phase";

// Re-export the pure derivation logic so existing server importers
// (chat.ts) keep resolving these from phase.server.
export { derivePhase, extractLatestUserText } from "./phase";
export type { AgentPhase } from "./phase";

// Eager tool surface per phase. render_turn / patch / note_decision are
// always available; tool_search + tool_invoke keep the long tail reachable
// from any phase.
const ALWAYS = ["render_turn", "commit_project_patch", "note_decision", "tool_search", "tool_invoke"];

const PHASE_TOOLS: Record<AgentPhase, string[]> = {
  discuss: [...ALWAYS, "select_app", "run_skill", "generate_image", "search_stock_media", "get_app_playbook"],
  plan: [
    ...ALWAYS,
    "select_app",
    "run_skill",
    "save_skill",
    "generate_image",
    "search_stock_media",
    "generate_scene_anchor",
    "approve_scene_anchor",
    "get_app_playbook",
  ],
  render: [
    ...ALWAYS,
    "run_model_app",
    "run_skill",
    "save_skill",
    "generate_image",
    "generate_scene_anchor",
    "approve_scene_anchor",
    "get_app_playbook",
  ],
  edit: [...ALWAYS, "save_cut", "switch_cut", "run_model_app", "run_skill"],
};

export function toolsForPhase<T extends Record<string, unknown>>(
  phase: AgentPhase,
  tools: T,
): Partial<T> {
  const allowed = new Set(PHASE_TOOLS[phase]);
  const out: Record<string, unknown> = {};
  for (const [name, impl] of Object.entries(tools)) {
    if (allowed.has(name)) out[name] = impl;
  }
  return out as Partial<T>;
}

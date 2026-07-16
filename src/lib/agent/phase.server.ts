// Server-side phase machine — replaces the prose "Phase 1/2/3" doctrine and
// the director/producer/editor role addenda. The phase is derived in code
// from durable project state + the latest user message, and it selects:
//   (a) which phase prompt module is injected (prompt/phases.ts)
//   (b) which tools are eagerly registered for the turn
// so weak-model failure modes become structurally impossible rather than
// merely discouraged.

import type { UIMessage } from "ai";
import type { ProjectState } from "@/lib/project-state";

export type AgentPhase = "discuss" | "plan" | "render" | "edit";

const RENDER_TRIGGERS = [
  /\brender\b/i,
  /\bgenerate (?:the |all |it|them|these|those|shots?|beats?|videos?|clips?)\b/i,
  /\bmake (?:the |it|them|these|those)\b/i,
  /\bkick off\b/i,
  /\brun (?:it|them|the (?:render|shot|beat))\b/i,
  /\bstart (?:the )?(?:render|beat|shot|generation)\b/i,
  /\banchor\b/i,
  /\blet'?s go\b/i,
];

const EDIT_TRIGGERS = [
  /\btimeline\b/i,
  /\breorder\b/i,
  /\bmove (?:clip|shot|beat)\b/i,
  /\bswap (?:clip|shot)\b/i,
  /\bexport\b/i,
  /\bshare (?:to )?community\b/i,
  /\bfinal cut\b/i,
  /\btrim\b/i,
  /\bassemble\b/i,
  /\bsave (?:this )?(?:as )?(?:a )?(?:cut|version|v\d)\b/i,
  /\block (?:this |the )?(?:cut|version)\b/i,
  /\brevert\b/i,
  /\bgo back to v\d/i,
];

export function extractLatestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role !== "user" || !Array.isArray(m.parts)) continue;
    const text = (m.parts as Array<{ type?: string; text?: string }>)
      .filter((p) => p?.type === "text" && typeof p.text === "string")
      .map((p) => p.text ?? "")
      .join(" ")
      .trim();
    if (text) return text;
  }
  return "";
}

export function derivePhase(
  state: ProjectState,
  selectedAppSlug: string | null,
  latestUserText: string,
): AgentPhase {
  if (EDIT_TRIGGERS.some((rx) => rx.test(latestUserText))) return "edit";

  const hasScenes = state.scenes.length > 0;
  const hasClips =
    state.scenes.some((s) => !!s.clipUrl) ||
    (state.timeline?.order?.length ?? 0) > 0;
  const anchorsInFlight = state.scenes.some(
    (s) => (s.anchorAssetIds?.length ?? 0) > 0,
  );

  if (hasScenes && (RENDER_TRIGGERS.some((rx) => rx.test(latestUserText)) || anchorsInFlight)) {
    return "render";
  }
  if (hasClips) return "edit";
  if (selectedAppSlug || hasScenes || state.cast.length > 0) return "plan";
  return "discuss";
}

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

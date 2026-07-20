// Pure phase-derivation logic — shared by the server phase machine
// (phase.server.ts, which selects the injected prompt + eager tools) and the
// client debug HUD (agent-shell.tsx, which shows which phase a turn ran in).
// Kept free of any server-only imports so it is safe to bundle client-side.

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

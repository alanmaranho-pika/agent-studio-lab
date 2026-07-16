// Serializes a RenderTurn into the stage's existing HTML dialect. The
// per-block serializers live under src/agent/blocks/<name>/; this file is
// a thin facade that walks the turn envelope and dispatches each block to
// the registry.

import type { RenderTurn } from "./ui-schema";
import { blockToHtml } from "@/agent/blocks/_registry";
import { esc } from "@/agent/blocks/types";

/**
 * Serialize a RenderTurn into the legacy stage HTML dialect. The output
 * flows through the exact same client pipeline as hand-written model HTML
 * (sanitize → enhance → delegate), so typed turns and legacy turns are
 * indistinguishable at render time.
 */
export function renderTurnToHtml(turn: RenderTurn): string {
  const parts: string[] = [];
  if (turn.ack) parts.push(`<p data-ack>${esc(turn.ack)}</p>`);
  parts.push(`<p data-prose>${esc(turn.prose)}</p>`);
  for (const block of turn.blocks ?? []) parts.push(blockToHtml(block));
  return parts.join("\n");
}
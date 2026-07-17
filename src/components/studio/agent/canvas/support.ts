// Which render_turn block types the canvas (Pixi) renderer can draw.
// Pure module — no Pixi import — so agent-shell can gate per turn without
// pulling the canvas bundle into the SSR module graph.

import type { RenderTurn, TurnBlock } from "@/lib/agent/ui-schema";

export const CANVAS_SUPPORTED_TYPES: ReadonlySet<TurnBlock["type"]> = new Set([
  "options",
  "gallery",
  "storyboard",
]);

/** A turn is canvas-renderable only when it has blocks AND every block is a
 * type the canvas path implements — per-turn fallback keeps each turn's UX
 * coherent (never half-canvas, half-DOM). */
export function isCanvasRenderableTurn(turn: RenderTurn): boolean {
  const blocks = turn.blocks ?? [];
  if (blocks.length === 0) return false;
  return blocks.every((b) => CANVAS_SUPPORTED_TYPES.has(b.type));
}

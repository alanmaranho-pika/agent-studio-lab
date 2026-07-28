// RenderTurn — the typed Gen-UI contract between the agent and the center
// stage. Individual block schemas + HTML serializers now live per-file
// under src/agent/blocks/<name>/. This module is a thin facade that
// composes the turn envelope (ack / prose / blocks / next) around the
// block registry, and preserves every legacy import path so downstream
// callers (turn-guard, agent-shell, chat route) don't change.

import { z } from "zod";
import { TurnBlockSchema, type TurnBlock } from "@/agent/blocks/_registry";
import {
  NextHintSchema,
  type TurnOptionItem,
  type TurnActionButton,
  type TurnFormField,
} from "@/agent/blocks/_shared";
import { ICON_SLUGS, NEXT_UI_HINTS } from "@/agent/blocks/types";

export { TurnBlockSchema, ICON_SLUGS, NEXT_UI_HINTS };
export type { TurnBlock, TurnOptionItem, TurnActionButton, TurnFormField };

// NOTE: kept as a plain object schema (no .superRefine) so the AI SDK can
// serialize it to JSON Schema for the tool definition. Cross-field
// invariants are enforced in turn-guard.server.ts, whose errors are
// returned from the tool execute so the model self-corrects in-loop.
export const RenderTurnSchema = z.object({
  ack: z
    .string()
    .max(60)
    .optional()
    .describe(
      "Ultra-short reaction to the user's last answer, ≤8 words ('Got it — widescreen.'). Omit on a first turn.",
    ),
  prose: z
    .string()
    .min(1)
    .max(160)
    .describe(
      "The ONE question or statement of this turn, ≤14 words, warm director's voice",
    ),
  blocks: z
    .array(TurnBlockSchema)
    .max(2)
    .optional()
    .describe(
      "The turn's UI. Render exactly ONE primary stage block; an optional actions block may accompany it. At most ONE interactive block (options/form/upload) — one decision per turn.",
    ),
  next: NextHintSchema,
});

export type RenderTurn = z.infer<typeof RenderTurnSchema>;

export function isInteractiveBlock(block: TurnBlock): boolean {
  return block.type === "options" || block.type === "form" || block.type === "upload";
}

/** Every block except an actions row occupies the stage's primary surface. */
export function isPrimaryStageBlock(block: TurnBlock): boolean {
  return block.type !== "actions";
}

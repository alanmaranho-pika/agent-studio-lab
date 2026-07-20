import { z } from "zod";
import { actionButtonsHtml, esc, type BlockDef } from "../types";
import { ActionButtonSchema } from "../_shared";
import usageMd from "./block.md?raw";

export const StageBlockSchema = z.object({
  type: z.literal("stage"),
  view: z
    .enum(["script-beats", "storyboard", "character"])
    .describe(
      "Full-stage React view rendered from project state — use for beat/storyboard/character review. For the cut, use the dedicated timeline block.",
    ),
  focusSceneId: z.string().max(120).optional(),
  focusCastId: z.string().max(120).optional(),
  actions: z.array(ActionButtonSchema).min(1).max(4).describe("2–4 short contextual next steps"),
});

export type StageBlockValue = z.infer<typeof StageBlockSchema>;

export function stageToHtml(block: StageBlockValue): string {
  // Legacy tolerance: historical turns stored `view: "timeline"` with a
  // `variant` before BLK_TIMELINE existed. Stored payloads bypass zod on
  // re-render, so keep serializing those fields for old messages.
  const legacyVariant = (block as { variant?: string }).variant;
  const focus =
    (legacyVariant ? ` data-variant="${esc(legacyVariant)}"` : "") +
    (block.focusSceneId ? ` data-focus-scene="${esc(block.focusSceneId)}"` : "") +
    (block.focusCastId ? ` data-focus-cast="${esc(block.focusCastId)}"` : "");
  return `<div data-gen-view="${esc(block.view)}"${focus}></div>${actionButtonsHtml(block.actions)}`;
}

export const StageBlock: BlockDef<typeof StageBlockSchema, StageBlockValue> = {
  id: "BLK_STAGE",
  type: "stage",
  schema: StageBlockSchema,
  usageMd,
  toHtml: stageToHtml,
};

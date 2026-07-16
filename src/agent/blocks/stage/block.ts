import { z } from "zod";
import { actionButtonsHtml, esc, type BlockDef } from "../types";
import { ActionButtonSchema } from "../_shared";
import usageMd from "./block.md?raw";

export const StageBlockSchema = z.object({
  type: z.literal("stage"),
  view: z
    .enum(["script-beats", "storyboard", "timeline", "character"])
    .describe(
      "Full-stage React view rendered from project state — use for beat/storyboard/timeline/character review",
    ),
  variant: z
    .enum(["preview", "editor", "scenes"])
    .optional()
    .describe(
      "timeline view only — preview (default: player + clip strip), editor (multi-track editing), scenes (one focused scene, pair with focusSceneId)",
    ),
  focusSceneId: z.string().max(120).optional(),
  focusCastId: z.string().max(120).optional(),
  actions: z
    .array(ActionButtonSchema)
    .min(1)
    .max(4)
    .describe("2–4 short contextual next steps"),
});

export type StageBlockValue = z.infer<typeof StageBlockSchema>;

export function stageToHtml(block: StageBlockValue): string {
  const focus =
    (block.variant ? ` data-variant="${esc(block.variant)}"` : "") +
    (block.focusSceneId ? ` data-focus-scene="${esc(block.focusSceneId)}"` : "") +
    (block.focusCastId ? ` data-focus-cast="${esc(block.focusCastId)}"` : "");
  return `<div data-gen-view="${block.view}"${focus}></div>${actionButtonsHtml(block.actions)}`;
}

export const StageBlock: BlockDef<typeof StageBlockSchema, StageBlockValue> = {
  id: "BLK_STAGE",
  type: "stage",
  schema: StageBlockSchema,
  usageMd,
  toHtml: stageToHtml,
};
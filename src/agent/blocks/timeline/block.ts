import { z } from "zod";
import { actionButtonsHtml, esc, type BlockDef } from "../types";
import { ActionButtonSchema } from "../_shared";
import usageMd from "./block.md?raw";

export const TIMELINE_BLOCK_VARIANTS = ["preview", "editor", "scenes"] as const;

export const TimelineBlockSchema = z
  .object({
    type: z.literal("timeline"),
    variant: z
      .enum(TIMELINE_BLOCK_VARIANTS)
      .optional()
      .describe(
        "preview (default — player + clip strip for reviewing the cut), editor (multi-track editing), scenes (one focused scene — pair with focusSceneId)",
      ),
    focusSceneId: z
      .string()
      .max(120)
      .optional()
      .describe("scenes variant only — the scene under discussion"),
    actions: z
      .array(ActionButtonSchema)
      .min(1)
      .max(4)
      .describe("2–4 short contextual next steps — the timeline is not self-driving"),
  })
  .describe(
    "Full-stage timeline of the project's cut, rendered from PROJECT STATE (not tool output). Use after patching the timeline field to review, edit, or discuss the cut.",
  );

export type TimelineBlockValue = z.infer<typeof TimelineBlockSchema>;

// Serializes to the same `data-gen-view` stage dialect the client already
// upgrades (extractStageGeneration → StageGenerationView → StageTimelineView),
// so legacy stage/timeline turns and this first-class block render through
// one pipeline.
export function timelineToHtml(block: TimelineBlockValue): string {
  const attrs =
    (block.variant ? ` data-variant="${esc(block.variant)}"` : "") +
    (block.focusSceneId ? ` data-focus-scene="${esc(block.focusSceneId)}"` : "");
  return `<div data-gen-view="timeline"${attrs}></div>${actionButtonsHtml(block.actions)}`;
}

export const TimelineBlock: BlockDef<typeof TimelineBlockSchema, TimelineBlockValue> = {
  id: "BLK_TIMELINE",
  type: "timeline",
  schema: TimelineBlockSchema,
  usageMd,
  toHtml: timelineToHtml,
};

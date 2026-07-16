import { z } from "zod";
import { actionButtonsHtml, type BlockDef } from "../types";
import { ActionButtonSchema } from "../_shared";
import usageMd from "./block.md?raw";

export const ActionsBlockSchema = z.object({
  type: z.literal("actions"),
  buttons: z
    .array(ActionButtonSchema)
    .min(1)
    .max(4)
    .describe(
      "Confirm/next-step row rendered UNDER a content block (media, list, stage). Never the turn's primary choice — when the turn asks the user to pick between things, use an `options` block instead.",
    ),
});

export type ActionsBlockValue = z.infer<typeof ActionsBlockSchema>;

export function actionsToHtml(block: ActionsBlockValue): string {
  return actionButtonsHtml(block.buttons);
}

export const ActionsBlock: BlockDef<typeof ActionsBlockSchema, ActionsBlockValue> = {
  id: "BLK_ACTIONS",
  type: "actions",
  schema: ActionsBlockSchema,
  usageMd,
  toHtml: actionsToHtml,
};
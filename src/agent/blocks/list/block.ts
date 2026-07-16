import { z } from "zod";
import { actionButtonsHtml, esc, type BlockDef } from "../types";
import { ActionButtonSchema } from "../_shared";
import usageMd from "./block.md?raw";

export const ListBlockSchema = z.object({
  type: z.literal("list"),
  title: z.string().max(48).optional(),
  items: z
    .array(
      z.object({
        meta: z
          .string()
          .max(64)
          .optional()
          .describe("Small eyebrow, e.g. 'Shot 1 · 3s · Wide'"),
        text: z.string().max(280),
      }),
    )
    .min(1)
    .max(12),
  actions: z.array(ActionButtonSchema).max(4).optional(),
});

export type ListBlockValue = z.infer<typeof ListBlockSchema>;

export function listToHtml(block: ListBlockValue): string {
  const items = block.items
    .map(
      (item) =>
        `<li class="rounded-2xl border border-border p-4">${item.meta ? `<div class="text-sm text-muted-foreground">${esc(item.meta)}</div>` : ""}<div class="font-medium">${esc(item.text)}</div></li>`,
    )
    .join("");
  return `<div data-card${block.title ? ` data-card-title="${esc(block.title)}"` : ""}><ol class="space-y-3 my-4">${items}</ol></div>${actionButtonsHtml(block.actions)}`;
}

export const ListBlock: BlockDef<typeof ListBlockSchema, ListBlockValue> = {
  id: "BLK_LIST",
  type: "list",
  schema: ListBlockSchema,
  usageMd,
  toHtml: listToHtml,
};
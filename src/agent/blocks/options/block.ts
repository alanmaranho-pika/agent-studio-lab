import { z } from "zod";
import { esc, type BlockDef } from "../types";
import { OptionItemSchema } from "../_shared";
import usageMd from "./block.md?raw";

export const OptionsBlockSchema = z.object({
  type: z.literal("options"),
  cols: z
    .enum(["2", "3", "4", "2x2", "3x3"])
    .optional()
    .describe(
      "Advisory only — the layout is computed from the option count (the full-width stage centers ≤5 options in one row and wraps 6+ into two wide rows, never taller). Just pick a sensible option count; you may omit this.",
    ),
  items: z.array(OptionItemSchema).min(2).max(9),
});

export type OptionsBlockValue = z.infer<typeof OptionsBlockSchema>;

export function optionsToHtml(block: OptionsBlockValue): string {
  const items = block.items
    .map((item) => {
      let visual = "";
      const v = item.visual;
      if (v?.kind === "ratio") {
        visual = `<span data-visual="ratio-${v.ratio.replace(":", "-")}"></span>`;
      } else if (v?.kind === "icon") {
        visual = `<span data-visual="icon" data-icon="${esc(v.icon)}"${v.bg ? ` data-icon-bg="${esc(v.bg)}"` : ""}></span>`;
      } else if (v?.kind === "image") {
        visual = `<span data-visual="image" data-src="${esc(v.url)}"></span>`;
      }
      const subtitle = item.subtitle ? `<span data-subtitle>${esc(item.subtitle)}</span>` : "";
      return `<button data-action="answer" data-value="${esc(item.value)}"${item.next ? ` data-next="${esc(item.next)}"` : ""}${item.ack ? ` data-ack="${esc(item.ack)}"` : ""}>${visual}<span data-title>${esc(item.title)}</span>${subtitle}</button>`;
    })
    .join("");
  return `<div data-options${block.cols ? ` data-cols="${block.cols}"` : ""}>${items}</div>`;
}

export const OptionsBlock: BlockDef<typeof OptionsBlockSchema, OptionsBlockValue> = {
  id: "BLK_OPTIONS",
  type: "options",
  schema: OptionsBlockSchema,
  usageMd,
  toHtml: optionsToHtml,
};
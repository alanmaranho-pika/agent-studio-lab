import { z } from "zod";
import { actionButtonsHtml, esc, type BlockDef } from "../types";
import { ActionButtonSchema } from "../_shared";
import usageMd from "./block.md?raw";

export const StoryboardBlockSchema = z
  .object({
    type: z.literal("storyboard"),
    title: z
      .string()
      .max(48)
      .optional()
      .describe("Card eyebrow, e.g. 'Lumen Lamp Ad Storyboard'"),
    items: z
      .array(
        z.object({
          meta: z.string().max(64).optional().describe("Slide eyebrow, e.g. 'Shot 1 · 5s'"),
          title: z.string().min(1).max(64).describe("Big display title, ≤6 words"),
          text: z.string().max(280).optional().describe("Shot description / visual prompt"),
          vo: z.string().max(160).optional().describe("Voiceover line read during this shot"),
        }),
      )
      .min(1)
      .max(12),
    actions: z.array(ActionButtonSchema).max(4).optional(),
  })
  .describe(
    "Cinematic shot-by-shot storyboard shown one slide at a time. Use for shot lists / beat breakdowns — never a plain list.",
  );

export type StoryboardBlockValue = z.infer<typeof StoryboardBlockSchema>;

export function storyboardToHtml(block: StoryboardBlockValue): string {
  const slides = block.items
    .map((item, i) => {
      const eyebrow = item.meta ? `<span class="gen-shot-eyebrow">${esc(item.meta)}</span>` : "";
      const text = item.text ? `<p class="gen-shot-text">${esc(item.text)}</p>` : "";
      const vo = item.vo ? `<p class="gen-shot-vo">${esc(item.vo)}</p>` : "";
      const body = text || vo ? `<div class="gen-shot-body">${text}${vo}</div>` : "";
      return `<section class="gen-shot" data-shot="${i}">${eyebrow}<h3 class="gen-shot-title">${esc(item.title)}</h3>${body}</section>`;
    })
    .join("");
  const segments = block.items
    .map(
      (_, i) =>
        `<button type="button" data-shot-seg="${i}" aria-label="Shot ${i + 1}"><span class="gen-seg-fill"></span></button>`,
    )
    .join("");
  return `<div data-card${block.title ? ` data-card-title="${esc(block.title)}"` : ""} data-storyboard><div class="gen-storyboard">${slides}<div class="gen-storyboard-progress">${segments}</div></div></div>${actionButtonsHtml(block.actions)}`;
}

export const StoryboardBlock: BlockDef<typeof StoryboardBlockSchema, StoryboardBlockValue> = {
  id: "BLK_STORYBOARD",
  type: "storyboard",
  schema: StoryboardBlockSchema,
  usageMd,
  toHtml: storyboardToHtml,
};
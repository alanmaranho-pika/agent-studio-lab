import { z } from "zod";
import { actionButtonsHtml, esc, type BlockDef } from "../types";
import { ActionButtonSchema } from "../_shared";
import usageMd from "./block.md?raw";

export const GalleryBlockSchema = z
  .object({
    type: z.literal("gallery"),
    title: z
      .string()
      .max(48)
      .optional()
      .describe("Card eyebrow above the images, e.g. 'Character concepts'"),
    items: z
      .array(
        z.object({
          url: z
            .string()
            .min(1)
            .describe(
              "Image URL from a tool result THIS turn or project assets — never invent one",
            ),
          label: z
            .string()
            .max(40)
            .optional()
            .describe(
              "Short chip shown bottom-left, e.g. the concept / character / style name. Add it when the images are distinct options the user might name; omit for a single review.",
            ),
        }),
      )
      .min(1)
      .max(6),
    actions: z
      .array(ActionButtonSchema)
      .max(4)
      .optional()
      .describe(
        "Shared next-step CTAs for the whole set (Lock it in / Try again / …)",
      ),
  })
  .describe(
    "1–6 still IMAGES shown for review or comparison — concepts, scene anchors, style / character references. Layout is automatic and count-driven (1 centered, 2–3 across, 4–6 wrap); you never choose it. Use for images the user looks at, judges, or picks among. A finished video or audio clip is a `media` block; a forced pick of exactly ONE image is an `options` block.",
  );

export type GalleryBlockValue = z.infer<typeof GalleryBlockSchema>;

export function galleryToHtml(block: GalleryBlockValue): string {
  const count = block.items.length;
  const cards = block.items
    .map((item) => {
      const label = item.label
        ? `<span class="gen-gallery-label">${esc(item.label)}</span>`
        : "";
      return `<figure class="gen-gallery-item"><img src="${esc(item.url)}" />${label}</figure>`;
    })
    .join("");
  return `<div data-card${block.title ? ` data-card-title="${esc(block.title)}"` : ""}><div class="gen-gallery" data-count="${count}">${cards}</div></div>${actionButtonsHtml(block.actions)}`;
}

export const GalleryBlock: BlockDef<typeof GalleryBlockSchema, GalleryBlockValue> = {
  id: "BLK_GALLERY",
  type: "gallery",
  schema: GalleryBlockSchema,
  usageMd,
  toHtml: galleryToHtml,
};
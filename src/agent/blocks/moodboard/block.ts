import { z } from "zod";
import { actionButtonsHtml, esc, type BlockDef } from "../types";
import { ActionButtonSchema } from "../_shared";
import usageMd from "./block.md?raw";

const HEX_COLOR = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);

const MoodboardTileSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
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
        "Short chip naming what this tile contributes, e.g. 'Costume', 'Landscape', 'Texture'",
      ),
  }),
  z.object({
    kind: z.literal("palette"),
    colors: z
      .array(HEX_COLOR)
      .min(3)
      .max(6)
      .describe(
        "The direction's color story, pulled from the imagery — 3–6 hexes, dominant first",
      ),
  }),
  z.object({
    kind: z.literal("type"),
    text: z
      .string()
      .min(1)
      .max(80)
      .describe(
        "Short type specimen — a word or evocative fragment shown large, newlines allowed",
      ),
    bg: HEX_COLOR.optional().describe("Tile background hex; defaults to the theme lavender"),
    label: z.string().max(40).optional(),
  }),
]);

export const MoodboardBlockSchema = z
  .object({
    type: z.literal("moodboard"),
    title: z
      .string()
      .max(48)
      .optional()
      .describe("Card eyebrow, e.g. 'Dune western — visual direction'"),
    items: z.array(MoodboardTileSchema).min(3).max(10),
    actions: z
      .array(ActionButtonSchema)
      .max(4)
      .optional()
      .describe("Shared CTAs for the whole board (Lock it in / Let's rework / …)"),
  })
  .describe(
    "ONE composed visual direction shown as a masonry collage — mixed tiles laid out automatically, every image at its native aspect ratio. Use when proposing a style / vibe / world for sign-off: 4–8 labeled image tiles, usually ONE palette tile (colors pulled from the imagery), optionally ONE type-specimen tile. It presents a single direction to lock or rework — comparing alternatives is a gallery or options block.",
  );

export type MoodboardBlockValue = z.infer<typeof MoodboardBlockSchema>;

export function moodboardToHtml(block: MoodboardBlockValue): string {
  const cols = block.items.length <= 4 ? "2" : block.items.length >= 8 ? "4" : "3";
  const tiles = block.items
    .map((tile) => {
      if (tile.kind === "image") {
        const label = tile.label
          ? `<span class="gen-gallery-label">${esc(tile.label)}</span>`
          : "";
        return `<figure class="gen-mood-tile gen-mood-image"><img src="${esc(tile.url)}" />${label}</figure>`;
      }
      if (tile.kind === "palette") {
        const swatches = tile.colors
          .map((c) => `<span class="gen-mood-swatch" data-swatch="${esc(c)}"></span>`)
          .join("");
        return `<div class="gen-mood-tile gen-mood-palette">${swatches}</div>`;
      }
      const lines = tile.text
        .split("\n")
        .map((l) => esc(l))
        .join("<br />");
      const label = tile.label
        ? `<span class="gen-gallery-label">${esc(tile.label)}</span>`
        : "";
      return `<div class="gen-mood-tile gen-mood-type"${tile.bg ? ` data-bg="${esc(tile.bg)}"` : ""}><span class="gen-mood-type-text">${lines}</span>${label}</div>`;
    })
    .join("");
  return `<div data-card${block.title ? ` data-card-title="${esc(block.title)}"` : ""}><div class="gen-moodboard" data-cols="${cols}">${tiles}</div></div>${actionButtonsHtml(block.actions)}`;
}

export const MoodboardBlock: BlockDef<typeof MoodboardBlockSchema, MoodboardBlockValue> = {
  id: "BLK_MOODBOARD",
  type: "moodboard",
  schema: MoodboardBlockSchema,
  usageMd,
  toHtml: moodboardToHtml,
};
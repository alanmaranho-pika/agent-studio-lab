import { z } from "zod";
import { actionButtonsHtml, esc, type BlockDef } from "../types";
import { ActionButtonSchema } from "../_shared";
import usageMd from "./block.md?raw";

export const MediaBlockSchema = z.object({
  type: z.literal("media"),
  url: z
    .string()
    .min(1)
    .describe(
      "Media URL from a tool result THIS turn or project assets — never invent one",
    ),
  mediaKind: z
    .enum(["image", "video", "audio"])
    .describe(
      "A single finished clip to play/approve. For still images shown for review or comparison, prefer a `gallery` block instead.",
    ),
  title: z.string().max(48).optional().describe("Short overlay title, ≤6 words"),
  caption: z.string().max(140).optional(),
  variants: z
    .array(z.string())
    .max(6)
    .optional()
    .describe("URLs of previous takes of the same shot; omit when there's one take"),
  actions: z
    .array(ActionButtonSchema)
    .max(4)
    .optional()
    .describe("Next-step CTAs below the media (Approve / Regenerate / …)"),
});

export type MediaBlockValue = z.infer<typeof MediaBlockSchema>;

export function mediaToHtml(block: MediaBlockValue): string {
  const title = block.title ? `<h3 data-card-title>${esc(block.title)}</h3>` : "";
  const caption = block.caption ? `<p data-card-caption>${esc(block.caption)}</p>` : "";
  const media =
    block.mediaKind === "video"
      ? `<video src="${esc(block.url)}" class="w-full h-auto rounded-2xl" controls autoplay muted playsinline></video>`
      : block.mediaKind === "audio"
        ? `<audio src="${esc(block.url)}" controls class="w-full"></audio>`
        : `<img src="${esc(block.url)}" class="w-full h-auto rounded-2xl" />`;
  const cardActions =
    block.mediaKind === "audio"
      ? ""
      : `<button data-card-action="regenerate"></button><button data-card-action="edit"></button><button data-card-action="more"></button>`;
  const variants = block.variants?.length
    ? `<div data-variants>${block.variants
        .map(
          (u) =>
            `<button data-variant${u === block.url ? ` data-active="true"` : ""}><img src="${esc(u)}" /></button>`,
        )
        .join("")}</div>`
    : "";
  return `<div data-card>${media}${title}${caption}${cardActions}${variants}</div>${actionButtonsHtml(block.actions)}`;
}

export const MediaBlock: BlockDef<typeof MediaBlockSchema, MediaBlockValue> = {
  id: "BLK_MEDIA",
  type: "media",
  schema: MediaBlockSchema,
  usageMd,
  toHtml: mediaToHtml,
};
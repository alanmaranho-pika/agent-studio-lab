import { z } from "zod";
import type { BlockDef } from "../types";
import usageMd from "./block.md?raw";

export const CustomHtmlBlockSchema = z.object({
  type: z.literal("custom_html"),
  html: z
    .string()
    .min(1)
    .max(8000)
    .describe(
      "Escape hatch for UI no typed block can express. Raw HTML, sanitized at render. Interactive elements must use <button data-action=\"answer\" data-value=\"…\">. Prefer typed blocks whenever they fit.",
    ),
});

export type CustomHtmlBlockValue = z.infer<typeof CustomHtmlBlockSchema>;

export function customHtmlToHtml(block: CustomHtmlBlockValue): string {
  return block.html;
}

export const CustomHtmlBlock: BlockDef<typeof CustomHtmlBlockSchema, CustomHtmlBlockValue> = {
  id: "BLK_CUSTOM_HTML",
  type: "custom_html",
  schema: CustomHtmlBlockSchema,
  usageMd,
  toHtml: customHtmlToHtml,
};
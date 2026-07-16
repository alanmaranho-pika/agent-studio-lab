import { z } from "zod";
import { esc, type BlockDef } from "../types";
import usageMd from "./block.md?raw";

export const UploadBlockSchema = z.object({
  type: z.literal("upload"),
  kind: z.enum(["likeness", "logo", "reference", "voice", "audio", "video", "other"]),
  label: z.string().min(1).max(80).describe("Tile label, e.g. 'Upload product photo'"),
  hint: z.string().max(80).optional().describe("Second line, e.g. 'PNG, JPG, or WEBP'"),
  allowCamera: z.boolean().optional().describe("Also offer live camera capture"),
  allowUrl: z
    .boolean()
    .optional()
    .describe(
      "Offer a 'Paste URL' card beside the upload when the asset can also come from a web link (e.g. a product photo). Adds a Continue button to submit either path.",
    ),
  skipValue: z
    .string()
    .max(160)
    .optional()
    .describe(
      "If skipping is valid, the answer sent when the user skips (e.g. 'No reference — describe instead')",
    ),
});

export type UploadBlockValue = z.infer<typeof UploadBlockSchema>;

const UPLOAD_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
const LINK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

export function uploadToHtml(block: UploadBlockValue): string {
  const accept =
    block.kind === "voice" || block.kind === "audio"
      ? "audio/*"
      : block.kind === "video"
        ? "video/*"
        : "image/*";
  const hint = block.hint ? `<span class="gen-upload-hint">${esc(block.hint)}</span>` : "";
  const uploadCard =
    `<label class="gen-upload-card gen-upload-card--file">` +
    `<span class="gen-upload-icon">${UPLOAD_ICON}</span>` +
    `<input type="file" data-upload data-kind="${block.kind}" data-value="${esc(block.label)}" accept="${accept}" class="hidden" />` +
    `<span class="gen-upload-body"><span class="gen-upload-title">${esc(block.label)}</span>${hint}</span>` +
    `</label>`;

  if (block.allowUrl) {
    const skip = block.skipValue
      ? `<button type="button" data-action="answer" data-value="${esc(block.skipValue)}" class="gen-cta gen-cta-secondary">Agent Decides</button>`
      : "";
    const urlCard =
      `<div class="gen-upload-card gen-upload-card--url">` +
      `<span class="gen-upload-icon">${LINK_ICON}</span>` +
      `<span class="gen-upload-body"><span class="gen-upload-title">Paste URL</span>` +
      `<input type="url" name="url" placeholder="www…" class="gen-upload-url-input" /></span>` +
      `</div>`;
    return [
      `<div data-card><form data-action="answer">`,
      `<div class="gen-upload" data-cols="2">${uploadCard}${urlCard}</div>`,
      `<div class="gen-upload-actions">`,
      `<button type="submit" class="gen-cta gen-cta-primary">Continue</button>`,
      skip,
      `</div>`,
      `</form></div>`,
    ].join("");
  }

  const camera = block.allowCamera
    ? `<button data-action="capture" data-capture="camera" data-kind="${block.kind}" class="gen-cta gen-cta-secondary">Take a photo</button>`
    : "";
  const skip = block.skipValue
    ? `<button type="button" data-action="answer" data-value="${esc(block.skipValue)}" class="gen-cta gen-cta-secondary">Skip</button>`
    : "";
  const actions =
    camera || skip
      ? `<div class="gen-upload-actions">${camera}${skip}</div>`
      : "";
  return `<div class="gen-upload" data-cols="1">${uploadCard}</div>${actions}`;
}

export const UploadBlock: BlockDef<typeof UploadBlockSchema, UploadBlockValue> = {
  id: "BLK_UPLOAD",
  type: "upload",
  schema: UploadBlockSchema,
  usageMd,
  toHtml: uploadToHtml,
};
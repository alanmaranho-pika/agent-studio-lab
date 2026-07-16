// Shared types for the Gen-UI block registry. Each block module exports a
// BlockDef whose zod schemas compose into the RenderTurn discriminated
// union in _registry.ts, and whose `toHtml` composes the legacy stage HTML
// dialect. IDs (BLK_*) are the human/agent handle referenced from skill
// packs and instruction docs; the wire discriminator (`type`) stays the
// same string the model already writes.

import type { z } from "zod";

export type BlockId =
  | "BLK_OPTIONS"
  | "BLK_FORM"
  | "BLK_UPLOAD"
  | "BLK_MEDIA"
  | "BLK_GALLERY"
  | "BLK_MOODBOARD"
  | "BLK_LIST"
  | "BLK_STORYBOARD"
  | "BLK_STAGE"
  | "BLK_ACTIONS"
  | "BLK_CUSTOM_HTML";

// TValue defaults to `any` so specific block modules can export their
// narrow BlockDef<Schema, Value> AND still be assigned into a shared
// BlockDef[] registry. The registry only ever calls `toHtml` after a
// runtime type-string dispatch, so the wider signature is safe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlockDef<TSchema extends z.ZodTypeAny = z.ZodTypeAny, TValue = any> = {
  id: BlockId;
  /** Discriminator on the JSON wire — do NOT rename without a schema break. */
  type: string;
  schema: TSchema;
  usageMd: string;
  examples?: string[];
  toHtml: (block: TValue) => string;
};

/** Small HTML escape helper shared by every block's serializer. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Renders a `<div data-gen-actions>` row used by media/gallery/list/etc. */
export function actionButtonsHtml(
  actions:
    | Array<{
        value: string;
        label: string;
        primary?: boolean;
        next?: string;
        ack?: string;
      }>
    | undefined,
): string {
  if (!actions?.length) return "";
  const buttons = actions
    .map(
      (a) =>
        `<button data-action="answer" data-value="${esc(a.value)}"${a.primary ? " data-primary" : ""}${a.next ? ` data-next="${esc(a.next)}"` : ""}${a.ack ? ` data-ack="${esc(a.ack)}"` : ""}>${esc(a.label)}</button>`,
    )
    .join("");
  return `<div data-gen-actions>${buttons}</div>`;
}

export const ICON_SLUGS = [
  "music", "users", "user", "voice", "mic", "camera", "film", "image",
  "palette", "sparkles", "wand", "zap", "sun", "moon", "cloud", "star",
  "heart", "play", "volume", "speaker", "video", "clapperboard", "type",
  "layers", "square", "circle", "triangle", "smile", "bag", "shirt",
  "coffee", "flame", "waves", "tree", "building", "car", "rocket", "globe",
  "message", "arrow",
] as const;

export const NEXT_UI_HINTS = [
  "options",
  "form",
  "upload",
  "media",
  "gallery",
  "moodboard",
  "storyboard",
  "list",
  "stage",
  "none",
] as const;
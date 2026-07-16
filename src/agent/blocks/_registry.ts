// The single source of truth for Gen-UI blocks. Each block folder owns its
// schema + HTML serializer + block.md documentation; this file assembles
// them into the discriminated union used by RenderTurn and the
// type-dispatched blockToHtml serializer used at render time.
//
// Adding a new block: create src/agent/blocks/<name>/block.ts (+ block.md),
// then add it to ALL_BLOCKS below. The wire discriminator `type` stays
// stable across renames — the BLK_* id is the human/agent handle.

import { z } from "zod";
import type { BlockDef, BlockId } from "./types";
import { OptionsBlock, OptionsBlockSchema } from "./options/block";
import { FormBlock, FormBlockSchema } from "./form/block";
import { UploadBlock, UploadBlockSchema } from "./upload/block";
import { MediaBlock, MediaBlockSchema } from "./media/block";
import { GalleryBlock, GalleryBlockSchema } from "./gallery/block";
import { MoodboardBlock, MoodboardBlockSchema } from "./moodboard/block";
import { ListBlock, ListBlockSchema } from "./list/block";
import { StoryboardBlock, StoryboardBlockSchema } from "./storyboard/block";
import { StageBlock, StageBlockSchema } from "./stage/block";
import { ActionsBlock, ActionsBlockSchema } from "./actions/block";
import { CustomHtmlBlock, CustomHtmlBlockSchema } from "./custom-html/block";

export const ALL_BLOCKS: BlockDef[] = [
  OptionsBlock,
  FormBlock,
  UploadBlock,
  MediaBlock,
  GalleryBlock,
  MoodboardBlock,
  ListBlock,
  StoryboardBlock,
  StageBlock,
  ActionsBlock,
  CustomHtmlBlock,
];

export const BLOCKS_BY_ID: Record<BlockId, BlockDef> = Object.fromEntries(
  ALL_BLOCKS.map((b) => [b.id, b]),
) as Record<BlockId, BlockDef>;

export const BLOCKS_BY_TYPE: Record<string, BlockDef> = Object.fromEntries(
  ALL_BLOCKS.map((b) => [b.type, b]),
);

/**
 * The RenderTurn block discriminated union — assembled from every registered
 * block schema. This is the single zod object the AI SDK sees when it
 * serializes the render_turn tool definition.
 */
export const TurnBlockSchema = z.discriminatedUnion("type", [
  OptionsBlockSchema,
  FormBlockSchema,
  UploadBlockSchema,
  MediaBlockSchema,
  GalleryBlockSchema,
  MoodboardBlockSchema,
  ListBlockSchema,
  StoryboardBlockSchema,
  StageBlockSchema,
  ActionsBlockSchema,
  CustomHtmlBlockSchema,
]);

export type TurnBlock = z.infer<typeof TurnBlockSchema>;

/**
 * Serialize any block to the stage's legacy HTML dialect. The dispatch
 * table is BLOCKS_BY_TYPE so adding a new block is a single-file change.
 */
export function blockToHtml(block: TurnBlock): string {
  const def = BLOCKS_BY_TYPE[block.type];
  if (!def) return "";
  return (def.toHtml as (b: TurnBlock) => string)(block);
}

/**
 * One-line-per-block catalog for injection into agent prompts (the same
 * shape the app catalog uses). Useful as a system-prompt reference and as
 * the payload of the `get_block_reference` tool.
 */
export function renderBlockCatalog(): string {
  const lines = ALL_BLOCKS.map(
    (b) => `- ${b.id} (${b.type}): ${firstLine(b.usageMd)}`,
  );
  return `BLOCK CATALOG — the Gen-UI shapes render_turn can emit. IDs (BLK_*) are references; the JSON wire uses the parenthesized \`type\` string.\n${lines.join("\n")}`;
}

/** Full block.md for one or more blocks — payload of get_block_reference. */
export function renderBlockReference(ids: BlockId[]): string {
  return ids
    .map((id) => BLOCKS_BY_ID[id])
    .filter(Boolean)
    .map((b) => `## ${b.id} (\`${b.type}\`)\n\n${b.usageMd.trim()}`)
    .join("\n\n---\n\n");
}

function firstLine(md: string): string {
  const lines = md.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  return (lines[0] ?? "").trim();
}

export type { BlockDef, BlockId } from "./types";
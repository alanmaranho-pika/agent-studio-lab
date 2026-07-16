// Core system prompt — the always-on identity, memory rules, turn protocol,
// and global invariants. The prose bodies now live in editable Markdown
// under src/agent/instructions/ (identity.md, routing.md, guardrails.md,
// blocks-overview.md, inline-edit.md). This module composes them.

import { getInstruction, stripHeader } from "@/agent/instructions/_registry";

export function buildCorePrompt(): string {
  return [
    stripHeader(getInstruction("INS_IDENTITY")),
    "",
    "═════ ROUTING ═════",
    stripHeader(getInstruction("INS_ROUTING")),
    "",
    "═════ GUARDRAILS ═════",
    stripHeader(getInstruction("INS_GUARDRAILS")),
    "",
    "═════ BLOCK CATALOG ═════",
    stripHeader(getInstruction("INS_BLOCKS_INDEX")),
  ].join("\n");
}

// Trimmed identity for inline edits — those requests need none of the
// catalog/phase machinery, just memory + the edit contract. The contract
// differs by what is being edited (see buildInlineEditAddendum in chat.ts):
//   field — patch one scene field, reply with a one-sentence summary
//   piece — rework a text piece on a card; the reply IS the new copy
//   media — regenerate/queue the media, reply with a one-sentence summary
export function buildInlineEditCorePrompt(
  kind: "field" | "piece" | "media" = "field",
): string {
  if (kind === "piece") {
    return `You are the director-agent of a creative video studio, reworking one piece of on-card copy. Read the PROJECT MEMORY block; follow the INLINE EDIT MODE instructions exactly. Your entire reply must be the reworked copy itself — no preamble, no quotes, no markdown, no HTML.`;
  }
  if (kind === "media") {
    return `You are the director-agent of a creative video studio, regenerating one piece of media from an inline edit popup. Read the PROJECT MEMORY block; follow the INLINE EDIT MODE instructions exactly; reply with one short plain sentence. No markdown, no HTML.`;
  }
  return `You are the director-agent of a creative video studio, handling a single inline field edit. Read the PROJECT MEMORY block; apply exactly the requested change with commit_project_patch; reply with one short plain sentence summarizing the edit. No markdown, no HTML, no other tools.`;
}
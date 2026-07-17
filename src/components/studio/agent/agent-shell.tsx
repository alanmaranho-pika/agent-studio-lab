import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  History,
  LayoutGrid,
  Mic,
  Plus,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  Music2,
  ShoppingBag,
  Film,
  Shirt,
  Users,
  ListVideo,
  MoreHorizontal,
} from "lucide-react";
import { AgentSymbol } from "@/components/studio/agent/agent-symbol";
import { EtherealBackdrop } from "@/components/studio/agent/ethereal-backdrop";

import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import { cn } from "@/lib/utils";
import type { ProjectAsset, ProjectPatch, ProjectState } from "@/lib/project-state";
import {
  extractStageGeneration,
  StageGenerationView,
  type InlineAskResult,
  type StageGeneration,
} from "@/components/studio/agent/stage-generations";
import type { StudioMode } from "@/lib/skills";
import { StudioToolbar } from "@/components/studio/studio-toolbar";
import { PENDING_MIME, resolveThumb } from "@/lib/project-state";
import {
  GenerativeCard,
  AssistantMessage,
  extractCardTitle,
  extractCardProse,
  extractCardAck,
  extractProjectPatch,
  fileToAsset,
  describeAsset,
  type CardAnswer,
} from "@/components/studio/generative-card";
import type { StageIntent } from "@/components/studio/agent/intents";
import { renderTurnToHtml } from "@/lib/agent/render-turn-html";
import { RenderTurnSchema, type RenderTurn } from "@/lib/agent/ui-schema";
import {
  StageCanvasMount,
  isCanvasRenderableTurn,
  useCanvasRenderer,
} from "@/components/studio/agent/canvas";
import { useViewportBand } from "@/hooks/use-viewport-band";
import { readSkillMd, writeSkillMd } from "@/lib/skills/skill-md.functions";
import { AssetPickerDialog, type PickerResult } from "@/components/studio/asset-picker-dialog";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  AnimatePresence,
  FadeSwap,
  LayoutGroup,
  ACK_SHOW_DELAY_MS,
  MIN_ACK_LEAD_MS,
  motion,
  SPRING,
  useDissolveZone,
  useReducedMotion,
  useTurnZone,
  WordsRamp,
} from "@/components/studio/agent/motion-primitives";
import { sniffSkeletonHint, StageSkeleton } from "@/components/studio/agent/stage-skeleton";
import { StageDropzone } from "@/components/studio/agent/stage-dropzone";
import { StageRenderProgress } from "@/components/studio/agent/stage-render-progress";

/**
 * AgentShell — minimalist "one turn at a time" agent view.
 *
 * Owns its own `useChat` bound to `/api/chat`. Renders only the current
 * turn: the most recent user prompt as context, the trailing assistant
 * message (streamed markdown / prose + interactive Gen UI card + inline
 * generated media). No scrollback — the panel on the right holds history.
 *
 * Tool outputs (generated images, model app jobs, project patches) are
 * applied via `onPatch`, mirroring ChatPanel's behavior so the project
 * state stays in sync regardless of which shell is mounted.
 */
export type AgentShellProps = {
  projectId: string;
  projectTitle: string;
  projectThumbUrl: string | null;
  assets: ProjectAsset[];
  project: ProjectState;
  initialMessages: UIMessage[];
  studioMode: StudioMode;
  studioModel: string | null;
  onToolbarChange: (next: { mode: StudioMode; model: string | null }) => void;
  onPatch: (patch: ProjectPatch) => void;
  onExport: () => void;
  onOpenProjectSwitcher?: () => void;
  onOpenApps?: () => void;
  onOpenHistory?: () => void;
  onOpenArtifact?: (v: string) => void;
};

// ---------- message helpers ----------

// Fallback marker persisted in text parts so inline edit turns remain hidden
// after reload even though project_messages has no metadata column.
const INLINE_REWORK_MARKER = "[[inline-rework]] ";

// Mirrors the server union in src/routes/api/chat.ts — field edits come from
// the stage-view Ask sidebar; piece/media edits come from the on-card inline
// edit popup (their conversation stays in the popup, never on the stage).
type InlineEditPayload =
  | {
      kind: "field";
      requestId: string;
      fieldKey: string;
      sceneId: string;
      field: "title" | "prompt" | "voPrompt";
      fieldLabel: string;
      currentValue: string;
      instruction: string;
    }
  | {
      kind: "piece";
      requestId: string;
      pieceLabel: string;
      currentValue: string;
      cardTitle?: string;
      instruction: string;
    }
  | {
      kind: "media";
      requestId: string;
      mediaKind: "image" | "video" | "audio";
      mediaUrl: string;
      cardTitle?: string;
      instruction: string;
    };

export type InlineAskArgs =
  | {
      kind: "piece";
      pieceLabel: string;
      currentValue: string;
      cardTitle?: string;
      instruction: string;
    }
  | {
      kind: "media";
      mediaKind: "image" | "video" | "audio";
      mediaUrl: string;
      cardTitle?: string;
      instruction: string;
    };

type AgentMessageMetadata = {
  mode?: "inline-edit";
  requestId?: string;
  inlineEdit?: InlineEditPayload;
};

type ToolPart = {
  type: string;
  state?: string;
  toolCallId?: string;
  output?: unknown;
  input?: unknown;
};

function textOf(m: UIMessage): string {
  return m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

function metadataOf(m: UIMessage): AgentMessageMetadata {
  return ((m as UIMessage<AgentMessageMetadata>).metadata ?? {}) as AgentMessageMetadata;
}

function isInlineEditMessage(m: UIMessage): boolean {
  const meta = metadataOf(m);
  return (
    meta.mode === "inline-edit" ||
    textOf(m).startsWith(INLINE_REWORK_MARKER) ||
    isLegacyInlinePatchMessage(m)
  );
}

function isLegacyInlinePatchMessage(m: UIMessage): boolean {
  if (m.role !== "assistant") return false;
  const text = textOf(m);
  if (/data-card|data-options|data-gen-view/i.test(text)) return false;
  return toolPartsOf(m).some((part) => {
    if (part.type !== "tool-commit_project_patch" || part.state !== "output-available")
      return false;
    const patch = (part.output as { patch?: unknown } | undefined)?.patch as
      { scenes?: Array<Record<string, unknown>> } | undefined;
    if (!patch || !Array.isArray(patch.scenes) || patch.scenes.length !== 1) return false;
    const scenePatch = patch.scenes[0];
    const keys = Object.keys(scenePatch).filter((key) => key !== "id");
    return (
      keys.length > 0 &&
      keys.every((key) => key === "title" || key === "prompt" || key === "voPrompt")
    );
  });
}

/** Plain assistant text with runtime markers stripped — used both for the
 * plain-text stage fallback and for renderability checks. */
function plainAssistantText(m: UIMessage): string {
  return textOf(m)
    .replace(INLINE_REWORK_MARKER, "")
    .replace(/<script[^>]*data-project-patch[^>]*>[\s\S]*?<\/script>/gi, "")
    .trim();
}

function isStageRenderableAssistant(m: UIMessage): boolean {
  if (m.role !== "assistant") return false;
  if (extractRenderTurn(m)) return true;
  const text = plainAssistantText(m);
  if (/data-card[\s>]|data-options[\s>]|data-gen-view=/i.test(text)) return true;
  // A plain-text reply is still a turn — the stage must show it rather than
  // silently keeping the previous question on screen (stage = ground truth).
  if (text.length > 0) return true;
  // Tool-only turns render a synthesized summary line — every agent action
  // must reach the stage (and stay reachable in history nav).
  return summarizeToolOnlyTurn(m).length > 0;
}

// A render_turn extract with a streaming phase:
//   partial  → input still streaming; only ack/prose are trustworthy
//   complete → full input parsed (guard output not in yet)
//   final    → guard-repaired output (may differ: truncation, auto media)
// `salvaged` marks content recovered from a guard-REJECTED attempt (its
// interactive blocks stripped) — the stage must show something for every
// turn, so a rejected attempt beats a blank stage.
export type RenderTurnExtract = {
  turn: RenderTurn;
  phase: "partial" | "complete" | "final";
  salvaged?: boolean;
};

/** Prose-only coercion of a partially-streamed render_turn input. Blocks are
 * ALWAYS dropped — never render half-parsed blocks. The model writes `ack`
 * before `prose` in the JSON, so an ack-only partial is valid too — it lets
 * the acknowledgement lead on the stage while the question still streams. */
function coercePartialRenderTurn(input: unknown): RenderTurn | null {
  if (!input || typeof input !== "object") return null;
  const o = input as { ack?: unknown; prose?: unknown };
  const ack = typeof o.ack === "string" && o.ack.length > 0 ? o.ack : undefined;
  const prose = typeof o.prose === "string" ? o.prose : "";
  if (!ack && prose.length === 0) return null;
  return { ack, prose, blocks: [] };
}

/** Recover displayable content from a guard-REJECTED render_turn attempt:
 * keep ack/prose and pure-content blocks; strip anything interactive (the
 * guard may have rejected exactly that structure) and their CTAs. */
function salvageRejectedInput(input: unknown): RenderTurn | null {
  const parsed = RenderTurnSchema.safeParse(input);
  if (!parsed.success) return coercePartialRenderTurn(input);
  const t = parsed.data;
  const blocks = (t.blocks ?? [])
    .filter(
      (b) =>
        b.type === "media" ||
        b.type === "gallery" ||
        b.type === "moodboard" ||
        b.type === "list" ||
        b.type === "storyboard",
    )
    .map((b) => ({ ...b, actions: undefined }));
  return { ack: t.ack, prose: t.prose, blocks, next: t.next };
}

// Typed render_turn turns (the schema-first Gen-UI contract). Prefer the
// guard-repaired payload from the tool output; fall back to the streamed
// input so prose can appear while the call is still streaming. Parts whose
// output exists but isn't ok (guard-rejected) are kept only as a LAST-RESORT
// salvage — content-only, no interactivity — so a turn that never lands an
// ok:true still shows on the stage instead of leaving it stale.
function extractRenderTurn(m: UIMessage): RenderTurnExtract | null {
  if (m.role !== "assistant") return null;
  let extract: RenderTurnExtract | null = null;
  let salvaged: RenderTurnExtract | null = null;
  for (const p of toolPartsOf(m)) {
    if (p.type !== "tool-render_turn") continue;
    const out = p.output as { ok?: boolean; turn?: RenderTurn } | undefined;
    if (out) {
      if (out.ok && out.turn) {
        extract = { turn: out.turn, phase: "final" };
      } else {
        const rescue = salvageRejectedInput(p.input);
        if (rescue) salvaged = { turn: rescue, phase: "complete", salvaged: true };
      }
      continue;
    }
    if (p.state === "output-error") continue;
    if (p.state === "input-available") {
      const parsed = RenderTurnSchema.safeParse(p.input);
      if (parsed.success) {
        extract = { turn: parsed.data, phase: "complete" };
        continue;
      }
    }
    const partial = coercePartialRenderTurn(p.input);
    if (partial) extract = { turn: partial, phase: "partial" };
  }
  return extract ?? salvaged;
}

/** The stage-HTML for a message: typed turns serialize through
 * renderTurnToHtml; legacy turns pass their hand-written HTML through; a
 * tool-only turn (no render_turn, no text) gets a synthesized summary line
 * so it still shows on the stage. */
function renderableHtmlOf(m: UIMessage): string {
  const extract = extractRenderTurn(m);
  if (extract) {
    try {
      return renderTurnToHtml(extract.turn);
    } catch {
      // fall through to raw text
    }
  }
  const text = plainAssistantText(m);
  if (text) return text;
  return summarizeToolOnlyTurn(m);
}

function mainStageMessages(all: UIMessage[]): UIMessage[] {
  const main: UIMessage[] = [];
  let inInlineTurn = false;
  for (const m of all) {
    if (m.role === "user") {
      inInlineTurn = isInlineEditMessage(m);
      if (!inInlineTurn) main.push(m);
      continue;
    }
    if (isInlineEditMessage(m)) {
      inInlineTurn = true;
      continue;
    }
    if (!inInlineTurn) main.push(m);
  }
  return main;
}

function stripInlineAssistantText(text: string): string {
  return text
    .replace(INLINE_REWORK_MARKER, "")
    .replace(/<script[^>]*data-project-patch[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

async function readInlineEditStream(
  response: Response,
  onPatch: (patch: ProjectPatch) => void,
): Promise<{ text: string; mediaUrl?: string }> {
  if (!response.ok) {
    throw new Error((await response.text().catch(() => "")) || "Inline edit failed");
  }
  if (!response.body) return { text: "" };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";
  let mediaUrl: string | undefined;
  // AI SDK's UI-message stream includes `toolName` on `tool-input-start`
  // events but NOT on the later `tool-output-available` event — only the
  // shared `toolCallId` ties them together. Track the mapping so we can
  // recognize which tool a completed output belongs to.
  const toolNameByCallId = new Map<string, string>();

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const chunk = JSON.parse(payload) as {
        type?: string;
        delta?: string;
        toolName?: string;
        toolCallId?: string;
        output?: { patch?: unknown; url?: unknown };
      };
      if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
        assistantText += chunk.delta;
      }
      if (
        chunk.type === "tool-input-start" &&
        typeof chunk.toolCallId === "string" &&
        typeof chunk.toolName === "string"
      ) {
        toolNameByCallId.set(chunk.toolCallId, chunk.toolName);
      }
      const resolvedToolName =
        chunk.toolName ??
        (typeof chunk.toolCallId === "string" ? toolNameByCallId.get(chunk.toolCallId) : undefined);
      if (
        chunk.type === "tool-output-available" &&
        resolvedToolName === "commit_project_patch" &&
        chunk.output?.patch
      ) {
        onPatch(chunk.output.patch as ProjectPatch);
      }
      // Media inline edits: a fresh image URL from generate_image lets the
      // popup swap the edited element's src in place.
      if (
        chunk.type === "tool-output-available" &&
        resolvedToolName === "generate_image" &&
        typeof chunk.output?.url === "string"
      ) {
        mediaUrl = chunk.output.url;
      }
    } catch {
      // Ignore non-JSON stream keepalive lines.
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
  }
  buffer += decoder.decode();
  if (buffer) consumeLine(buffer);
  return { text: stripInlineAssistantText(assistantText), mediaUrl };
}

function toolPartsOf(m: UIMessage): ToolPart[] {
  return (m.parts as unknown as ToolPart[]).filter(
    (p) => typeof p.type === "string" && p.type.startsWith("tool-"),
  );
}

function assistantToolAssets(
  m: UIMessage,
  assets: ProjectAsset[],
): Array<{ url: string; mime: string; name?: string; label?: string; id?: string }> {
  const out: Array<{ url: string; mime: string; name?: string; label?: string; id?: string }> = [];
  const freshUrlById = new Map<string, string>();
  for (const a of assets) {
    if (a.id && a.url) freshUrlById.set(a.id, a.url);
  }
  const resolveUrl = (id: string | undefined, fallback: string): string =>
    (id && freshUrlById.get(id)) || fallback;
  for (const p of toolPartsOf(m)) {
    if (p.state !== "output-available") continue;
    const o = p.output as
      | {
          id?: string;
          url?: string;
          mime?: string;
          name?: string;
          label?: string;
          image?: { id?: string; url?: string; mime?: string; name?: string };
          assets?: Array<{
            id?: string;
            url?: string;
            mime?: string;
            name?: string;
            label?: string;
          }>;
          ok?: boolean;
          result?: unknown;
        }
      | undefined;
    if (!o) continue;
    if ((p.type === "tool-generate_image" || p.type === "tool-run_model_app") && o.url && o.mime) {
      out.push({
        url: resolveUrl(o.id, o.url),
        mime: o.mime,
        name: o.name,
        label: o.label,
        id: o.id,
      });
    } else if (p.type === "tool-generate_scene_anchor" && o.url) {
      out.push({
        url: resolveUrl(o.id, o.url),
        mime: o.mime ?? "image/png",
        name: o.name,
        label: o.label ?? "Anchor",
        id: o.id,
      });
    } else if (p.type === "tool-search_stock_media" && Array.isArray(o.assets)) {
      for (const a of o.assets) {
        if (a.url && a.mime)
          out.push({
            url: resolveUrl(a.id, a.url),
            mime: a.mime,
            name: a.name,
            label: a.label,
            id: a.id,
          });
      }
    } else if (p.type === "tool-tool_invoke" && o.ok && o.result) {
      const r = o.result as {
        image?: { id?: string; url?: string; mime?: string; name?: string };
        assets?: Array<{ id?: string; url?: string; mime?: string; name?: string; label?: string }>;
      };
      if (r.image?.url && r.image?.mime) {
        out.push({
          url: resolveUrl(r.image.id, r.image.url),
          mime: r.image.mime,
          name: r.image.name,
          id: r.image.id,
        });
      }
      if (Array.isArray(r.assets)) {
        for (const a of r.assets) {
          if (a.url && a.mime)
            out.push({
              url: resolveUrl(a.id, a.url),
              mime: a.mime,
              name: a.name,
              label: a.label,
              id: a.id,
            });
        }
      }
    }
  }
  return out;
}

function withToolAssets(m: UIMessage, baseHtml: string, assets: ProjectAsset[]): string {
  let html = baseHtml;
  for (const p of toolPartsOf(m)) {
    if (p.state !== "output-available") continue;
    if (p.type !== "tool-select_app") continue;
    const o = p.output as { label?: string; error?: string } | undefined;
    if (!o || o.error || !o.label) continue;
    const chip = `<div data-routing-chip data-app-label="${o.label.replace(/"/g, "&quot;")}"></div>`;
    html = `${chip}${html}`;
    break;
  }
  const toolAssets = assistantToolAssets(m, assets);
  if (!toolAssets.length) return html;
  const existing = extractProjectPatch(html) as {
    assetsAppend?: Array<{ url?: string; mime?: string }>;
  } | null;
  const existingUrls = new Set((existing?.assetsAppend ?? []).map((a) => a.url));
  const merged = [
    ...(existing?.assetsAppend ?? []),
    ...toolAssets.filter((a) => !existingUrls.has(a.url)),
  ];
  if (existing) {
    const next = { ...existing, assetsAppend: merged };
    return html.replace(
      /<script\s+type=["']application\/json["']\s+data-project-patch>[\s\S]*?<\/script>/,
      `<script type="application/json" data-project-patch>${JSON.stringify(next)}</script>`,
    );
  }
  return `${html}<script type="application/json" data-project-patch>${JSON.stringify({ assetsAppend: merged })}</script>`;
}

const TOOL_STATUS_LABELS: Record<string, string> = {
  render_turn: "Composing the stage…",
  get_app_playbook: "Reading the app playbook…",
  note_decision: "Noting that down…",
  run_skill: "Running the skill…",
  save_skill: "Saving the skill…",
  generate_image: "Generating an image…",
  run_model_app: "Generating your result…",
  search_stock_media: "Searching references…",
  tool_search: "Looking up app functions…",
  tool_invoke: "Running app function…",
  planner: "Planning…",
  emit_ui: "Preparing the next step…",
  propose_skill: "Picking a skill…",
  select_app: "Choosing the best app…",
  commit_project_patch: "Updating the project…",
  generate_scene_anchor: "Generating an anchor frame…",
  approve_scene_anchor: "Approving anchor…",
};

function friendlyToolStatus(name: string): string {
  return TOOL_STATUS_LABELS[name] ?? "Working on it…";
}

// Skeleton shape predicted from the RUNNING tool, before the render_turn
// input has streamed far enough to reveal the actual block type — an image
// render almost certainly ends in a media block, app selection in options…
const TOOL_SKELETON_HINTS: Record<string, string> = {
  generate_image: "media",
  generate_scene_anchor: "media",
  run_model_app: "media",
  search_stock_media: "gallery",
  select_app: "options",
};

// Turn a useChat error into a user-facing message. The common one in dev is
// "network error" — the browser's message when a streaming fetch body is cut
// off mid-response (usually a hot-reload or a dropped connection, NOT a server
// failure). Surface that honestly instead of the raw string, and mark it
// retryable so the banner can offer a one-click re-run.
function describeChatError(error: Error): { message: string; interrupted: boolean } {
  const raw = (error.message ?? "").toLowerCase();
  const interrupted =
    raw === "network error" ||
    raw.includes("network error") ||
    raw.includes("fetch failed") ||
    raw.includes("failed to fetch") ||
    raw.includes("load failed") ||
    error.name === "AbortError";
  if (interrupted) {
    return {
      message:
        "The connection dropped mid-response — often a dev hot-reload. Nothing was saved for this turn.",
      interrupted: true,
    };
  }
  return {
    message: error.message || "Something went wrong with the AI gateway.",
    interrupted: false,
  };
}

// Past-tense one-liners for turns that ended with tool work but neither a
// usable render_turn nor text — the stage synthesizes this as the turn's
// prose so every agent action stays visible (stage = the only interface).
const TOOL_DONE_SUMMARIES: Record<string, string> = {
  commit_project_patch: "Updated the project plan.",
  note_decision: "Noted that decision.",
  generate_image: "Generated an image.",
  generate_scene_anchor: "Generated an anchor frame.",
  approve_scene_anchor: "Approved the anchor.",
  run_model_app: "Queued a render.",
  search_stock_media: "Searched for references.",
  tool_invoke: "Ran an app function.",
  select_app: "Picked the app for this project.",
  get_app_playbook: "Checked the app playbook.",
  save_cut: "Saved the cut.",
  switch_cut: "Switched cuts.",
};

/** Synthesized prose for a tool-only turn (no render_turn, no text). */
function summarizeToolOnlyTurn(m: UIMessage): string {
  const names = toolPartsOf(m)
    .map((p) => p.type.replace(/^tool-/, ""))
    .filter((n) => n !== "render_turn");
  for (const n of names) {
    const line = TOOL_DONE_SUMMARIES[n];
    if (line) return line;
  }
  return names.length ? "Worked on the project." : "";
}

// ---------- inline artifact cards (subset of ChatPanel's ArtifactCards) ----------

type ArtifactKind = "shots" | "cast" | "music" | "renders";

const ARTIFACT_META: Record<ArtifactKind, { label: string; icon: typeof Film; hint: string }> = {
  shots: { label: "Script & Logline", icon: Film, hint: "Open script" },
  cast: { label: "Cast & References", icon: Users, hint: "Open cast" },
  music: { label: "Music & Audio", icon: Music2, hint: "Open audio" },
  renders: { label: "Final Render", icon: ListVideo, hint: "Open exports" },
};

function detectArtifacts(html: string): ArtifactKind[] {
  const kinds = new Set<ArtifactKind>();
  const patch = extractProjectPatch(html) as {
    meta?: { logline?: string };
    scenesAppend?: unknown[];
    castAppend?: unknown[];
    music?: unknown;
    assetsAppend?: Array<{ kind?: string; mime?: string; label?: string }>;
  } | null;
  if (!patch) return [];
  if (patch.meta?.logline || (patch.scenesAppend && patch.scenesAppend.length > 0))
    kinds.add("shots");
  if (patch.castAppend && patch.castAppend.length > 0) kinds.add("cast");
  if (patch.music) kinds.add("music");
  if (Array.isArray(patch.assetsAppend)) {
    for (const a of patch.assetsAppend) {
      const mime = a.mime ?? "";
      if (
        a.kind === "music" ||
        a.kind === "voiceover" ||
        a.kind === "audio" ||
        mime.startsWith("audio/")
      )
        kinds.add("music");
      if (a.kind === "final" || (a.label && /final/i.test(a.label))) kinds.add("renders");
    }
  }
  return Array.from(kinds);
}

function ArtifactCards({ html, onOpen }: { html: string; onOpen?: (v: string) => void }) {
  const kinds = useMemo(() => detectArtifacts(html), [html]);
  if (kinds.length === 0 || !onOpen) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {kinds.map((k) => {
        const { label, icon: Icon, hint } = ARTIFACT_META[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onOpen(k)}
            className="group inline-flex items-center gap-2.5 rounded-2xl border border-border bg-card/60 px-4 py-2.5 text-left text-sm transition hover:border-foreground/30 hover:bg-card"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-muted text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-medium">{label}</span>
              <span className="text-[11px] text-muted-foreground">{hint} →</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- main ----------

export function AgentShell(props: AgentShellProps) {
  const {
    projectId,
    projectTitle,
    projectThumbUrl,
    assets,
    project,
    initialMessages,
    studioMode,
    studioModel,
    onToolbarChange,
    onPatch,
    onExport,
    onOpenProjectSwitcher,
    onOpenApps,
    onOpenHistory,
    onOpenArtifact,
  } = props;

  const { messages, sendMessage, status, error, regenerate, clearError } = useChat({
    id: projectId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: () => buildAuthHeaders(),
      body: () => ({ projectId }),
    }),
  });

  const busy = status === "submitted" || status === "streaming";
  const visibleMessages = useMemo(() => mainStageMessages(messages), [messages]);
  const isEmpty = visibleMessages.length === 0;

  // Derive the currently-selected skill from the latest successful
  // `tool-select_app` output. Powers the debug pill under the Export button
  // and the live skill.md editor.
  const selectedApp = useMemo<{ appId: string; label: string } | null>(() => {
    let hit: { appId: string; label: string } | null = null;
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const p of toolPartsOf(m)) {
        if (p.type !== "tool-select_app") continue;
        if (p.state !== "output-available") continue;
        const o = p.output as { appId?: string; label?: string; error?: string } | undefined;
        if (!o || o.error || !o.label) continue;
        hit = { appId: o.appId ?? o.label, label: o.label };
      }
    }
    return hit;
  }, [messages]);

  // Apply project patches + tool outputs exactly once each.
  const appliedPatchIds = useRef<Set<string>>(new Set());
  const appliedToolCallIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      if (!appliedPatchIds.current.has(m.id)) {
        const patch = extractProjectPatch(textOf(m));
        if (patch) {
          appliedPatchIds.current.add(m.id);
          onPatch(patch as ProjectPatch);
        }
      }
      for (const p of toolPartsOf(m)) {
        if (p.state !== "output-available") continue;
        const callId = p.toolCallId ?? "";
        if (!callId || appliedToolCallIds.current.has(callId)) continue;
        appliedToolCallIds.current.add(callId);
        const out = p.output as
          | {
              error?: string;
              id?: string;
              url?: string;
              assets?: ProjectAsset[];
              patch?: unknown;
              mode?: string;
              jobId?: string;
              result?: unknown;
            }
          | undefined;
        if (!out || out.error) continue;
        if (p.type === "tool-generate_image" && out.id && out.url) {
          onPatch({ assetsAppend: [out as ProjectAsset] });
          if (out.patch) onPatch(out.patch as ProjectPatch);
        } else if (p.type === "tool-run_model_app") {
          if (out.id && out.url) {
            onPatch({ assetsAppend: [out as ProjectAsset] });
            if (out.patch) onPatch(out.patch as ProjectPatch);
          }
        } else if (p.type === "tool-search_stock_media" && Array.isArray(out.assets)) {
          onPatch({ assetsAppend: out.assets });
        } else if (p.type === "tool-commit_project_patch" && out.patch) {
          onPatch(out.patch as ProjectPatch);
        } else if (p.type === "tool-generate_scene_anchor" && out.id && out.url) {
          onPatch({ assetsAppend: [out as ProjectAsset] });
          if (out.patch) onPatch(out.patch as ProjectPatch);
        } else if (p.type === "tool-approve_scene_anchor" && out.patch) {
          onPatch(out.patch as ProjectPatch);
        } else if (p.type === "tool-tool_invoke") {
          const wrapped = (out as { result?: unknown }).result as
            | { id?: string; url?: string; image?: { id?: string; url?: string; mime?: string } }
            | undefined;
          if (wrapped?.id && wrapped?.url) {
            onPatch({ assetsAppend: [wrapped as ProjectAsset] });
          } else if (wrapped?.image?.id && wrapped?.image?.url) {
            onPatch({ assetsAppend: [wrapped.image as ProjectAsset] });
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Pending tool names for the shimmer (skip inline-rework turns — those
  // surface progress in the sidebar transcript, not the center stage).
  const pendingTools: string[] = [];
  const lastMsg = visibleMessages[visibleMessages.length - 1];
  if (lastMsg && lastMsg.role === "assistant" && busy) {
    for (const p of toolPartsOf(lastMsg)) {
      if (p.state !== "output-available" && p.state !== "output-error") {
        pendingTools.push(p.type.replace(/^tool-/, ""));
      }
    }
  }

  // Current-turn derivation (skips inline-rework messages).
  //  - activeAssistant: trailing assistant (no later assistant) — the message
  //    the shell renders as the "stage" content.
  //  - lastUserBubble: the most recent user message text, shown as small
  //    context above the assistant so the single-turn view keeps intent.
  let latestAssistant: UIMessage | null = null;
  let latestRenderableAssistant: UIMessage | null = null;
  let lastUserText = "";
  for (let i = visibleMessages.length - 1; i >= 0; i--) {
    const m = visibleMessages[i];
    if (!latestAssistant && m.role === "assistant") latestAssistant = m;
    if (!latestRenderableAssistant && isStageRenderableAssistant(m)) latestRenderableAssistant = m;
    if (!lastUserText && m.role === "user") lastUserText = textOf(m);
    if (latestAssistant && latestRenderableAssistant && lastUserText) break;
  }

  // Turn history — every stage-renderable assistant message is a revisitable
  // turn, paired with the user text that prompted it. `turnCursor === null`
  // means "live" (the latest turn, possibly still streaming); a number means
  // the user navigated back through the session's stage states.
  const stageTurns = useMemo(() => {
    const turns: Array<{ assistant: UIMessage; userText: string }> = [];
    let pendingUser = "";
    for (const m of visibleMessages) {
      if (m.role === "user") {
        pendingUser = textOf(m);
        continue;
      }
      if (isStageRenderableAssistant(m)) turns.push({ assistant: m, userText: pendingUser });
    }
    return turns;
  }, [visibleMessages]);
  const [turnCursor, setTurnCursor] = useState<number | null>(null);
  // +1 = moving toward newer turns (content rises in), -1 = toward older
  // (content settles down in) — drives the direction-aware stage transitions.
  const [navDir, setNavDir] = useState(1);
  // Bumped on each history navigation so the backdrop can parallax-nudge.
  const [navTick, setNavTick] = useState(0);
  const liveIndex = stageTurns.length - 1;
  const cursor =
    busy || turnCursor === null || turnCursor >= liveIndex ? null : Math.max(0, turnCursor);
  const browsing = cursor !== null;
  const browsingTurn = browsing ? stageTurns[cursor] : null;

  const navigateHistory = useCallback(
    (dir: "back" | "forward" | "live") => {
      if (busy || stageTurns.length === 0) return;
      setNavDir(dir === "back" ? -1 : 1);
      setNavTick((t) => t + 1);
      setTurnCursor((prev) => {
        const cur = prev ?? stageTurns.length - 1;
        if (dir === "back") return Math.max(0, cur - 1);
        if (dir === "forward") return cur + 1 >= stageTurns.length - 1 ? null : cur + 1;
        return null;
      });
    },
    [busy, stageTurns.length],
  );
  // New activity always snaps the stage back to live.
  useEffect(() => {
    if (busy) {
      setTurnCursor(null);
      setNavDir(1);
    }
  }, [busy]);

  const activeAssistant = browsingTurn
    ? browsingTurn.assistant
    : (latestRenderableAssistant ?? latestAssistant);
  if (browsingTurn) lastUserText = browsingTurn.userText;

  // Progressive streaming: while busy, the turn being streamed only counts as
  // live stage content once ITS OWN render_turn input has usable prose. Until
  // then (submit gap, tool work) the shimmer status shows and the previous
  // turn stays hidden — never show a stale question as if it were current.
  const tailMessage = visibleMessages[visibleMessages.length - 1];
  const streamingExtract =
    busy && tailMessage?.role === "assistant" ? extractRenderTurn(tailMessage) : null;
  const liveTurnStreaming = !!streamingExtract;

  const activeExtract = useMemo(
    () => (activeAssistant ? extractRenderTurn(activeAssistant) : null),
    [activeAssistant],
  );
  // Blocks render only once the streamed input parsed completely (or the
  // guard-repaired output landed) — never from half-streamed JSON.
  const blocksReady = !!activeExtract && activeExtract.phase !== "partial";

  // Canvas (Pixi) renderer — behind a runtime flag (?renderer=canvas or
  // localStorage "pika:renderer"). Only fully-supported, non-salvaged turns
  // go to canvas; everything else falls back to the DOM path per turn.
  const canvasEnabled = useCanvasRenderer();
  const canvasTurn =
    canvasEnabled &&
    blocksReady &&
    activeExtract &&
    !activeExtract.salvaged &&
    isCanvasRenderableTurn(activeExtract.turn)
      ? activeExtract.turn
      : null;
  // Full-stage takeover: the canvas owns the entire stage zone (echo, prose,
  // status, blocks) for settled fully-supported turns. Busy/streaming, error,
  // and fallback turns render the existing DOM stage.
  const canvasStageActive = !!canvasTurn && !busy && !error;

  const activeHtml = useMemo(
    () =>
      activeAssistant
        ? withToolAssets(activeAssistant, renderableHtmlOf(activeAssistant), assets)
        : "",
    [activeAssistant, assets],
  );
  const extractedStageGen = activeHtml ? extractStageGeneration(activeHtml) : null;
  // Promote a turn to a generative card whenever it contains card markup,
  // an options grid, a bare gen-actions row, or any inline media. This
  // prevents the shell from falling through to the screenplay fallback
  // when the model returns media/CTAs without an explicit <div data-card>.
  const isGenerativeCard =
    !!activeHtml &&
    !extractedStageGen &&
    (/data-card[\s>]/.test(activeHtml) ||
      /data-options[\s>]/.test(activeHtml) ||
      /data-gen-actions[\s>]/.test(activeHtml) ||
      /data-upload[\s>]/.test(activeHtml) ||
      /class="gen-upload/.test(activeHtml) ||
      /<form[\s>]/i.test(activeHtml) ||
      /<img\b/i.test(activeHtml) ||
      /<video\b/i.test(activeHtml) ||
      /<audio\b/i.test(activeHtml)) &&
    !/<div\s+data-card(?:\s[^>]*)?>\s*<\/div>/.test(activeHtml);
  // Only fall back to the screenplay view for the initial render of a
  // resumed project (no assistant reply yet). Never override an actual
  // assistant turn — the screenplay must be explicitly requested via
  // <div data-gen-view="script-beats">.
  const activeStageGen =
    extractedStageGen ??
    (!activeAssistant && project.scenes.length > 0
      ? ({
          kind: "script-beats",
          focusSceneId: project.scenes[0]?.id,
          actions: [],
        } satisfies StageGeneration)
      : null);
  const activeAssistantIsRenderable =
    !!activeAssistant && isStageRenderableAssistant(activeAssistant);

  // Ack/prose come straight from the typed payload when we have one — the
  // stage and the transcript must read from the same source of truth. The
  // HTML-regex extraction only remains for legacy (pre-render_turn) messages.
  const activeAck = activeExtract
    ? (activeExtract.turn.ack ?? "")
    : activeHtml && (isGenerativeCard || activeStageGen)
      ? extractCardAck(activeHtml)
      : "";
  const activeProse = activeExtract
    ? activeExtract.turn.prose
    : !activeAssistantIsRenderable
      ? ""
      : activeHtml && (isGenerativeCard || activeStageGen)
        ? extractCardProse(activeHtml) || extractCardTitle(activeHtml)
        : activeHtml;

  const activeAssistantId = activeAssistant?.id ?? null;

  // The hint "chamber": when the user answers, the answered turn already
  // declared what the NEXT turn will show (`next` on the turn, or on the
  // clicked action). Stash it here so the composing skeleton is
  // representative from the very first frame — long before render_turn
  // streams. Cleared when the turn finishes.
  const pendingNextHintRef = useRef<string | null>(null);
  const activeExtractRef = useRef<RenderTurnExtract | null>(null);
  activeExtractRef.current = activeExtract;
  useEffect(() => {
    if (!busy) pendingNextHintRef.current = null;
  }, [busy]);

  // The ack "chamber": the clicked option/action may carry a pre-written
  // acknowledgement (`ack`), shown INSTANTLY as the agent's reaction while
  // the next turn composes. State (not a ref) — it renders on the stage.
  const [chamberedAck, setChamberedAck] = useState<string | null>(null);

  // Card answer handler — patch attached assets, send summary + image refs.
  const handleCardAnswerImpl = useCallback(
    async (answer: CardAnswer) => {
      if (busy) return;
      // Chamber the declared next-turn shape before the busy flip.
      pendingNextHintRef.current = answer.next ?? activeExtractRef.current?.turn.next ?? null;
      setChamberedAck(answer.ack?.trim() || null);
      // Answering (even from a revisited turn) always branches forward: the
      // reply becomes the newest message, so snap the stage back to live.
      setTurnCursor(null);
      setNavDir(1);
      if (answer.assets.length) {
        onPatch({ assetsAppend: answer.assets });
      }
      const imageUrls = answer.assets
        .filter((a) => a.mime.startsWith("image/") && /^https?:/.test(a.url))
        .map((a) => a.url);
      const trimmed = answer.summary.trim();
      if (!trimmed) return;
      if (imageUrls.length) {
        await sendMessage({
          parts: [
            { type: "text", text: trimmed },
            ...imageUrls.map((url) => ({ type: "file" as const, mediaType: "image/*", url })),
          ],
        });
      } else {
        await sendMessage({ text: trimmed });
      }
    },
    [busy, onPatch, sendMessage],
  );
  const handleCardAnswerRef = useRef(handleCardAnswerImpl);
  handleCardAnswerRef.current = handleCardAnswerImpl;
  const handleCardAnswer = useCallback((a: CardAnswer) => handleCardAnswerRef.current(a), []);

  // Inline agent-assist: rework a single scene field via natural language ----
  const [busyField, setBusyField] = useState<{ sceneId: string; field: string } | null>(null);
  const inlineReworkBusy = !!busyField;
  const centerBusy = busy && !inlineReworkBusy;

  // Sequenced ack → question delivery. The acknowledgement leads as its own
  // transient message (chambered per-option ack at click time, replaced by
  // the streamed truth if it differs), then exits with the standard message
  // exit and the question follows. Once shown, the ack holds at least
  // MIN_ACK_LEAD_MS so a fast turn never sub-perceptually flashes it.
  const streamedAck = streamingExtract?.turn.ack?.trim() ?? "";
  const displayAck = streamedAck || chamberedAck || "";
  const [, setAckTick] = useState(0);
  // Ack lifecycle timestamps (refs — they must not themselves trigger renders):
  //   availableAt → +ACK_SHOW_DELAY_MS = showAt (a beat before the ack appears)
  //   first render past showAt → +MIN_ACK_LEAD_MS = holdUntil (min time on screen)
  const ackShowAtRef = useRef(0);
  const ackHoldUntilRef = useRef(0);
  const ackShownRef = useRef(false);
  const ackAvailableRef = useRef(false);
  if (displayAck && !ackAvailableRef.current) {
    ackAvailableRef.current = true;
    ackShownRef.current = false;
    ackShowAtRef.current = Date.now() + ACK_SHOW_DELAY_MS;
  } else if (!displayAck && ackAvailableRef.current) {
    ackAvailableRef.current = false;
    ackShownRef.current = false;
  }
  const nowMs = Date.now();
  const ackDelayPassed = !!displayAck && nowMs >= ackShowAtRef.current;
  if (ackDelayPassed && !ackShownRef.current) {
    ackShownRef.current = true;
    ackHoldUntilRef.current = nowMs + MIN_ACK_LEAD_MS;
  }
  const ackHeld = ackShownRef.current && nowMs < ackHoldUntilRef.current;
  // Re-render at the next lifecycle boundary (reveal, then release) so the
  // swap actually fires without a user interaction.
  useEffect(() => {
    if (!displayAck) return;
    const t = Date.now();
    let wait = 0;
    if (t < ackShowAtRef.current) wait = ackShowAtRef.current - t;
    else if (ackShownRef.current && t < ackHoldUntilRef.current) wait = ackHoldUntilRef.current - t;
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setAckTick((v) => v + 1), wait + 16);
    return () => window.clearTimeout(timer);
  }, [displayAck, ackDelayPassed, ackHeld]);

  const proseAvailable = !!activeProse && (!centerBusy || liveTurnStreaming);
  // The ack owns the message zone from the moment it's available (through its
  // 500ms lead-in beat and its min-hold) until it's both revealed and past its
  // hold — only then does the question take over.
  const ackPendingFloor = !!displayAck && (!ackDelayPassed || ackHeld);
  const showAckMessage = !!displayAck && ackDelayPassed && (!proseAvailable || ackHeld);
  const showTurnProse = proseAvailable && !ackPendingFloor;
  // Retire the chambered ack once the question takes the stage — it must not
  // resurrect on later renders (history nav, error banners).
  useEffect(() => {
    if (showTurnProse && chamberedAck) setChamberedAck(null);
  }, [showTurnProse, chamberedAck]);

  // What appears in the gen-UI slot: the real card / stage view once its
  // blocks are ready, else (while composing) a skeleton of the incoming
  // generation. Hint priority: exact sniff of the streaming render_turn's
  // first block type > the CHAMBERED hint the answered turn declared
  // (`next`) > running-tool prediction > generic default.
  const composingHint = useMemo(() => {
    if (!centerBusy) return null;
    // 1. Ground truth once render_turn streams its first block `type`.
    if (tailMessage?.role === "assistant") {
      let hint: string | null = null;
      for (const p of toolPartsOf(tailMessage)) {
        if (p.type !== "tool-render_turn") continue;
        hint = sniffSkeletonHint(p.input) ?? hint;
      }
      if (hint) return hint;
    }
    // 2. The chambered declaration from the turn the user just answered.
    if (pendingNextHintRef.current) return pendingNextHintRef.current;
    // 3. Predict the shape from the running tool — an image render is
    // almost certainly heading for a media block, etc.
    for (const name of pendingTools) {
      const predicted = TOOL_SKELETON_HINTS[name];
      if (predicted) return predicted;
    }
    return null;
  }, [centerBusy, tailMessage, pendingTools]);
  const showCardZone =
    !!activeHtml && isGenerativeCard && (!centerBusy || (liveTurnStreaming && blocksReady));
  const showStageZone = !!activeStageGen && (!centerBusy || (liveTurnStreaming && blocksReady));
  // Only show a skeleton when we have POSITIVE evidence a generation is
  // coming — a sniffed/chambered/tool-predicted shape. A null hint (no
  // declaration, no UI-bearing tool) means the turn is likely prose-only, so
  // we show nothing rather than a generic placeholder that dissolves into a
  // bare message. "none" (explicit prose-only) is likewise suppressed. The
  // sniff (priority 1) still resurrects the skeleton if blocks DO stream.
  const showSkeleton =
    centerBusy &&
    !showCardZone &&
    !showStageZone &&
    !(liveTurnStreaming && blocksReady) &&
    !!composingHint &&
    composingHint !== "none";

  // A generation is in flight when the project holds a pending placeholder
  // asset (run_model_app / render queued but not yet swapped for the clip).
  // This outlives the agent's turn, so it also keeps the status honest
  // ("Generating…") after the agent has finished composing and gone idle.
  const generating = useMemo(
    () => assets.some((a) => a.kind === "pending" || a.mime === PENDING_MIME),
    [assets],
  );

  // A queued background render, with nothing else claiming the gen slot,
  // shows the render-progress frame (the visible "rendering" state) so the
  // stage isn't blank while a clip cooks. Content/skeleton always win.
  const showRenderProgress = generating && !showCardZone && !showStageZone && !showSkeleton;
  const renderProgressLabel = useMemo(() => {
    const p = assets.find((a) => a.kind === "pending" || a.mime === PENDING_MIME);
    return p?.label || p?.name || "Generating…";
  }, [assets]);

  // What occupied the gen-UI slot on the PREVIOUS render — drives the
  // transition style: content replacing a skeleton dissolves in place;
  // content arriving into an empty slot rises in.
  const genSlot = showSkeleton
    ? "skeleton"
    : showCardZone
      ? "card"
      : showStageZone
        ? "stage"
        : showRenderProgress
          ? "render"
          : "empty";
  const prevGenSlotRef = useRef<string>("empty");
  useEffect(() => {
    prevGenSlotRef.current = genSlot;
  }, [genSlot]);

  // One inline-ask entry point for all three edit kinds. Requests go through
  // the inline-edit API (mode:"inline-edit"): they never enter useChat's
  // messages, never render on the stage, and never trigger the composing
  // choreography — busyField marks the edit without flipping centerBusy.
  const askInline = useCallback(
    async (
      args:
        | InlineAskArgs
        | {
            kind: "field";
            sceneId: string;
            field: "title" | "prompt" | "voPrompt";
            currentValue: string;
            instruction: string;
          },
    ): Promise<InlineAskResult> => {
      if (busy || busyField)
        return { ok: false, error: "Wait for the current response to finish." };
      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `inline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let inlineEdit: InlineEditPayload;
      let busyKey: { sceneId: string; field: string };
      let text: string;
      if (args.kind === "piece") {
        inlineEdit = {
          kind: "piece",
          requestId,
          pieceLabel: args.pieceLabel,
          currentValue: args.currentValue,
          cardTitle: args.cardTitle,
          instruction: args.instruction,
        };
        busyKey = { sceneId: "__card__", field: args.pieceLabel };
        text = `${INLINE_REWORK_MARKER}${requestId}\nRework the "${args.pieceLabel}" copy on the current card. Current text: "${args.currentValue}". Instruction: ${args.instruction}. Reply with only the reworked copy.`;
      } else if (args.kind === "media") {
        inlineEdit = {
          kind: "media",
          requestId,
          mediaKind: args.mediaKind,
          mediaUrl: args.mediaUrl,
          cardTitle: args.cardTitle,
          instruction: args.instruction,
        };
        busyKey = { sceneId: "__card__", field: `media:${args.mediaKind}` };
        text = `${INLINE_REWORK_MARKER}${requestId}\nEdit the ${args.mediaKind} on the current card (current URL: ${args.mediaUrl}). Instruction: ${args.instruction}.`;
      } else {
        const fieldLabel = args.field === "voPrompt" ? "voPrompt (voiceover)" : args.field;
        inlineEdit = {
          kind: "field",
          requestId,
          fieldKey: `${args.sceneId}:${args.field}`,
          sceneId: args.sceneId,
          field: args.field,
          fieldLabel,
          currentValue: args.currentValue,
          instruction: args.instruction,
        };
        busyKey = { sceneId: args.sceneId, field: args.field };
        text = `${INLINE_REWORK_MARKER}${requestId}\nRework scene ${args.sceneId}, field "${fieldLabel}". Current value: "${args.currentValue}". Instruction: ${args.instruction}. Update only that field on that scene; keep everything else unchanged.`;
      }
      setBusyField(busyKey);
      const inlineUser = {
        id: `inline-user-${requestId}`,
        role: "user" as const,
        metadata: { mode: "inline-edit", requestId, inlineEdit } as AgentMessageMetadata,
        parts: [{ type: "text" as const, text }],
      } as UIMessage<AgentMessageMetadata>;
      try {
        const authHeaders = await buildAuthHeaders({ "content-type": "application/json" });
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            projectId,
            mode: "inline-edit",
            inlineEdit,
            messages: [...mainStageMessages(messages), inlineUser],
          }),
        });
        const { text: assistantText, mediaUrl } = await readInlineEditStream(response, onPatch);
        return { ok: true, assistantText, mediaUrl };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Inline edit failed" };
      } finally {
        setBusyField(null);
      }
    },
    [busy, busyField, messages, onPatch, projectId],
  );

  // Field-signature wrapper kept for the stage views' Ask sidebar.
  const askAgentInline = useCallback(
    (args: {
      sceneId: string;
      field: "title" | "prompt" | "voPrompt";
      currentValue: string;
      instruction: string;
    }) => askInline({ kind: "field", ...args }),
    [askInline],
  );

  // Intent dispatch ------------------------------------------------------------
  // The single entry point for every user interaction on the stage. All
  // surfaces (cards, stage toolbars, composer, keyboard, future voice input)
  // express themselves as StageIntents and flow through here.
  const dispatchIntent = useCallback(
    async (intent: StageIntent): Promise<InlineAskResult | void> => {
      switch (intent.kind) {
        case "answer":
          return handleCardAnswerRef.current({
            summary: intent.value,
            assets: intent.assets ?? [],
          });
        case "compose": {
          const text = intent.text.trim();
          if (!text || busy) return;
          // A typed/voiced reply still answers the current turn — chamber
          // its declared next-turn shape (the sniff corrects if the message
          // was actually a pivot). No pre-written ack for free-text answers;
          // the streamed ack-only partial still lets the ack lead.
          pendingNextHintRef.current = activeExtractRef.current?.turn.next ?? null;
          setChamberedAck(null);
          setTurnCursor(null);
          setNavDir(1);
          void sendMessage({ text });
          return;
        }
        case "regenerate": {
          if (busy) return;
          const target = intent.targetTitle
            ? `the "${intent.targetTitle}" media`
            : "the media you just sent";
          setTurnCursor(null);
          setNavDir(1);
          void sendMessage({
            text: `Regenerate ${target}: same intent, new take. Re-emit the same card with the new media; keep everything else identical.`,
          });
          return;
        }
        case "edit-media": {
          if (busy) return;
          const target = intent.targetTitle
            ? `the "${intent.targetTitle}" media`
            : "the media you just sent";
          setTurnCursor(null);
          setNavDir(1);
          void sendMessage({
            text: `Edit ${target}: ${intent.instruction}. Re-emit the same card with the updated media; keep everything else identical.`,
          });
          return;
        }
        case "edit-field":
          return askAgentInline(intent);
        case "history":
          navigateHistory(intent.dir);
          return;
      }
    },
    [busy, sendMessage, askAgentInline, navigateHistory],
  );

  // Composer -----------------------------------------------------------------
  const [input, setInput] = useState("");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [skillEditorOpen, setSkillEditorOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const sendSuggestion = (text: string) => {
    void dispatchIntent({ kind: "compose", text });
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, [projectId]);
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void dispatchIntent({ kind: "compose", text });
  };

  // Voice dictation — Web Speech API feeding the same compose intent the
  // keyboard uses. Interim results preview in the composer; the final
  // transcript submits through dispatchIntent.
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const [dictating, setDictating] = useState(false);
  const speechCtor =
    typeof window !== "undefined"
      ? ((window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
      : undefined;
  const speechSupported = typeof speechCtor === "function";
  const toggleDictation = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    if (typeof speechCtor !== "function") return;
    type SpeechAlternative = { transcript: string };
    type SpeechResult = { isFinal: boolean; 0: SpeechAlternative };
    type SpeechResultEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
    const rec = new (
      speechCtor as new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((ev: SpeechResultEvent) => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        start: () => void;
        stop: () => void;
      }
    )();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
    let finalText = "";
    rec.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput(`${finalText}${interim}`.trimStart());
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setDictating(false);
      const text = finalText.trim();
      if (text) {
        setInput("");
        void dispatchIntent({ kind: "compose", text });
      }
    };
    rec.onerror = () => {
      recognitionRef.current = null;
      setDictating(false);
    };
    recognitionRef.current = rec;
    setDictating(true);
    rec.start();
  }, [dispatchIntent, speechCtor]);
  useEffect(() => () => recognitionRef.current?.stop(), []);

  // Send picked/dropped assets to the agent as an answer so it can reference
  // them (an active upload turn is answered; on an open stage the agent infers
  // or asks). Shared by the composer "+" attach and stage drag-and-drop.
  const dispatchAssets = useCallback(
    (picked: ProjectAsset[]) => {
      if (!picked.length) return;
      void dispatchIntent({
        kind: "answer",
        value: picked.map(describeAsset).join("; "),
        assets: picked,
      });
    },
    [dispatchIntent],
  );

  // Attach — the composer's "+" opens the library/upload picker; picked
  // assets are sent as an answer so the agent can reference them.
  const handleAttachPicked = useCallback(
    async (result: PickerResult) => {
      setAttachOpen(false);
      let picked: ProjectAsset[] = [];
      if (result.kind === "library") {
        picked = result.assets;
      } else {
        for (const f of result.files) {
          try {
            picked.push(await fileToAsset(f, null, projectId));
          } catch (err) {
            console.error("[agent-shell] attach upload failed", err);
          }
        }
      }
      dispatchAssets(picked);
    },
    [dispatchAssets, projectId],
  );

  // Stage drag-and-drop — files dropped anywhere on the viewport. If an upload
  // turn is currently on the stage, route the files through its input element
  // so fileToAsset infers the requested kind/label (the agent already has the
  // context it asked for); otherwise `source` is null and the agent infers or
  // asks. ESC aborts via the passed signal before we commit the send.
  const handleStageDrop = useCallback(
    async (files: File[], signal: AbortSignal) => {
      const source = document.querySelector<HTMLElement>("input[data-upload]");
      const picked: ProjectAsset[] = [];
      for (const f of files) {
        if (signal.aborted) return;
        try {
          picked.push(await fileToAsset(f, source, projectId));
        } catch (err) {
          console.error("[agent-shell] stage drop upload failed", err);
        }
      }
      if (signal.aborted || !picked.length) return;
      // Committing project state is safe even if the answer is gated by busy —
      // mirror the picker flow and let dispatchIntent decide whether to send.
      dispatchAssets(picked);
    },
    [dispatchAssets, projectId],
  );

  // Keyboard turn navigation — ArrowUp/Down browse history when the user
  // isn't typing (composer must be empty for the arrows to take over).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || !!t?.isContentEditable;
      const isComposer = t === inputRef.current;
      if (typing && !(isComposer && input.trim() === "")) return;
      if (busy || stageTurns.length === 0) return;
      e.preventDefault();
      navigateHistory(e.key === "ArrowUp" ? "back" : "forward");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, input, stageTurns.length, navigateHistory]);

  // Agent status line.
  const agentStatus = useMemo(() => {
    if (pendingTools.length) return friendlyToolStatus(pendingTools[0]);
    if (status === "streaming") return "Thinking…";
    if (status === "submitted") return "Sending…";
    return "Ready";
  }, [pendingTools, status]);
  // While busy, show the live turn status; otherwise a background render still
  // in flight reads as "Generating…" rather than the idle "Waiting for you".
  const statusText = busy ? agentStatus : generating ? "Generating…" : "Waiting for you";

  // Shared enter/exit variants for every stage zone (prose / card / stage).
  const turnZoneV = useTurnZone();
  // Transition style for the gen-UI slot depends on the previous occupant:
  // content replacing the skeleton DISSOLVES into its place (no travel);
  // content arriving fresh rises in with the turn choreography.
  const dissolveV = useDissolveZone();
  const cardVariants = prevGenSlotRef.current === "skeleton" ? dissolveV : turnZoneV;
  const stageVariants = prevGenSlotRef.current === "skeleton" ? dissolveV : turnZoneV;
  const skeletonVariants = prevGenSlotRef.current === "empty" ? turnZoneV : dissolveV;
  // FLIP layout animations: when a zone collapses (card exits after an
  // answer) the grid's my-auto recenters everything — `layout` turns that
  // one-frame reflow jump into a glide. Disabled under reduced motion.
  // CRITICAL: the actual DOM removal happens inside AnimatePresence's own
  // state, AFTER the parent's last render — without a re-render at that
  // moment the layout column never re-measures and snaps instead of
  // gliding. Every zone's AnimatePresence bumps `layoutTick` via
  // onExitComplete so the shell re-renders exactly when space collapses.
  const reduceMotionPref = useReducedMotion();
  const zoneLayout = !reduceMotionPref;
  const [, setLayoutTick] = useState(0);
  const bumpLayout = useCallback(() => setLayoutTick((t) => t + 1), []);

  // The backdrop parallax-nudges on history nav (navigateHistory bumps
  // navTick); also nudge when a NEW live turn lands so the "endless space"
  // drifts with every turn, not only when browsing.
  const prevTurnIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeAssistantId || prevTurnIdRef.current === activeAssistantId) return;
    prevTurnIdRef.current = activeAssistantId;
    if (!browsing) {
      setNavDir(1);
      setNavTick((t) => t + 1);
    }
  }, [activeAssistantId, browsing]);

  // Thumbnail stack — most recent project assets that resolve to a picture.
  const thumbs = useMemo(() => {
    const out: string[] = [];
    for (let i = assets.length - 1; i >= 0 && out.length < 3; i--) {
      const a = assets[i];
      if (a.kind !== "image" && a.kind !== "video") continue;
      const t = resolveThumb(a.url, assets);
      if (t) out.push(t);
    }
    return out;
  }, [assets]);

  // Measure the prose (agent message) column so the stage below it can be
  // sized to fit the remaining viewport without ever overflowing under the
  // fixed composer band at the bottom.
  const proseColRef = useRef<HTMLDivElement | null>(null);
  const [proseColHeight, setProseColHeight] = useState<number>(0);
  useEffect(() => {
    const el = proseColRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setProseColHeight(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeAssistantId, isEmpty]);

  // Reserved bands — measured from the actual fixed chrome (top pill,
  // bottom composer cluster) so the stage never overlaps them even when
  // the chrome changes height. BAND_GAP is the breathing room between
  // chrome and stage; STAGE_GAP the space between prose and stage (mt-6).
  const BAND_GAP = 16;
  const STAGE_GAP = 24;
  const { ref: topBandRef, band: topBand } = useViewportBand("top", 52);
  const { ref: bottomBandRef, band: bottomBand } = useViewportBand("bottom", 60);
  const reservedTop = topBand + BAND_GAP;
  const reservedBottom = bottomBand + BAND_GAP;
  const stageMaxHeight = `calc(100dvh - ${
    reservedTop + reservedBottom + STAGE_GAP + Math.ceil(proseColHeight)
  }px)`;

  return (
    <>
      {/* --- Agent shell: full viewport stage --- */}
      <div
        className="fixed inset-0 z-10 overflow-hidden bg-background text-foreground"
        style={{ width: "100vw", height: "100vh" }}
      >
        {/* Ambient "endless space" layer — sits behind all stage content. */}
        <EtherealBackdrop project={project} navDir={navDir} navTick={navTick} />

        {/* Center: single-turn stage.
            16-col grid: 24px page margins, 16px gutter.
            Agent message column: 8/16. Gen UI column: 10/16. */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden"
          style={{ paddingTop: reservedTop, paddingBottom: reservedBottom }}
        >
          {/* Full-stage WebGL takeover — one persistent scene with a camera
              (zoom/pan) for canvas-renderable settled turns. Everything else
              (busy, errors, unsupported blocks) falls through to the DOM
              stage below. */}
          {canvasStageActive && canvasTurn ? (
            <StageCanvasMount
              turn={canvasTurn}
              echoText={lastUserText || undefined}
              statusText={statusText}
              seedKey={activeAssistantId ?? undefined}
              onAnswer={handleCardAnswer}
            />
          ) : (
            <>
              {/* relative: popLayout pins exiting zones absolutely against this
              container so their successor can dissolve into the same spot. */}
              <div className="grid-16 relative mx-auto my-auto w-full gap-y-0">
                {/* LayoutGroup shares one projection context across the zones —
                without it, a sibling zone unmounting never re-measures the
                prose column, so its `layout` glide would not fire and the
                column would snap to its new centered position. */}
                <LayoutGroup>
                  <AnimatePresence initial={false}>
                    {isEmpty && (
                      <motion.div
                        key="empty-state"
                        className="absolute inset-0 flex flex-col items-center justify-center text-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, filter: "blur(6px)", transition: { duration: 0.3 } }}
                      >
                        <AgentSymbol playing={busy} className="mb-5 h-6 w-6 text-foreground/70" />
                        <h1 className="font-display text-4xl font-normal tracking-tight text-foreground">
                          What are we making today?
                        </h1>
                        <p className="mt-3 text-sm text-muted-foreground">
                          Say anything below, we'll take it from there
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {!isEmpty && (
                    <>
                      {/* Agent message column — 8 cols. layout="position" glides it
                    to its new grid-centered position when a sibling zone
                    collapses instead of snapping there in one frame. Position
                    ONLY — full `layout` would also FLIP-scale the box when its
                    height changes between turns, visibly squishing/stretching
                    the message text mid-glide. */}
                      <motion.div
                        ref={proseColRef}
                        layout={zoneLayout ? "position" : false}
                        transition={{ layout: SPRING }}
                        className="col-span-8 col-start-5 flex flex-col gap-3"
                      >
                        {/* Last user prompt as small context — cross-fades between turns */}
                        {lastUserText && (
                          <FadeSwap id={lastUserText}>
                            <div className="flex gap-2 text-sm text-muted-foreground">
                              <span className="opacity-40">|</span>
                              <span className="text-foreground/80">{lastUserText}</span>
                            </div>
                          </FadeSwap>
                        )}

                        {/* Agent message + status, split into two zones: the message
                      is big display text on top; the status is a small muted
                      line below, with the glyph beside it. Delivery is
                      SEQUENCED as two messages: the acknowledgement of the
                      user's answer leads (chambered per-option ack at click
                      time, or the streamed ack while render_turn's JSON is
                      mid-flight), then exits on the standard message exit and
                      the question follows. mode="wait" serializes the swap.
                      Inline edits (popup/sidebar) leave this zone untouched —
                      the stage stays exactly as-is while they run. */}
                        {
                          <div className="flex min-w-0 flex-col gap-4">
                            <AnimatePresence
                              mode="wait"
                              custom={navDir}
                              initial={false}
                              onExitComplete={bumpLayout}
                            >
                              {showAckMessage ? (
                                <motion.div
                                  key={`ack-${displayAck}`}
                                  className="flex min-w-0 flex-col gap-1"
                                  variants={turnZoneV}
                                  custom={navDir}
                                  initial="initial"
                                  animate="animate"
                                  exit="exit"
                                >
                                  <WordsRamp
                                    text={displayAck}
                                    className="font-display text-2xl font-medium leading-snug tracking-tight text-foreground"
                                  />
                                </motion.div>
                              ) : showTurnProse ? (
                                <motion.div
                                  key={`turn-${activeAssistantId ?? "none"}`}
                                  className="flex min-w-0 flex-col gap-1"
                                  variants={turnZoneV}
                                  custom={navDir}
                                  initial="initial"
                                  animate="animate"
                                  exit="exit"
                                >
                                  <AssistantMessage text={activeProse} />
                                </motion.div>
                              ) : !activeProse && !busy ? (
                                <motion.div
                                  key="idle-hi"
                                  className="font-display text-2xl font-medium leading-snug tracking-tight text-foreground/40"
                                  variants={turnZoneV}
                                  custom={navDir}
                                  initial="initial"
                                  animate="animate"
                                  exit="exit"
                                >
                                  Hi — describe what you'd like to make and I'll get started.
                                </motion.div>
                              ) : null}
                            </AnimatePresence>

                            <div className="flex items-center gap-2">
                              <AgentSymbol
                                playing={busy}
                                className={cn(
                                  "h-5 w-5 shrink-0 text-[#969098]",
                                  !busy && "agent-symbol-pulse",
                                )}
                              />
                              {/* Status swaps animate (fade + move up); while busy
                            the shimmer's ::after paints the sweeping gradient
                            clipped to a data-text duplicate of the glyphs. */}
                              <FadeSwap id={statusText} className="min-w-0">
                                <span
                                  className={cn(
                                    "text-sm",
                                    busy ? "agent-status-shimmer" : "text-foreground/40",
                                  )}
                                  data-text={busy ? statusText : undefined}
                                >
                                  {statusText}
                                </span>
                              </FadeSwap>
                            </div>
                          </div>
                        }

                        {/* Error banner */}
                        {error && (
                          <div className="flex items-center justify-between gap-4 rounded-2xl border border-destructive/40 bg-destructive/10 px-5 py-3 text-sm text-destructive">
                            <span>{describeChatError(error).message}</span>
                            <button
                              type="button"
                              onClick={() => {
                                clearError();
                                void regenerate();
                              }}
                              disabled={busy}
                              className="shrink-0 rounded-full border border-destructive/40 px-3 py-1 text-xs font-medium transition hover:bg-destructive/10 disabled:opacity-40"
                            >
                              Retry
                            </button>
                          </div>
                        )}
                      </motion.div>

                      {/* Gen UI column — 10 cols, centered. While streaming, the
                    card renders as soon as the live turn's blocks are fully
                    parsed — never from half-streamed JSON, never a previous
                    turn's card resurrected during busy. Keyed presence: the
                    outgoing card eases out (AnimatePresence keeps it mounted
                    with frozen props during exit) instead of jump-cutting. */}
                      <AnimatePresence
                        mode="popLayout"
                        custom={navDir}
                        initial={false}
                        onExitComplete={bumpLayout}
                      >
                        {showSkeleton ? (
                          <motion.div
                            key="stage-skeleton"
                            className={
                              composingHint === "stage"
                                ? "col-span-14 col-start-2 mt-6"
                                : "col-span-10 col-start-4 mt-6"
                            }
                            variants={skeletonVariants}
                            custom={navDir}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                          >
                            <StageSkeleton hint={composingHint} />
                          </motion.div>
                        ) : showCardZone ? (
                          <motion.div
                            key={`card-${activeAssistantId ?? "none"}`}
                            className="col-span-10 col-start-4 mt-6"
                            variants={cardVariants}
                            custom={navDir}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                          >
                            <GenerativeCard
                              html={activeHtml}
                              onAnswer={handleCardAnswer}
                              assets={assets}
                              projectId={projectId}
                              seedKey={activeAssistantId ?? undefined}
                              onIntent={dispatchIntent}
                              onInlineAsk={askInline}
                            />
                          </motion.div>
                        ) : showRenderProgress ? (
                          <motion.div
                            key="stage-render-progress"
                            className="col-span-10 col-start-4 mt-6"
                            variants={skeletonVariants}
                            custom={navDir}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                          >
                            <StageRenderProgress
                              label={renderProgressLabel}
                              aspectRatio={project.meta.aspectRatio}
                            />
                          </motion.div>
                        ) : null}
                      </AnimatePresence>

                      {/* Stage generation column — full width, capped to remaining viewport */}
                      <AnimatePresence
                        mode="popLayout"
                        custom={navDir}
                        initial={false}
                        onExitComplete={bumpLayout}
                      >
                        {showStageZone && (
                          <motion.div
                            key={`stage-${activeAssistantId ?? "none"}`}
                            className="col-span-14 col-start-2 mt-6 flex min-h-0 flex-col"
                            style={{ maxHeight: stageMaxHeight, height: stageMaxHeight }}
                            variants={stageVariants}
                            custom={navDir}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                          >
                            <StageGenerationView
                              gen={activeStageGen}
                              project={project}
                              assets={assets}
                              onAnswer={(v, next, ack) =>
                                handleCardAnswer({ summary: v, assets: [], next, ack })
                              }
                              onPatch={onPatch}
                              onAgentAssist={askAgentInline}
                              onIntent={dispatchIntent}
                              busyField={busyField}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </LayoutGroup>
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- Top-center project pill (outside shell) --- */}
      <div
        ref={topBandRef}
        className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center"
      >
        <button
          type="button"
          onClick={onOpenProjectSwitcher}
          className="group pointer-events-auto flex h-12 items-center gap-2 rounded-2xl bg-foreground px-4 py-3 text-[color:var(--content-light-secondary)] transition hover:opacity-95"
          style={{
            fontFamily: '"Telka Extended", "Telka", system-ui, sans-serif',
            fontWeight: 500,
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          {projectThumbUrl ? (
            <img
              src={projectThumbUrl}
              alt=""
              className="h-6 w-6 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-background/10">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="max-w-[24rem] truncate">{projectTitle || "Untitled project"}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70 transition group-hover:opacity-100" />
        </button>
      </div>

      {/* --- Top-right actions (outside shell) --- */}
      <div className="fixed right-4 top-4 z-40 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1">
          <IconButton
            label="Previous step"
            icon={ChevronUp}
            onClick={() => void dispatchIntent({ kind: "history", dir: "back" })}
            disabled={busy || stageTurns.length < 2 || (cursor ?? liveIndex) <= 0}
          />
          <IconButton
            label="Next step"
            icon={ChevronDown}
            onClick={() => void dispatchIntent({ kind: "history", dir: "forward" })}
            disabled={busy || !browsing}
          />
          <button
            type="button"
            onClick={onExport}
            className="btn-48 ml-1 bg-[color:var(--surface-dark-6)] text-[color:var(--content-dark-secondary)] transition hover:bg-[color:var(--surface-dark-5)]"
          >
            Export
          </button>
        </div>
        {/* Debug pill — current skill; click to edit skill.md live. */}
        <button
          type="button"
          onClick={() => setSkillEditorOpen((v) => !v)}
          title={selectedApp ? `Edit ${selectedApp.appId}/skill.md` : "No skill selected yet"}
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur transition hover:bg-card hover:text-foreground",
            skillEditorOpen && "text-foreground",
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          <span className="uppercase tracking-wider opacity-60">Skill</span>
          <span className="truncate max-w-[14rem]">{selectedApp?.label ?? "None selected"}</span>
        </button>
      </div>

      {/* --- History browsing chip --- */}
      <AnimatePresence>
        {browsing && (
          <motion.div
            className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center"
            initial={{ opacity: 0, y: -6, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/90 px-4 py-2 text-xs text-muted-foreground shadow-elegant backdrop-blur">
              <span>
                Viewing step {(cursor ?? 0) + 1} of {stageTurns.length}
              </span>
              <span className="h-3 w-px bg-border" aria-hidden />
              <button
                type="button"
                onClick={() => void dispatchIntent({ kind: "history", dir: "live" })}
                className="font-medium text-foreground transition hover:opacity-80"
              >
                Return to latest
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Bottom cluster (outside shell) --- */}
      <div
        ref={bottomBandRef}
        className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-3 px-6"
      >
        {isEmpty && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <SuggestionChip
                key={s.label}
                icon={s.icon}
                label={s.label}
                gradient={s.gradient}
                onClick={() => sendSuggestion(s.prompt)}
              />
            ))}
            <SuggestionChip icon={MoreHorizontal} label="More Ideas" muted onClick={onOpenApps} />
          </div>
        )}
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTranscriptOpen((v) => !v)}
            aria-label={transcriptOpen ? "Hide transcript" : "Show transcript"}
            title={transcriptOpen ? "Hide transcript" : "Show transcript"}
            className={cn(
              "flex h-[56px] w-[56px] items-center justify-center rounded-[24px] border border-border bg-card text-muted-foreground transition hover:text-foreground",
              transcriptOpen && "text-foreground",
            )}
          >
            <History className="h-4 w-4" />
          </button>

          <div className="h-6 w-px bg-border" />
          <button
            type="button"
            onClick={onOpenApps}
            aria-label="Apps"
            title="Apps"
            className="flex h-[56px] w-[56px] items-center justify-center rounded-[24px] border border-border bg-card text-muted-foreground transition hover:text-foreground"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>

          <div className="flex h-[56px] items-center gap-2 rounded-[24px] border border-border bg-card p-2">
            <button
              type="button"
              onClick={() => setAttachOpen(true)}
              aria-label="Attach a reference"
              title="Attach a reference"
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Message"
              className="w-64 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {input.trim() && !dictating ? (
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                aria-label="Send message"
                className="grid h-7 w-7 place-items-center rounded-full bg-foreground text-background transition hover:opacity-90 disabled:opacity-40"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
            ) : speechSupported ? (
              <button
                type="button"
                onClick={toggleDictation}
                aria-label={dictating ? "Stop dictation" : "Dictate a message"}
                title={dictating ? "Stop dictation" : "Dictate a message"}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full transition",
                  dictating
                    ? "animate-pulse-glow bg-primary text-primary-foreground"
                    : "bg-primary/15 text-primary hover:bg-primary/25",
                )}
              >
                <Mic className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {attachOpen && (
        <AssetPickerDialog
          open
          onOpenChange={(v) => {
            if (!v) setAttachOpen(false);
          }}
          accept="any"
          multiple
          onPick={(result) => {
            void handleAttachPicked(result);
          }}
        />
      )}

      {/* Drop files anywhere on the stage to hand them to the agent. Gated
          while busy or the picker is open so we never double-handle a drop. */}
      <StageDropzone onDropFiles={handleStageDrop} disabled={busy || attachOpen} />

      {/* Hidden toolbar wiring so agent-mode users can still change model via
          the existing popover if the app menu opens it (kept off-screen). */}
      <div className="sr-only">
        <StudioToolbar mode={studioMode} model={studioModel} onChange={onToolbarChange} />
      </div>

      <AnimatePresence>
        {transcriptOpen && (
          <TranscriptPanel messages={messages} onClose={() => setTranscriptOpen(false)} />
        )}
        {skillEditorOpen && (
          <SkillEditorPanel selectedApp={selectedApp} onClose={() => setSkillEditorOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

function TranscriptPanel({ messages, onClose }: { messages: UIMessage[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  type Row = { id: string; role: "user" | "assistant" | "tool"; text: string };
  const rows: Row[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      const text = (m.parts ?? [])
        .filter((p: { type: string }) => p.type === "text")
        .map((p: { type: string; text?: string }) => p.text ?? "")
        .join("")
        .replace(INLINE_REWORK_MARKER, "")
        .trim();
      if (text) rows.push({ id: m.id, role: "user", text });
      continue;
    }
    if (m.role !== "assistant") continue;
    // Walk parts in order, interleaving tool events with the final
    // assistant render_turn / text so the log reads chronologically.
    let toolIdx = 0;
    for (const p of (m.parts as unknown as Array<{ type: string }> | undefined) ?? []) {
      if (typeof p.type === "string" && p.type.startsWith("tool-")) {
        const line = formatToolRow(p as unknown as ToolPart);
        if (line) rows.push({ id: `${m.id}:t${toolIdx++}`, role: "tool", text: line });
      }
    }
    const extract = extractRenderTurn(m);
    const text = extract
      ? formatTurnTranscript(extract.turn)
      : formatAssistantTranscript(renderableHtmlOf(m));
    if (text) rows.push({ id: m.id, role: "assistant", text });
  }

  // Docked debug panel — NOT a modal (no backdrop, doesn't block the stage).
  // Temporary home for the conversation transcript while agent instructions
  // are being iterated on; slated for removal once that work is done.
  return (
    <motion.div
      className="pointer-events-auto fixed right-4 top-4 bottom-4 z-[100] flex w-[420px] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Conversation transcript</h2>
          <p className="text-[11px] text-muted-foreground">Debug view — temporary</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          Close
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="space-y-1">
              <div
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wide",
                  r.role === "tool" ? "text-emerald-500" : "text-muted-foreground",
                )}
              >
                {r.role === "user" ? "You" : r.role === "assistant" ? "Agent" : "Tool"}
              </div>
              <div
                className={cn(
                  "whitespace-pre-wrap text-sm",
                  r.role === "tool"
                    ? "font-mono text-[12px] text-muted-foreground"
                    : "text-foreground",
                )}
              >
                {r.text}
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

// Compact one-line summary of a tool part for the transcript debug view.
// Covers select_app (skill routing), render_turn (block list), and the
// common producer tools — falls back to `<tool> · <state>` for anything else.
function formatToolRow(p: ToolPart): string {
  const name = p.type.replace(/^tool-/, "");
  const state = p.state ?? "unknown";
  const preview = (v: unknown, max = 140): string => {
    if (v == null) return "";
    let s: string;
    try {
      s = typeof v === "string" ? v : JSON.stringify(v);
    } catch {
      s = String(v);
    }
    s = s.replace(/\s+/g, " ");
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  };
  if (name === "select_app" && p.state === "output-available") {
    const o = p.output as { label?: string; appId?: string; error?: string } | undefined;
    if (o?.error) return `select_app · error: ${o.error}`;
    return `SKILL SELECTED → ${o?.label ?? "?"} (${o?.appId ?? "?"})`;
  }
  if (name === "render_turn") {
    const input = p.input as { blocks?: Array<{ type?: string }> } | undefined;
    const output = p.output as
      { ok?: boolean; turn?: { blocks?: Array<{ type?: string }> } } | undefined;
    const source = output?.turn?.blocks ?? input?.blocks ?? [];
    const types = source.map((b) => b?.type ?? "?").join(", ");
    return `render_turn · ${state}${types ? ` · blocks: [${types}]` : ""}`;
  }
  const inputStr = preview(p.input);
  return inputStr ? `${name} · ${state} · ${inputStr}` : `${name} · ${state}`;
}

// -----------------------------------------------------------------------------
// Debug: live skill.md editor. Reads the file from the dev server via
// server functions and writes back on Save. Vite HMR picks up the change
// through each skill.ts's `?raw` import so the next agent turn uses the
// new prompt without a page reload.
function SkillEditorPanel({
  selectedApp,
  onClose,
}: {
  selectedApp: { appId: string; label: string } | null;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string>("");
  const [original, setOriginal] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const appId = selectedApp?.appId;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const load = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await readSkillMd({ data: { appId } });
      setContent(res.content);
      setOriginal(res.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = content !== original;
  const canSave = dirty && !saving && !loading && !!appId;

  const save = async () => {
    if (!appId) return;
    setSaving(true);
    setError(null);
    try {
      await writeSkillMd({ data: { appId, content } });
      setOriginal(content);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="pointer-events-auto fixed right-4 top-4 bottom-4 z-[100] flex w-[560px] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {selectedApp ? `Skill · ${selectedApp.label}` : "No skill selected"}
          </h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {appId
              ? `src/agent/skills/${appId}/skill.md · dev-only`
              : "The agent hasn't picked a skill yet."}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void load()}
            disabled={!appId || loading}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Close
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-5 py-4">
        {!appId ? (
          <p className="text-sm text-muted-foreground">
            Pick or ask for an app first — the agent will call{" "}
            <code className="text-xs">select_app</code> and this panel will load its{" "}
            <code className="text-xs">skill.md</code>.
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading skill.md…</p>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="h-full w-full resize-none rounded-lg border border-border bg-background p-3 font-mono text-[12px] leading-relaxed text-foreground outline-none focus:border-primary"
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
        <div className="min-w-0 text-[11px] text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : dirty ? (
            <span>Unsaved changes — HMR reloads on save.</span>
          ) : savedAt ? (
            <span>Saved. Next agent turn uses the new prompt.</span>
          ) : (
            <span>Edits only affect skill.md — skill.ts is untouched.</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </motion.div>
  );
}

// Transcript text for a typed render_turn payload — mirrors EXACTLY what the
// stage showed: ack line, prose line, then each block summarized by the
// labels/titles the user saw (never the hidden echo values).
function formatTurnTranscript(turn: RenderTurn): string {
  const parts: string[] = [];
  if (turn.ack) parts.push(turn.ack);
  if (turn.prose) parts.push(turn.prose);
  for (const block of turn.blocks ?? []) {
    switch (block.type) {
      case "options":
        parts.push(
          block.items.map((i) => `• ${i.title}${i.subtitle ? ` — ${i.subtitle}` : ""}`).join("\n"),
        );
        break;
      case "actions":
        parts.push(block.buttons.map((b) => `[${b.label}]`).join("  "));
        break;
      case "form":
        parts.push(`Form: ${block.fields.map((f) => f.label).join(", ")}`);
        break;
      case "upload":
        parts.push(`Upload: ${block.label}${block.hint ? ` (${block.hint})` : ""}`);
        break;
      case "media": {
        const line = `[${block.mediaKind}${block.title ? `: ${block.title}` : ""}]`;
        const actions = (block.actions ?? []).map((a) => `[${a.label}]`).join("  ");
        parts.push(actions ? `${line}\n${actions}` : line);
        break;
      }
      case "gallery": {
        const labels = block.items
          .map((i) => i.label)
          .filter(Boolean)
          .join(", ");
        const line = `[${block.items.length} image${block.items.length === 1 ? "" : "s"}${
          block.title ? `: ${block.title}` : ""
        }${labels ? ` — ${labels}` : ""}]`;
        const actions = (block.actions ?? []).map((a) => `[${a.label}]`).join("  ");
        parts.push(actions ? `${line}\n${actions}` : line);
        break;
      }
      case "moodboard": {
        const bits = block.items.map((t) =>
          t.kind === "image"
            ? (t.label ?? "image")
            : t.kind === "palette"
              ? `palette ${t.colors.join(" ")}`
              : `type "${t.text.replace(/\n/g, " ")}"`,
        );
        const line = `[moodboard${block.title ? `: ${block.title}` : ""} — ${bits.join(", ")}]`;
        const actions = (block.actions ?? []).map((a) => `[${a.label}]`).join("  ");
        parts.push(actions ? `${line}\n${actions}` : line);
        break;
      }
      case "list": {
        const items = block.items
          .map((i) => `• ${i.meta ? `${i.meta} — ` : ""}${i.text}`)
          .join("\n");
        const actions = (block.actions ?? []).map((a) => `[${a.label}]`).join("  ");
        parts.push([block.title, items, actions].filter(Boolean).join("\n"));
        break;
      }
      case "storyboard": {
        const items = block.items
          .map((i) => {
            const line = `• ${i.meta ? `${i.meta} — ` : ""}${i.title}${i.text ? `: ${i.text}` : ""}`;
            return i.vo ? `${line}\n  VO: ${i.vo}` : line;
          })
          .join("\n");
        const actions = (block.actions ?? []).map((a) => `[${a.label}]`).join("  ");
        parts.push([block.title, items, actions].filter(Boolean).join("\n"));
        break;
      }
      case "stage": {
        const actions = block.actions.map((a) => `[${a.label}]`).join("  ");
        parts.push(`[view: ${block.view}]${actions ? `\n${actions}` : ""}`);
        break;
      }
      case "custom_html":
        parts.push(
          block.html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        );
        break;
    }
  }
  return parts.filter(Boolean).join("\n\n");
}

// Turn the agent's raw HTML markup reply into readable transcript text.
function formatAssistantTranscript(raw: string): string {
  if (!raw) return "";
  // Prefer explicit prose / ack blocks when present.
  const proseMatch = raw.match(/<p[^>]*data-(?:prose|ack)[^>]*>([\s\S]*?)<\/p>/i);
  const lead = proseMatch
    ? proseMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : "";

  // Collect option-picker choices, if any.
  const options: string[] = [];
  const optionRe = /<button[^>]*data-action=["']answer["'][^>]*>([\s\S]*?)<\/button>/gi;
  let om: RegExpExecArray | null;
  while ((om = optionRe.exec(raw)) !== null) {
    const inner = om[1];
    const title = inner.match(/data-title[^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const subtitle = inner.match(/data-subtitle[^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const valueAttr = om[0].match(/data-value=["']([^"']+)["']/)?.[1];
    const label = (title ?? valueAttr ?? inner)
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const sub = subtitle
      ? subtitle
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
      : "";
    if (label) options.push(sub ? `${label} — ${sub}` : label);
  }

  // Card title, if any.
  const cardTitle = raw.match(/data-card-title=["']([^"']+)["']/)?.[1] ?? "";

  // Fallback: strip all tags.
  const fallback = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts: string[] = [];
  if (lead) parts.push(lead);
  if (cardTitle && !lead.includes(cardTitle)) parts.push(cardTitle);
  if (options.length) parts.push(options.map((o) => `• ${o}`).join("\n"));
  if (!parts.length && fallback) parts.push(fallback);
  return parts.join("\n\n");
}

// ---------- primitives ----------

function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function IconChipButton({
  icon: Icon,
  label,
  onClick,
  trailing,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
      {trailing}
    </button>
  );
}

// ---------- prompt suggestions ----------

type Suggestion = {
  label: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
};

const SUGGESTIONS: Suggestion[] = [
  {
    label: "Music Video",
    prompt: "Music video",
    icon: Music2,
    gradient: "linear-gradient(135deg,#1F1147 0%,#F27A54 100%)",
  },
  {
    label: "30s Product Ad",
    prompt: "30-second product ad",
    icon: ShoppingBag,
    gradient: "linear-gradient(135deg,#BFD4E6 0%,#6D8FA8 100%)",
  },
  {
    label: "2min Short Drama",
    prompt: "Short drama, 2 minutes",
    icon: Film,
    gradient: "linear-gradient(135deg,#7A5A3A 0%,#2B1E12 100%)",
  },
  {
    label: "Fashion TikTok Hook",
    prompt: "TikTok hook — fashion",
    icon: Shirt,
    gradient: "linear-gradient(135deg,#C0392B 0%,#5A1A12 100%)",
  },
];

function SuggestionChip({
  icon: Icon,
  label,
  gradient,
  muted,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  gradient?: string;
  muted?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-[18px] py-2 pl-2 pr-4 text-sm font-medium transition hover:opacity-90"
      style={{ backgroundColor: "rgba(207,195,255,0.10)", color: "#806ECA" }}
    >
      <span
        className="grid h-8 w-8 place-items-center rounded-[12px] text-white"
        style={{
          background: muted ? "rgba(128,110,202,0.15)" : gradient,
          color: muted ? "#806ECA" : "white",
        }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span>{label}</span>
    </button>
  );
}

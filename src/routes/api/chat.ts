// @ts-nocheck — legacy feature file; feature tables (characters, library_subjects, render_jobs, etc.) are not part of the projects-first Supabase migration.
import { createAnthropic } from "@ai-sdk/anthropic";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { downloadAndStoreUrl } from "@/lib/project-assets.server";
import {
  falGenerateImage,
  falRun,
  falSubmit,
  falPickImageUrl,
  falPickVideoUrl,
  falPickAudioUrl,
  normalizeAspect,
} from "@/lib/fal.server";
import { requireUser, unauthorizedResponse } from "@/lib/auth-route.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  applyPatch,
  INITIAL_PROJECT,
  type ProjectState,
  type AssetKind,
} from "@/lib/project-state";
import { createProjectPlaceholder } from "@/lib/project-placeholder.server";
import { createAgentAppRegistry, renderAppPlaybook } from "@/lib/agent/app-registry";
import { createBuiltinSkills, getBuiltinSkill as findBuiltinSkill } from "@/lib/skills/registry";
import { loadAgentSkills } from "@/lib/skills/agent-skill-registry.server";
import { buildCorePrompt, buildInlineEditCorePrompt } from "@/lib/agent/prompt/core";
import { getPhasePrompt } from "@/lib/agent/prompt/phases";
import { renderAppCatalogSummary, renderSelectedAppContext } from "@/lib/agent/prompt/catalog";
import { derivePhase, extractLatestUserText, toolsForPhase } from "@/lib/agent/phase.server";
import { createTurnGuard } from "@/lib/agent/turn-guard.server";
import { RenderTurnSchema, type RenderTurn } from "@/lib/agent/ui-schema";
import {
  findAgentTool,
  listAgentToolGroups,
  searchAgentTools,
} from "@/lib/agent/tool-registry.server";
import { ProjectPatchSchema } from "@/lib/agent/patch-schema";
import {
  resolveRenderReferences,
  promptSuffixForIntent,
  applyReferencesToModelBody,
  materializeRefsForFal,
} from "@/lib/agent/render-references.server";

// Anthropic rate-limit circuit breaker (module-scoped).
let __anthropicCooldownUntil = 0;
function getAnthropicCooldownUntil() {
  return __anthropicCooldownUntil;
}
function setAnthropicCooldown(ms: number) {
  __anthropicCooldownUntil = Date.now() + ms;
}
function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { statusCode?: number; status?: number; message?: string; name?: string };
  if (anyErr.statusCode === 429 || anyErr.status === 429) return true;
  const msg = (anyErr.message || String(err)).toLowerCase();
  return msg.includes("too many requests") || msg.includes("rate limit") || msg.includes("429");
}

// ---------- Tool implementations ----------

let _toolAssetCounter = 0;
const nextToolAssetId = () =>
  `ast_t${Date.now().toString(36)}${(++_toolAssetCounter).toString(36)}`;

const CHAT_IMAGE_MODEL = "fal/nano-banana";

function truncateLine(value: string, max = 220): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Backfill any dangling assistant tool-calls (tool parts whose state is
 * "input-streaming" or "input-available" — no output recorded) with a
 * synthetic error output so the AI SDK doesn't throw
 * "Tool result is missing for tool call ...". This happens when a stream
 * is interrupted (page reload, network drop) mid-tool.
 */
function sanitizeDanglingToolCalls(messages: UIMessage[]): UIMessage[] {
  const out: UIMessage[] = [];
  for (const m of messages) {
    if (m.role !== "assistant" || !Array.isArray(m.parts)) {
      out.push(m);
      continue;
    }
    // Drop any tool-call part that never produced a result (interrupted streams).
    // Removing it entirely (rather than converting to output-error) avoids
    // edge cases where downstream validation still treats the call as pending.
    const parts = (m.parts as Array<{ type?: string; state?: string }>).filter((p) => {
      if (
        p &&
        typeof p.type === "string" &&
        p.type.startsWith("tool-") &&
        (p.state === "input-streaming" || p.state === "input-available" || p.state == null)
      ) {
        return false;
      }
      return true;
    });
    if (parts.length === 0) continue;
    out.push({ ...m, parts: parts as UIMessage["parts"] } as UIMessage);
  }
  return out;
}

function buildSelectedSkillContext(slug: string | null, label: string | null): string {
  if (!slug) return "";
  const name = label || slug;
  return [
    "═════ SELECTED SKILL (the user explicitly picked this from the Skills gallery) ═════",
    `slug: ${slug}`,
    `name: ${name}`,
    "The user has already committed to this skill for the project. Do NOT ask 'what are we making?' or offer alternative skills.",
    "If you have not yet invoked run_skill for this project, call run_skill({ slug }) now and drive that flow.",
    "═══════════════════════════════════════════════════════════════════════════════════════════",
    "",
  ].join("\n");
}

function buildProjectStateContext(state: ProjectState | null | undefined): string {
  const current = state ?? INITIAL_PROJECT;
  const assetUrlById = new Map(current.assets.map((asset) => [asset.id, asset.url]));
  const meta = [
    `title=${current.meta.title || "—"}`,
    `format=${current.meta.format || "—"}`,
    `aspect=${current.meta.aspectRatio || "—"}`,
    `logline=${current.meta.logline || "—"}`,
  ].join(" | ");
  const cast = current.cast.length
    ? current.cast
        .map((c) =>
          truncateLine(
            `- ${c.id}: ${c.name || "Unnamed"} (${c.role || "Character"}) ref=${c.ref || "none"} refUrl=${(c.ref && assetUrlById.get(c.ref)) || (/^https?:/.test(c.ref || "") ? c.ref : "none")} notes=${c.notes || "—"}`,
            320,
          ),
        )
        .join("\n")
    : "- none";
  const scenes = current.scenes.length
    ? current.scenes
        .map((s) => {
          const anchors =
            s.anchorAssetIds && s.anchorAssetIds.length
              ? `anchors=[${s.anchorAssetIds.join(",")}]${s.anchorApproved ? " APPROVED" : " (pending review)"}`
              : "anchors=none";
          return truncateLine(
            `- ${s.id}: #${s.n} ${s.title || "Untitled scene"} | prompt=${s.prompt || "—"} | thumb=${s.thumb || "none"} | ${anchors}`,
          );
        })
        .join("\n")
    : "- none";
  const assets = current.assets.length
    ? current.assets
        .map((a) =>
          truncateLine(
            `- ${a.id}: kind=${a.kind} label=${a.label || a.name || "asset"} attachedTo=${a.attachedTo || "—"} url=${a.url || "—"}`,
            260,
          ),
        )
        .join("\n")
    : "- none";
  const notes =
    current.notes && current.notes.length
      ? current.notes
          .slice(-30)
          .map((n) => truncateLine(`- [${n.tag || "decision"}] ${n.text}`, 280))
          .join("\n")
      : "- none";

  return [
    "═════ PROJECT MEMORY (this is your durable state — read it, never re-ask what's here) ═════",
    `Meta: ${meta}`,
    "Cast:",
    cast,
    "Scenes:",
    scenes,
    "Assets:",
    assets,
    "Decisions log (most recent last):",
    notes,
    "═══════════════════════════════════════════════════════════════════════════════════════════",
  ].join("\n");
}

function normalizeNameForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter((url) => /^https?:/.test(url))));
}

const CHAT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_ASSETS_BUCKET = "project-assets";

async function resolveLibraryCharacterImageUrl(
  characterId: string,
  userId: string,
): Promise<string> {
  if (!CHAT_UUID_RE.test(characterId)) return "";
  const { data } = await supabaseAdmin
    .from("characters")
    .select("image_url, image_storage_path")
    .eq("id", characterId)
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { image_url?: string | null; image_storage_path?: string | null } | null;
  if (row?.image_storage_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from(PROJECT_ASSETS_BUCKET)
      .createSignedUrl(row.image_storage_path, 60 * 60 * 24 * 7);
    if (signed?.signedUrl) return signed.signedUrl;
  }
  return row?.image_url ?? "";
}

function resolveCastReferenceUrls(
  state: ProjectState,
  text: string,
  assetUrlById: Map<string, string>,
): string[] {
  const haystack = normalizeNameForMatch(text);
  if (!haystack) return [];
  const urls: string[] = [];

  for (const castMember of state.cast) {
    const name = normalizeNameForMatch(castMember.name || "");
    if (!name || !haystack.includes(name)) continue;
    const ref = castMember.ref || "";
    const refUrl = assetUrlById.get(ref) || (/^https?:/.test(ref) ? ref : "");
    if (refUrl) urls.push(refUrl);
  }

  if (urls.length > 0) return dedupeUrls(urls);

  // If the user names a Library character but the cast ref has not been
  // patched yet, fall back to a project asset with the same name/label.
  for (const asset of state.assets) {
    if (!asset.url || !/^https?:/.test(asset.url)) continue;
    const label = normalizeNameForMatch(`${asset.name || ""} ${asset.label || ""}`);
    if (label && haystack.includes(label)) urls.push(asset.url);
  }
  return dedupeUrls(urls);
}

async function resolveCastReferenceUrlsWithLibrary(
  state: ProjectState,
  text: string,
  assetUrlById: Map<string, string>,
  userId: string,
): Promise<string[]> {
  const urls = resolveCastReferenceUrls(state, text, assetUrlById);
  const haystack = normalizeNameForMatch(text);
  if (!haystack) return urls;
  for (const castMember of state.cast) {
    const name = normalizeNameForMatch(castMember.name || "");
    if (!name || !haystack.includes(name)) continue;
    const ref = castMember.ref || "";
    const refUrl = assetUrlById.get(ref) || (/^https?:/.test(ref) ? ref : "");
    if (!refUrl && CHAT_UUID_RE.test(ref)) {
      const libraryUrl = await resolveLibraryCharacterImageUrl(ref, userId);
      if (libraryUrl) urls.push(libraryUrl);
    }
  }
  return dedupeUrls(urls);
}

function latestLikenessReferenceUrls(state: ProjectState): string[] {
  return dedupeUrls(
    [...state.assets]
      .reverse()
      .filter((asset) => asset.kind === "likeness" && /^https?:/.test(asset.url))
      .map((asset) => asset.url),
  ).slice(0, 3);
}

function looksLikeCharacterAppearanceEdit(text: string): boolean {
  return /\b(wear|wearing|dress|gown|outfit|clothes|hair|hairstyle|beard|makeup|look|looks|appearance|style|change\s+(?:her|him|them|the character)|make\s+(?:her|him|them))\b/i.test(
    text,
  );
}

function singleCastReferenceUrls(state: ProjectState, assetUrlById: Map<string, string>): string[] {
  if (state.cast.length !== 1) return [];
  const ref = state.cast[0]?.ref || "";
  const refUrl = assetUrlById.get(ref) || (/^https?:/.test(ref) ? ref : "");
  return refUrl ? [refUrl] : [];
}

async function singleCastReferenceUrlsWithLibrary(
  state: ProjectState,
  assetUrlById: Map<string, string>,
  userId: string,
): Promise<string[]> {
  const urls = singleCastReferenceUrls(state, assetUrlById);
  if (urls.length || state.cast.length !== 1) return urls;
  const ref = state.cast[0]?.ref || "";
  if (!CHAT_UUID_RE.test(ref)) return [];
  const libraryUrl = await resolveLibraryCharacterImageUrl(ref, userId);
  return libraryUrl ? [libraryUrl] : [];
}

// Image generation flows through fal nano-banana via `falGenerateImage`.

const STOCK_LIBRARY: Array<{ tags: string[]; url: string; label: string }> = [
  {
    tags: ["city", "skyline", "night", "neon", "urban"],
    url: "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1200",
    label: "Neon city skyline at night",
  },
  {
    tags: ["car", "drift", "road", "speed", "highway"],
    url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200",
    label: "Car on open road",
  },
  {
    tags: ["portrait", "face", "person", "studio"],
    url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=1200",
    label: "Studio portrait",
  },
  {
    tags: ["nature", "forest", "trees", "mist", "landscape"],
    url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200",
    label: "Misty forest",
  },
  {
    tags: ["studio", "interior", "warehouse"],
    url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200",
    label: "Open studio interior",
  },
];

function searchStock(query: string, limit: number) {
  const q = query.toLowerCase();
  const scored = STOCK_LIBRARY.map((s) => ({
    s,
    score: s.tags.reduce((acc, t) => acc + (q.includes(t) ? 1 : 0), 0),
  }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 4)));
  return scored.map(({ s }) => ({
    id: nextToolAssetId(),
    kind: "reference" as const,
    mime: "image/jpeg",
    name: `${s.label}.jpg`,
    url: s.url,
    label: s.label,
  }));
}

// The legacy SYSTEM_PROMPT (freeform HTML contract) was dissolved into
// src/lib/agent/prompt/* and the render_turn tool schema (src/lib/agent/ui-schema.ts).

// Inline-edit requests come in three kinds (payloads without `kind` are
// legacy field edits):
//   field — a scene field from the stage-view Ask sidebar (patch-driven)
//   piece — a text piece on a generated card; the reply IS the reworked copy
//   media — an image/video on a generated card; images regenerate in-loop
type InlineEditPayload =
  | {
      kind: "field";
      requestId?: string;
      fieldKey?: string;
      sceneId: string;
      field: "title" | "prompt" | "voPrompt";
      fieldLabel?: string;
      currentValue?: string;
      instruction: string;
    }
  | {
      kind: "piece";
      requestId?: string;
      pieceLabel: string;
      currentValue: string;
      cardTitle?: string;
      instruction: string;
    }
  | {
      kind: "media";
      requestId?: string;
      mediaKind: "image" | "video" | "audio";
      mediaUrl: string;
      cardTitle?: string;
      instruction: string;
    };

type ChatRequestBody = {
  messages?: unknown;
  projectId?: unknown;
  mode?: unknown;
  inlineEdit?: unknown;
};

const INLINE_REWORK_MARKER = "[[inline-rework]] ";

function validateInlineEdit(value: unknown): InlineEditPayload | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const instruction = typeof raw.instruction === "string" ? raw.instruction : "";
  if (!instruction.trim()) return null;
  const requestId = typeof raw.requestId === "string" ? raw.requestId : undefined;
  const kind = raw.kind ?? "field"; // legacy payloads carry no kind

  if (kind === "piece") {
    const pieceLabel = typeof raw.pieceLabel === "string" ? raw.pieceLabel : "";
    if (!pieceLabel) return null;
    return {
      kind: "piece",
      requestId,
      pieceLabel,
      currentValue: typeof raw.currentValue === "string" ? raw.currentValue : "",
      cardTitle: typeof raw.cardTitle === "string" ? raw.cardTitle : undefined,
      instruction,
    };
  }
  if (kind === "media") {
    const mediaKind = raw.mediaKind;
    if (mediaKind !== "image" && mediaKind !== "video" && mediaKind !== "audio") return null;
    const mediaUrl = typeof raw.mediaUrl === "string" ? raw.mediaUrl : "";
    if (!mediaUrl) return null;
    return {
      kind: "media",
      requestId,
      mediaKind,
      mediaUrl,
      cardTitle: typeof raw.cardTitle === "string" ? raw.cardTitle : undefined,
      instruction,
    };
  }
  if (kind !== "field") return null;
  const field = raw.field;
  if (field !== "title" && field !== "prompt" && field !== "voPrompt") return null;
  const sceneId = typeof raw.sceneId === "string" ? raw.sceneId : "";
  if (!sceneId) return null;
  return {
    kind: "field",
    requestId,
    fieldKey: typeof raw.fieldKey === "string" ? raw.fieldKey : `${sceneId}:${field}`,
    sceneId,
    field,
    fieldLabel: typeof raw.fieldLabel === "string" ? raw.fieldLabel : field,
    currentValue: typeof raw.currentValue === "string" ? raw.currentValue : "",
    instruction,
  };
}

function buildInlineEditAddendum(inline: InlineEditPayload | null): string {
  if (!inline) return "";
  if (inline.kind === "piece") {
    return [
      "═════ INLINE EDIT MODE (card piece) ═════",
      "This request came from the on-card inline edit popup, not the main agent shell.",
      "Reply for the popup only. Do NOT emit data-gen-view, data-card, data-options, or any new stage UI.",
      `Piece being edited: ${inline.pieceLabel}${inline.cardTitle ? ` on the card "${inline.cardTitle}"` : ""}`,
      `Current text: ${inline.currentValue}`,
      `User instruction: ${inline.instruction}`,
      "Rework the text per the instruction, keeping roughly the same length and role unless told otherwise.",
      "If this copy clearly corresponds to a project field (a scene's title/prompt/voPrompt, meta, cast), ALSO apply commit_project_patch with that change.",
      "Your ENTIRE final text must be the reworked copy only — no preamble, no quotes, no commentary, no markdown.",
      "══════════════════════════════",
    ].join("\n");
  }
  if (inline.kind === "media") {
    return [
      "═════ INLINE EDIT MODE (card media) ═════",
      "This request came from the on-card inline edit popup, not the main agent shell.",
      "Reply for the popup only. Do NOT emit data-gen-view, data-card, data-options, or any new stage UI.",
      `Media being edited: ${inline.mediaKind}${inline.cardTitle ? ` on the card "${inline.cardTitle}"` : ""}`,
      `Current media URL: ${inline.mediaUrl}`,
      `User instruction: ${inline.instruction}`,
      inline.mediaKind === "image"
        ? "Regenerate the image: call generate_image with an updated prompt reflecting the instruction, passing the current URL in referenceImageUrls so the subject stays consistent. Then reply with one short sentence describing the change."
        : "Queue a new take with run_model_app (pass the current URL in referenceImageUrls where applicable), then reply with one short sentence saying the new take will land when ready.",
      "If the change affects a project field, also apply commit_project_patch.",
      "══════════════════════════════",
    ].join("\n");
  }
  const field = inline.field ?? "prompt";
  const sceneId = inline.sceneId ?? "";
  const label = inline.fieldLabel ?? field;
  const instruction = inline.instruction ?? "";
  const currentValue = inline.currentValue ?? "";
  return [
    "═════ INLINE EDIT MODE ═════",
    "This request came from the field-level inline Ask Agent sidebar, not the main agent shell.",
    "Reply for the sidebar only. Do NOT emit data-gen-view, data-card, data-options, or a new stage-generation UI.",
    "Update exactly one field on exactly one existing scene. Keep every other field and scene unchanged.",
    `Target scene id: ${sceneId}`,
    `Target field: ${field} (${label})`,
    `Current field value: ${currentValue}`,
    `User instruction: ${instruction}`,
    'Apply the change with commit_project_patch using a patch shaped like {"scenes":[{"id":"...","fieldName":"new value"}]}. Use the real field key title, prompt, or voPrompt.',
    "Your final text must be one short sentence summarizing the applied field edit. Do not include markdown headings.",
    "══════════════════════════════",
  ].join("\n");
}

function textOfUIMessage(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

function isInlineEditUIMessage(message: UIMessage): boolean {
  const metadata = (message as UIMessage<{ mode?: string }>).metadata;
  return (
    metadata?.mode === "inline-edit" ||
    textOfUIMessage(message).startsWith(INLINE_REWORK_MARKER) ||
    isLegacyInlinePatchUIMessage(message)
  );
}

function isLegacyInlinePatchUIMessage(message: UIMessage): boolean {
  if (message.role !== "assistant") return false;
  const text = textOfUIMessage(message);
  if (/data-card|data-options|data-gen-view/i.test(text)) return false;
  return (message.parts as Array<{ type?: string; state?: string; output?: unknown }>).some(
    (part) => {
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
    },
  );
}

function mainStageMessages(messages: UIMessage[]): UIMessage[] {
  const main: UIMessage[] = [];
  let inInlineTurn = false;
  for (const message of messages) {
    if (message.role === "user") {
      inInlineTurn = isInlineEditUIMessage(message);
      if (!inInlineTurn) main.push(message);
      continue;
    }
    if (isInlineEditUIMessage(message)) {
      inInlineTurn = true;
      continue;
    }
    if (!inInlineTurn) main.push(message);
  }
  return main;
}

function extractPatchFromText(text: string): unknown | null {
  const m = text.match(/<script[^>]*data-project-patch[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let userId: string;
        try {
          ({ userId } = await requireUser(request));
        } catch (err) {
          return unauthorizedResponse(err instanceof Error ? err.message : "Unauthorized");
        }
        const {
          messages,
          projectId,
          mode,
          inlineEdit: inlineEditRaw,
        } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }
        if (typeof projectId !== "string" || !projectId) {
          return new Response("projectId is required", { status: 400 });
        }
        const inlineEdit = mode === "inline-edit" ? validateInlineEdit(inlineEditRaw) : null;
        if (mode === "inline-edit" && !inlineEdit) {
          return new Response("Valid inlineEdit payload is required", { status: 400 });
        }
        const uiMessages = messages as UIMessage[];
        const modelMessages = inlineEdit
          ? [
              ...mainStageMessages(uiMessages.slice(0, -1)),
              uiMessages[uiMessages.length - 1],
            ].filter(Boolean)
          : mainStageMessages(uiMessages);

        let agentRegistry;
        try {
          agentRegistry = createAgentAppRegistry(await loadAgentSkills());
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[chat] ${message}`);
          return new Response(message, { status: 503 });
        }
        const APP_BY_ID = agentRegistry.appById;
        const builtinSkills = createBuiltinSkills(agentRegistry);
        const getBuiltinSkill = (slugOrId: string) => findBuiltinSkill(builtinSkills, slugOrId);

        // Verify ownership.
        const { data: ownership } = await supabaseAdmin
          .from("projects")
          .select("id")
          .eq("id", projectId)
          .eq("user_id", userId)
          .maybeSingle();
        if (!ownership) {
          return new Response("Project not found", { status: 404 });
        }

        const { data: projectRow, error: projectError } = await supabaseAdmin
          .from("projects")
          .select("project_state, skill")
          .eq("id", projectId)
          .eq("user_id", userId)
          .maybeSingle();
        if (projectError) {
          return new Response(projectError.message, { status: 500 });
        }
        const projectState = (projectRow?.project_state as ProjectState | null) ?? INITIAL_PROJECT;
        const projectSkillSlug = (projectRow?.skill as string | null) ?? null;
        // Resolve skill name: builtin catalog first, then user/community skills table.
        let projectSkillLabel: string | null = null;
        let projectSkillBodyMd: string | null = null;
        if (projectSkillSlug) {
          const builtin = getBuiltinSkill(projectSkillSlug);
          if (builtin) {
            projectSkillLabel = builtin.name;
            projectSkillBodyMd = (builtin as { bodyMd?: string }).bodyMd ?? null;
          } else {
            const { data: skillRow } = await supabaseAdmin
              .from("skills")
              .select("name, body_md")
              .eq("slug", projectSkillSlug)
              .order("version", { ascending: false })
              .limit(1)
              .maybeSingle();
            projectSkillLabel = (skillRow?.name as string | null) ?? null;
            projectSkillBodyMd = (skillRow?.body_md as string | null) ?? null;
          }
        }
        const selectedAppId = projectSkillSlug
          ? APP_BY_ID[projectSkillSlug]
            ? projectSkillSlug
            : ((getBuiltinSkill(projectSkillSlug) as { appRef?: string } | null)?.appRef ?? null)
          : null;
        const selectedAppBodyMd = selectedAppId
          ? (agentRegistry.skillByAppId.get(selectedAppId)?.bodyMd ?? null)
          : null;
        if (selectedAppBodyMd) projectSkillBodyMd = selectedAppBodyMd;
        // A user skill is "chained" when its recipe describes a multi-phase
        // pipeline where a later step must consume an earlier step's output
        // as its reference image. Detect via prose fingerprints; when true,
        // runModelApp will auto-inject the latest project image asset into
        // any video-mode call that arrives with no explicit refs.
        const projectSkillChainsRefs = (() => {
          const md = (projectSkillBodyMd ?? "").toLowerCase();
          if (!md) return false;
          if (/reference\s*:\s*step\s*\d/.test(md)) return true;
          if (/reference\s*:\s*phase\s*\d/.test(md)) return true;
          if (/step\s*\d[^\n]{0,200}\breferenceimageurls\b/.test(md)) return true;
          if (/phase\s*\d[^\n]{0,200}\breferenceimageurls\b/.test(md)) return true;
          if (/via\s+`?referenceimageurls`?/.test(md) && /step\s*[12]|phase\s*[12]/.test(md))
            return true;
          return false;
        })();

        const assetUrlById = new Map(projectState.assets.map((asset) => [asset.id, asset.url]));

        // Persist the latest user message before streaming.
        const lastUser = uiMessages[uiMessages.length - 1];
        if (!inlineEdit && lastUser?.role === "user" && lastUser.id) {
          await supabaseAdmin.from("project_messages").upsert(
            {
              id: lastUser.id,
              project_id: projectId,
              role: "user",
              parts: lastUser.parts as unknown as never,
            },
            { onConflict: "id" },
          );
        }
        // Real agent brain: Claude Sonnet 4.5 via direct Anthropic.
        // Why not Lovable Gateway / Gemini Flash? Flash was fast but kept losing
        // project context across turns — re-asking aspect ratio, forgetting
        // picked model, ignoring the state block. Claude Sonnet 4.5 actually
        // reads the PROJECT MEMORY block and respects the decisions log.
        const sanitizeKey = (name: string, raw: string | undefined): string | undefined => {
          if (!raw) return undefined;
          const v = raw.trim();
          for (let i = 0; i < v.length; i++) {
            const c = v.charCodeAt(i);
            if (c > 255 || c < 0x20) {
              console.error(
                `[chat] ${name} contains invalid character (code ${c}) at index ${i}. Ignoring this secret — please re-set it without copy-paste artifacts (smart quotes, Cyrillic look-alikes, or line breaks).`,
              );
              return undefined;
            }
          }
          return v;
        };
        const anthropicKey = sanitizeKey("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
        const key = sanitizeKey("LOVABLE_API_KEY", process.env.LOVABLE_API_KEY);

        // Circuit breaker: when Anthropic 429s, cool down for 60s and fall
        // back to Lovable Gateway so users don't get "Failed after 3 attempts".
        const anthropicHot = anthropicKey && Date.now() > getAnthropicCooldownUntil();
        let model;
        let usingFallback = false;
        if (anthropicHot) {
          const anthropic = createAnthropic({ apiKey: anthropicKey! });
          model = anthropic("claude-sonnet-4-5-20250929");
        } else if (key) {
          const gateway = createLovableAiGatewayProvider(key);
          model = gateway("google/gemini-3-flash-preview");
          usingFallback = !!anthropicKey;
        } else if (anthropicKey) {
          const anthropic = createAnthropic({ apiKey: anthropicKey });
          model = anthropic("claude-sonnet-4-5-20250929");
        } else {
          return new Response(
            "AI is not configured. Add ANTHROPIC_API_KEY (preferred) or LOVABLE_API_KEY to .env.local, then restart the local server.",
            { status: 500 },
          );
        }
        if (usingFallback) {
          console.warn("[chat] Anthropic cooling down, using Gemini fallback");
        }

        // Turn guard — tracks media produced by tools this turn and
        // validates/repairs the final render_turn payload (C4 invariants).
        const guard = createTurnGuard();

        const tools: Record<string, unknown> = {
          render_turn: tool({
            description:
              "REQUIRED FINAL STEP — call exactly once to end your turn. The payload IS the UI the user sees on the center stage (there is no other reply channel). Rules: at most ONE interactive block (options | form | upload); a stage block carries its own actions and must not be paired with an interactive block; media URLs must come from tool results or PROJECT MEMORY. If this returns { ok: false, errors }, fix the payload and call it again.",
            inputSchema: RenderTurnSchema,
            execute: async (turn) => {
              const res = guard.finalize(turn as RenderTurn);
              if (!res.ok) return { ok: false, errors: res.errors };
              return { ok: true, turn: res.turn };
            },
          }),
          get_app_playbook: tool({
            description:
              "Fetch the full step playbook for a catalog app (wizard steps + exact inputs, or model params). Use when detouring into an app that isn't the project's selected app.",
            inputSchema: z.object({ appId: z.string().min(2).max(120) }),
            execute: async ({ appId }) => {
              const playbook = renderAppPlaybook(agentRegistry, appId);
              return playbook ? { ok: true, playbook } : { error: `Unknown appId: ${appId}` };
            },
          }),
          generate_image: tool({
            description:
              "Generate a single image (mood, character, shot keyframe, logo). Returns an asset descriptor already attached to project state. Pass sceneId when generating an image FOR a specific shot — it will be stored as a keyframe and auto-linked to that shot's thumb. If editing an existing cast/library character, name that character in the prompt; the server auto-injects their current portrait reference and stores the result as a likeness attached to that cast member.",
            inputSchema: z.object({
              prompt: z.string().min(3).max(800),
              kind: z
                .enum([
                  "likeness",
                  "logo",
                  "reference",
                  "keyframe",
                  "voice",
                  "audio",
                  "video",
                  "other",
                ])
                .optional(),
              label: z.string().max(120).optional(),
              sceneId: z.string().min(1).max(120).optional(),
              referenceAssetIds: z.array(z.string().min(1).max(120)).max(8).optional(),
              referenceImageUrls: z.array(z.string().url()).max(8).optional(),
            }),
            execute: async ({
              prompt,
              kind,
              label,
              sceneId,
              referenceAssetIds,
              referenceImageUrls,
            }) => {
              try {
                // When the agent is generating an image FOR a specific shot,
                // force kind=keyframe so it stays out of the References strip,
                // and we'll auto-patch scene.thumb/status below.
                const matchedScene = sceneId
                  ? projectState.scenes.find((s) => s.id === sceneId)
                  : undefined;
                let matchedCast = projectState.cast.find((c) => {
                  const name = normalizeNameForMatch(c.name || "");
                  return name && normalizeNameForMatch(prompt).includes(name);
                });
                if (
                  !matchedCast &&
                  looksLikeCharacterAppearanceEdit(prompt) &&
                  projectState.cast.length === 1
                ) {
                  matchedCast = projectState.cast[0];
                }
                const resolved = await resolveRenderReferences({
                  state: projectState,
                  prompt,
                  mode: "image",
                  assetUrlById,
                  userId,
                  explicitUrls: referenceImageUrls,
                  explicitAssetIds: referenceAssetIds,
                });
                const resolvedReferenceUrls = resolved.refs;
                console.log("[refs] generate_image", {
                  intent: resolved.intent,
                  count: resolvedReferenceUrls.length,
                  matched: resolved.matched.names,
                });
                const effectiveKind = matchedScene
                  ? "keyframe"
                  : resolved.intent === "character" || matchedCast
                    ? "likeness"
                    : resolved.intent === "logo"
                      ? "logo"
                      : (kind ?? "reference");
                if (
                  resolvedReferenceUrls.length === 0 &&
                  !matchedScene &&
                  looksLikeCharacterAppearanceEdit(prompt) &&
                  projectState.cast.length > 0
                ) {
                  return {
                    error:
                      "Character appearance edits require the existing character portrait as a reference. Ask the user which cast member to edit or select the Library character again before generating.",
                  };
                }
                const promptWithRefs =
                  prompt + promptSuffixForIntent(resolved.intent, resolvedReferenceUrls.length > 0);
                const sourceUrl = await falGenerateImage({
                  prompt: promptWithRefs,
                  aspect: projectState.meta.aspectRatio || "16:9",
                  referenceImageUrls: resolvedReferenceUrls,
                });
                try {
                  const stored = await downloadAndStoreUrl({
                    projectId,
                    userId,
                    sourceUrl,
                    kind: effectiveKind,
                    label,
                    fallbackMime: "image/png",
                  });
                  return {
                    id: stored.id,
                    kind: effectiveKind,
                    mime: stored.mime,
                    name: (label ?? prompt.slice(0, 40)) + ".png",
                    url: stored.url,
                    label,
                    attachedTo: matchedCast?.id,
                    proposedForCast: matchedCast
                      ? { id: matchedCast.id, name: matchedCast.name }
                      : undefined,
                    // If wired to a shot, ship a partial scenes patch so the
                    // client commits scene.thumb + status without relying on
                    // the agent emitting a second JSON patch. Character
                    // appearance edits deliberately do NOT auto-patch cast.ref:
                    // the agent must ask the user to approve "Use for this
                    // film" or "Save to Library too" first.
                    patch: matchedScene
                      ? {
                          scenes: [{ id: matchedScene.id, thumb: stored.url, status: "ready" }],
                        }
                      : undefined,
                  };
                } catch (e) {
                  console.error("[chat] downloadAndStoreUrl failed:", e);
                  return {
                    error: e instanceof Error ? e.message : String(e),
                  };
                }
              } catch (err) {
                return {
                  error: err instanceof Error ? err.message : String(err),
                };
              }
            },
          }),
          // -------- Agent v5 · Phase 2 — Anchor system --------
          // "Anchors" are the reviewable keyframe(s) for a shot. Generate them
          // FIRST, let the user approve, then hand off to the producer, which
          // passes the anchor URL(s) as referenceImageUrls on the video render
          // so the shot stays on-model.
          generate_scene_anchor: tool({
            description:
              "Generate an anchor (first-frame keyframe) for a specific shot so the user can review it BEFORE the expensive video render. Persists the image as a keyframe asset, sets scene.thumb, and appends the asset id to scene.anchorAssetIds with anchorApproved=false (awaits explicit approval via approve_scene_anchor). Pass frame='last' to append a last-frame anchor for start↔end guided renders.",
            inputSchema: z.object({
              sceneId: z.string().min(1).max(120),
              prompt: z.string().min(3).max(800),
              frame: z.enum(["first", "last"]).optional(),
              referenceAssetIds: z.array(z.string().min(1).max(120)).max(8).optional(),
              referenceImageUrls: z.array(z.string().url()).max(8).optional(),
            }),
            execute: async ({ sceneId, prompt, frame, referenceAssetIds, referenceImageUrls }) => {
              try {
                const scene = projectState.scenes.find((s) => s.id === sceneId);
                if (!scene) return { error: `Unknown sceneId: ${sceneId}` };
                const resolved = await resolveRenderReferences({
                  state: projectState,
                  prompt,
                  mode: "image",
                  assetUrlById,
                  userId,
                  explicitUrls: referenceImageUrls,
                  explicitAssetIds: referenceAssetIds,
                });
                const promptWithRefs =
                  prompt + promptSuffixForIntent(resolved.intent, resolved.refs.length > 0);
                const sourceUrl = await falGenerateImage({
                  prompt: promptWithRefs,
                  aspect: projectState.meta.aspectRatio || "16:9",
                  referenceImageUrls: resolved.refs,
                });
                const stored = await downloadAndStoreUrl({
                  projectId,
                  userId,
                  sourceUrl,
                  kind: "keyframe",
                  label: `Anchor ${frame ?? "first"} · scene ${scene.n}`,
                  fallbackMime: "image/png",
                });
                const nextAnchors = [...(scene.anchorAssetIds ?? [])];
                if (frame === "last") {
                  if (nextAnchors.length === 0) nextAnchors.push(""); // reserve slot 0
                  nextAnchors[1] = stored.id;
                } else {
                  nextAnchors[0] = stored.id;
                }
                return {
                  id: stored.id,
                  url: stored.url,
                  sceneId,
                  frame: frame ?? "first",
                  patch: {
                    scenes: [
                      {
                        id: sceneId,
                        thumb: stored.url,
                        status: "drafting" as const,
                        anchorAssetIds: nextAnchors.filter(Boolean),
                        anchorApproved: false,
                      },
                    ],
                  },
                  message: `Anchor generated for scene ${scene.n}. YOU MUST render this image in THIS SAME TURN as a media-led card: <img src="${stored.url}" class="w-full h-auto rounded-2xl" /> with Approve / Regenerate / Tweak prompt buttons BELOW it. Do NOT end this turn with text-only options — the user cannot see the image unless you emit the <img> tag with the URL above. Do NOT call any video render until the user explicitly approves.`,
                };
              } catch (err) {
                return { error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          approve_scene_anchor: tool({
            description:
              "Mark a scene's anchor(s) as user-approved so the producer may render the shot. Emits a patch that sets scene.anchorApproved=true. Only call after the user explicitly approves the anchor image in chat.",
            inputSchema: z.object({
              sceneId: z.string().min(1).max(120),
            }),
            execute: async ({ sceneId }) => {
              const scene = projectState.scenes.find((s) => s.id === sceneId);
              if (!scene) return { error: `Unknown sceneId: ${sceneId}` };
              if (!scene.anchorAssetIds?.length) {
                return {
                  error: `Scene ${sceneId} has no anchors yet. Generate one with generate_scene_anchor first.`,
                };
              }
              return {
                sceneId,
                approved: true,
                patch: { scenes: [{ id: sceneId, anchorApproved: true }] },
                message: `Anchor approved for scene ${scene.n}. Producer may now render this shot.`,
              };
            },
          }),
          tool_search: tool({
            description:
              "Discover Default-mode app functions you can invoke (short_film, product_ad, kling, world_cup, character, library, tts, render, export, community, pika, generate). Each match includes name, group, description, the JSON Schema of its input (`inputSchema`), and an `example` arg object — build your `tool_invoke` arguments to satisfy that schema. Filter by `group` when you know the app. Call this before `tool_invoke` for anything beyond the eager tools (generate_image, run_model_app, commit_project_patch, select_app).",
            inputSchema: z.object({
              query: z.string().max(120).optional(),
              group: z.string().max(40).optional(),
              limit: z.number().int().min(1).max(30).optional(),
            }),
            execute: async ({ query, group, limit }) => {
              const matches = searchAgentTools({ query, group, limit });
              return { matches, groups: listAgentToolGroups() };
            },
          }),
          tool_invoke: tool({
            description:
              "Invoke a Default-mode app function discovered via `tool_search`. Pass the exact `name` and a JSON `arguments` object matching that tool's input. Runs the SAME server function that powers the Default UI (RLS-scoped to this user).",
            inputSchema: z.object({
              name: z.string().min(2).max(120),
              arguments: z.record(z.string(), z.unknown()).optional(),
            }),
            execute: async ({ name, arguments: args }) => {
              const t = findAgentTool(name);
              if (!t) return { error: `Unknown tool: ${name}` };
              try {
                const parsed = t.inputSchema.parse(args ?? {});
                const result = await t.execute(parsed, { projectId, userId });
                return { ok: true, result };
              } catch (err) {
                console.error(`[chat] tool_invoke ${name} failed:`, err);
                return { ok: false, error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          commit_project_patch: tool({
            description:
              "Apply a project patch (same schema as the <script data-project-patch> block) programmatically. Pass a structured `patch` object — include only the slices you are changing.",
            inputSchema: z.object({
              // Defensive back-compat: if the model passes a JSON-encoded
              // string (the old patch_json shape), parse it before validating.
              patch: z
                .preprocess((value) => {
                  if (typeof value === "string") {
                    try {
                      return JSON.parse(value);
                    } catch {
                      return value;
                    }
                  }
                  return value;
                }, ProjectPatchSchema)
                .describe("Structured project patch object"),
            }),
            execute: async ({ patch }) => {
              // Persist immediately — the patch echo to the client is for UI
              // sync, but the source of truth is the DB.
              try {
                const { data: row } = await supabaseAdmin
                  .from("projects")
                  .select("project_state, title")
                  .eq("id", projectId)
                  .eq("user_id", userId)
                  .maybeSingle();
                const current = (row?.project_state as ProjectState | null) ?? INITIAL_PROJECT;
                const next = applyPatch(current, patch as never);
                const incomingTitle =
                  typeof (patch as { meta?: { title?: string } })?.meta?.title === "string"
                    ? (patch as { meta?: { title?: string } }).meta!.title!.trim()
                    : "";
                const newTitle =
                  incomingTitle || next.meta.title || row?.title || "Untitled project";
                await supabaseAdmin
                  .from("projects")
                  .update({
                    project_state: next as unknown as never,
                    title: newTitle,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", projectId)
                  .eq("user_id", userId);
              } catch (err) {
                console.error("[chat] commit_project_patch persist failed:", err);
              }
              return { ok: true, patch };
            },
          }),
          note_decision: tool({
            description:
              "Record a durable decision into PROJECT MEMORY so future turns (and reloads) remember it. Use for choices that don't fit cleanly into meta/cast/scenes/assets: which model was picked for renders, that the user approved Concept B, that they rejected a beat, audio mode, etc. Keep `text` to 1–2 sentences, decision-shaped (\"User picked Seedance 2.0 Mini for all shots\", not \"Talked about models\"). `tag` is a short bucket like 'model' | 'concept' | 'audio' | 'aspect' | 'style'.",
            inputSchema: z.object({
              text: z.string().min(4).max(600),
              tag: z.string().max(40).optional(),
            }),
            execute: async ({ text, tag }) => {
              try {
                const { data: row } = await supabaseAdmin
                  .from("projects")
                  .select("project_state")
                  .eq("id", projectId)
                  .eq("user_id", userId)
                  .maybeSingle();
                const current = (row?.project_state as ProjectState | null) ?? INITIAL_PROJECT;
                const note = { at: new Date().toISOString(), text: text.trim(), tag };
                const next = applyPatch(current, { notesAppend: [note] } as never);
                await supabaseAdmin
                  .from("projects")
                  .update({
                    project_state: next as unknown as never,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", projectId)
                  .eq("user_id", userId);
                return { ok: true, note };
              } catch (err) {
                console.error("[chat] note_decision failed:", err);
                return { ok: false, error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          save_cut: tool({
            description:
              'EDITOR ONLY. Snapshot the current timeline (order + tracks) as a named cut so the user can branch/compare edits. Use for milestones the user asked to preserve: "save this as v1", "lock the 30-sec cut", "branch before I try the new intro". The saved cut becomes the active_cut_id, but the timeline itself is unchanged (a checkpoint). Return the new cut id.',
            inputSchema: z.object({
              name: z.string().min(1).max(120),
              parentCutId: z.string().uuid().nullable().optional(),
            }),
            execute: async ({ name, parentCutId }) => {
              try {
                const { data: proj } = await supabaseAdmin
                  .from("projects")
                  .select("project_state, active_cut_id")
                  .eq("id", projectId)
                  .eq("user_id", userId)
                  .maybeSingle();
                const state = (proj?.project_state as ProjectState | null) ?? INITIAL_PROJECT;
                const timeline = state.timeline ?? { order: [], tracks: [], seeded: false };
                const parent = parentCutId ?? (proj?.active_cut_id as string | null) ?? null;
                const { data: row, error } = await supabaseAdmin
                  .from("project_cuts")
                  .insert({
                    project_id: projectId,
                    name,
                    parent_cut_id: parent,
                    timeline: timeline as unknown as never,
                  })
                  .select("id, name, parent_cut_id, created_at")
                  .single();
                if (error || !row) return { ok: false, error: error?.message ?? "insert failed" };
                await supabaseAdmin
                  .from("projects")
                  .update({ active_cut_id: row.id, updated_at: new Date().toISOString() })
                  .eq("id", projectId)
                  .eq("user_id", userId);
                return { ok: true, cut: row };
              } catch (err) {
                return { ok: false, error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          switch_cut: tool({
            description:
              'EDITOR ONLY. Swap the project\'s live timeline to a previously saved cut. Use when the user says "go back to v1", "show me the 30-sec cut", "revert". Cast / scenes / assets stay put — only the timeline changes. Pass the cutId returned by save_cut (call list_project_cuts via tool_search if you need to look it up).',
            inputSchema: z.object({ cutId: z.string().uuid() }),
            execute: async ({ cutId }) => {
              try {
                const { data: cut, error } = await supabaseAdmin
                  .from("project_cuts")
                  .select("id, timeline")
                  .eq("id", cutId)
                  .eq("project_id", projectId)
                  .maybeSingle();
                if (error || !cut) return { ok: false, error: error?.message ?? "cut not found" };
                const { data: proj } = await supabaseAdmin
                  .from("projects")
                  .select("project_state")
                  .eq("id", projectId)
                  .eq("user_id", userId)
                  .maybeSingle();
                const state = (proj?.project_state as ProjectState | null) ?? INITIAL_PROJECT;
                const timeline = (cut.timeline as unknown as ProjectState["timeline"]) ?? {
                  order: [],
                  tracks: [],
                  seeded: false,
                };
                const next = applyPatch(state, { timeline });
                await supabaseAdmin
                  .from("projects")
                  .update({
                    project_state: next as unknown as never,
                    active_cut_id: cut.id,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", projectId)
                  .eq("user_id", userId);
                return { ok: true, cutId: cut.id };
              } catch (err) {
                return { ok: false, error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          select_app: tool({
            description:
              "Announce which app from the catalog you're routing this project into (wizard or model). Call this ONCE per project as soon as you've decided which app fits, BEFORE serving the first wizard step. The UI shows a small 'Using <app>' chip in chat so the user sees the routing decision. Do not call this for ad-hoc mid-flow detours.",
            inputSchema: z.object({
              appId: z.string().min(2).max(120),
              reason: z.string().max(280).optional(),
            }),
            execute: async ({ appId, reason }) => {
              const app = APP_BY_ID[appId];
              if (!app) return { error: `Unknown appId: ${appId}` };
              // Persist the routing decision so later turns inject this
              // app's full playbook (and the phase machine sees a selection).
              try {
                await supabaseAdmin
                  .from("projects")
                  .update({ skill: appId })
                  .eq("id", projectId)
                  .eq("user_id", userId);
              } catch {
                // best-effort tagging; never block routing on it
              }
              return { ok: true, appId, label: app.label, kind: app.kind, reason: reason ?? null };
            },
          }),
          run_model_app: tool({
            description:
              "Kick off a single-shot MODEL app render (Seedance, Veo, Nano Banana, ElevenLabs TTS, etc.). Pass the appId (e.g. 'model-seedance-2-mini') and the prompt. Optional: aspectRatio ('16:9' | '9:16' | '1:1'), duration in seconds (video only), referenceImageUrls. THIS IS NON-BLOCKING — it submits the job, returns { jobId, status: 'queued' } in ~1s, and the client streams completion in via Realtime. Do NOT wait on the result inside this turn; acknowledge briefly (\"Kicked off — I'll surface it when ready\") and either move on or stop. The finished asset will appear in PROJECT MEMORY on the next turn. If editing an existing cast/library character, name them in the prompt; the server auto-injects their portrait reference.",
            inputSchema: z.object({
              appId: z.string().min(2).max(120),
              prompt: z.string().min(2).max(4000),
              aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
              duration: z.number().int().min(2).max(20).optional(),
              referenceImageUrls: z.array(z.string().url()).max(8).optional(),
            }),
            execute: async ({ appId, prompt, aspectRatio, duration, referenceImageUrls }) =>
              runModelApp({ appId, prompt, aspectRatio, duration, referenceImageUrls }),
          }),
          run_skill: tool({
            description:
              "Unified execution primitive (Agent v5). Run any Skill from the registry by slug — model skills (e.g. 'seedance-2-pro', 'nano-banana-edit') and app skills (e.g. 'short-film', 'character-creator') share this one tool. For MODEL skills: pass { slug, prompt, aspectRatio?, duration?, referenceImageUrls? } and this behaves like run_model_app (non-blocking, returns { jobId, status: 'queued' }). For APP skills: pass { slug } and this behaves like select_app, announcing the routing decision — then serve the app's first wizard step. Prefer this over run_model_app / select_app going forward; those remain for back-compat.",
            inputSchema: z.object({
              slug: z.string().min(2).max(120),
              prompt: z.string().min(2).max(4000).optional(),
              aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
              duration: z.number().int().min(2).max(20).optional(),
              referenceImageUrls: z.array(z.string().url()).max(8).optional(),
              reason: z.string().max(280).optional(),
            }),
            execute: async ({
              slug,
              prompt,
              aspectRatio,
              duration,
              referenceImageUrls,
              reason,
            }) => {
              let skill = getBuiltinSkill(slug);
              if (!skill) {
                // Try user skill from DB (author's private or public).
                const { data: row } = await supabaseAdmin
                  .from("skills")
                  .select("*")
                  .eq("slug", slug)
                  .order("version", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (row) {
                  const manifest = (row.manifest ?? {}) as {
                    model?: string;
                    inputs?: unknown[];
                    steps?: string[];
                  };
                  skill = {
                    id: row.id,
                    slug: row.slug,
                    version: row.version,
                    source: "user",
                    name: row.name,
                    oneLiner: row.one_liner ?? "",
                    manifest: manifest as never,
                    bodyMd: row.body_md ?? undefined,
                    appRef: manifest.model ? `model-${manifest.model}` : undefined,
                  } as never;
                }
              }
              if (!skill) return { error: `Unknown skill: ${slug}` };
              // Keep projects.skill in sync with the actually-invoked skill so
              // downstream tagging (community shares, showcase pages) reflects
              // the app the user is really using — not whichever skill they
              // originally committed to when creating the project.
              try {
                await supabaseAdmin
                  .from("projects")
                  .update({ skill: slug })
                  .eq("id", projectId)
                  .eq("user_id", userId);
              } catch {
                // best-effort; do not block skill execution on tagging
              }
              if (skill.source === "app") {
                const app = skill.appRef ? APP_BY_ID[skill.appRef] : undefined;
                if (!app) return { error: `Skill '${slug}' has no backing app` };
                return {
                  ok: true,
                  source: "app" as const,
                  slug,
                  appId: app.id,
                  label: app.label,
                  kind: app.kind,
                  reason: reason ?? null,
                };
              }
              if (skill.source === "model") {
                if (!prompt) return { error: `Model skill '${slug}' requires 'prompt'` };
                const appId = skill.appRef;
                if (!appId) return { error: `Skill '${slug}' has no backing model app` };
                const res = await runModelApp({
                  appId,
                  prompt,
                  aspectRatio,
                  duration,
                  referenceImageUrls,
                });
                return { source: "model" as const, slug, ...res };
              }
              if (skill.source === "user") {
                // Load bundled reference files (skill_assets) and inline them
                // as signed URLs so the agent can pass them as referenceImageUrls
                // or reason about attached docs/zips.
                const skillAssetUrls: Array<{ name: string; mime: string; url: string }> = [];
                try {
                  const { listSkillAssets } = await import("@/lib/skills/skills.functions");
                  const listed = await listSkillAssets({ data: { skillId: skill.id } });
                  for (const a of listed.assets) {
                    if (!a.url) continue;
                    skillAssetUrls.push({ name: a.name, mime: a.mime, url: a.url });
                  }
                } catch {
                  // best-effort — proceed without attachments if listing fails
                }
                const imageRefs = skillAssetUrls
                  .filter((a) => a.mime.startsWith("image/"))
                  .map((a) => a.url);
                const combinedRefs = [...(referenceImageUrls ?? []), ...imageRefs];

                const manifest = skill.manifest as { model?: string };
                const baseModel = manifest.model;
                const attachmentsBlock = skillAssetUrls.length
                  ? `\n\n[Skill attachments]\n${skillAssetUrls
                      .map((a) => `- ${a.name} (${a.mime}) → ${a.url}`)
                      .join("\n")}`
                  : "";
                if (baseModel && prompt) {
                  const appId = `model-${baseModel}`;
                  if (!APP_BY_ID[appId]) {
                    return {
                      source: "user" as const,
                      slug,
                      recipe: skill.bodyMd ?? null,
                      attachments: skillAssetUrls,
                      note: `Base model '${baseModel}' not in registry — follow the recipe manually.`,
                    };
                  }
                  const composedPrompt = skill.bodyMd
                    ? `[Skill: ${skill.name}]\n${skill.bodyMd}${attachmentsBlock}\n\n---\nUser input: ${prompt}`
                    : `${prompt}${attachmentsBlock}`;
                  const res = await runModelApp({
                    appId,
                    prompt: composedPrompt,
                    aspectRatio,
                    duration,
                    referenceImageUrls: combinedRefs.length ? combinedRefs : undefined,
                  });
                  return { source: "user" as const, slug, attachments: skillAssetUrls, ...res };
                }
                return {
                  source: "user" as const,
                  slug,
                  name: skill.name,
                  recipe: skill.bodyMd ?? null,
                  attachments: skillAssetUrls,
                  guidance:
                    "Follow this recipe step by step. Call run_skill again with the base-model slug for each generation step, and pass the attachment URLs as referenceImageUrls where appropriate.",
                };
              }
              return {
                error: `Skill source '${(skill as { source: string }).source}' not runnable server-side yet`,
              };
            },
          }),
          save_skill: tool({
            description:
              "Bottle the current project's successful approach into a reusable USER SKILL. Use after the user says something like 'save this as a skill', 'remember how we did X', or when a recipe is clearly reusable across projects. BEFORE calling this tool you MUST have run a skill-build confirmation turn that got the user to confirm: (1) the phase list, (2) the EXACT pinned model slug for each phase (no vague 'best image model' — pin it), (3) the chaining wiring for every phase after the first (what URL flows into referenceImageUrls) and that aspect ratio is propagated, (4) which inputs the user supplies on each run, and (5) a marketing cover asset (hero image or video shown on the Skills gallery card) — pass its project-asset id as coverAssetId. Only omit coverAssetId if the user explicitly declines to add one. The bodyMd MUST literally reflect the confirmed models and chaining: one 'Model:' line and one 'Reference:' line per phase (e.g. 'Reference: user selfie via referenceImageUrls' for Phase 1, 'Reference: Step 1 image via referenceImageUrls' for Phase 2), plus an explicit aspect ratio per phase — otherwise the video phase will silently drop the likeness. You may also attach REFERENCE FILES (images, videos, zips, PDFs, docs) as attachedAssetIds — the agent will re-load these every time this skill is used, so include anything the recipe depends on (reference art, product logo, style docs, .zip bundles, etc.).",
            inputSchema: z.object({
              slug: z
                .string()
                .min(2)
                .max(64)
                .regex(/^[a-z0-9-]+$/, "lowercase-hyphenated"),
              name: z.string().min(2).max(80),
              oneLiner: z.string().min(4).max(200),
              bodyMd: z.string().min(20).max(6000),
              baseModel: z.string().max(120).optional(),
              category: z.string().max(60).optional(),
              tags: z.array(z.string().max(40)).max(8).optional(),
              visibility: z.enum(["private", "unlisted", "public"]).optional(),
              coverAssetId: z
                .string()
                .uuid()
                .optional()
                .describe(
                  "Project asset id (image or video) to use as the marketing cover on the Skills gallery card. Ask the user to pick or upload one before calling.",
                ),
              attachedAssetIds: z
                .array(z.string().uuid())
                .max(20)
                .optional()
                .describe(
                  "Project asset ids for reference files bundled with this skill (references, brand assets, zips, PDFs, docs). Re-inlined every time the skill is used.",
                ),
            }),
            execute: async ({
              slug,
              name,
              oneLiner,
              bodyMd,
              baseModel,
              category,
              tags,
              visibility,
              coverAssetId,
              attachedAssetIds,
            }) => {
              if (getBuiltinSkill(slug)) {
                return { error: `Slug '${slug}' is reserved by a built-in skill. Pick another.` };
              }
              const manifest = {
                inputs: [
                  { key: "prompt", kind: "text", label: "Prompt", long: true, required: true },
                ],
                ...(baseModel ? { model: baseModel } : {}),
              };
              // Validate cover + attachment assets belong to this project.
              let coverId: string | null = null;
              if (coverAssetId) {
                const { data: assetRow } = await supabaseAdmin
                  .from("project_assets")
                  .select("id, project_id")
                  .eq("id", coverAssetId)
                  .maybeSingle();
                if (assetRow && assetRow.project_id === projectId) coverId = assetRow.id;
              }
              const validAttachmentIds: string[] = [];
              if (attachedAssetIds?.length) {
                const { data: attachRows } = await supabaseAdmin
                  .from("project_assets")
                  .select("id, project_id")
                  .in("id", attachedAssetIds);
                for (const r of attachRows ?? []) {
                  if (r.project_id === projectId) validAttachmentIds.push(r.id as string);
                }
              }
              const { data: existing } = await supabaseAdmin
                .from("skills")
                .select("id, version")
                .eq("slug", slug)
                .eq("author_id", userId)
                .order("version", { ascending: false })
                .limit(1)
                .maybeSingle();
              const payload = {
                slug,
                name,
                one_liner: oneLiner,
                source: "user" as const,
                author_id: userId,
                visibility: visibility ?? "private",
                manifest: manifest as never,
                body_md: bodyMd,
                category: category ?? null,
                tags: tags ?? [],
                cover_asset_id: coverId,
              };
              let skillRowId: string;
              let result: Record<string, unknown>;
              if (existing) {
                const { data, error } = await supabaseAdmin
                  .from("skills")
                  .update({ ...payload, version: (existing.version ?? 1) + 1 })
                  .eq("id", existing.id)
                  .select("id, slug, version, cover_asset_id")
                  .single();
                if (error) return { error: error.message };
                skillRowId = data.id as string;
                result = { ok: true, updated: true, coverSaved: !!coverId, ...data };
              } else {
                const { data, error } = await supabaseAdmin
                  .from("skills")
                  .insert({ ...payload, version: 1 })
                  .select("id, slug, version, cover_asset_id")
                  .single();
                if (error) return { error: error.message };
                skillRowId = data.id as string;
                result = { ok: true, created: true, coverSaved: !!coverId, ...data };
              }
              if (validAttachmentIds.length) {
                // Refresh attachments: wipe and re-insert in the order provided.
                await supabaseAdmin.from("skill_assets").delete().eq("skill_id", skillRowId);
                await supabaseAdmin.from("skill_assets").insert(
                  validAttachmentIds.map((assetId, i) => ({
                    skill_id: skillRowId,
                    asset_id: assetId,
                    role: "reference",
                    sort_order: i,
                  })),
                );
                (result as { attachmentsSaved?: number }).attachmentsSaved =
                  validAttachmentIds.length;
              }
              return result;
            },
          }),
        };

        async function runModelApp(args: {
          appId: string;
          prompt: string;
          aspectRatio?: "16:9" | "9:16" | "1:1";
          duration?: number;
          referenceImageUrls?: string[];
        }): Promise<Record<string, unknown>> {
          const { appId, prompt, aspectRatio, duration, referenceImageUrls } = args;
          const app = APP_BY_ID[appId];
          if (!app || app.kind !== "model" || !app.model || !app.mode) {
            return { error: `Unknown model app: ${appId}` };
          }
          const appModel: string = app.model;
          const appMode = app.mode;
          // Anchor gate (enforced in code, not prose): a video render that
          // targets a specific scene requires that scene's anchor to be
          // user-approved first — unless the user explicitly opted out via a
          // "skip-anchors" decision note.
          if (appMode === "video") {
            const skipAnchors = (projectState.notes ?? []).some(
              (n) => n.tag === "skip-anchors" || /skip (?:the )?anchors?/i.test(n.text ?? ""),
            );
            if (!skipAnchors) {
              const promptNorm = prompt.toLowerCase();
              const target = projectState.scenes.find(
                (s) =>
                  (s.id && promptNorm.includes(s.id.toLowerCase())) ||
                  (s.title && s.title.length > 3 && promptNorm.includes(s.title.toLowerCase())),
              );
              if (target && !target.anchorApproved) {
                return {
                  error: `Scene "${target.title || target.id}" has no approved anchor. Call generate_scene_anchor({ sceneId: "${target.id}" }), show the image, and get approval (approve_scene_anchor) before rendering this shot — or, if the user asked to skip anchors, log note_decision with tag "skip-anchors" first.`,
                };
              }
            }
          }
          try {
            const aspect = normalizeAspect(aspectRatio ?? projectState.meta.aspectRatio ?? "16:9");
            let matchedCast = projectState.cast.find((c) => {
              const name = normalizeNameForMatch(c.name || "");
              return name && normalizeNameForMatch(prompt).includes(name);
            });
            if (
              !matchedCast &&
              looksLikeCharacterAppearanceEdit(prompt) &&
              projectState.cast.length === 1
            ) {
              matchedCast = projectState.cast[0];
            }
            const resolved = await resolveRenderReferences({
              state: projectState,
              prompt,
              mode: appMode,
              assetUrlById,
              userId,
              explicitUrls: referenceImageUrls,
            });
            let refs = resolved.refs;
            // Chained-skill guardrail: on the video phase of a two-phase
            // image→video recipe, seedance-2.0/reference-to-video treats
            // multiple reference_images as DIFFERENT subjects to composite,
            // not as multiple views of the same person. Blending the Phase 1
            // stylized portrait with the user's raw library selfie averages
            // the two faces and the likeness drifts. For chained recipes we
            // deliberately narrow to a SINGLE reference — the most recent
            // project image (the Phase 1 output) — unless the caller passed
            // refs explicitly.
            if (
              appMode === "video" &&
              projectSkillChainsRefs &&
              !(referenceImageUrls && referenceImageUrls.length)
            ) {
              const imgAsset = [...projectState.assets]
                .filter((a) => a.mime?.startsWith("image/") && /^https?:/.test(a.url))
                .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
              if (imgAsset?.url) {
                refs = [imgAsset.url];
                console.log("[refs] chained-skill narrowed to Phase-1 output only", {
                  slug: projectSkillSlug,
                  assetId: imgAsset.id,
                  droppedFromResolver: resolved.refs.length,
                });
              }
            }
            console.log("[refs] run_model_app", {
              appId,
              baseModel: appModel,
              mode: appMode,
              intent: resolved.intent,
              count: refs.length,
              matched: resolved.matched.names,
            });

            if (
              !refs.length &&
              (appMode === "image" || appMode === "video") &&
              looksLikeCharacterAppearanceEdit(prompt) &&
              projectState.cast.length > 0
            ) {
              return {
                error:
                  "Character appearance edits require the existing character portrait as a reference. Ask the user which cast member to edit or select the Library character again before generating.",
              };
            }
            const promptWithRefs =
              prompt +
              promptSuffixForIntent(
                resolved.intent,
                refs.length > 0 && (appMode === "image" || appMode === "video"),
              );
            let body: Record<string, unknown> = { prompt: promptWithRefs };
            if (appMode === "image") {
              body.aspect_ratio = aspect;
              body.num_images = 1;
            } else if (appMode === "video") {
              body.aspect_ratio = aspect;
              body.duration = String(duration ?? 5);
            } else if (appMode === "speech") {
              body = { text: prompt };
            } else {
              body = { prompt };
            }
            if ((appMode === "image" || appMode === "video") && refs.length > 0) {
              refs = await materializeRefsForFal(refs, projectId as string, userId);
            }
            const adjusted = applyReferencesToModelBody(appModel, appMode, refs, body);
            const finalModel = adjusted.model;
            body = adjusted.body;
            if (finalModel !== appModel) {
              console.log("[refs] upgraded model for references", {
                from: appModel,
                to: finalModel,
              });
            }
            if (finalModel.includes("pika") && typeof body.duration !== "undefined") {
              const n = Number(body.duration);
              if (Number.isFinite(n)) body.duration = n;
            }
            if (finalModel.startsWith("fal-ai/veo3") && body.aspect_ratio === "auto") {
              delete body.aspect_ratio;
            }
            if (finalModel.startsWith("fal-ai/bytedance/seedream")) {
              delete body.aspect_ratio;
            }
            if (finalModel.startsWith("openai/gpt-image-2")) {
              delete body.aspect_ratio;
            }
            const submitted = await falSubmit(finalModel, body, app.label);

            let placeholderId: string | null = null;
            try {
              const target = appMode === "video" || appMode === "image" ? "video" : "audio";
              const durSec = appMode === "video" ? Number(body.duration ?? duration ?? 5) : 5;
              const label = prompt.slice(0, 80);
              const created = await createProjectPlaceholder({
                projectId: projectId as string,
                target,
                label,
                durationSec: Number.isFinite(durSec) && durSec > 0 ? durSec : 5,
              });
              placeholderId = created.placeholderId;
            } catch (phErr) {
              console.warn("[chat] placeholder create failed:", phErr);
            }

            const { data: jobRow, error: jobErr } = await supabaseAdmin
              .from("project_jobs")
              .insert({
                project_id: projectId as string,
                user_id: userId,
                model: finalModel,
                app_id: appId,
                app_label: app.label,
                mode: appMode,
                external_id: submitted.requestId,
                status_url: submitted.statusUrl,
                response_url: submitted.responseUrl,
                status: "queued",
                prompt,
                input: body as unknown as never,
                ...(placeholderId ? { placeholder_asset_id: placeholderId } : {}),
              } as unknown as never)
              .select("id")
              .single();
            if (jobErr || !jobRow) {
              return { error: `Failed to persist job: ${jobErr?.message ?? "unknown"}` };
            }
            return {
              jobId: jobRow.id as string,
              status: "queued" as const,
              appLabel: app.label,
              mode: appMode,
              message: `${app.label} render queued. A rendering slot is now visible in the timeline and outputs — I'll swap in the finished clip when it lands.`,
            };
          } catch (err) {
            console.error("[chat] run_model_app submit failed:", err);
            return { error: err instanceof Error ? err.message : String(err) };
          }
        }

        // Media tracking for the turn guard: watch every tool result for
        // media URLs / queued jobs so render_turn can auto-append what the
        // model forgot to show (and the fake-progress lint knows a job ran).
        const inspectForMedia = (result: unknown): void => {
          if (!result || typeof result !== "object") return;
          const o = result as {
            url?: string;
            mime?: string;
            label?: string;
            name?: string;
            jobId?: string;
            image?: { url?: string; mime?: string; name?: string };
            assets?: Array<{ url?: string; mime?: string; name?: string }>;
            result?: unknown;
          };
          if (o.jobId) guard.markJobStarted();
          const push = (url?: string, mime?: string, title?: string) => {
            if (!url) return;
            const kind = mime?.startsWith("video/")
              ? ("video" as const)
              : mime?.startsWith("audio/")
                ? ("audio" as const)
                : ("image" as const);
            guard.trackMedia({ url, kind, title });
          };
          push(o.url, o.mime, o.label ?? o.name);
          if (o.image) push(o.image.url, o.image.mime, o.image.name);
          if (Array.isArray(o.assets)) for (const a of o.assets) push(a.url, a.mime, a.name);
          if (o.result) inspectForMedia(o.result);
        };
        const MEDIA_TRACK_EXCLUDE = new Set([
          "render_turn",
          "tool_search",
          "search_stock_media",
          "commit_project_patch",
          "get_app_playbook",
        ]);
        for (const [name, t] of Object.entries(tools)) {
          if (MEDIA_TRACK_EXCLUDE.has(name)) continue;
          const impl = t as { execute?: (...a: never[]) => Promise<unknown> };
          const orig = impl.execute;
          if (!orig) continue;
          impl.execute = async (...args: never[]) => {
            const res = await orig(...args);
            try {
              inspectForMedia(res);
            } catch {
              // tracking is best-effort
            }
            return res;
          };
        }

        // Phase machine (C5): derive the phase from durable state + the
        // latest user message; it selects the injected phase prompt and the
        // eager tool surface for this turn.
        const phase = derivePhase(
          projectState,
          selectedAppId,
          extractLatestUserText(modelMessages),
        );
        // Inline edits get a minimal toolset: patches only for field/piece
        // edits; media edits additionally get the render tools so an image
        // can regenerate (and a video queue) inside the popup loop.
        const scopedTools = inlineEdit
          ? inlineEdit.kind === "media"
            ? {
                commit_project_patch: tools.commit_project_patch,
                generate_image: tools.generate_image,
                run_model_app: tools.run_model_app,
              }
            : { commit_project_patch: tools.commit_project_patch }
          : toolsForPhase(phase, tools);
        console.log(`[chat] phase=${phase} tools=${Object.keys(scopedTools).length}`);

        // System prompt assembly. Inline edits get a tiny dedicated prompt;
        // normal turns get core + one phase module + catalog summary +
        // selected-app playbook + skill context + project memory.
        const system = inlineEdit
          ? [
              buildInlineEditCorePrompt(inlineEdit.kind),
              buildProjectStateContext(projectState),
              buildInlineEditAddendum(inlineEdit),
            ].join("\n\n")
          : [
              buildCorePrompt(),
              getPhasePrompt(phase),
              renderAppCatalogSummary(agentRegistry),
              renderSelectedAppContext(agentRegistry, selectedAppId),
              buildSelectedSkillContext(projectSkillSlug, projectSkillLabel),
              buildProjectStateContext(projectState),
            ]
              .filter(Boolean)
              .join("\n\n");

        // Stop as soon as a render_turn is accepted — that IS the reply.
        const stopOnRenderTurn = ({
          steps,
        }: {
          steps: Array<{ toolResults?: Array<{ toolName?: string; output?: unknown }> }>;
        }) => {
          const last = steps[steps.length - 1];
          return !!last?.toolResults?.some(
            (r) => r.toolName === "render_turn" && !!(r.output as { ok?: boolean } | undefined)?.ok,
          );
        };

        const result = streamText({
          model,
          system,
          tools: scopedTools as never,
          stopWhen: [stepCountIs(50), stopOnRenderTurn] as never,
          maxRetries: 4,
          messages: await convertToModelMessages(sanitizeDanglingToolCalls(modelMessages)),
          abortSignal: request.signal,
          onError: async ({ error }) => {
            console.error("[chat] streamText error:", error);
            if (isRateLimitError(error)) {
              setAnthropicCooldown(60_000);
              console.warn("[chat] rate-limited — cooling Anthropic 60s, next turn uses fallback");
            }
          },
        });

        const response = result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
          messageMetadata: () =>
            inlineEdit
              ? {
                  mode: "inline-edit",
                  requestId: inlineEdit.requestId,
                  inlineEdit,
                }
              : // Ground-truth debug markers for the client HUD: the phase the
                // server actually ran this turn + the skill it was scoped to.
                { phase, skill: selectedAppId ?? undefined },
          onError: (error) => {
            console.error("[chat] toUIMessageStreamResponse error:", error);
            if (error == null) return "Unknown error";
            if (typeof error === "string") return error;
            if (error instanceof Error) return error.message;
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          },
          onFinish: async ({ messages: all }) => {
            const lastAssistant = all[all.length - 1];
            if (!inlineEdit && lastAssistant?.role === "assistant") {
              try {
                const { error: insErr } = await supabaseAdmin.from("project_messages").insert({
                  project_id: projectId,
                  role: "assistant",
                  parts: lastAssistant.parts as unknown as never,
                });
                if (insErr) {
                  console.error("[chat] persist assistant insert err:", insErr);
                }
                // Apply embedded project patch (if any) to project_state.
                const text = (lastAssistant.parts as Array<{ type: string; text?: string }>)
                  .filter((p) => p.type === "text")
                  .map((p) => p.text ?? "")
                  .join("");
                const patch = extractPatchFromText(text);
                if (patch) {
                  const { data: cur } = await supabaseAdmin
                    .from("projects")
                    .select("project_state, title")
                    .eq("id", projectId)
                    .maybeSingle();
                  if (cur) {
                    const next = applyPatch(
                      (cur.project_state as ProjectState) ?? INITIAL_PROJECT,
                      (patch as never) ?? null,
                    );
                    const patchTitle = (patch as { meta?: { title?: string } })?.meta?.title;
                    const newTitle =
                      patchTitle && patchTitle.trim() ? patchTitle.trim() : cur.title;
                    await supabaseAdmin
                      .from("projects")
                      .update({
                        project_state: next as unknown as never,
                        title: newTitle,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", projectId);
                  }
                }
              } catch (err) {
                console.error("[chat] persist assistant failed:", err);
              }
            }
          },
        });

        return response;
      },
    },
  },
});

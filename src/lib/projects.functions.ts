// Server functions for project, message, and asset persistence.
// All reads/writes go through supabaseAdmin and explicitly scope by userId
// derived from the authenticated bearer token.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import {
  applyPatch,
  INITIAL_PROJECT,
  type ProjectAsset,
  type AssetKind,
  type ProjectPatch,
  type ProjectState,
} from "@/lib/project-state";
import {
  downloadAndStoreUrl,
  extractProjectAssetStoragePath,
  signProjectAssetUrl,
  storeAsset,
} from "@/lib/project-assets.server";
import {
  falPollOnce,
  falPickImageUrl,
  falPickVideoUrl,
  falPickAudioUrl,
  falSubmit,
} from "@/lib/fal.server";
import { finalizeProjectPlaceholder } from "@/lib/project-placeholder.server";

// ---------- self-healing retry helper ----------
//
// Phase 3 · self-healing renders. When a fal job fails (submit-time transient
// error, poll returns "failed", the response has no asset URL, or storage
// download blows up), we try to re-submit the exact same input up to
// `max_attempts` times BEFORE marking the job permanently failed. The
// placeholder in the timeline stays put across retries so the user sees a
// single "rendering…" tile that eventually resolves — no thrashing.
async function retryOrFailJob(
  row: {
    id: string;
    project_id: string;
    user_id: string;
    model: string;
    app_label: string | null;
    input: unknown;
    attempts?: number | null;
    max_attempts?: number | null;
    placeholder_asset_id?: string | null;
  },
  reason: string,
): Promise<{ retried: boolean; error: string | null }> {
  const attempts = (row.attempts ?? 0) + 1;
  const max = row.max_attempts ?? 3;
  const input =
    row.input && typeof row.input === "object" ? (row.input as Record<string, unknown>) : null;
  const canRetry = attempts < max && input != null;
  if (!canRetry) {
    await supabaseAdmin
      .from("project_jobs")
      .update({
        status: "failed",
        error: reason,
        attempts,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (row.placeholder_asset_id) {
      await finalizeProjectPlaceholder({
        projectId: row.project_id,
        placeholderId: row.placeholder_asset_id,
        realAssetId: null,
      }).catch(() => {});
    }
    return { retried: false, error: reason };
  }
  try {
    const submitted = await falSubmit(row.model, input, row.app_label ?? undefined);
    await supabaseAdmin
      .from("project_jobs")
      .update({
        status: "queued",
        error: `retry ${attempts}/${max}: ${reason}`.slice(0, 500),
        attempts,
        external_id: submitted.requestId,
        status_url: submitted.statusUrl,
        response_url: submitted.responseUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return { retried: true, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Retry submit itself failed. Bump attempts, leave status as-is so a
    // later poll tick tries again.
    await supabaseAdmin
      .from("project_jobs")
      .update({
        attempts,
        error: `retry ${attempts}/${max} submit failed: ${msg}`.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return { retried: false, error: msg };
  }
}

// JSON type that satisfies TanStack's serializability check.
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

const BUCKET = "project-assets";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days
const THUMB_TTL = 60 * 60 * 24 * 7;

// ---------- helpers ----------

export async function signAssetUrls(
  rows: Array<{ storage_path: string | null; url: string }>,
  client: { storage: typeof supabaseAdmin.storage } = supabaseAdmin,
): Promise<string[]> {
  const normalizedRows = rows.map((r) => ({
    ...r,
    storage_path: r.storage_path || extractProjectAssetStoragePath(r.url),
  }));
  const paths = normalizedRows.map((r) => r.storage_path).filter((p): p is string => !!p);
  if (paths.length === 0) return rows.map((r) => r.url);
  const { data, error } = await client.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
  if (error) {
    console.error("[projects] signed urls failed:", error);
    return rows.map((r) => r.url);
  }
  const byPath = new Map<string, string>();
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) byPath.set(d.path, d.signedUrl);
  }
  return normalizedRows.map((r) => (r.storage_path && byPath.get(r.storage_path)) || r.url);
}

// Build small transformed signed URLs for image assets only. Non-image rows
// (or rows without a storage path) get `null` — callers should fall back to
// the full-size signed URL for those.
export async function signImageThumbUrls(
  rows: Array<{ storage_path: string | null; mime: string }>,
  opts: { width?: number; height?: number; quality?: number } = {},
  client: { storage: typeof supabaseAdmin.storage } = supabaseAdmin,
): Promise<(string | null)[]> {
  const width = opts.width ?? 480;
  const height = opts.height ?? 480;
  const quality = opts.quality ?? 70;
  return Promise.all(
    rows.map(async (r) => {
      const storagePath =
        r.storage_path || extractProjectAssetStoragePath((r as { url?: string }).url);
      if (!storagePath || !r.mime?.startsWith("image/")) return null;
      try {
        const { data } = await client.storage.from(BUCKET).createSignedUrl(storagePath, THUMB_TTL, {
          transform: { width, height, resize: "cover", quality },
        });
        return data?.signedUrl ?? null;
      } catch {
        return null;
      }
    }),
  );
}

function assetRowToProjectAsset(row: Record<string, unknown>, signedUrl: string): ProjectAsset {
  return {
    id: row.id as string,
    kind: (row.kind as ProjectAsset["kind"]) ?? "reference",
    mime: (row.mime as string) ?? "application/octet-stream",
    name: (row.name as string) ?? "asset",
    url: signedUrl,
    label: (row.label as string | null) ?? undefined,
    attachedTo: (row.attached_to as string | null) ?? undefined,
    createdAt: (row.created_at as string | null) ?? undefined,
    width: (row.width as number | null) ?? undefined,
    height: (row.height as number | null) ?? undefined,
    duration: (row.duration as number | null) ?? undefined,
  };
}

// Agent cards are persisted as JSON/HTML in project_messages, while scene
// thumbnails and reference URLs also live inside project_state. Vercel Blob
// keeps the canonical URLs private, so rewrite every occurrence with the
// fresh signed URL we generated for this request before any of that persisted
// content reaches the browser.
function rewriteAssetUrls<T>(
  value: T,
  replacements: ReadonlyMap<string, string>,
  replacementsByStoragePath: ReadonlyMap<string, string>,
): T {
  if (typeof value === "string") {
    let rewritten: string = value;
    for (const [rawUrl, signedUrl] of replacements) {
      if (rawUrl !== signedUrl && rewritten.includes(rawUrl)) {
        rewritten = rewritten.replaceAll(rawUrl, signedUrl);
      }
    }
    // A URL embedded in a saved card can differ slightly from the one in
    // project_assets (for example, it may be an older signed URL). Resolve
    // every Vercel Blob URL by its canonical pathname as a second pass, so a
    // private URL can never reach the browser just because its query string
    // or host representation changed between saves.
    rewritten = rewritten.replace(
      /https:\/\/[^/\s"'<>]+\.blob\.vercel-storage\.com\/[^\s"'<>]+/g,
      (url) => {
        const storagePath = extractProjectAssetStoragePath(url);
        return (storagePath && replacementsByStoragePath.get(storagePath)) || url;
      },
    );
    return rewritten as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteAssetUrls(item, replacements, replacementsByStoragePath)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        rewriteAssetUrls(item, replacements, replacementsByStoragePath),
      ]),
    ) as T;
  }
  return value;
}

// ---------- list ----------

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { limit?: number; cursor?: string } | undefined) => data ?? {})
  .handler(async ({ data: input, context }) => {
    const userId = context.userId;
    const limit = Math.min(Math.max(input?.limit ?? 24, 1), 60);
    const cursor = input?.cursor ?? null;

    // Slim SELECT: pull narrow scalars out of project_state via JSONB paths
    // instead of dragging the entire (potentially megabyte-sized) blob back
    // over the wire for every project. Grabs one extra row to detect hasMore.
    let query = supabaseAdmin
      .from("projects")
      .select(
        "id, title, status, created_at, updated_at, " +
          "meta_title:project_state->meta->>title, " +
          "meta_format:project_state->meta->>format, " +
          "meta_aspect:project_state->meta->>aspectRatio, " +
          "scene_count:project_state->scenes, " +
          "scene_thumbs:project_state->scenes",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(limit + 1);
    if (cursor) query = query.lt("updated_at", cursor);
    const { data: rowsRaw, error } = await query;
    if (error) throw new Error(error.message);

    type ListRow = {
      id: string;
      title: string;
      status: string;
      created_at: string;
      updated_at: string;
      meta_title: string | null;
      meta_format: string | null;
      meta_aspect: string | null;
      scene_count: unknown[] | null;
      scene_thumbs: Array<{ thumb?: string } | null> | null;
    };
    const rows = (rowsRaw ?? []) as unknown as ListRow[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const projectIds = pageRows.map((p) => p.id);

    // Pick a thumbnail per project. Strongly prefer an image asset — videos
    // render as black/empty frames in many browsers without a poster, which
    // looks like a broken thumbnail. Fall back to the latest video only when
    // no image exists for the project.
    const thumbByProject = new Map<string, { url: string; kind: "image" | "video" }>();
    const mediaByProject = new Map<string, string[]>();
    if (projectIds.length) {
      const { data: assetRows } = await supabaseAdmin
        .from("project_assets")
        .select("project_id, storage_path, url, mime, kind, created_at")
        .in("project_id", projectIds)
        .or("mime.ilike.image/%,mime.ilike.video/%")
        .order("created_at", { ascending: false });

      // Group by project, keeping latest image (up to 3) + latest video.
      type Row = { storage_path: string | null; url: string; mime: string };
      const imagesByProject = new Map<string, Row[]>();
      const latestVideoByProject = new Map<string, Row>();
      for (const row of assetRows ?? []) {
        const pid = row.project_id as string;
        const mime = (row.mime as string) ?? "";
        const r: Row = {
          storage_path: (row.storage_path as string | null) ?? null,
          url: (row.url as string) ?? "",
          mime,
        };
        if (mime.startsWith("image/")) {
          const arr = imagesByProject.get(pid) ?? [];
          if (arr.length < 3) {
            arr.push(r);
            imagesByProject.set(pid, arr);
          }
        } else if (mime.startsWith("video/")) {
          if (!latestVideoByProject.has(pid)) latestVideoByProject.set(pid, r);
        }
      }

      // Flatten for batched sign + thumb-transform calls.
      const flat: { storage_path: string | null; url: string }[] = [];
      const flatMime: { storage_path: string | null; mime: string }[] = [];
      type Slot = { pid: string; start: number; count: number; mimes: string[] };
      const slots: Slot[] = [];
      for (const pid of projectIds) {
        const imgs = imagesByProject.get(pid) ?? [];
        const vid = latestVideoByProject.get(pid);
        const rows: Row[] = [...imgs, ...(vid ? [vid] : [])];
        if (!rows.length) continue;
        slots.push({
          pid,
          start: flat.length,
          count: rows.length,
          mimes: rows.map((r) => r.mime),
        });
        for (const r of rows) {
          flat.push({ storage_path: r.storage_path, url: r.url });
          flatMime.push({ storage_path: r.storage_path, mime: r.mime });
        }
      }
      const [signed, flatThumbs] = await Promise.all([
        signAssetUrls(flat),
        signImageThumbUrls(flatMime, {
          width: 360,
          height: 360,
          quality: 65,
        }),
      ]);

      for (const { pid, start, count, mimes } of slots) {
        const urls = signed.slice(start, start + count);
        const thumbs = flatThumbs.slice(start, start + count);
        const imageThumbs = urls
          .map((u, i) => (mimes[i]?.startsWith("image/") ? (thumbs[i] ?? u) : null))
          .filter((u): u is string => !!u);
        mediaByProject.set(pid, imageThumbs);
        const imgIdx = mimes.findIndex((m) => m?.startsWith("image/"));
        if (imgIdx >= 0) {
          thumbByProject.set(pid, {
            url: thumbs[imgIdx] ?? urls[imgIdx],
            kind: "image",
          });
        } else {
          const vidIdx = mimes.findIndex((m) => m?.startsWith("video/"));
          if (vidIdx >= 0) {
            thumbByProject.set(pid, { url: urls[vidIdx], kind: "video" });
          }
        }
      }
    }

    // Fallback scene thumbs: only sign for projects that had no asset hit.
    const sceneThumbsByProject = new Map<string, string[]>();
    const sceneThumbRows: { storage_path: string | null; url: string }[] = [];
    const sceneThumbIndex: { pid: string; start: number; count: number }[] = [];
    for (const p of pageRows) {
      const pid = p.id as string;
      if (thumbByProject.has(pid)) continue;
      const scenes = (p.scene_thumbs as Array<{ thumb?: string } | null> | null) ?? [];
      const thumbs = scenes
        .map((s) => s?.thumb)
        .filter((u): u is string => !!u)
        .slice(0, 3);
      if (!thumbs.length) continue;
      sceneThumbIndex.push({ pid, start: sceneThumbRows.length, count: thumbs.length });
      sceneThumbRows.push(
        ...thumbs.map((url) => ({
          storage_path: extractProjectAssetStoragePath(url),
          url,
        })),
      );
    }
    if (sceneThumbRows.length) {
      const signedSceneThumbs = await signAssetUrls(sceneThumbRows);
      for (const { pid, start, count } of sceneThumbIndex) {
        sceneThumbsByProject.set(pid, signedSceneThumbs.slice(start, start + count));
      }
    }

    const projects = pageRows.map((p) => {
      const pid = p.id as string;
      const sceneThumbs = sceneThumbsByProject.get(pid) ?? [];
      const sceneThumb = sceneThumbs[0];
      const mediaUrls = mediaByProject.get(pid)?.length ? mediaByProject.get(pid)! : sceneThumbs;
      const thumb = thumbByProject.get(pid);
      const scenes = (p.scene_count as unknown[] | null) ?? [];
      return {
        id: pid,
        title: (typeof p.meta_title === "string" && p.meta_title.trim()) || (p.title as string),
        status: p.status as string,
        updatedAt: p.updated_at as string,
        createdAt: p.created_at as string,
        format: (p.meta_format as string) ?? "",
        aspectRatio: (p.meta_aspect as string) ?? "",
        sceneCount: Array.isArray(scenes) ? scenes.length : 0,
        thumbnailUrl: thumb?.url ?? sceneThumb ?? null,
        thumbnailKind: (thumb?.kind ?? (sceneThumb ? "image" : null)) as "image" | "video" | null,
        mediaUrls,
      };
    });

    const nextCursor = hasMore ? (pageRows[pageRows.length - 1].updated_at as string) : null;
    return { projects, nextCursor };
  });

// ---------- create ----------

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      data:
        | { id?: string; title?: string; skill?: string; studioMode?: string; studioModel?: string }
        | undefined,
    ) => data ?? {},
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    let title = (data?.title ?? "").trim();
    if (!title) {
      // Auto-number untitled projects per user: "Untitled Project #N".
      const { data: existing } = await supabaseAdmin
        .from("projects")
        .select("title")
        .eq("user_id", userId)
        .ilike("title", "Untitled Project #%");
      let maxN = 0;
      for (const r of existing ?? []) {
        const m = /^Untitled Project #(\d+)$/i.exec(((r.title as string) ?? "").trim());
        if (m) maxN = Math.max(maxN, Number(m[1]));
      }
      title = `Untitled Project #${maxN + 1}`;
    }
    const initial: ProjectState = {
      ...INITIAL_PROJECT,
      meta: { ...INITIAL_PROJECT.meta, title },
    };
    const { data: row, error } = await supabaseAdmin
      .from("projects")
      .insert({
        ...(data?.id ? { id: data.id } : {}),
        user_id: userId,
        title,
        status: "draft",
        project_state: initial as unknown as never,
        skill: data?.skill ?? null,
        studio_mode: data?.studioMode ?? "agent",
        studio_model: data?.studioModel ?? null,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Insert failed");
    return { id: row.id as string };
  });

// ---------- delete ----------

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    // Delete storage objects first (best-effort).
    const prefix = `${userId}/${data.id}`;
    const { data: listed } = await supabaseAdmin.storage.from(BUCKET).list(prefix, { limit: 1000 });
    if (listed && listed.length) {
      const paths = listed.map((f) => `${prefix}/${f.name}`);
      await supabaseAdmin.storage.from(BUCKET).remove(paths);
    }
    const { error } = await supabaseAdmin
      .from("projects")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- get ----------

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    // Run the three SELECTs concurrently instead of serially — they don't
    // depend on each other's results.
    const [projRes, msgRes, assetRes] = await Promise.all([
      supabaseAdmin
        .from("projects")
        .select(
          "id, title, status, project_state, updated_at, created_at, skill, studio_mode, studio_model",
        )
        .eq("id", data.id)
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("project_messages")
        .select("id, role, parts, created_at")
        .eq("project_id", data.id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("project_assets")
        .select(
          "id, kind, mime, name, label, attached_to, created_at, width, height, duration, url, storage_path",
        )
        .eq("project_id", data.id)
        .order("created_at", { ascending: true }),
    ]);
    if (projRes.error) throw new Error(projRes.error.message);
    const proj = projRes.data;
    // Missing / deleted / not-owned-by-user: return null so callers can
    // redirect cleanly instead of surfacing a runtime error + blank screen.
    if (!proj) return null;
    const msgRows = msgRes.data;
    const assetRows = assetRes.data;

    const signed = await signAssetUrls(assetRows ?? []);
    const assets = (assetRows ?? []).map((r, i) => assetRowToProjectAsset(r, signed[i]));

    const signedUrlByRawUrl = new Map<string, string>();
    const signedUrlByStoragePath = new Map<string, string>();
    for (let index = 0; index < (assetRows ?? []).length; index++) {
      const assetRow = assetRows?.[index];
      const rawUrl = (assetRow?.url as string | undefined) ?? "";
      const signedUrl = signed[index];
      if (rawUrl && signedUrl) signedUrlByRawUrl.set(rawUrl, signedUrl);
      const storagePath =
        assetRow?.storage_path || extractProjectAssetStoragePath(rawUrl);
      if (storagePath && signedUrl) signedUrlByStoragePath.set(storagePath, signedUrl);
    }

    const baseState = rewriteAssetUrls(
      (proj.project_state as ProjectState) ?? INITIAL_PROJECT,
      signedUrlByRawUrl,
      signedUrlByStoragePath,
    );
    // Always serve fresh signed URLs for project_state.assets too.
    const stateAssets: ProjectAsset[] = baseState.assets ?? [];
    const idToSigned = new Map<string, string>(assets.map((a) => [a.id, a.url]));
    const projectState: ProjectState = {
      ...baseState,
      assets: stateAssets.map((a) => ({ ...a, url: idToSigned.get(a.id) ?? a.url })),
    };
    const stateAssetIds = new Set(projectState.assets.map((a) => a.id));
    const extraAssets = assets.filter((a) => !stateAssetIds.has(a.id));
    if (extraAssets.length > 0) {
      projectState.assets = [...projectState.assets, ...extraAssets];
    }

    type ProjectMessageRow = {
      id: string;
      role: "user" | "assistant";
      parts: Json;
      createdAt: string;
    };

    const textOfParts = (parts: unknown): string =>
      Array.isArray(parts)
        ? parts
            .map((part) =>
              part && typeof part === "object" && (part as { type?: string }).type === "text"
                ? ((part as { text?: string }).text ?? "")
                : "",
            )
            .join("")
            .trim()
        : "";

    const isLegacyInlinePatchMessage = (row: ProjectMessageRow): boolean => {
      if (row.role !== "assistant" || !Array.isArray(row.parts)) return false;
      const text = textOfParts(row.parts);
      if (/data-card|data-options|data-gen-view/i.test(text)) return false;
      return row.parts.some((part) => {
        if (!part || typeof part !== "object") return false;
        const p = part as { type?: string; state?: string; output?: { patch?: unknown } };
        if (p.type !== "tool-commit_project_patch" || p.state !== "output-available") return false;
        const patch = p.output?.patch as { scenes?: Array<Record<string, unknown>> } | undefined;
        if (!patch || !Array.isArray(patch.scenes) || patch.scenes.length !== 1) return false;
        const keys = Object.keys(patch.scenes[0]).filter((key) => key !== "id");
        return keys.length > 0 && keys.every((key) => key === "title" || key === "prompt" || key === "voPrompt");
      });
    };

    const sourceMessages: ProjectMessageRow[] = (msgRows ?? []).map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: rewriteAssetUrls(m.parts as Json, signedUrlByRawUrl, signedUrlByStoragePath),
      createdAt: m.created_at,
    }));
    const visibleMessages: ProjectMessageRow[] = [];
    let inInlineTurn = false;
    for (const message of sourceMessages) {
      const text = textOfParts(message.parts);
      const isInline = text.startsWith("[[inline-rework]] ") || isLegacyInlinePatchMessage(message);
      if (message.role === "user") {
        inInlineTurn = isInline;
        if (!inInlineTurn) visibleMessages.push(message);
        continue;
      }
      if (isInline) {
        inInlineTurn = true;
        continue;
      }
      if (!inInlineTurn) visibleMessages.push(message);
    }

    return {
      project: {
        id: proj.id,
        title: projectState.meta?.title?.trim() || proj.title,
        status: proj.status,
        updatedAt: proj.updated_at,
        createdAt: proj.created_at,
        projectState,
        skill: (proj.skill as string | null) ?? null,
        studioMode: (proj.studio_mode as string | null) ?? "agent",
        studioModel: (proj.studio_model as string | null) ?? null,
      },
      messages: visibleMessages,
      assets,
    };
  });

// ---------- update studio toolbar prefs ----------

export const updateProjectStudioPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { id: string; studioMode: string; studioModel: string | null; skill?: string | null }) =>
      z
        .object({
          id: z.string().uuid(),
          studioMode: z.enum(["agent", "image", "video", "audio", "speech"]),
          studioModel: z.string().max(255).nullable(),
          skill: z.string().max(255).nullable().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const update: {
      studio_mode: string;
      studio_model: string | null;
      skill?: string | null;
    } = {
      studio_mode: data.studioMode,
      studio_model: data.studioModel,
    };
    if (data.skill !== undefined) update.skill = data.skill;
    const { error } = await supabaseAdmin
      .from("projects")
      .update(update)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- update state (patch) ----------

export const updateProjectState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { id: string; patch: ProjectPatch }) =>
      z.object({ id: z.string().uuid(), patch: z.unknown() }).parse(data) as {
        id: string;
        patch: ProjectPatch;
      },
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: row, error } = await supabaseAdmin
      .from("projects")
      .select("project_state, title")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Not found");
    const next = applyPatch((row.project_state as ProjectState) ?? INITIAL_PROJECT, data.patch);
    const newTitle =
      data.patch?.meta?.title && data.patch.meta.title.trim()
        ? data.patch.meta.title.trim()
        : row.title;
    const { error: upErr } = await supabaseAdmin
      .from("projects")
      .update({
        project_state: next as unknown as never,
        title: newTitle,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, projectState: next };
  });

// ---------- delete one message (for retry / regenerate) ----------

export const deleteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: msg } = await supabaseAdmin
      .from("project_messages")
      .select("project_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!msg) return { ok: true };
    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", msg.project_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Not allowed");
    await supabaseAdmin.from("project_messages").delete().eq("id", data.id);
    return { ok: true };
  });

// ---------- upload user asset (selfies, logos, references, audio) ----------

const ASSET_KINDS = [
  "likeness",
  "logo",
  "reference",
  "voice",
  "audio",
  "video",
  "other",
] as const satisfies readonly AssetKind[];

export const uploadProjectAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      projectId: string;
      kind: AssetKind;
      mime: string;
      name: string;
      bytesB64: string;
      label?: string;
      width?: number;
      height?: number;
      duration?: number;
    }) =>
      z
        .object({
          projectId: z.string().uuid(),
          kind: z.enum(ASSET_KINDS),
          mime: z.string().min(1).max(255),
          name: z.string().min(1).max(255),
          bytesB64: z.string().min(1).max(40_000_000), // ~30MB raw
          label: z.string().max(255).optional(),
          width: z.number().int().positive().optional(),
          height: z.number().int().positive().optional(),
          duration: z.number().positive().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }): Promise<ProjectAsset> => {
    const userId = context.userId;
    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");

    const bin = atob(data.bytesB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const stored = await storeAsset({
      projectId: data.projectId,
      userId,
      kind: data.kind,
      mime: data.mime,
      bytes,
      label: data.label,
      name: data.name,
      width: data.width,
      height: data.height,
      duration: data.duration,
    });

    const asset: ProjectAsset = {
      id: stored.id,
      kind: data.kind,
      mime: stored.mime,
      name: data.name,
      url: stored.url,
      label: data.label,
      width: data.width,
      height: data.height,
      duration: data.duration,
    };

    // Mirror the upload into project_state.assets so the Director agent's
    // state summary sees it in the same turn — the reference resolver in
    // src/lib/director/tools.server.ts looks here first before falling
    // back to project_assets. Without this mirror, uploads land in the
    // table but stay invisible to the model until the next full page load.
    try {
      const { mutateProjectState } = await import("@/lib/director/state.server");
      await mutateProjectState(data.projectId, { assetsAppend: [asset] });
    } catch (err) {
      console.warn("[uploadProjectAsset] state mirror failed:", err);
    }

    return asset;
  });

// ---------- attach an existing library asset to another project ----------
// Inserts a new project_assets row in `targetProjectId` that shares the
// same underlying storage_path as the source asset. Useful for adding
// library items (possibly from other projects) into a project's timeline.
export const attachLibraryAssetToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sourceAssetId: string; targetProjectId: string }) =>
    z
      .object({
        sourceAssetId: z.string().uuid(),
        targetProjectId: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<ProjectAsset> => {
    const userId = context.userId;

    // Verify target project belongs to user
    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", data.targetProjectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Target project not found");

    // Load source asset and verify its project belongs to user
    const { data: src, error: srcErr } = await supabaseAdmin
      .from("project_assets")
      .select("id, project_id, kind, mime, name, label, storage_path, url, width, height, duration")
      .eq("id", data.sourceAssetId)
      .maybeSingle();
    if (srcErr || !src) throw new Error("Source asset not found");

    const { data: srcProj } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", src.project_id as string)
      .eq("user_id", userId)
      .maybeSingle();
    if (!srcProj) throw new Error("Source asset not accessible");

    // If it already lives in target project, just return it (refresh URL).
    if (src.project_id === data.targetProjectId) {
      const signed = await signAssetUrls([
        {
          storage_path: (src.storage_path as string | null) ?? null,
          url: (src.url as string) ?? "",
        },
      ]);
      return {
        id: src.id as string,
        kind: (src.kind as ProjectAsset["kind"]) ?? "reference",
        mime: (src.mime as string) ?? "application/octet-stream",
        name: (src.name as string) ?? "asset",
        url: signed[0],
        label: (src.label as string | null) ?? undefined,
        width: (src.width as number | null) ?? undefined,
        height: (src.height as number | null) ?? undefined,
        duration: (src.duration as number | null) ?? undefined,
      };
    }

    const signed = await signAssetUrls([
      { storage_path: (src.storage_path as string | null) ?? null, url: (src.url as string) ?? "" },
    ]);

    const { data: row, error: insErr } = await supabaseAdmin
      .from("project_assets")
      .insert({
        project_id: data.targetProjectId,
        kind: src.kind as string,
        mime: src.mime as string,
        name: (src.name as string) ?? "asset",
        storage_path: src.storage_path as string | null,
        url: signed[0],
        label: (src.label as string | null) ?? null,
      })
      .select("id")
      .single();
    if (insErr || !row) throw new Error(insErr?.message ?? "attach failed");

    return {
      id: row.id as string,
      kind: (src.kind as ProjectAsset["kind"]) ?? "reference",
      mime: (src.mime as string) ?? "application/octet-stream",
      name: (src.name as string) ?? "asset",
      url: signed[0],
      label: (src.label as string | null) ?? undefined,
      width: (src.width as number | null) ?? undefined,
      height: (src.height as number | null) ?? undefined,
      duration: (src.duration as number | null) ?? undefined,
    };
  });

// ---------- refresh a signed asset URL on 403 ----------
//
// Client `<AssetImg>` calls this whenever an `<img>` onError fires with a
// likely-expired signed URL. We accept either a project_assets row id OR the
// raw stale URL (whichever the caller has on hand), re-sign the storage path,
// and return a fresh signed URL valid for the standard TTL.
export const refreshAssetUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { assetId?: string; staleUrl?: string } | undefined) =>
    z
      .object({ assetId: z.string().optional(), staleUrl: z.string().optional() })
      .refine((v) => !!(v.assetId || v.staleUrl), "assetId or staleUrl required")
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    let storagePath: string | null = null;

    if (data.assetId) {
      const { data: row } = await supabaseAdmin
        .from("project_assets")
        .select("storage_path, url, project_id")
        .eq("id", data.assetId)
        .maybeSingle();
      if (row) {
        // RLS-equivalent: confirm the asset's project belongs to this user.
        const { data: proj } = await supabaseAdmin
          .from("projects")
          .select("id")
          .eq("id", row.project_id as string)
          .eq("user_id", userId)
          .maybeSingle();
        if (proj) {
          storagePath =
            (row.storage_path as string | null) ||
            extractProjectAssetStoragePath((row.url as string) ?? "");
        }
      }
    }

    if (!storagePath && data.staleUrl) {
      storagePath = extractProjectAssetStoragePath(data.staleUrl);
    }

    if (!storagePath) return { url: null };

    const url = await signProjectAssetUrl(`/storage/v1/object/sign/${BUCKET}/${storagePath}`);
    return { url };
  });

// ---------- list + poll background project_jobs ----------
//
// The client subscribes to project_jobs via Realtime and also polls
// pollProjectJob on a low-frequency interval as a safety net. pollProjectJob
// is idempotent — for a job still in_progress it just hits fal once and
// updates the row; for one already terminal it returns the cached state.

export const listProjectJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { projectId: string }) =>
    z.object({ projectId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: rows, error } = await supabaseAdmin
      .from("project_jobs")
      .select(
        "id, project_id, status, app_id, app_label, mode, model, prompt, result_url, asset_id, error, created_at, updated_at",
      )
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { jobs: rows ?? [] };
  });

export const pollProjectJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string }) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: row, error } = await supabaseAdmin
      .from("project_jobs")
      .select(
        "id, project_id, user_id, mode, model, app_id, app_label, status_url, response_url, status, prompt, result_url, asset_id, error, placeholder_asset_id, input, attempts, max_attempts",
      )
      .eq("id", data.jobId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Job not found");
    const jobRow = row as unknown as {
      id: string;
      project_id: string;
      user_id: string;
      mode: string | null;
      model: string;
      app_id: string | null;
      app_label: string | null;
      status_url: string | null;
      response_url: string | null;
      status: string;
      prompt: string | null;
      result_url: string | null;
      asset_id: string | null;
      error: string | null;
      placeholder_asset_id: string | null;
      input: unknown;
      attempts: number | null;
      max_attempts: number | null;
    };
    const placeholderId = jobRow.placeholder_asset_id ?? null;

    if (jobRow.status !== "queued" && jobRow.status !== "running") {
      return {
        status: jobRow.status,
        assetId: jobRow.asset_id ?? null,
        resultUrl: jobRow.result_url ?? null,
        error: jobRow.error ?? null,
      };
    }
    if (!jobRow.status_url || !jobRow.response_url) {
      return { status: jobRow.status, assetId: null, resultUrl: null, error: null };
    }

    let tick;
    try {
      tick = await falPollOnce(jobRow.status_url, jobRow.response_url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: jobRow.status, assetId: null, resultUrl: null, error: msg };
    }

    if (tick.status === "in_progress") {
      if (jobRow.status === "queued") {
        await supabaseAdmin
          .from("project_jobs")
          .update({ status: "running", updated_at: new Date().toISOString() })
          .eq("id", jobRow.id);
      }
      return { status: "running", assetId: null, resultUrl: null, error: null };
    }

    if (tick.status === "failed") {
      const r = await retryOrFailJob(jobRow, tick.error);
      return {
        status: r.retried ? "queued" : "failed",
        assetId: null,
        resultUrl: null,
        error: r.error,
      };
    }

    const mode = jobRow.mode;
    const pick =
      mode === "image" ? falPickImageUrl : mode === "video" ? falPickVideoUrl : falPickAudioUrl;
    const sourceUrl = pick(tick.response);
    if (!sourceUrl) {
      const r = await retryOrFailJob(jobRow, "no asset URL in response");
      return {
        status: r.retried ? "queued" : "failed",
        assetId: null,
        resultUrl: null,
        error: r.error,
      };
    }
    const fallbackMime =
      mode === "image" ? "image/png" : mode === "video" ? "video/mp4" : "audio/mpeg";
    const kind: AssetKind =
      mode === "image"
        ? "reference"
        : mode === "video"
          ? "video"
          : mode === "speech"
            ? "voiceover"
            : "audio";

    let stored: { id: string; url: string; mime: string };
    try {
      stored = await downloadAndStoreUrl({
        projectId: jobRow.project_id,
        userId,
        sourceUrl,
        kind,
        label: (jobRow.prompt ?? jobRow.app_label ?? "Render").slice(0, 80),
        fallbackMime,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const r = await retryOrFailJob(jobRow, msg);
      return {
        status: r.retried ? "queued" : "failed",
        assetId: null,
        resultUrl: null,
        error: r.error,
      };
    }

    // Swap the placeholder ref (if any) for the real asset id BEFORE marking
    // the job succeeded — the client's job watcher fires an invalidation as
    // soon as it sees "succeeded", and we want the timeline to already show
    // the finished clip when it re-fetches.
    if (placeholderId) {
      await finalizeProjectPlaceholder({
        projectId: jobRow.project_id,
        placeholderId,
        realAssetId: stored.id,
      }).catch(() => {});
    } else {
      const target: "video" | "audio" = mode === "video" || mode === "image" ? "video" : "audio";
      const { appendAssetToTimeline } = await import("@/lib/project-placeholder.server");
      await appendAssetToTimeline({
        projectId: jobRow.project_id,
        assetId: stored.id,
        target,
      }).catch(() => {});
    }

    await supabaseAdmin
      .from("project_jobs")
      .update({
        status: "succeeded",
        result_url: stored.url,
        asset_id: stored.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobRow.id);

    return {
      status: "succeeded",
      assetId: stored.id,
      resultUrl: stored.url,
      mime: stored.mime,
      error: null,
    };
  });

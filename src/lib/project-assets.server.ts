// Server-only helpers for persisting binary assets to the `project-assets`
// storage bucket and the `project_assets` table, returning signed URLs the
// client can render directly.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AssetKind } from "@/lib/project-state";

const BUCKET = "project-assets";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

export function extractProjectAssetStoragePath(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    const match = url.pathname.match(
      /\/storage\/v1\/(?:object\/(?:sign|public|authenticated)|render\/image\/sign)\/project-assets\/(.+)$/,
    );
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export async function signProjectAssetUrl(
  rawUrl: string | null | undefined,
): Promise<string | null> {
  const storagePath = extractProjectAssetStoragePath(rawUrl);
  if (!storagePath) return null;
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  if (mime === "audio/mpeg") return "mp3";
  if (mime === "audio/wav") return "wav";
  const parts = mime.split("/");
  return parts[1]?.split(";")[0] || "bin";
}

export type StoreAssetInput = {
  projectId: string;
  userId: string;
  kind: AssetKind;
  mime: string;
  bytes: Uint8Array;
  label?: string;
  name?: string;
  attachedTo?: string;
  width?: number;
  height?: number;
  duration?: number;
};

export async function storeAsset(input: StoreAssetInput): Promise<{
  id: string;
  url: string;
  storagePath: string;
}> {
  const ext = extFromMime(input.mime);
  const fileName = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  const path = `${input.userId}/${input.projectId}/${fileName}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, input.bytes, {
      contentType: input.mime,
      upsert: false,
    });
  if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);

  const { data: signed } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  const url = signed?.signedUrl ?? "";

  const { data: row, error: insErr } = await supabaseAdmin
    .from("project_assets")
    .insert({
      project_id: input.projectId,
      kind: input.kind,
      mime: input.mime,
      name: input.name ?? fileName,
      storage_path: path,
      url,
      label: input.label ?? null,
      attached_to: input.attachedTo ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      duration: input.duration ?? null,
    })
    .select("id")
    .single();
  if (insErr || !row) {
    if (input.attachedTo) {
      const { data: existing } = await supabaseAdmin
        .from("project_assets")
        .select("id, storage_path")
        .eq("project_id", input.projectId)
        .eq("attached_to", input.attachedTo)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {});
        const existingPath = existing.storage_path as string | null;
        let existingUrl = "";
        if (existingPath) {
          const { data: existingSigned } = await supabaseAdmin.storage
            .from(BUCKET)
            .createSignedUrl(existingPath, SIGNED_URL_TTL);
          existingUrl = existingSigned?.signedUrl ?? "";
        }
        return { id: existing.id as string, url: existingUrl, storagePath: existingPath ?? "" };
      }
    }
    throw new Error(insErr?.message ?? "asset insert failed");
  }

  return { id: row.id as string, url, storagePath: path };
}

export async function downloadAndStoreUrl(
  args: {
    projectId: string;
    userId: string;
    sourceUrl: string;
    kind: AssetKind;
    label?: string;
    attachedTo?: string;
    fallbackMime?: string;
    duration?: number;
    width?: number;
    height?: number;
    headers?: Record<string, string>;
  },
): Promise<{ id: string; url: string; mime: string }> {
  if (args.attachedTo) {
    const { data: existing } = await supabaseAdmin
      .from("project_assets")
      .select("id, mime, url, storage_path")
      .eq("project_id", args.projectId)
      .eq("attached_to", args.attachedTo)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing) {
      let url = (existing.url as string | null) ?? "";
      const storagePath = existing.storage_path as string | null;
      if (storagePath) {
        const { data: signed } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(storagePath, SIGNED_URL_TTL);
        url = signed?.signedUrl ?? url;
      }
      return { id: existing.id as string, url, mime: existing.mime as string };
    }
  }

  // Some hosts (Cloudflare, Akamai) block requests without a browser-like
  // User-Agent and return an HTML challenge page. Send a realistic UA by
  // default; callers can override via `headers`.
  const defaultHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/*,video/*,*/*;q=0.8",
    Referer: new URL(args.sourceUrl).origin + "/",
  };
  const res = await fetch(args.sourceUrl, {
    headers: { ...defaultHeaders, ...(args.headers ?? {}) },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(
      `fetch source failed ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`,
    );
  }
  const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
  const urlExt = args.sourceUrl.split("?")[0].split(".").pop()?.toLowerCase();
  const extMime =
    urlExt === "mp4" ? "video/mp4"
    : urlExt === "webm" ? "video/webm"
    : urlExt === "mov" ? "video/quicktime"
    : urlExt === "mp3" ? "audio/mpeg"
    : urlExt === "wav" ? "audio/wav"
    : urlExt === "png" ? "image/png"
    : urlExt === "jpg" || urlExt === "jpeg" ? "image/jpeg"
    : urlExt === "webp" ? "image/webp"
    : undefined;
  const mime =
    (headerMime && headerMime !== "application/octet-stream"
      ? headerMime
      : extMime || args.fallbackMime || headerMime) ||
    "application/octet-stream";
  const buf = new Uint8Array(await res.arrayBuffer());
  const stored = await storeAsset({
    projectId: args.projectId,
    userId: args.userId,
    kind: args.kind,
    mime,
    bytes: buf,
    label: args.label,
    attachedTo: args.attachedTo,
    name: args.sourceUrl.split("/").pop()?.split("?")[0] ?? undefined,
    duration: args.duration,
    width: args.width,
    height: args.height,
  });
  return { id: stored.id, url: stored.url, mime };
}

// Walk an arbitrary value for URLs that look like video assets. Accepts any
// http(s) URL whose path includes a video-ish extension OR whose host hints
// at a video CDN (pika/cloudfront/cdn) — Pika sometimes returns URLs
// without a `.mp4` suffix.
export function sweepCandidateVideoUrls(out: unknown): string[] {
  const urls = new Set<string>();
  const visit = (v: unknown) => {
    if (!v) return;
    if (typeof v === "string") {
      const matches = v.match(/https?:\/\/[^\s"'<>)]+/g);
      if (matches) {
        for (const u of matches) {
          if (
            /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u) ||
            /pika|video|stream|cdn|s3|r2|storage/i.test(u)
          ) {
            urls.add(u);
          }
        }
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (typeof v === "object") {
      for (const val of Object.values(v as Record<string, unknown>)) visit(val);
    }
  };
  visit(out);
  return Array.from(urls);
}

// Same shape as sweepCandidateVideoUrls but for image assets returned by
// Pika MCP (generate_image etc.). Accepts http(s) URLs whose path has an
// image-ish extension or whose host hints at a Pika/CDN bucket.
export function sweepCandidateImageUrls(out: unknown): string[] {
  const urls = new Set<string>();
  const visit = (v: unknown) => {
    if (!v) return;
    if (typeof v === "string") {
      const matches = v.match(/https?:\/\/[^\s"'<>)]+/g);
      if (matches) {
        for (const u of matches) {
          if (
            /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u) ||
            /(pika|image|img|cdn|s3|r2|storage)/i.test(u)
          ) {
            // Filter out obvious non-image hits (videos) — we want images only.
            if (!/\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)) {
              urls.add(u);
            }
          }
        }
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (typeof v === "object") {
      for (const val of Object.values(v as Record<string, unknown>)) visit(val);
    }
  };
  visit(out);
  return Array.from(urls);
}
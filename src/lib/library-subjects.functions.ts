// @ts-nocheck — legacy feature file; feature tables (characters, library_subjects, render_jobs, etc.) are not part of the projects-first Supabase migration.
// Server functions for the unified Library Subjects catalog.
//
// A "subject" is anything the user wants to keep visually consistent across
// projects: a Character, a Product, a Scene / environment, a Logo, or a
// generic Brand asset. Everything shares the same shape so the Agent and the
// Library picker only need to learn ONE contract.
//
// Storage layout mirrors characters: `library/<userId>/subjects/<id>/...`
// under the `project-assets` bucket, signed on read.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BUCKET = "project-assets";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

export const LIBRARY_SUBJECT_KINDS = [
  "character",
  "product",
  "scene",
  "logo",
  "brand_asset",
] as const;
export type LibrarySubjectKind = (typeof LIBRARY_SUBJECT_KINDS)[number];

export type LibrarySubject = {
  id: string;
  kind: LibrarySubjectKind;
  name: string;
  aliases: string[];
  description: string | null;
  brand: string | null;
  imageUrl: string | null;
  referenceUrls: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

type SubjectRow = {
  id: string;
  kind: LibrarySubjectKind;
  name: string;
  aliases: string[] | null;
  description: string | null;
  brand: string | null;
  primary_asset_url: string | null;
  primary_asset_storage_path: string | null;
  reference_urls: string[] | null;
  favorite: boolean;
  created_at: string;
  updated_at: string;
};

async function signStoragePath(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

function rowToSubject(row: SubjectRow, signedPrimary: string | null): LibrarySubject {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    aliases: row.aliases ?? [],
    description: row.description,
    brand: row.brand,
    imageUrl: signedPrimary ?? row.primary_asset_url,
    referenceUrls: row.reference_urls ?? [],
    favorite: row.favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  "id, kind, name, aliases, description, brand, primary_asset_url, primary_asset_storage_path, reference_urls, favorite, created_at, updated_at";

// ---------- list ----------

const listInput = z
  .object({ kind: z.enum(LIBRARY_SUBJECT_KINDS).optional() })
  .optional();

export const listLibrarySubjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof listInput>) => listInput.parse(data))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("library_subjects")
      .select(SELECT_COLUMNS)
      .order("updated_at", { ascending: false });
    if (data?.kind) query = query.eq("kind", data.kind);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const rs = (rows ?? []) as SubjectRow[];
    const signed = await Promise.all(rs.map((r) => signStoragePath(r.primary_asset_storage_path)));
    return rs.map((r, i) => rowToSubject(r, signed[i]));
  });

// ---------- get ----------

export const getLibrarySubject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("library_subjects")
      .select(SELECT_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const signed = await signStoragePath((row as SubjectRow).primary_asset_storage_path);
    return rowToSubject(row as SubjectRow, signed);
  });

// ---------- upsert ----------

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(LIBRARY_SUBJECT_KINDS).optional(),
  name: z.string().min(1).max(160).optional(),
  aliases: z.array(z.string().max(80)).max(20).optional(),
  description: z.string().max(4000).nullable().optional(),
  brand: z.string().max(120).nullable().optional(),
  favorite: z.boolean().optional(),
  // Primary image: upload bytes, fetch by URL, or copy from an existing project asset.
  imageBytesB64: z.string().optional(),
  imageMime: z.string().max(80).optional(),
  imageFilename: z.string().max(200).optional(),
  imageSourceUrl: z.string().url().optional(),
  projectAssetId: z.string().uuid().optional(),
  clearImage: z.boolean().optional(),
  // Extra reference URLs (already hosted): appended to `reference_urls`.
  extraReferenceUrls: z.array(z.string().url()).max(12).optional(),
  replaceReferenceUrls: z.boolean().optional(),
});

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "bin";
}

function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const upsertLibrarySubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof upsertInput>) => upsertInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const isUpdate = Boolean(data.id);
    const subjectId = data.id ?? crypto.randomUUID();

    let existing: SubjectRow | null = null;
    if (isUpdate) {
      const { data: row, error } = await context.supabase
        .from("library_subjects")
        .select(SELECT_COLUMNS)
        .eq("id", subjectId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Subject not found");
      existing = row as SubjectRow;
    }

    // Resolve primary image if requested.
    let newStoragePath: string | null | undefined = undefined;
    let newImageUrl: string | null | undefined = undefined;
    const wantsNewImage =
      !!data.imageBytesB64 || !!data.imageSourceUrl || !!data.projectAssetId || !!data.clearImage;

    if (wantsNewImage) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (existing?.primary_asset_storage_path) {
        await supabaseAdmin.storage.from(BUCKET).remove([existing.primary_asset_storage_path]).catch(() => {});
      }
      if (data.clearImage && !data.imageBytesB64 && !data.imageSourceUrl && !data.projectAssetId) {
        newStoragePath = null;
        newImageUrl = null;
      } else {
        let bytes: Uint8Array | null = null;
        let mime: string;
        let filename: string;
        let srcStoragePath: string | null = null;

        if (data.projectAssetId) {
          const { data: asset, error: aErr } = await context.supabase
            .from("project_assets")
            .select("storage_path, mime, name")
            .eq("id", data.projectAssetId)
            .maybeSingle();
          if (aErr) throw new Error(aErr.message);
          if (!asset?.storage_path) throw new Error("Source asset not found");
          srcStoragePath = asset.storage_path as string;
          mime = (asset.mime as string) ?? "image/png";
          filename =
            data.imageFilename ?? (asset.name as string | null) ?? `subject.${extFromMime(mime)}`;
        } else if (data.imageBytesB64) {
          bytes = b64ToUint8(data.imageBytesB64);
          mime = data.imageMime ?? "application/octet-stream";
          filename = data.imageFilename ?? `subject.${extFromMime(mime)}`;
        } else {
          const res = await fetch(data.imageSourceUrl!);
          if (!res.ok) throw new Error(`Failed to fetch source image (${res.status})`);
          bytes = new Uint8Array(await res.arrayBuffer());
          mime = data.imageMime ?? res.headers.get("content-type") ?? "image/png";
          filename = data.imageFilename ?? `subject.${extFromMime(mime)}`;
        }

        const path = `library/${userId}/subjects/${subjectId}/${Date.now()}-${filename}`;
        if (srcStoragePath) {
          const { error: cpErr } = await supabaseAdmin.storage.from(BUCKET).copy(srcStoragePath, path);
          if (cpErr) throw new Error(cpErr.message);
        } else {
          const { error: upErr } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(path, bytes!, { contentType: mime, upsert: true });
          if (upErr) throw new Error(upErr.message);
        }
        newStoragePath = path;
        newImageUrl = null;
      }
    }

    // Merge extra reference URLs.
    let nextReferenceUrls: string[] | undefined;
    if (data.extraReferenceUrls || data.replaceReferenceUrls) {
      const base = data.replaceReferenceUrls ? [] : existing?.reference_urls ?? [];
      const merged = [...base, ...(data.extraReferenceUrls ?? [])];
      nextReferenceUrls = Array.from(new Set(merged)).slice(0, 12);
    }

    type SubjectUpdate = Partial<{
      user_id: string;
      kind: LibrarySubjectKind;
      name: string;
      aliases: string[];
      description: string | null;
      brand: string | null;
      favorite: boolean;
      primary_asset_storage_path: string | null;
      primary_asset_url: string | null;
      reference_urls: string[];
    }>;

    const patch: SubjectUpdate = {};
    if (data.kind !== undefined) patch.kind = data.kind;
    if (data.name !== undefined) patch.name = data.name.trim() || "Untitled subject";
    if (data.aliases !== undefined) patch.aliases = data.aliases;
    if (data.description !== undefined) patch.description = data.description;
    if (data.brand !== undefined) patch.brand = data.brand;
    if (data.favorite !== undefined) patch.favorite = data.favorite;
    if (newStoragePath !== undefined) patch.primary_asset_storage_path = newStoragePath;
    if (newImageUrl !== undefined) patch.primary_asset_url = newImageUrl;
    if (nextReferenceUrls !== undefined) patch.reference_urls = nextReferenceUrls;

    const { supabaseAdmin: writer } = await import("@/integrations/supabase/client.server");

    if (isUpdate) {
      const { data: row, error } = await writer
        .from("library_subjects")
        .update(patch)
        .eq("id", subjectId)
        .eq("user_id", userId)
        .select(SELECT_COLUMNS)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Subject not found or not owned by caller");
      const signed = await signStoragePath((row as SubjectRow).primary_asset_storage_path);
      return rowToSubject(row as SubjectRow, signed);
    }

    if (!patch.kind) throw new Error("kind is required for new subjects");
    if (!patch.name) throw new Error("name is required for new subjects");

    const { data: row, error } = await writer
      .from("library_subjects")
      .insert({
        id: subjectId,
        user_id: userId,
        kind: patch.kind,
        name: patch.name,
        aliases: patch.aliases ?? [],
        description: patch.description ?? null,
        brand: patch.brand ?? null,
        favorite: patch.favorite ?? false,
        primary_asset_storage_path: patch.primary_asset_storage_path ?? null,
        primary_asset_url: patch.primary_asset_url ?? null,
        reference_urls: patch.reference_urls ?? [],
      })
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Insert returned no row");
    const signed = await signStoragePath((row as SubjectRow).primary_asset_storage_path);
    return rowToSubject(row as SubjectRow, signed);
  });

// ---------- delete ----------

export const deleteLibrarySubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("library_subjects")
      .select("primary_asset_storage_path")
      .eq("id", data.id)
      .maybeSingle();
    const storagePath = (row as { primary_asset_storage_path: string | null } | null)
      ?.primary_asset_storage_path;
    const { error } = await context.supabase
      .from("library_subjects")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (storagePath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    }
    return { ok: true };
  });

// ---------- attach to project ----------
//
// Copies the subject's primary image + reference URLs into the target
// project as project_assets rows so downstream renders (which are scoped to
// a projectId) can use them without special-casing library storage.

function subjectKindToAssetKind(k: LibrarySubjectKind): string {
  switch (k) {
    case "character":
      return "likeness";
    case "logo":
    case "brand_asset":
      return "logo";
    default:
      return "reference";
  }
}

export const attachSubjectToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { subjectId: string; projectId: string }) =>
      z
        .object({ subjectId: z.string().uuid(), projectId: z.string().uuid() })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify project ownership.
    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");

    // Load subject.
    const { data: subject, error } = await context.supabase
      .from("library_subjects")
      .select(SELECT_COLUMNS)
      .eq("id", data.subjectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!subject) throw new Error("Subject not found");
    const s = subject as SubjectRow;

    const assetKind = subjectKindToAssetKind(s.kind);
    const insertedIds: string[] = [];

    // Primary image: copy storage file if present, otherwise use URL.
    let primaryUrl: string | null = null;
    if (s.primary_asset_storage_path) {
      const dstPath = `${userId}/${data.projectId}/subjects/${s.id}/${Date.now()}-primary`;
      const { error: cpErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .copy(s.primary_asset_storage_path, dstPath);
      if (cpErr) throw new Error(cpErr.message);
      const { data: signed } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(dstPath, SIGNED_URL_TTL);
      primaryUrl = signed?.signedUrl ?? null;
      const { data: row } = await supabaseAdmin
        .from("project_assets")
        .insert({
          project_id: data.projectId,
          kind: assetKind,
          mime: "image/png",
          name: s.name,
          label: s.kind,
          storage_path: dstPath,
          url: primaryUrl ?? "",
        })
        .select("id")
        .single();
      if (row) insertedIds.push(row.id as string);
    } else if (s.primary_asset_url) {
      const { data: row } = await supabaseAdmin
        .from("project_assets")
        .insert({
          project_id: data.projectId,
          kind: assetKind,
          mime: "image/png",
          name: s.name,
          label: s.kind,
          url: s.primary_asset_url,
        })
        .select("id")
        .single();
      if (row) insertedIds.push(row.id as string);
    }

    // Extra reference URLs (do not copy bytes — we assume they're durable).
    for (const url of s.reference_urls ?? []) {
      const { data: row } = await supabaseAdmin
        .from("project_assets")
        .insert({
          project_id: data.projectId,
          kind: assetKind,
          mime: "image/png",
          name: `${s.name} (ref)`,
          label: s.kind,
          url,
        })
        .select("id")
        .single();
      if (row) insertedIds.push(row.id as string);
    }

    return { ok: true, subjectId: s.id, insertedAssetIds: insertedIds };
  });

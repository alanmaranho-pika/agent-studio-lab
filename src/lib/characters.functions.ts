// @ts-nocheck — legacy feature file; feature tables (characters, library_subjects, render_jobs, etc.) are not part of the projects-first Supabase migration.
// Server functions for the user-scoped Characters library. Characters are
// reusable across projects (Short Film, Product Ad, etc.) so they live
// outside any single project. Images are persisted to the shared
// `project-assets` bucket under a `library/<userId>/characters/...`
// prefix so they survive project deletion.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BUCKET = "project-assets";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

export type LibraryCharacter = {
  id: string;
  name: string;
  description: string;
  backstory: string;
  imageUrl: string | null;
  imageMime: string | null;
  voiceProvider: string | null;
  voiceId: string | null;
  voiceLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

type CharacterRow = {
  id: string;
  name: string;
  description: string;
  backstory: string;
  image_url: string | null;
  image_storage_path: string | null;
  image_mime: string | null;
  voice_provider: string | null;
  voice_id: string | null;
  voice_label: string | null;
  created_at: string;
  updated_at: string;
};

async function signImageUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath) return null;
  try {
    // Storage RLS on `project-assets` only permits reads where the first
    // folder is the auth.uid(). Library characters live under `library/...`,
    // so we must sign with the service-role admin client.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

function rowToCharacter(row: CharacterRow, signedUrl: string | null): LibraryCharacter {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    backstory: row.backstory,
    imageUrl: signedUrl ?? row.image_url,
    imageMime: row.image_mime,
    voiceProvider: row.voice_provider,
    voiceId: row.voice_id,
    voiceLabel: row.voice_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------- list ----------

export const listCharacters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("characters")
      .select(
        "id, name, description, backstory, image_url, image_storage_path, image_mime, voice_provider, voice_id, voice_label, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as CharacterRow[];
    const signed = await Promise.all(
      rows.map((r) => signImageUrl(r.image_storage_path)),
    );
    return rows.map((r, i) => rowToCharacter(r, signed[i]));
  });

// ---------- get ----------

export const getCharacter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("characters")
      .select(
        "id, name, description, backstory, image_url, image_storage_path, image_mime, voice_provider, voice_id, voice_label, created_at, updated_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const signed = await signImageUrl((row as CharacterRow).image_storage_path);
    return rowToCharacter(row as CharacterRow, signed);
  });

// ---------- upsert ----------
// Two image source shapes are supported:
//   imageBytesB64 + imageMime + imageFilename  → upload fresh bytes
//   imageSourceUrl                             → server-fetches the URL and uploads
// Omit both to leave the existing image unchanged.

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(4000).optional(),
  backstory: z.string().max(4000).optional(),
  voiceProvider: z.string().max(40).nullable().optional(),
  voiceId: z.string().max(120).nullable().optional(),
  voiceLabel: z.string().max(120).nullable().optional(),
  imageBytesB64: z.string().optional(),
  imageMime: z.string().max(80).optional(),
  imageFilename: z.string().max(200).optional(),
  imageSourceUrl: z.string().url().optional(),
  /** Copy from an existing project_assets row owned by this user. */
  projectAssetId: z.string().uuid().optional(),
  clearImage: z.boolean().optional(),
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

export const upsertCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof upsertInput>) => upsertInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const isUpdatingExistingCharacter = Boolean(data.id);
    const characterId = data.id ?? crypto.randomUUID();

    // Load existing row if id provided (must belong to user).
    let existing: CharacterRow | null = null;
    if (isUpdatingExistingCharacter) {
      const { data: row, error } = await context.supabase
        .from("characters")
        .select(
          "id, name, description, backstory, image_url, image_storage_path, image_mime, voice_provider, voice_id, voice_label, created_at, updated_at",
        )
        .eq("id", characterId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Character not found");
      existing = row as CharacterRow;
    }

    // Resolve image. We lazy-load supabaseAdmin (server-only) since storage
    // writes need service-role privileges.
    let newStoragePath: string | null | undefined = undefined; // undefined = unchanged
    let newImageMime: string | null | undefined = undefined;
    let newImageUrl: string | null | undefined = undefined;

    const wantsNewImage =
      !!data.imageBytesB64 || !!data.imageSourceUrl || !!data.projectAssetId || !!data.clearImage;

    if (wantsNewImage) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Best-effort delete of old image
      if (existing?.image_storage_path) {
        await supabaseAdmin.storage.from(BUCKET).remove([existing.image_storage_path]).catch(() => {});
      }
      if (data.clearImage && !data.imageBytesB64 && !data.imageSourceUrl && !data.projectAssetId) {
        newStoragePath = null;
        newImageMime = null;
        newImageUrl = null;
      } else {
        let bytes: Uint8Array | null = null;
        let mime: string;
        let filename: string;
        let srcStoragePath: string | null = null;

        if (data.projectAssetId) {
          // Resolve the project asset (must belong to user via project ownership).
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
            data.imageFilename ?? (asset.name as string | null) ?? `portrait.${extFromMime(mime)}`;
        } else if (data.imageBytesB64) {
          bytes = b64ToUint8(data.imageBytesB64);
          mime = data.imageMime ?? "application/octet-stream";
          filename = data.imageFilename ?? `portrait.${extFromMime(mime)}`;
        } else {
          // Fetch source URL on the server
          const res = await fetch(data.imageSourceUrl!);
          if (!res.ok) throw new Error(`Failed to fetch source image (${res.status})`);
          const buf = new Uint8Array(await res.arrayBuffer());
          bytes = buf;
          mime = data.imageMime ?? res.headers.get("content-type") ?? "image/png";
          filename = data.imageFilename ?? `portrait.${extFromMime(mime)}`;
        }
        const path = `library/${userId}/characters/${characterId}/${Date.now()}-${filename}`;
        if (srcStoragePath) {
          // Same-bucket server-side copy — avoids fetching signed URLs.
          const { error: cpErr } = await supabaseAdmin.storage
            .from(BUCKET)
            .copy(srcStoragePath, path);
          if (cpErr) throw new Error(cpErr.message);
        } else {
          const { error: upErr } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(path, bytes!, { contentType: mime, upsert: true });
          if (upErr) throw new Error(upErr.message);
        }
        newStoragePath = path;
        newImageMime = mime;
        newImageUrl = null; // we'll re-sign on read; url column stays empty
      }
    }


    // Build payload
    type CharacterUpdate = {
      user_id?: string;
      name?: string;
      description?: string;
      backstory?: string;
      voice_provider?: string | null;
      voice_id?: string | null;
      voice_label?: string | null;
      image_storage_path?: string | null;
      image_mime?: string | null;
      image_url?: string | null;
    };
    const updatePayload: CharacterUpdate = {};
    if (data.name !== undefined) updatePayload.name = data.name.trim() || "Untitled character";
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.backstory !== undefined) updatePayload.backstory = data.backstory;
    if (data.voiceProvider !== undefined) updatePayload.voice_provider = data.voiceProvider;
    if (data.voiceId !== undefined) updatePayload.voice_id = data.voiceId;
    if (data.voiceLabel !== undefined) updatePayload.voice_label = data.voiceLabel;
    if (newStoragePath !== undefined) updatePayload.image_storage_path = newStoragePath;
    if (newImageMime !== undefined) updatePayload.image_mime = newImageMime;
    if (newImageUrl !== undefined) updatePayload.image_url = newImageUrl;

    // Use admin client for the write so the RETURNING row is not filtered by
    // PostgREST's RLS-applied select (we already verified the caller via
    // requireSupabaseAuth and set user_id from the validated JWT).
    const { supabaseAdmin: writer } = await import("@/integrations/supabase/client.server");

    if (isUpdatingExistingCharacter) {
      const { data: row, error } = await writer
        .from("characters")
        .update(updatePayload)
        .eq("id", characterId)
        .eq("user_id", userId)
        .select(
          "id, name, description, backstory, image_url, image_storage_path, image_mime, voice_provider, voice_id, voice_label, created_at, updated_at",
        )
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Character not found or not owned by caller");
      const signed = await signImageUrl((row as CharacterRow).image_storage_path);
      return rowToCharacter(row as CharacterRow, signed);
    }

    // Insert
    const insertPayload: CharacterUpdate & { id: string; user_id: string; name: string } = {
      id: characterId,
      user_id: userId,
      name: updatePayload.name ?? "Untitled character",
      description: updatePayload.description ?? "",
      backstory: updatePayload.backstory ?? "",
      voice_provider: updatePayload.voice_provider ?? null,
      voice_id: updatePayload.voice_id ?? null,
      voice_label: updatePayload.voice_label ?? null,
      image_storage_path: updatePayload.image_storage_path ?? null,
      image_mime: updatePayload.image_mime ?? null,
      image_url: updatePayload.image_url ?? null,
    };
    const { data: row, error } = await writer
      .from("characters")
      .insert(insertPayload)
      .select(
        "id, name, description, backstory, image_url, image_storage_path, image_mime, voice_provider, voice_id, voice_label, created_at, updated_at",
      )
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Insert returned no row");
    const signed = await signImageUrl((row as CharacterRow).image_storage_path);
    return rowToCharacter(row as CharacterRow, signed);
  });


// ---------- delete ----------

export const deleteCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // Find storage path so we can clean up
    const { data: row } = await context.supabase
      .from("characters")
      .select("image_storage_path")
      .eq("id", data.id)
      .maybeSingle();
    const storagePath = (row as { image_storage_path: string | null } | null)?.image_storage_path;
    const { error } = await context.supabase
      .from("characters")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (storagePath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    }
    return { ok: true };
  });

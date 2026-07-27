// @ts-nocheck — legacy feature file; feature tables (characters, library_subjects, render_jobs, etc.) are not part of the projects-first Supabase migration.
// Intent-aware reference resolver for Agent Mode renders.
//
// The old chat.ts logic was character-first: it assumed every render was
// about a person's likeness. Product/logo/scene shots that don't have a
// named cast fell through to "latest likeness" + a hardcoded "preserve
// face/hair/skin tone" prompt suffix — actively pushing the model AWAY
// from the actual product reference. This module replaces that with a
// single categorized resolver.

import type { ProjectState, ProjectAsset } from "@/lib/project-state";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  downloadAndStoreUrl,
  extractProjectAssetStoragePath,
  signProjectAssetUrl,
} from "@/lib/project-assets.server";
import { normalizePikaModelPath } from "@/lib/pika-media.server";

/**
 * fal's download step will 422 on ephemeral / auth-gated URLs
 * (e.g. openai/withmartian image outputs, expired signed URLs, cookie-gated
 * CDNs). Before sending refs to fal, rewrite each URL to a fresh
 * project-assets signed URL:
 *   - our own storage → re-sign for a full TTL
 *   - anything else → download + re-upload to project-assets, then sign
 * On failure the original URL is kept as a best-effort fallback.
 */
export async function materializeRefsForFal(
  refs: string[],
  projectId: string,
  userId: string,
): Promise<string[]> {
  const out: string[] = [];
  for (const raw of refs) {
    if (!/^https?:/.test(raw)) continue;
    try {
      if (extractProjectAssetStoragePath(raw)) {
        const fresh = await signProjectAssetUrl(raw);
        out.push(fresh || raw);
        continue;
      }
      const stored = await downloadAndStoreUrl({
        projectId,
        userId,
        sourceUrl: raw,
        kind: "reference",
      });
      out.push(stored.url || raw);
    } catch (err) {
      console.warn("[refs] materialize failed, using original URL", {
        url: raw.slice(0, 120),
        error: err instanceof Error ? err.message : String(err),
      });
      out.push(raw);
    }
  }
  return out;
}

export type RefIntent = "character" | "product" | "logo" | "scene" | "mixed" | "generic";

export type ResolvedReferences = {
  intent: RefIntent;
  refs: string[]; // http(s) URLs, ordered: hero first, then details, then logo/scene
  matched: {
    castIds: string[];
    assetIds: string[];
    /** Names/labels that were matched, for logging. */
    names: string[];
  };
};

function norm(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function dedupeHttp(urls: string[]): string[] {
  return Array.from(new Set(urls.filter((u) => /^https?:/.test(u))));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHARACTER_HINTS =
  /\b(wear|wearing|dress|gown|outfit|clothes|hair|hairstyle|beard|makeup|look|looks|appearance|face|body|portrait)\b/i;
const PRODUCT_HINTS =
  /\b(product|shoe|sneaker|loafer|boot|handbag|bag|purse|watch|bottle|can|package|packaging|jar|box|garment|jacket|dress|apparel|item|sku)\b/i;
const LOGO_HINTS = /\b(logo|wordmark|monogram|emblem|brand mark)\b/i;
const SCENE_HINTS =
  /\b(scene|environment|backdrop|background|setting|location|room|street|studio set)\b/i;

async function resolveLibraryCharacterImageUrl(
  characterId: string,
  userId: string,
): Promise<string> {
  if (!UUID_RE.test(characterId)) return "";
  const { data } = await supabaseAdmin
    .from("characters")
    .select("image_url, image_storage_path")
    .eq("id", characterId)
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { image_url?: string | null; image_storage_path?: string | null } | null;
  if (row?.image_storage_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from("project-assets")
      .createSignedUrl(row.image_storage_path, 60 * 60 * 24 * 7);
    if (signed?.signedUrl) return signed.signedUrl;
  }
  return row?.image_url ?? "";
}

function assetIsUsableHttp(a: ProjectAsset, byId: Map<string, string>): string {
  if (a.url && /^https?:/.test(a.url)) return a.url;
  const u = byId.get(a.id);
  return u && /^https?:/.test(u) ? u : "";
}

export type ResolveRenderReferencesInput = {
  state: ProjectState;
  prompt: string;
  mode: "image" | "video" | "speech" | "audio";
  assetUrlById: Map<string, string>;
  userId: string;
  /** Optional explicit refs the tool caller passed. Always included first. */
  explicitUrls?: string[];
  explicitAssetIds?: string[];
  /** Cap the total number of refs. Video defaults to 4, image to 6. */
  max?: number;
};

/**
 * Resolve a ranked set of reference images for an Agent Mode render.
 *
 * Priority order:
 *   1. Explicit URLs / asset IDs the agent passed on this tool call.
 *   2. Named matches — assets or cast whose name/label appears in the prompt.
 *   3. If the prompt clearly targets a product (PRODUCT_HINTS), all
 *      product-flavoured assets (kind === "reference" | "logo" | "keyframe")
 *      NOT tied to a specific cast member.
 *   4. If the prompt targets a character (single-cast + CHARACTER_HINTS),
 *      the cast portrait.
 *   5. Nothing — return generic.
 *
 * Intent is inferred from what actually matched, not from a global guess.
 */
export async function resolveRenderReferences(
  input: ResolveRenderReferencesInput,
): Promise<ResolvedReferences> {
  const { state, prompt, mode, assetUrlById, userId, explicitUrls, explicitAssetIds } = input;
  const cap = input.max ?? (mode === "video" ? 4 : 6);
  const haystack = norm(prompt);

  const refs: string[] = [];
  const matchedCastIds = new Set<string>();
  const matchedAssetIds = new Set<string>();
  const matchedNames = new Set<string>();

  // 1) Explicit refs from the tool call.
  for (const url of explicitUrls ?? []) {
    if (/^https?:/.test(url)) refs.push(url);
  }
  for (const id of explicitAssetIds ?? []) {
    const u = assetUrlById.get(id);
    if (u && /^https?:/.test(u)) {
      refs.push(u);
      matchedAssetIds.add(id);
    }
  }

  // 2a) Cast name matches.
  const castHits: string[] = [];
  for (const c of state.cast) {
    const name = norm(c.name || "");
    if (!name || !haystack.includes(name)) continue;
    matchedCastIds.add(c.id);
    matchedNames.add(c.name || "");
    const ref = c.ref || "";
    const url = assetUrlById.get(ref) || (/^https?:/.test(ref) ? ref : "");
    if (url) {
      castHits.push(url);
    } else if (UUID_RE.test(ref)) {
      const libraryUrl = await resolveLibraryCharacterImageUrl(ref, userId);
      if (libraryUrl) castHits.push(libraryUrl);
    }
  }

  // 2b) Asset name/label matches.
  const namedAssetHits: string[] = [];
  const namedAssetKinds: string[] = [];
  for (const a of state.assets) {
    const label = norm(`${a.name || ""} ${a.label || ""}`);
    if (!label) continue;
    // Match on whole tokens: split label into 2+ char tokens and require
    // the prompt to contain at least one.
    const tokens = label.split(" ").filter((t) => t.length >= 3);
    const hit = tokens.some((t) => haystack.includes(t));
    if (!hit) continue;
    const u = assetIsUsableHttp(a, assetUrlById);
    if (!u) continue;
    // Skip if it's a cast likeness we already pulled — cast wins that slot.
    if (a.kind === "likeness" && a.attachedTo && matchedCastIds.has(a.attachedTo)) continue;
    namedAssetHits.push(u);
    namedAssetKinds.push(a.kind);
    matchedAssetIds.add(a.id);
    matchedNames.add(a.name || a.label || "");
  }

  // 2c) Library subject name matches (reusable Characters / Products /
  // Scenes / Logos / brand assets). We scan the user's Library and pull
  // any subject whose name or alias appears in the prompt.
  const subjectHits: string[] = [];
  const subjectHitKinds: string[] = [];
  try {
    const { data: subjectRows } = await supabaseAdmin
      .from("library_subjects")
      .select("id, name, aliases, kind, primary_asset_url, primary_asset_storage_path, reference_urls")
      .eq("user_id", userId);
    for (const row of (subjectRows ?? []) as Array<{
      id: string;
      name: string;
      aliases: string[] | null;
      kind: string;
      primary_asset_url: string | null;
      primary_asset_storage_path: string | null;
      reference_urls: string[] | null;
    }>) {
      const names = [row.name, ...(row.aliases ?? [])].filter(Boolean).map(norm).filter((n) => n.length >= 3);
      const hit = names.some((n) => haystack.includes(n));
      if (!hit) continue;
      let primaryUrl = row.primary_asset_url ?? "";
      if (row.primary_asset_storage_path) {
        const { data: signed } = await supabaseAdmin.storage
          .from("project-assets")
          .createSignedUrl(row.primary_asset_storage_path, 60 * 60 * 24 * 7);
        if (signed?.signedUrl) primaryUrl = signed.signedUrl;
      }
      if (primaryUrl && /^https?:/.test(primaryUrl)) {
        subjectHits.push(primaryUrl);
        subjectHitKinds.push(row.kind);
        matchedNames.add(row.name);
      }
      for (const u of row.reference_urls ?? []) {
        if (/^https?:/.test(u)) {
          subjectHits.push(u);
          subjectHitKinds.push(row.kind);
        }
      }
    }
  } catch {
    // Non-fatal — library_subjects may not exist during transitional deploys.
  }

  // Merge subject hits into the appropriate bucket (products lead when
  // product-y, characters lead otherwise).
  for (const u of subjectHits) if (!refs.includes(u)) refs.push(u);
  for (const k of subjectHitKinds) namedAssetKinds.push(k === "character" ? "likeness" : k === "logo" || k === "brand_asset" ? "logo" : "reference");


  // Merge — cast portrait typically the identity anchor, but for
  // product-hint prompts, product refs should lead.
  const promptWantsProduct = PRODUCT_HINTS.test(prompt);
  const promptWantsLogo = LOGO_HINTS.test(prompt);
  const promptWantsScene = SCENE_HINTS.test(prompt);
  const promptWantsCharacter = CHARACTER_HINTS.test(prompt);

  if (promptWantsProduct || promptWantsLogo || promptWantsScene) {
    for (const u of namedAssetHits) if (!refs.includes(u)) refs.push(u);
    for (const u of castHits) if (!refs.includes(u)) refs.push(u);
  } else {
    for (const u of castHits) if (!refs.includes(u)) refs.push(u);
    for (const u of namedAssetHits) if (!refs.includes(u)) refs.push(u);
  }

  // 3) Product fallback — if the prompt reads product-y but nothing matched
  // by name, pull ALL product-flavoured assets that aren't cast likenesses.
  if (refs.length === 0 && promptWantsProduct) {
    for (const a of state.assets) {
      if (a.kind === "likeness") continue;
      if (a.kind !== "reference" && a.kind !== "logo" && a.kind !== "keyframe") continue;
      const u = assetIsUsableHttp(a, assetUrlById);
      if (u && !refs.includes(u)) {
        refs.push(u);
        matchedAssetIds.add(a.id);
      }
    }
  }

  // 4) Logo fallback.
  if (refs.length === 0 && promptWantsLogo) {
    for (const a of state.assets) {
      if (a.kind !== "logo") continue;
      const u = assetIsUsableHttp(a, assetUrlById);
      if (u && !refs.includes(u)) {
        refs.push(u);
        matchedAssetIds.add(a.id);
      }
    }
  }

  // 5) Character fallback — narrow, only when the prompt clearly asks for
  // a character edit AND there's exactly one cast member.
  if (refs.length === 0 && promptWantsCharacter && state.cast.length === 1) {
    const c = state.cast[0];
    const ref = c.ref || "";
    const url = assetUrlById.get(ref) || (/^https?:/.test(ref) ? ref : "");
    if (url) {
      refs.push(url);
      matchedCastIds.add(c.id);
    } else if (UUID_RE.test(ref)) {
      const libraryUrl = await resolveLibraryCharacterImageUrl(ref, userId);
      if (libraryUrl) {
        refs.push(libraryUrl);
        matchedCastIds.add(c.id);
      }
    }
  }

  // Infer intent from what actually matched + prompt hints.
  let intent: RefIntent = "generic";
  const hasCast = matchedCastIds.size > 0;
  const hasProductAsset = namedAssetKinds.some((k) => k === "reference" || k === "keyframe");
  const hasLogoAsset = namedAssetKinds.some((k) => k === "logo");
  if (hasCast && (hasProductAsset || hasLogoAsset)) intent = "mixed";
  else if (promptWantsLogo || hasLogoAsset) intent = "logo";
  else if (promptWantsProduct || hasProductAsset) intent = "product";
  else if (promptWantsScene) intent = "scene";
  else if (hasCast || promptWantsCharacter) intent = "character";

  const finalRefs = dedupeHttp(refs).slice(0, cap);

  return {
    intent,
    refs: finalRefs,
    matched: {
      castIds: Array.from(matchedCastIds),
      assetIds: Array.from(matchedAssetIds),
      names: Array.from(matchedNames),
    },
  };
}

/**
 * Return an intent-specific prompt suffix. The old code always injected
 * "preserve face/hair/skin tone" — wrong for products/logos and the direct
 * cause of the SL loafer / Nike drift.
 */
export function promptSuffixForIntent(intent: RefIntent, hasRefs: boolean): string {
  if (!hasRefs) return "";
  switch (intent) {
    case "character":
      return "\n\nIMPORTANT: The provided image(s) are the character's likeness reference. Match the exact face, hair, skin tone, body type, and identifying features. Preserve identity; change only the requested wardrobe/appearance/pose details.";
    case "product":
      return "\n\nIMPORTANT: The provided image(s) are the exact product to feature. Preserve the product's silhouette, materials, stitching, hardware, colorway, logos, proportions, and every branded detail. Do NOT restyle, redesign, or substitute a generic version of the product.";
    case "logo":
      return "\n\nIMPORTANT: The provided image is the brand logo. Reproduce it exactly — do NOT redraw, re-letter, or reinterpret it. Composite it as-is where the prompt calls for it.";
    case "scene":
      return "\n\nIMPORTANT: The provided image(s) are the scene/environment reference. Match the location, lighting, palette, and composition.";
    case "mixed":
      return "\n\nIMPORTANT: The provided images include BOTH the character's likeness AND the exact product/brand assets. Preserve the character's face and identifying features AND preserve every branded detail of the product — silhouette, materials, stitching, hardware, colorway, logos. Do NOT substitute a generic product.";
    default:
      return "\n\nIMPORTANT: Treat the provided image(s) as the authoritative visual reference and match them faithfully.";
  }
}

/**
 * Given a base fal model id and a list of refs, return the model + input
 * shape adjusted for reference conditioning.
 *
 * The critical fix: video renders were previously sending only refs[0] as
 * `image_url`, silently discarding additional product/logo/scene angles.
 * Seedance's reference-to-video endpoint accepts up to 4 refs.
 */
export function applyReferencesToModelBody(
  model: string,
  mode: "image" | "video" | "speech" | "audio",
  refs: string[],
  body: Record<string, unknown>,
): { model: string; body: Record<string, unknown> } {
  if (!refs.length) return { model, body };

  if (mode === "image") {
    // Pika image edit endpoints take image_urls[]. Upgrade text-to-image
    // endpoints so the supplied reference is actually conditioned on.
    let upgradedModel = normalizePikaModelPath(model);
    upgradedModel = upgradedModel
      .replace(/\/text-to-image$/, "/image-to-image")
      .replace(/\/edit$/, "/image-to-image");
    return { model: upgradedModel, body: { ...body, image_urls: refs } };
  }


  if (mode === "video") {
    const normalizedSeedance = model
      .replace(/^fal-ai\//, "")
      .replace("bytedance/seedance-2.0/mini/", "bytedance/seedance-2.0-mini/")
      .replace("bytedance/seedance-2.0/fast/", "bytedance/seedance-2.0-fast/");
    if (/^bytedance\/seedance-2\.0(?:-mini|-fast)?\/(?:text-to-video|reference-to-video)$/.test(normalizedSeedance)) {
      const prompt = String(body.prompt ?? "");
      const labels = refs
        .slice(0, 9)
        .map((_, index) =>
          index === 0
            ? `@Image${index + 1} is the primary identity/product/anchor reference`
            : `@Image${index + 1} is a supporting angle or detail reference`,
        )
        .join("; ");
      return {
        model: normalizedSeedance.replace(/\/text-to-video$/, "/reference-to-video"),
        body: {
          ...body,
          prompt: /@Image1\b/.test(prompt) ? prompt : `${prompt}\n\nReference mapping: ${labels}.`,
          image_urls: refs.slice(0, 9),
        },
      };
    }
    // Pika 2.5 text-to-video → image-to-video.
    if (model === "pika/pika-2.5/text-to-video" || model === "pika/pika-2.5/image-to-video") {
      return {
        model: "pika/pika-2.5/image-to-video",
        body: { ...body, image: refs[0] },
      };
    }
    // Veo text-to-video → image-to-video (single reference).
    if (
      model === "fal-ai/veo3" ||
      model === "google/veo-3.1/text-to-video" ||
      model === "google/veo-3.1-fast/text-to-video"
    ) {
      return {
        model: "google/veo-3.1-lite/image-to-video",
        body: { ...body, image_url: refs[0] },
      };
    }
    if (model === "fal-ai/veo3/image-to-video" || model === "google/veo-3.1-lite/image-to-video") {
      return { model: "google/veo-3.1-lite/image-to-video", body: { ...body, image_url: refs[0] } };
    }
    // Kling text-to-video → image-to-video.
    if (/^kling\/kling-v3\/(?:standard|pro)\/(?:text-to-video|image-to-video)$/.test(model)) {
      return {
        model: model.replace(/\/text-to-video$/, "/image-to-video"),
        body: { ...body, image: refs[0] },
      };
    }
    if (model === "fal-ai/kling-video/v2.5-turbo/pro/text-to-video") {
      return {
        model: "kling/kling-v3/pro/image-to-video",
        body: { ...body, image: refs[0] },
      };
    }
    // Unknown video model — best effort: single image_url.
    return { model, body: { ...body, image_url: refs[0] } };
  }

  // speech / audio → refs don't apply.
  return { model, body };
}

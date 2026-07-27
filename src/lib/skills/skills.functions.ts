// @ts-nocheck — legacy feature file; feature tables (characters, library_subjects, render_jobs, etc.) are not part of the projects-first Supabase migration.
// Server functions for the unified Skills registry.
//
// Callers get a merged view of built-in Model/App skills from
// public.agent_skills and user-authored skills from public.skills. Everything
// the launcher, AssetPickerDialog, public library page, and run_skill tool
// reads flows through listSkills / getSkill here.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLocalClient as createClient } from "@/lib/local-database-shim";
import type { Database } from "@/integrations/supabase/types";
import { createAgentAppRegistry } from "@/lib/agent/app-registry";
import { loadAgentSkills } from "@/lib/skills/agent-skill-registry.server";
import {
  createBuiltinSkills,
  filterBuiltins,
  getBuiltinSkill,
  type Skill,
  type SkillManifest,
} from "./registry";

async function loadBuiltinSkills(): Promise<Skill[]> {
  return createBuiltinSkills(createAgentAppRegistry(await loadAgentSkills()));
}

type SkillRow = Database["public"]["Tables"]["skills"]["Row"];

function rowToSkill(row: SkillRow): Skill {
  const manifest = (row.manifest ?? {}) as unknown as SkillManifest;
  return {
    id: row.id,
    slug: row.slug,
    version: row.version,
    source: row.source as Skill["source"],
    name: row.name,
    oneLiner: row.one_liner ?? "",
    manifest,
    bodyMd: row.body_md ?? undefined,
    category: row.category ?? undefined,
    tags: row.tags ?? [],
    coverAssetId: row.cover_asset_id ?? null,
    authorId: row.author_id ?? null,
    visibility: (row.visibility as Skill["visibility"]) ?? "private",
    installCount: row.install_count ?? 0,
  };
}

/**
 * Batch-resolve signed cover URLs for user skills that have a coverAssetId.
 * Mutates a copy of the input list and returns it. Best-effort — failures
 * leave coverUrl unset so callers can fall back to placeholder UI.
 */
async function attachCoverUrls(skills: Skill[]): Promise<Skill[]> {
  const withCover = skills.filter((s) => s.coverAssetId);
  if (!withCover.length) return skills;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = Array.from(new Set(withCover.map((s) => s.coverAssetId!)));
    const { data: rows } = await supabaseAdmin
      .from("project_assets")
      .select("id, url, storage_path, mime")
      .in("id", ids);
    if (!rows?.length) return skills;
    const { signAssetUrls } = await import("@/lib/projects.functions");
    const signed = await signAssetUrls(
      rows.map((r) => ({ url: r.url, storage_path: r.storage_path })),
    );
    const byId = new Map<string, { url: string | null; mime: string | null }>();
    rows.forEach((r, i) => byId.set(r.id, { url: signed[i] ?? null, mime: r.mime ?? null }));
    return skills.map((s) => {
      if (!s.coverAssetId) return s;
      const hit = byId.get(s.coverAssetId);
      if (!hit) return s;
      return { ...s, coverUrl: hit.url, coverMime: hit.mime };
    });
  } catch {
    return skills;
  }
}

export type ListSkillsInput = {
  source?: Skill["source"] | Skill["source"][];
  category?: string;
  query?: string;
  /** When true, only return skills the caller has installed (user skills + built-ins). */
  installedOnly?: boolean;
  /** When true, include public user skills authored by others. */
  includePublic?: boolean;
};

/**
 * List skills visible to the caller.
 *
 * Signed-in: built-ins + their own private user skills + (optional) all public user skills.
 * Signed-out: built-ins + public user skills.
 */
export const listSkills = createServerFn({ method: "POST" })
  .inputValidator((input: ListSkillsInput | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const builtins = filterBuiltins(await loadBuiltinSkills(), data);

    const supabase = createClient<Database>({
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    let userSkills: Skill[] = [];
    if (data.includePublic !== false) {
      let q = supabase
        .from("skills")
        .select("*")
        .eq("source", "user")
        .eq("visibility", "public")
        .order("install_count", { ascending: false })
        .limit(200);
      if (data.category) q = q.eq("category", data.category);
      if (data.query) q = q.ilike("name", `%${data.query}%`);
      const { data: rows } = await q;
      userSkills = (rows ?? []).map(rowToSkill);

      // Attribution comes from the migrated workspace profiles.
      const authorIds = Array.from(
        new Set(userSkills.map((s) => s.authorId).filter((x): x is string => !!x)),
      );
      if (authorIds.length) {
        try {
          const { getUserDisplayProfile } = await import("@/lib/user-profile.server");
          const infoById = new Map<string, { name: string; avatarUrl: string | null }>();
          await Promise.all(
            authorIds.map(async (id) => {
              const profile = await getUserDisplayProfile(id);
              if (profile.name) {
                infoById.set(id, {
                  name: profile.name,
                  avatarUrl: profile.avatarUrl,
                });
              }
            }),
          );
          userSkills = userSkills.map((s) =>
            s.authorId
              ? {
                  ...s,
                  authorName: infoById.get(s.authorId)?.name ?? null,
                  authorAvatarUrl: infoById.get(s.authorId)?.avatarUrl ?? null,
                }
              : s,
          );
        } catch {
          // ignore attribution failures
        }
      }
    }

    // Return built-ins first, then public user skills (with resolved covers).
    userSkills = await attachCoverUrls(userSkills);
    return { skills: [...builtins, ...userSkills] };
  });

/**
 * List the caller's own skills (private + unlisted + public they authored) plus their pinned installs.
 */
export const listMySkills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [mine, installs] = await Promise.all([
      supabase
        .from("skills")
        .select("*")
        .eq("author_id", userId)
        .order("updated_at", { ascending: false }),
      supabase.from("skill_installs").select("skill_id, pinned").eq("user_id", userId),
    ]);
    let authored = (mine.data ?? []).map(rowToSkill);

    // Attribution: attach the caller's display name + avatar to their own skills
    // so "My Skills" cards render "By <name>" the same way public skills do.
    if (authored.length) {
      try {
        const { getUserDisplayProfile } = await import("@/lib/user-profile.server");
        const profile = await getUserDisplayProfile(userId);
        if (profile.name) {
          authored = authored.map((s) => ({
            ...s,
            authorName: profile.name,
            authorAvatarUrl: profile.avatarUrl,
          }));
        }
      } catch {
        // ignore attribution failures
      }
    }

    return {
      authored: await attachCoverUrls(authored),
      installs: installs.data ?? [],
    };
  });

export type GetSkillInput = { slug: string };

/** Resolve a skill by slug — built-in first, then DB. */
export const getSkill = createServerFn({ method: "POST" })
  .inputValidator((input: GetSkillInput) => input)
  .handler(async ({ data }) => {
    const builtin = getBuiltinSkill(await loadBuiltinSkills(), data.slug);
    if (builtin) return { skill: builtin };

    const supabase = createClient<Database>({
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: row } = await supabase
      .from("skills")
      .select("*")
      .eq("slug", data.slug)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { skill: row ? rowToSkill(row) : null };
  });

/**
 * Resolve a skill's hero/cover media (URL + mime) plus name/one-liner for
 * inline preview when the agent kicks off a skill.
 * - Built-in skills (SKILL_BY_ID): use heroVideoUrl / heroImageUrl, and if
 *   missing, fall back to APP_SHOWCASES[id]?.heroVideoUrl so the same hero
 *   media surfaced on the Apps page also appears here.
 * - User skills: resolve coverAssetId → signed URL via project_assets.
 */
export const getSkillCover = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .handler(
    async ({
      data,
    }): Promise<{ url?: string; mime?: string; name?: string; oneLiner?: string } | null> => {
      // Built-in lookup uses the client-side SKILL_BY_ID map plus APP_SHOWCASES.
      // Skill slugs come from two registries with different id conventions:
      //   - src/lib/skills.ts uses ids like "app-anime-world-cup-2026"
      //   - src/lib/agent/app-registry.ts uses ids like "anime-world-cup"
      // Try both so hero media resolves regardless of which registry the caller
      // pulled the slug from.
      const { SKILL_BY_ID } = await import("@/lib/skills");
      const { APP_SHOWCASES } = await import("@/lib/v2/app-showcases");
      const slug = data.slug;
      const candidateKeys = [slug, `app-${slug}`, `app-${slug}-2026`];
      const builtin = candidateKeys.map((k) => SKILL_BY_ID[k]).find(Boolean);
      let showcase = builtin ? APP_SHOWCASES[builtin.id] : undefined;
      if (!showcase) {
        for (const k of candidateKeys) {
          if (APP_SHOWCASES[k]) {
            showcase = APP_SHOWCASES[k];
            break;
          }
        }
      }
      if (builtin || showcase) {
        const videoUrl = builtin?.heroVideoUrl ?? showcase?.heroVideoUrl;
        const name = builtin?.label ?? showcase?.title;
        const oneLiner = builtin?.description ?? showcase?.subtitle;
        if (videoUrl) {
          return { url: videoUrl, mime: "video/mp4", name, oneLiner };
        }
        if (builtin?.heroImageUrl) {
          return { url: builtin.heroImageUrl, mime: "image/jpeg", name, oneLiner };
        }
        return { name, oneLiner };
      }

      const supabase = createClient<Database>({
        auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      });
      const { data: skillRow } = await supabase
        .from("skills")
        .select("cover_asset_id, name, one_liner")
        .eq("slug", data.slug)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!skillRow) return null;
      const meta = { name: skillRow.name, oneLiner: skillRow.one_liner ?? undefined };
      if (!skillRow.cover_asset_id) return meta;

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: assetRow } = await supabaseAdmin
        .from("project_assets")
        .select("url, storage_path, mime")
        .eq("id", skillRow.cover_asset_id)
        .maybeSingle();
      if (!assetRow) return meta;
      const { signAssetUrls } = await import("@/lib/projects.functions");
      const [signed] = await signAssetUrls([
        { url: assetRow.url, storage_path: assetRow.storage_path },
      ]);
      return { ...meta, url: signed, mime: assetRow.mime ?? "image/jpeg" };
    },
  );

export type UpsertUserSkillInput = {
  slug: string;
  name: string;
  oneLiner?: string;
  visibility?: "private" | "unlisted" | "public";
  manifest: SkillManifest;
  bodyMd?: string;
  category?: string;
  tags?: string[];
  coverAssetId?: string | null;
};

/** Create or update a user-authored skill. Slug is unique per author. */
export const upsertUserSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpsertUserSkillInput) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Refuse to shadow a built-in.
    if (getBuiltinSkill(await loadBuiltinSkills(), data.slug)) {
      throw new Error(`Slug "${data.slug}" is reserved by a built-in skill.`);
    }

    const { data: existing } = await supabase
      .from("skills")
      .select("id, version, author_id")
      .eq("slug", data.slug)
      .eq("author_id", userId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = {
      slug: data.slug,
      name: data.name,
      one_liner: data.oneLiner ?? null,
      source: "user" as const,
      author_id: userId,
      visibility: data.visibility ?? "private",
      manifest:
        data.manifest as unknown as Database["public"]["Tables"]["skills"]["Row"]["manifest"],
      body_md: data.bodyMd ?? null,
      category: data.category ?? null,
      tags: data.tags ?? [],
      cover_asset_id: data.coverAssetId ?? null,
    };

    if (existing) {
      const { data: row, error } = await supabase
        .from("skills")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      return { skill: rowToSkill(row) };
    }
    const { data: row, error } = await supabase
      .from("skills")
      .insert({ ...payload, version: 1 })
      .select("*")
      .single();
    if (error) throw error;
    return { skill: rowToSkill(row) };
  });

/** Install (or update pin) for a public skill. */
export const installSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { skillId: string; pinned?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("skill_installs")
      .upsert(
        { skill_id: data.skillId, user_id: userId, pinned: data.pinned ?? true },
        { onConflict: "skill_id,user_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

/** Uninstall a skill for the current user. */
export const uninstallSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { skillId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("skill_installs")
      .delete()
      .eq("skill_id", data.skillId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

/** Permanently delete a user-authored skill (author only). */
export const deleteUserSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { skillId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("skills")
      .delete()
      .eq("id", data.skillId)
      .eq("author_id", userId);
    if (error) throw error;
    return { ok: true };
  });

/** Convenience: how many built-ins we ship (for tests / health). */
export const skillsHealth = createServerFn({ method: "GET" }).handler(async () => ({
  builtinCount: (await loadBuiltinSkills()).length,
}));

// ---------- skill_assets ----------

export type SkillAsset = {
  id: string;
  skillId: string;
  assetId: string;
  role: string;
  label: string | null;
  sortOrder: number;
  mime: string;
  name: string;
  url: string;
};

/** List the reference/attachment files bound to a skill, with signed URLs. */
export const listSkillAssets = createServerFn({ method: "POST" })
  .inputValidator((input: { skillId: string }) => input)
  .handler(async ({ data }): Promise<{ assets: SkillAsset[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("skill_assets")
      .select(
        "id, skill_id, asset_id, role, label, sort_order, project_assets(url, storage_path, mime, name)",
      )
      .eq("skill_id", data.skillId)
      .order("sort_order", { ascending: true });
    if (!rows?.length) return { assets: [] };
    const { signAssetUrls } = await import("@/lib/projects.functions");
    const flat = rows.map((r) => {
      const pa = (
        r as unknown as { project_assets: { url: string; storage_path: string | null } | null }
      ).project_assets;
      return { url: pa?.url ?? "", storage_path: pa?.storage_path ?? null };
    });
    const signed = await signAssetUrls(flat);
    return {
      assets: rows.map((r, i) => {
        const pa =
          (r as unknown as { project_assets: { mime: string | null; name: string | null } | null })
            .project_assets ?? null;
        return {
          id: r.id as string,
          skillId: r.skill_id as string,
          assetId: r.asset_id as string,
          role: (r.role as string) ?? "reference",
          label: (r.label as string | null) ?? null,
          sortOrder: (r.sort_order as number) ?? 0,
          mime: pa?.mime ?? "application/octet-stream",
          name: pa?.name ?? "file",
          url: signed[i] ?? "",
        };
      }),
    };
  });

/** Attach a project_asset to a skill (author only). */
export const attachSkillAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { skillId: string; assetId: string; role?: string; label?: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Verify caller owns the skill.
    const { data: skill } = await supabase
      .from("skills")
      .select("id, author_id")
      .eq("id", data.skillId)
      .maybeSingle();
    if (!skill || skill.author_id !== userId)
      throw new Error("Not authorized to modify this skill");
    const { data: existing } = await supabase
      .from("skill_assets")
      .select("sort_order")
      .eq("skill_id", data.skillId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (existing?.sort_order ?? -1) + 1;
    const { data: row, error } = await supabase
      .from("skill_assets")
      .insert({
        skill_id: data.skillId,
        asset_id: data.assetId,
        role: data.role ?? "reference",
        label: data.label ?? null,
        sort_order: nextOrder,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: row.id as string };
  });

/** Remove an attached asset from a skill (author only). */
export const detachSkillAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { skillAssetId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("skill_assets").delete().eq("id", data.skillAssetId);
    if (error) throw error;
    return { ok: true };
  });

/**
 * PUBLIC: fetch a single skill for the shareable /skills/$slug marketing page.
 * Returns built-in skills always, or user skills that are visibility=public.
 * Also resolves author display + hero media URL so the page can render
 * without extra round-trips.
 */
export type PublicSkillPage = {
  skill: Skill & {
    heroUrl?: string | null;
    heroMime?: string | null;
    heroKind?: "video" | "image" | null;
  };
} | null;

export const getPublicSkillBySlug = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .handler(async ({ data }): Promise<PublicSkillPage> => {
    let base: Skill | null = getBuiltinSkill(await loadBuiltinSkills(), data.slug) ?? null;

    if (!base) {
      const supabase = createClient<Database>({
        auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      });
      const { data: row } = await supabase
        .from("skills")
        .select("*")
        .eq("slug", data.slug)
        .eq("source", "user")
        .eq("visibility", "public")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!row) return null;
      base = rowToSkill(row);
    }

    if (!base) return null;

    // Attach author display for user skills.
    if (base.source === "user" && base.authorId) {
      try {
        const { getUserDisplayProfile } = await import("@/lib/user-profile.server");
        const profile = await getUserDisplayProfile(base.authorId);
        base = {
          ...base,
          authorName: profile.name,
          authorAvatarUrl: profile.avatarUrl,
        };
      } catch {
        /* best-effort */
      }
    }

    // Resolve hero media (reuses the same logic as getSkillCover).
    let heroUrl: string | null = null;
    let heroMime: string | null = null;
    let heroKind: "video" | "image" | null = null;
    try {
      const { SKILL_BY_ID } = await import("@/lib/skills");
      const { APP_SHOWCASES } = await import("@/lib/v2/app-showcases");
      const candidateKeys = [
        base.slug,
        `app-${base.slug}`,
        `app-${base.slug}-2026`,
        base.appRef,
      ].filter(Boolean) as string[];
      const builtin = candidateKeys.map((k) => SKILL_BY_ID[k]).find(Boolean);
      const showcase = candidateKeys.map((k) => APP_SHOWCASES[k]).find(Boolean);
      const videoUrl = builtin?.heroVideoUrl ?? showcase?.heroVideoUrl;
      if (videoUrl) {
        heroUrl = videoUrl;
        heroMime = "video/mp4";
        heroKind = "video";
      } else if (builtin?.heroImageUrl) {
        heroUrl = builtin.heroImageUrl;
        heroMime = "image/jpeg";
        heroKind = "image";
      } else if (base.coverAssetId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: assetRow } = await supabaseAdmin
          .from("project_assets")
          .select("url, storage_path, mime")
          .eq("id", base.coverAssetId)
          .maybeSingle();
        if (assetRow) {
          const { signAssetUrls } = await import("@/lib/projects.functions");
          const [signed] = await signAssetUrls([
            { url: assetRow.url, storage_path: assetRow.storage_path },
          ]);
          heroUrl = signed ?? null;
          heroMime = assetRow.mime ?? "image/jpeg";
          heroKind = (assetRow.mime ?? "").startsWith("video/") ? "video" : "image";
        }
      }
    } catch {
      /* best-effort */
    }

    return { skill: { ...base, heroUrl, heroMime, heroKind } };
  });

/**
 * OWNER-ONLY: same shape as getPublicSkillBySlug but for the caller's own
 * skills at any visibility. Powers the private "showcase" view where the
 * author can preview, edit, and toggle visibility before sharing.
 */
export const getOwnSkillBySlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { slug: string }) => input)
  .handler(async ({ data, context }): Promise<PublicSkillPage> => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("skills")
      .select("*")
      .eq("slug", data.slug)
      .eq("author_id", userId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) return null;
    let base = rowToSkill(row);

    // Attribution: attach caller's own display name/avatar for the "By …" row.
    try {
      const { getUserDisplayProfile } = await import("@/lib/user-profile.server");
      const profile = await getUserDisplayProfile(userId);
      base = {
        ...base,
        authorName: profile.name,
        authorAvatarUrl: profile.avatarUrl,
      };
    } catch {
      /* best-effort */
    }

    let heroUrl: string | null = null;
    let heroMime: string | null = null;
    let heroKind: "video" | "image" | null = null;
    if (base.coverAssetId) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: assetRow } = await supabaseAdmin
          .from("project_assets")
          .select("url, storage_path, mime")
          .eq("id", base.coverAssetId)
          .maybeSingle();
        if (assetRow) {
          const { signAssetUrls } = await import("@/lib/projects.functions");
          const [signed] = await signAssetUrls([
            { url: assetRow.url, storage_path: assetRow.storage_path },
          ]);
          heroUrl = signed ?? null;
          heroMime = assetRow.mime ?? "image/jpeg";
          heroKind = (assetRow.mime ?? "").startsWith("video/") ? "video" : "image";
        }
      } catch {
        /* best-effort */
      }
    }

    return { skill: { ...base, heroUrl, heroMime, heroKind } };
  });

/** Toggle visibility for a skill owned by the caller. */
export const setSkillVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { skillId: string; visibility: "private" | "unlisted" | "public" }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("skills")
      .update({ visibility: data.visibility })
      .eq("id", data.skillId)
      .eq("author_id", userId);
    if (error) throw error;
    return { ok: true };
  });

/**
 * PUBLIC: list public community shares tagged with this skill slug — used to
 * power the "Examples" grid on the shareable skill page.
 */
export type SkillExample = {
  id: string;
  videoUrl: string;
  thumbUrl: string | null;
  mime: string;
  width: number | null;
  height: number | null;
  projectTitle: string | null;
  userDisplayName: string | null;
  userAvatarUrl: string | null;
  createdAt: string;
};

export const listSkillExamples = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; limit?: number }) => input)
  .handler(async ({ data }): Promise<{ examples: SkillExample[] }> => {
    const supabase = createClient<Database>({
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    // The skill column on community_shares can hold either the slug
    // ("time-tourist") or the app_ref ("app-time-tourist"), so match both.
    const alt = data.slug.startsWith("app-") ? data.slug.slice(4) : `app-${data.slug}`;
    const { data: rows, error } = await supabase
      .from("community_shares")
      .select(
        "id, video_url, thumb_url, mime, width, height, project_title, user_display_name, user_avatar_url, created_at, skill",
      )
      .in("skill", [data.slug, alt])
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 24);
    if (error || !rows) return { examples: [] };

    const { signProjectAssetUrl } = await import("@/lib/project-assets.server");
    const examples: SkillExample[] = await Promise.all(
      rows.map(async (r) => {
        const [videoUrl, thumbUrl] = await Promise.all([
          signProjectAssetUrl(r.video_url).catch(() => null),
          signProjectAssetUrl(r.thumb_url).catch(() => null),
        ]);
        return {
          id: r.id as string,
          videoUrl: videoUrl ?? (r.video_url as string),
          thumbUrl: thumbUrl ?? (r.thumb_url as string | null),
          mime: r.mime as string,
          width: r.width as number | null,
          height: r.height as number | null,
          projectTitle: r.project_title as string | null,
          userDisplayName: r.user_display_name as string | null,
          userAvatarUrl: r.user_avatar_url as string | null,
          createdAt: r.created_at as string,
        };
      }),
    );
    return { examples };
  });

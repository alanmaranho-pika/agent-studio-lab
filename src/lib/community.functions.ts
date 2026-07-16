// Server functions backing the simple Community Showcase: users can share
// a clip from their timeline; the result is publicly visible on the
// logged-out home, the Jobs Discover section, and the logged-in home.

import { createServerFn } from "@tanstack/react-start";
import { createLocalClient as createClient } from "@/lib/local-database-shim";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type CommunityShare = {
  id: string;
  projectId: string | null;
  projectTitle: string | null;
  videoUrl: string;
  thumbUrl: string | null;
  mime: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  userId: string | null;
  userDisplayName: string | null;
  userAvatarUrl: string | null;
  createdAt: string;
  skill: string | null;
};

function publicSupabase() {
  return createClient<Database>(
    {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}


type ShareRow = {
  id: string;
  project_id: string | null;
  project_title: string | null;
  video_url: string;
  thumb_url: string | null;
  mime: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  user_id: string | null;
  user_display_name: string | null;
  user_avatar_url: string | null;
  created_at: string;
  skill: string | null;
};

function rowToShare(r: ShareRow): CommunityShare {
  return {
    id: r.id,
    projectId: r.project_id,
    projectTitle: r.project_title,
    videoUrl: r.video_url,
    thumbUrl: r.thumb_url,
    mime: r.mime,
    width: r.width,
    height: r.height,
    duration: r.duration ? Number(r.duration) : null,
    userId: r.user_id,
    userDisplayName: r.user_display_name,
    userAvatarUrl: r.user_avatar_url,
    createdAt: r.created_at,
    skill: r.skill,
  };
}

async function refreshShareMediaUrls(share: CommunityShare): Promise<CommunityShare> {
  const { signProjectAssetUrl } = await import("@/lib/project-assets.server");
  const [videoUrl, thumbUrl] = await Promise.all([
    signProjectAssetUrl(share.videoUrl).catch(() => null),
    signProjectAssetUrl(share.thumbUrl).catch(() => null),
  ]);
  return {
    ...share,
    videoUrl: videoUrl ?? share.videoUrl,
    thumbUrl: thumbUrl ?? share.thumbUrl,
  };
}



function displayNameFromEmail(email: string | null | undefined): string {
  if (!email) return "anon";
  const local = email.split("@")[0] ?? "anon";
  return local || "anon";
}

const ShareInput = z.object({
  projectId: z.string().uuid().nullable().optional(),
  videoUrl: z.string().url().max(2048),
  thumbUrl: z.string().url().max(2048).nullable().optional(),
  mime: z.string().max(80).default("video/mp4"),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  duration: z.number().positive().nullable().optional(),
});

export const shareToCommunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ShareInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    let projectTitle: string | null = null;
    let projectSkill: string | null = null;
    if (data.projectId) {
      const { data: proj } = await supabase
        .from("projects")
        .select("title, skill")
        .eq("id", data.projectId)
        .maybeSingle();
      projectTitle = proj?.title ?? null;
      projectSkill = proj?.skill ?? null;
    }

    // Persist the video into our own project-assets bucket if the incoming
    // URL points to a known-ephemeral host (Shotstack S3 expires output
    // URLs after ~24h, leading to broken community shares). We sign the
    // mirrored copy for 7 days; community feed callers re-sign on read
    // via a separate path if needed.
    let videoUrl = data.videoUrl;
    const isEphemeral = /shotstack-api-v[0-9]+-output\.s3[-.]/i.test(videoUrl) ||
      /fal\.media/i.test(videoUrl) ||
      /fal\.run/i.test(videoUrl);
    if (isEphemeral && data.projectId) {
      try {
        const { downloadAndStoreUrl } = await import(
          "@/lib/project-assets.server"
        );
        const stored = await downloadAndStoreUrl({
          projectId: data.projectId,
          userId,
          sourceUrl: data.videoUrl,
          kind: "final",
          label: "community-share",
          fallbackMime: data.mime,
        });
        videoUrl = stored.url;
      } catch (e) {
        console.error("[community] mirror share video failed", e);
        // Fall back to the original URL so the share still posts, even if
        // the mirror failed for some reason.
      }
    }

    const email =
      (claims as { email?: string } | null)?.email ??
      (claims as { user_metadata?: { email?: string } } | null)?.user_metadata?.email ??
      null;
    const meta = (claims as { user_metadata?: Record<string, unknown> } | null)?.user_metadata ?? {};
    const avatar =
      (meta.avatar_url as string | undefined) ??
      (meta.picture as string | undefined) ??
      null;
    const displayName = displayNameFromEmail(email);

    const { data: inserted, error } = await supabase
      .from("community_shares")
      .insert({
        user_id: userId,
        project_id: data.projectId ?? null,
        project_title: projectTitle,
        video_url: videoUrl,
        thumb_url: data.thumbUrl ?? null,
        mime: data.mime,
        width: data.width ?? null,
        height: data.height ?? null,
        duration: data.duration ?? null,
        user_display_name: displayName,
        user_avatar_url: avatar,
        skill: projectSkill,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

const SHARE_COLUMNS =
  "id, project_id, project_title, video_url, thumb_url, mime, width, height, duration, user_id, user_display_name, user_avatar_url, created_at, skill";


export const listCommunityShares = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => {
    const parsed = z
      .object({ limit: z.number().int().min(1).max(60).optional() })
      .partial()
      .parse(data ?? {});
    return parsed;
  })
  .handler(async ({ data }) => {
    const supabase = publicSupabase();
    const { data: rows, error } = await supabase
      .from("community_shares")
      .select(SHARE_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(data?.limit ?? 30);
    if (error) {
      console.error("[community] list failed", error);
      return { shares: [] as CommunityShare[] };
    }
    const shares: CommunityShare[] = await Promise.all(
      ((rows ?? []) as ShareRow[]).map((row) => refreshShareMediaUrls(rowToShare(row))),
    );
    return { shares };
  });

export const getCommunityShare = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = publicSupabase();
    const { data: row, error } = await supabase
      .from("community_shares")
      .select(SHARE_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) return { share: null as CommunityShare | null };
    const share = await refreshShareMediaUrls(rowToShare(row as ShareRow));
    return { share };
  });

export const deleteCommunityShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("community_shares")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

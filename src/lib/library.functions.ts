// @ts-nocheck — legacy feature file; feature tables (characters, library_subjects, render_jobs, etc.) are not part of the projects-first Supabase migration.
// Server functions backing the "My Library" surface. Everything is scoped
// to the authenticated user via project ownership.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { signAssetUrls, signImageThumbUrls } from "@/lib/projects.functions";

const REFERENCE_KINDS = ["reference", "likeness", "logo", "voice"] as const;
const GENERATION_KINDS = [
  "keyframe",
  "image",
  "video",
  "audio",
  "music",
  "voiceover",
  "final",
] as const;

type AssetRow = {
  id: string;
  project_id: string;
  kind: string;
  mime: string;
  name: string;
  url: string;
  storage_path: string | null;
  label: string | null;
  created_at: string;
};

export const listLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;

    // Get all of this user's project ids + titles.
    const { data: projects } = await context.supabase
      .from("projects")
      .select("id, title")
      .eq("user_id", userId);
    const projectIds = (projects ?? []).map((p) => p.id as string);
    const titleById = new Map<string, string>(
      (projects ?? []).map((p) => [p.id as string, p.title as string]),
    );

    if (projectIds.length === 0) {
      return { references: [], generations: [], queue: [], exports: [] };
    }

    const { data: assetRows } = await context.supabase
      .from("project_assets")
      .select(
        "id, project_id, kind, mime, name, url, storage_path, label, created_at",
      )
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });

    const rows = (assetRows ?? []) as AssetRow[];
    const signed = await signAssetUrls(rows);

    // Small transformed thumbnail URLs for image rows; null for non-images.
    const thumbs = await signImageThumbUrls(
      rows.map((r) => ({ storage_path: r.storage_path, mime: r.mime })),
      { width: 360, height: 360, quality: 65 },
    );

    const decorate = (r: AssetRow, i: number) => ({
      id: r.id,
      projectId: r.project_id,
      projectTitle: titleById.get(r.project_id) ?? "Untitled",
      kind: r.kind,
      mime: r.mime,
      name: r.name,
      url: signed[i] ?? r.url,
      thumbUrl: thumbs[i] ?? signed[i] ?? r.url,
      label: r.label,
      createdAt: r.created_at,
    });

    const references = rows
      .map((r, i) => [r, i] as const)
      .filter(([r]) => (REFERENCE_KINDS as readonly string[]).includes(r.kind))
      .map(([r, i]) => decorate(r, i));
    const generations = rows
      .map((r, i) => [r, i] as const)
      .filter(([r]) => (GENERATION_KINDS as readonly string[]).includes(r.kind))
      .map(([r, i]) => decorate(r, i));

    // In-flight queue: active render jobs.
    const { data: jobs } = await context.supabase
      .from("render_jobs")
      .select("id, project_id, status, error, created_at, updated_at")
      .in("project_id", projectIds)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false });

    // Pick a thumbnail per project: prefer most recent image asset (any kind),
    // fall back to the most recent asset with a thumbUrl.
    const thumbByProject = new Map<string, { url: string; mime: string }>();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (thumbByProject.has(r.project_id)) continue;
      const t = thumbs[i] ?? signed[i] ?? r.url;
      if (t) thumbByProject.set(r.project_id, { url: t, mime: r.mime });
    }

    const queue = (jobs ?? []).map((j) => ({
      id: j.id as string,
      projectId: j.project_id as string,
      projectTitle: titleById.get(j.project_id as string) ?? "Untitled",
      status: j.status as string,
      error: (j.error as string | null) ?? null,
      createdAt: j.created_at as string,
      updatedAt: j.updated_at as string,
      thumbUrl: thumbByProject.get(j.project_id as string)?.url ?? null,
      thumbMime: thumbByProject.get(j.project_id as string)?.mime ?? null,
    }));

    // Export renders (Shotstack jobs). Show recent regardless of status.
    const { data: exportJobs } = await context.supabase
      .from("export_jobs")
      .select("id, project_id, provider_render_id, status, progress, output_url, error, settings, created_at, updated_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false })
      .limit(50);

    // Refresh any in-flight jobs from Shotstack so progress/status moves
    // forward while the user sits on the library page.
    const inFlight = (exportJobs ?? []).filter(
      (j) =>
        j.provider_render_id &&
        j.status !== "done" &&
        j.status !== "failed",
    );
    if (inFlight.length > 0) {
      const { shotstackPollRender, statusProgress } = await import("@/lib/export.server");
      await Promise.all(
        inFlight.map(async (j) => {
          try {
            const poll = await shotstackPollRender(j.provider_render_id as string);
            const mapped =
              poll.status === "done"
                ? "done"
                : poll.status === "failed"
                  ? "failed"
                  : "rendering";
            const progress = statusProgress(poll.status);
            await context.supabase
              .from("export_jobs")
              .update({
                status: mapped,
                progress,
                output_url: poll.url ?? null,
                error: poll.error ?? null,
              })
              .eq("id", j.id);
            // Mutate in place so the response reflects the latest.
            (j as { status: string }).status = mapped;
            (j as { progress: number }).progress = progress;
            (j as { output_url: string | null }).output_url = poll.url ?? null;
            (j as { error: string | null }).error = poll.error ?? null;
          } catch {
            // ignore — next refetch will retry
          }
        }),
      );
    }

    // Mirror ephemeral provider URLs (Shotstack S3 expires after ~24h) to
    // permanent project-assets storage so the Exports section keeps working
    // beyond the provider TTL. Applies to any completed export still
    // pointing at an ephemeral host.
    const EPHEMERAL_RX =
      /(shotstack-api-v[0-9]+-output\.s3[-.]|fal\.media|fal\.run)/i;
    const toMirror = (exportJobs ?? []).filter(
      (j) =>
        j.status === "done" &&
        typeof j.output_url === "string" &&
        EPHEMERAL_RX.test(j.output_url as string),
    );
    if (toMirror.length > 0) {
      const { downloadAndStoreUrl } = await import(
        "@/lib/project-assets.server"
      );
      await Promise.all(
        toMirror.map(async (j) => {
          try {
            let stored: Awaited<ReturnType<typeof downloadAndStoreUrl>> | null = null;
            const sourceUrl = j.output_url as string;
            try {
              stored = await downloadAndStoreUrl({
                projectId: j.project_id as string,
                userId,
                sourceUrl,
                kind: "final",
                label: "export-mirror",
                fallbackMime: "video/mp4",
              });
            } catch (firstError) {
              if (!j.provider_render_id) throw firstError;
              const { shotstackPollRender } = await import("@/lib/export.server");
              const poll = await shotstackPollRender(j.provider_render_id as string);
              if (!poll.url || poll.url === sourceUrl) throw firstError;
              stored = await downloadAndStoreUrl({
                projectId: j.project_id as string,
                userId,
                sourceUrl: poll.url,
                kind: "final",
                label: "export-mirror",
                fallbackMime: "video/mp4",
              });
            }
            await context.supabase
              .from("export_jobs")
              .update({ output_url: stored.url })
              .eq("id", j.id);
            (j as { output_url: string | null }).output_url = stored.url;
          } catch (e) {
            console.error("[library] mirror export failed", j.id, e);
          }
        }),
      );
    }

    const storageExportUrls = (exportJobs ?? []).filter(
      (j) =>
        j.status === "done" &&
        typeof j.output_url === "string" &&
        /\/storage\/v1\/object\/(?:sign|public|authenticated)\/project-assets\//.test(
          j.output_url as string,
        ),
    );
    if (storageExportUrls.length > 0) {
      const { signProjectAssetUrl } = await import("@/lib/project-assets.server");
      await Promise.all(
        storageExportUrls.map(async (j) => {
          try {
            const freshUrl = await signProjectAssetUrl(j.output_url as string);
            if (freshUrl) (j as { output_url: string | null }).output_url = freshUrl;
          } catch (e) {
            console.error("[library] re-sign export failed", j.id, e);
          }
        }),
      );
    }




    const exports = (exportJobs ?? []).map((j) => {
      const settings = (j.settings as { format?: string } | null) ?? {};
      const format = typeof settings.format === "string" ? settings.format : "mp4";
      return {
        id: j.id as string,
        projectId: j.project_id as string,
        projectTitle: titleById.get(j.project_id as string) ?? "Untitled",
        status: j.status as string,
        progress: Number(j.progress) || 0,
        outputUrl: (j.output_url as string | null) ?? null,
        error: (j.error as string | null) ?? null,
        format,
        createdAt: j.created_at as string,
        updatedAt: j.updated_at as string,
      };
    });

    return { references, generations, queue, exports };
  });

// Slim version for the picker modal: assets only, no queue, no export jobs,
// no Shotstack polling. Much faster than listLibrary.
export const listLibraryAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;

    const { data: projects } = await context.supabase
      .from("projects")
      .select("id, title")
      .eq("user_id", userId);
    const projectIds = (projects ?? []).map((p) => p.id as string);
    const titleById = new Map<string, string>(
      (projects ?? []).map((p) => [p.id as string, p.title as string]),
    );

    if (projectIds.length === 0) {
      return { references: [], generations: [] };
    }

    const { data: assetRows } = await context.supabase
      .from("project_assets")
      .select(
        "id, project_id, kind, mime, name, url, storage_path, label, created_at",
      )
      .in("project_id", projectIds)
      .in("kind", [...REFERENCE_KINDS, ...GENERATION_KINDS])
      .order("created_at", { ascending: false })
      .limit(300);

    const rows = (assetRows ?? []) as AssetRow[];
    const [signed, thumbs] = await Promise.all([
      signAssetUrls(rows),
      signImageThumbUrls(
        rows.map((r) => ({ storage_path: r.storage_path, mime: r.mime })),
        { width: 360, height: 360, quality: 65 },
      ),
    ]);

    const decorate = (r: AssetRow, i: number) => ({
      id: r.id,
      projectId: r.project_id,
      projectTitle: titleById.get(r.project_id) ?? "Untitled",
      kind: r.kind,
      mime: r.mime,
      name: r.name,
      url: signed[i] ?? r.url,
      thumbUrl: thumbs[i] ?? signed[i] ?? r.url,
      label: r.label,
      createdAt: r.created_at,
    });

    const references = rows
      .map((r, i) => [r, i] as const)
      .filter(([r]) => (REFERENCE_KINDS as readonly string[]).includes(r.kind))
      .map(([r, i]) => decorate(r, i));
    const generations = rows
      .map((r, i) => [r, i] as const)
      .filter(([r]) => (GENERATION_KINDS as readonly string[]).includes(r.kind))
      .map(([r, i]) => decorate(r, i));

    return { references, generations };
  });
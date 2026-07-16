// @ts-nocheck — legacy feature file; feature tables (characters, library_subjects, render_jobs, etc.) are not part of the projects-first Supabase migration.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ProjectState } from "@/lib/project-state";

const settingsSchema = z.object({
  format: z.enum(["mp4", "gif", "webm", "mp3"]),
  resolution: z.enum(["480p", "720p", "1080p"]),
  fps: z.number().int().min(8).max(60),
  aspect: z.enum(["16:9", "9:16", "1:1", "4:5", "original"]),
  quality: z.enum(["low", "medium", "high"]),
  background: z.enum(["black", "white", "transparent"]),
  includeMusic: z.boolean(),
});

export type StartExportInput = {
  projectId: string;
  settings: z.infer<typeof settingsSchema>;
};

export const startExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: StartExportInput) =>
    z
      .object({
        projectId: z.string().uuid(),
        settings: settingsSchema,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signAssetUrls } = await import("@/lib/projects.functions");
    const { buildShotstackEdit, shotstackSubmitRender } = await import("@/lib/export.server");

    const userId = context.userId;

    // Load project + assets (scoped to the user)
    const { data: proj, error: pErr } = await supabaseAdmin
      .from("projects")
      .select("id, project_state")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!proj) throw new Error("Project not found");

    const { data: assetRows, error: aErr } = await supabaseAdmin
      .from("project_assets")
      .select("id, kind, mime, name, label, attached_to, width, height, duration, url, storage_path")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });
    if (aErr) throw new Error(aErr.message);

    const signed = await signAssetUrls(assetRows ?? []);
    const assets = (assetRows ?? []).map((r, i) => ({
      id: r.id as string,
      kind: (r.kind as string) ?? "other",
      mime: (r.mime as string) ?? "application/octet-stream",
      name: (r.name as string) ?? "asset",
      url: signed[i] ?? (r.url as string) ?? "",
      label: (r.label as string | null) ?? undefined,
      attachedTo: (r.attached_to as string | null) ?? undefined,
      width: (r.width as number | null) ?? undefined,
      height: (r.height as number | null) ?? undefined,
      duration: (r.duration as number | null) ?? undefined,
    }));

    const projectState = (proj.project_state as ProjectState | null) ?? null;

    const edit = buildShotstackEdit({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assets: assets as any,
      timeline: projectState?.timeline,
      settings: data.settings,
    });

    let providerRenderId: string | null = null;
    let initialStatus: "queued" | "failed" = "queued";
    let errorMsg: string | null = null;
    try {
      providerRenderId = await shotstackSubmitRender(edit);
    } catch (e) {
      initialStatus = "failed";
      errorMsg = e instanceof Error ? e.message : String(e);
    }

    const { data: jobRow, error: jErr } = await supabaseAdmin
      .from("export_jobs")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        provider: "shotstack",
        provider_render_id: providerRenderId,
        settings: data.settings,
        status: initialStatus,
        progress: initialStatus === "failed" ? 0 : 5,
        error: errorMsg,
      })
      .select("id")
      .single();
    if (jErr) throw new Error(jErr.message);

    return {
      jobId: jobRow.id as string,
      status: initialStatus,
      error: errorMsg,
    };
  });

export const getExportStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string }) =>
    z.object({ jobId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { shotstackPollRender, statusProgress } = await import("@/lib/export.server");

    const userId = context.userId;

    const { data: job, error } = await supabaseAdmin
      .from("export_jobs")
      .select("*")
      .eq("id", data.jobId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Export job not found");

    if (
      job.status === "done" ||
      job.status === "failed" ||
      !job.provider_render_id
    ) {
      let outputUrl = (job.output_url as string | null) ?? null;
      if (job.status === "done" && outputUrl) {
        const { signProjectAssetUrl } = await import("@/lib/project-assets.server");
        outputUrl = (await signProjectAssetUrl(outputUrl).catch(() => null)) ?? outputUrl;
      }
      return {
        id: job.id as string,
        status: job.status as string,
        progress: Number(job.progress) || 0,
        outputUrl,
        error: (job.error as string | null) ?? null,
        settings: job.settings,
      };
    }

    try {
      const poll = await shotstackPollRender(job.provider_render_id as string);
      const mappedStatus =
        poll.status === "done"
          ? "done"
          : poll.status === "failed"
            ? "failed"
            : "rendering";
      const progress = statusProgress(poll.status);
      let outputUrl = poll.url ?? null;
      if (mappedStatus === "done" && outputUrl) {
        const isEphemeral =
          /shotstack-api-v[0-9]+-output\.s3[-.]/i.test(outputUrl) ||
          /fal\.media/i.test(outputUrl) ||
          /fal\.run/i.test(outputUrl);
        if (isEphemeral) {
          try {
            const { downloadAndStoreUrl } = await import("@/lib/project-assets.server");
            const stored = await downloadAndStoreUrl({
              projectId: job.project_id as string,
              userId,
              sourceUrl: outputUrl,
              kind: "final",
              label: "export-mirror",
              fallbackMime: "video/mp4",
            });
            outputUrl = stored.url;
          } catch (mirrorError) {
            console.error("[export] mirror completed export failed", job.id, mirrorError);
          }
        }
      }
      await supabaseAdmin
        .from("export_jobs")
        .update({
          status: mappedStatus,
          progress,
          output_url: outputUrl,
          error: poll.error ?? null,
        })
        .eq("id", job.id);

      return {
        id: job.id as string,
        status: mappedStatus,
        progress,
        outputUrl,
        error: poll.error ?? null,
        settings: job.settings,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        id: job.id as string,
        status: job.status as string,
        progress: Number(job.progress) || 0,
        outputUrl: (job.output_url as string | null) ?? null,
        error: msg,
        settings: job.settings,
      };
    }
  });

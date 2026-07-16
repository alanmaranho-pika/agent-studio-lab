// Pika API integration (Parrot v0 — candy_2p5_final / pikai2v worker).
//
// Real spec (from Pika's test_pikai2v_complete.py):
//   POST https://parrot.pika.art/api/v1/generate/v0/pikai2v
//     headers: X-API-Key: pika_...
//     multipart form:
//       image:        <jpeg/png bytes>
//       promptText:   string
//       seed:         string (int)
//       resolution:   "720p" | "1080p"
//     -> { video_id: string }
//
//   GET  https://parrot.pika.art/api/v1/generate/v0/videos/{video_id}
//     -> { status: "queued" | "started" | "streaming" | "finished",
//          progress?: number,
//          url?: string }   // mp4 URL when status === "finished"
//
// Audio-to-video uses a sibling endpoint that we haven't been given a spec
// for yet; for now we only wire image-to-video. Pika Lipsync routes through
// pikai2v with the prompt describing the performance.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { downloadAndStoreUrl } from "@/lib/project-assets.server";
import type { ProjectState } from "@/lib/project-state";
import { applyPatch, INITIAL_PROJECT } from "@/lib/project-state";

const PIKA_BASE = "https://parrot.pika.art/api/v1/generate/v0";

// Model ids the studio knows about. The skill `model` field uses the
// `pika:` prefix so the dispatcher in apps-workspace can branch on it.
export const PIKA_MODELS = {
  i2v: "pika:image-to-video-v2",
  audio: "pika:audio-to-video",
} as const;

function pikaKey(): string {
  const key = process.env.PIKA_API_KEY;
  if (!key) throw new Error("Missing PIKA_API_KEY");
  return key;
}

const StartSchema = z.object({
  projectId: z.string().uuid(),
  model: z.string().min(3).max(255),
  prompt: z.string().min(1).max(8000),
  userMessageId: z.string().min(1).max(64),
  assistantMessageId: z.string().min(1).max(64),
  // Pika needs an input image URL. We fetch it server-side and upload as
  // multipart so the worker accepts it regardless of CORS / signed-URL TTL.
  imageUrl: z.string().url().optional(),
  audioUrl: z.string().url().optional(),
  params: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
    )
    .optional(),
});

function pickStr(
  params: Record<string, string | number | boolean | string[]> | undefined,
  key: string,
  fallback: string,
): string {
  const v = params?.[key];
  return v === undefined || v === null || v === "" ? fallback : String(v);
}

export const pikaGenerateStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => StartSchema.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");

    await supabaseAdmin.from("project_messages").upsert(
      {
        id: data.userMessageId,
        project_id: data.projectId,
        role: "user",
        parts: [{ type: "text", text: data.prompt }] as unknown as never,
      },
      { onConflict: "id" },
    );

    try {
      if (!data.imageUrl) {
        throw new Error("Pika needs an input image — attach one and try again.");
      }
      // Fetch the source image into memory.
      const imgRes = await fetch(data.imageUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!imgRes.ok) {
        throw new Error(`fetch input image ${imgRes.status}`);
      }
      const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
      const imgMime = imgRes.headers.get("content-type") ?? "image/jpeg";
      const ext = imgMime.includes("png") ? "png" : "jpg";

      const form = new FormData();
      form.append(
        "image",
        new Blob([imgBytes], { type: imgMime }),
        `image.${ext}`,
      );
      form.append("promptText", data.prompt);
      form.append("seed", pickStr(data.params, "seed", "42"));
      form.append("resolution", pickStr(data.params, "resolution", "720p"));

      const endpoint = `${PIKA_BASE}/pikai2v`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "X-API-Key": pikaKey() },
        body: form,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`pika ${res.status}: ${txt.slice(0, 400)}`);
      }
      const j = (await res.json()) as { video_id?: string };
      const jobId = j.video_id;
      if (!jobId) throw new Error("pika submit returned no video_id");
      return { ok: true as const, jobId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errorText = `Couldn't start Pika generation — ${msg}`;
      await supabaseAdmin.from("project_messages").upsert(
        {
          id: data.assistantMessageId,
          project_id: data.projectId,
          role: "assistant",
          parts: [{ type: "text", text: errorText }] as unknown as never,
        },
        { onConflict: "id" },
      );
      return { ok: false as const, error: msg, assistantText: errorText };
    }
  });

const PollSchema = z.object({
  projectId: z.string().uuid(),
  model: z.string().min(3).max(255),
  prompt: z.string().min(1).max(8000),
  assistantMessageId: z.string().min(1).max(64),
  jobId: z.string().min(1).max(128),
});

export const pikaGeneratePoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PollSchema.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("id, project_state")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");
    const state = (proj.project_state as ProjectState | null) ?? INITIAL_PROJECT;

    let sourceUrl: string | null = null;
    try {
      const res = await fetch(`${PIKA_BASE}/videos/${data.jobId}`, {
        headers: { "X-API-Key": pikaKey() },
      });
      if (res.status === 404 || res.status === 400) {
        throw new Error(`pika job not found (${res.status})`);
      }
      if (!res.ok) {
        // Transient — let the client poll again.
        return { ok: true as const, status: "pending" as const };
      }
      const j = (await res.json()) as {
        status?: string;
        url?: string;
        progress?: number | string;
      };
      const status = (j.status || "").toLowerCase();
      if (status === "queued" || status === "started" || status === "streaming") {
        return { ok: true as const, status: "pending" as const };
      }
      if (status !== "finished") {
        throw new Error(`pika job status=${status || "unknown"}`);
      }
      sourceUrl = j.url ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errorText = `Pika generation failed — ${msg}`;
      await supabaseAdmin.from("project_messages").upsert(
        {
          id: data.assistantMessageId,
          project_id: data.projectId,
          role: "assistant",
          parts: [{ type: "text", text: errorText }] as unknown as never,
        },
        { onConflict: "id" },
      );
      return { ok: false as const, status: "done" as const, error: msg, assistantText: errorText };
    }

    if (!sourceUrl) {
      const errorText = `Pika finished but returned no video URL.`;
      await supabaseAdmin.from("project_messages").upsert(
        {
          id: data.assistantMessageId,
          project_id: data.projectId,
          role: "assistant",
          parts: [{ type: "text", text: errorText }] as unknown as never,
        },
        { onConflict: "id" },
      );
      return { ok: false as const, status: "done" as const, error: errorText, assistantText: errorText };
    }

    const stored = await downloadAndStoreUrl({
      projectId: data.projectId,
      userId,
      sourceUrl,
      kind: "video",
      label: data.prompt.slice(0, 80),
      attachedTo: `run:${data.assistantMessageId}`,
      fallbackMime: "video/mp4",
    });

    const patch = {
      assetsAppend: [
        {
          id: stored.id,
          kind: "video" as const,
          mime: stored.mime,
          name: `${data.prompt.slice(0, 40)}.${stored.mime.split("/")[1] ?? "mp4"}`,
          url: stored.url,
          label: data.prompt.slice(0, 80),
          attachedTo: `run:${data.assistantMessageId}`,
        },
      ],
    };
    const assistantText = `<div data-card data-card-title="pika result"><script type="application/json" data-project-patch>${JSON.stringify(patch)}</script></div>`;

    await supabaseAdmin.from("project_messages").upsert(
      {
        id: data.assistantMessageId,
        project_id: data.projectId,
        role: "assistant",
        parts: [{ type: "text", text: assistantText }] as unknown as never,
      },
      { onConflict: "id" },
    );

    const next = applyPatch(state, patch as never);
    await supabaseAdmin
      .from("projects")
      .update({
        project_state: next as unknown as never,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.projectId)
      .eq("user_id", userId);

    return {
      ok: true as const,
      status: "done" as const,
      assistantText,
      assetId: stored.id,
      assetUrl: stored.url,
      mime: stored.mime,
    };
  });

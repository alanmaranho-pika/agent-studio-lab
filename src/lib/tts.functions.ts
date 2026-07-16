// Server function to synthesize speech via ElevenLabs (through fal) and
// persist the result as a project asset. Used by Talking Head Studio's
// "Generate Audio" tab.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { falGenerateVoiceover } from "@/lib/fal.server";
import { downloadAndStoreUrl } from "@/lib/project-assets.server";
import type { ProjectAsset } from "@/lib/project-state";

const Input = z.object({
  projectId: z.string().uuid(),
  text: z.string().trim().min(1).max(2000),
  voice: z.string().min(1).max(64).optional(),
});

export const generateVoiceoverAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }): Promise<ProjectAsset> => {
    const userId = context.userId;
    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");

    const sourceUrl = await falGenerateVoiceover({
      text: data.text,
      voice: data.voice,
    });
    const stored = await downloadAndStoreUrl({
      projectId: data.projectId,
      userId,
      sourceUrl,
      kind: "voiceover",
      label: data.text.slice(0, 80),
      fallbackMime: "audio/mpeg",
    });
    return {
      id: stored.id,
      kind: "voiceover",
      mime: stored.mime,
      name: `${data.text.slice(0, 40) || "voiceover"}.${stored.mime.split("/")[1] ?? "mp3"}`,
      url: stored.url,
      label: data.text.slice(0, 80),
    };
  });

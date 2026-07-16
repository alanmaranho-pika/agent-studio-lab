import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

// Auto-name a project from the prompt that produced its first output.
// Only renames when the current title is still the placeholder (the app
// label or "Untitled project"); user-edited titles are left alone.
export const autoTitleProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; prompt: string; appLabel?: string; titleHint?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        prompt: z.string().min(1).max(8000),
        appLabel: z.string().max(120).optional(),
        titleHint: z.string().max(120).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("projects")
      .select("id, title, project_state")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row) return { ok: false as const, reason: "not-found" };

    const current = (row.title ?? "").trim();
    const placeholder =
      current === "" ||
      current.toLowerCase() === "untitled project" ||
      /^untitled project #\d+$/i.test(current) ||
      (data.appLabel && current === data.appLabel.trim());
    if (!placeholder) return { ok: true as const, title: current, changed: false };

    let title = (data.titleHint ?? "").trim().replace(/^["'\s]+|["'\s.]+$/g, "").slice(0, 80);
    try {
      if (!title) {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return { ok: false as const, reason: "no-key" };
        const gateway = createLovableAiGatewayProvider(key);
        const { text } = await generateText({
          model: gateway("google/gemini-3-flash-preview"),
          prompt: `Write a 2-5 word title for a creative project that was generated from this prompt. Title-case it. No quotes, no punctuation at the end, no emojis. Just the title.\n\nPrompt:\n${data.prompt}`,
        });
        title = (text ?? "").trim().replace(/^["'\s]+|["'\s.]+$/g, "").slice(0, 80);
      }
    } catch {
      // fall through — we'll use a cheap fallback below
    }
    if (!title) {
      // Fallback: first few meaningful words from the prompt.
      title = data.prompt
        .replace(/\s+/g, " ")
        .split(" ")
        .slice(0, 6)
        .join(" ")
        .replace(/[.,!?;:]+$/g, "")
        .slice(0, 60);
      title = title.replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (!title) return { ok: true as const, title: current, changed: false };

    const state = (row.project_state ?? {}) as Record<string, unknown>;
    const meta = (state.meta ?? {}) as Record<string, unknown>;
    const nextState = { ...state, meta: { ...meta, title } };

    const { error: upErr } = await supabaseAdmin
      .from("projects")
      .update({
        title,
        project_state: nextState as unknown as never,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (upErr) return { ok: false as const, reason: upErr.message };
    return { ok: true as const, title, changed: true };
  });

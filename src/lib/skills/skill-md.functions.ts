// Server functions backing the in-app skill.md live editor.
// Supabase is the single source of truth in every environment.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const APP_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function assertValidAppId(appId: string): void {
  if (!APP_ID_RE.test(appId)) throw new Error(`Invalid appId "${appId}"`);
}

export const readSkillMd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ appId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    assertValidAppId(data.appId);
    const { data: row, error } = await supabaseAdmin
      .from("agent_skills")
      .select("body_md, updated_at, version")
      .eq("app_id", data.appId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(`Could not load the skill: ${error.message}`);
    if (!row) throw new Error(`Unknown appId "${data.appId}"`);
    return {
      content: row.body_md,
      source: "supabase" as const,
      updatedAt: row.updated_at,
      version: row.version,
    };
  });

export const writeSkillMd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        appId: z.string(),
        content: z.string().max(200_000),
        expectedVersion: z.number().int().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    assertValidAppId(data.appId);
    const content = data.content.trim();
    if (!content) throw new Error("A skill playbook cannot be empty.");

    const nextVersion = data.expectedVersion + 1;
    const { data: row, error } = await supabaseAdmin
      .from("agent_skills")
      .update({
        body_md: content,
        version: nextVersion,
      })
      .eq("app_id", data.appId)
      .eq("is_active", true)
      .eq("version", data.expectedVersion)
      .select("version")
      .maybeSingle();
    if (error) throw new Error(`Could not save the skill: ${error.message}`);
    if (!row) {
      throw new Error("This skill changed while you were saving. Reload it and try again.");
    }
    return { ok: true as const, source: "supabase" as const, version: row.version };
  });

// Strip an accidental ```markdown / ``` fence the model sometimes wraps the
// whole document in, without touching fenced code blocks inside the body.
function unwrapOuterFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/);
  return (m ? m[1] : t).trim();
}

// LLM-assisted revision for the live editor. Takes the current skill.md plus a
// natural-language instruction and returns the FULL rewritten document — the
// caller decides whether to apply/save it, so Undo stays purely client-side.
export const improveSkillMd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        appId: z.string(),
        content: z.string().max(200_000),
        instruction: z.string().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    assertValidAppId(data.appId);
    const { data: skill, error } = await supabaseAdmin
      .from("agent_skills")
      .select("id")
      .eq("app_id", data.appId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(`Could not validate the skill: ${error.message}`);
    if (!skill) throw new Error(`Unknown appId "${data.appId}"`);

    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
    const lovableKey = process.env.LOVABLE_API_KEY?.trim();
    let model;
    if (anthropicKey) {
      model = createAnthropic({ apiKey: anthropicKey })("claude-sonnet-4-5-20250929");
    } else if (lovableKey) {
      model = createLovableAiGatewayProvider(lovableKey)("google/gemini-3-flash-preview");
    } else {
      throw new Error(
        "AI is not configured. Add ANTHROPIC_API_KEY (preferred) or LOVABLE_API_KEY to the current environment.",
      );
    }

    const system =
      "You edit agent skill playbooks written in Markdown with YAML frontmatter. " +
      "Apply the user's instruction to the document and return the COMPLETE revised " +
      "document only — no commentary, no explanation, no surrounding code fence. " +
      "Preserve the YAML frontmatter (between the leading ---) unless the instruction " +
      "explicitly asks to change it. Keep the existing structure, heading style, and " +
      "voice; make the smallest change that satisfies the instruction. Never invent " +
      "block IDs or tools — reuse only ones already present in the document.";

    const { text } = await generateText({
      model,
      system,
      prompt: `CURRENT skill.md:\n\n${data.content}\n\n---\n\nINSTRUCTION:\n${data.instruction}\n\nReturn the full revised skill.md now.`,
    });

    const content = unwrapOuterFence(text ?? "");
    if (!content) throw new Error("The model returned an empty document.");
    return { content };
  });

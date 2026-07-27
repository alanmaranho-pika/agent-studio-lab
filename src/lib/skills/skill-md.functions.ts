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

export type SkillMdVersion = {
  version: number;
  actorType: "user" | "coding_agent" | "system";
  actorName: string;
  action: "initial" | "edit" | "restore";
  restoredFromVersion: number | null;
  createdAt: string;
};

type AuthContext = {
  userId: string;
  claims: unknown;
};

async function resolveUserActorName(context: AuthContext): Promise<string> {
  const claims = (context.claims ?? {}) as Record<string, unknown>;
  const metadata = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", context.userId)
    .maybeSingle();

  const candidates = [
    metadata.full_name,
    metadata.name,
    profile?.display_name,
    claims.email,
  ];
  const name = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  return (name ?? "User").trim().slice(0, 160);
}

async function updateSkillBody(input: {
  appId: string;
  content: string;
  expectedVersion: number;
  actorType: "user" | "coding_agent";
  actorId: string;
  actorName: string;
}) {
  const { data: rows, error } = await supabaseAdmin.rpc("update_agent_skill_body", {
    p_app_id: input.appId,
    p_body_md: input.content,
    p_expected_version: input.expectedVersion,
    p_actor_type: input.actorType,
    p_actor_id: input.actorId,
    p_actor_name: input.actorName,
  });
  if (error) throw new Error(`Could not save the skill: ${error.message}`);
  const row = rows?.[0];
  if (!row) {
    throw new Error("This skill changed while you were saving. Reload it and try again.");
  }
  return row;
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

export const listSkillMdVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ appId: z.string() }).parse(input))
  .handler(async ({ data }): Promise<{ versions: SkillMdVersion[] }> => {
    assertValidAppId(data.appId);
    const { data: skill, error: skillError } = await supabaseAdmin
      .from("agent_skills")
      .select("id")
      .eq("app_id", data.appId)
      .eq("is_active", true)
      .maybeSingle();
    if (skillError) throw new Error(`Could not load version history: ${skillError.message}`);
    if (!skill) throw new Error(`Unknown appId "${data.appId}"`);

    const { data: rows, error } = await supabaseAdmin
      .from("agent_skill_versions")
      .select("version, actor_type, actor_name, action, restored_from_version, created_at")
      .eq("skill_id", skill.id)
      .order("version", { ascending: false });
    if (error) throw new Error(`Could not load version history: ${error.message}`);

    return {
      versions: (rows ?? []).map((row) => ({
        version: row.version,
        actorType: row.actor_type as SkillMdVersion["actorType"],
        actorName: row.actor_name,
        action: row.action as SkillMdVersion["action"],
        restoredFromVersion: row.restored_from_version,
        createdAt: row.created_at,
      })),
    };
  });

export const readSkillMdVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ appId: z.string(), version: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data }) => {
    assertValidAppId(data.appId);
    const { data: skill, error: skillError } = await supabaseAdmin
      .from("agent_skills")
      .select("id")
      .eq("app_id", data.appId)
      .eq("is_active", true)
      .maybeSingle();
    if (skillError) throw new Error(`Could not load the version: ${skillError.message}`);
    if (!skill) throw new Error(`Unknown appId "${data.appId}"`);

    const { data: row, error } = await supabaseAdmin
      .from("agent_skill_versions")
      .select(
        "body_md, version, actor_type, actor_name, action, restored_from_version, created_at",
      )
      .eq("skill_id", skill.id)
      .eq("version", data.version)
      .maybeSingle();
    if (error) throw new Error(`Could not load the version: ${error.message}`);
    if (!row) throw new Error(`Version ${data.version} does not exist.`);

    return {
      content: row.body_md,
      version: row.version,
      actorType: row.actor_type as SkillMdVersion["actorType"],
      actorName: row.actor_name,
      action: row.action as SkillMdVersion["action"],
      restoredFromVersion: row.restored_from_version,
      createdAt: row.created_at,
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
  .handler(async ({ data, context }) => {
    assertValidAppId(data.appId);
    const content = data.content.trim();
    if (!content) throw new Error("A skill playbook cannot be empty.");

    const actorName = await resolveUserActorName(context);
    const row = await updateSkillBody({
      appId: data.appId,
      content,
      expectedVersion: data.expectedVersion,
      actorType: "user",
      actorId: context.userId,
      actorName,
    });
    return {
      ok: true as const,
      source: "supabase" as const,
      content: row.new_body_md,
      version: row.new_version,
      updatedAt: row.new_updated_at,
      actorName,
    };
  });

export const restoreSkillMdVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        appId: z.string(),
        targetVersion: z.number().int().positive(),
        expectedVersion: z.number().int().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    assertValidAppId(data.appId);
    const actorName = await resolveUserActorName(context);
    const { data: rows, error } = await supabaseAdmin.rpc("restore_agent_skill_body", {
      p_app_id: data.appId,
      p_target_version: data.targetVersion,
      p_expected_version: data.expectedVersion,
      p_actor_id: context.userId,
      p_actor_name: actorName,
    });
    if (error) throw new Error(`Could not restore the skill: ${error.message}`);
    const row = rows?.[0];
    if (!row) {
      throw new Error(
        "The skill or selected version changed while you were restoring it. Reload and try again.",
      );
    }
    return {
      ok: true as const,
      source: "supabase" as const,
      content: row.new_body_md,
      version: row.new_version,
      updatedAt: row.new_updated_at,
      actorName,
    };
  });

// Strip an accidental ```markdown / ``` fence the model sometimes wraps the
// whole document in, without touching fenced code blocks inside the body.
function unwrapOuterFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/);
  return (m ? m[1] : t).trim();
}

// LLM-assisted revision for the live editor. Takes the current skill.md plus a
// natural-language instruction, then stores the FULL rewritten document as a
// coding-agent-attributed version.
export const improveSkillMd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        appId: z.string(),
        content: z.string().max(200_000),
        instruction: z.string().min(1).max(4000),
        expectedVersion: z.number().int().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
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
    let actorName: string;
    if (anthropicKey) {
      model = createAnthropic({ apiKey: anthropicKey })("claude-sonnet-4-5-20250929");
      actorName = "Skill editor agent · Claude Sonnet 4.5";
    } else if (lovableKey) {
      model = createLovableAiGatewayProvider(lovableKey)("google/gemini-3-flash-preview");
      actorName = "Skill editor agent · Gemini 3 Flash";
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
    const row = await updateSkillBody({
      appId: data.appId,
      content,
      expectedVersion: data.expectedVersion,
      actorType: "coding_agent",
      actorId: context.userId,
      actorName,
    });
    return {
      content: row.new_body_md,
      version: row.new_version,
      updatedAt: row.new_updated_at,
      actorName,
    };
  });

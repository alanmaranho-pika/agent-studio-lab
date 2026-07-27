import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const APP_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const BLOCK_ID_RE = /^BLK_[A-Z0-9_]+$/;
const mediaModeSchema = z.enum(["image", "video", "audio", "speech"]);

export type AgentSkillCatalogItem = {
  id: string;
  appId: string;
  label: string;
  kind: "wizard" | "model" | "meta";
  intent: string;
  oneLiner: string;
  outputs: string[];
  matches: string[];
  usesBlocks: string[];
  model: string | null;
  mode: "image" | "video" | "audio" | "speech" | null;
  version: number;
  updatedAt: string;
};

const createSkillSchema = z
  .object({
    appId: z.string().regex(APP_ID_RE).max(80),
    label: z.string().trim().min(1).max(120),
    kind: z.enum(["wizard", "model"]),
    intent: z.string().trim().min(1).max(1000),
    oneLiner: z.string().trim().min(1).max(1000),
    matches: z.array(z.string().trim().min(1).max(100)).max(50),
    bodyMd: z.string().trim().min(1).max(200_000),
    model: z.string().trim().max(300).nullable(),
    mode: mediaModeSchema.nullable(),
    steps: z
      .array(
        z.object({
          id: z.string().regex(APP_ID_RE).max(80),
          intent: z.string().trim().min(1).max(1000),
        }),
      )
      .max(40),
    usesBlocks: z.array(z.string().regex(BLOCK_ID_RE)).max(30),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "model" && (!value.model || !value.mode)) {
      ctx.addIssue({
        code: "custom",
        message: "Model skills require a model identifier and output type.",
      });
    }
    if (value.kind === "wizard" && value.steps.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Workflow skills need at least one step.",
      });
    }
  });

export type CreateAgentSkillInput = z.input<typeof createSkillSchema>;

async function resolveActorName(context: { userId: string; claims: unknown }): Promise<string> {
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

export const listAgentSkillsForCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ skills: AgentSkillCatalogItem[] }> => {
    const { data, error } = await supabaseAdmin
      .from("agent_skills")
      .select(
        "id, app_id, label, kind, intent, one_liner, outputs, matches, uses_blocks, model, mode, version, updated_at",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("app_id", { ascending: true });

    if (error) throw new Error(`Could not load skills: ${error.message}`);

    return {
      skills: (data ?? []).map((row) => ({
        id: row.id,
        appId: row.app_id,
        label: row.label,
        kind: row.kind as AgentSkillCatalogItem["kind"],
        intent: row.intent,
        oneLiner: row.one_liner,
        outputs: row.outputs,
        matches: row.matches,
        usesBlocks: row.uses_blocks,
        model: row.model,
        mode: row.mode as AgentSkillCatalogItem["mode"],
        version: row.version,
        updatedAt: row.updated_at,
      })),
    };
  });

export const createAgentSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateAgentSkillInput) => createSkillSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actorName = await resolveActorName(context);
    const id = `SKL_${data.appId.toUpperCase().replace(/-/g, "_")}`;
    const outputs = data.kind === "model" && data.mode ? [data.mode] : [];
    const model = data.kind === "model" ? data.model : null;
    const mode = data.kind === "model" ? data.mode : null;
    const steps =
      data.kind === "wizard"
        ? data.steps.map((step) => ({
            id: step.id,
            intent: step.intent,
            inputs: [],
          }))
        : [];

    const { data: rows, error } = await supabaseAdmin.rpc("create_agent_skill", {
      p_id: id,
      p_app_id: data.appId,
      p_label: data.label,
      p_kind: data.kind,
      p_intent: data.intent,
      p_one_liner: data.oneLiner,
      p_outputs: outputs,
      p_matches: data.matches,
      p_uses_blocks: data.usesBlocks,
      p_model: model,
      p_mode: mode,
      p_steps: steps,
      p_body_md: data.bodyMd,
      p_actor_id: context.userId,
      p_actor_name: actorName,
    });

    if (error) {
      if (error.code === "23505") {
        throw new Error(`A skill with the id "${data.appId}" already exists.`);
      }
      throw new Error(`Could not create the skill: ${error.message}`);
    }

    const row = rows?.[0];
    if (!row) throw new Error("The skill was not created.");

    return {
      skill: {
        id: row.new_id,
        appId: row.new_app_id,
        version: row.new_version,
        createdAt: row.new_created_at,
      },
      actorName,
    };
  });

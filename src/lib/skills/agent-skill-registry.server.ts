import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AgentSkill, SkillStep } from "@/lib/skills/agent-skill.types";

const mediaKindSchema = z.enum(["image", "video", "audio", "speech"]);
const blockIdSchema = z.string().regex(/^BLK_[A-Z0-9_]+$/);
const stepInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("upload"),
    key: z.string(),
    label: z.string(),
    accepts: z.string(),
    required: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("url"),
    key: z.string(),
    label: z.string(),
    placeholder: z.string().optional(),
  }),
  z.object({
    kind: z.literal("text"),
    key: z.string(),
    label: z.string(),
    placeholder: z.string().optional(),
    long: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("choice"),
    key: z.string(),
    label: z.string(),
    options: z.array(z.string()),
    multi: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("character"),
    key: z.string(),
    label: z.string(),
    multi: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("environment"),
    key: z.string(),
    label: z.string(),
  }),
  z.object({
    kind: z.literal("voice"),
    key: z.string(),
    label: z.string(),
  }),
  z.object({
    kind: z.literal("asset-picker"),
    key: z.string(),
    label: z.string(),
    mediaKinds: z.array(z.enum(["image", "video", "audio"])),
  }),
]);
const stepSchema = z.object({
  id: z.string(),
  intent: z.string(),
  presents: z.array(blockIdSchema).optional(),
  inputs: z.array(stepInputSchema),
  notes: z.string().optional(),
});

const rowSchema = z.object({
  id: z.string(),
  app_id: z.string(),
  label: z.string(),
  kind: z.enum(["wizard", "model", "meta"]),
  intent: z.string(),
  one_liner: z.string(),
  outputs: z.array(mediaKindSchema),
  matches: z.array(z.string()),
  uses_blocks: z.array(blockIdSchema),
  model: z.string().nullable(),
  mode: mediaKindSchema.nullable(),
  steps: z.array(stepSchema),
  body_md: z.string(),
  version: z.number().int().positive(),
});

function rowToAgentSkill(row: z.infer<typeof rowSchema>): AgentSkill {
  return {
    id: row.id,
    appId: row.app_id,
    label: row.label,
    kind: row.kind,
    intent: row.intent,
    oneLiner: row.one_liner,
    outputs: row.outputs,
    matches: row.matches,
    usesBlocks: row.uses_blocks as AgentSkill["usesBlocks"],
    model: row.model ?? undefined,
    mode: row.mode ?? undefined,
    steps: row.steps as SkillStep[],
    bodyMd: row.body_md,
    version: row.version,
  };
}

export async function loadAgentSkills(): Promise<AgentSkill[]> {
  const { data, error } = await supabaseAdmin
    .from("agent_skills")
    .select(
      "id, app_id, label, kind, intent, one_liner, outputs, matches, uses_blocks, model, mode, steps, body_md, version",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("app_id", { ascending: true });

  if (error) {
    throw new Error(`Could not load agent skills from Supabase: ${error.message}`);
  }

  return rowSchema
    .array()
    .parse(data ?? [])
    .map(rowToAgentSkill);
}

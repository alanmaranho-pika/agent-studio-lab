// Unified Skills registry (Agent v5 — Phase 4 groundwork).
//
// Everything the agent can execute is a Skill:
//   - "model"  : one-shot model call loaded from public.agent_skills.
//   - "app"    : multi-step wizard recipe loaded from public.agent_skills.
//   - "user"   : Markdown-authored recipe stored in public.skills.
//
// This file is the SINGLE source of truth for the client and server-side
// registries of model + app skills. User skills are read from the database.
// The Director agent has exactly one execution tool: run_skill({ slug, inputs })
// which resolves through this registry.

import type { AgentAppRegistry, AppEntry, StepInput } from "@/lib/agent/app-registry";

export type SkillInput =
  | {
      key: string;
      kind: "text";
      label: string;
      required?: boolean;
      placeholder?: string;
      long?: boolean;
    }
  | { key: string; kind: "url"; label: string; required?: boolean; placeholder?: string }
  | { key: string; kind: "upload"; label: string; required?: boolean; accepts: string }
  | { key: string; kind: "image"; label: string; required?: boolean }
  | {
      key: string;
      kind: "asset";
      label: string;
      required?: boolean;
      mediaKinds: Array<"image" | "video" | "audio">;
    }
  | {
      key: string;
      kind: "enum";
      label: string;
      required?: boolean;
      options: string[];
      multi?: boolean;
    }
  | {
      key: string;
      kind: "subject";
      label: string;
      required?: boolean;
      subjectKinds?: Array<"character" | "product" | "scene" | "logo" | "brand_asset">;
      multi?: boolean;
    }
  | { key: string; kind: "voice"; label: string; required?: boolean };

export type SkillOutputs = {
  /** Preferred aspect ratio for outputs. */
  aspect?: "16:9" | "9:16" | "1:1" | "4:5";
  /** Target duration in seconds. */
  durationSec?: number;
  /** Primary output media kind. */
  media?: "image" | "video" | "audio" | "speech";
};

export type SkillManifest = {
  inputs: SkillInput[];
  outputs?: SkillOutputs;
  /** Model id for model skills. */
  model?: string;
  /** For wizard/app skills: the step ids (mirrors app-registry). */
  steps?: string[];
};

export type Skill = {
  id: string; // stable slug for model/app; UUID for user skills
  slug: string;
  version: number;
  source: "model" | "app" | "user";
  name: string;
  oneLiner: string;
  manifest: SkillManifest;
  bodyMd?: string;
  category?: string;
  tags?: string[];
  /** For Supabase-backed built-ins, the underlying agent app id. */
  appRef?: string;
  coverAssetId?: string | null;
  /** Resolved signed URL for coverAssetId (user skills). Populated by list/get fns. */
  coverUrl?: string | null;
  coverMime?: string | null;
  authorId?: string | null;
  /** Display name / handle for the author (community attribution). */
  authorName?: string | null;
  /** Avatar URL from author's profile (community attribution). */
  authorAvatarUrl?: string | null;
  visibility?: "private" | "unlisted" | "public";
  installCount?: number;
};

// -------- input conversion (AppRegistry StepInput → SkillInput) --------

function convertStepInput(i: StepInput): SkillInput {
  switch (i.kind) {
    case "text":
      return { key: i.key, kind: "text", label: i.label, placeholder: i.placeholder, long: i.long };
    case "url":
      return { key: i.key, kind: "url", label: i.label, placeholder: i.placeholder };
    case "upload":
      return {
        key: i.key,
        kind: "upload",
        label: i.label,
        accepts: i.accepts,
        required: i.required,
      };
    case "choice":
      return { key: i.key, kind: "enum", label: i.label, options: i.options, multi: i.multi };
    case "character":
      return {
        key: i.key,
        kind: "subject",
        label: i.label,
        subjectKinds: ["character"],
        multi: i.multi,
      };
    case "environment":
      return { key: i.key, kind: "subject", label: i.label, subjectKinds: ["scene"] };
    case "voice":
      return { key: i.key, kind: "voice", label: i.label };
    case "asset-picker":
      return { key: i.key, kind: "asset", label: i.label, mediaKinds: i.mediaKinds };
  }
}

// -------- built-in conversion --------

function categorizeApp(app: AppEntry): string {
  if (app.kind === "wizard") return "Wizards";
  switch (app.mode) {
    case "video":
      return "Video models";
    case "image":
      return "Image models";
    case "speech":
      return "Speech models";
    case "audio":
      return "Audio models";
    default:
      return "Models";
  }
}

function appEntryToSkill(app: AppEntry): Skill {
  if (app.kind === "model") {
    return {
      id: app.id,
      slug: app.id.replace(/^model-/, ""),
      version: 1,
      source: "model",
      name: app.label,
      oneLiner: app.oneLiner,
      appRef: app.id,
      category: categorizeApp(app),
      manifest: {
        model: app.model,
        outputs: { media: app.mode ?? "image" },
        // Model skills collect their inputs as one card; the agent already
        // knows the model's parameter surface via model-params.ts, so we
        // publish a minimal generic surface here and rely on the Producer
        // agent to fill in model-specific knobs.
        inputs: [
          { key: "prompt", kind: "text", label: "Prompt", long: true, required: true },
          {
            key: "referenceImages",
            kind: "asset",
            label: "Reference images (optional)",
            mediaKinds: ["image"],
          },
        ],
      },
    };
  }
  const steps = app.steps ?? [];
  const inputs: SkillInput[] = steps.flatMap((s) => s.inputs.map(convertStepInput));
  return {
    id: app.id,
    slug: app.id,
    version: 1,
    source: "app",
    name: app.label,
    oneLiner: app.oneLiner,
    appRef: app.id,
    category: categorizeApp(app),
    manifest: {
      inputs,
      steps: steps.map((s) => s.id),
    },
    bodyMd: renderAppRecipe(app),
  };
}

/** A canonical Markdown recipe for a wizard app, used as bodyMd. */
function renderAppRecipe(app: AppEntry): string {
  const lines: string[] = [`# ${app.label}`, "", app.oneLiner, ""];
  const steps = app.steps ?? [];
  steps.forEach((s, idx) => {
    lines.push(`${idx + 1}. **${s.id}** — ${s.intent}`);
    if (s.notes) lines.push(`   > ${s.notes}`);
  });
  return lines.join("\n");
}

export function createBuiltinSkills(registry: AgentAppRegistry): Skill[] {
  return registry.apps.map((app) => {
    const skill = appEntryToSkill(app);
    const agentSkill = registry.skillByAppId.get(app.id);
    return agentSkill?.bodyMd ? { ...skill, bodyMd: agentSkill.bodyMd } : skill;
  });
}

/** Look up a built-in skill. User-authored skills live in public.skills. */
export function getBuiltinSkill(builtins: Skill[], slugOrId: string): Skill | undefined {
  return builtins.find((skill) => skill.slug === slugOrId || skill.id === slugOrId);
}

export type SkillFilter = {
  source?: Skill["source"] | Skill["source"][];
  category?: string;
  query?: string;
};

export function filterBuiltins(builtins: Skill[], f: SkillFilter = {}): Skill[] {
  const sources = f.source ? (Array.isArray(f.source) ? f.source : [f.source]) : null;
  const q = f.query?.trim().toLowerCase();
  return builtins.filter((s) => {
    if (sources && !sources.includes(s.source)) return false;
    if (f.category && s.category !== f.category) return false;
    if (q && !`${s.name} ${s.oneLiner}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

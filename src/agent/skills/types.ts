// Skill pack types — every "app" (wizard flow + single-shot model app) is
// authored as one folder under src/agent/skills/<id>/ containing:
//
//   skill.md   — human/agent-readable description (id, intent, outputs,
//                inputs, step-by-step referencing BLK_* ids). This is what
//                the agent reads when planning the flow.
//   skill.ts   — typed manifest that the runtime uses. Exports a
//                `SkillPack` object registered in _registry.ts.
//
// The runtime APP_REGISTRY / APP_BY_ID / renderAppPlaybook exports in
// src/lib/agent/app-registry.ts are now derived from the skill packs;
// downstream callers (chat.ts, skills/registry.ts) don't change.

import type { BlockId } from "@/agent/blocks/types";

export type SkillId = string; // "SKL_SHORT_FILM", "SKL_MODEL_SEEDANCE_2", …
export type SkillKind = "wizard" | "model" | "meta";

export type StepInput =
  | { kind: "upload"; key: string; label: string; accepts: string; required?: boolean }
  | { kind: "url"; key: string; label: string; placeholder?: string }
  | { kind: "text"; key: string; label: string; placeholder?: string; long?: boolean }
  | { kind: "choice"; key: string; label: string; options: string[]; multi?: boolean }
  | { kind: "character"; key: string; label: string; multi?: boolean }
  | { kind: "environment"; key: string; label: string }
  | { kind: "voice"; key: string; label: string }
  | { kind: "asset-picker"; key: string; label: string; mediaKinds: Array<"image" | "video" | "audio"> };

export type SkillStep = {
  id: string;
  intent: string;
  /** BLK_* ids the agent should reach for at this step. Advisory. */
  presents?: BlockId[];
  inputs: StepInput[];
  notes?: string;
};

export type SkillPack = {
  id: SkillId;
  /** Legacy runtime id — matches APP_REGISTRY entry ids for compatibility. */
  appId: string;
  label: string;
  kind: SkillKind;
  intent: string;
  /** One-line summary used in the app catalog. */
  oneLiner: string;
  outputs?: Array<"image" | "video" | "audio" | "speech">;
  /** Free-text triggers the router matches against (in addition to label + intent). */
  matches?: string[];
  /** Block IDs this skill uses across its steps — powers targeted block.md injection. */
  usesBlocks?: BlockId[];
  /** Model skills: backing model id (fal/openai) + primary mode. */
  model?: string;
  mode?: "image" | "video" | "audio" | "speech";
  /** Wizard skills: ordered steps the agent walks as gen-UI cards. */
  steps?: SkillStep[];
  /** Raw skill.md text — injected into prompts for the selected skill. */
  bodyMd: string;
};
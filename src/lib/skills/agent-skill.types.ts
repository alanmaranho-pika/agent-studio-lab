import type { BlockId } from "@/agent/blocks/types";

export type SkillId = string;
export type SkillKind = "wizard" | "model" | "meta";

export type StepInput =
  | {
      kind: "upload";
      key: string;
      label: string;
      accepts: string;
      required?: boolean;
    }
  | { kind: "url"; key: string; label: string; placeholder?: string }
  | {
      kind: "text";
      key: string;
      label: string;
      placeholder?: string;
      long?: boolean;
    }
  | {
      kind: "choice";
      key: string;
      label: string;
      options: string[];
      multi?: boolean;
    }
  | { kind: "character"; key: string; label: string; multi?: boolean }
  | { kind: "environment"; key: string; label: string }
  | { kind: "voice"; key: string; label: string }
  | {
      kind: "asset-picker";
      key: string;
      label: string;
      mediaKinds: Array<"image" | "video" | "audio">;
    };

export type SkillStep = {
  id: string;
  intent: string;
  presents?: BlockId[];
  inputs: StepInput[];
  notes?: string;
};

export type AgentSkill = {
  id: SkillId;
  appId: string;
  label: string;
  kind: SkillKind;
  intent: string;
  oneLiner: string;
  outputs?: Array<"image" | "video" | "audio" | "speech">;
  matches?: string[];
  usesBlocks?: BlockId[];
  model?: string;
  mode?: "image" | "video" | "audio" | "speech";
  steps?: SkillStep[];
  bodyMd: string;
  version: number;
};

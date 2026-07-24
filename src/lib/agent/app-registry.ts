import type {
  AgentSkill,
  SkillStep,
  StepInput as AgentStepInput,
} from "@/lib/skills/agent-skill.types";

export type StepInput = AgentStepInput;

export type AppStep = {
  id: string;
  intent: string;
  inputs: StepInput[];
  notes?: string;
};

export type AppEntry = {
  id: string;
  label: string;
  kind: "wizard" | "model";
  oneLiner: string;
  model?: string;
  mode?: "image" | "video" | "audio" | "speech";
  steps?: AppStep[];
};

export type AgentAppRegistry = {
  skills: AgentSkill[];
  apps: AppEntry[];
  appById: Record<string, AppEntry>;
  skillById: Map<string, AgentSkill>;
  skillByAppId: Map<string, AgentSkill>;
};

function skillToAppEntry(skill: AgentSkill): AppEntry | null {
  if (skill.kind !== "wizard" && skill.kind !== "model") return null;
  const steps = skill.steps?.map((step: SkillStep) => ({
    id: step.id,
    intent: step.intent,
    inputs: step.inputs,
    notes: step.notes,
  }));
  return {
    id: skill.appId,
    label: skill.label,
    kind: skill.kind,
    oneLiner: skill.oneLiner,
    model: skill.model,
    mode: skill.mode,
    steps,
  };
}

export function createAgentAppRegistry(skills: AgentSkill[]): AgentAppRegistry {
  const apps = skills.map(skillToAppEntry).filter((app): app is AppEntry => app !== null);
  return {
    skills,
    apps,
    appById: Object.fromEntries(apps.map((app) => [app.id, app])),
    skillById: new Map(skills.map((skill) => [skill.id, skill])),
    skillByAppId: new Map(skills.map((skill) => [skill.appId, skill])),
  };
}

function renderInput(input: StepInput): string {
  switch (input.kind) {
    case "upload":
      return `upload(${input.key}) "${input.label}" accepts=${input.accepts}`;
    case "url":
      return `url(${input.key}) "${input.label}"`;
    case "text":
      return `text(${input.key}) "${input.label}"${input.long ? " [long]" : ""}`;
    case "choice":
      return `choice(${input.key}) "${input.label}" [${input.options.join(" | ")}]${input.multi ? " multi" : ""}`;
    case "character":
      return `character-picker(${input.key}) "${input.label}"${input.multi ? " multi" : ""} — supports "Create new" → Character Creator inline`;
    case "environment":
      return `environment-picker(${input.key}) "${input.label}"`;
    case "voice":
      return `voice-picker(${input.key}) "${input.label}"`;
    case "asset-picker":
      return `library-picker(${input.key}) "${input.label}" kinds=${input.mediaKinds.join(",")}`;
  }
}

export function renderAppPlaybook(registry: AgentAppRegistry, appId: string): string | null {
  const app = registry.appById[appId];
  if (!app) return null;
  const skill = registry.skillByAppId.get(appId);
  const bodyMd = skill?.bodyMd?.trim();
  if (bodyMd) {
    return `SELECTED SKILL PLAYBOOK — ${skill?.id ?? app.id} (${app.label}): ${app.oneLiner}\n\n${bodyMd}`;
  }
  if (app.kind === "model") {
    return `MODEL APP ${app.id} (${app.label}, ${app.mode}) — ${app.oneLiner}\nCollect params in ONE turn, then call run_model_app with appId "${app.id}".`;
  }
  const steps = (app.steps ?? [])
    .map((step) => {
      const inputs = step.inputs.length
        ? step.inputs.map((input) => `    - ${renderInput(input)}`).join("\n")
        : "    - (no input — show result/list for review)";
      const notes = step.notes ? `\n    note: ${step.notes}` : "";
      return `  • ${step.id} — ${step.intent}\n${inputs}${notes}`;
    })
    .join("\n");
  return `SELECTED APP PLAYBOOK — ${app.id} (${app.label}): ${app.oneLiner}\nWalk these steps one decision per turn. Skip, reorder, or loop back based on what the user already answered; detour into a model app when an input is missing, then resume.\n${steps}`;
}

export function renderAppCatalogForPrompt(registry: AgentAppRegistry): string {
  const wizard = registry.apps.filter((app) => app.kind === "wizard");
  const model = registry.apps.filter((app) => app.kind === "model");
  const fmtWizard = wizard
    .map((app) => {
      const steps = (app.steps ?? [])
        .map((step) => {
          const inputs = step.inputs.length
            ? step.inputs.map((input) => `         - ${renderInput(input)}`).join("\n")
            : "         - (no input — show result/list for review)";
          const notes = step.notes ? `\n         note: ${step.notes}` : "";
          return `      • ${step.id} — ${step.intent}\n${inputs}${notes}`;
        })
        .join("\n");
      return `  ${app.id} (${app.label}) — ${app.oneLiner}\n${steps}`;
    })
    .join("\n\n");
  const fmtModel = model
    .map((app) => `  • ${app.id} (${app.label}, ${app.mode}) — ${app.oneLiner}`)
    .join("\n");
  return `WIZARD APPS — canonical playbook. Walk these steps as gen-UI cards, ONE step per turn. You may skip, reorder, or loop back based on what the user already said; you may also diverge into a MODEL APP mid-flow (e.g. generate a hero still in Nano Banana, then resume) and you may open Character Creator from any "character-picker" input. Always nudge the user forward toward render.\n\n${fmtWizard}\n\nMODEL APPS (single-shot — collect params in ONE card then call run_model_app):\n${fmtModel}`;
}

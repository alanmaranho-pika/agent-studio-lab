// Pure, deterministic model routing for the studio agent.
//
// Deliberately kept free of provider imports so it can be tested without
// credentials and shared with client-side debug UI if needed later. The
// router uses state the application already knows; it never spends another
// LLM call just to choose an LLM.

export const AGENT_MODEL_IDS = {
  economy: "deepseek/deepseek-v4-pro",
  fast: "z-ai/glm-5.2",
  balanced: "anthropic/claude-sonnet-5",
  multimodal: "google/gemini-3.1-pro",
  reasoning: "openai/gpt-5.5",
  orchestration: "anthropic/claude-opus-4.8",
  creative: "anthropic/claude-fable-5",
} as const;

export type AgentModelTier = keyof typeof AGENT_MODEL_IDS;
export type AgentModelId = (typeof AGENT_MODEL_IDS)[AgentModelTier];
export type RoutedAgentPhase = "discuss" | "plan" | "render" | "edit";
export type InlineEditKind = "field" | "piece" | "media";

export type AgentRoutingInput = {
  phase: RoutedAgentPhase;
  latestUserText: string;
  selectedAppId?: string | null;
  hasSelectedSkill: boolean;
  selectedSkillBodyMd?: string | null;
  inlineEditKind?: InlineEditKind | null;
  latestAttachmentMediaTypes?: string[];
  messageCount: number;
  totalTextChars: number;
  sceneCount: number;
  assetCount: number;
  castCount: number;
  overrideModelId?: string | null;
};

export type AgentModelRoute = {
  tier: AgentModelTier;
  modelId: AgentModelId;
  fallbackModelIds: AgentModelId[];
  reason: string;
  signals: string[];
};

const FALLBACKS: Record<AgentModelTier, AgentModelId[]> = {
  economy: [AGENT_MODEL_IDS.fast, AGENT_MODEL_IDS.balanced],
  fast: [AGENT_MODEL_IDS.balanced],
  balanced: [AGENT_MODEL_IDS.fast],
  multimodal: [AGENT_MODEL_IDS.balanced],
  reasoning: [AGENT_MODEL_IDS.orchestration, AGENT_MODEL_IDS.balanced],
  orchestration: [AGENT_MODEL_IDS.reasoning, AGENT_MODEL_IDS.balanced],
  creative: [AGENT_MODEL_IDS.orchestration, AGENT_MODEL_IDS.balanced],
};

const MODEL_TO_TIER = new Map<AgentModelId, AgentModelTier>(
  Object.entries(AGENT_MODEL_IDS).map(([tier, modelId]) => [modelId, tier as AgentModelTier]),
);

const CUSTOM_UI_RX =
  /\b(generative ui|custom (?:ui|interface|experience|flow|workflow)|from scratch|invent (?:a|an|the)|new interaction|dynamic interface|bespoke|one[- ]off workflow)\b/i;
const SKILL_AUTHORING_RX =
  /\b(create|build|write|design|save|turn .{0,40} into)\b.{0,50}\b(skill|workflow|recipe)\b/i;
const CREATIVE_RX =
  /\b(concept|story|storyboard|script|narrative|art direction|brand world|visual language|cinematic|emotional|poetic|surprising|original|creative direction|mood film)\b/i;
const REASONING_RX =
  /\b(architecture|trade[- ]?offs?|constraints?|compare|evaluate|diagnose|debug|root cause|strategy|reason through|figure out|ambiguous|edge cases?|system design)\b/i;
const ORCHESTRATION_RX =
  /\b(across (?:all|every)|every (?:shot|scene|clip)|multi[- ]?(?:scene|step|stage)|end[- ]to[- ]end|maintain consistency|preserve continuity|restructure|rebuild|whole (?:film|project|timeline)|entire (?:film|project|timeline))\b/i;
const MAX_QUALITY_RX =
  /\b(best possible|highest quality|maximum quality|strongest model|most capable|take your time|spare no expense)\b/i;

function route(tier: AgentModelTier, reason: string, signals: string[] = []): AgentModelRoute {
  return {
    tier,
    modelId: AGENT_MODEL_IDS[tier],
    fallbackModelIds: FALLBACKS[tier],
    reason,
    signals,
  };
}

function normalizedWordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export function isKnownAgentModelId(value: string): value is AgentModelId {
  return MODEL_TO_TIER.has(value as AgentModelId);
}

export function tierForAgentModel(modelId: AgentModelId): AgentModelTier {
  return MODEL_TO_TIER.get(modelId) ?? "balanced";
}

export function routeAgentModel(input: AgentRoutingInput): AgentModelRoute {
  const text = input.latestUserText.trim();
  const wordCount = normalizedWordCount(text);
  const shortReply = text.length <= 180 && wordCount <= 24;
  const selectedSkillText = input.selectedSkillBodyMd ?? "";
  const attachmentTypes = input.latestAttachmentMediaTypes ?? [];
  const hasAttachments = attachmentTypes.length > 0;
  const longContext = input.messageCount >= 36 || input.totalTextChars >= 42_000;
  const customUi = CUSTOM_UI_RX.test(text);
  const skillAuthoring =
    input.selectedAppId === "create-skill" ||
    SKILL_AUTHORING_RX.test(text) ||
    (/\bskill\b/i.test(selectedSkillText) && /\bauthor|create|build\b/i.test(selectedSkillText));
  const creative = CREATIVE_RX.test(text);
  const reasoning = REASONING_RX.test(text);
  const orchestration =
    ORCHESTRATION_RX.test(text) ||
    (input.sceneCount >= 8 && /\b(change|revise|redo|update|edit|render)\b/i.test(text));
  const maximumQuality = MAX_QUALITY_RX.test(text);

  const override = input.overrideModelId?.trim();
  if (override && isKnownAgentModelId(override)) {
    const tier = tierForAgentModel(override);
    return route(tier, "forced by AGENT_MODEL_OVERRIDE", ["override"]);
  }

  if (input.inlineEditKind === "field" || input.inlineEditKind === "piece") {
    return route("economy", "small deterministic inline edit", ["inline-edit"]);
  }
  if (input.inlineEditKind === "media") {
    return route("fast", "media rework with a narrow tool surface", ["inline-media"]);
  }

  // Gemini uses Pika's native GenAI endpoint because the OpenAI-compatible
  // surface does not expose Gemini tool calls. It is the best fit when the
  // current turn actually needs multimodal or unusually long context.
  if (hasAttachments || longContext) {
    return route(
      "multimodal",
      hasAttachments ? "current turn includes attachments" : "long conversation context",
      [...(hasAttachments ? ["attachments"] : []), ...(longContext ? ["long-context"] : [])],
    );
  }

  if (skillAuthoring) {
    return route("reasoning", "structured skill or workflow authoring", ["skill-authoring"]);
  }

  if (customUi && creative) {
    return route("creative", "bespoke generative UI with creative direction", [
      "custom-ui",
      "creative",
    ]);
  }
  if (customUi) {
    return route("reasoning", "bespoke generative UI or workflow", ["custom-ui"]);
  }

  if (maximumQuality || orchestration) {
    return route("orchestration", "high-stakes multi-part project orchestration", [
      ...(maximumQuality ? ["maximum-quality"] : []),
      ...(orchestration ? ["orchestration"] : []),
    ]);
  }

  if (creative && (!input.hasSelectedSkill || wordCount >= 24)) {
    return route("creative", "open-ended creative concept development", ["creative"]);
  }

  if (reasoning) {
    return route("reasoning", "explicit reasoning or diagnosis request", ["reasoning"]);
  }

  // Once a skill is selected, the skill.md and phase machine already constrain
  // planning turns. GLM is the fast tier for that guided wizard work; mature
  // render/edit turns retain Sonnet because they carry substantially more
  // project state and a wider, higher-risk tool loop.
  if (input.hasSelectedSkill) {
    if (shortReply && (input.phase === "discuss" || input.phase === "plan")) {
      return route("fast", "short reply inside a selected skill wizard", [
        "selected-skill",
        "short-reply",
      ]);
    }
    if (input.phase === "render" || input.phase === "edit") {
      return route("balanced", "stateful selected-skill render or edit turn", [
        "selected-skill",
        input.phase,
      ]);
    }
    return route("fast", "guided selected-skill turn", ["selected-skill"]);
  }

  if (input.phase === "render" || input.phase === "edit") {
    return route("balanced", "stateful render or timeline turn", [input.phase]);
  }
  if (input.phase === "plan" || input.sceneCount > 0 || input.castCount > 0) {
    return route("fast", "standard project planning turn", ["project-state"]);
  }

  // New projects start without a persisted skill, even when the user clicks a
  // wizard suggestion such as "30-second product ad". Let GLM handle those
  // short intent-discovery turns; the stronger routing signals above still
  // promote complex, creative, multimodal, and custom-UI requests.
  if (input.messageCount <= 3 && shortReply) {
    return route("fast", "short first-contact request", ["first-contact", "short-reply"]);
  }

  // Longer, ambiguous first contact retains Sonnet for safer intent discovery.
  return route("balanced", "unconstrained request needs intent discovery", ["intent-discovery"]);
}

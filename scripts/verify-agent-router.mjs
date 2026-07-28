import assert from "node:assert/strict";
import { AGENT_MODEL_IDS, routeAgentModel } from "../src/lib/agent/model-router.ts";

const base = {
  phase: "discuss",
  latestUserText: "",
  selectedAppId: null,
  hasSelectedSkill: false,
  selectedSkillBodyMd: null,
  inlineEditKind: null,
  latestAttachmentMediaTypes: [],
  messageCount: 2,
  totalTextChars: 120,
  sceneCount: 0,
  assetCount: 0,
  castCount: 0,
};

const cases = [
  {
    name: "selected skill wizard reply uses fast tier",
    input: {
      ...base,
      phase: "plan",
      latestUserText: "Brazil",
      selectedAppId: "anime-world-cup",
      hasSelectedSkill: true,
    },
    expected: AGENT_MODEL_IDS.fast,
  },
  {
    name: "selected skill render uses balanced tier",
    input: {
      ...base,
      phase: "render",
      latestUserText: "Render all five shots",
      selectedAppId: "product-ad",
      hasSelectedSkill: true,
      sceneCount: 5,
    },
    expected: AGENT_MODEL_IDS.balanced,
  },
  {
    name: "field edit uses economy",
    input: {
      ...base,
      phase: "edit",
      latestUserText: "Make this title shorter",
      inlineEditKind: "field",
    },
    expected: AGENT_MODEL_IDS.economy,
  },
  {
    name: "attachment uses native Gemini",
    input: {
      ...base,
      latestUserText: "Use this product reference",
      latestAttachmentMediaTypes: ["image/png"],
    },
    expected: AGENT_MODEL_IDS.multimodal,
  },
  {
    name: "custom structured UI uses GPT",
    input: {
      ...base,
      latestUserText:
        "Build a custom generative UI from scratch for comparing three campaign routes",
    },
    expected: AGENT_MODEL_IDS.reasoning,
  },
  {
    name: "custom creative UI uses Fable",
    input: {
      ...base,
      latestUserText:
        "Invent a bespoke generative UI for the cinematic campaign narrative and art direction",
    },
    expected: AGENT_MODEL_IDS.creative,
  },
  {
    name: "whole-project continuity uses Opus",
    input: {
      ...base,
      phase: "edit",
      latestUserText: "Revise every scene across the entire film and preserve continuity",
      sceneCount: 10,
    },
    expected: AGENT_MODEL_IDS.orchestration,
  },
  {
    name: "skill authoring uses GPT",
    input: {
      ...base,
      phase: "plan",
      latestUserText: "Turn this approach into a reusable skill",
      selectedAppId: "create-skill",
      hasSelectedSkill: true,
    },
    expected: AGENT_MODEL_IDS.reasoning,
  },
  {
    name: "Product Ad suggestion starts on GLM",
    input: {
      ...base,
      latestUserText: "30-second product ad",
    },
    expected: AGENT_MODEL_IDS.fast,
  },
  {
    name: "long ambiguous first contact keeps Sonnet",
    input: {
      ...base,
      latestUserText:
        "I have a launch coming up and a lot of background to share about the brand, the audience, the materials we have, what has worked before, and what the team hopes to achieve, but I am not yet sure where to begin or what kind of output would be most useful.",
    },
    expected: AGENT_MODEL_IDS.balanced,
  },
];

for (const testCase of cases) {
  const actual = routeAgentModel(testCase.input).modelId;
  assert.equal(actual, testCase.expected, testCase.name);
}

console.log(`Agent router verified (${cases.length} cases).`);

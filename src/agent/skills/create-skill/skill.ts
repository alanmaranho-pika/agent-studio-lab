import type { SkillPack } from "../types";
import bodyMd from "./skill.md?raw";

/**
 * Meta-skill: authors a new skill pack. The final step calls a
 * server tool (skills.create) that writes the new folder under
 * src/agent/skills/<id>/. This closes the loop — the agent can extend
 * its own capabilities without a code deploy.
 */
export const CreateSkillSkill: SkillPack = {
  id: "SKL_CREATE_SKILL",
  appId: "create-skill",
  label: "Create a new Skill",
  kind: "meta",
  intent: "Author a new Skill pack the agent can call.",
  oneLiner: "Walk the user through authoring a new Skill pack (skill.md + manifest).",
  matches: ["create skill", "new skill", "add app", "add capability", "extend agent"],
  usesBlocks: ["BLK_FORM", "BLK_STORYBOARD", "BLK_LIST", "BLK_ACTIONS"],
  steps: [
    {
      id: "manifest",
      intent: "Collect skill metadata: id, label, kind, intent, outputs, matches.",
      presents: ["BLK_FORM"],
      inputs: [
        { kind: "text", key: "label", label: "Skill label (human name)" },
        { kind: "text", key: "intent", label: "One-sentence intent", long: true },
        { kind: "choice", key: "kind", label: "Kind", options: ["wizard", "model"] },
        { kind: "text", key: "matches", label: "Trigger phrases (comma-separated)", long: true },
      ],
    },
    {
      id: "steps",
      intent:
        "Draft the step playbook. One slide per step, each naming the BLK_* id it presents and the inputs it collects. User can add / rework / reorder.",
      presents: ["BLK_STORYBOARD"],
      inputs: [],
    },
    {
      id: "review",
      intent: "Show the composed skill.md as a list for confirmation.",
      presents: ["BLK_LIST", "BLK_ACTIONS"],
      inputs: [],
    },
    {
      id: "commit",
      intent:
        "Call tool_invoke skills.create({ id, label, kind, intent, steps, matches, usesBlocks }) — the server writes the pack to disk and refreshes the registry.",
      inputs: [],
    },
  ],
  bodyMd,
};
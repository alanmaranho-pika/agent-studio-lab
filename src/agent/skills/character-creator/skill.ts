import type { SkillPack } from "../types";
import bodyMd from "./skill.md?raw";

export const CharacterCreatorSkill: SkillPack = {
  id: "SKL_CHARACTER_CREATOR",
  appId: "character-creator",
  label: "Character Creator",
  kind: "wizard",
  intent: "Create a reusable character with name, look, and voice — saved to the library.",
  oneLiner: "Create a reusable character with name, look, and voice — saved to the library.",
  outputs: ["image"],
  matches: ["character", "cast", "persona", "portrait"],
  usesBlocks: ["BLK_FORM", "BLK_GALLERY", "BLK_ACTIONS"],
  steps: [
    {
      id: "brief",
      intent: "Name, role, vibe.",
      presents: ["BLK_FORM"],
      inputs: [
        { kind: "text", key: "name", label: "Character name" },
        { kind: "text", key: "brief", label: "Role + vibe", long: true },
      ],
    },
    {
      id: "look",
      intent: "Generate 4 look options (Nano Banana). User picks one or regenerates.",
      presents: ["BLK_GALLERY"],
      inputs: [],
    },
    {
      id: "voice",
      intent: "Pick a voice or clone one.",
      inputs: [{ kind: "voice", key: "voice", label: "Voice" }],
    },
    { id: "save", intent: "Save to library.", inputs: [] },
  ],
  bodyMd,
};
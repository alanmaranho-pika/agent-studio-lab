import type { SkillPack } from "../types";
import bodyMd from "./skill.md?raw";

export const TalkingHeadSkill: SkillPack = {
  id: "SKL_TALKING_HEAD",
  appId: "talking-head",
  label: "Talking Head Studio",
  kind: "wizard",
  intent: "Lipsync a portrait to a script or uploaded audio.",
  oneLiner: "Lipsync a portrait to a script or uploaded audio.",
  outputs: ["video"],
  matches: ["talking head", "lipsync", "avatar", "spokesperson"],
  usesBlocks: ["BLK_UPLOAD", "BLK_FORM", "BLK_MEDIA", "BLK_ACTIONS"],
  steps: [
    {
      id: "portrait",
      intent:
        "Get the portrait — upload OR pick from Library OR generate (Nano Banana).",
      presents: ["BLK_UPLOAD"],
      inputs: [
        { kind: "upload", key: "portrait", label: "Upload portrait", accepts: "image/*" },
        {
          kind: "asset-picker",
          key: "portraitFromLibrary",
          label: "…or pick from Library",
          mediaKinds: ["image"],
        },
      ],
    },
    {
      id: "script",
      intent: "Script + voice OR uploaded audio.",
      presents: ["BLK_FORM", "BLK_UPLOAD"],
      inputs: [
        { kind: "text", key: "script", label: "What should they say?", long: true },
        { kind: "voice", key: "voice", label: "Voice" },
        { kind: "upload", key: "audio", label: "…or upload audio instead", accepts: "audio/*" },
      ],
    },
    { id: "render", intent: "Render and review.", presents: ["BLK_MEDIA"], inputs: [] },
  ],
  bodyMd,
};
import type { SkillPack } from "../types";
import bodyMd from "./skill.md?raw";
import { WORLD_CUP_TEAMS } from "@/lib/world-cup.functions";
import { ANIME_MODES } from "@/lib/anime-world-cup.functions";

const ALL_TEAMS = [...WORLD_CUP_TEAMS] as string[];
const ALL_ANIME_MODES = ANIME_MODES.map((m) => m.label);

export const AnimeWorldCupSkill: SkillPack = {
  id: "SKL_ANIME_WORLD_CUP",
  appId: "anime-world-cup",
  label: "Anime World Cup 2026",
  kind: "wizard",
  intent: "Anime-style World Cup 2026 highlight from a selfie.",
  oneLiner: "Anime-style World Cup 2026 highlight — selfie + team + anime genre mode.",
  outputs: ["video"],
  matches: ["world cup", "anime", "football", "soccer"],
  usesBlocks: ["BLK_UPLOAD", "BLK_OPTIONS", "BLK_FORM", "BLK_MEDIA"],
  steps: [
    {
      id: "selfie",
      intent:
        "Get a selfie reference for the player. Offer upload, camera, AND library picker in the same card (the real app accepts all three).",
      presents: ["BLK_UPLOAD"],
      inputs: [
        { kind: "upload", key: "selfie", label: "Upload selfie", accepts: "image/*" },
        {
          kind: "asset-picker",
          key: "selfieFromLibrary",
          label: "…or pick from Library",
          mediaKinds: ["image"],
        },
      ],
    },
    {
      id: "team",
      intent:
        "Pick country/team AND opponent — show the FULL FIFA World Cup 2026 roster as pills, exactly like the real app. Do not truncate to a subset.",
      presents: ["BLK_OPTIONS"],
      inputs: [
        { kind: "choice", key: "team", label: "Your team", options: ALL_TEAMS },
        { kind: "choice", key: "opponent", label: "Opponent", options: ALL_TEAMS },
      ],
    },
    {
      id: "mode",
      intent:
        "Pick anime genre mode. Render each option as a large text-and-emoji tile (use the mode's emoji + label + a short descriptor). DO NOT reference any /anime-modes/*.jpg image path — those files do not exist and will render as broken thumbnails.",
      presents: ["BLK_OPTIONS"],
      inputs: [
        { kind: "choice", key: "modeId", label: "Anime mode", options: ALL_ANIME_MODES },
      ],
      notes:
        "Emoji+label pairs: " +
        ANIME_MODES.map((m) => `${m.emoji} ${m.label}`).join(", "),
    },
    {
      id: "moment",
      intent: "Describe the moment (optional — model is free to interpret).",
      presents: ["BLK_FORM"],
      inputs: [{ kind: "text", key: "moment", label: "The moment", long: true }],
    },
    {
      id: "render",
      intent:
        "Single-shot render via run_model_app (model: bytedance/seedance-2.0/text-to-video). This is a ONE-SHOT app — generate exactly ONE video clip; do NOT propose multi-beat storyboards, do NOT offer to 'fix timing on shot 3', and do NOT loop into more shots after the render. ALWAYS pass the selfie asset URL via referenceImageUrls so the player looks like the user.",
      presents: ["BLK_MEDIA"],
      inputs: [],
    },
  ],
  bodyMd,
};
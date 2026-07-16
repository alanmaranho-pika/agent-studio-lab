import type { SkillPack } from "../types";
import bodyMd from "./skill.md?raw";

export const MusicVideoSkill: SkillPack = {
  id: "SKL_MUSIC_VIDEO",
  appId: "music-video",
  label: "Music Video",
  kind: "wizard",
  intent: "Generate a music video around an uploaded track or AI-generated song.",
  oneLiner: "Generate a music video around an uploaded track or AI-generated song.",
  outputs: ["video"],
  matches: ["music video", "music", "song", "track"],
  usesBlocks: ["BLK_UPLOAD", "BLK_FORM", "BLK_OPTIONS", "BLK_STORYBOARD", "BLK_MEDIA"],
  steps: [
    {
      id: "track",
      intent: "Get the track. Offer upload OR generate-music in the same card.",
      presents: ["BLK_UPLOAD", "BLK_FORM"],
      inputs: [
        { kind: "upload", key: "trackUpload", label: "Upload your track", accepts: "audio/*" },
        { kind: "text", key: "musicPrompt", label: "…or describe a track to generate", long: true },
      ],
    },
    {
      id: "style",
      intent: "Visual style + aspect ratio.",
      presents: ["BLK_FORM"],
      inputs: [
        { kind: "text", key: "styleNotes", label: "Visual look", long: true },
        { kind: "choice", key: "aspect", label: "Aspect ratio", options: ["16:9", "9:16", "1:1"] },
      ],
    },
    {
      id: "storyboard",
      intent:
        "Beat-synced shot list — render as a storyboard block (one slide per shot) and let user revise.",
      presents: ["BLK_STORYBOARD"],
      inputs: [],
    },
    { id: "produce", intent: "Render and review.", inputs: [] },
  ],
  bodyMd,
};
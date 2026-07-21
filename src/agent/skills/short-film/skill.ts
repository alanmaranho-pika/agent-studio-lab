import type { SkillPack } from "../types";
import bodyMd from "./skill.md?raw";

export const ShortFilmSkill: SkillPack = {
  id: "SKL_SHORT_FILM",
  appId: "short-film",
  label: "Short Film",
  kind: "wizard",
  intent: "Take an idea to a finished multi-shot short.",
  oneLiner:
    "Take an idea to a finished multi-shot short — logline, cast, storyboard, animate, audio, produce.",
  outputs: ["video"],
  matches: ["short film", "narrative video", "multi-shot", "movie"],
  usesBlocks: [
    "BLK_OPTIONS",
    "BLK_FORM",
    "BLK_UPLOAD",
    "BLK_MOODBOARD",
    "BLK_STORYBOARD",
    "BLK_GALLERY",
    "BLK_MEDIA",
    "BLK_STAGE",
    "BLK_ACTIONS",
  ],
  steps: [
    {
      id: "logline",
      intent: "Logline + length.",
      presents: ["BLK_FORM"],
      inputs: [
        { kind: "text", key: "logline", label: "Logline (1–2 sentences)", long: true },
        {
          kind: "choice",
          key: "lengthSec",
          label: "Length",
          options: ["8s", "15s", "30s", "1m", "1m 30s", "2m"],
        },
      ],
    },
    {
      id: "aspect",
      intent:
        "Aspect ratio — its own turn as options with ratio visuals, never a form field.",
      presents: ["BLK_OPTIONS"],
      inputs: [
        { kind: "choice", key: "aspect", label: "Aspect ratio", options: ["16:9", "9:16", "1:1"] },
      ],
    },
    {
      id: "cast",
      intent:
        "Pick or create characters / environments / products. Pull from Library; offer Create Character which opens Character Creator inline.",
      presents: ["BLK_OPTIONS"],
      inputs: [
        { kind: "character", key: "characters", label: "Add character(s) from Library", multi: true },
        { kind: "environment", key: "environments", label: "Add environment(s)" },
      ],
    },
    {
      id: "audio",
      intent:
        "Audio plan FIRST, in TWO turns (never one card): (1) approach as a BLK_OPTIONS choice — music bed / voiceover / talking / mix / silent, multi; then (2) an OPTIONAL BLK_FORM audioNotes field, only when the approach needs direction. Informs beat pacing, dialogue, and whether characters speak on screen, so collect it BEFORE storyboard.",
      presents: ["BLK_OPTIONS", "BLK_FORM"],
      inputs: [
        {
          kind: "choice",
          key: "audioMode",
          label: "Audio",
          options: [
            "Music bed only",
            "Voiceover narration",
            "Talking characters",
            "Mix (music + VO + dialogue)",
            "No audio",
          ],
          multi: true,
        },
        {
          kind: "text",
          key: "audioNotes",
          label: "Audio direction (genre, narrator tone, who speaks what)",
          long: true,
        },
      ],
    },
    {
      id: "storyboard",
      intent:
        "Generate beat list (shots with description + duration), informed by the audio plan (pacing to music, VO lines per beat, on-screen dialogue). Show beats as a storyboard block (per shot: meta 'Shot N · Xs', short title, description, vo line when planned) for review.",
      presents: ["BLK_STORYBOARD"],
      inputs: [
        { kind: "text", key: "styleNotes", label: "Style / visual look notes", long: true },
      ],
    },
    {
      id: "animate",
      intent: "Pick render model per beat (Seedance 2.0 vs Kling Standard).",
      presents: ["BLK_OPTIONS"],
      inputs: [
        {
          kind: "choice",
          key: "videoPath",
          label: "Video model",
          options: ["Seedance 2.0", "Kling Standard"],
        },
      ],
    },
    {
      id: "produce",
      intent: "Render and review.",
      presents: ["BLK_STAGE", "BLK_ACTIONS"],
      inputs: [],
    },
  ],
  bodyMd,
};
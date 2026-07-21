import type { SkillPack } from "../types";
import bodyMd from "./skill.md?raw";

export const ProductAdSkill: SkillPack = {
  id: "SKL_PRODUCT_AD",
  appId: "product-ad",
  label: "Product Ad",
  kind: "wizard",
  intent: "Turn a product photo or URL into a polished ad.",
  oneLiner:
    "Turn a product photo (or product URL) into a polished ad — concept, style, model choice, render.",
  outputs: ["video"],
  matches: ["product ad", "commercial", "ad", "marketing"],
  usesBlocks: [
    "BLK_UPLOAD",
    "BLK_FORM",
    "BLK_OPTIONS",
    "BLK_STORYBOARD",
    "BLK_GALLERY",
    "BLK_MEDIA",
    "BLK_TIMELINE",
    "BLK_ACTIONS",
  ],
  steps: [
    {
      id: "product",
      intent:
        "Get the product. Offer BOTH a URL import AND an upload tile in the SAME card — user picks one. URL import scrapes title/image; upload accepts an image file.",
      presents: ["BLK_UPLOAD"],
      inputs: [
        {
          kind: "url",
          key: "productUrl",
          label: "Paste product URL (Shopify, Amazon, etc.)",
          placeholder: "https://…",
        },
        { kind: "upload", key: "productImage", label: "…or upload a product photo", accepts: "image/*" },
      ],
      notes: "These are alternatives — once one is provided, advance.",
    },
    {
      id: "brief",
      intent: "Brief: tagline, audience, length.",
      presents: ["BLK_FORM"],
      inputs: [
        { kind: "text", key: "tagline", label: "Tagline or hook (optional)" },
        { kind: "text", key: "audience", label: "Target audience" },
        { kind: "choice", key: "lengthSec", label: "Length", options: ["8s", "15s", "30s", "1m"] },
      ],
    },
    {
      id: "aspect",
      intent:
        "Aspect ratio — its own turn as options with ratio visuals, never a form field. Other ratios reachable via the Custom tile.",
      presents: ["BLK_OPTIONS"],
      inputs: [
        { kind: "choice", key: "aspect", label: "Aspect ratio", options: ["16:9", "9:16", "1:1"] },
      ],
    },
    {
      id: "concept",
      intent:
        "Generate 2–3 ad concepts as side-by-side BLK_OPTIONS pitch cards (subtitle 'Concept A · 30s', title, body = the pitch) — exclusive alternatives, never a paginated storyboard. On lock, translate the chosen concept into an ordered shot list and commit_project_patch({scenes}) — one scene per shot (a single-shot ad is one scene) — so the timeline can render the shots.",
      presents: ["BLK_OPTIONS"],
      inputs: [],
    },
    {
      id: "style",
      intent: "Pick a visual look.",
      presents: ["BLK_OPTIONS"],
      inputs: [
        {
          kind: "choice",
          key: "look",
          label: "Look",
          options: ["Cinematic", "Clean studio", "Lifestyle", "Editorial"],
        },
      ],
    },
    {
      id: "talent",
      intent:
        "On-screen talent (optional, multi) — its own turn; skip if the concept needs no one on camera.",
      presents: ["BLK_OPTIONS"],
      inputs: [
        { kind: "character", key: "talent", label: "Add on-screen talent (optional)", multi: true },
      ],
    },
    {
      id: "audio",
      intent:
        "Audio in TWO turns (never one card): (1) approach as a BLK_OPTIONS choice, then (2) an OPTIONAL BLK_FORM audioNotes field, only when the approach needs direction.",
      presents: ["BLK_OPTIONS", "BLK_FORM"],
      inputs: [
        {
          kind: "choice",
          key: "audioMode",
          label: "Audio",
          options: [
            "Music bed",
            "Voiceover narration",
            "Talking spokesperson",
            "Mix music + VO",
            "Silent / ambience only",
          ],
        },
        { kind: "text", key: "audioNotes", label: "Audio direction", long: true },
      ],
    },
    {
      id: "timeline",
      intent:
        "REQUIRED consolidation surface. Once scenes are patched, render_turn with a BLK_TIMELINE (variant preview) showing every shot in order (placeholder clips before render). Never leave shots as loose media cards. Put next steps in its actions.",
      presents: ["BLK_TIMELINE"],
      inputs: [],
    },
    {
      id: "produce",
      intent:
        "Pick render model (Seedance vs Kling), then anchor-first render per shot. After each shot lands, return to the BLK_TIMELINE so renders consolidate there — never a standalone media card. Final review + export live in the timeline's actions.",
      presents: ["BLK_OPTIONS", "BLK_TIMELINE"],
      inputs: [
        {
          kind: "choice",
          key: "videoPath",
          label: "Render with",
          options: ["Seedance 2.0", "Kling Standard (cheaper)"],
        },
      ],
    },
  ],
  bodyMd,
};
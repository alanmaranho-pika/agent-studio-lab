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
  usesBlocks: ["BLK_UPLOAD", "BLK_FORM", "BLK_OPTIONS", "BLK_STORYBOARD", "BLK_MEDIA", "BLK_ACTIONS"],
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
      intent: "Brief: tagline, audience, length, aspect ratio.",
      presents: ["BLK_FORM"],
      inputs: [
        { kind: "text", key: "tagline", label: "Tagline or hook (optional)" },
        { kind: "text", key: "audience", label: "Target audience" },
        { kind: "choice", key: "lengthSec", label: "Length", options: ["8s", "15s", "30s", "1m"] },
        { kind: "choice", key: "aspect", label: "Aspect ratio", options: ["16:9", "9:16", "1:1", "4:5"] },
      ],
    },
    {
      id: "concept",
      intent:
        "Generate 2–3 ad concepts. Render them as a visible list in the card; user picks one or asks to regenerate.",
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
        { kind: "character", key: "talent", label: "Add on-screen talent (optional)", multi: true },
      ],
    },
    {
      id: "audio",
      intent: "Audio choice + direction.",
      presents: ["BLK_FORM"],
      inputs: [
        {
          kind: "choice",
          key: "audioMode",
          label: "Audio",
          options: ["Music bed", "Voiceover narration", "Talking characters"],
        },
        { kind: "text", key: "audioNotes", label: "Audio direction", long: true },
      ],
    },
    {
      id: "produce",
      intent: "Pick render model (Seedance vs Kling) and render.",
      presents: ["BLK_OPTIONS"],
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
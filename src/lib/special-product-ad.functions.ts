// Server functions for the Special Product Ad app — concept generation and
// final Seedance prompt assembly. Uses Lovable AI Gateway for the LLM call;
// the actual video render goes through the standard fal pipeline.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const Input = z.object({
  brief: z.string().trim().min(1).max(2000),
  productHint: z.string().trim().max(200).optional(),
  lengthSec: z.number().int().min(4).max(600),
  look: z.string().trim().max(80).optional(),
});

const ConceptSchema = z.object({
  logline: z.string().min(1).max(280),
  beats: z
    .array(
      z.object({
        timecode: z.string().min(1).max(20),
        action: z.string().min(1).max(280),
        voiceover: z.string().max(280).optional(),
      }),
    )
    .min(3)
    .max(6),
  cta: z.string().max(120).optional(),
  // Audio direction — populated only when the corresponding toggle is on.
  musicMood: z.string().max(400).optional(),
  voiceoverScript: z.string().max(1200).optional(),
  dialogue: z
    .array(
      z.object({
        speaker: z.string().max(80).optional(),
        line: z.string().min(1).max(280),
      }),
    )
    .max(8)
    .optional(),
});

export type AdConcept = z.infer<typeof ConceptSchema>;

export const generateAdConcept = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<AdConcept> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const system =
      "You are a top-tier ad creative director. Given a product brief, write a tight, cinematic ad concept. " +
      "Return a JSON object with these exact keys: logline (string, <= 280 chars), " +
      "beats (array of 3-5 objects with timecode, action, and optional voiceover strings — each beat describes camera, subject action, and lighting in one sentence), " +
      "cta (optional short string, <= 120 chars). " +
      "If the brief includes an 'Audio plan' section, ALSO populate the matching optional fields, inventing fitting direction when the user left a line blank: " +
      "musicMood (string: genre, tempo, instrumentation, energy — only if 'Music bed' is listed); " +
      "voiceoverScript (string: a single cohesive narrator script for the full ad — only if 'Voiceover narration' is listed; do NOT also write per-beat voiceover lines if you fill this); " +
      "dialogue (array of {speaker, line} — only if 'Talking characters' is listed). " +
      "Omit any audio field whose toggle is not listed in the Audio plan. " +
      "Keep beats sequential and total duration within the target length. " +
      "Return ONLY valid JSON — no markdown, no code fences, no commentary.";

    const userPrompt =
      `Target length: ${data.lengthSec}s\n` +
      (data.look ? `Visual look: ${data.look}\n` : "") +
      (data.productHint ? `Product: ${data.productHint}\n` : "") +
      `Brief:\n${data.brief}`;

    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system,
        prompt: userPrompt,
        maxOutputTokens: 1600,
      });
      const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
      return ConceptSchema.parse(JSON.parse(jsonStr));
    } catch (err) {
      console.error("[product-ad] generateAdConcept failed", err);
      throw err;
    }
  });

// ── Look suggestions ──────────────────────────────────────────────
// Generate 4 tailored visual-look options based on the product + brief so
// the user picks from relevant directions instead of generic presets.
const LookInput = z.object({
  brief: z.string().trim().max(2000).optional(),
  productHint: z.string().trim().max(200).optional(),
  concept: z.string().trim().max(4000).optional(),
});

const LookOption = z.object({
  label: z.string().min(1).max(80),
  hint: z.string().min(1).max(240),
});

const LookSuggestions = z.object({
  looks: z.array(LookOption).min(4).max(4),
});

export type SuggestedLook = z.infer<typeof LookOption>;

export const suggestAdLooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LookInput.parse(data))
  .handler(async ({ data }): Promise<SuggestedLook[]> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const system =
      "You are an award-winning Director of Photography pitching 4 distinct shooting approaches for a product ad. " +
      "Think like a DP: camera format, lens choice, lighting setup, movement, and photographic feel. " +
      "Each option has: " +
      "- label: 2-4 words naming the photographic approach using REAL cinematography language (e.g. 'Anamorphic Macro', '85mm Window Light', 'Handheld 16mm Grain', 'Hard Top-Light Tabletop', 'Probe Lens Close-Up', 'High-Key Beauty Dish'). NO abstract poetry, NO mood words alone, NO 'The'. Must reference camera, lens, lighting, format, or movement. " +
      "- hint: one sentence naming concrete gear/technique — lens (mm, anamorphic, probe, macro), lighting (key direction, modifier, contrast ratio), camera move (locked-off, slider, gimbal, handheld), and film/digital look (35mm grain, ARRI clean, vintage glass flare). " +
      "The 4 options must be RADICALLY different from each other (different lens family + different lighting style + different movement) yet all sensible for this product. " +
      'Return ONLY valid JSON: {"looks":[{"label":"…","hint":"…"}, … 4 items]}. No markdown, no commentary.';

    const userPrompt =
      (data.productHint ? `Product: ${data.productHint}\n` : "") +
      (data.concept ? `Concept (the screenplay you must light & shoot):\n${data.concept}\n\n` : "") +
      (data.brief ? `Brief:\n${data.brief}` : data.concept ? "" : "Brief: (none provided — propose broadly useful looks)");

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system,
      prompt: userPrompt,
      maxOutputTokens: 1200,
    });
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    let jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

    const tryParse = (s: string) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    };

    let parsed = tryParse(jsonStr);
    if (!parsed) {
      // Repair: drop trailing partial object, close unbalanced braces/brackets.
      let s = jsonStr.replace(/,\s*([}\]])/g, "$1");
      // If the last item is partially written, cut back to the last complete one.
      const lastComma = s.lastIndexOf(",");
      const lastClose = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
      if (lastClose > 0 && lastComma > lastClose) {
        s = s.slice(0, lastComma);
      }
      let braces = 0;
      let brackets = 0;
      let inStr = false;
      let esc = false;
      for (const c of s) {
        if (esc) { esc = false; continue; }
        if (c === "\\") { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === "{") braces++;
        else if (c === "}") braces--;
        else if (c === "[") brackets++;
        else if (c === "]") brackets--;
      }
      while (brackets-- > 0) s += "]";
      while (braces-- > 0) s += "}";
      parsed = tryParse(s);
    }
    if (!parsed) {
      // Don't blow up the UI — fall back to broadly useful generic looks.
      return [
        { label: "Cinematic", hint: "Filmic lighting, anamorphic feel, shallow depth of field." },
        { label: "Studio", hint: "Clean seamless backdrop, soft key, crisp product hero shots." },
        { label: "Lifestyle", hint: "Natural light, real environments, candid handheld energy." },
        { label: "High-energy", hint: "Bold color, fast cuts, dynamic camera moves, punchy contrast." },
      ];
    }
    return LookSuggestions.parse(parsed).looks;
  });

// Pure helper (no AI). Assembles the final long prompt for Seedance 2.0
// from a concept + look. Kept here so the client and any future server-side
// render flows produce identical prompts.
export function composeSeedancePrompt({
  concept,
  look,
  productHint,
  audio,
}: {
  concept: AdConcept;
  look?: string;
  productHint?: string;
  audio?: {
    music: boolean;
    voiceover: boolean;
    talking: boolean;
  };
}): string {
  const header = [
    productHint ? `Product: ${productHint}.` : null,
    look ? `Visual look: ${look}.` : null,
    `Logline: ${concept.logline}`,
  ]
    .filter(Boolean)
    .join(" ");
  const beats = concept.beats
    .map((b, i) => {
      const vo = b.voiceover ? ` Voiceover: "${b.voiceover}"` : "";
      return `Shot ${i + 1} [${b.timecode}]: ${b.action}.${vo}`;
    })
    .join("\n");
  const tail = concept.cta ? `\nEnd card: ${concept.cta}` : "";

  // Audio block — Seedance 2.0 reads the prompt for audio cues, so we
  // explicitly tell it what to produce (or to stay silent).
  let audioBlock = "";
  if (audio) {
    const lines: string[] = [];
    if (audio.music && concept.musicMood) {
      lines.push(`- Music bed: ${concept.musicMood}`);
    } else if (audio.music) {
      lines.push(`- Music bed: instrumental score that fits the brief.`);
    }
    if (audio.voiceover && concept.voiceoverScript) {
      lines.push(`- Voiceover narration: "${concept.voiceoverScript}"`);
    }
    if (audio.talking && concept.dialogue && concept.dialogue.length > 0) {
      for (const d of concept.dialogue) {
        const who = d.speaker ? `${d.speaker}` : "Character";
        lines.push(`- On-screen dialogue — ${who}: "${d.line}"`);
      }
    }
    if (lines.length > 0) {
      audioBlock = `\n\nAudio:\n${lines.join("\n")}`;
    } else if (!audio.music && !audio.voiceover && !audio.talking) {
      audioBlock = `\n\nAudio: silent — no music, narration, or dialogue.`;
    }
  }

  return `${header}\n\n${beats}${tail}${audioBlock}`;
}

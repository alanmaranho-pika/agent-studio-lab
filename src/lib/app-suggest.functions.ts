// Suggest the best-matching App (skill) for a free-text user intent using
// Lovable AI. Returns up to 3 ranked candidates with confidence + reason.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SKILLS } from "@/lib/skills";

export type AppSuggestion = {
  skillId: string;
  label: string;
  confidence: number;
  reason: string;
};

export const suggestApp = createServerFn({ method: "POST" })
  .inputValidator((data: { intent: string }) =>
    z.object({ intent: z.string().min(1).max(4000) }).parse(data),
  )
  .handler(async ({ data }): Promise<{ suggestions: AppSuggestion[] }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    // Compact catalog — only what the model needs to rank.
    const catalog = SKILLS.map((s) => ({
      id: s.id,
      name: s.label,
      kind: s.kind,
      category: s.category,
      desc: s.description,
    }));

    const system =
      "You match a user's creative intent to the single best Apps from a catalog. " +
      "Return up to 3 candidates ranked by fit. Confidence is 0-1. " +
      "If nothing fits well (best < 0.4), return an empty list. " +
      "Only use ids that appear in the catalog.";

    const user = `User intent: """${data.intent}"""

Catalog (JSON):
${JSON.stringify(catalog)}

Pick the top 1-3 apps that best fulfill the intent.`;

    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "rank_apps",
                description: "Return ranked app suggestions.",
                parameters: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          skillId: { type: "string" },
                          confidence: { type: "number" },
                          reason: { type: "string" },
                        },
                        required: ["skillId", "confidence", "reason"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["suggestions"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "rank_apps" },
          },
        }),
      },
    );

    if (!resp.ok) {
      if (resp.status === 429)
        throw new Error("Rate limited — try again in a moment.");
      if (resp.status === 402)
        throw new Error("AI credits exhausted. Add credits in workspace settings.");
      const text = await resp.text();
      console.error("[suggestApp] gateway error", resp.status, text);
      throw new Error("Suggestion service unavailable");
    }

    const json = (await resp.json()) as {
      choices?: Array<{
        message?: {
          tool_calls?: Array<{
            function?: { arguments?: string };
          }>;
        };
      }>;
    };

    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let parsed: { suggestions?: Array<{ skillId: string; confidence: number; reason: string }> } = {};
    if (args) {
      try {
        parsed = JSON.parse(args);
      } catch {
        parsed = {};
      }
    }

    const byId = new Map(SKILLS.map((s) => [s.id, s] as const));
    const suggestions: AppSuggestion[] = (parsed.suggestions ?? [])
      .filter((s) => byId.has(s.skillId))
      .slice(0, 3)
      .map((s) => ({
        skillId: s.skillId,
        label: byId.get(s.skillId)!.label,
        confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0)),
        reason: String(s.reason ?? ""),
      }));

    return { suggestions };
  });

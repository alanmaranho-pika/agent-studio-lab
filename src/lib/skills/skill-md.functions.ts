// Server functions backing the in-app skill.md live editor (debug tool).
// Reads and writes `src/agent/skills/<appId>/skill.md` on the dev server's
// filesystem so the user can tweak the agent playbook without touching
// their editor. Vite HMR picks up the change via the `?raw` import in
// each skill's `skill.ts`, so the next agent turn uses the new prompt.
//
// Production Workers have no writable project filesystem — both handlers
// return a friendly error there.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const APP_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function assertDev(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Live skill editor is disabled in production builds.");
  }
}

async function resolveSkillPath(appId: string): Promise<string> {
  if (!APP_ID_RE.test(appId)) throw new Error(`Invalid appId "${appId}"`);
  const path = await import("node:path");
  const root = path.resolve(process.cwd(), "src/agent/skills");
  const full = path.resolve(root, appId, "skill.md");
  if (!full.startsWith(root + path.sep)) {
    throw new Error("Path traversal detected");
  }
  return full;
}

export const readSkillMd = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ appId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    assertDev();
    const fs = await import("node:fs/promises");
    const full = await resolveSkillPath(data.appId);
    const content = await fs.readFile(full, "utf8");
    return { content, path: full };
  });

export const writeSkillMd = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ appId: z.string(), content: z.string().max(200_000) }).parse(input),
  )
  .handler(async ({ data }) => {
    assertDev();
    const fs = await import("node:fs/promises");
    const full = await resolveSkillPath(data.appId);
    await fs.writeFile(full, data.content, "utf8");
    return { ok: true as const, path: full };
  });

// Strip an accidental ```markdown / ``` fence the model sometimes wraps the
// whole document in, without touching fenced code blocks inside the body.
function unwrapOuterFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/);
  return (m ? m[1] : t).trim();
}

// LLM-assisted revision for the live editor. Takes the current skill.md plus a
// natural-language instruction and returns the FULL rewritten document — the
// caller decides whether to apply/save it (this handler never writes to disk,
// so Undo stays purely client-side). Dev-only, mirroring read/write above.
export const improveSkillMd = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        appId: z.string(),
        content: z.string().max(200_000),
        instruction: z.string().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    assertDev();
    await resolveSkillPath(data.appId); // validates appId shape / traversal

    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
    const lovableKey = process.env.LOVABLE_API_KEY?.trim();
    let model;
    if (anthropicKey) {
      model = createAnthropic({ apiKey: anthropicKey })("claude-sonnet-4-5-20250929");
    } else if (lovableKey) {
      model = createLovableAiGatewayProvider(lovableKey)("google/gemini-3-flash-preview");
    } else {
      throw new Error(
        "AI is not configured. Add ANTHROPIC_API_KEY (preferred) or LOVABLE_API_KEY to .env.local, then restart the local server.",
      );
    }

    const system =
      "You edit agent skill playbooks written in Markdown with YAML frontmatter. " +
      "Apply the user's instruction to the document and return the COMPLETE revised " +
      "document only — no commentary, no explanation, no surrounding code fence. " +
      "Preserve the YAML frontmatter (between the leading ---) unless the instruction " +
      "explicitly asks to change it. Keep the existing structure, heading style, and " +
      "voice; make the smallest change that satisfies the instruction. Never invent " +
      "block IDs or tools — reuse only ones already present in the document.";

    const { text } = await generateText({
      model,
      system,
      prompt: `CURRENT skill.md:\n\n${data.content}\n\n---\n\nINSTRUCTION:\n${data.instruction}\n\nReturn the full revised skill.md now.`,
    });

    const content = unwrapOuterFence(text ?? "");
    if (!content) throw new Error("The model returned an empty document.");
    return { content };
  });
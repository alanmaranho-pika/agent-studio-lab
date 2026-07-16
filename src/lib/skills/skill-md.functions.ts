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
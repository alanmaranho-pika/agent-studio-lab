// Conditional catalog context. Every turn gets the one-line summary
// (~350 tokens); the full step playbook is injected ONLY for the app the
// project has actually selected. Mid-flow detours fetch other apps'
// playbooks on demand via the get_app_playbook tool.
//
// Block reference (BLK_* MDs) is fetched on demand via the
// get_block_reference tool — this file exposes the renderers so both the
// system prompt and the tool handler share the same output shape.

import { renderAppPlaybook, type AgentAppRegistry } from "../app-registry";
import {
  renderBlockCatalog,
  renderBlockReference,
  BLOCKS_BY_ID,
  type BlockId,
} from "@/agent/blocks/_registry";

export function renderAppCatalogSummary(registry: AgentAppRegistry): string {
  const lines = registry.apps.map(
    (a) => `- ${a.id} (${a.kind}${a.mode ? `/${a.mode}` : ""}): ${a.oneLiner}`,
  );
  return `APP CATALOG (summaries — call get_app_playbook({ appId }) for an app's full steps):\n${lines.join("\n")}`;
}

export function renderSelectedAppContext(registry: AgentAppRegistry, appId: string | null): string {
  if (!appId) return "";
  const playbook = renderAppPlaybook(registry, appId) ?? "";
  const pack = registry.skillByAppId.get(appId);
  if (!pack?.usesBlocks?.length) return playbook;
  const validIds = pack.usesBlocks.filter((id): id is BlockId => id in BLOCKS_BY_ID);
  if (!validIds.length) return playbook;
  return [
    playbook,
    "",
    "═════ BLOCK REFERENCE — the blocks this skill uses ═════",
    renderBlockReference(validIds),
  ].join("\n");
}

export { renderBlockCatalog };

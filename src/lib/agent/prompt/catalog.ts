// Conditional catalog context. Every turn gets the one-line summary
// (~350 tokens); the full step playbook is injected ONLY for the app the
// project has actually selected. Mid-flow detours fetch other apps'
// playbooks on demand via the get_app_playbook tool.

import { APP_REGISTRY, renderAppPlaybook } from "../app-registry";

export function renderAppCatalogSummary(): string {
  const lines = APP_REGISTRY.map(
    (a) => `- ${a.id} (${a.kind}${a.mode ? `/${a.mode}` : ""}): ${a.oneLiner}`,
  );
  return `APP CATALOG (summaries — call get_app_playbook({ appId }) for an app's full steps):\n${lines.join("\n")}`;
}

export function renderSelectedAppContext(appId: string | null): string {
  if (!appId) return "";
  return renderAppPlaybook(appId) ?? "";
}

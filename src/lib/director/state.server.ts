// @ts-nocheck — legacy feature file; feature tables (characters, library_subjects, render_jobs, etc.) are not part of the projects-first Supabase migration.
/**
 * Serialized project-state helpers for Director tools.
 *
 * Every tool that mutates `projects.project_state` goes through
 * `mutateProjectState`, which round-trips through the Postgres RPC
 * `director_mutate_state`. That RPC takes a per-project advisory lock so
 * parallel tool_use blocks in a single agent turn cannot overwrite each
 * other. The merge (applyPatch) still lives here in JS.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  INITIAL_PROJECT,
  applyPatch,
  type ProjectPatch,
  type ProjectState,
} from "@/lib/project-state";

export async function readProjectState(projectId: string): Promise<ProjectState> {
  const { data } = await supabaseAdmin
    .from("projects")
    .select("project_state")
    .eq("id", projectId)
    .maybeSingle();
  return (data?.project_state as ProjectState | null) ?? INITIAL_PROJECT;
}

/**
 * List uploaded/generated reference-worthy stills stored in the
 * `project_assets` table but not always mirrored into project_state.
 * Used by buildStateSummary so the agent knows uploads exist and can
 * pass their ids as `assetRefIds` on producer calls.
 */
export async function listReferenceAssetsForSummary(
  projectId: string,
): Promise<Array<{ id: string; kind: string; name: string; attachedTo?: string }>> {
  const { data } = await supabaseAdmin
    .from("project_assets")
    .select("id, kind, mime, name, attached_to, created_at")
    .eq("project_id", projectId)
    .in("kind", ["reference", "likeness", "logo", "keyframe", "image"])
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? [])
    .filter((r) => (r.mime as string | null)?.startsWith("image/"))
    .map((r) => ({
      id: r.id as string,
      kind: (r.kind as string) ?? "reference",
      name: (r.name as string) ?? "",
      attachedTo: (r.attached_to as string | null) ?? undefined,
    }));
}

export async function mutateProjectState(
  projectId: string,
  patch: ProjectPatch,
): Promise<ProjectState> {
  // Read current -> apply patch in JS -> write via RPC (lock inside RPC).
  const { data: row } = await supabaseAdmin
    .from("projects")
    .select("project_state, title")
    .eq("id", projectId)
    .maybeSingle();
  const current = (row?.project_state as ProjectState | null) ?? INITIAL_PROJECT;
  const next = applyPatch(current, patch);
  const nextTitle =
    patch.meta?.title && patch.meta.title.trim()
      ? patch.meta.title.trim()
      : ((row?.title as string | undefined) ?? undefined);

  const { data: written, error } = await supabaseAdmin.rpc("director_mutate_state", {
    _project_id: projectId,
    _next_state: next as unknown as never,
    _next_title: nextTitle,
  });
  if (error) {
    // The serialized-write RPC isn't present in every deployment (e.g. a
    // personal Supabase without the director migration → PGRST202). Fall
    // back to a direct update so state still persists — we forgo only the
    // per-project advisory lock that guards parallel same-turn writes (rare
    // last-writer-wins), which is far better than silently dropping the
    // write (renders/uploads would never land on the timeline).
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("projects")
      .update({
        project_state: next as unknown as never,
        ...(nextTitle ? { title: nextTitle } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .select("project_state")
      .maybeSingle();
    if (updateErr) {
      console.error("[director] mutate_state fallback update failed:", updateErr);
      return next;
    }
    return (updated?.project_state as ProjectState | null) ?? next;
  }
  return (written as ProjectState | null) ?? next;
}

/**
 * Compact string summary of state, injected into the system prompt every
 * turn so the agent doesn't re-ask what's already recorded.
 */
export function buildStateSummary(
  state: ProjectState,
  uploadedRefs: Array<{ id: string; kind: string; name: string; attachedTo?: string }> = [],
): string {
  const meta = state.meta;
  const scenes =
    state.scenes.length === 0
      ? "  (no shots yet)"
      : state.scenes
          .slice(0, 40)
          .map(
            (s) =>
              `  - ${s.id} · #${s.n} ${s.title} — "${s.prompt || ""}"` +
              ` [thumb=${s.thumb ? "yes" : "none"}, ${s.status}]`,
          )
          .join("\n");
  const assets =
    state.assets.length === 0
      ? "  (no assets yet)"
      : state.assets
          .slice(-12)
          .map(
            (a) =>
              `  - ${a.id} · ${a.kind}/${a.mime} ${a.label ?? a.name}` +
              ` attachedTo=${a.attachedTo ?? "—"}`,
          )
          .join("\n");
  const docs = state.docs ?? [];
  const docsLine =
    docs.length === 0
      ? "  (no docs yet)"
      : docs
          .slice(0, 20)
          .map((d) => `  - ${d.id} · "${d.title}" (${d.body.length} chars)`)
          .join("\n");
  const cast = state.cast ?? [];
  const castLine =
    cast.length === 0
      ? "  (no cast yet)"
      : cast
          .slice(0, 20)
          .map((c) => `  - ${c.id} · ${c.name} (${c.role})${c.ref ? " [ref✓]" : ""}`)
          .join("\n");
  const locations = state.locations ?? [];
  const locationsLine =
    locations.length === 0
      ? "  (no locations yet)"
      : locations
          .slice(0, 20)
          .map((l) => `  - ${l.id} · ${l.name}${l.ref ? " [ref✓]" : ""}`)
          .join("\n");
  const refs = state.references ?? [];
  const selectedRefs = refs.filter((r) => r.selected);
  const refsLine =
    refs.length === 0
      ? "  (no reference tiles yet)"
      : `  ${refs.length} total, ${selectedRefs.length} selected by user` +
        (selectedRefs.length > 0
          ? "\n" +
            selectedRefs
              .slice(0, 12)
              .map((r) => `  * ${r.id} · ${r.handle ?? r.source ?? "web"} → ${r.url}`)
              .join("\n")
          : "");
  const uploadedLine =
    uploadedRefs.length === 0
      ? "  (no uploaded reference stills yet)"
      : uploadedRefs
          .slice(0, 20)
          .map(
            (u) =>
              `  - ${u.id} · ${u.kind} · "${u.name}"` +
              (u.attachedTo ? ` (attached to ${u.attachedTo})` : " ← available as ref"),
          )
          .join("\n");
  const style = state.styleLock;
  const styleLine = style?.anchor
    ? `Style lock (auto-prepended to every produce_*):\n  "${style.anchor.slice(0, 800)}"`
    : "Style lock: (none — call set_style_lock once you've distilled a look)";
  return [
    "PROJECT STATE (durable memory — never re-ask what's here):",
    `Meta: title="${meta.title}" | format=${meta.format || "—"} | aspect=${meta.aspectRatio || "—"} | logline="${meta.logline || ""}"`,
    styleLine,
    "Docs:",
    docsLine,
    "Cast:",
    castLine,
    "Locations:",
    locationsLine,
    "Uploaded reference stills (pass ids as assetRefIds on produce_*; every product/graphic/design HAS to be attached this way):",
    uploadedLine,
    "Pinterest references:",
    refsLine,
    "Shots:",
    scenes,
    "Recent assets (renders + uploads mirrored into state):",
    assets,
  ].join("\n");
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  Download,
  Film,
  Heart,
  Loader2,
  Plus,
  BookmarkPlus,
  RotateCcw,
  X,
  Pencil,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { AudioPlayer } from "@/components/v2/audio-player";
import { getProject, listProjects, useLocalProjectFn } from "@/lib/local-projects";
import { SKILL_BY_ID, type Skill } from "@/lib/skills";
import type { ProjectAsset } from "@/lib/project-state";
import { getAppSwatch } from "@/lib/app-swatch";
import { stableAssetUrl } from "@/lib/v2/stable-asset-url";
import { AssetActionsMenu } from "@/components/v2/apps/asset-actions-menu";
import { AssetLightbox, type LightboxAsset } from "@/components/v2/asset-lightbox";
import { ProjectThumbnail } from "@/components/project-thumbnail";
import { SubjectFormDialog } from "@/components/v2/library/subject-form-dialog";
import { AskAgentMarkup } from "@/components/v2/apps/ask-agent-markup";


export type OutputMeta = {
  prompt: string;
  skillId: string;
  /** Optional friendly title override (e.g. character name). */
  title?: string;
  /** Optional one-line description override (replaces raw prompt). */
  description?: string;
};

export type ActiveRunView = {
  id: string;
  skill: Skill;
  projectId: string;
  prompt: string;
  phase: "starting" | "polling" | "error";
  error?: string;
  refImageUrls?: string[];
};

function friendlyLabel(
  meta: OutputMeta | undefined,
): string {
  if (!meta) return "";
  return (meta.description ?? meta.prompt ?? "").trim();
}

function legacyOutputDuplicateKey(asset: ProjectAsset): string {
  return [
    asset.kind,
    asset.mime,
    asset.name,
    asset.label ?? "",
    asset.duration ?? "",
    asset.width ?? "",
    asset.height ?? "",
  ].join("|");
}

function dedupeOutputs(assets: ProjectAsset[]): ProjectAsset[] {
  const seenRunKeys = new Set<string>();
  const seenLegacy = new Map<string, string | undefined>();
  const out: ProjectAsset[] = [];

  for (const asset of assets) {
    if (asset.attachedTo?.startsWith("run:")) {
      if (seenRunKeys.has(asset.attachedTo)) continue;
      seenRunKeys.add(asset.attachedTo);
      out.push(asset);
      continue;
    }

    const legacyKey = legacyOutputDuplicateKey(asset);
    const existingCreatedAt = seenLegacy.get(legacyKey);
    const currentCreatedAt = asset.createdAt;
    if (existingCreatedAt && currentCreatedAt) {
      const delta = Math.abs(
        new Date(existingCreatedAt).getTime() - new Date(currentCreatedAt).getTime(),
      );
      if (Number.isFinite(delta) && delta < 5 * 60_000) continue;
    }
    seenLegacy.set(legacyKey, currentCreatedAt);
    out.push(asset);
  }

  return out;
}

import { useAssetFavorites } from "@/hooks/use-asset-favorites";

export function ProjectOutputsPanel({
  projectId,
  activeRuns,
  outputMeta,
  onRegenerate,
  onUseInApp,
  onNewProject,
  onDismissRun,
  onAskAgent,
  timelineOpen,
  onToggleTimeline,
  hideProjectSelector = false,
}: {
  projectId?: string;
  activeRuns: ActiveRunView[];
  outputMeta: Record<string, OutputMeta>;
  onRegenerate: (args: { skill: Skill; prompt: string; projectId: string }) => void;
  onUseInApp: (args: { skill: Skill; asset: ProjectAsset }) => void;
  onNewProject: () => void;
  onDismissRun: (id: string) => void;
  onAskAgent?: (args: { prompt: string; referenceImageUrls: string[] }) => void | Promise<void>;
  timelineOpen?: boolean;
  onToggleTimeline?: () => void;
  hideProjectSelector?: boolean;
}) {

  const navigate = useNavigate();
  const fetchList = useLocalProjectFn(listProjects);
  const fetchProject = useLocalProjectFn(getProject);
  const { toggle: toggleFavorite, isFavorite } = useAssetFavorites();
  const [lightbox, setLightbox] = useState<LightboxAsset | null>(null);
  const [saveSubject, setSaveSubject] = useState<ProjectAsset | null>(null);
  const [askAsset, setAskAsset] = useState<{ asset: ProjectAsset; url: string } | null>(null);


  const listQ = useQuery({
    queryKey: ["v2-projects", "list"],
    queryFn: () => fetchList(),
  });
  const projects = listQ.data?.projects ?? [];

  const runsForThisProject = activeRuns.filter(
    (r) => r.projectId === projectId,
  );
  const hasPendingRun = runsForThisProject.some(
    (r) => r.phase === "starting" || r.phase === "polling",
  );

  const projectQ = useQuery({
    queryKey: ["v2-project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId! } }),
    enabled: !!projectId && projectId !== "anonymous-draft",
    // Poll while runs are in flight OR while there are in-timeline
    // placeholders (e.g. multi-beat Seedance fan-out where each beat
    // swaps its placeholder in as it lands).
    refetchInterval: (query) => {
      const data = query.state.data as
        | { assets?: Array<{ kind: string }> }
        | undefined;
      const hasPendingAssets = !!data?.assets?.some((a) => a.kind === "pending");
      return hasPendingRun || hasPendingAssets ? 4000 : false;
    },
  });


  const project = projectQ.data?.project;
  const assets = projectQ.data?.assets ?? [];
  const outputs = useMemo(
    () =>
      assets
        .filter((a) =>
          [
            "keyframe",
            "image",
            "reference",
            "video",
            "audio",
            "music",
            "voiceover",
            "final",
            // "pending" placeholders are surfaced here as rendering tiles
            // so Agent Mode renders (which don't create an ActiveRunView)
            // are visible in Outputs the moment they're queued, matching
            // the placeholder that appears in the timeline.
            "pending",
          ].includes(a.kind),
        )
        .slice()
        .reverse(),
    [assets],
  );
  const visibleOutputs = useMemo(() => dedupeOutputs(outputs), [outputs]);

  const hasRunsHere = runsForThisProject.length > 0;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef(0);
  useEffect(() => {
    const total = visibleOutputs.length + runsForThisProject.length;
    if (total > lastCountRef.current && scrollRef.current) {
      const el = scrollRef.current;
      requestAnimationFrame(() => {
        el.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
    lastCountRef.current = total;
  }, [visibleOutputs.length, runsForThisProject.length]);


  const selectProject = (id: string) => {
    void navigate({
      to: "/studio/$projectId",
      params: { projectId: id },
    });
  };


  const showTimelineToggle = !!(projectId && onToggleTimeline && !timelineOpen);
  const showHeader = !hideProjectSelector || showTimelineToggle;

  return (
    <div className="flex h-full flex-col">
      {/* Project header */}
      {showHeader && (
      <header className="flex items-center justify-between gap-3 px-6 py-4">
        {hideProjectSelector ? (
          <div />
        ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="group flex min-w-0 items-center gap-2 rounded-xl px-2 py-1 -my-1 -ml-2 hover:bg-muted">
              <h2 className="truncate font-display text-xl font-semibold tracking-tight">
                {projectId ? project?.title ?? "Loading…" : "New project"}
              </h2>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuItem onSelect={onNewProject}>
              <Plus className="mr-2 h-4 w-4" />
              New project
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {projects.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No other projects yet.
              </div>
            )}
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => selectProject(p.id)}
                className="flex items-center gap-2"
              >
                <div className="h-7 w-7 shrink-0 overflow-hidden rounded-md bg-muted">
                  <ProjectThumbnail
                    url={p.thumbnailUrl}
                    kind={p.thumbnailKind}
                    title={p.title}
                    className="h-full w-full object-cover"
                    iconClassName="h-3.5 w-3.5"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {p.title || "Untitled"}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                {p.id === projectId && (
                  <span className="text-[10px] text-muted-foreground">current</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        )}

        {showTimelineToggle && (
          <Button variant="ghost" size="sm" onClick={onToggleTimeline}>
            <Film className="mr-1.5 h-3.5 w-3.5" />
            Open Timeline
          </Button>
        )}
      </header>
      )}



      {/* Outputs scrollable list */}
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} className="h-full overflow-y-auto px-6 py-5">
        {visibleOutputs.length === 0 && !hasRunsHere ? (
          <div className="grid h-full place-items-center rounded-3xl border border-dashed border-hairline bg-muted/20 px-6 py-16 text-center">
            <div className="max-w-sm">
              
              <p className="text-sm text-muted-foreground">
                No outputs yet. Configure the app on the left and hit Generate
                — results show up here.
              </p>
            </div>
          </div>
        ) : (
          <>
          {runsForThisProject.length > 0 && (
            <div className="mb-4 space-y-3">
              {runsForThisProject.map((r) => (
                <RunCard key={r.id} run={r} onDismiss={() => onDismissRun(r.id)} />
              ))}
            </div>
          )}
          <ul className="@container space-y-4">
            {visibleOutputs.map((o) => {
              const meta = outputMeta[o.id];
              const skill = meta ? SKILL_BY_ID[meta.skillId] : null;
              const stableUrl = stableAssetUrl(o.id, o.url);
              return (
                <li
                  key={o.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-v2-asset-id", o.id);
                    e.dataTransfer.setData("application/x-v2-asset-mime", o.mime);
                    e.dataTransfer.effectAllowed = "copyMove";
                  }}
                  className="@container group cursor-grab overflow-hidden rounded-lg border border-hairline bg-card active:cursor-grabbing"
                >
                  <div className="relative bg-muted/30">
                    {o.mime.startsWith("image/") && (
                      <button
                        type="button"
                        onClick={() =>
                          setLightbox({
                            id: o.id,
                            url: stableUrl,
                            mime: o.mime,
                            name: o.name,
                            label: o.label,
                            projectTitle: project?.title ?? undefined,
                            kind: o.kind,
                            width: o.width ?? null,
                            height: o.height ?? null,
                            duration: o.duration ?? null,
                          })
                        }
                        className="block w-full text-left"
                        aria-label="Open preview"
                      >
                        <img
                          src={stableUrl}
                          alt=""
                          draggable={false}
                          className="block max-h-[70vh] w-full object-contain"
                        />
                      </button>
                    )}
                    {o.kind === "pending" && (
                      <div className="grid aspect-video w-full place-items-center bg-muted/40">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span className="text-[11px] uppercase tracking-wider">
                            Rendering…
                          </span>
                          {o.label && (
                            <span className="line-clamp-2 max-w-[80%] text-center text-xs text-foreground/70">
                              {o.label}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {o.kind !== "pending" && o.mime.startsWith("video/") && (
                      <video
                        src={stableUrl}
                        controls
                        draggable={false}
                        className="block max-h-[70vh] w-full"
                      />
                    )}
                    {o.mime.startsWith("audio/") && (
                      <div className="w-full px-3 py-3">
                        <AudioPlayer compact src={stableUrl} title={friendlyLabel(meta) || skill?.label || "Audio"} />
                      </div>
                    )}


                    {/* Hover action overlay */}
                    <div className="pointer-events-none absolute right-2 top-2 flex flex-wrap items-center justify-end gap-1.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
                      <AssetActionsMenu asset={o} onUseInApp={onUseInApp} />
                      {meta && skill && projectId && (
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8 rounded-full bg-background/85 backdrop-blur shadow-sm"
                          onClick={() =>
                            onRegenerate({ skill, prompt: meta.prompt, projectId })
                          }
                          aria-label="Regenerate"
                          title="Regenerate"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        asChild
                        size="icon"
                        variant="secondary"
                        className="h-8 w-8 rounded-full bg-background/85 backdrop-blur shadow-sm"
                        aria-label="Download"
                        title="Download"
                      >
                        <a href={o.url} download target="_blank" rel="noreferrer">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-8 w-8 rounded-full bg-background/85 backdrop-blur shadow-sm"
                        onClick={() => toggleFavorite(o.id)}
                        aria-label={isFavorite(o.id) ? "Unfavorite" : "Favorite"}
                        title={isFavorite(o.id) ? "Remove from favorites" : "Add to favorites"}
                      >
                        <Heart
                          className={
                            "h-3.5 w-3.5 " +
                            (isFavorite(o.id)
                              ? "fill-rose-500 text-rose-500"
                              : "text-foreground")
                          }
                        />
                      </Button>
                      {o.mime.startsWith("image/") && o.kind !== "pending" && (
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8 rounded-full bg-background/85 backdrop-blur shadow-sm"
                          onClick={() => setSaveSubject(o)}
                          aria-label="Save to Library"
                          title="Save to Library as reusable subject"
                        >
                          <BookmarkPlus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {onAskAgent && o.kind !== "pending" && (
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8 rounded-full bg-background/85 backdrop-blur shadow-sm"
                          onClick={() => setAskAsset({ asset: o, url: stableUrl })}
                          aria-label="Ask the agent about this"
                          title="Circle & ask the agent"
                        >
                          <Pencil className="h-3.5 w-3.5 text-rose-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {(skill || friendlyLabel(meta) || meta?.title) && (
                    <div className="flex items-start gap-2 border-t border-hairline px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        {(meta?.title || skill) && (
                          <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            {skill && <skill.icon className="h-3 w-3 shrink-0" />}
                            <span className="truncate">
                              {meta?.title ?? skill?.label}
                            </span>
                          </div>
                        )}
                        {friendlyLabel(meta) && (
                          <p className="line-clamp-2 text-xs text-foreground/80">
                            {friendlyLabel(meta)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          </>
        )}

        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent" />
      </div>
      <AssetLightbox
        asset={lightbox}
        onClose={() => setLightbox(null)}
        isFavorite={lightbox ? isFavorite(lightbox.id) : false}
        onToggleFavorite={lightbox ? () => toggleFavorite(lightbox.id) : undefined}
      />
      <SubjectFormDialog
        open={!!saveSubject}
        onOpenChange={(v) => !v && setSaveSubject(null)}
        initial={
          saveSubject
            ? {
                kind: "product",
                name: saveSubject.label ?? saveSubject.name ?? "",
                projectAssetId: saveSubject.id,
                previewUrl: stableAssetUrl(saveSubject.id, saveSubject.url),
                allowKindChange: true,
              }
            : undefined
        }
        onSaved={() => setSaveSubject(null)}
      />
      {askAsset && projectId && onAskAgent && (
        <AskAgentMarkup
          asset={askAsset.asset}
          displayUrl={askAsset.url}
          projectId={projectId}
          onClose={() => setAskAsset(null)}
          onAsk={onAskAgent}
        />
      )}
    </div>

  );
}

function RunCard({
  run,
  onDismiss,
}: {
  run: ActiveRunView;
  onDismiss: () => void;
}) {
  const Icon = run.skill.icon;
  const isError = run.phase === "error";
  const swatch = getAppSwatch(run.skill.id);
  const bgImage = run.refImageUrls?.[0];

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-hairline bg-card">
      <div
        className="relative grid h-56 place-items-center overflow-hidden"
        style={{ backgroundColor: "#efe8d6" }}
      >
        {bgImage ? (
          <img
            src={bgImage}
            alt=""
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl opacity-50 mix-blend-multiply"
          />
        ) : null}

        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/70 text-foreground/70 backdrop-blur hover:bg-white/90 hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {!isError && (
          <Loader2 className="relative h-6 w-6 animate-spin text-white" />
        )}
        {isError && (
          <X className="relative h-7 w-7 text-white" />
        )}
      </div>

      <div className="flex items-center gap-2.5 border-t border-hairline px-4 py-3">
        <div
          className="grid h-6 w-6 shrink-0 place-items-center rounded-[28%]"
          style={{ backgroundColor: swatch.bg, color: swatch.fg }}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="shrink-0 text-xs font-medium text-foreground">
          {run.skill.label}
        </span>
        {(isError || run.prompt) && (
          <>
            <span className="text-muted-foreground text-xs">·</span>
            <span
              className={
                "truncate text-xs " +
                (isError ? "text-destructive" : "text-muted-foreground italic")
              }
            >
              {isError ? run.error ?? "Generation failed" : `“${run.prompt}”`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

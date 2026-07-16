import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  getProject,
  updateProjectState,
  updateProjectStudioPrefs,
} from "@/lib/local-projects";
import { useLocalProjectFn } from "@/lib/local-projects";
import { AgentShell } from "@/components/studio/agent/agent-shell";
import { LegacyStudioShell, formatDuration } from "@/components/studio/legacy-studio-shell";

import {
  DEFAULT_MODEL_BY_KIND,
  SKILL_BY_ID,
  type Skill,
  type StudioMode,
} from "@/lib/skills";
// "Shots" still routes through the chat AI (it asks the director to fill in
// any missing shot images via the generate_image tool).
// "Render final video" runs the deterministic fal.ai pipeline — no LLM.
import { renderFinalVideo, listProjectRenders } from "@/lib/render.functions";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import {
  Play,
  ListVideo,
  Download,
  Film,
  LayoutGrid,
  Users,
  Music2,
  Plus,
  ImagePlus,
  Loader2,
  History,
  RotateCw,
  Pencil,
  X,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ProjectTimelinePanel, type TimelinePanelActions } from "@/components/v2/apps/project-timeline-panel";
import { ProjectOutputsPanel } from "@/components/v2/apps/project-outputs-panel";
import { useRunsStore } from "@/components/v2/apps/runs-store";
import { Button } from "@/components/ui/button";
import {
  INITIAL_PROJECT,
  applyPatch,
  resolveThumb,

  type Character,
  type Music,
  type ProjectAsset,
  type ProjectPatch,
  type ProjectState,
  type Scene,
} from "@/lib/project-state";
// (StepCardView / useAgentDerivedState removed — dead `render_step` path.)
export const Route = createFileRoute("/_authenticated/studio/$projectId")({
  // Studio is a highly-interactive client surface (chat transport, drag
  // handles, localStorage-seeded panel widths, ai-sdk subscriptions). It
  // doesn't render meaningfully on the server and SSR'ing it has been
  // surfacing a "Cannot read properties of undefined (reading 'bind')"
  // crash inside useChat's transport bootstrap → the user sees the
  // "This page didn't load" error boundary. Skip SSR for this route.
  ssr: false,
  loader: async ({ context, params }) => {
    // Fetch the project up-front so a missing/deleted id redirects cleanly
    // to /projects instead of surfacing as a runtime error + blank screen.
    let result: Awaited<ReturnType<typeof getProject>> | null = null;
    try {
      result = await context.queryClient.fetchQuery({
        queryKey: ["project", params.projectId],
        queryFn: () => getProject({ data: { id: params.projectId } }),
        retry: false,
      });
    } catch {
      throw redirect({ to: "/projects" });
    }
    if (!result) throw redirect({ to: "/projects" });
  },


  component: Studio,
});

// ---------- page ----------

function Studio() {
  const navigate = useNavigate();
  const { projectId } = Route.useParams();
  const fetchProject = useLocalProjectFn(getProject);
  const updateState = useLocalProjectFn(updateProjectState);
  const queryClient = useQueryClient();
  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId } }),
    // Freshness is driven by the postgres_changes subscription below, which
    // invalidates this query whenever the row changes server-side. Avoid
    // the extra round-trip that `staleTime: 0` + `refetchOnMount: "always"`
    // used to add on every studio open.
    staleTime: 30_000,
    // Bridge the "New Project" optimistic-navigate race: the studio can mount
    // before the server-side insert commits, so briefly retry before bouncing.
    retry: 4,
    retryDelay: 300,
  });
  useEffect(() => {
    if (projectQuery.error || (projectQuery.isFetched && projectQuery.data === null)) {
      void navigate({ to: "/projects" });
    }
  }, [projectQuery.error, projectQuery.isFetched, projectQuery.data, navigate]);

  const [project, setProject] = useState<ProjectState>(INITIAL_PROJECT);
  useEffect(() => {
    if (projectQuery.data?.project.projectState) {
      setProject(projectQuery.data.project.projectState);
    }
    // Re-apply whenever a fresh fetch lands, not just when the id changes,
    // so navigating back to a project picks up server-side updates the
    // agent made between visits.
  }, [projectQuery.data, projectQuery.dataUpdatedAt]);

  // Studio toolbar state: agent | image | video | audio | speech + selected
  // Fal model. Seeded from project columns; persisted server-side on change.
  const [studioMode, setStudioMode] = useState<StudioMode>("agent");
  const [studioModel, setStudioModel] = useState<string | null>(null);
  useEffect(() => {
    const p = projectQuery.data?.project;
    if (!p) return;
    const mode = (p.studioMode as StudioMode | undefined) || "agent";
    setStudioMode(mode);
    setStudioModel(
      p.studioModel ??
        (mode === "agent" || mode === "director-v2"
          ? null
          : DEFAULT_MODEL_BY_KIND[mode as Exclude<StudioMode, "agent" | "director-v2">]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectQuery.data?.project.id]);
  const persistPrefs = useLocalProjectFn(updateProjectStudioPrefs);
  const onToolbarChange = (next: { mode: StudioMode; model: string | null }) => {
    setStudioMode(next.mode);
    setStudioModel(next.model);
    void persistPrefs({
      data: {
        id: projectId,
        studioMode: next.mode,
        studioModel: next.model,
      },
    });
  };

  // Capture initial messages ONCE per project id. Re-deriving on every
  // render (e.g. when setProject runs from the postgres subscription or
  // handlePatch) gives useChat a fresh array reference each time, which
  // makes it reset its internal state — wiping just-sent user messages
  // and partially-streamed assistant tokens. Pin it with a ref so the
  // reference is stable for the life of this project session.
  const initialMessagesRef = useRef<{ projectId: string; messages: UIMessage[] } | null>(null);
  const initialMessages: UIMessage[] = useMemo(() => {
    const pinned = initialMessagesRef.current;
    if (pinned && pinned.projectId === projectId) {
      return pinned.messages;
    }
    const seed = (projectQuery.data?.messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      parts: (Array.isArray(m.parts) ? m.parts : []) as UIMessage["parts"],
    })) as UIMessage[];
    // Only pin once we actually have query data for this project — until
    // then return an empty array (don't pin) so the real seed wins when
    // it lands.
    if (projectQuery.data) {
      initialMessagesRef.current = { projectId, messages: seed };
    }
    return seed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projectQuery.data]);

  const [activeSceneId, setActiveSceneId] = useState<string>(
    INITIAL_PROJECT.scenes[0]?.id ?? "",
  );
  // Panel is closed by default. Whatever the user last chose for this
  // specific project (open / closed) is persisted per-project in
  // localStorage so a project they were actively working on with the
  // panel open re-opens open next visit, while brand-new / lightly-used
  // projects stay in the clean chat-only default.
  const panelPrefKey = `studio:panelOpen:${projectId}`;
  const [userPanelPref, setUserPanelPrefState] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(panelPrefKey);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  });
  const setUserPanelPref = useCallback(
    (next: boolean) => {
      setUserPanelPrefState(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(panelPrefKey, String(next));
      }
    },
    [panelPrefKey],
  );
  // If we switch to a different project mid-session, re-read the pref
  // for that project instead of carrying over the previous one.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(panelPrefKey);
    setUserPanelPrefState(raw === "true" ? true : raw === "false" ? false : null);
  }, [panelPrefKey]);
  // Imperative handle populated by StructurePanel so ChatPanel can jump the
  // Project Details panel to the Timeline tab when the agent queues a render.
  const openTimelineRef = useRef<(() => void) | null>(null);
  const revealTimeline = useCallback(() => {
    setUserPanelPref(true);
    // Fire on next tick so the panel is mounted before we switch tabs.
    requestAnimationFrame(() => openTimelineRef.current?.());
  }, [setUserPanelPref]);
  // Generic tab opener — used by inline artifact preview cards in chat to
  // jump the Project Details panel to the tab matching the artifact type.
  const openTabRef = useRef<((v: string) => void) | null>(null);
  const revealTab = useCallback(
    (v: string) => {
      setUserPanelPref(true);
      requestAnimationFrame(() => openTabRef.current?.(v));
    },
    [setUserPanelPref],
  );
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 440;
    const saved = Number(window.localStorage.getItem("studio:panelWidth"));
    return Number.isFinite(saved) && saved >= 320 && saved <= 1200 ? saved : 440;
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("studio:panelWidth", String(panelWidth));
    }
  }, [panelWidth]);
  // During a drag we mutate refs + CSS variables directly so the whole
  // Studio tree (chat, structure panel, timeline) doesn't re-render on
  // every mousemove. State is only committed on mouseup.
  const chatShellRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const innerPanelRef = useRef<HTMLDivElement>(null);
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    let next = startW;
    let raf = 0;
    const apply = () => {
      raf = 0;
      if (chatShellRef.current) chatShellRef.current.style.paddingRight = `${next + 32}px`;
      if (asideRef.current) asideRef.current.style.width = `${next}px`;
      if (innerPanelRef.current) innerPanelRef.current.style.width = `${next}px`;
    };
    const onMove = (ev: MouseEvent) => {
      const maxW = Math.min(1200, window.innerWidth - 360);
      next = Math.max(320, Math.min(maxW, startW + (startX - ev.clientX)));
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (raf) cancelAnimationFrame(raf);
      // Commit final width once — triggers the single React re-render.
      setPanelWidth(next);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const { scenes, cast, music, meta, assets } = project;
  const skillId = projectQuery.data?.project.skill ?? null;
  const skill: Skill | null = (skillId && SKILL_BY_ID[skillId]) || null;
  const hasPanelContent =
    scenes.length > 0 || cast.length > 0 || !!music || assets.length > 0;
  // Details panel is hidden by default in agent v3 — the chat is the
  // workspace. User opens it explicitly via the top-bar chevron.
  const panelOpen = hasPanelContent && (userPanelPref ?? false);
  const totalDuration = scenes.reduce((a, s) => a + s.duration, 0);

  // Hosted realtime updates are disabled in local-project mode. Local edits
  // update state optimistically and persist through the IndexedDB repository.
  useEffect(() => {
    // const channel = supabase.channel(...).on(...).subscribe();
    // return () => void supabase.removeChannel(channel);
  }, [projectId]);

  const handlePatch = (patch: ProjectPatch) => {
    setProject((prev) => applyPatch(prev, patch));
    // Optimistically bump this project to the top of the panel right away.
    queryClient.setQueryData<{ projects: Array<{ id: string; updatedAt: string }> }>(
      ["projects-list"],
      (old) => {
        if (!old?.projects) return old;
        const now = new Date().toISOString();
        const idx = old.projects.findIndex((p) => p.id === projectId);
        if (idx === -1) return old;
        const next = [...old.projects];
        const [hit] = next.splice(idx, 1);
        next.unshift({ ...hit, updatedAt: now });
        return { ...old, projects: next };
      },
    );
    void updateState({ data: { id: projectId, patch } }).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["projects-list"] });
    });
  };

  // The Render / Production buttons live in the right-hand StructurePanel
  // but need to dispatch into the chat (which owns the AI SDK session).
  // We expose a ref the ChatPanel registers its sender into.
  const chatSendRef = useRef<((text: string) => void) | null>(null);
  const askAgentRef = useRef<((args: { prompt: string; referenceImageUrls: string[] }) => void) | null>(null);
  const appendAssistantRef = useRef<((text: string) => void) | null>(null);

  const setScenes = (next: Scene[]) =>
    setProject((prev) => ({ ...prev, scenes: next }));

  // Wait for the first post-mount fetch to complete before rendering the
  // chat. Otherwise, on navigate-back, react-query serves stale cached
  // messages first (missing the latest assistant "gen UI card" message that
  // was persisted after the cache was captured). initialMessagesRef pins to
  // that stale seed and the glowing active card never restores.
  if (!projectQuery.data) {
    return (
      <div className="grid h-screen w-full place-items-center bg-background text-sm text-muted-foreground">
        Loading project…
      </div>
    );
  }
  if (projectQuery.isError) {
    return (
      <div className="grid h-screen w-full place-items-center bg-background text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div>Couldn't load this project.</div>
          <Link to="/projects" className="text-primary underline">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  if (studioMode === "agent") {
    return (
      <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background text-foreground">
        <AgentShell
          projectId={projectId}
          projectTitle={meta.title}
          projectThumbUrl={null}
          assets={assets}
          project={project}
          initialMessages={initialMessages}
          studioMode={studioMode}
          studioModel={studioModel}
          onToolbarChange={onToolbarChange}
          onPatch={handlePatch}
          onOpenArtifact={revealTab}
          onExport={() => {
            setUserPanelPref(true);
            revealTab("renders");
          }}
          onOpenApps={() => {
            setUserPanelPref(true);
          }}
          onOpenProjectSwitcher={() => {
            void navigate({ to: "/projects" });
          }}
        />
      </div>
    );
  }


  return (
    <LegacyStudioShell
      projectId={projectId}
      meta={meta}
      scenes={scenes}
      assets={assets}
      skill={skill}
      skillId={skillId}
      initialMessages={initialMessages}
      studioMode={studioMode}
      studioModel={studioModel}
      totalDuration={totalDuration}
      panelOpen={panelOpen}
      panelWidth={panelWidth}
      hasPanelContent={hasPanelContent}
      setUserPanelPref={setUserPanelPref}
      onPatch={handlePatch}
      onToolbarChange={onToolbarChange}
      onAcceptSuggestion={(skillDef) => {
        setStudioMode(skillDef.kind);
        setStudioModel(skillDef.model);
        void persistPrefs({
          data: {
            id: projectId,
            studioMode: skillDef.kind,
            studioModel: skillDef.model,
            skill: skillDef.id,
          },
        }).then(() => {
          void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        });
      }}
      chatSendRef={chatSendRef}
      askAgentRef={askAgentRef}
      appendAssistantRef={appendAssistantRef}
      onRenderJobQueued={revealTimeline}
      onOpenArtifact={revealTab}
      chatShellRef={chatShellRef}
      asideRef={asideRef}
      innerPanelRef={innerPanelRef}
      startResize={startResize}
      structurePanel={
        <StructurePanel
          projectId={projectId}
          meta={meta}
          scenes={scenes}
          setScenes={setScenes}
          cast={cast}
          music={music}
          assets={assets}
          activeSceneId={activeSceneId}
          onSelect={setActiveSceneId}
          totalDuration={totalDuration}
          onChatCommand={(text) => chatSendRef.current?.(text)}
          onRenderComplete={(text) => appendAssistantRef.current?.(text)}
          onAskAgent={(args) => askAgentRef.current?.(args)}
          studioMode={studioMode}
          openTimelineRef={openTimelineRef}
          openTabRef={openTabRef}
        />
      }
    />
  );
}


// ---------- structure panel ----------

function StructurePanel({
  projectId,
  meta,
  scenes,
  setScenes,
  cast,
  music,
  assets,
  activeSceneId,
  onSelect,
  totalDuration,
  onChatCommand,
  onRenderComplete,
  onAskAgent,
  studioMode,
  openTimelineRef,
  openTabRef,
}: {
  projectId: string;
  meta: {
    title: string;
    format: string;
    aspectRatio: string;
    logline: string;
    targetDuration: string;
    fps: string;
    resolution: string;
  };
  scenes: Scene[];
  setScenes: (s: Scene[]) => void;
  cast: Character[];
  music: Music;
  assets: ProjectAsset[];
  activeSceneId: string;
  onSelect: (id: string) => void;
  totalDuration: number;
  onChatCommand?: (text: string) => void;
  onRenderComplete?: (assistantText: string) => void;
  onAskAgent?: (args: { prompt: string; referenceImageUrls: string[] }) => void;
  studioMode: StudioMode;
  openTimelineRef?: React.MutableRefObject<(() => void) | null>;
  openTabRef?: React.MutableRefObject<((v: string) => void) | null>;
}) {
  const [renderMsg, setRenderMsg] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const timelineActionsRef = useRef<TimelinePanelActions | null>(null);
  const [, forceRerender] = useState(0);
  const setTimelineActions = useMemo(
    () => (a: TimelinePanelActions | null) => {
      const prev = timelineActionsRef.current;
      timelineActionsRef.current = a;
      if (
        a &&
        (!prev ||
          prev.sharing !== a.sharing ||
          prev.canShare !== a.canShare ||
          prev.canExport !== a.canExport)
      ) {
        forceRerender((n) => n + 1);
      }
    },
    [],
  );
  // ---- Browser-style openable/closable tab bar ----
  // Each project remembers which views the user opened and which is
  // active. Fresh projects open a sensible default so the panel isn't
  // empty on first launch. Switching studio mode never wipes tabs — we
  // only filter the "+" menu to views available in that mode.
  type TabDef = {
    v: string;
    label: string;
    icon: typeof LayoutGrid;
    modes: StudioMode[];
  };
  const AGENT_MODES: StudioMode[] = ["agent"];
  const APP_MODES: StudioMode[] = ["image", "video", "audio", "speech"];
  const ALL_MODES: StudioMode[] = [...AGENT_MODES, ...APP_MODES, "director-v2"];
  // Note: `timeline` is intentionally excluded from the browser-style tab
  // registry — it lives as a top-level Workspace/Timeline segment above.
  const TAB_REGISTRY: TabDef[] = [
    { v: "outputs", label: "Outputs", icon: LayoutGrid, modes: AGENT_MODES },
    { v: "gallery", label: "Gallery", icon: LayoutGrid, modes: APP_MODES },
    { v: "cast", label: "Cast & Sets", icon: Users, modes: AGENT_MODES },
    { v: "music", label: "Audio", icon: Music2, modes: AGENT_MODES },
    { v: "shots", label: "Script", icon: Film, modes: AGENT_MODES },
    { v: "renders", label: "Exports", icon: History, modes: ALL_MODES },
  ];
  const tabLabel = (v: string) => TAB_REGISTRY.find((t) => t.v === v)?.label ?? v;
  const tabIcon = (v: string) => TAB_REGISTRY.find((t) => t.v === v)?.icon ?? LayoutGrid;
  const availableTabs = TAB_REGISTRY.filter((t) => t.modes.includes(studioMode));
  const defaultTab = studioMode === "agent" ? "outputs" : "gallery";
  const tabsPrefKey = `studio:tabs:${projectId}`;

  const [tabsState, setTabsState] = useState<{ open: string[]; active: string | null }>(
    () => {
      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(tabsPrefKey);
          if (raw) {
            const parsed = JSON.parse(raw) as { open?: string[]; active?: string | null };
            const open = (parsed.open ?? []).filter(
              (v) => !!TAB_REGISTRY.find((t) => t.v === v),
            );
            const active =
              parsed.active && open.includes(parsed.active) ? parsed.active : open[0] ?? null;
            if (open.length > 0) return { open, active };
          }
        } catch {
          /* fall through to default */
        }
      }
      return { open: [defaultTab], active: defaultTab };
    },
  );
  const { open: openTabs, active: activeTab } = tabsState;

  // Persist tab state per-project.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(tabsPrefKey, JSON.stringify(tabsState));
    } catch {
      /* quota; ignore */
    }
  }, [tabsPrefKey, tabsState]);

  const openTab = useCallback((v: string) => {
    setTabsState((prev) =>
      prev.open.includes(v)
        ? { open: prev.open, active: v }
        : { open: [...prev.open, v], active: v },
    );
  }, []);
  const closeTab = useCallback(
    (v: string) => {
      setTabsState((prev) => {
        const next = prev.open.filter((t) => t !== v);
        const nextActive =
          prev.active === v ? next[next.length - 1] ?? null : prev.active;
        return { open: next, active: nextActive };
      });
    },
    [],
  );
  const setActiveTab = useCallback((v: string) => {
    setTabsState((prev) =>
      prev.open.includes(v) ? { ...prev, active: v } : { open: [...prev.open, v], active: v },
    );
  }, []);

  // If a tab is open that the current mode doesn't support, hide it from
  // the strip (don't destroy it — user might switch modes back).
  const visibleOpenTabs = openTabs.filter((v) =>
    TAB_REGISTRY.find((t) => t.v === v && t.modes.includes(studioMode)),
  );
  const effectiveActive =
    activeTab && visibleOpenTabs.includes(activeTab)
      ? activeTab
      : visibleOpenTabs[0] ?? null;

  const runFinal = useServerFn(renderFinalVideo);
  const fetchRenders = useServerFn(listProjectRenders);
  const queryClient = useQueryClient();

  // Top-level view: Workspace (browser-style tabs) vs Timeline. Persisted
  // per project so it survives reloads. Timeline only makes sense in Agent
  // mode; in App modes we always show Workspace.
  const topViewKey = `studio:topView:${projectId}`;
  const [topView, setTopView] = useState<"workspace" | "timeline">(() => {
    if (typeof window === "undefined") return "workspace";
    const raw = window.localStorage.getItem(topViewKey);
    return raw === "timeline" ? "timeline" : "workspace";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(topViewKey, topView);
    }
  }, [topViewKey, topView]);
  const effectiveTopView: "workspace" | "timeline" =
    studioMode === "agent" ? topView : "workspace";

  // Expose an imperative "open Timeline" handle to the parent Studio so
  // ChatPanel can pop the timeline open the moment a render job is queued.
  useEffect(() => {
    if (!openTimelineRef) return;
    openTimelineRef.current = () => setTopView("timeline");
    return () => {
      if (openTimelineRef.current) openTimelineRef.current = null;
    };
  }, [openTimelineRef]);

  useEffect(() => {
    if (!openTabRef) return;
    openTabRef.current = (v: string) => {
      if (v === "timeline") {
        setTopView("timeline");
      } else {
        setTopView("workspace");
        openTab(v);
      }
    };
    return () => {
      if (openTabRef.current) openTabRef.current = null;
    };
  }, [openTabRef, openTab]);



  // While a render job is active: subscribe to its row and tick the
  // background pipeline every few seconds (belt-and-suspenders with the
  // pg_cron-driven server-side tick).
  useEffect(() => {
    if (!renderJobId) return;
    let cancelled = false;

    const ping = () => {
      void fetch("/api/public/render-tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).catch(() => {});
    };
    ping();
    const interval = window.setInterval(ping, 6_000);

    const client = getBrowserSupabase();
    const handleRenderRow = (row: { status?: string; error?: string | null }) => {
      if (cancelled) return;
      if (row.status === "done") {
        const jobIdForPost = renderJobId;
        setRenderMsg(
          row.error
            ? `Final video ready — ${row.error}.`
            : "Final video ready.",
        );
        setRendering(false);
        setRenderJobId(null);
        // Fetch the final asset URL and drop it into chat.
        void (async () => {
          try {
            const res = await fetchRenders({ data: { projectId } });
            const job = res.jobs.find((j) => j.id === jobIdForPost);
            if (job?.finalUrl) {
              const patch = {
                assetsAppend: [
                  {
                    id: `final-${job.id}`,
                    kind: "final",
                    mime: job.finalMime || "video/mp4",
                    name: `${meta.title || "Final video"}.mp4`,
                    url: job.finalUrl,
                    label: "Final video",
                  },
                ],
              };
              const text = `Your final video is ready.<div data-card data-card-title="Final video"><script type="application/json" data-project-patch>${JSON.stringify(
                patch,
              )}</script></div>`;
              onRenderComplete?.(text);
            }
            void queryClient.invalidateQueries({
              queryKey: ["project-renders", projectId],
            });
          } catch {
            /* swallow — RendersPanel will still update */
          }
        })();
      } else if (row.status === "failed") {
        setRenderMsg(`Render failed: ${row.error ?? "unknown error"}`);
        setRendering(false);
        setRenderJobId(null);
      }
    };

    const channel = client
      ?.channel(`render-job-${renderJobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "render_jobs",
          filter: `id=eq.${renderJobId}`,
        },
        (payload) => handleRenderRow(payload.new as { status?: string; error?: string | null }),
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (client && channel) void client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderJobId]);

  const onRenderFinal = async () => {
    if (scenes.length === 0) {
      setRenderMsg("Draft at least one shot first.");
      return;
    }
    setActiveTab("renders");
    setRendering(true);
    setRenderMsg(
      `Rendering final video — generating any missing shot images, animating shots, scoring music, recording voiceover, then stitching. This can take several minutes.`,
    );
    try {
      const res = await runFinal({ data: { projectId } });
      // Kickoff returns immediately; a background tick pipeline (pg_cron +
      // client poll below) advances the job. We watch render_jobs via
      // Realtime to flip the message to done/failed.
      setRenderJobId(res.renderJobId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRenderMsg(`Render failed: ${msg}`);
      setRendering(false);
    }
  };

  // Simple panel for one-off model-app projects (no story structure yet).
  // The moment scenes/cast/music/logline appear (Short Film, Product Ad, or
  // Agent upgrade), we flip to the full tabbed panel.
  const isSimplePanel =
    studioMode !== "agent" &&
    scenes.length === 0 &&
    cast.length === 0 &&
    !music &&
    !meta.logline;

  if (isSimplePanel) {
    return (
      <div className="relative flex h-full flex-col">
        <div className="px-8 pt-8">
          <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground">
            {meta.title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Every generation from this app collects here.
          </p>
        </div>
        <div className="mt-8 flex-1 overflow-y-auto px-8 pb-40">
          <GalleryGrid assets={assets} onChatCommand={onChatCommand} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <Tabs
        key={studioMode === "agent" ? "agent" : "app"}
        value={effectiveActive ?? undefined}
        onValueChange={setActiveTab}
        className="flex h-full flex-col"
      >
        {/* Top-level Workspace / Timeline segment — not closable. Timeline
            is a distinct top-level view; Workspace hosts the browser-style
            closable tabs (Outputs, Cast, Script, Audio, References, etc.). */}
        {studioMode === "agent" && (
          <div className="mt-4 flex items-center gap-1 border-b border-border/50 px-6">
            {(
              [
                { v: "workspace", label: "Workspace", icon: LayoutGrid },
                { v: "timeline", label: "Timeline", icon: ListVideo },
              ] as const
            ).map(({ v, label, icon: Icon }) => {
              const isActive = effectiveTopView === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTopView(v)}
                  aria-selected={isActive}
                  className={cn(
                    "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                    isActive
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}
        {/* Browser-style tab strip: shows only tabs the user has opened,
            each closable with ×. The "+" popover reveals any views not
            already open. Chat artifact cards also call openTab() to
            surface the matching view. */}
        {effectiveTopView === "workspace" && (
        <div className="mt-3 border-b border-border/50 px-4">
          <div className="flex items-end gap-1 overflow-x-auto pb-0">
            {visibleOpenTabs.map((v) => {
              const Icon = tabIcon(v);
              const isActive = v === effectiveActive;
              return (
                <div
                  key={v}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(v)}
                  className={cn(
                    "group relative -mb-px flex shrink-0 cursor-pointer items-center gap-2 rounded-t-md border border-transparent px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-border border-b-transparent bg-background text-foreground"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tabLabel(v)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(v);
                    }}
                    className="ml-1 rounded p-0.5 opacity-40 transition hover:bg-muted hover:opacity-100"
                    aria-label={`Close ${tabLabel(v)}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
            {availableTabs.some((t) => !visibleOpenTabs.includes(t.v)) && (
              <TabAddMenu
                available={availableTabs.filter((t) => !visibleOpenTabs.includes(t.v))}
                onSelect={openTab}
              />
            )}
            {visibleOpenTabs.length === 0 && (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                No views open. Click <Plus className="inline h-3 w-3" /> to add one.
              </div>
            )}
          </div>
        </div>
        )}


        {effectiveTopView === "workspace" && (
          <>
        {studioMode !== "agent" && (
          <TabsContent value="gallery" className="m-0 flex-1 overflow-y-auto px-8 pt-8 pb-40">
            <GalleryGrid assets={assets} onChatCommand={onChatCommand} />
          </TabsContent>
        )}

        {studioMode === "agent" && (
          <TabsContent value="outputs" className="m-0 flex-1 overflow-hidden">
            <AgentOutputsTab projectId={projectId} onAskAgent={onAskAgent} />
          </TabsContent>
        )}


        <TabsContent value="shots" className="m-0 flex-1 overflow-y-auto px-8 pt-8 pb-40">
          <div className="space-y-5">
            {scenes.length === 0 && (
              <EmptyHint icon={<Film className="h-8 w-8" />} text="Shots will appear as you build out your video with the director." />
            )}
            {scenes.map((s) => (
              <SceneRow
                key={s.id}
                scene={s}
                active={s.id === activeSceneId}
                aspectRatio={meta.aspectRatio}
                assets={assets}
                onClick={() => onSelect(s.id)}
                onChange={(next) =>
                  setScenes(scenes.map((x) => (x.id === next.id ? next : x)))
                }
              />

            ))}
            <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/30 py-5 text-base font-semibold text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground">
              <Plus className="h-5 w-5" /> Add shot
            </button>
          </div>
        </TabsContent>


        <TabsContent value="cast" className="m-0 flex-1 overflow-y-auto px-8 pt-8 pb-40">
          <div className="space-y-5">
            {cast.length === 0 && (
              <EmptyHint icon={<Users className="h-8 w-8" />} text="No cast yet — ask the director to suggest characters." />
            )}
            {cast.map((c) => {
              const refUrl =
                (c.ref && assets.find((a) => a.id === c.ref)?.url) ||
                (c.ref && /^https?:|^blob:|^\//.test(c.ref) ? c.ref : "");
              return (
              <div
                key={c.id}
                className="flex gap-5 rounded-2xl border border-border/60 bg-card/40 p-5"
              >
                {refUrl ? (
                  <img
                    src={refUrl}
                    alt={c.name}
                    className="h-20 w-20 shrink-0 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground/50">
                    <Users className="h-7 w-7" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-lg font-bold tracking-tight">{c.name}</div>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      {c.role}
                    </span>
                  </div>
                  <div className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {c.notes}
                  </div>
                </div>
              </div>
              );
            })}
            <button className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/30 py-5 text-base font-semibold text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground">
              <ImagePlus className="h-5 w-5" /> Add character / reference
            </button>
          </div>
        </TabsContent>

        <TabsContent value="music" className="m-0 flex-1 overflow-y-auto px-8 pt-8 pb-40">
          {!music ? (
            <EmptyHint icon={<Music2 className="h-8 w-8" />} text="No audio yet — describe the music, voiceover, or sound design you want." />
          ) : (
          <div className="rounded-3xl border border-border/60 bg-card/40 p-6">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary">
                <Music2 className="h-7 w-7 text-primary-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold tracking-tight">{music.title || "Untitled track"}</div>
                <div className="truncate text-sm text-muted-foreground">
                  {music.artist || "—"}
                </div>
              </div>
              <Button variant="ghost" size="icon">
                <Play className="h-5 w-5" />
              </Button>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-muted/60 py-4">
                <div className="text-xl font-bold tracking-tight text-foreground">{music.bpm || "—"}</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">BPM</div>
              </div>
              <div className="rounded-2xl bg-muted/60 py-4">
                <div className="text-xl font-bold tracking-tight text-foreground">{music.key || "—"}</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Key</div>
              </div>
              <div className="rounded-2xl bg-muted/60 py-4">
                <div className="text-xl font-bold tracking-tight text-foreground">{music.duration ? formatDuration(music.duration) : "—"}</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Length</div>
              </div>
            </div>
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Beat map</span>
                <span>cuts auto-align</span>
              </div>
              <div className="flex h-14 items-end gap-[2px]">
                {Array.from({ length: 60 }).map((_, i) => {
                  const h = 20 + Math.abs(Math.sin(i * 0.7)) * 70 + (i % 4 === 0 ? 10 : 0);
                  return (
                    <div
                      key={i}
                      style={{ height: `${h}%` }}
                      className={`w-full rounded-sm ${
                        i % 4 === 0 ? "bg-primary" : "bg-muted-foreground/40"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          )}
        </TabsContent>


        <TabsContent value="renders" className="m-0 flex-1 overflow-y-auto px-8 pt-8 pb-40">
          <RendersPanel
            projectId={projectId}
            activeJobId={renderJobId}
            onRetry={onRenderFinal}
            isRendering={rendering}
          />
        </TabsContent>
          </>
        )}

        {effectiveTopView === "timeline" && (
          <div className="m-0 flex-1 overflow-hidden">
            <ProjectTimelinePanel
              projectId={projectId}
              onClose={() => {}}
              hideClose
              actionsRef={setTimelineActions}
            />
          </div>
        )}
      </Tabs>


    </div>
  );
}

function TabAddMenu({
  available,
  onSelect,
}: {
  available: Array<{ v: string; label: string; icon: typeof Plus }>;
  onSelect: (v: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ml-1 rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Open a view"
          title="Open a view"
        >
          <Plus className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10rem]">
        {available.map(({ v, label, icon: Icon }) => (
          <DropdownMenuItem key={v} onSelect={() => onSelect(v)} className="gap-2">
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyHint({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed border-border/70 bg-card/20 px-6 py-20 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-3xl bg-muted/60 text-muted-foreground/60">
        {icon}
      </div>
      <div className="max-w-[260px] text-base font-medium leading-relaxed text-muted-foreground">{text}</div>
    </div>
  );
}

// ---------- gallery (app-mode: all generations) ----------

const GENERATION_KINDS = new Set([
  "image",
  "reference",
  "video",
  "audio",
  "music",
  "voiceover",
  "keyframe",
  "final",
]);

function GalleryGrid({
  assets,
  onChatCommand,
}: {
  assets: ProjectAsset[];
  onChatCommand?: (text: string) => void;
}) {
  const items = assets.filter((a) => GENERATION_KINDS.has(a.kind));
  if (items.length === 0) {
    return (
      <EmptyHint
        icon={<LayoutGrid className="h-8 w-8" />}
        text="No generations yet — describe what you want in the chat to create your first one."
      />
    );
  }
  const download = async (a: ProjectAsset) => {
    try {
      const res = await fetch(a.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = a.name || a.label || "download";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.open(a.url, "_blank", "noreferrer");
    }
  };
  return (
    <div className="grid grid-cols-2 gap-3">
      {items
        .slice()
        .reverse()
        .map((a) => (
          <div
            key={a.id}
            className="group relative block overflow-hidden rounded-2xl border border-border/60 bg-muted/40"
          >
            <a href={a.url} target="_blank" rel="noreferrer" className="block">
              {a.mime.startsWith("image/") && (
                <img src={a.url} alt={a.label || a.name} className="aspect-square w-full object-cover" />
              )}
              {a.mime.startsWith("video/") && (
                <video src={a.url} className="aspect-square w-full object-cover" muted playsInline />
              )}
              {a.mime.startsWith("audio/") && (
                <div className="flex aspect-square w-full items-center justify-center bg-muted/60 p-3">
                  <audio src={a.url} controls className="w-full" />
                </div>
              )}
            </a>
            <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-background/90 to-transparent px-3 py-2 text-xs font-medium text-foreground opacity-0 transition group-hover:opacity-100">
              {a.label || a.name}
            </div>
            <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
              <button
                type="button"
                title="Download"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void download(a);
                }}
                className="grid h-8 w-8 place-items-center rounded-full bg-background/90 text-foreground shadow hover:bg-background"
              >
                <Download className="h-4 w-4" />
              </button>
              {onChatCommand && (
                <>
                  <button
                    type="button"
                    title="Edit"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onChatCommand(
                        `Edit this ${a.kind} (asset id: ${a.id}, url: ${a.url}, label: "${a.label || a.name}"). ` +
                        `Ask me what to change in a small generative card (free-text "What should change?" plus optional style pills), ` +
                        `then call the appropriate edit tool using this asset as the reference and produce a new version.`,
                      );
                    }}
                    className="grid h-8 w-8 place-items-center rounded-full bg-background/90 text-foreground shadow hover:bg-background"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Regenerate"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onChatCommand(
                        `Regenerate a new variation of this ${a.kind} (asset id: ${a.id}, url: ${a.url}, label: "${a.label || a.name}"). ` +
                        `Reuse the original prompt and settings if you have them; otherwise ask me briefly in a generative card for any missing inputs, then run the same model again.`,
                      );
                    }}
                    className="grid h-8 w-8 place-items-center rounded-full bg-background/90 text-foreground shadow hover:bg-background"
                  >
                    <RotateCw className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

// ---------- renders panel ----------

function RendersPanel({
  projectId,
  activeJobId,
  onRetry,
  isRendering,
}: {
  projectId: string;
  activeJobId: string | null;
  onRetry: () => void;
  isRendering: boolean;
}) {
  const fetchRenders = useServerFn(listProjectRenders);
  const q = useQuery({
    queryKey: ["project-renders", projectId],
    queryFn: () => fetchRenders({ data: { projectId } }),
    // Refetch while a job is active so progress updates.
    refetchInterval: activeJobId ? 4_000 : false,
  });
  const queryClient = useQueryClient();

  // Also refetch when the active job id flips (started / cleared).
  useEffect(() => {
    void queryClient.invalidateQueries({
      queryKey: ["project-renders", projectId],
    });
  }, [activeJobId, projectId, queryClient]);

  const jobs = q.data?.jobs ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70">
            Render queue
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {jobs.length === 0
              ? "No renders yet."
              : `${jobs.length} render${jobs.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <button
          onClick={onRetry}
          disabled={isRendering}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
        >
          <RotateCw className="h-4 w-4" /> New render
        </button>
      </div>

      {jobs.length === 0 && (
        <EmptyHint
          icon={<History className="h-8 w-8" />}
          text="Final video renders will appear here. Each retry kicks off a fresh job."
        />
      )}

      {jobs.map((job) => {
        const isVideo = !!job.finalMime?.startsWith("video/");
        const active =
          job.status === "queued" || job.status === "running";
        const failed = job.status === "failed";
        const done = job.status === "done";
        return (
          <div
            key={job.id}
            className="rounded-2xl border border-border/60 bg-card/40 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      done
                        ? "bg-emerald-500/15 text-emerald-400"
                        : failed
                          ? "bg-destructive/15 text-destructive"
                          : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {active && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {job.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(job.createdAt).toLocaleString()}
                  </span>
                </div>
                {job.stepsTotal > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {job.stepsDone}/{job.stepsTotal} steps complete
                  </div>
                )}
                {failed && job.error && (
                  <div className="mt-2 line-clamp-3 text-xs text-destructive/90">
                    {job.error}
                  </div>
                )}
              </div>
              <button
                onClick={onRetry}
                disabled={isRendering}
                title="Kick off a new render"
                className="inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-60"
              >
                <RotateCw className="h-3.5 w-3.5" /> Retry
              </button>
            </div>
            {done && job.finalUrl && (
              <div className="mt-3 overflow-hidden rounded-xl bg-background">
                {isVideo ? (
                  <video
                    src={job.finalUrl}
                    controls
                    playsInline
                    className="block max-h-[360px] w-full"
                  />
                ) : (
                  <a
                    href={job.finalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-3 text-xs underline"
                  >
                    Open output
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AssetsStrip({ assets }: { assets: ProjectAsset[] }) {
  return (
    <div className="mt-5">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
        References
      </div>
      <div className="flex flex-wrap gap-2">
        {assets.map((a) => (
          <div
            key={a.id}
            className="group relative overflow-hidden rounded-md border border-border/60 bg-muted/40"
            title={`${a.kind} · ${a.name}`}
          >
            {a.mime.startsWith("image/") ? (
              <img src={a.url} alt={a.name} className="h-16 w-16 object-cover" />
            ) : (
              <div className="grid h-16 w-16 place-items-center text-lg text-muted-foreground">
                {a.mime.startsWith("audio/") ? "♪" : a.mime.startsWith("video/") ? "▶" : "•"}
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
              <span className="rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-semibold capitalize text-white backdrop-blur-sm">
                {a.kind}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TechSpecs({
  meta,
  totalDuration,
  sceneCount,
}: {
  meta: {
    aspectRatio: string;
    targetDuration: string;
    fps: string;
    resolution: string;
  };
  totalDuration: number;
  sceneCount: number;
}) {
  const clean = (v: string) => (v && v !== "—" ? v : "");
  const length =
    clean(meta.targetDuration) ||
    (totalDuration > 0 ? formatDuration(totalDuration) : "");
  const specs: { label: string; value: string }[] = [
    { label: "Aspect", value: clean(meta.aspectRatio) || "—" },
    { label: "Length", value: length || "—" },
    { label: "Shots", value: sceneCount > 0 ? String(sceneCount) : "—" },
    { label: "FPS", value: clean(meta.fps) || "—" },
    { label: "Resolution", value: clean(meta.resolution) || "—" },
  ];
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {specs.map((s) => (
        <div
          key={s.label}
          className="flex items-baseline gap-1.5 rounded-full bg-muted/60 px-3 py-1.5"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
            {s.label}
          </span>
          <span className="text-xs font-semibold tracking-tight text-foreground">
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function SceneRow({
  scene,
  active,
  aspectRatio,
  assets,
  onClick,
  onChange,
}: {
  scene: Scene;
  active: boolean;
  aspectRatio?: string;
  assets: ProjectAsset[];
  onClick: () => void;
  onChange: (s: Scene) => void;
}) {

  const [editing, setEditing] = useState(false);
  // Parse "W:H" → aspect-ratio CSS value + orientation. Default to 16:9.
  const { ar, isHorizontal } = (() => {
    const m = (aspectRatio || "").match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (!m) return { ar: "16 / 9", isHorizontal: true };
    const w = Number(m[1]);
    const h = Number(m[2]);
    return { ar: `${w} / ${h}`, isHorizontal: w >= h };
  })();

  const header = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-semibold text-muted-foreground">#{scene.n}</span>
        <span className="truncate text-base font-bold tracking-tight">{scene.title}</span>
      </div>
      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        {scene.duration}s
      </span>
    </div>
  );

  const description = editing ? (
    <textarea
      autoFocus
      defaultValue={scene.prompt}
      onBlur={(e) => {
        onChange({ ...scene, prompt: e.target.value });
        setEditing(false);
      }}
      rows={5}
      className="mt-3 w-full resize-none rounded-xl border border-border bg-background/60 p-3 text-sm text-foreground focus:border-primary/60 focus:outline-none"
    />
  ) : (
    <p
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="mt-2 text-sm leading-relaxed text-muted-foreground hover:text-foreground"
    >
      {scene.prompt}
    </p>
  );

  const voiceover = (
    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
        Voiceover (optional)
      </div>
      <textarea
        defaultValue={scene.voPrompt ?? ""}
        placeholder="What the narrator says during this shot…"
        onBlur={(e) => {
          const next = e.target.value;
          if (next !== (scene.voPrompt ?? "")) {
            onChange({ ...scene, voPrompt: next });
          }
        }}
        rows={2}
        className="w-full resize-none rounded-xl border border-border bg-background/60 p-3 text-sm text-foreground focus:border-primary/60 focus:outline-none"
      />
    </div>
  );

  const thumb = (
    <div
      className={`overflow-hidden rounded-xl bg-muted ${isHorizontal ? "w-full" : "w-72 shrink-0"}`}
      style={{ aspectRatio: ar }}
    >
      {scene.thumb ? (
        <img src={resolveThumb(scene.thumb, assets)} alt="" className="h-full w-full object-cover" />

      ) : (
        <div className="grid h-full w-full place-items-center text-muted-foreground/50">
          <Film className="h-7 w-7" />
        </div>
      )}
    </div>
  );

  return (
    <div
      onClick={onClick}
      className={`group cursor-pointer rounded-2xl border bg-card/40 p-5 transition ${
        active ? "border-primary/60" : "border-border/60 hover:border-foreground/30"
      }`}
    >
      {isHorizontal ? (
        <div className="flex flex-col gap-4">
          {thumb}
          <div className="min-w-0">
            {header}
            {description}
            {voiceover}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          {thumb}
          <div className="min-w-0 flex-1">
            {header}
            {description}
            {voiceover}
          </div>
        </div>
      )}
    </div>
  );
}
function AgentOutputsTab({
  projectId,
  onAskAgent,
}: {
  projectId: string;
  onAskAgent?: (args: { prompt: string; referenceImageUrls: string[] }) => void;
}) {
  const runs = useRunsStore((s) => s.runs);
  const outputMeta = useRunsStore((s) => s.outputMeta);
  const filtered = useMemo(
    () => Object.values(runs).filter((r) => r.projectId === projectId),
    [runs, projectId],
  );
  return (
    <ProjectOutputsPanel
      projectId={projectId}
      activeRuns={filtered}
      outputMeta={outputMeta}
      onRegenerate={() => {}}
      onUseInApp={() => {}}
      onNewProject={() => {}}
      onDismissRun={(id) => {
        import("@/components/v2/apps/runs-store").then((m) => m.runsStore.dismissRun(id));
      }}
      onAskAgent={onAskAgent}
      hideProjectSelector
    />
  );
}

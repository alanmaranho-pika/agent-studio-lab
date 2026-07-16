// Legacy (pre-agent-mode) studio shell — quarantined out of
// src/routes/_authenticated/studio.$projectId.tsx. This is the old
// ChatPanel-based center stage (StudioTopBar + ChatPanel + floating
// project panel) rendered only when studioMode !== "agent". The agent-mode
// center stage (AgentShell) is the canonical UI; everything in this file
// is slated for deletion once the non-agent modes are retired.
//
// The code below was extracted verbatim from the route file. LegacyStudioShell
// wraps the old top-level JSX branch and receives everything it referenced
// from the route component as props; the right-hand StructurePanel (which is
// shared with the agent branch and therefore stayed in the route) is passed
// in pre-rendered via the `structurePanel` slot.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import { listProjects, createProject, useLocalProjectFn } from "@/lib/local-projects";
import { directGenerateStart, directGeneratePoll } from "@/lib/generate.functions";
import { getSkillCover } from "@/lib/skills/skills.functions";
import { StudioToolbar } from "@/components/studio/studio-toolbar";
import { suggestApp, type AppSuggestion } from "@/lib/app-suggest.functions";
import {
  DEFAULT_MODEL_BY_KIND,
  SKILL_BY_ID,
  SKILL_BY_MODEL,
  type Skill,
  type StudioMode,
} from "@/lib/skills";
import {
  Play,
  ListVideo,
  Film,
  LayoutGrid,
  Users,
  Music2,
  Clock,
  Plus,
  ImagePlus,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Loader2,
  ArrowRight,
  Pencil,
  Sparkles,
  CheckCircle2,
  Paperclip,
  X,
} from "lucide-react";
import { AssetPickerDialog } from "@/components/studio/asset-picker-dialog";
import { fileToProjectAsset } from "@/lib/v2/upload-asset";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { BrandMark } from "@/components/pika-mark";
import { Button } from "@/components/ui/button";
import {
  GenerativeCard,
  DecisionPill,
  UserBubble,
  AssistantMessage,
  extractCardTitle,
  extractCardProse,
  extractProjectPatch,
  type CardAnswer,
} from "@/components/studio/generative-card";
import type {
  ProjectAsset,
  ProjectPatch,
  ProjectState,
  Scene,
} from "@/lib/project-state";
import { getRecipeForSkill } from "@/lib/app-recipes";
import { AppWizard } from "@/components/studio/app-wizard";
import { ModelSettingsPopover, summarizeParams } from "@/components/studio/model-settings-popover";
import { defaultValuesFor } from "@/lib/model-params";
import { useProjectJobs } from "@/hooks/use-project-jobs";

// ---------- legacy shell (old non-agent studio layout) ----------

export type LegacyStudioShellProps = {
  projectId: string;
  meta: ProjectState["meta"];
  scenes: Scene[];
  assets: ProjectAsset[];
  skill: Skill | null;
  skillId: string | null;
  initialMessages: UIMessage[];
  studioMode: StudioMode;
  studioModel: string | null;
  totalDuration: number;
  panelOpen: boolean;
  panelWidth: number;
  hasPanelContent: boolean;
  setUserPanelPref: (next: boolean) => void;
  onPatch: (patch: ProjectPatch) => void;
  onToolbarChange: (next: { mode: StudioMode; model: string | null }) => void;
  onAcceptSuggestion: (skillDef: Skill) => void;
  chatSendRef: React.MutableRefObject<((text: string) => void) | null>;
  askAgentRef: React.MutableRefObject<
    ((args: { prompt: string; referenceImageUrls: string[] }) => void) | null
  >;
  appendAssistantRef: React.MutableRefObject<((text: string) => void) | null>;
  onRenderJobQueued: () => void;
  onOpenArtifact: (v: string) => void;
  chatShellRef: React.RefObject<HTMLDivElement | null>;
  asideRef: React.RefObject<HTMLElement | null>;
  innerPanelRef: React.RefObject<HTMLDivElement | null>;
  startResize: (e: React.MouseEvent) => void;
  /** Pre-rendered <StructurePanel> — shared with the agent branch, so it lives in the route. */
  structurePanel: ReactNode;
};

export function LegacyStudioShell({
  projectId,
  meta,
  scenes,
  assets,
  skill,
  skillId,
  initialMessages,
  studioMode,
  studioModel,
  totalDuration,
  panelOpen,
  panelWidth,
  hasPanelContent,
  setUserPanelPref,
  onPatch,
  onToolbarChange,
  onAcceptSuggestion,
  chatSendRef,
  askAgentRef,
  appendAssistantRef,
  onRenderJobQueued,
  onOpenArtifact,
  chatShellRef,
  asideRef,
  innerPanelRef,
  startResize,
  structurePanel,
}: LegacyStudioShellProps) {
  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background p-10 text-foreground">
      {/* Centered chat fills the screen; gallery & project panel float over it */}
      <div
        ref={chatShellRef}
        className="absolute inset-0 flex flex-col"
        style={{ paddingRight: panelOpen ? panelWidth + 32 : 0 }}
      >
        <StudioTopBar
          meta={meta}
          duration={totalDuration}
          sceneCount={scenes.length}
          panelOpen={panelOpen}
          canTogglePanel={hasPanelContent}
          onTogglePanel={() => setUserPanelPref(!panelOpen)}
          skill={skill}
        />
        <div className="min-h-0 flex-1">
          <ChatPanel
            projectId={projectId}
            initialMessages={initialMessages}
            onPatch={onPatch}
            assets={assets}
            studioMode={studioMode}
            studioModel={studioModel}
            onToolbarChange={onToolbarChange}
            onAcceptSuggestion={onAcceptSuggestion}
            skill={skill}
            kickoffSkillSlug={
              initialMessages.length === 0 && skillId ? skillId : null
            }
            kickoffSkillName={skill?.label ?? null}
            registerSender={(fn) => {
              chatSendRef.current = fn;
            }}
            registerAskAgent={(fn) => {
              askAgentRef.current = fn;
            }}
            registerAppendAssistant={(fn) => {
              appendAssistantRef.current = fn;
            }}
            onRenderJobQueued={onRenderJobQueued}
            onOpenArtifact={onOpenArtifact}

          />
        </div>
      </div>





      <aside
        ref={asideRef}
        style={{ width: panelOpen ? panelWidth : 0 }}
        className={`pointer-events-auto absolute right-4 top-4 bottom-4 z-30 overflow-hidden rounded-3xl bg-card shadow-elegant ${
          panelOpen ? "opacity-100" : "opacity-0"
        }`}
      >
        {panelOpen && (
          <div
            onMouseDown={startResize}
            className="group absolute left-0 top-0 z-40 flex h-full w-2 cursor-col-resize items-center justify-center hover:bg-primary/10"
            aria-label="Resize panel"
            role="separator"
          >
            <div className="h-12 w-1 rounded-full bg-border transition group-hover:bg-primary" />
          </div>
        )}
        <div ref={innerPanelRef} className="h-full" style={{ width: panelWidth }}>
          {structurePanel}
        </div>
      </aside>

    </div>
  );
}

// ---------- gallery rail (left, projects) ----------

function FloatingGallery({
  currentProjectId,
  currentTitle,
}: {
  currentProjectId: string;
  currentTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const fetchList = useLocalProjectFn(listProjects);
  const createNew = useLocalProjectFn(createProject);
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["projects-list"],
    queryFn: () => fetchList(),
    // Always enabled so the collapsed circle strip stays in sync and the
    // active project bubbles to the top whenever its state is patched.
    refetchOnWindowFocus: true,
  });
  const onNew = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { id } = await createNew({ data: {} });
    void queryClient.invalidateQueries({ queryKey: ["projects-list"] });
    void navigate({ to: "/studio/$projectId", params: { projectId: id } });
  };
  type ProjectRow = {
    id: string;
    title: string;
    status: string;
    updatedAt: string;
    createdAt: string;
    format: string;
    aspectRatio: string;
    sceneCount: number;
    thumbnailUrl: string | null;
  };
  const projects: ProjectRow[] = (listQuery.data?.projects ?? []) as ProjectRow[];
  const collapsedPreview = projects.slice(0, 6);
  return (
    <aside
      onClick={() => {
        if (!open) setOpen(true);
      }}
      className={`pointer-events-auto absolute left-4 top-4 z-30 flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl bg-card shadow-elegant backdrop-blur-xl transition-all duration-300 ${
        open ? "w-72 cursor-default" : "w-16 cursor-pointer hover:shadow-glow"
      }`}
    >
      <div className="flex h-14 shrink-0 items-center justify-between px-3">
        <div className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground">
          <FolderOpen className="h-4 w-4" />
        </div>
        {open && (
          <span className="font-display text-base tracking-tight">Projects</span>
        )}
        {open && (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => void onNew(e)}
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="New project"
              title="New project"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Collapse projects"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible px-3 py-2 pb-4">
        {open ? (
          <div className="flex flex-col gap-2">
            {projects.length === 0 && listQuery.isLoading && (
              <div className="px-2 py-4 text-xs text-muted-foreground">Loading…</div>
            )}
            {projects.map((p) => {
              const isCurrent = p.id === currentProjectId;
              const label = isCurrent ? currentTitle : p.title;
              return (
                <button
                  key={p.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isCurrent)
                      void navigate({
                        to: "/studio/$projectId",
                        params: { projectId: p.id },
                      });
                  }}
                  className={`flex items-center gap-3 rounded-2xl p-2 text-left transition ${
                    isCurrent ? "bg-muted/70" : "opacity-60 hover:opacity-100 hover:bg-muted/40"
                  }`}
                >
                  <ProjectAvatar
                    title={p.title}
                    thumbnailUrl={p.thumbnailUrl}
                    isCurrent={isCurrent}
                    size={56}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{label}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {isCurrent ? "Current project" : `${p.sceneCount} shot${p.sceneCount === 1 ? "" : "s"}`}
                    </div>
                  </div>
                </button>
              );
            })}
            <button
              onClick={onNew}
              className="mt-1 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> New project
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {collapsedPreview.length === 0 && (
              <ProjectAvatar
                title={currentTitle}
                thumbnailUrl={null}
                isCurrent
                size={48}
              />
            )}
            {collapsedPreview.map((p) => {
              const isCurrent = p.id === currentProjectId;
              return (
                <ProjectAvatar
                  key={p.id}
                  title={isCurrent ? currentTitle : p.title}
                  thumbnailUrl={p.thumbnailUrl}
                  isCurrent={isCurrent}
                  size={48}
                />
              );
            })}
            <div
              onClick={(e) => {
                e.stopPropagation();
                void onNew(e);
              }}
              className="mt-1 grid h-12 w-12 cursor-pointer place-items-center rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              title="New project"
            >
              <Plus className="h-4 w-4" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function ProjectAvatar({
  title,
  thumbnailUrl,
  isCurrent,
  size,
}: {
  title: string;
  thumbnailUrl: string | null;
  isCurrent: boolean;
  size: number;
}) {
  const initial = (title || "?").trim().charAt(0).toUpperCase() || "?";
  const ring = isCurrent
    ? "ring-2 ring-primary opacity-100"
    : "ring-1 ring-border opacity-50 grayscale";
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative shrink-0 overflow-hidden rounded-full bg-primary text-primary-foreground transition ${ring}`}
      title={title}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={title}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="grid h-full w-full place-items-center font-display text-base font-semibold">
          {initial}
        </div>
      )}
    </div>
  );
}

// ---------- top bar ----------

function StudioTopBar({
  meta,
  duration,
  sceneCount,
  panelOpen,
  canTogglePanel,
  onTogglePanel,
  skill,
}: {
  meta: { title: string; format: string; aspectRatio: string };
  duration: number;
  sceneCount: number;
  panelOpen: boolean;
  canTogglePanel: boolean;
  onTogglePanel: () => void;
  skill: Skill | null;
}) {
  return (
    <header className="pointer-events-none relative z-20 flex shrink-0 justify-center px-4 py-3">
      <div className="pointer-events-auto flex flex-col items-center gap-6 pt-6">
        <div className="flex min-w-0 max-w-full items-center gap-3.5 rounded-3xl bg-foreground px-5 py-2 shadow-elegant sm:rounded-full sm:px-6 sm:py-2.5">
          <div className="flex min-w-0 flex-col leading-tight sm:flex-row sm:items-baseline sm:gap-2.5">
            <span className="truncate text-sm font-semibold tracking-tight text-background sm:text-base">
              {meta.title}
            </span>
            {!skill && (
              <span className="truncate text-[11px] text-background/60 sm:text-xs">
                {meta.format} · {meta.aspectRatio} · {sceneCount} shots · {formatDuration(duration)}
              </span>
            )}
          </div>
        </div>
      </div>
      {canTogglePanel && (
        <button
          onClick={onTogglePanel}
          className="pointer-events-auto absolute right-6 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={panelOpen ? "Collapse project panel" : "Open project panel"}
        >
          {panelOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      )}
    </header>
  );
}

// ---------- how it works (empty state for App-launched projects) ----------
// Step copy + typed wizard schema both live in src/lib/app-recipes.ts so the
// diagram and the AppWizard composer can never describe different sequences.

function HowItWorks({ skill }: { skill: Skill }) {
  const recipe = getRecipeForSkill(skill);
  const steps = recipe.steps;
  const stepIcons: Record<string, typeof Pencil> = {
    upload: ImagePlus,
    choice: LayoutGrid,
    prompt: Pencil,
    generate: CheckCircle2,
  };

  return (
    <div className="flex flex-col items-center gap-10 pt-8 pb-2 text-center">
      <div className="flex flex-col items-center gap-5">
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-display text-5xl font-semibold tracking-tight">
            How it works
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            {skill.description}
          </p>
        </div>
      </div>

      <div className="flex w-full flex-col items-stretch gap-4 md:flex-row md:items-stretch md:justify-center md:gap-3">
        {steps.map((s, i) => {
          const StepIcon = stepIcons[s.kind] ?? Sparkles;
          return (
            <div key={i} className="flex flex-1 items-stretch">
              <div className="flex flex-1 flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-left shadow-elegant">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-foreground">
                    <StepIcon className="h-4 w-4" />
                  </div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Step {i + 1}
                  </div>
                </div>
                <div className="text-base font-semibold tracking-tight">
                  {s.title}
                </div>
                <div className="text-sm leading-relaxed text-muted-foreground">
                  {s.desc}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="hidden items-center px-1 text-muted-foreground md:flex">
                  <ArrowRight className="h-5 w-5" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---------- chat panel ----------

const STARTERS = [
  "Music video",
  "30-second product ad",
  "Short drama, 2 minutes",
  "TikTok hook — fashion",
];

type ArtifactKind = "shots" | "cast" | "music" | "renders";

function detectArtifacts(html: string): ArtifactKind[] {
  const kinds = new Set<ArtifactKind>();
  const patch = extractProjectPatch(html) as
    | {
        meta?: { logline?: string };
        scenesAppend?: unknown[];
        castAppend?: unknown[];
        music?: unknown;
        assetsAppend?: Array<{ kind?: string; mime?: string; label?: string }>;
      }
    | null;
  if (!patch) return [];
  if (patch.meta?.logline || (patch.scenesAppend && patch.scenesAppend.length > 0)) {
    kinds.add("shots");
  }
  if (patch.castAppend && patch.castAppend.length > 0) kinds.add("cast");
  if (patch.music) kinds.add("music");
  if (Array.isArray(patch.assetsAppend)) {
    for (const a of patch.assetsAppend) {
      const mime = a.mime ?? "";
      if (a.kind === "music" || a.kind === "voiceover" || a.kind === "audio" || mime.startsWith("audio/")) {
        kinds.add("music");
      }
      if (a.kind === "final" || (a.label && /final/i.test(a.label))) {
        kinds.add("renders");
      }
    }
  }
  return Array.from(kinds);
}

const ARTIFACT_META: Record<
  ArtifactKind,
  { label: string; icon: typeof Film; hint: string }
> = {
  shots: { label: "Script & Logline", icon: Film, hint: "Open script" },
  cast: { label: "Cast & References", icon: Users, hint: "Open cast" },
  music: { label: "Music & Audio", icon: Music2, hint: "Open audio" },
  renders: { label: "Final Render", icon: ListVideo, hint: "Open exports" },
};

function ArtifactCards({
  html,
  onOpen,
}: {
  html: string;
  onOpen?: (v: string) => void;
}) {
  const kinds = useMemo(() => detectArtifacts(html), [html]);
  if (kinds.length === 0 || !onOpen) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {kinds.map((k) => {
        const { label, icon: Icon, hint } = ARTIFACT_META[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onOpen(k)}
            className="group inline-flex items-center gap-2.5 rounded-2xl border border-hairline bg-card/60 px-4 py-2.5 text-left text-sm transition hover:border-foreground/30 hover:bg-card"
            aria-label={hint}
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-muted text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-medium">{label}</span>
              <span className="text-[11px] text-muted-foreground">{hint} →</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}



function ChatPanel({
  projectId,
  initialMessages,
  onPatch,
  assets,
  studioMode,
  studioModel,
  onToolbarChange,
  onAcceptSuggestion,
  skill,
  kickoffSkillSlug,
  kickoffSkillName,
  registerSender,
  registerAskAgent,
  registerAppendAssistant,
  onRenderJobQueued,
  onOpenArtifact,
}: {
  projectId: string;
  initialMessages: UIMessage[];
  onPatch: (patch: ProjectPatch) => void;
  assets: ProjectAsset[];
  studioMode: StudioMode;
  studioModel: string | null;
  onToolbarChange: (next: { mode: StudioMode; model: string | null }) => void;
  onAcceptSuggestion: (skillDef: Skill) => void;
  skill: Skill | null;
  kickoffSkillSlug?: string | null;
  kickoffSkillName?: string | null;
  registerSender?: (fn: (text: string) => void) => void;
  registerAskAgent?: (
    fn: (args: { prompt: string; referenceImageUrls: string[] }) => void,
  ) => void;
  registerAppendAssistant?: (fn: (text: string) => void) => void;
  onRenderJobQueued?: () => void;
  onOpenArtifact?: (v: string) => void;
}) {
  const [input, setInput] = useState("");

  const queryClient = useQueryClient();
  const [attachments, setAttachments] = useState<ProjectAsset[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  // Local skill override so the wizard appears instantly when a suggestion
  // is accepted — before the project refetch reflects the new skill.
  const [acceptedSkill, setAcceptedSkill] = useState<Skill | null>(null);
  const effectiveSkill: Skill | null = skill ?? acceptedSkill;
  const [modelParams, setModelParams] = useState<Record<string, string | number | boolean>>(
    () => (studioModel ? defaultValuesFor(studioModel) : {}),
  );
  useEffect(() => {
    setModelParams(studioModel ? defaultValuesFor(studioModel) : {});
  }, [studioModel]);
  const { messages, sendMessage, setMessages, status, error } = useChat({
    id: projectId,
    messages: initialMessages,
    generateId: () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: () => buildAuthHeaders(),
      body: () => ({ projectId }),
    }),
  });

  // When a chat turn finishes (status returns to "ready"), refresh the
  // Outputs panel. The agent's generate_image / generate_scene_anchor tools
  // write directly to project_assets, but the outputs panel (v2-project
  // query) only polls while a pending run exists — so without this the
  // freshly-generated image sits in chat but never appears on the right.
  const prevChatStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevChatStatusRef.current;
    prevChatStatusRef.current = status;
    if (prev !== "ready" && status === "ready") {
      void queryClient.invalidateQueries({ queryKey: ["v2-project", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    }
  }, [status, projectId, queryClient]);

  // Auto-kickoff: the user picked a Skill from the Skills gallery, which
  // created this project pre-tagged with a skill slug. Send a first user
  // message once so the agent immediately calls run_skill and walks the
  // user through it — otherwise it asks "what are we making?" as if the
  // choice never happened.
  const fetchSkillCover = useServerFn(getSkillCover);
  const kickoffFiredRef = useRef(false);
  const [kickoffCover, setKickoffCover] = useState<{ url: string; mime: string } | null>(null);
  useEffect(() => {
    if (kickoffFiredRef.current) return;
    if (!kickoffSkillSlug) return;
    if (messages.length > 0) return;
    if (status !== "ready") return;
    kickoffFiredRef.current = true;
    const label = kickoffSkillName || kickoffSkillSlug;
    void (async () => {
      let cover: {
        url?: string;
        mime?: string;
        name?: string;
        oneLiner?: string;
      } | null = null;
      try {
        cover = await fetchSkillCover({ data: { slug: kickoffSkillSlug } });
      } catch {
        cover = null;
      }

      // Show the skill's hero media in the kickoff bubble visually, but do
      // NOT forward it to the agent (avoids the model mistaking marketing
      // art for a reference asset). We stash the cover URL in local state
      // and inject it into the first user bubble at render time.
      const mime = cover?.mime ?? "video/mp4";
      if (cover?.url) {
        setKickoffCover({ url: cover.url, mime });
      }
      const baseText = `Let's use the "${label}" skill (slug: ${kickoffSkillSlug}). Kick it off and walk me through it.`;
      void sendMessage({ text: baseText });
    })();
  }, [
    kickoffSkillSlug,
    kickoffSkillName,
    messages.length,
    status,
    sendMessage,
    fetchSkillCover,
  ]);

  // Alternate kickoff: caller stashed a plain-text opening message in
  // sessionStorage under `kickoff:<projectId>` before navigating here (e.g.
  // the "Create a skill" CTA on the Skills page). Send it once.
  const textKickoffFiredRef = useRef(false);
  useEffect(() => {
    if (textKickoffFiredRef.current) return;
    if (kickoffSkillSlug) return;
    if (messages.length > 0) return;
    if (status !== "ready") return;
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(`kickoff:${projectId}`);
    } catch {}
    if (!pending) return;
    textKickoffFiredRef.current = true;
    try {
      sessionStorage.removeItem(`kickoff:${projectId}`);
    } catch {}
    void sendMessage({ text: pending });
  }, [projectId, kickoffSkillSlug, messages.length, status, sendMessage]);



  // Background job watcher — picks up run_model_app jobs that were submitted
  // by the agent but completed AFTER the SSE turn closed. The chat tool only
  // queues the fal job now; this hook converts a completed job into a real
  // project asset (via project_jobs.asset_id) and posts a single assistant
  // message announcing it so the agent's next turn sees the asset in
  // PROJECT MEMORY.
  const announcedJobsRef = useRef<Set<string>>(new Set());
  useProjectJobs(projectId, {
    onComplete: (job) => {
      if (announcedJobsRef.current.has(job.jobId)) return;
      announcedJobsRef.current.add(job.jobId);
      // Refetch the project so project.assets reflects the new row inserted
      // server-side. The realtime subscription also handles this but a manual
      // invalidate guarantees we don't race the next agent turn.
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      const label = job.appLabel ?? "Render";
      // Guess mime from mode/url so AssistantMessage renders the correct
      // media tag (<video>/<audio>/<img>) inline in chat.
      const url = job.resultUrl ?? "";
      const mode = (job.mode ?? "").toLowerCase();
      const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
      const mime =
        mode === "video" || ["mp4", "mov", "webm", "m4v"].includes(ext)
          ? `video/${ext === "mov" ? "quicktime" : ext || "mp4"}`
          : mode === "audio" || ["mp3", "wav", "m4a", "ogg", "flac"].includes(ext)
            ? `audio/${ext || "mpeg"}`
            : `image/${ext || "png"}`;
      const announce = `✅ ${label} finished.`;
      const patch = url
        ? `<script type="application/json" data-project-patch>${JSON.stringify({
            assetsAppend: [{ id: job.assetId, url, mime, label }],
          })}</script>`
        : "";
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setMessages((prev) => [
        ...prev,
        {
          id,
          role: "assistant",
          parts: [{ type: "text", text: `${announce}${patch}` }],
        } as UIMessage,
      ]);
    },
    onFail: (job) => {
      if (announcedJobsRef.current.has(job.jobId)) return;
      announcedJobsRef.current.add(job.jobId);
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setMessages((prev) => [
        ...prev,
        {
          id,
          role: "assistant",
          parts: [{ type: "text", text: `⚠️ ${job.appLabel ?? "Render"} failed — ${job.error}` }],
        } as UIMessage,
      ]);
    },
  });


  const runDirectStart = useServerFn(directGenerateStart);
  const runDirectPoll = useServerFn(directGeneratePoll);
  const runSuggestApp = useServerFn(suggestApp);
  const [directBusy, setDirectBusy] = useState(false);
  const [directMeta, setDirectMeta] = useState<Record<string, { modelLabel?: string; summary?: string }>>({});
  const busy = status === "submitted" || status === "streaming" || directBusy;

  // In-chat App suggestion (agent mode only). Runs in parallel with each
  // user message; surfaces an inline card the user can accept to switch
  // the project into that App's wizard without losing chat history.
  const [pendingSuggestion, setPendingSuggestion] =
    useState<AppSuggestion | null>(null);
  const [dismissedSkills, setDismissedSkills] = useState<Set<string>>(
    () => new Set(),
  );
  const [forceWizard, setForceWizard] = useState(false);
  const [lastRun, setLastRun] = useState<{ prompt: string; referenceImageUrls: string[] } | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string>("");
  const SUGGEST_THRESHOLD = 0.6;

  // (Agent step-card derived state removed — agent now emits HTML cards only.)


  const handleAcceptSuggestion = (s: AppSuggestion) => {
    const skillDef = SKILL_BY_ID[s.skillId];
    if (!skillDef) return;
    setPendingSuggestion(null);
    setAcceptedSkill(skillDef);
    setForceWizard(true);
    onAcceptSuggestion(skillDef);
  };



  const handleDismissSuggestion = (s: AppSuggestion) => {
    setDismissedSkills((prev) => {
      const next = new Set(prev);
      next.add(s.skillId);
      return next;
    });
    setPendingSuggestion(null);
  };

  // Cancel out of an accepted App and return to agent mode.
  const handleCancelApp = () => {
    setAcceptedSkill(null);
    setForceWizard(false);
    setLastRun(null);
    setEditedPrompt("");
    onToolbarChange({ mode: "agent", model: null });
  };

  // Wrap the toolbar onChange so manual mode/model changes clear any
  // pending suggestion and reset the forced-wizard flag.
  const handleToolbarChange = (next: {
    mode: StudioMode;
    model: string | null;
  }) => {
    setPendingSuggestion(null);
    setForceWizard(false);
    if (next.mode === "agent") setAcceptedSkill(null);
    onToolbarChange(next);
  };

  const handleSend = async (
    text: string,
    opts?: {
      referenceImageUrls?: string[];
      params?: Record<string, string | number | boolean>;
      modeOverride?: StudioMode;
      modelOverride?: string;
    },
  ) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    const effectiveMode = opts?.modeOverride ?? studioMode;
    if (effectiveMode === "agent" || effectiveMode === "director-v2") {
      // Fire the App suggester in parallel — don't block the chat reply.
      void (async () => {
        try {
          const res = await runSuggestApp({ data: { intent: trimmed } });
          const top = res.suggestions?.[0];
          if (
            top &&
            top.confidence >= SUGGEST_THRESHOLD &&
            !dismissedSkills.has(top.skillId) &&
            SKILL_BY_ID[top.skillId]
          ) {
            setPendingSuggestion(top);
          }
        } catch {
          // Silent — suggestion is best-effort.
        }
      })();
      const refs = (opts?.referenceImageUrls ?? []).filter((u) => /^https?:/.test(u));
      if (refs.length) {
        await sendMessage({
          parts: [
            { type: "text", text: trimmed },
            ...refs.map((url) => ({
              type: "file" as const,
              mediaType: "image/*",
              url,
            })),
          ],
        });
      } else {
        await sendMessage({ text: trimmed });
      }
      return;
    }
    // Non-agent: skip the chat agent; call the matching Fal model directly.
    const model =
      opts?.modelOverride ?? studioModel ?? DEFAULT_MODEL_BY_KIND[effectiveMode];
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const modelLabel = model ? SKILL_BY_MODEL[model]?.label : undefined;
    const summary = summarizeParams(model ?? null, (opts?.params ?? modelParams) as Record<string, string | number | boolean>);
    setDirectMeta((prev) => ({ ...prev, [userId]: { modelLabel, summary } }));
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", parts: [{ type: "text", text: trimmed }] } as UIMessage,
    ]);
    setDirectBusy(true);
    try {
      const started = await runDirectStart({
        data: {
          projectId,
          prompt: trimmed,
          mode: effectiveMode,
          model,
          userMessageId: userId,
          assistantMessageId: assistantId,
          referenceImageUrls: opts?.referenceImageUrls,
          params: opts?.params,
        },
      });
      if (!started.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            parts: [{ type: "text", text: started.assistantText }],
          } as UIMessage,
        ]);
        return;
      }
      // Surface the pending placeholder in the Outputs panel immediately.
      void queryClient.invalidateQueries({ queryKey: ["v2-project", projectId] });
      // Poll fal queue until done (or ~10 min cap).
      const deadline = Date.now() + 10 * 60_000;
      let finalText: string | null = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const tick = await runDirectPoll({
          data: {
            projectId,
            mode: effectiveMode,
            model,
            prompt: trimmed,
            assistantMessageId: assistantId,
            statusUrl: started.statusUrl,
            responseUrl: started.responseUrl,
            placeholderId: started.placeholderId ?? undefined,
          },
        });
        if (tick.status === "done") {
          finalText = tick.assistantText ?? "Done.";
          void queryClient.invalidateQueries({ queryKey: ["v2-project", projectId] });
          break;
        }
      }
      if (!finalText) finalText = "Generation timed out — please try again.";
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          parts: [{ type: "text", text: finalText }],
        } as UIMessage,
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          parts: [{ type: "text", text: `Generation failed — ${msg}` }],
        } as UIMessage,
      ]);
    } finally {
      setDirectBusy(false);
    }
  };

  // Expose our sender to the parent so the right-hand panel buttons can
  // dispatch directives into the chat (keyframes / production).
  useEffect(() => {
    registerSender?.((text: string) => {
      void handleSend(text);
    });
    registerAskAgent?.((args) => {
      void handleSend(args.prompt, { referenceImageUrls: args.referenceImageUrls });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerSender, registerAskAgent, busy]);

  // Expose an "append assistant message" channel for non-chat flows (e.g.
  // the Render Final pipeline) to post their result into the conversation.
  useEffect(() => {
    registerAppendAssistant?.((text: string) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setMessages((prev) => [
        ...prev,
        {
          id,
          role: "assistant",
          parts: [{ type: "text", text }],
        } as UIMessage,
      ]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerAppendAssistant]);

  // Card answers can also carry uploaded assets. Patch them into project
  // state immediately so the panel reflects the upload, then send a
  // human-readable summary to the model (with asset ids it can reference).
  const handleCardAnswerImpl = async (answer: CardAnswer) => {
    if (answer.assets.length) {
      onPatch({ assetsAppend: answer.assets });
    }
    // Surface any uploaded images in the user's answer bubble so the
    // attachment is visible in the chat, not just described in prose.
    const imageUrls = answer.assets
      .filter((a) => a.mime.startsWith("image/") && /^https?:/.test(a.url))
      .map((a) => a.url);
    await handleSend(answer.summary, imageUrls.length ? { referenceImageUrls: imageUrls } : undefined);
  };
  // Keep a ref to the latest impl so the callback we pass to GenerativeCard
  // is stable across keystroke re-renders — otherwise React.memo on the card
  // would still see a new onAnswer prop and re-render, replaying the child
  // fade-in CSS animations (visible flicker while typing in the composer).
  const handleCardAnswerRef = useRef(handleCardAnswerImpl);
  handleCardAnswerRef.current = handleCardAnswerImpl;
  const handleCardAnswer = useCallback(
    (a: CardAnswer) => handleCardAnswerRef.current(a),
    [],
  );

  const textOf = (m: UIMessage) =>
    m.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();

  // Walk message parts looking for tool results. Each AI SDK tool part has
  // type "tool-<name>" with { state, toolCallId, input, output }.
  type ToolPart = {
    type: string;
    state?: string;
    toolCallId?: string;
    output?: unknown;
    input?: unknown;
  };
  const toolPartsOf = (m: UIMessage): ToolPart[] =>
    (m.parts as unknown as ToolPart[]).filter((p) =>
      typeof p.type === "string" && p.type.startsWith("tool-"),
    );

  // Collect media assets produced by tool calls on a single assistant
  // message — so we can render them inline in the chat (not just attach
  // them to the project's Outputs).
  const assistantToolAssets = (m: UIMessage): Array<{ url: string; mime: string; name?: string; label?: string }> => {
    const out: Array<{ url: string; mime: string; name?: string; label?: string }> = [];
    // Build an id → fresh-url map from the current project state so we can
    // re-sign URLs that have since expired (FAL CDN, signed Supabase URLs).
    // Without this, returning to a project shows broken inline videos in the
    // chat history.
    const freshUrlById = new Map<string, string>();
    for (const a of assets) {
      if (a.id && a.url) freshUrlById.set(a.id, a.url);
    }
    const resolveUrl = (id: string | undefined, fallback: string): string =>
      (id && freshUrlById.get(id)) || fallback;
    for (const p of toolPartsOf(m)) {
      if (p.state !== "output-available") continue;
      const o = p.output as
        | {
            id?: string;
            url?: string;
            mime?: string;
            name?: string;
            label?: string;
            image?: { id?: string; url?: string; mime?: string; name?: string };
            assets?: Array<{ id?: string; url?: string; mime?: string; name?: string; label?: string }>;
            ok?: boolean;
            result?: unknown;
          }
        | undefined;
      if (!o) continue;
      if ((p.type === "tool-generate_image" || p.type === "tool-run_model_app") && o.url && o.mime) {
        out.push({ url: resolveUrl(o.id, o.url), mime: o.mime, name: o.name, label: o.label });
      } else if (p.type === "tool-generate_scene_anchor" && o.url) {
        // Anchor tool result doesn't include mime; keyframes are always images.
        out.push({
          url: resolveUrl(o.id, o.url),
          mime: o.mime ?? "image/png",
          name: o.name,
          label: o.label ?? "Anchor",
        });
      } else if (p.type === "tool-search_stock_media" && Array.isArray(o.assets)) {
        for (const a of o.assets) {
          if (a.url && a.mime) out.push({ url: resolveUrl(a.id, a.url), mime: a.mime, name: a.name, label: a.label });
        }
      } else if (p.type === "tool-tool_invoke" && o.ok && o.result) {
        // Generic registry-tool invocations (e.g. product_ad.scrape_url) —
        // sniff the result shape for an `image` payload to inline.
        const invokeInput = (p as { input?: { name?: string } }).input;
        const r = o.result as {
          image?: { id?: string; url?: string; mime?: string; name?: string };
          assets?: Array<{ id?: string; url?: string; mime?: string; name?: string; label?: string }>;
        };
        if (
          (invokeInput?.name === "product_ad.scrape_url" || true) &&
          r.image?.url &&
          r.image?.mime
        ) {
          out.push({
            url: resolveUrl(r.image.id, r.image.url),
            mime: r.image.mime,
            name: r.image.name ?? invokeInput?.name ?? "Reference",
          });
        }
        if (Array.isArray(r.assets)) {
          for (const a of r.assets) {
            if (a.url && a.mime) out.push({ url: resolveUrl(a.id, a.url), mime: a.mime, name: a.name, label: a.label });
          }
        }
      }
    }
    return out;
  };

  // Build an html string for AssistantMessage that includes any
  // tool-produced media as a synthetic project patch the component reads.
  // Also surfaces select_app routing as a small "Using <app>" chip.
  const withToolAssets = (m: UIMessage, baseHtml: string): string => {
    let html = baseHtml;
    // Routing chip from select_app tool calls.
    for (const p of toolPartsOf(m)) {
      if (p.state !== "output-available") continue;
      if (p.type !== "tool-select_app") continue;
      const o = p.output as { label?: string; appId?: string; error?: string } | undefined;
      if (!o || o.error || !o.label) continue;
      const chip = `<div data-routing-chip data-app-label="${o.label.replace(/"/g, "&quot;")}"></div>`;
      html = `${chip}${html}`;
      break;
    }
    const assets = assistantToolAssets(m);
    if (!assets.length) return html;
    const existing = extractProjectPatch(html) as
      | { assetsAppend?: Array<{ url?: string; mime?: string }> }
      | null;
    const existingUrls = new Set((existing?.assetsAppend ?? []).map((a) => a.url));
    const merged = [
      ...(existing?.assetsAppend ?? []),
      ...assets.filter((a) => !existingUrls.has(a.url)),
    ];
    if (existing) {
      // Already has a patch script; rebuild it with merged assets.
      const next = { ...existing, assetsAppend: merged };
      return html.replace(
        /<script\s+type=["']application\/json["']\s+data-project-patch>[\s\S]*?<\/script>/,
        `<script type="application/json" data-project-patch>${JSON.stringify(next)}</script>`,
      );
    }
    return `${html}<script type="application/json" data-project-patch>${JSON.stringify({ assetsAppend: merged })}</script>`;
  };


  // Pending tool calls in the in-flight assistant message (for the shimmer).
  const pendingTools: string[] = [];
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant" && busy) {
    for (const p of toolPartsOf(last)) {
      if (p.state !== "output-available" && p.state !== "output-error") {
        const name = p.type.replace(/^tool-/, "");
        pendingTools.push(name);
      }
    }
  }

  const friendlyToolStatus = (toolName: string) => {
    const statusByTool: Record<string, string> = {
      generate_image: "Generating an image…",
      run_model_app: "Generating your result…",
      search_stock_media: "Searching references…",
      tool_search: "Looking up app functions…",
      tool_invoke: "Running app function…",
      planner: "Planning…",
      emit_ui: "Preparing the next step…",
      propose_skill: "Picking a skill…",
      select_app: "Choosing the best app…",
      commit_project_patch: "Updating the project…",
      generate_scene_anchor: "Generating an anchor frame…",
      approve_scene_anchor: "Approving anchor…",
    };
    return statusByTool[toolName] ?? "Working on it…";
  };

  // Apply project patches embedded in any assistant message exactly once.
  const appliedPatchIds = useRef<Set<string>>(new Set());
  const appliedToolCallIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      // 1) Hidden script patches in the card HTML.
      if (!appliedPatchIds.current.has(m.id)) {
        const patch = extractProjectPatch(textOf(m));
        if (patch) {
          appliedPatchIds.current.add(m.id);
          onPatch(patch as ProjectPatch);
        }
      }
      // 2) Tool results: auto-attach generated/stock assets and apply
      //    commit_project_patch outputs.
      for (const p of toolPartsOf(m)) {
        if (p.state !== "output-available") continue;
        const callId = p.toolCallId ?? "";
        if (!callId || appliedToolCallIds.current.has(callId)) continue;
        appliedToolCallIds.current.add(callId);
        const out = p.output as
          | { error?: string; id?: string; url?: string; assets?: ProjectAsset[]; patch?: unknown }
          | undefined;
        if (!out || out.error) continue;
        if (p.type === "tool-generate_image" && out.id && out.url) {
          onPatch({ assetsAppend: [out as ProjectAsset] });
          if (out.patch) onPatch(out.patch as ProjectPatch);
        } else if (p.type === "tool-run_model_app") {
          const modeOut = (out as { mode?: string; jobId?: string }).mode;
          const jobOut = (out as { mode?: string; jobId?: string }).jobId;
          // Sync path: an asset came back inline — attach it.
          if (out.id && out.url) {
            onPatch({ assetsAppend: [out as ProjectAsset] });
            if (out.patch) onPatch(out.patch as ProjectPatch);
          }
          // Async path: a video job was queued — reveal the Timeline so the
          // rendering placeholder is immediately visible to the user.
          if (jobOut && (modeOut === "video" || modeOut === "image")) {
            onRenderJobQueued?.();
          }
        } else if (p.type === "tool-search_stock_media" && Array.isArray(out.assets)) {
          onPatch({ assetsAppend: out.assets });
        } else if (p.type === "tool-commit_project_patch" && out.patch) {
          onPatch(out.patch as ProjectPatch);
        } else if (p.type === "tool-generate_scene_anchor" && out.id && out.url) {
          // Attach the anchor image as a project asset AND apply the scene
          // patch (thumb, anchorAssetIds, anchorApproved=false) so the agent
          // sees the updated state on the next turn and doesn't re-generate.
          onPatch({ assetsAppend: [out as ProjectAsset] });
          if (out.patch) onPatch(out.patch as ProjectPatch);
        } else if (p.type === "tool-approve_scene_anchor" && out.patch) {
          onPatch(out.patch as ProjectPatch);
        } else if (p.type === "tool-tool_invoke") {
          // Generic registry invocation. Best-effort attach: if the wrapped
          // serverFn returned an asset-shaped object, append it.
          const wrapped = (out as { result?: unknown }).result as
            | { id?: string; url?: string; image?: { id?: string; url?: string; mime?: string } }
            | undefined;
          if (wrapped?.id && wrapped?.url) {
            onPatch({ assetsAppend: [wrapped as ProjectAsset] });
          } else if (wrapped?.image?.id && wrapped?.image?.url) {
            onPatch({ assetsAppend: [wrapped.image as ProjectAsset] });
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // History items = everything that's "decided". The most recent assistant
  // card (if not yet answered) is the *active* card, rendered anchored
  // above the input — NOT inside the scroll history.
  const history: Array<
    | { kind: "user"; key: string; text: string; imageUrls?: string[]; videoUrls?: string[] }
    | { kind: "assistant"; key: string; text: string }
    | { kind: "card"; key: string; html: string }
    | { kind: "pill"; key: string; title: string; answer: string; imageUrls?: string[]; skillSlug?: string }
  > = [];
  let activeCard: { key: string; html: string } | null = null;

  // Look ahead to detect a run_skill tool call triggered by the user's
  // decision — used to render the skill's hero video + name inside the pill.
  const skillSlugAfter = (idx: number): string | undefined => {
    for (let j = idx + 1; j < Math.min(messages.length, idx + 4); j++) {
      const m = messages[j];
      if (!m || m.role === "user") continue;
      for (const p of m.parts as Array<{ type: string; input?: { slug?: string }; output?: { slug?: string } }>) {
        if (p.type === "tool-run_skill") {
          const slug = p.output?.slug ?? p.input?.slug;
          if (slug) return slug;
        }
      }
    }
    return undefined;
  };

  const mediaUrlsOf = (m: UIMessage): { images: string[]; videos: string[] } => {
    const images: string[] = [];
    const videos: string[] = [];
    for (const p of m.parts as Array<{ type: string; url?: string; mediaType?: string }>) {
      if (p.type !== "file" || typeof p.url !== "string") continue;
      const mt = p.mediaType ?? "";
      if (mt.startsWith("image/")) images.push(p.url);
      else if (mt.startsWith("video/")) videos.push(p.url);
    }
    return { images, videos };
  };
  const imageUrlsOf = (m: UIMessage): string[] => mediaUrlsOf(m).images;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "user") {
      const prev = messages[i - 1];
      // Push as a plain user bubble unless the previous assistant turn was
      // an interactive gen-UI card AND a later assistant reply exists —
      // in that case the card's demotion below renders the "decision pill".
      // Without the laterAssistantExists guard, a just-submitted answer to
      // a card disappears until the new assistant starts streaming.
      let userHasLaterAssistant = false;
      for (let j = i + 1; j < messages.length; j++) {
        if (messages[j].role === "assistant") {
          userHasLaterAssistant = true;
          break;
        }
      }
      const prevIsDecisionCard =
        !!prev && prev.role !== "user" && !!extractCardTitle(textOf(prev));
      if (!prevIsDecisionCard || !userHasLaterAssistant) {
        const { images, videos } = mediaUrlsOf(m);
        // The kickoff message is the first user message when a skill slug
        // launched this project. Show the skill's marketing hero visually
        // in that bubble without ever sending it to the model.
        if (i === 0 && kickoffCover) {
          if (kickoffCover.mime.startsWith("image/")) images.unshift(kickoffCover.url);
          else videos.unshift(kickoffCover.url);
        }
        const bubble = { kind: "user" as const, key: m.id, text: textOf(m), imageUrls: images, videoUrls: videos };
        history.push(bubble);
      }
      continue;
    }
    const rawHtml = textOf(m);
    const html = withToolAssets(m, rawHtml);
    const next = messages[i + 1];
    const toolAssetsCount = assistantToolAssets(m).length;
    // Demote this assistant into history only once a NEW assistant message
    // exists after it. Using `next.role === "user"` demotes the moment the
    // user submits, which causes the previous assistant to flash back into
    // view as a plain history bubble before the new stream starts.
    let laterAssistantExists = false;
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j].role === "assistant") {
        laterAssistantExists = true;
        break;
      }
    }
    if (next && next.role === "user" && laterAssistantExists) {
      const isGenerativeCard = /data-card/.test(html);
      if (!isGenerativeCard) {
        // Plain conversational reply — keep it visible in history exactly
        // as it rendered when it was the latest message. Without this,
        // non-card assistant messages get filtered out the moment the user
        // sends a follow-up and appear to "disappear" from the chat.
        history.push({ kind: "assistant", key: `a-${m.id}`, text: html });
        continue;
      }
      const hasMedia =
        toolAssetsCount > 0 ||
        !!(extractProjectPatch(html) as { assetsAppend?: unknown[] } | null)?.assetsAppend?.length;
      const prose = extractCardProse(html) || extractCardTitle(html);
      const hasRoutingChip = /data-routing-chip/.test(html);
      if (prose || hasMedia || hasRoutingChip) {
        history.push({ kind: "assistant", key: `a-${m.id}`, text: html });
      }
      const pillTitle = extractCardTitle(rawHtml);
      // Only render a "decision pill" when the prior assistant turn was an
      // actual gen-UI card with a meaningful title. Direct generations
      // (image/video/etc. submitted from the composer) are not decisions —
      // skip the pill so we don't mislabel the user's next prompt.
      if (pillTitle) {
        history.push({
          kind: "pill",
          key: m.id,
          title: pillTitle,
          answer: textOf(next),
          imageUrls: imageUrlsOf(next),
          skillSlug: skillSlugAfter(i + 1),
        });
      }
    } else {
      // Direct (non-agent) generation results are plain assistant bubbles —
      // never an interactive "active card". Render them inline in history
      // so they remain visible in app mode (where the active-card slot is
      // owned by the wizard). Also: agent messages that produced media via
      // tool calls render inline as bubbles so the user sees the result in
      // chat (not just in the Outputs tab).
      const isDirectResult = /data-direct-result/.test(html);
      const hasToolMedia = toolAssetsCount > 0;
      if (
        isDirectResult ||
        hasToolMedia ||
        /^Generation (failed|timed out)/i.test(html) ||
        /^Couldn['']t (start|generate)/i.test(html)
      ) {
        history.push({ kind: "assistant", key: `a-${m.id}`, text: html });
      } else if (next && next.role === "user") {
        // The user has already sent a follow-up, so this assistant turn is
        // no longer the latest active element. Keep it in the transcript
        // before that user bubble. Use a consistent kind+key with the
        // `laterAssistantExists` branch above — if the classification flips
        // between renders (e.g. while a new assistant placeholder is added
        // mid-stream), React would unmount/remount and cause the message
        // to visibly flash.
        const isGenerativeCard = /data-card/.test(html);
        if (isGenerativeCard) {
          history.push({ kind: "card", key: `card-${m.id}`, html });
        } else {
          history.push({ kind: "assistant", key: `a-${m.id}`, text: html });
        }
      } else {
        activeCard = { key: m.id, html };
      }
    }
  }

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Defer to next tick so newly streamed children layout first, then scroll.
    const t = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
    return () => clearTimeout(t);
  }, [messages.length, history.length, activeCard?.key, activeCard?.html, busy, forceWizard, pendingTools.length, status]);



  return (
    <div className="relative flex h-full flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-5 px-8 py-12">
          {/* Project pill in the header already shows the active app — no
              need for a separate "Building: …" label here. */}

          {history.length === 0 && !activeCard && (
            skill ? (
              <HowItWorks skill={skill} />
            ) : (
              <div className="flex flex-col items-start gap-6 pt-6">
                <BrandMark className="h-12 w-12" />
                <AssistantMessage text="What are we making? Type one word below — I'll take it from there." />
              </div>
            )
          )}
          {history.map((it) => {
            if (it.kind === "user") {
              return <UserBubble key={it.key} text={it.text} assets={assets} meta={directMeta[it.key]} imageUrls={it.imageUrls} videoUrls={it.videoUrls} />;
            }
            if (it.kind === "assistant") {
              return (
                <div key={it.key} className="flex flex-col gap-3">
                  <AssistantMessage text={it.text} />
                  <ArtifactCards html={it.text} onOpen={onOpenArtifact} />
                </div>
              );
            }
            if (it.kind === "card") {
              const isGenerative =
                /data-card[\s>]/.test(it.html) &&
                !/<div\s+data-card(?:\s[^>]*)?>\s*<\/div>/.test(it.html);
              if (isGenerative && !(studioMode !== "agent" && effectiveSkill !== null)) {
                const chipMatch = it.html.match(/<div\s+data-routing-chip\s+data-app-label="[^"]+"\s*><\/div>/);
                const prose = extractCardProse(it.html);
                const proseWithChip = chipMatch ? `${chipMatch[0]}${prose ?? ""}` : prose;
                return (
                  <div key={it.key} className="flex flex-col gap-8">
                    {proseWithChip ? <AssistantMessage text={proseWithChip} /> : null}
                    <GenerativeCard
                      html={it.html}
                      onAnswer={handleCardAnswer}
                      assets={assets}
                      projectId={projectId}
                    />
                  </div>
                );
              }
              return (
                <div key={it.key} className="flex flex-col gap-3">
                  <AssistantMessage text={it.html} />
                  <ArtifactCards html={it.html} onOpen={onOpenArtifact} />
                </div>
              );
            }
            return (
              <DecisionPill
                key={it.key}
                title={it.title}
                answer={it.answer}
                assets={assets}
                imageUrls={it.imageUrls}
                skillSlug={it.skillSlug}
                onRevise={() =>
                  handleSend(`Let's revise "${it.title}" — show me that card again.`)
                }
              />
            );
          })}
          {activeCard && (() => {
            const ac = activeCard as { key: string; html: string };
            const isGenerative =
              /data-card[\s>]/.test(ac.html) &&
              !/<div\s+data-card(?:\s[^>]*)?>\s*<\/div>/.test(ac.html);
            if (isGenerative && !(studioMode !== "agent" && effectiveSkill !== null)) {
              const chipMatch = ac.html.match(/<div\s+data-routing-chip\s+data-app-label="[^"]+"\s*><\/div>/);
              const prose = extractCardProse(ac.html);
              const proseWithChip = chipMatch ? `${chipMatch[0]}${prose ?? ""}` : prose;
              // Defer mounting the interactive card until the assistant
              // turn has finished streaming. GenerativeCard renders via
              // dangerouslySetInnerHTML, so every streamed chunk would
              // otherwise wipe and rebuild the entire card DOM (images,
              // inputs, etc.) — that's what causes the visible flicker
              // as the card draws in. While streaming, show only the
              // prose; the "Thinking…" shimmer below covers the rest.
              if (busy) {
                return proseWithChip ? (
                  <AssistantMessage key={`stream-${ac.key}`} text={proseWithChip} />
                ) : null;
              }
              return (
                <div key={`card-${ac.key}`} className="flex flex-col gap-8">
                  {proseWithChip ? <AssistantMessage text={proseWithChip} /> : null}
                  <GenerativeCard
                    key={ac.key}
                    html={ac.html}
                    onAnswer={handleCardAnswer}
                    assets={assets}
                    projectId={projectId}
                  />
                </div>
              );
            }
            return (
              <div key={`q-${ac.key}`} className="flex flex-col gap-3">
                <AssistantMessage text={ac.html} />
                <ArtifactCards html={ac.html} onOpen={onOpenArtifact} />
              </div>
            );
          })()}
          {busy && (() => {
            const directLabel =
              studioMode !== "agent" && studioModel
                ? SKILL_BY_MODEL[studioModel]?.label
                : null;
            const text = pendingTools.length
              ? friendlyToolStatus(pendingTools[0])
              : directLabel
                ? `Running ${directLabel}…`
                : "Thinking…";
            return <Shimmer>{text}</Shimmer>;
          })()}
          {error && (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-5 py-3 text-sm text-destructive">
              {error.message ?? "Something went wrong with the AI gateway."}
            </div>
          )}
          {/* App suggestion card intentionally hidden — the agent quietly uses the
              best-matching skill in the background rather than asking the user. */}
          <div ref={bottomRef} className="h-4" />
        </ConversationContent>
        <ConversationScrollButton />

      </Conversation>

      {/* Anchored composer: active card stacks directly above the input */}
      <div className="bg-background/80 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-8 pb-8 pt-6">
          {(() => {
            // App-mode wizard: when an App is opened (non-agent mode) and the
            // conversation hasn't started yet, render the recipe-driven
            // wizard instead of the generic prompt box.
            const showWizard =
              !busy &&
              (forceWizard || (!activeCard && history.length === 0)) &&
              studioMode !== "agent" &&
              effectiveSkill !== null;
            if (showWizard) {
              const recipe = getRecipeForSkill(effectiveSkill);
              return (
                <div>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      {effectiveSkill.label}
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelApp}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Cancel · back to agent
                    </button>
                  </div>
                  <AppWizard
                    recipe={recipe}
                    projectId={projectId}
                    busy={busy}
                    onSubmit={({ prompt, assets: uploaded }) => {
                      if (uploaded.length) onPatch({ assetsAppend: uploaded });
                      setForceWizard(false);
                      const refUrls = uploaded
                        .filter((a) => a.mime.startsWith("image/") && a.url && /^https?:/.test(a.url))
                        .map((a) => a.url);
                      setLastRun({ prompt, referenceImageUrls: refUrls });
                      setEditedPrompt(prompt);
                      void handleSend(prompt, { referenceImageUrls: refUrls });
                    }}
                  />
                </div>
              );
            }
            return null;
          })()}
          {/* Generative cards now render inline in the chat as the latest
              assistant message — see the activeCard branch above. */}

          {!busy && !activeCard && history.length === 0 && studioMode === "agent" && (
            <div className="mb-4 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="rounded-full border border-border bg-card px-5 py-2.5 text-base font-medium text-foreground transition hover:border-primary/50 hover:shadow-glow"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {!busy && studioMode !== "agent" && effectiveSkill !== null && (history.length > 0 || activeCard) && !forceWizard && lastRun && (
            <div className="mt-4 rounded-2xl border border-border/60 bg-muted/30 p-3">
              <div className="mb-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Tweak prompt &amp; regenerate
              </div>
              {lastRun.referenceImageUrls.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {lastRun.referenceImageUrls.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ))}
                </div>
              )}
              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!editedPrompt.trim()}
                  onClick={() => {
                    const prompt = editedPrompt.trim();
                    if (!prompt) return;
                    setLastRun({ prompt, referenceImageUrls: lastRun.referenceImageUrls });
                    void handleSend(prompt, { referenceImageUrls: lastRun.referenceImageUrls });
                  }}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Regenerate
                </Button>
              </div>
            </div>
          )}
          {!busy && studioMode !== "agent" && effectiveSkill !== null && (history.length > 0 || activeCard) && !forceWizard && (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                className="h-14 rounded-2xl px-10 text-lg"
                onClick={() => setForceWizard(true)}
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Try App Again
              </Button>
            </div>
          )}




          {(() => {
            // In app mode (non-agent with a selected skill), never show the
            // free-form composer + toolbar — the wizard or the inline retry
            // editor owns the input surface.
            if (studioMode !== "agent" && effectiveSkill !== null) return null;

            return (
              <>
              <PromptInput
                className="overflow-hidden rounded-2xl [&>div]:bg-white dark:[&>div]:bg-white"
                onSubmit={async (msg) => {
                  const imgs = attachments.filter((a) => a.mime.startsWith("image/"));
                  const files = attachments.filter((a) => !a.mime.startsWith("image/"));
                  const refUrls = imgs.map((a) => a.url);
                  setAttachments([]);
                  let text = msg.text ?? input;
                  if (files.length) {
                    const lines = files
                      .map((f) => `- ${f.name || "file"} (${f.mime}) → ${f.url}`)
                      .join("\n");
                    text = `${text}\n\nAttached files:\n${lines}`;
                  }
                  await handleSend(text, {
                    params:
                      studioMode !== "agent" && studioModel
                        ? modelParams
                        : undefined,
                    referenceImageUrls: refUrls.length ? refUrls : undefined,
                  });
                }}
              >
                {attachments.length > 0 && (
                  <div className="flex flex-wrap justify-start gap-2 px-3 pt-3">
                    {attachments.map((a) => {
                      const isMedia =
                        a.mime.startsWith("image/") ||
                        a.mime.startsWith("video/") ||
                        a.mime.startsWith("audio/");
                      return (
                      <div
                        key={a.id}
                        className={
                          isMedia
                            ? "relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-muted"
                            : "relative flex h-16 items-center gap-2 overflow-hidden rounded-lg border border-border bg-muted px-3 pr-8"
                        }
                      >
                        {a.mime.startsWith("video/") ? (
                          <video
                            src={`${a.url}#t=0.1`}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : a.mime.startsWith("audio/") ? (
                          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase text-muted-foreground">
                            Audio
                          </div>
                        ) : a.mime.startsWith("image/") ? (
                          <img
                            src={a.url}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <>
                            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="flex min-w-0 flex-col leading-tight">
                              <span className="max-w-[180px] truncate text-xs font-medium">
                                {a.name || "file"}
                              </span>
                              <span className="text-[10px] uppercase text-muted-foreground">
                                {a.mime.split("/")[1] || a.mime}
                              </span>
                            </div>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setAttachments((prev) => prev.filter((x) => x.id !== a.id))
                          }
                          className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white hover:bg-black"
                          aria-label="Remove attachment"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      );
                    })}
                  </div>
                )}
                <PromptInputTextarea
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    studioMode === "agent"
                      ? "Type freely…"
                      : `Describe the ${studioMode} you want…`
                  }
                  rows={1}
                  className="text-2xl font-normal min-h-0 pt-7 pb-2 leading-snug [field-sizing:content]"
                />
                <PromptInputFooter className="justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 px-2 text-muted-foreground"
                      onClick={() => setPickerOpen(true)}
                      aria-label="Attach reference from Library"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={async (e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        if (!files.length) return;
                        setUploadingFiles(true);
                        try {
                          const uploaded: ProjectAsset[] = [];
                          for (const f of files) {
                            uploaded.push(
                              await fileToProjectAsset(f, projectId, "reference"),
                            );
                          }
                          setAttachments((prev) => [...prev, ...uploaded]);
                        } catch (err) {
                          console.error("[studio] file upload failed", err);
                          const msg = err instanceof Error ? err.message : String(err);
                          window.alert(msg);
                        } finally {
                          setUploadingFiles(false);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 px-2 text-muted-foreground"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingFiles}
                      aria-label="Upload file"
                      title="Upload file (image, video, zip, PDF, etc.)"
                    >
                      {uploadingFiles ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                    <StudioToolbar
                      mode={studioMode}
                      model={studioModel}
                      onChange={handleToolbarChange}
                    />
                    {studioMode !== "agent" && (
                      <ModelSettingsPopover
                        model={studioModel}
                        values={modelParams}
                        onChange={setModelParams}
                      />
                    )}
                  </div>
                  <PromptInputSubmit status={status} disabled={busy && !input} />
                </PromptInputFooter>
              </PromptInput>
              <AssetPickerDialog
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                accept="image"
                multiple
                onPick={async (result) => {
                  if (result.kind === "library") {
                    setAttachments((prev) => {
                      const seen = new Set(prev.map((a) => a.id));
                      const merged = [...prev];
                      for (const a of result.assets) {
                        if (!seen.has(a.id)) merged.push(a);
                      }
                      return merged;
                    });
                  } else if (result.kind === "files") {
                    setPickerOpen(false);
                    try {
                      const uploaded: ProjectAsset[] = [];
                      for (const f of result.files) {
                        uploaded.push(await fileToProjectAsset(f, projectId, "reference"));
                      }
                      setAttachments((prev) => [...prev, ...uploaded]);
                    } catch (err) {
                      console.error("[studio] attachment upload failed", err);
                    }
                    return;
                  }
                  setPickerOpen(false);
                }}
              />
              </>
            );
          })()}


        </div>
      </div>

    </div>
  );
}

// ---------- preview panel (storyboard grid) ----------

function PreviewPanel({
  scenes,
  activeSceneId,
  onSelect,
  totalDuration,
}: {
  scenes: Scene[];
  activeSceneId: string;
  onSelect: (id: string) => void;
  totalDuration: number;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground" />
        <div className="flex items-center gap-1" />
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl">
          {scenes.length === 0 ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/20 p-10 text-center">
              <LayoutGrid className="h-6 w-6 text-muted-foreground" />
              <div className="text-sm font-medium">No shots yet</div>
              <div className="max-w-xs text-xs text-muted-foreground">
                As you chat with the director on the left, shots will appear here.
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {scenes.map((s) => (
              <SceneTile
                key={s.id}
                scene={s}
                active={s.id === activeSceneId}
                onClick={() => onSelect(s.id)}
              />
            ))}
            <button className="grid aspect-[9/16] place-items-center rounded-xl border border-dashed border-border bg-card/30 text-muted-foreground transition hover:border-primary/50 hover:text-foreground">
              <div className="flex flex-col items-center gap-1">
                <Plus className="h-5 w-5" />
                <span className="text-xs">New shot</span>
              </div>
            </button>
          </div>
          )}
        </div>
      </div>

      {/* timeline strip */}
      <div className="border-t border-border/60 bg-sidebar/60 px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>00:00</span>
          <span>Timeline</span>
          <span>{formatDuration(totalDuration)}</span>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {scenes.length === 0 && (
            <div className="flex-1 rounded-md border border-dashed border-border/60 px-2 py-2 text-center text-[10px] text-muted-foreground/70">
              Timeline empty
            </div>
          )}
          {scenes.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{ flex: s.duration }}
              className={`group relative h-10 min-w-[60px] overflow-hidden rounded-md border transition ${
                s.id === activeSceneId
                  ? "border-primary/70"
                  : "border-border hover:border-primary/40"
              }`}
            >
              {s.thumb && (
                <img
                  src={s.thumb}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-50 group-hover:opacity-70"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent" />
              <div className="absolute bottom-0.5 left-1 text-[10px] font-medium">
                #{s.n}
              </div>
              <div className="absolute right-1 top-0.5 text-[10px] text-muted-foreground">
                {s.duration}s
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SceneTile({
  scene,
  active,
  onClick,
}: {
  scene: Scene;
  active: boolean;
  onClick: () => void;
}) {
  const isRendering = scene.status === "rendering";
  const hasClip = !!scene.clipUrl;
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border bg-card text-left shadow-elegant transition ${
        active
          ? "border-primary/70 ring-2 ring-primary/40"
          : "border-border hover:border-primary/40"
      }`}
    >
      <div className="relative aspect-[9/16] overflow-hidden bg-muted">
        {hasClip ? (
          <video
            src={scene.clipUrl}
            className="h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
            onMouseEnter={(e) => void (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
            onMouseLeave={(e) => (e.currentTarget as HTMLVideoElement).pause()}
            poster={scene.thumb || undefined}
          />
        ) : scene.thumb ? (
          <img
            src={scene.thumb}
            alt={scene.title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/50">
            <Film className="h-6 w-6" />
          </div>
        )}
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/20 to-transparent" />
      <div className="absolute inset-x-2 top-2 flex items-start justify-between">
        <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] leading-none backdrop-blur">
          #{scene.n}
        </span>
        <StatusDot status={scene.status} />
      </div>
      <div className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-primary opacity-0 transition group-hover:opacity-100">
        <Play className="h-4 w-4 fill-primary-foreground text-primary-foreground" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <div className="text-xs font-medium leading-tight">{scene.title}</div>
        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {scene.duration}s
        </div>
      </div>
    </button>
  );
}

function StatusDot({ status }: { status: Scene["status"] }) {
  const color =
    status === "ready"
      ? "bg-emerald-400"
      : status === "rendering"
        ? "bg-amber-400 animate-pulse"
        : "bg-muted-foreground/60";
  const label = status === "ready" ? "Ready" : status === "rendering" ? "Rendering" : "Draft";
  return (
    <span className="inline-flex items-start gap-1 rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] leading-none backdrop-blur">
      <span className={`mt-[3px] h-1.5 w-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

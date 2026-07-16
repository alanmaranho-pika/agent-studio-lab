import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Heart, Sparkles, Search, X } from "lucide-react";
import { useAppFavorites } from "@/hooks/use-app-favorites";

import { SKILLS, SKILL_BY_ID, type Skill, DEFAULT_MODEL_BY_KIND, type SkillKind } from "@/lib/skills";
import { AppRunner } from "@/components/v2/apps/app-runner";
import { CreateAppWizard, type CreateSubmit, type CreateMode } from "@/components/studio/create-app-wizard";
import { HowItWorksV2 } from "@/components/v2/apps/how-it-works";
import { AppShowcase } from "@/components/v2/apps/app-showcase";
import { APP_SHOWCASES, hasShowcase } from "@/lib/v2/app-showcases";
import { HowItWorksButton } from "@/components/v2/apps/how-it-works-button";
import {
  ProjectOutputsPanel,
  type OutputMeta,
} from "@/components/v2/apps/project-outputs-panel";
import { ProjectTimelinePanel } from "@/components/v2/apps/project-timeline-panel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  directGenerateStart,
  directGeneratePoll,
} from "@/lib/generate.functions";
import {
  pikaGenerateStart,
  pikaGeneratePoll,
} from "@/lib/pika.functions";
import {
  createProject,
  updateProjectState,
  useLocalProjectFn,
} from "@/lib/local-projects";
import { autoTitleProject } from "@/lib/project-title.functions";
import { listSkills } from "@/lib/skills/skills.functions";
import {
  createBeatPlaceholder,
  createAudioPlaceholder,
  finalizeBeatPlaceholder,
  recoverStalledBeats,
} from "@/lib/short-film.functions";


// Apps that manage their own placeholder lifecycle inside their custom panel
// (they call createBeatPlaceholder directly). Skip the central placeholder
// hook for these to avoid double placeholders on the timeline.
const SELF_MANAGED_PLACEHOLDER_SKILLS = new Set<string>([
  "app-short-film",
  "app-special-product-ad",
]);

import type { ProjectAsset } from "@/lib/project-state";
import { upsertCharacter } from "@/lib/characters.functions";
import { cn } from "@/lib/utils";
import { getAppSwatch } from "@/lib/app-swatch";
import { costForSkill } from "@/components/v2/monetization/costs";
import { spend, getCredits } from "@/components/v2/monetization/credits-store";
import { openUpgradeDialog } from "@/components/v2/monetization/upgrade-controller";
import { toast } from "sonner";
import { AiVideoToolkitSection } from "@/components/v2/ai-video-toolkit-section";




const TABS = [
  "Favorites",
  "Featured",
  
  "Pika",
  "Models",
  "Create Media",
  "Image",
  "Video",
  "Templates",
  "Audio",
  "Voice",
  "Community",
  "Coming Soon",
] as const;
type Tab = (typeof TABS)[number];

function isPikaSkill(skill: Skill): boolean {
  const m = skill.model ?? "";
  return m.startsWith("fal-ai/pika/") || m.startsWith("pika:");
}

function tabMatches(skill: Skill, tab: Tab, favorites: string[]): boolean {
  if (skill.category === "Hidden") return false;
  if (tab === "Coming Soon") return !!skill.comingSoon;
  // Coming soon apps are siloed into their own tab.
  if (skill.comingSoon) return false;
  
  if (tab === "Community") return false;
  if (tab === "Pika") return isPikaSkill(skill);
  if (tab === "Favorites") return favorites.includes(skill.id);
  if (tab === "Featured") return !!skill.featured;
  if (tab === "Models") return skill.category === "Models";
  if (tab === "Create Media") return skill.category === "Create Media";
  if (tab === "Image") return skill.category === "Image Apps";
  if (tab === "Video") return skill.category === "Video Apps";
  if (tab === "Templates") return skill.category === "Templates";
  if (tab === "Audio") return skill.category === "Audio Apps";
  if (tab === "Voice") return skill.category === "Voice Apps";
  return false;
}

import {
  runsStore,
  useRunsStore,
  type ActiveRun,
  type TimelineIntent,
} from "@/components/v2/apps/runs-store";

export type { TimelineIntent, ActiveRun };


const TIMELINE_INSTANCE_SEP = "::timeline-instance::";

type PersistedActiveRun = {
  id: string;
  skillId: string;
  projectId: string;
  prompt: string;
  phase: ActiveRun["phase"];
  error?: string;
  intent?: TimelineIntent;
  refImageUrls?: string[];
  effectiveMode: SkillKind;
  effectiveModel: string;
  params?: Record<string, string | number | boolean | string[]>;
  provider: "direct" | "pika";
  userMessageId: string;
  assistantMessageId: string;
  statusUrl?: string;
  responseUrl?: string;
  jobId?: string;
  createdAt: number;
};

const ACTIVE_RUNS_STORAGE_KEY = "v2:activeRuns";
const activeRunWorkers = new Set<string>();

function readPersistedActiveRuns(): PersistedActiveRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACTIVE_RUNS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - 12 * 60 * 60_000;
    return parsed.filter(
      (r): r is PersistedActiveRun =>
        !!r &&
        typeof r.id === "string" &&
        typeof r.skillId === "string" &&
        typeof r.projectId === "string" &&
        typeof r.prompt === "string" &&
        typeof r.effectiveMode === "string" &&
        typeof r.effectiveModel === "string" &&
        (r.provider === "direct" || r.provider === "pika") &&
        typeof r.userMessageId === "string" &&
        typeof r.assistantMessageId === "string" &&
        typeof r.createdAt === "number" &&
        r.createdAt > cutoff,
    );
  } catch {
    return [];
  }
}

function writePersistedActiveRuns(runs: PersistedActiveRun[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_RUNS_STORAGE_KEY, JSON.stringify(runs));
  } catch {
    // ignore storage failures; in-memory runs still work
  }
}

function upsertPersistedActiveRun(run: PersistedActiveRun) {
  const runs = readPersistedActiveRuns();
  const next = runs.filter((r) => r.id !== run.id);
  next.unshift(run);
  writePersistedActiveRuns(next.slice(0, 20));
}

function removePersistedActiveRun(id: string) {
  writePersistedActiveRuns(readPersistedActiveRuns().filter((r) => r.id !== id));
}

function makeTimelineRef(assetId: string) {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${assetId}${TIMELINE_INSTANCE_SEP}${id}`;
}

function titleHintFromPrompt(prompt: string): string | undefined {
  const match = prompt.match(/^\s*Title:\s*(.+)$/im);
  const title = match?.[1]?.trim().replace(/^["'\s]+|["'\s.]+$/g, "");
  return title ? title.slice(0, 80) : undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function retryablePoll<T>(
  poll: () => Promise<T>,
  onRetry?: (message: string) => void,
): Promise<T> {
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await poll();
      // Defensive: some server-fn transports can resolve to undefined when the
      // SSR/h3 layer swallows an error mid-flight. Treat that as a transient
      // failure and retry rather than letting the caller crash on
      // `undefined.status`.
      if (result == null) {
        lastError = "Polling returned no response";
        if (attempt < 2) {
          onRetry?.(lastError);
          await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        }
        continue;
      }
      return result;
    } catch (error) {
      lastError = errorMessage(error);
      if (attempt < 2) {
        onRetry?.(lastError);
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      }
    }
  }
  throw new Error(lastError || "Polling failed");
}

export type AppsWorkspaceProps = {
  /** The project this workspace is bound to. If undefined, this is the free
   * "Apps" landing experience that creates a new project on first run. */
  projectId?: string;
  /** Selected app id (from URL search). */
  appId?: string;
  /** Update URL when the selected app or projectId changes. */
  onSelectApp: (appId: string | undefined) => void;
  onProjectIdChange: (projectId: string | undefined) => void;
  /** If true, the project context is locked (project detail page): the title
   * dropdown's "New project" should navigate away to /v2/apps instead of
   * clearing in-place. */
  lockedProject?: boolean;
  /** Optional one-shot seed for the Create app — populated when arriving from
   * the home composer (?app=app-create&seedPrompt=...&seedMode=...). */
  seedPrompt?: string;
  seedMode?: SkillKind;
  seedModel?: string;
  /** Optional initial tab for the apps browser. */
  initialTab?: Tab;
  /** Called after the seed is consumed so the parent can clear the URL. */
  onSeedConsumed?: () => void;
};

// Generates a friendly, memorable placeholder name when the user didn't
// type one in the Character Creator. Keeps the library readable instead of
// a wall of "Untitled character" rows.
const CHARACTER_NAME_ADJECTIVES = [
  "Bold", "Quiet", "Bright", "Wild", "Gentle", "Daring", "Calm", "Swift",
  "Lucky", "Stormy", "Curious", "Sunny", "Velvet", "Iron", "Golden", "Silver",
  "Crimson", "Cobalt", "Amber", "Hazel", "Mellow", "Restless",
];
const CHARACTER_NAME_NOUNS = [
  "Fox", "Heron", "Wren", "Otter", "Ember", "River", "Echo", "Sparrow",
  "Wolf", "Sage", "Birch", "Comet", "Lark", "Moss", "Ridge", "Harbor",
  "Drift", "Vesper", "Onyx", "Marlow", "Atlas", "Reverie",
];
function makeCharacterName(): string {
  const a = CHARACTER_NAME_ADJECTIVES[Math.floor(Math.random() * CHARACTER_NAME_ADJECTIVES.length)];
  const n = CHARACTER_NAME_NOUNS[Math.floor(Math.random() * CHARACTER_NAME_NOUNS.length)];
  return `${a} ${n}`;
}


export function AppsWorkspace({
  projectId,
  appId,
  onSelectApp,
  onProjectIdChange,
  lockedProject,
  seedPrompt,
  seedMode,
  seedModel,
  initialTab,
  onSeedConsumed,
}: AppsWorkspaceProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const goBackOrApps = () => {
    onSelectApp(undefined);
  };
  const qc = useQueryClient();
  const runStart = useServerFn(directGenerateStart);
  const runPoll = useServerFn(directGeneratePoll);
  const pikaStart = useServerFn(pikaGenerateStart);
  const pikaPoll = useServerFn(pikaGeneratePoll);
  const updateState = useLocalProjectFn(updateProjectState);
  const createProj = useLocalProjectFn(createProject);
  const autoTitle = useServerFn(autoTitleProject);

  const [tab, setTab] = useState<Tab>(initialTab ?? "Featured");
  const [search, setSearch] = useState("");
  const runs = useRunsStore((s) => s.runs);
  const outputMeta = useRunsStore((s) => s.outputMeta);

  const [seedAsset, setSeedAsset] = useState<ProjectAsset | null>(null);
  const [seedTargetSkillId, setSeedTargetSkillId] = useState<string | null>(null);
  const createPlaceholderFn = useServerFn(createBeatPlaceholder);
  const createAudioPlaceholderFn = useServerFn(createAudioPlaceholder);
  const upsertCharacterFn = useServerFn(upsertCharacter);
  const finalizePlaceholderFn = useServerFn(finalizeBeatPlaceholder);
  const recoverStalledFn = useServerFn(recoverStalledBeats);
  // runId → placeholderId for active timeline placeholders.
  const placeholderByRunRef = useRef<Map<string, string>>(new Map());

  // When a project opens, sweep any orphan "pending" placeholders left
  // behind by a previous tab that was closed mid-render. Anything older
  // than 15 minutes is presumed dead; remove it from the timeline and
  // tell the user how many were cleared so they can re-run those beats.
  const recoveredOnceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId) return;
    if (recoveredOnceRef.current === projectId) return;
    recoveredOnceRef.current = projectId;
    void (async () => {
      try {
        const res = await recoverStalledFn({
          data: { projectId, staleMinutes: 15 },
        });
        if (res.recovered.length > 0) {
          const list = res.recovered
            .map((r) => r.label)
            .slice(0, 3)
            .join(", ");
          const more = res.recovered.length > 3 ? ` (+${res.recovered.length - 3} more)` : "";
          toast.error(
            `${res.recovered.length} render${res.recovered.length === 1 ? "" : "s"} stalled and were cleared: ${list}${more}. Re-run them from the app panel to retry.`,
            { duration: 8000 },
          );
          void qc.invalidateQueries({ queryKey: ["v2-project", projectId] });
        }
      } catch (err) {
        console.warn("[apps-workspace] recoverStalledBeats failed", err);
      }
    })();
  }, [projectId, recoverStalledFn, qc]);


  const timelineStorageKey = projectId ? `v2:timelineOpen:${projectId}` : null;
  // IMPORTANT: initialize to a value that's identical on server and client
  // (always false). Reading localStorage in the initializer caused a
  // hydration mismatch — React 19 discards the mismatched subtree (the app
  // panel) and remounts it, wiping in-progress wizard state (image, step,

  // brief). Sync from localStorage in an effect after mount instead.
  const [timelineOpen, setTimelineOpenRaw] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined" || !projectId) {
      setTimelineOpenRaw(false);
      return;
    }
    setTimelineOpenRaw(
      window.localStorage.getItem(`v2:timelineOpen:${projectId}`) === "1",
    );
  }, [projectId]);
  // Allow panels (e.g. Short Film Kling streaming) to request opening the
  // timeline imperatively without prop drilling through AppRunner.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { projectId?: string } | undefined;
      if (!projectId) return;
      if (detail?.projectId && detail.projectId !== projectId) return;
      setTimelineOpenRaw(true);
      if (typeof window !== "undefined" && projectId) {
        try {
          window.localStorage.setItem(`v2:timelineOpen:${projectId}`, "1");
        } catch {}
      }
    };
    window.addEventListener("v2:open-timeline", onOpen as EventListener);
    return () => window.removeEventListener("v2:open-timeline", onOpen as EventListener);
  }, [projectId]);
  const setTimelineOpen: typeof setTimelineOpenRaw = (value) => {
    setTimelineOpenRaw((prev) => {
      const next = typeof value === "function" ? (value as (p: boolean) => boolean)(prev) : value;
      if (typeof window !== "undefined" && timelineStorageKey) {
        try {
          window.localStorage.setItem(timelineStorageKey, next ? "1" : "0");
        } catch {}
      }
      return next;
    });
  };
  const [pendingIntent, setPendingIntent] = useState<TimelineIntent | null>(null);
  const { favorites, toggle: toggleFav, isFavorite } = useAppFavorites();


  const handleUseInApp = ({
    skill,
    asset,
    intent,
  }: {
    skill: Skill;
    asset: ProjectAsset | null;
    intent?: TimelineIntent;
  }) => {
    setSeedAsset(asset);
    setSeedTargetSkillId(asset ? skill.id : null);
    setPendingIntent(intent ?? null);
    onSelectApp(skill.id);
  };

  // Intentionally a no-op: keep the seed in parent state so the destination
  // panel reliably picks it up even across StrictMode double-mounts or the
  // brief route transition where the previous panel briefly co-exists. The
  // seed is overwritten by the next handleUseInApp call, and cleared when a
  // run actually starts (see startRun below). Panels guard against duplicate
  // seeding via their own seededRef.
  const clearSeed = () => {};

  // Only forward the seed to the panel whose skill it was intended for —
  // avoids the previously-mounted app consuming the seed during the brief
  // window between setSeedAsset (sync) and the router transition (async).
  const seedForSkill = (skillId: string | undefined): ProjectAsset | null =>
    skillId && seedTargetSkillId === skillId ? seedAsset : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? SKILLS.filter((s) => {
          const hay = `${s.label} ${s.description ?? ""} ${s.category ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
      : SKILLS.filter((s) => tabMatches(s, tab, favorites));
    // Push coming-soon items to the bottom (stable sort).
    return [...base].sort(
      (a, b) => Number(!!a.comingSoon) - Number(!!b.comingSoon),
    );
  }, [tab, favorites, search]);
  const selected: Skill | null = appId ? SKILL_BY_ID[appId] ?? null : null;

  // Sync mode for the unified Create wizard so the header / how-it-works
  // reflect whichever modality the user is currently composing in.
  const isCreateApp = !!selected?.id?.startsWith("app-create");
  const [createMode, setCreateMode] = useState<CreateMode>(
    seedMode ?? "agent",
  );
  useEffect(() => {
    if (isCreateApp) {
      setCreateMode(seedMode ?? "agent");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const CREATE_BY_MODE: Record<SkillKind, string> = {
    image: "app-create-image",
    video: "app-create-video",
    audio: "app-create-music",
    speech: "app-create-speech",
  };
  const createSkill: Skill | null = isCreateApp
    ? (createMode === "agent"
        ? selected
        : SKILL_BY_ID[CREATE_BY_MODE[createMode]] ?? selected)
    : null;


  const activeRuns = useMemo(() => Object.values(runs), [runs]);

  const maybeSaveCharacter = async ({
    skill,
    prompt,
    params,
    finalAsset,
  }: {
    skill: Skill;
    prompt: string;
    params?: Record<string, string | number | boolean | string[]>;
    finalAsset: { assetId: string; assetUrl: string; mime: string };
  }) => {
    if (skill.id !== "app-character-creator") return;
    if (!finalAsset.mime.startsWith("image/")) return;
    const charName =
      typeof params?.character_name === "string" && (params.character_name as string).trim()
        ? (params.character_name as string).trim()
        : makeCharacterName();
    const voiceId =
      typeof params?.voice === "string" && params.voice ? (params.voice as string) : null;
    const voiceLabel =
      typeof params?.voice_label === "string" && params.voice_label
        ? (params.voice_label as string)
        : null;
    try {
      await upsertCharacterFn({
        data: {
          name: charName,
          description: prompt,
          backstory: "",
          voiceProvider: voiceId ? "openai" : null,
          voiceId,
          voiceLabel,
          projectAssetId: finalAsset.assetId,
        },
      });
      void qc.invalidateQueries({ queryKey: ["v2-characters"] });
      void qc.invalidateQueries({ queryKey: ["v2-library"] });
      toast.success(`Saved "${charName}" to Characters`);
    } catch (err) {
      console.error("[v2] character save failed", err);
      toast.error(
        `Couldn't save "${charName}" to Characters — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const finalizeRun = async ({
    runId,
    skill,
    projectId: pid,
    prompt,
    intent,
    finalAsset,
    params,
  }: {
    runId: string;
    skill: Skill;
    projectId: string;
    prompt: string;
    intent?: TimelineIntent;
    finalAsset: { assetId: string; assetUrl: string; mime: string };
    params?: Record<string, string | number | boolean | string[]>;
  }) => {
    // If this run reserved a timeline placeholder, swap it for the real asset
    // in-place instead of appending — this preserves the user's perception of
    // a single rendering slot turning into the finished clip.
    const placeholderId = placeholderByRunRef.current.get(runId);
    if (placeholderId) {
      placeholderByRunRef.current.delete(runId);
      try {
        await finalizePlaceholderFn({
          data: { projectId: pid, placeholderId, realAssetId: finalAsset.assetId },
        });
        setTimelineOpen(true);
      } catch (e) {
        console.error("[v2] placeholder swap failed", e);
      }
    } else if (intent) {

      try {
        const cur = qc.getQueryData<{
          project?: {
            projectState?: {
              timeline?: {
                order?: string[];
                trims?: Record<string, { start: number; end: number; offset?: number }>;
                tracks?: Array<{ id: string; kind: "video" | "audio"; name: string; order: string[]; mute?: boolean; solo?: boolean; lock?: boolean }>;
              };
            };
          };
        }>(["v2-project", pid]);
        const curOrder = cur?.project?.projectState?.timeline?.order ?? [];
        const curTrims = cur?.project?.projectState?.timeline?.trims ?? {};
        const curTracks = cur?.project?.projectState?.timeline?.tracks ?? [];
        const nextOrder = curOrder.slice();
        const nextTrims: Record<string, { start: number; end: number; offset?: number }> = { ...curTrims };
        let nextTracks = curTracks.map((t) => ({ ...t, order: [...t.order] }));
        const routeToExtra = (ref: string, targetTrackId: string | undefined, kind: "video" | "audio") => {
          if (!targetTrackId || targetTrackId === "v1" || targetTrackId === "a1") return;
          const existing = nextTracks.findIndex((t) => t.id === targetTrackId);
          if (existing >= 0) {
            nextTracks[existing] = { ...nextTracks[existing], order: [...nextTracks[existing].order, ref] };
          } else {
            // Synthesize the extra track if it isn't persisted yet (e.g. default V2/A2).
            nextTracks = [
              ...nextTracks,
              { id: targetTrackId, kind, name: targetTrackId.toUpperCase(), order: [ref] },
            ];
          }
        };
        if (intent.kind === "appendVisual" || intent.kind === "appendAudio") {
          const ref = makeTimelineRef(finalAsset.assetId);
          nextOrder.push(ref);
          routeToExtra(ref, intent.targetTrackId, intent.kind === "appendVisual" ? "video" : "audio");
        } else if (intent.kind === "appendSubclips") {
          for (const sc of intent.subclips) {
            const ref = makeTimelineRef(finalAsset.assetId);
            nextOrder.push(ref);
            nextTrims[ref] = { start: sc.startSec, end: sc.endSec };
          }
        } else if (intent.kind === "replaceClip" || intent.kind === "replaceAudio") {
          const idx = nextOrder.indexOf(intent.targetRef);
          if (idx >= 0) nextOrder[idx] = makeTimelineRef(finalAsset.assetId);
          else nextOrder.push(makeTimelineRef(finalAsset.assetId));
        }
        await updateState({
          data: { id: pid, patch: { timeline: { order: nextOrder, trims: nextTrims, tracks: nextTracks, seeded: true } } },
        });
        setTimelineOpen(true);
      } catch (e) {
        console.error("[v2] timeline intent apply failed", e);
      }
    }

    // For Character Creator runs, surface a clean character name + one-line
    // description in the output caption instead of the giant raw prompt.
    let captionTitle: string | undefined;
    let captionDescription: string | undefined;
    if (skill.id === "app-character-creator") {
      const name =
        typeof params?.character_name === "string" &&
        (params.character_name as string).trim()
          ? (params.character_name as string).trim()
          : makeCharacterName();
      captionTitle = name;
      // Take the leading "Character: ..." sentence(s) up to (but not including)
      // the layout/composition instructions, then strip hex color codes.
      const cutMarkers = [
        "Compose the output",
        "Compose ",
        "ABSOLUTELY NO",
        "Layout,",
      ];
      let head = prompt;
      for (const m of cutMarkers) {
        const i = head.indexOf(m);
        if (i > 0) head = head.slice(0, i);
      }
      captionDescription = head
        .replace(/\s*\(#[0-9a-fA-F]{3,8}\)/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[.\s]+$/, "");
    }
    runsStore.setOutputMeta(finalAsset.assetId, {
      prompt,
      skillId: skill.id,
      title: captionTitle,
      description: captionDescription,
    });
    dismissRun(runId);
    removePersistedActiveRun(runId);
    void qc.invalidateQueries({ queryKey: ["v2-library"] });
    void qc.invalidateQueries({ queryKey: ["v2-library-picker"] });
    void qc.invalidateQueries({ queryKey: ["v2-projects"] });
    void qc.invalidateQueries({ queryKey: ["v2-project", pid] });
    void qc.invalidateQueries({ queryKey: ["v2-jobs"] });

    void (async () => {
      try {
        await autoTitle({
          data: { id: pid, prompt, appLabel: skill.label, titleHint: titleHintFromPrompt(prompt) },
        });
        void qc.invalidateQueries({ queryKey: ["v2-projects"] });
        void qc.invalidateQueries({ queryKey: ["v2-project", pid] });
        void qc.invalidateQueries({ queryKey: ["project", pid, "skill-restore"] });
      } catch (err) {
        console.warn("[v2] auto-title failed", err);
      }
    })();
  };

  const handleNewProject = () => {
    if (lockedProject) {
      void navigate({ to: "/studio" });
    } else {
      onProjectIdChange(undefined);
    }
  };

  const dismissRun = (id: string) => {
    removePersistedActiveRun(id);
    runsStore.dismissRun(id);
  };

  useEffect(() => {
    const persisted = readPersistedActiveRuns();
    for (const run of persisted) {
      const baseSkill = SKILL_BY_ID[run.skillId];
      if (!baseSkill) {
        removePersistedActiveRun(run.id);
        continue;
      }
      const runSkill: Skill = {
        ...baseSkill,
        kind: run.effectiveMode,
        model: run.effectiveModel,
      };
      if (!runsStore.getState().runs[run.id]) {
        runsStore.setRun(run.id, {
          id: run.id,
          skill: runSkill,
          projectId: run.projectId,
          prompt: run.prompt,
          phase: run.phase === "starting" ? "polling" : run.phase,
          error: run.error,
          intent: run.intent,
          refImageUrls: run.refImageUrls,
        });
      }
      if (run.phase === "error" || activeRunWorkers.has(run.id)) continue;
      const canPoll =
        (run.provider === "pika" && !!run.jobId) ||
        (run.provider === "direct" && !!run.statusUrl && !!run.responseUrl);
      if (!canPoll) continue;
      activeRunWorkers.add(run.id);
      void (async () => {
        let finalAsset: { assetId: string; assetUrl: string; mime: string } | null = null;
        try {
          const deadline = Date.now() + 10 * 60_000;
          runsStore.updateRun(run.id, { phase: "polling", error: undefined });
          upsertPersistedActiveRun({ ...run, phase: "polling", error: undefined });
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 3000));
            const tick = await retryablePoll(() =>
              run.provider === "pika"
                ? pikaPoll({
                    data: {
                      projectId: run.projectId,
                      model: run.effectiveModel,
                      prompt: run.prompt,
                      assistantMessageId: run.assistantMessageId,
                      jobId: run.jobId!,
                    },
                  })
                : runPoll({
                    data: {
                      projectId: run.projectId,
                      mode: run.effectiveMode,
                      model: run.effectiveModel,
                      prompt: run.prompt,
                      assistantMessageId: run.assistantMessageId,
                      statusUrl: run.statusUrl!,
                      responseUrl: run.responseUrl!,
                      params: run.params,
                    },
                  }),
            );
            if (tick.status !== "done") continue;
            if (tick.ok) {
              const t = tick as { assetId: string; assetUrl: string; mime: string };
              finalAsset = { assetId: t.assetId, assetUrl: t.assetUrl, mime: t.mime };
            } else {
              const t = tick as { error?: string; assistantText?: string };
              throw new Error(t.assistantText ?? t.error ?? "Generation failed");
            }
            break;
          }
          if (!finalAsset) throw new Error("Generation timed out.");
          await finalizeRun({
            runId: run.id,
            skill: baseSkill,
            projectId: run.projectId,
            prompt: run.prompt,
            intent: run.intent,
            finalAsset,
            params: run.params,
          });
          await maybeSaveCharacter({
            skill: baseSkill,
            prompt: run.prompt,
            params: run.params,
            finalAsset,
          });
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          runsStore.updateRun(run.id, { phase: "error", error });
          upsertPersistedActiveRun({ ...run, phase: "error", error });
        } finally {
          activeRunWorkers.delete(run.id);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const startRun = async ({
    skill,
    projectId: pid,
    prompt,
    assets,
    modeOverride,
    modelOverride,
    params,
    intent: intentOverride,
  }: {
    skill: Skill;
    projectId: string;
    prompt: string;
    assets: ProjectAsset[];
    modeOverride?: SkillKind;
    modelOverride?: string;
    params?: Record<string, string | number | boolean | string[]>;
    intent?: TimelineIntent;
  }) => {
    // Demo credit gate. Block the run + open upgrade dialog if balance < cost.
    const cost = costForSkill(skill);
    const { balance } = getCredits();
    if (balance < cost) {
      openUpgradeDialog({
        requiredCredits: cost,
        reason: `${skill.label} needs ${cost.toLocaleString()} credits. Upgrade to keep creating.`,
      });
      toast.error(`Not enough credits — ${skill.label} needs ${cost.toLocaleString()}`);
      return;
    }
    spend(cost, skill.label);
    toast.message(`−${cost.toLocaleString()} credits`, {
      description: `${(balance - cost).toLocaleString()} credits left`,
    });

    const runId = crypto.randomUUID();
    activeRunWorkers.add(runId);
    const intent = intentOverride ?? pendingIntent;
    setPendingIntent(null);
    const refImageUrls = assets
      .filter((a) => a.mime.startsWith("image/"))
      .map((a) => a.url);
    const effectiveMode: SkillKind = modeOverride ?? skill.kind;
    const effectiveModel =
      modelOverride || skill.model || DEFAULT_MODEL_BY_KIND[effectiveMode];
    const runSkill: Skill = modeOverride || modelOverride
      ? { ...skill, kind: effectiveMode, model: effectiveModel }
      : skill;
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const isPika = effectiveModel.startsWith("pika:");
    const persistedBase: PersistedActiveRun = {
      id: runId,
      skillId: skill.id,
      projectId: pid,
      prompt,
      phase: "starting",
      intent: intent ?? undefined,
      refImageUrls,
      effectiveMode,
      effectiveModel,
      params,
      provider: isPika ? "pika" : "direct",
      userMessageId: userId,
      assistantMessageId: assistantId,
      createdAt: Date.now(),
    };
    let persistedRun = persistedBase;
    upsertPersistedActiveRun(persistedRun);
    runsStore.setRun(runId, {
      id: runId,
      skill: runSkill,
      projectId: pid,
      prompt,
      phase: "starting",
      intent: intent ?? undefined,
      refImageUrls,
    });
    onProjectIdChange(pid);
    // Note: the timeline column is opened *after* the run finishes and the
    // intent is applied (see below) — opening it now would yank the user
    // out of the app panel mid-generation.
    // A run has actually started — release the pending seed so navigating
    // back to this app later doesn't re-attach the same reference.
    setSeedAsset(null);
    setSeedTargetSkillId(null);

    // For single-output video/audio apps, drop a temporary placeholder clip
    // onto the timeline now and open the timeline so the user can watch the
    // render. The placeholder is swapped for the real asset in finalizeRun
    // (success) or dropped on error in updatePhase below. Skips apps that
    // manage their own placeholder lifecycle in their custom panel.
    const isSelfManaged = SELF_MANAGED_PLACEHOLDER_SKILLS.has(skill.id);
    const isSingleOutputVideo =
      skill.kind === "video" && (!intent || intent.kind === "appendVisual");
    const isSingleOutputAudio =
      skill.kind === "audio" && (!intent || intent.kind === "appendAudio");
    const wantsPlaceholder =
      !isSelfManaged && (isSingleOutputVideo || isSingleOutputAudio);
    if (wantsPlaceholder) {
      try {
        const durRaw = params?.duration;
        const durNum =
          typeof durRaw === "number"
            ? durRaw
            : typeof durRaw === "string"
              ? Number(durRaw)
              : NaN;
        const durationSec =
          Number.isFinite(durNum) && durNum > 0 ? Math.min(120, durNum) : 5;
        const createFn = isSingleOutputAudio
          ? createAudioPlaceholderFn
          : createPlaceholderFn;
        const { placeholderId } = await createFn({
          data: {
            projectId: pid,
            label: `${skill.label} rendering…`,
            durationSec,
          },
        });
        placeholderByRunRef.current.set(runId, placeholderId);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("v2:open-timeline", { detail: { projectId: pid } }),
          );
        }
        void qc.invalidateQueries({ queryKey: ["v2-project", pid] });
      } catch (err) {
        console.error("[v2] placeholder create failed", err);
      }
    }



    const updatePhase = (phase: ActiveRun["phase"], error?: string) => {
      persistedRun = { ...persistedRun, phase, error };
      upsertPersistedActiveRun(persistedRun);
      runsStore.updateRun(runId, { phase, error });
      if (phase === "error") {
        const placeholderId = placeholderByRunRef.current.get(runId);
        if (placeholderId) {
          placeholderByRunRef.current.delete(runId);
          void finalizePlaceholderFn({
            data: { projectId: pid, placeholderId, realAssetId: null },
          })
            .catch((err) =>
              console.error("[v2] placeholder drop failed", err),
            )
            .finally(() => {
              void qc.invalidateQueries({ queryKey: ["v2-project", pid] });
            });
        }
      }
    };



    try {
      const refUrls = assets
        .filter((a) => a.mime.startsWith("image/"))
        .map((a) => a.url)
        .filter((u) => /^https?:/.test(u));
      const audioUrl = assets
        .find((a) => a.mime.startsWith("audio/") && /^https?:/.test(a.url))?.url;
      const videoUrl = assets
        .find((a) => a.mime.startsWith("video/") && /^https?:/.test(a.url))?.url;


      let finalAsset: { assetId: string; assetUrl: string; mime: string } | null =
        null;
      const deadline = Date.now() + 10 * 60_000;

      if (isPika) {
        const started = await pikaStart({
          data: {
            projectId: pid,
            model: effectiveModel,
            prompt,
            userMessageId: userId,
            assistantMessageId: assistantId,
            imageUrl: refUrls[0],
            audioUrl,
            params,
          },
        });
        if (!started.ok) {
          throw new Error(started.assistantText ?? "Failed to start");
        }
        persistedRun = { ...persistedRun, jobId: started.jobId };
        upsertPersistedActiveRun(persistedRun);
        updatePhase("polling");
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 3000));
          const tick = await retryablePoll(() =>
            pikaPoll({
              data: {
                projectId: pid,
                model: effectiveModel,
                prompt,
                assistantMessageId: assistantId,
                jobId: started.jobId,
              },
            }),
          );
          if (tick.status === "done") {
            if (tick.ok) {
              const t = tick as { assetId: string; assetUrl: string; mime: string };
              finalAsset = { assetId: t.assetId, assetUrl: t.assetUrl, mime: t.mime };
            } else {
              const t = tick as { error?: string; assistantText?: string };
              throw new Error(t.assistantText ?? t.error ?? "Generation failed");
            }
            break;
          }
        }
      } else {
        const started = await runStart({
          data: {
            projectId: pid,
            prompt,
            mode: effectiveMode,
            model: effectiveModel,
            userMessageId: userId,
            assistantMessageId: assistantId,
            referenceImageUrls: refUrls.length ? refUrls : undefined,
            referenceVideoUrl: videoUrl,
            params,
          },
        });

        if (!started.ok) {
          throw new Error(started.assistantText ?? "Failed to start");
        }
        persistedRun = {
          ...persistedRun,
          statusUrl: started.statusUrl,
          responseUrl: started.responseUrl,
        };
        upsertPersistedActiveRun(persistedRun);
        updatePhase("polling");
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 3000));
          const tick = await retryablePoll(() =>
            runPoll({
              data: {
                projectId: pid,
                mode: effectiveMode,
                model: effectiveModel,
                prompt,
                assistantMessageId: assistantId,
                statusUrl: started.statusUrl,
                responseUrl: started.responseUrl,
                params,
              },
            }),
          );
          if (tick.status === "done") {
            if (tick.ok) {
              const t = tick as { assetId: string; assetUrl: string; mime: string };
              finalAsset = { assetId: t.assetId, assetUrl: t.assetUrl, mime: t.mime };
            } else {
              const t = tick as { error?: string; assistantText?: string };
              throw new Error(t.assistantText ?? t.error ?? "Generation failed");
            }
            break;
          }
        }
      }
      if (!finalAsset) throw new Error("Generation timed out.");
      await finalizeRun({
        runId,
        skill,
        projectId: pid,
        prompt,
        intent: intent ?? undefined,
        finalAsset,
        params,
      });

      await maybeSaveCharacter({ skill, prompt, params, finalAsset });


    } catch (e) {
      updatePhase("error", e instanceof Error ? e.message : String(e));
    } finally {
      activeRunWorkers.delete(runId);
    }
  };

  const handleRegenerate = async ({
    skill,
    prompt,
    projectId: pid,
  }: {
    skill: Skill;
    prompt: string;
    projectId: string;
  }) => {
    await startRun({ skill, projectId: pid, prompt, assets: [] });
  };

  const handleStartFromWizard = async ({
    skill,
    projectId: pidFromRunner,
    prompt,
    assets,
    params,
    modelOverride,
    intent,
  }: {
    skill: Skill;
    projectId: string;
    prompt: string;
    assets: ProjectAsset[];
    params?: Record<string, string | number | boolean | string[]>;
    modelOverride?: string;
    intent?: TimelineIntent;
  }) => {
    let pid = projectId ?? pidFromRunner;
    if (!pid) {
      const out = await createProj({
        data: {
          title: skill.label,
          skill: skill.id,
          studioMode: skill.kind,
          studioModel: skill.model,
        },
      });
      pid = out.id;
    }
    await startRun({ skill, projectId: pid, prompt, assets, params, modelOverride, intent });
  };

  const handleStartFromCreate = async (args: CreateSubmit) => {
    const createSkill = selected!;
    let pid = projectId;
    // Agent mode is orthogonal to skill runs — mint (or reuse) a project and
    // hand the user off to the Agent Studio instead of executing a skill.
    if (args.mode === "agent") {
      if (!pid) {
        const out = await createProj({
          data: {
            title: args.prompt.slice(0, 60) || "Untitled Project",
            studioMode: "agent",
          },
        });
        pid = out.id;
      }
      void navigate({
        to: "/studio/$projectId",
        params: { projectId: pid! },
        search: { seedPrompt: args.prompt } as Record<string, unknown>,
      });
      return;
    }
    if (!pid) {
      const out = await createProj({
        data: {
          title: args.prompt.slice(0, 60) || createSkill.label,
          skill: createSkill.id,
          studioMode: args.mode,
          studioModel: args.model,
        },
      });
      pid = out.id;
    }
    await startRun({
      skill: createSkill,
      projectId: pid,
      prompt: args.prompt,
      assets: args.assets,
      modeOverride: args.mode,
      modelOverride: args.model,
      params: args.params,
    });
  };


  // Consume seed once it's been handed off to the wizard.
  const consumedSeedRef = useRef(false);
  useEffect(() => {
    if (!seedPrompt && !seedMode && !seedModel) return;
    if (consumedSeedRef.current) return;
    consumedSeedRef.current = true;
    // Defer so the wizard mounts with the seed first.
    const t = setTimeout(() => onSeedConsumed?.(), 50);
    return () => clearTimeout(t);
  }, [seedPrompt, seedMode, seedModel, onSeedConsumed]);

  // Right column: outputs once we have a project/runs; how-it-works when an
  // app is selected without a project yet; otherwise a generic placeholder.
  // Only show the project/outputs column when we're actually scoped to a
  // project. Stale active-run entries in localStorage shouldn't keep the
  // outputs column open after the user navigates back to the bare catalog
  // (e.g. by clicking "Create" in the main nav), and they shouldn't pull a
  // previous project's outputs into a *different* app the user just opened
  // (e.g. arriving at /v2/apps?app=app-world-cup-2026 from the home hero
  // shouldn't surface a stale character-creator project on the right).
  // Show the outputs column whenever we have a project OR there's an
  // in-flight run *belonging to the currently selected app* — that way the
  // "generating" cards appear immediately when the user clicks Generate,
  // even before the URL `projectId` finishes propagating through navigation,
  // without resurrecting unrelated projects from other apps.
  const relevantActiveRuns = useMemo(
    () =>
      selected
        ? activeRuns.filter((r) => r.skill.id === selected.id)
        : [],
    [activeRuns, selected],
  );
  const hasOutputsContext = !!projectId || relevantActiveRuns.length > 0;

  const showTimeline = timelineOpen && !!projectId;
  const isDefaultGrid = !selected && !hasOutputsContext;
  const appsGridCols = isDefaultGrid
    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
    : showTimeline
      ? "grid-cols-1"
      : "grid-cols-1 @[280px]:grid-cols-2";

  const appsBrowser = (
    <>
      <header className="px-8 pb-3 pt-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Apps
        </h1>
        <div className="mt-4 relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search apps…"
            className="h-9 w-full rounded-full border border-hairline bg-background pl-9 pr-9 text-xs outline-none transition focus:border-foreground/40"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => {
                setSearch("");
                setTab(t);
              }}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition",
                tab === t && !search
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </header>
      <div className="relative flex-1 min-h-0">
        <div className="@container h-full overflow-y-auto px-8 pb-8 pt-4">
        <div className={cn("grid gap-3", appsGridCols)}>
          {filtered.map((s) => {
            const Icon = s.icon;
            const swatch = getAppSwatch(s.id);
            const fav = isFavorite(s.id);
            return (
              <div
                key={s.id}
                className={cn(
                  "group relative flex flex-col items-start rounded-lg border border-hairline bg-card text-left transition-transform duration-200 hover:scale-[1.03] hover:shadow-elegant",
                  isDefaultGrid ? "gap-3 p-3" : "gap-2 p-3",
                )}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFav(s.id);
                  }}
                  aria-label={fav ? "Remove from favorites" : "Add to favorites"}
                  className={cn(
                    "absolute right-5 top-5 z-10 grid h-7 w-7 place-items-center rounded-full bg-background/80 backdrop-blur-sm ring-1 ring-border/60 transition",
                    fav
                      ? "text-rose-500 opacity-100"
                      : "text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100",
                  )}
                >
                  <Heart className={cn("h-3.5 w-3.5", fav && "fill-current")} />
                </button>
                <button
                  type="button"
                  onClick={() => onSelectApp(s.id)}
                  className={cn(
                    "flex w-full flex-col text-left",
                    isDefaultGrid ? "gap-3" : "gap-2",
                  )}
                >
                  {isDefaultGrid ? (
                    <>
                      {(() => {
                        const heroUrl = APP_SHOWCASES[s.id]?.heroVideoUrl ?? s.heroVideoUrl;
                        const heroImg = s.heroImageUrl;
                        if (heroUrl) {
                          return (
                            <div className="aspect-video w-full overflow-hidden rounded-md bg-muted">
                              <video
                                src={heroUrl}
                                muted
                                loop
                                playsInline
                                autoPlay
                                preload="metadata"
                                className="h-full w-full object-cover"
                              />
                            </div>
                          );
                        }
                        if (heroImg) {
                          return (
                            <div className="aspect-video w-full overflow-hidden rounded-md bg-muted">
                              <img
                                src={heroImg}
                                alt={s.label}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            </div>
                          );
                        }
                        return <div className="aspect-video w-full overflow-hidden rounded-md bg-muted" />;
                      })()}
                      <div className="flex items-start gap-3 px-1 pb-1">
                        <div
                          className="grid h-12 w-12 shrink-0 place-items-center rounded-[24%]"
                          style={{ backgroundColor: swatch.bg, color: swatch.fg }}
                        >
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1 pr-6">
                          <div className="flex items-center gap-1.5">
                            <div className="truncate text-base font-semibold leading-tight text-foreground">
                              {s.label}
                            </div>
                            {s.comingSoon && (
                              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                                Soon
                              </span>
                            )}
                          </div>
                          <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {s.description}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className="grid h-9 w-9 place-items-center rounded-[30%]"
                        style={{ backgroundColor: swatch.bg, color: swatch.fg }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex items-center gap-1.5 pr-6">
                        <div className="text-sm font-semibold leading-tight text-foreground">
                          {s.label}
                        </div>
                        {s.comingSoon && (
                          <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
                            Soon
                          </span>
                        )}
                      </div>
                      <div className="line-clamp-2 text-[11px] text-muted-foreground">
                        {s.description}
                      </div>
                    </>
                  )}
                </button>
              </div>
            );

          })}
        </div>
        {filtered.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {tab === "Favorites"
              ? "No favorites yet. Tap the heart on any app to save it here."
              : "No apps in this category yet."}
          </p>
        )}

        {!search && tab === "Community" ? (
          <div className="mt-2">
            <CommunityAppsGrid isDefaultGrid={isDefaultGrid} />
          </div>
        ) : null}
        </div>
        <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b to-transparent", isDefaultGrid ? "from-background" : "from-white")} />
      </div>
    </>
  );

  // Shared classes for the app column. It visually fuses with the white
  // vertical-nav shell to its left (no left margin, no left rounding), then
  // floats with a soft shadow on its right/bottom edges against the cream
  // page background. `relative z-10` keeps the shadow painting above the
  // sibling output panel.
  const floatingColumnClasses =
    "relative z-10 my-3 ml-0 mr-0 flex h-[calc(100vh-1.5rem)] flex-col rounded-r-xl bg-white shadow-[8px_8px_24px_-12px_rgba(40,30,15,0.15)] overflow-hidden";

  if (isDefaultGrid) {
    // Standalone Apps page — not an extension of the nav. Cream background,
    // no white wrapper, content sits directly on the page.
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        <div className="my-3 mr-3 flex h-[calc(100vh-1.5rem)] flex-1 flex-col overflow-hidden">
          {appsBrowser}
        </div>
      </div>
    );
  }


  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-screen overflow-hidden bg-background"
    >
      {/* Left column — apps / runner */}
      <ResizablePanel defaultSize="28%" minSize="20%" maxSize="45%" style={{ overflow: "visible" }}>
        <div className={floatingColumnClasses}>

          {isCreateApp && createSkill ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-3 border-b border-hairline px-5 py-3">
                <button
                  onClick={goBackOrApps}
                  className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"
                  aria-label="Back to apps"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{createSkill.label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {createSkill.description}
                  </div>
                </div>
                <HowItWorksButton skill={createSkill} />
              </div>
              <div className="flex-1 overflow-hidden">
                <CreateAppWizard
                  projectId={projectId ?? ""}
                  busy={false}
                  seedPrompt={seedPrompt}
                  seedMode={seedMode ?? selected!.kind}
                  seedModel={seedModel ?? (selected!.model || undefined)}
                  seedAsset={seedForSkill(selected?.id)}
                  mode={createMode}
                  onModeChange={setCreateMode}
                  onSeedConsumed={clearSeed}
                  onSubmit={(args) => void handleStartFromCreate(args)}
                />
              </div>
            </div>
          ) : selected && selected.comingSoon ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-3 border-b border-hairline px-5 py-3">
                <button
                  onClick={goBackOrApps}
                  className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"
                  aria-label="Back to apps"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{selected.label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {selected.description}
                  </div>
                </div>
              </div>
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="max-w-md text-center">
                  <div className="font-display text-3xl font-semibold text-foreground">
                    App Coming Soon
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">
                    We&apos;re putting the finishing touches on {selected.label}. Check back soon.
                  </div>
                </div>
              </div>
            </div>
          ) : selected ? (
            <AppRunner
              skill={selected}
              projectId={projectId}
              busy={false}
              seedAsset={seedForSkill(selected.id)}
              onSeedConsumed={clearSeed}
              onBack={goBackOrApps}
              onProjectReady={(pid) => onProjectIdChange(pid)}
              onStartRun={(args) => void handleStartFromWizard(args)}
            />


          ) : (
            appsBrowser
          )}

        </div>
      </ResizablePanel>

      <ResizableHandle className="w-3 bg-transparent" />

      {/* Middle column — outputs */}
      <ResizablePanel defaultSize={showTimeline ? "25%" : "72%"} minSize="20%">
        <div className="h-full overflow-hidden bg-background">
          {hasOutputsContext ? (
            <ProjectOutputsPanel
              projectId={projectId ?? relevantActiveRuns[0]?.projectId}
              activeRuns={activeRuns}
              outputMeta={outputMeta}
              onRegenerate={(args) => void handleRegenerate(args)}
              onUseInApp={handleUseInApp}
              onNewProject={handleNewProject}
              onDismissRun={dismissRun}
              timelineOpen={showTimeline}
              onToggleTimeline={() => setTimelineOpen((v) => !v)}
            />
          ) : selected ? (
            hasShowcase(selected.id) ? (
              <AppShowcase skill={selected} />
            ) : (
              <div className="grid h-full place-items-center overflow-y-auto p-6">
                <HowItWorksV2 skill={isCreateApp && createSkill ? createSkill : selected} />
              </div>
            )
          ) : (
            <EmptyPickAnApp />
          )}
        </div>
      </ResizablePanel>

      {showTimeline && (
        <>
          <ResizableHandle className="w-3 bg-transparent" />
          {/* Right column — timeline */}
          <ResizablePanel defaultSize="65%" minSize="25%" maxSize="80%">
            <ProjectTimelinePanel
              projectId={projectId}
              onClose={() => setTimelineOpen(false)}
              onUseInApp={handleUseInApp}
            />

          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}



function EmptyPickAnApp() {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[30%] bg-muted text-muted-foreground">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Select an app to see how it works
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick one from the left to view its steps. Once you generate, results
          land here in a new project.
        </p>
      </div>
    </div>
  );
}

function CommunityAppsGrid({ isDefaultGrid }: { isDefaultGrid: boolean }) {
  const fetchList = useServerFn(listSkills);
  const createProjectFn = useLocalProjectFn(createProject);
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["community-skills"],
    queryFn: () => fetchList({ data: { includePublic: true, source: "user" } }),
    staleTime: 60_000,
  });
  const skills = (q.data?.skills ?? []).filter((s) => s.source === "user");

  async function launch(slug: string, name: string) {
    const res = await createProjectFn({ data: { title: name, skill: slug } });
    void navigate({ to: "/studio/$projectId", params: { projectId: res.id } });
  }

  if (q.isLoading) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Loading community apps…</p>;
  }
  if (skills.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No community apps yet. Save one from an Agent project to publish it here.
      </p>
    );
  }
  return (
    <div className={cn("grid gap-3", isDefaultGrid ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}> 
      {skills.map((s) => (
        <div
          key={s.id}
          className="group relative flex flex-col gap-2 rounded-lg border border-hairline bg-card p-3 transition-transform duration-200 hover:scale-[1.02] hover:shadow-elegant"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold">{s.name}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                by @{s.authorName ?? "community"}
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{s.oneLiner}</p>
            </div>
            <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Community
            </span>
          </div>
          <button
            type="button"
            onClick={() => void launch(s.slug, s.name)}
            className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90"
          >
            Try it in Agent
          </button>
        </div>
      ))}
    </div>
  );
}

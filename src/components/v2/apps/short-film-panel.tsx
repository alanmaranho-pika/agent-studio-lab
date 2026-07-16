// ShortFilmPanel — second "Special App" in the catalog. Walks through
// Logline → Cast & Setting → Storyboard → Animate → Audio → Produce,
// then submits a Seedance render plus (optionally) parallel VO and music
// renders. The LLM analyzes the logline first to extract every
// character, environment, and (if implied) hero product so the user can
// lock visual references before any storyboard frames are generated.

import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthUser } from "@/hooks/use-auth-user";
import { runsStore, type TimelineIntent, type Subclip } from "@/components/v2/apps/runs-store";
import {
  Loader2,
  Upload as UploadIcon,
  X,
  Sparkles,
  RefreshCw,
  Plus,
  User as UserIcon,
  Users as UsersIcon,
  Mountain,
  Package,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { Skill } from "@/lib/skills";
import { uploadProjectAsset, getProject, updateProjectState, useLocalProjectFn } from "@/lib/local-projects";
import { autoTitleProject } from "@/lib/project-title.functions";
import { generateVoiceoverAsset } from "@/lib/tts.functions";
import {
  analyzeShortFilmBrief,
  generateShortFilmConcept,
  generateShortFilmReferenceImage,
  generateShortFilmMusic,
  composeShortFilmPrompt,
  suggestShortFilmOptions,
  startShortFilmBeat,
  pollShortFilmBeat,
  createBeatPlaceholder,
  finalizeBeatPlaceholder,
  type ShortFilmConcept,
  type ShortFilmSuggestions,
  type ShortFilmEntity,
} from "@/lib/short-film.functions";
import { renderKlingShot } from "@/lib/kling-render.functions";


import type { ProjectAsset } from "@/lib/project-state";
import {
  AssetPickerDialog,
  type PickerResult,
} from "@/components/studio/asset-picker-dialog";
import { CharacterPickerDialog } from "@/components/v2/library/character-picker-dialog";
import type { LibraryCharacter } from "@/lib/characters.functions";
import { useAssetDropTarget } from "@/components/v2/apps/use-asset-drop";
import { AppTextarea } from "@/components/v2/apps/shared/app-textarea";
import { Section } from "@/components/v2/apps/special-app-shell";
import { cn } from "@/lib/utils";
import { fileToProjectAsset as sharedUpload } from "@/lib/v2/upload-asset";


const STYLES = [
  "Cinematic",
  "Anime",
  "Noir",
  "Documentary",
  "Indie",
  "Surreal",
  "Sci-fi",
] as const;

const LENGTHS = [
  { value: 8, label: "8s" },
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
  { value: 60, label: "1m" },
  { value: 90, label: "1m 30s" },
  { value: 120, label: "2m" },
] as const;

type LengthSec = (typeof LENGTHS)[number]["value"];

const ASPECTS = [
  { value: "16:9", label: "Landscape", hint: "16:9" },
  { value: "9:16", label: "Portrait", hint: "9:16" },
  { value: "1:1", label: "Square", hint: "1:1" },
] as const;
type FilmAspect = (typeof ASPECTS)[number]["value"];

const RENDER_PATHS: ReadonlyArray<{
  value: string;
  label: string;
  hint: string;
  model: string;
  modelI2V: string;
  disabled?: boolean;
}> = [
  {
    value: "seedance",
    label: "Seedance 2.0",
    hint: "One long prompt covering all shots, with built-in audio. Honors character/setting/product reference images.",
    model: "bytedance/seedance-2.0/text-to-video",
    modelI2V: "bytedance/seedance-2.0/reference-to-video",
  },

  {
    value: "kling-cheap",
    label: "Kling Standard (cheaper)",
    hint: "Per-shot keyframes animated with Kling Standard, then stitched together with audio.",
    model: "fal-ai/kling-video/v2.1/standard/text-to-video",
    modelI2V: "fal-ai/kling-video/v2.1/standard/image-to-video",
  },
];

type AudioOption = "music" | "voiceover" | "talking";
const AUDIO_OPTIONS: ReadonlyArray<{
  value: AudioOption;
  label: string;
  hint: string;
  notePlaceholder: string;
}> = [
  {
    value: "music",
    label: "Music bed",
    hint: "Instrumental score under the film.",
    notePlaceholder: "Music direction (genre, mood, tempo, references…)",
  },
  {
    value: "voiceover",
    label: "Voiceover narration",
    hint: "AI narrator reads over the picture.",
    notePlaceholder: "What the narrator says — and voice notes (warm female, gravelly male…)",
  },
  {
    value: "talking",
    label: "Talking characters",
    hint: "On-screen characters speak / lip-sync dialogue.",
    notePlaceholder: "Character lines + voice notes (who they are, tone, accent…)",
  },
];

type EntityKind = "character" | "environment" | "product";

type Entity = {
  uid: string;
  kind: EntityKind;
  name: string;
  description: string;
  image: ProjectAsset | null;
  generating?: boolean;
  uploading?: boolean;
  // When imported from the Library, the source character id so we can
  // offer "update library copy" later. Image edits stay local.
  libraryCharacterId?: string | null;
};


const newUid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const ENTITY_META: Record<EntityKind, { label: string; Icon: typeof UserIcon; aspect: "9:16" | "16:9" | "1:1" }> = {
  character: { label: "Character", Icon: UserIcon, aspect: "9:16" },
  environment: { label: "Environment", Icon: Mountain, aspect: "16:9" },
  product: { label: "Product", Icon: Package, aspect: "1:1" },
};

async function fileToProjectAsset(
  file: File,
  projectId: string,
): Promise<ProjectAsset> {
  return sharedUpload(file, projectId, "reference");
}

// Parse a beat timecode ("0:00", "00:05", "1:23", or plain seconds) into
// a number of seconds, or null if it doesn't look like a timecode.
function parseTimecodeSeconds(tc: string): number | null {
  const trimmed = (tc || "").trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d+):(\d{1,2})/);
  if (m) {
    const min = parseInt(m[1], 10);
    const sec = parseInt(m[2], 10);
    if (!isNaN(min) && !isNaN(sec)) return min * 60 + sec;
  }
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

// Build subclip windows for one continuous video, derived from per-beat
// timecodes when available, otherwise evenly distributed across the total
// duration. Returned windows are in seconds.
function computeBeatSubclips(
  beats: ReadonlyArray<{ timecode: string; action: string }>,
  totalSeconds: number,
): Subclip[] {
  if (!beats.length || totalSeconds <= 0) return [];
  const starts: number[] = [];
  let valid = true;
  for (const b of beats) {
    const s = parseTimecodeSeconds(b.timecode);
    if (s == null || s < 0 || s >= totalSeconds) {
      valid = false;
      break;
    }
    starts.push(s);
  }
  // Starts must also be strictly increasing.
  if (valid) {
    for (let i = 1; i < starts.length; i++) {
      if (starts[i] <= starts[i - 1]) {
        valid = false;
        break;
      }
    }
  }
  const out: Subclip[] = [];
  if (valid) {
    for (let i = 0; i < beats.length; i++) {
      const start = starts[i];
      const end = i + 1 < starts.length ? starts[i + 1] : totalSeconds;
      if (end > start) out.push({ startSec: start, endSec: end, label: beats[i].action.slice(0, 60) });
    }
    return out;
  }
  // Fallback: split evenly.
  const per = totalSeconds / beats.length;
  for (let i = 0; i < beats.length; i++) {
    out.push({
      startSec: i * per,
      endSec: Math.min((i + 1) * per, totalSeconds),
      label: beats[i].action.slice(0, 60),
    });
  }
  return out;
}

// Compact per-shot keyframe slot rendered inside each storyboard beat card.
function BeatKeyframeSlot({
  asset,
  busy,
  onGenerate,
  onUpload,
  onClear,
  canGenerate,
}: {
  asset: ProjectAsset | null;
  busy: boolean;
  onGenerate: () => void;
  onUpload: () => void;
  onClear: () => void;
  canGenerate: boolean;
}) {
  if (busy) {
    return (
      <div className="grid h-20 w-20 shrink-0 place-items-center rounded-md border border-hairline bg-muted/30">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (asset) {
    return (
      <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-primary/40 ring-1 ring-primary/20">
        <img src={asset.url} alt="First frame" className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          title="Regenerate first frame"
          className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-background/80 text-foreground opacity-0 transition group-hover:opacity-100 disabled:opacity-0"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onClear}
          title="Clear first frame"
          className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-background/80 text-foreground opacity-0 transition group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex h-20 w-20 shrink-0 flex-col gap-1 rounded-md border border-dashed border-hairline bg-muted/20 p-1">
      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate}
        title="Generate first frame for this shot"
        className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded text-[10px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <Sparkles className="h-3 w-3" />
        Generate
      </button>
      <button
        type="button"
        onClick={onUpload}
        title="Upload your own first frame"
        className="flex h-5 items-center justify-center gap-0.5 rounded text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <UploadIcon className="h-3 w-3" />
        Upload
      </button>
    </div>
  );
}

// Card rendered per entity in the Cast & Setting step. Has name, description
// textarea (drives prompt), image slot (generate from description + drop refs
// or upload).
function EntityCard({
  entity,
  projectId,
  canGenerate,
  onPatch,
  onGenerate,
  onUpload,
  onRemove,
  onPickFromLibrary,
}: {
  entity: Entity;
  projectId: string;
  canGenerate: boolean;
  onPatch: (patch: Partial<Entity>) => void;
  onGenerate: () => void;
  onUpload: () => void;
  onRemove: () => void;
  onPickFromLibrary?: () => void;
}) {
  const meta = ENTITY_META[entity.kind];
  const Icon = meta.Icon;
  const { isOver, dropProps } = useAssetDropTarget({
    projectId,
    accept: "image",
    onAsset: (a) => onPatch({ image: a }),
  });
  const generating = !!entity.generating;
  const uploading = !!entity.uploading;
  return (
    <div
      {...dropProps}
      className={cn(
        "rounded-lg border border-hairline bg-background/40 p-3 transition",
        isOver && "ring-2 ring-primary/40",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <input
          value={entity.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder={`${meta.label} name`}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {entity.image ? (
        <div className="mb-3 flex items-start gap-3">
          <div className="relative w-28 shrink-0 overflow-hidden rounded-md border border-primary/40 ring-1 ring-primary/20">
            <img
              src={entity.image.url}
              alt={entity.image.name}
              className={cn(
                "w-full object-cover",
                entity.kind === "environment" ? "aspect-video" : "aspect-square",
              )}
            />
            <button
              type="button"
              onClick={() => onPatch({ image: null })}
              aria-label="Remove image"
              className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/80 text-foreground hover:bg-background"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || !canGenerate || entity.description.trim().length < 4}
            className="inline-flex flex-1 items-center justify-center gap-1.5 self-center rounded-md border border-hairline px-2 py-2 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Regenerate
          </button>
        </div>
      ) : (
        <div
          className={cn(
            "mb-3 grid gap-2",
            onPickFromLibrary ? "grid-cols-3" : "grid-cols-2",
          )}
        >
          <Button
            type="button"
            variant="outline"
            onClick={onGenerate}
            disabled={generating}
            className="h-9 w-full rounded-md text-xs shadow-none"
          >
            {generating ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating…</>
            ) : (
              <>Generate ref</>
            )}
          </Button>
          {onPickFromLibrary && (
            <button
              type="button"
              onClick={onPickFromLibrary}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-hairline px-2 text-[11px] text-muted-foreground hover:text-foreground"
              title="Choose from your characters or create a new one"
            >
              <UsersIcon className="h-3 w-3" /> Library
            </button>
          )}
          <button
            type="button"
            onClick={onUpload}
            disabled={uploading}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-hairline px-2 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            {uploading ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</>
            ) : (
              <><UploadIcon className="h-3 w-3" /> Upload</>
            )}
          </button>
        </div>
      )}
      <AppTextarea
        value={entity.description}
        onChange={(e) => onPatch({ description: e.target.value })}
        placeholder={
          entity.kind === "character"
            ? "Describe appearance, wardrobe, age, vibe — drives the reference image and is reused across shots."
            : entity.kind === "environment"
              ? "Describe the place, lighting, era, materials, mood."
              : "Describe the product — silhouette, materials, finish, branding."
        }
        rows={4}
        className="leading-relaxed"
      />

    </div>
  );
}

export function ShortFilmPanel({
  skill,
  projectId,
  busy,
  seedAsset,
  onSeedConsumed,
  onSubmit,
  onEnsureProject,
}: {
  skill: Skill;
  projectId: string;
  busy: boolean;
  seedAsset?: ProjectAsset | null;
  onSeedConsumed?: () => void;
  onSubmit: (args: {
    prompt: string;
    assets: ProjectAsset[];
    params?: Record<string, string | number | boolean>;
    modelOverride?: string;
    intent?: TimelineIntent;
  }) => void;
  onEnsureProject?: () => Promise<string>;
}) {
  
  const analyzeFn = useServerFn(analyzeShortFilmBrief);
  const conceptFn = useServerFn(generateShortFilmConcept);
  const refImageFn = useServerFn(generateShortFilmReferenceImage);
  const ttsFn = useServerFn(generateVoiceoverAsset);
  const musicFn = useServerFn(generateShortFilmMusic);
  const getProjectFn = useLocalProjectFn(getProject);
  const updateStateFn = useLocalProjectFn(updateProjectState);
  const autoTitleFn = useServerFn(autoTitleProject);
  
  const klingShotFn = useServerFn(renderKlingShot);
  const startBeatFn = useServerFn(startShortFilmBeat);
  const pollBeatFn = useServerFn(pollShortFilmBeat);
  const createPlaceholderFn = useServerFn(createBeatPlaceholder);
  const finalizePlaceholderFn = useServerFn(finalizeBeatPlaceholder);

  const suggestFn = useServerFn(suggestShortFilmOptions);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { signedIn, loading: authLoading } = useAuthUser();

  // Server functions in this panel require an authenticated user. If the
  // visitor is browsing /v2/apps signed-out, bounce them to /login. We seed
  // `pika.intent.draft` first so the login screen shows the same
  // "Generating with Short Film — 94%" preview as other apps.
  const requireAuth = (): boolean => {
    if (authLoading) return false;
    if (!signedIn) {
      try {
        const seeded = entities.find((e) => !!e.image);
        const draft = {
          skillId: skill.id,
          skillLabel: skill.label,
          prompt: logline.trim(),
          refUrl: seeded?.image?.url ?? "",
          refName: seeded?.name ?? "",
          ts: Date.now(),
        };
        window.sessionStorage.setItem("pika.intent.draft", JSON.stringify(draft));
      } catch {
        // sessionStorage may be unavailable; login still works without the preview.
      }
      void navigate({
        to: "/login",
        search: { redirect: window.location.href },
      });
      return false;
    }
    return true;
  };

  // Mark a generated asset so it shows up in the Outputs panel with the
  // Short Film chip + regenerate affordance, and trigger a refetch.
  const tagOutput = (assetId: string, prompt: string) => {
    runsStore.setOutputMeta(assetId, { prompt: prompt.slice(0, 200), skillId: skill.id });
    if (projectId) {
      void qc.invalidateQueries({ queryKey: ["v2-project", projectId] });
    }
  };

  // 1. Logline
  const [logline, setLogline] = useState("");
  const [lengthSec, setLengthSec] = useState<LengthSec>(15);
  const [style, setStyle] = useState<string>(STYLES[0]);
  const [aspect, setAspect] = useState<FilmAspect>("16:9");

  // Dynamic per-step options.
  const [suggestions, setSuggestions] = useState<ShortFilmSuggestions | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [touched, setTouched] = useState<{ length: boolean; style: boolean }>({
    length: false,
    style: false,
  });

  // 2. Cast & Setting (LLM-driven)
  const [entities, setEntities] = useState<Entity[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [entityPickerFor, setEntityPickerFor] = useState<string | null>(null);
  const [charLibraryOpen, setCharLibraryOpen] = useState(false);


  // 3. Concept / storyboard
  const [concept, setConcept] = useState<ShortFilmConcept | null>(null);
  const [writingConcept, setWritingConcept] = useState(false);
  const [conceptError, setConceptError] = useState<string | null>(null);

  // 4. Render path
  const [renderPath, setRenderPath] = useState<string>("seedance");

  // 5. Audio — multi-select with notes (mirrors the Product Ad app).
  const [audioSelected, setAudioSelected] = useState<Record<AudioOption, boolean>>({
    music: false,
    voiceover: true,
    talking: false,
  });
  const [audioNotes, setAudioNotes] = useState<Record<AudioOption, string>>({
    music: "",
    voiceover: "",
    talking: "",
  });
  const toggleAudio = (k: AudioOption) =>
    setAudioSelected((s) => ({ ...s, [k]: !s[k] }));
  const setAudioNote = (k: AudioOption, v: string) =>
    setAudioNotes((n) => ({ ...n, [k]: v }));
  const anyAudio =
    audioSelected.music || audioSelected.voiceover || audioSelected.talking;
  // Derived single-mode for the existing producer pipeline:
  // any voice (narration or dialogue) → "voiceover" path; music-only → "music"; none → "silent".
  const audioMode: "voiceover" | "music" | "silent" =
    audioSelected.voiceover || audioSelected.talking
      ? "voiceover"
      : audioSelected.music
      ? "music"
      : "silent";
  // Plain-language plan for the storyboard writer (kept short).
  const audioPlan = (() => {
    if (!anyAudio) return "Silent film — no narration, dialogue, or music.";
    const lines = AUDIO_OPTIONS.filter((o) => audioSelected[o.value]).map(
      (o) => `- ${o.label}${audioNotes[o.value].trim() ? `: ${audioNotes[o.value].trim()}` : ""}`,
    );
    const dialogueHint = audioSelected.talking
      ? "\nFor talking characters, write each beat's `voiceover` field as in-scene dialogue spoken by the named character (not narrator copy)."
      : "";
    return `Audio plan:\n${lines.join("\n")}${dialogueHint}`;
  })();

  // 6. Produce
  const [error, setError] = useState<string | null>(null);
  const [sideRunBusy, setSideRunBusy] = useState(false);
  const [klingBusy, setKlingBusy] = useState(false);
  const [seedanceBusy, setSeedanceBusy] = useState(false);
  const [beatsDone, setBeatsDone] = useState(0);
  const [beatsTotal, setBeatsTotal] = useState(0);


  // Per-shot first frames.
  const [keyframes, setKeyframes] = useState<Record<number, ProjectAsset | null>>({});
  const [keyframeBusy, setKeyframeBusy] = useState<Record<number, boolean>>({});
  const [keyframePickerFor, setKeyframePickerFor] = useState<number | null>(null);
  const [bulkKeyframeBusy, setBulkKeyframeBusy] = useState(false);

  const TOTAL_STEPS = 5;
  // Step indices: 0=Logline, 1=Cast, 2=Storyboard, 3=Animate, 4=Audio, 5=Produce
  const [openStep, setOpenStep] = useState<number | null>(0);
  const [maxStep, setMaxStep] = useState<number>(0);

  // ── Durable wizard state ────────────────────────────────────────
  // Persist progress to localStorage keyed by projectId so revisiting the
  // project (even after closing the tab / restarting the browser) restores
  // the logline, cast, storyboard, etc. so the user can edit and re-run.
  const storageKey =
    projectId && projectId !== "anonymous-draft"
      ? `pika.shortfilm.v1:${projectId}`
      : null;
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !storageKey || typeof window === "undefined") return;
    hydratedRef.current = true;
    try {
      // Migrate any previously sessionStorage-saved drafts to localStorage.
      const ls = window.localStorage.getItem(storageKey);
      const ss = !ls ? window.sessionStorage.getItem(storageKey) : null;
      const raw = ls ?? ss;
      if (!raw) return;
      const s = JSON.parse(raw) as Record<string, unknown>;
      if (typeof s.logline === "string") setLogline(s.logline);
      if (typeof s.lengthSec === "number") setLengthSec(s.lengthSec as LengthSec);
      if (typeof s.style === "string") setStyle(s.style);
      if (s.aspect === "16:9" || s.aspect === "9:16" || s.aspect === "1:1") {
        setAspect(s.aspect);
      }
      if (Array.isArray(s.entities)) setEntities(s.entities as Entity[]);
      if (s.concept) setConcept(s.concept as ShortFilmConcept);
      if (typeof s.renderPath === "string") setRenderPath(s.renderPath);
      if (s.audioSelected && typeof s.audioSelected === "object") {
        setAudioSelected(s.audioSelected as Record<AudioOption, boolean>);
      } else if (typeof s.audioMode === "string") {
        // Migrate v1 single-select drafts.
        const legacy = s.audioMode as string;
        setAudioSelected({
          music: legacy === "music",
          voiceover: legacy === "voiceover",
          talking: false,
        });
      }
      if (s.audioNotes && typeof s.audioNotes === "object") {
        setAudioNotes(s.audioNotes as Record<AudioOption, string>);
      }
      if (s.keyframes && typeof s.keyframes === "object") {
        setKeyframes(s.keyframes as Record<number, ProjectAsset | null>);
      }
      if (typeof s.maxStep === "number") setMaxStep(s.maxStep);
      if (typeof s.openStep === "number") setOpenStep(s.openStep);
    } catch {
      /* corrupt cache — ignore */
    }
  }, [storageKey]);

  // Save on every meaningful change once hydration has settled.
  useEffect(() => {
    if (!storageKey || !hydratedRef.current || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          logline,
          lengthSec,
          style,
          aspect,
          entities,
          concept,
          renderPath,
          audioMode,
          keyframes,
          openStep,
          maxStep,
        }),
      );
    } catch {
      /* quota or serialization issue — ignore */
    }
  }, [
    storageKey,
    logline,
    lengthSec,
    style,
    aspect,
    entities,
    concept,
    renderPath,
          audioSelected,
          audioNotes,
    keyframes,
    openStep,
    maxStep,
  ]);


  const goBack = (i: number) => setOpenStep(Math.max(0, i - 1));
  const commitStep = (i: number) => {
    setMaxStep((m) => Math.max(m, i + 1));
    setOpenStep(i + 1 >= TOTAL_STEPS ? i : i + 1);
    void refreshSuggestions();
  };
  const applyEdit = () => {
    setOpenStep(Math.min(TOTAL_STEPS - 1, maxStep));
    void refreshSuggestions();
  };
  const currentStep = openStep ?? 0;
  const progressPct = Math.round(((currentStep + 1) / TOTAL_STEPS) * 100);
  const STEP_TITLES = ["Describe Short Film", "Set Cast & Environments", "Audio", "Storyboard", "Animate"];

  const characters = useMemo(() => entities.filter((e) => e.kind === "character"), [entities]);
  const environments = useMemo(() => entities.filter((e) => e.kind === "environment"), [entities]);
  const product = useMemo(() => entities.find((e) => e.kind === "product") ?? null, [entities]);

  const refreshSuggestions = async () => {
    const lg = logline.trim();
    if (lg.length < 8) return;
    setSuggestionsLoading(true);
    try {
      const next = await suggestFn({
        data: {
          logline: lg,
          lengthSec,
          style,
          hasCharacter: characters.some((c) => !!c.image),
          hasEnvironment: environments.some((e) => !!e.image),
          shotCount: concept?.beats.length ?? 0,
          keyframeCount: Object.values(keyframes).filter(Boolean).length,
          renderPathIds: RENDER_PATHS.map((p) => p.value),
        },
      });
      setSuggestions(next);
      if (!touched.length) setLengthSec(next.logline.recommendedLengthSec);
      if (!touched.style && next.logline.styleChips[0]) {
        setStyle(next.logline.styleChips[0]);
      }
    } catch (err) {
      console.error("[short-film] suggestions failed", err);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  // Seed handoff — if the workspace passes us an image, drop it on the first
  // character card (creating one if none exist yet).
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedAsset) return;
    if (seededRef.current === seedAsset.id) return;
    seededRef.current = seedAsset.id;
    if (seedAsset.mime?.startsWith("image/")) {
      setEntities((cur) => {
        const idx = cur.findIndex((e) => e.kind === "character");
        if (idx >= 0) {
          const next = [...cur];
          next[idx] = { ...next[idx], image: seedAsset };
          return next;
        }
        return [
          ...cur,
          {
            uid: newUid(),
            kind: "character",
            name: "Hero",
            description: "",
            image: seedAsset,
          },
        ];
      });
    }
    onSeedConsumed?.();
  }, [seedAsset, onSeedConsumed]);

  const briefReady = logline.trim().length >= 8;
  const conceptReady = !!concept;
  const allEntitiesHaveImages = entities.length > 0 && entities.every((e) => !!e.image);
  const anyEntityMissingImage = entities.some((e) => !e.image);

  // ── Brief analysis ──────────────────────────────────────────────
  const handleAnalyzeBrief = async () => {
    if (!briefReady) return;
    if (!requireAuth()) return;
    setAnalyzeError(null);
    setAnalyzing(true);
    try {
      const out = await analyzeFn({
        data: { logline: logline.trim(), lengthSec, style },
      });
      // Merge with anything the user already added: keep existing entities
      // by-name so edits aren't blown away, but add anything new from the
      // analysis.
      setEntities((cur) => {
        const byName = new Map(cur.map((e) => [`${e.kind}:${e.name.toLowerCase()}`, e]));
        const merged: Entity[] = [];
        for (const c of out.characters) {
          const k = `character:${c.name.toLowerCase()}`;
          const existing = byName.get(k);
          merged.push(
            existing
              ? { ...existing, description: existing.description || c.description }
              : { uid: newUid(), kind: "character", name: c.name, description: c.description, image: null },
          );
          byName.delete(k);
        }
        for (const e of out.environments) {
          const k = `environment:${e.name.toLowerCase()}`;
          const existing = byName.get(k);
          merged.push(
            existing
              ? { ...existing, description: existing.description || e.description }
              : { uid: newUid(), kind: "environment", name: e.name, description: e.description, image: null },
          );
          byName.delete(k);
        }
        if (out.product) {
          const k = `product:${out.product.name.toLowerCase()}`;
          const existing = byName.get(k);
          merged.push(
            existing
              ? { ...existing, description: existing.description || out.product.description }
              : { uid: newUid(), kind: "product", name: out.product.name, description: out.product.description, image: null },
          );
          byName.delete(k);
        }
        // Preserve any user-added entities the LLM didn't mention.
        for (const leftover of byName.values()) merged.push(leftover);
        return merged;
      });
      commitStep(0);
      // Materialize the project now so the Outputs column appears and the
      // project is named from the brief — no need to wait for the first render.
      try {
        const pid = onEnsureProject ? await onEnsureProject() : projectId;
        if (pid && pid !== "anonymous-draft") {
          void autoTitleFn({
            data: {
              id: pid,
              prompt: logline.trim(),
              appLabel: skill.label,
            },
          })
            .then(() => {
              void qc.invalidateQueries({ queryKey: ["v2-project", pid] });
              void qc.invalidateQueries({ queryKey: ["v2-projects"] });
              void qc.invalidateQueries({ queryKey: ["projects"] });
            })
            .catch((e) => console.warn("[short-film] auto-title failed", e));
        }
      } catch (e) {
        console.warn("[short-film] ensure project after brief failed", e);
      }
    } catch (err) {
      console.error("[short-film] analyze failed", err);
      setAnalyzeError(err instanceof Error ? err.message : "Couldn't analyze the brief.");
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Entity mutations ────────────────────────────────────────────
  const patchEntity = (uid: string, patch: Partial<Entity>) =>
    setEntities((cur) => cur.map((e) => (e.uid === uid ? { ...e, ...patch } : e)));
  const removeEntity = (uid: string) =>
    setEntities((cur) => cur.filter((e) => e.uid !== uid));
  const addEntity = (kind: EntityKind) =>
    setEntities((cur) => [
      ...cur,
      { uid: newUid(), kind, name: "", description: "", image: null },
    ]);

  // Import a character from the user's Library as a Cast entity. Copies the
  // name/description/image into a local entity and stashes the source id for
  // an eventual "update library copy" action.
  const importLibraryCharacter = (c: LibraryCharacter) => {
    setEntities((cur) => [
      ...cur,
      {
        uid: newUid(),
        kind: "character",
        name: c.name,
        description: c.description || c.backstory || "",
        image: c.imageUrl
          ? {
              id: `lib-${c.id}`,
              kind: "reference",
              mime: c.imageMime ?? "image/png",
              name: `${c.name}.png`,
              url: c.imageUrl,
            }
          : null,
        libraryCharacterId: c.id,
      },
    ]);
  };


  const handleGenerateEntity = async (uid: string) => {
    const entity = entities.find((e) => e.uid === uid);
    if (!entity) return;
    if (entity.description.trim().length < 4) {
      toast.error("Add a short description first (at least a few words) so we can generate a reference image.");
      return;
    }
    if (authLoading) {
      toast.message("Checking your session…");
      return;
    }
    if (!requireAuth()) return;
    patchEntity(uid, { generating: true });
    const runPrompt = `${ENTITY_META[entity.kind].label}: ${entity.name || entity.description.slice(0, 60)}`;
    try {
      const pid = onEnsureProject ? await onEnsureProject() : projectId;
      if (!pid || pid === "anonymous-draft") {
        throw new Error("Could not create a project to attach the reference image to.");
      }
      // Use any other already-resolved entity images of the same kind as
      // visual references, so e.g. a second character can borrow look-and-feel.
      const refs = entities
        .filter((e) => e.uid !== uid && e.image && e.kind === entity.kind)
        .map((e) => e.image!.url)
        .slice(0, 3);
      const asset = await refImageFn({
        data: {
          projectId: pid,
          kind: entity.kind,
          prompt: entity.description.trim().slice(0, 1200),
          style,
          aspect: ENTITY_META[entity.kind].aspect,
          referenceImageUrls: refs.length > 0 ? refs : undefined,
        },
      });
      patchEntity(uid, { image: asset, generating: false });
      tagOutput(asset.id, runPrompt);
    } catch (err) {
      console.error("[short-film] entity gen failed", err);
      patchEntity(uid, { generating: false });
      const msg = err instanceof Error ? err.message : "Reference image generation failed.";
      toast.error(msg);
    }
  };


  // Generate ref images for every entity that doesn't have one yet, in
  // parallel, then commit step 2. Refs are required to keep characters and
  // environments consistent across shots, so we auto-generate rather than
  // letting the user skip ahead.
  const [lockingRefs, setLockingRefs] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const handleContinueFromCast = async () => {
    if (entities.length === 0) return;
    if (!requireAuth()) return;
    setLockError(null);
    const missing = entities.filter((e) => !e.image);
    if (missing.length === 0) {
      maxStep > 2 ? applyEdit() : commitStep(1);
      return;
    }
    const incomplete = missing.filter((e) => e.description.trim().length < 4);
    if (incomplete.length > 0) {
      setLockError(
        `Add a short description for ${incomplete.map((e) => e.name || ENTITY_META[e.kind].label).join(", ")} so we can generate a reference image.`,
      );
      return;
    }
    setLockingRefs(true);
    try {
      await Promise.all(missing.map((e) => handleGenerateEntity(e.uid)));
      // Re-check using latest state on next tick via functional setState.
      setEntities((cur) => {
        const stillMissing = cur.some((e) => !e.image);
        if (!stillMissing) {
          maxStep > 2 ? applyEdit() : commitStep(1);
        } else {
          setLockError("Couldn't generate all reference images. Try again or upload your own.");
        }
        return cur;
      });
    } finally {
      setLockingRefs(false);
    }
  };

  const handleEntityPick = async (uid: string, result: PickerResult) => {
    if (result.kind === "library") {
      const first = result.assets[0];
      if (first) patchEntity(uid, { image: first });
      return;
    }
    const file = result.files[0];
    if (!file) return;
    patchEntity(uid, { uploading: true });
    try {
      const asset = await fileToProjectAsset(file, projectId);
      patchEntity(uid, { image: asset, uploading: false });
    } catch (err) {
      console.error("[short-film] entity upload failed", err);
      patchEntity(uid, { uploading: false });
    }
  };

  // ── Storyboard ──────────────────────────────────────────────────
  const handleWriteConcept = async () => {
    if (!briefReady) return;
    setConceptError(null);
    setWritingConcept(true);
    try {
      const toEntityPayload = (list: Entity[]): ShortFilmEntity[] =>
        list
          .filter((e) => e.name.trim().length > 0 && e.description.trim().length > 0)
          .map((e) => ({ name: e.name.trim(), description: e.description.trim() }));
      const out = await conceptFn({
        data: {
          logline: logline.trim(),
          lengthSec,
          style,
          cast: toEntityPayload(characters),
          setting: toEntityPayload(environments),
          product: product && product.name.trim() && product.description.trim()
            ? { name: product.name.trim(), description: product.description.trim() }
            : null,
          audioPlan: audioPlan.slice(0, 2000),
        },
      });
      setConcept(out);
      if (out.title?.trim() && projectId !== "anonymous-draft") {
        void updateStateFn({
          data: {
            id: projectId,
            patch: {
              meta: {
                title: out.title.trim(),
                format: "Short film",
                logline: logline.trim(),
                targetDuration: `${lengthSec}s`,
                aspectRatio: aspect,
              },
            },
          },
        }).then(() => {
          void qc.invalidateQueries({ queryKey: ["v2-projects"] });
          void qc.invalidateQueries({ queryKey: ["v2-project", projectId] });
        }).catch((err) => console.warn("[short-film] title update failed", err));
      }
      setMaxStep((m) => Math.max(m, 3));
    } catch (err) {
      console.error("[short-film] concept failed", err);
      setConceptError(err instanceof Error ? err.message : "Couldn't write the storyboard.");
    } finally {
      setWritingConcept(false);
    }
  };

  // Auto-write storyboard the moment the user lands on step 3.
  useEffect(() => {
    if (openStep === 2 && !concept && !writingConcept && !conceptError && briefReady) {
      void handleWriteConcept();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openStep]);

  // ── Per-shot keyframes ──────────────────────────────────────────
  const setBeatBusy = (i: number, v: boolean) =>
    setKeyframeBusy((cur) => ({ ...cur, [i]: v }));

  // Pick only the entities that this beat actually references (by name),
  // and return a parallel arrays of refs + a prompt suffix that labels each
  // reference image so the model knows which photo is which subject.
  // Falls back to all entities if no name match was found (e.g. unnamed beat).
  const buildBeatRefs = (beatText: string): { refs: string[]; suffix: string } => {
    const haystack = beatText.toLowerCase();
    const withImages = entities.filter((e) => !!e.image);
    const matched = withImages.filter((e) => {
      const n = e.name.trim().toLowerCase();
      if (!n) return false;
      // word-boundary-ish match to avoid partial collisions
      const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      return re.test(haystack);
    });
    const chosen = (matched.length > 0 ? matched : withImages).slice(0, 4);
    if (chosen.length === 0) return { refs: [], suffix: "" };
    const lines = chosen.map(
      (e, idx) =>
        `Reference image ${idx + 1} = ${e.name} (${e.kind}). Use it as the locked visual identity for ${e.name}.`,
    );
    return {
      refs: chosen.map((e) => e.image!.url),
      suffix: `\n\n${lines.join("\n")}`,
    };
  };

  const generateBeatKeyframe = async (i: number) => {
    if (!concept) return;
    const beat = concept.beats[i];
    if (!beat) return;
    setBeatBusy(i, true);
    try {
      const beatPrompt = [beat.camera ? `Shot: ${beat.camera}.` : null, beat.action]
        .filter(Boolean)
        .join(" ");
      const { refs, suffix } = buildBeatRefs(beatPrompt);
      const asset = await refImageFn({
        data: {
          projectId,
          kind: "keyframe",
          prompt: `${beatPrompt}${suffix}`.slice(0, 1200),
          style,
          aspect,
          referenceImageUrls: refs.length > 0 ? refs : undefined,
        },
      });
      setKeyframes((cur) => ({ ...cur, [i]: asset }));
      tagOutput(asset.id, `Shot ${i + 1} keyframe: ${beat.action.slice(0, 80)}`);
    } catch (err) {
      console.error("[short-film] keyframe gen failed", err);
    } finally {
      setBeatBusy(i, false);
    }
  };


  const clearBeatKeyframe = (i: number) =>
    setKeyframes((cur) => ({ ...cur, [i]: null }));

  const uploadBeatKeyframe = async (i: number, result: PickerResult) => {
    if (result.kind === "library") {
      const first = result.assets[0];
      if (first) setKeyframes((cur) => ({ ...cur, [i]: first }));
      return;
    }
    const file = result.files[0];
    if (!file) return;
    setBeatBusy(i, true);
    try {
      const asset = await fileToProjectAsset(file, projectId);
      setKeyframes((cur) => ({ ...cur, [i]: asset }));
    } finally {
      setBeatBusy(i, false);
    }
  };

  const generateAllKeyframes = async () => {
    if (!concept) return;
    setBulkKeyframeBusy(true);
    try {
      const tasks = concept.beats
        .map((_, i) => (keyframes[i] ? null : i))
        .filter((v): v is number => v !== null)
        .map((i) => generateBeatKeyframe(i));
      await Promise.all(tasks);
    } finally {
      setBulkKeyframeBusy(false);
    }
  };

  const clearAllKeyframes = () => setKeyframes({});

  const keyframeCount = useMemo(
    () => Object.values(keyframes).filter(Boolean).length,
    [keyframes],
  );

  const finalPrompt = useMemo(() => {
    if (!concept) return "";
    return composeShortFilmPrompt({ concept, style }).slice(0, 7800);
  }, [concept, style]);

  const handleProduce = async () => {
    if (!concept) {
      setError("Write the storyboard first.");
      return;
    }
    if (!requireAuth()) return;
    setError(null);
    const path = RENDER_PATHS.find((p) => p.value === renderPath)!;
    const isSeedance = renderPath === "seedance";

    // Seedance reference-to-video accepts up to 9 reference images and is
    // told which is which via @Image1..@ImageN tokens inside the prompt.
    // For Seedance we prefer the cast/setting/product refs (those are the
    // visual identities the model must lock to). Per-beat keyframes are
    // Kling-specific (used as first-frame seeds in i2v), so we don't pass
    // them as Seedance references.
    const entityRefs: Entity[] = entities.filter((e): e is Entity & { image: NonNullable<Entity["image"]> } => !!e.image);
    const refs: ProjectAsset[] = [];
    if (isSeedance) {
      for (const e of entityRefs.slice(0, 9)) refs.push(e.image!);
    } else {
      for (const e of entityRefs) refs.push(e.image!);
      const keyframeList = concept.beats.map((_, i) => keyframes[i] ?? null);
      for (const k of keyframeList) if (k) refs.push(k);
    }
    const model = refs.length > 0 ? path.modelI2V : path.model;
    const isSeedanceRef =
      isSeedance && model === "bytedance/seedance-2.0/reference-to-video";


    // Materialize a real project before any server fn call that needs a uuid.
    const pid = onEnsureProject ? await onEnsureProject() : projectId;
    if (!pid || pid === "anonymous-draft") {
      setError("Could not create a project to render into.");
      return;
    }

    if (concept.title?.trim()) {
      try {
        await updateStateFn({
          data: {
            id: pid,
            patch: {
              meta: {
                title: concept.title.trim(),
                format: "Short film",
                logline: logline.trim(),
                targetDuration: `${lengthSec}s`,
                aspectRatio: aspect,
              },
            },
          },
        });
        void qc.invalidateQueries({ queryKey: ["v2-projects"] });
        void qc.invalidateQueries({ queryKey: ["v2-project", pid] });
      } catch (err) {
        console.warn("[short-film] title update failed", err);
      }
    }

    const appendAssetToTimeline = async (assetId: string) => {
      try {
        const cur = await getProjectFn({ data: { id: pid } });
        const curOrder = cur?.project?.projectState?.timeline?.order ?? [];
        const sep = "::timeline-instance::";
        const uniq = newUid();
        const nextOrder = [...curOrder, `${assetId}${sep}${uniq}`];
        await updateStateFn({
          data: { id: pid, patch: { timeline: { order: nextOrder, seeded: true } } },
        });
        if (pid) {
          void qc.invalidateQueries({ queryKey: ["v2-project", pid] });
        }
      } catch (err) {
        console.error("[short-film] timeline append failed", err);
      }
    };

    // ── Kling: per-shot streaming into the timeline ─────────────────
    if (renderPath === "kling-cheap") {
      setKlingBusy(true);
      // Open the timeline immediately so clips appear as they finish.
      try {
        window.dispatchEvent(
          new CustomEvent("v2:open-timeline", { detail: { pid } }),
        );
      } catch {}

      const perShot = Math.max(5, Math.round(lengthSec / concept.beats.length));
      const klingDur: 5 | 10 = perShot <= 6 ? 5 : 10;

      const shotPromises = concept.beats.map(async (beat, i) => {
        // Ensure we have a keyframe (generate if the user didn't pick one).
        let kf = keyframes[i] ?? null;
        if (!kf) {
          setBeatBusy(i, true);
          try {
            const beatPrompt = [beat.camera ? `Shot: ${beat.camera}.` : null, beat.action]
              .filter(Boolean)
              .join(" ");
            const { refs: kRefs, suffix } = buildBeatRefs(beatPrompt);
            kf = await refImageFn({
              data: {
                pid,
                kind: "keyframe",
                prompt: `${beatPrompt}${suffix}`.slice(0, 1200),
                style,
                aspect,
                referenceImageUrls: kRefs.length > 0 ? kRefs : undefined,
              },
            });
            setKeyframes((cur) => ({ ...cur, [i]: kf! }));
            tagOutput(kf.id, `Shot ${i + 1} keyframe: ${beat.action.slice(0, 80)}`);
          } finally {
            setBeatBusy(i, false);
          }
        }


        const motionPrompt = [beat.camera ? `${beat.camera}.` : null, beat.action]
          .filter(Boolean)
          .join(" ");
        const shot = await klingShotFn({
          data: {
            pid,
            prompt: motionPrompt,
            imageUrl: kf!.url,
            durationSec: klingDur,
            aspect,
            label: `Shot ${i + 1}: ${beat.action.slice(0, 60)}`,
          },
        });
        await appendAssetToTimeline(shot.assetId);
        tagOutput(shot.assetId, `Shot ${i + 1}: ${beat.action.slice(0, 80)}`);
        return shot;
      });

      // Audio in parallel — appends as each track lands.
      const audioPromises: Array<Promise<unknown>> = [];
      if (audioMode === "voiceover") {
        const beatsWithText = concept.beats.filter(
          (b) => (b.voiceover ?? "").trim().length > 0,
        );
        if (beatsWithText.length > 0) {
          for (const b of beatsWithText) {
            audioPromises.push(
              ttsFn({
                data: {
                  pid,
                  text: (b.voiceover ?? "").trim().slice(0, 2000),
                  voice: "Rachel",
                },
              })
                .then((asset) => {
                  if (asset?.id) {
                    void appendAssetToTimeline(asset.id);
                    tagOutput(asset.id, `VO: ${(b.voiceover ?? "").slice(0, 80)}`);
                  }
                })
                .catch((err) => console.error("[short-film] vo failed", err)),
            );
          }
        } else if (concept.voiceoverScript.trim()) {
          audioPromises.push(
            ttsFn({
              data: {
                pid,
                text: concept.voiceoverScript.trim().slice(0, 2000),
                voice: "Rachel",
              },
            })
              .then((asset) => {
                if (asset?.id) {
                  void appendAssetToTimeline(asset.id);
                  tagOutput(asset.id, `VO: ${concept.voiceoverScript.slice(0, 80)}`);
                }
              })
              .catch((err) => console.error("[short-film] vo failed", err)),
          );
        }
      } else if (audioMode === "music" && concept.musicMood) {
        const dur = Math.max(10, Math.min(60, lengthSec));
        audioPromises.push(
          musicFn({
            data: {
              pid,
              prompt: concept.musicMood,
              durationSec: dur,
            },
          })
            .then((asset) => {
              if (asset?.id) {
                void appendAssetToTimeline(asset.id);
                tagOutput(asset.id, `Music: ${concept.musicMood.slice(0, 80)}`);
              }
            })
            .catch((err) => console.error("[short-film] music failed", err)),
        );
      }

      try {
        const results = await Promise.allSettled([
          ...shotPromises,
          ...audioPromises,
        ]);
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          setError(
            `${failed} part${failed === 1 ? "" : "s"} of the film failed — rest are on the timeline.`,
          );
          const firstErr = results.find(
            (r) => r.status === "rejected",
          ) as PromiseRejectedResult | undefined;
          if (firstErr) console.error("[short-film] kling shot failure", firstErr.reason);
        }
      } finally {
        setKlingBusy(false);
      }
      return;
    }

    // ── Seedance: one generation per beat, parallel cap 3 ───────────
    // Each beat gets its own Seedance 2.0 call (4-15s). All beats share
    // the SAME reference attachment set + identity-locking preamble so
    // characters, wardrobe, and environments stay consistent across cuts.
    // This lets the film exceed Seedance's per-clip 15s ceiling — e.g.
    // 6 beats × 10s = 60s film, 9 beats × 10s = 90s film.
    //
    // Seedance 2.0 generates audio natively per clip (dialogue + SFX,
    // and music when musicInSeedance is true on that beat). The planner
    // chooses per-act music routing: sustained scores spanning multiple
    // beats are generated as external musicTracks below and laid on the
    // timeline; short stingers / diegetic cues stay inside Seedance.
    setSeedanceBusy(true);
    setBeatsDone(0);
    setBeatsTotal(concept.beats.length);
    try {
      window.dispatchEvent(
        new CustomEvent("v2:open-timeline", { detail: { pid } }),
      );
    } catch {}

    // Per-beat duration: divide total film length across beats, clamp to
    // Seedance's 4-15s window. Default film length divides evenly.
    const perBeatRaw = Math.round(lengthSec / concept.beats.length);
    const perBeat = Math.max(4, Math.min(15, perBeatRaw || 10));

    // Reference legend — identical across every beat. This is what locks
    // identities across the film. We pass the same image_urls on every
    // call too.
    const refUrls = refs.map((r) => r.url).slice(0, 9);
    const refEntities: Entity[] = isSeedanceRef ? entityRefs.slice(0, 9) : [];

    const legend = isSeedanceRef && refEntities.length > 0
      ? `Reference legend — keep these identities consistent in every shot, do not redesign them:\n${refEntities
          .map((e, i) => {
            const label = ENTITY_META[e.kind].label;
            const name = e.name?.trim() || label;
            return `@Image${i + 1} = ${name} (${label.toLowerCase()})`;
          })
          .join("\n")}\n\n`
      : "";

    // Shared style/character preamble (same on every beat).
    const sharedPreamble = [
      style ? `Style: ${style}.` : null,
      concept.title ? `Title: ${concept.title}.` : null,
      `Characters: ${concept.characterDesc}`,
      `Environment: ${concept.environmentDesc}`,
    ]
      .filter(Boolean)
      .join("\n");

    const N = concept.beats.length;
    const buildBeatPrompt = (i: number): string => {
      const b = concept.beats[i];
      const beatSec = b.durationSec ?? perBeat;
      const beatTitle = b.title?.trim() || b.action.slice(0, 60);
      const parts: string[] = [];

      // Identity + style preamble (identical on every beat).
      parts.push(legend + sharedPreamble);
      parts.push("");
      parts.push(`BEAT ${i + 1} OF ${N}  (${beatSec}s)  — "${beatTitle}"`);

      if (b.setting?.trim()) parts.push(`Setting: ${b.setting.trim()}`);
      if (b.lighting?.trim()) parts.push(`Lighting: ${b.lighting.trim()}`);
      if (b.wardrobeContinuity?.trim()) parts.push(`Wardrobe continuity: ${b.wardrobeContinuity.trim()}`);

      // Shots — rich path when present, else fall back to legacy camera+action.
      if (b.shots && b.shots.length > 0) {
        parts.push("");
        b.shots.forEach((s, si) => {
          const head = `SHOT ${si + 1}  ${s.timecode}  — ${s.framing}${s.cameraMove ? `, ${s.cameraMove}` : ""}.`;
          parts.push(head);
          if (s.action?.trim()) parts.push(s.action.trim());
        });
      } else {
        parts.push("");
        parts.push(`SHOT 1  0.0-${beatSec}.0s  — ${b.camera || "continuous take"}.`);
        if (b.action?.trim()) parts.push(b.action.trim());
      }

      // Dialogue — attributed + delivery cues when available.
      const dialogue = b.dialogue && b.dialogue.length > 0
        ? b.dialogue
        : (b.voiceover && b.voiceover.trim()
            ? [{ speaker: audioSelected.talking ? "Speaker" : "Narrator", line: b.voiceover.trim() }]
            : []);
      if (dialogue.length > 0) {
        parts.push("");
        parts.push(audioSelected.talking
          ? "DIALOGUE (spoken on-screen, lip-synced):"
          : "VOICEOVER (off-screen narration):");
        for (const d of dialogue) {
          const delivery = d.delivery?.trim() ? ` (${d.delivery.trim()})` : "";
          parts.push(`${d.speaker}${delivery}: "${d.line.trim()}"`);
        }
      }

      if (b.sfx?.trim()) parts.push(`SFX: ${b.sfx.trim()}`);
      // Music routing: only bake music into this Seedance clip when the
      // beat is flagged for it. Otherwise tell Seedance to skip music —
      // an external track from concept.musicTracks will cover this beat.
      const bakeMusic = b.musicInSeedance !== false;
      if (bakeMusic && b.musicCue?.trim()) {
        parts.push(`MUSIC: ${b.musicCue.trim()}`);
      } else if (!bakeMusic) {
        parts.push(
          "MUSIC: none in this clip — deliver dialogue and diegetic SFX only. Score will be added in post.",
        );
      }

      return parts.join("\n").slice(0, 7800);
    };

    // Concurrency-capped fan-out. Each beat first drops a "pending"
    // placeholder into the timeline (visible spinner card in Outputs +
    // grey clip on the timeline), then renders, then atomically swaps
    // the placeholder for the real video. On failure the placeholder is
    // dropped so nothing fake is left behind. Timeline-mutating calls
    // are serialized through a tiny mutex so parallel workers don't
    // clobber each other's order updates.
    const CONCURRENCY = 3;
    const failedBeats: number[] = [];
    let nextIdx = 0;
    let timelineMutex: Promise<unknown> = Promise.resolve();
    const withTimelineMutex = <T,>(fn: () => Promise<T>): Promise<T> => {
      const run = timelineMutex.then(fn, fn);
      // Swallow rejection on the chain so future calls still run.
      timelineMutex = run.catch(() => undefined);
      return run;
    };

    const worker = async () => {
      while (true) {
        const i = nextIdx++;
        if (i >= N) return;
        const beat = concept.beats[i];
        const beatLabel = `Beat ${i + 1}: ${beat.action.slice(0, 60)}`;
        // 1. Reserve a placeholder slot on the timeline.
        let placeholderId: string | null = null;
        try {
          const ph = await withTimelineMutex(() =>
            createPlaceholderFn({
              data: { projectId: pid, label: beatLabel, durationSec: perBeat },
            }),
          );
          placeholderId = ph.placeholderId;
          if (pid) void qc.invalidateQueries({ queryKey: ["v2-project", pid] });
        } catch (err) {
          console.error(`[short-film] beat ${i + 1} placeholder failed`, err);
        }
        // 2. Render the beat — submit to fal queue, then poll until
        //    completed (or failed). Single content-policy retry with a
        //    sanitized prompt is driven from the client so a single
        //    HTTP request never sits open for the multi-minute render.
        try {
          const startBody = (prompt: string) => ({
            projectId: pid,
            prompt,
            durationSec: perBeat,
            referenceImageUrls: refUrls.length > 0 ? refUrls : undefined,
            generateAudio: anyAudio,
            aspect,
            resolution: "1080p" as const,
          });
          const sanitize = (p: string) =>
            `Wholesome cinematic scene. ${p
              .replace(
                /\b(nude|naked|topless|sexy|sensual|violent|blood|gore|kill|gun|weapon)\b/gi,
                "",
              )
              .trim()}. Family-friendly, no contact, no chaos, tasteful framing.`;

          // Retry policy: up to 3 total attempts per beat. Content-
          // policy failures get a sanitized prompt; transient failures
          // (timeouts, fal queue errors, generic "failed") just
          // re-submit the same prompt after a short backoff. The 25-min
          // poll deadline applies per attempt.
          const MAX_ATTEMPTS = 3;
          let attempt = 0;
          let attemptedSafe = false;
          let started = await startBeatFn({
            data: { ...startBody(buildBeatPrompt(i)) },
          });
          attempt = 1;
          let out:
            | {
                status: "completed";
                assetId: string;
                assetUrl: string;
                mime: string;
                durationSec: number;
              }
            | null = null;
          let lastError: string | null = null;
          retryLoop: while (attempt <= MAX_ATTEMPTS) {
            const deadline = Date.now() + 25 * 60_000;
            while (Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, 5000));
              const res = await pollBeatFn({
                data: {
                  projectId: pid,
                  statusUrl: started.statusUrl,
                  responseUrl: started.responseUrl,
                  durationSec: perBeat,
                  label: beatLabel,
                },
              });
              if (res.status === "completed") {
                out = res;
                break retryLoop;
              }
              if (res.status === "failed") {
                lastError = res.error ?? "Seedance beat failed";
                const isPolicy =
                  /content_policy|partner_validation|sensitive/i.test(lastError);
                if (attempt >= MAX_ATTEMPTS) break retryLoop;
                // Backoff before re-submitting.
                await new Promise((r) => setTimeout(r, 4000));
                if (isPolicy && !attemptedSafe) {
                  attemptedSafe = true;
                  started = await startBeatFn({
                    data: startBody(sanitize(buildBeatPrompt(i))),
                  });
                } else {
                  started = await startBeatFn({
                    data: { ...startBody(buildBeatPrompt(i)) },
                  });
                }
                attempt += 1;
                console.warn(
                  `[short-film] beat ${i + 1} attempt ${attempt}/${MAX_ATTEMPTS} after error: ${lastError}`,
                );
                break; // exit inner poll, outer loop starts a fresh poll cycle
              }
              // status === "pending" → keep polling
            }
            // Loop fell through the inner while without breaking: timed out.
            if (Date.now() >= deadline && !out) {
              lastError = "Seedance beat timed out after 25 minutes";
              if (attempt >= MAX_ATTEMPTS) break retryLoop;
              await new Promise((r) => setTimeout(r, 4000));
              started = await startBeatFn({
                data: { ...startBody(buildBeatPrompt(i)) },
              });
              attempt += 1;
              console.warn(
                `[short-film] beat ${i + 1} attempt ${attempt}/${MAX_ATTEMPTS} after timeout`,
              );
            }
          }
          if (!out) throw new Error(lastError ?? "Seedance beat failed");


          // 3. Swap placeholder → real asset (or append directly if the
          // placeholder couldn't be created).
          if (placeholderId) {
            await withTimelineMutex(() =>
              finalizePlaceholderFn({
                data: {
                  projectId: pid,
                  placeholderId: placeholderId!,
                  realAssetId: out!.assetId,
                },
              }),
            );
          } else {
            await withTimelineMutex(() => appendAssetToTimeline(out!.assetId));
          }
          tagOutput(out.assetId, `Beat ${i + 1}: ${beat.action.slice(0, 80)}`);
          if (pid) void qc.invalidateQueries({ queryKey: ["v2-project", pid] });
        } catch (err) {
          failedBeats.push(i + 1);
          console.error(`[short-film] beat ${i + 1} failed`, err);
          // Clean up the placeholder so users don't see a stuck
          // spinner — they'll see the failure summary instead.
          if (placeholderId) {
            try {
              await withTimelineMutex(() =>
                finalizePlaceholderFn({
                  data: {
                    projectId: pid,
                    placeholderId: placeholderId!,
                    realAssetId: null,
                  },
                }),
              );
              if (pid) void qc.invalidateQueries({ queryKey: ["v2-project", pid] });
            } catch (cleanupErr) {
              console.error(`[short-film] beat ${i + 1} cleanup failed`, cleanupErr);
            }
          }
        } finally {
          setBeatsDone((d) => d + 1);
        }
      }
    };

    try {
      const workers = Array.from(
        { length: Math.min(CONCURRENCY, N) },
        () => worker(),
      );

      // External music tracks — run in parallel with the Seedance fan-out.
      // The planner decides per-act whether music is baked into Seedance
      // or generated separately and laid on the timeline. Beats whose
      // musicInSeedance===false are covered by these tracks.
      const musicJobs: Promise<unknown>[] = [];
      const externalTracks = (concept.musicTracks ?? []).filter(
        (t) => t.prompt?.trim() && t.durationSec >= 8,
      );
      for (const track of externalTracks) {
        const dur = Math.max(8, Math.min(60, Math.round(track.durationSec)));
        musicJobs.push(
          musicFn({
            data: {
              pid,
              prompt: track.prompt.trim().slice(0, 400),
              durationSec: dur,
            },
          })
            .then((asset) => {
              if (asset?.id) {
                void withTimelineMutex(() => appendAssetToTimeline(asset.id));
                tagOutput(
                  asset.id,
                  `Music — ${track.label || `beats ${track.beatStart}-${track.beatEnd}`}`,
                );
              }
            })
            .catch((err) =>
              console.error(`[short-film] external music track failed`, track.label, err),
            ),
        );
      }

      await Promise.all([...workers, ...musicJobs]);
      if (failedBeats.length === N) {
        setError("Every beat failed. Check the logs or try a different prompt.");
      } else if (failedBeats.length > 0) {
        setError(
          `Beat${failedBeats.length === 1 ? "" : "s"} ${failedBeats.join(", ")} failed — the rest are on the timeline. You can regenerate the missing beats from the storyboard.`,
        );
      }
    } finally {
      setSeedanceBusy(false);
    }
  };


  // ── Summaries ───────────────────────────────────────────────────
  const summarize = (s: string, n = 70) =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
  const loglineSummary = logline.trim()
    ? `${lengthSec}s · ${style} · ${summarize(logline.trim())}`
    : "Tell us what the film is about";

  const castSummary = (() => {
    if (entities.length === 0) return "Analyze the brief to extract the cast";
    const lockedCount = entities.filter((e) => !!e.image).length;
    const parts: string[] = [];
    if (characters.length) parts.push(`${characters.length} ${characters.length === 1 ? "character" : "characters"}`);
    if (environments.length) parts.push(`${environments.length} ${environments.length === 1 ? "setting" : "settings"}`);
    if (product) parts.push("product");
    return `${parts.join(" · ")} · ${lockedCount}/${entities.length} refs locked`;
  })();

  const storyboardSummary = concept
    ? `${summarize(concept.title || `${concept.beats.length} shots`)}${keyframeCount > 0 ? ` · ${keyframeCount}/${concept.beats.length} keyframes` : ""}`
    : "Write the storyboard from your brief";
  const renderLabel = RENDER_PATHS.find((p) => p.value === renderPath)?.label ?? renderPath;
  const audioLabel = anyAudio
    ? AUDIO_OPTIONS.filter((o) => audioSelected[o.value]).map((o) => o.label).join(" + ")
    : "Silent";

  return (
    <div className="flex flex-col gap-3">
      {/* Subtle step progress */}
      <div className="px-1">
        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            {currentStep > 0 ? (
              <button
                type="button"
                onClick={() => goBack(currentStep)}
                aria-label="Back"
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" />
              </button>
            ) : null}
            <span>Step {currentStep + 1} of {TOTAL_STEPS}</span>
          </div>
          
        </div>
        <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-foreground/70 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* 1. Logline */}
      <Section
        title="Describe Short Film"
        stepLabel={`Step 1 of ${TOTAL_STEPS}`}
        stepNumber={1}
        done={briefReady}
        active={openStep === 0}
        cta={
          <Button
            type="button"
            onClick={() => void handleAnalyzeBrief()}
            disabled={!briefReady || analyzing}
            className="h-12 w-full max-w-xs rounded-md text-base font-semibold shadow-none"
          >
            {analyzing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing brief…</>
            ) : entities.length > 0 ? (
              <>Re-analyze brief</>
            ) : (
              <>Next</>
            )}
          </Button>
        }
      >
        <AppTextarea
          value={logline}
          onChange={(e) => setLogline(e.target.value)}
          placeholder="A lonely lighthouse keeper finds a message in a bottle that changes her life."
          rows={3}
        />
        <div className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">Length</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {LENGTHS.find((l) => l.value === lengthSec)?.label ?? `${lengthSec}s`}
              {suggestions && !touched.length && suggestions.logline.recommendedLengthSec === lengthSec ? (
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">★ recommended</span>
              ) : null}
            </span>
          </div>
          <Slider
            min={0}
            max={LENGTHS.length - 1}
            step={1}
            value={[Math.max(0, LENGTHS.findIndex((l) => l.value === lengthSec))]}
            onValueChange={([i]) => {
              const next = LENGTHS[i];
              if (next) { setLengthSec(next.value); setTouched((t) => ({ ...t, length: true })); }
            }}
            className="py-2"
          />
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Style</span>
            {suggestionsLoading ? <Loader2 className="h-3 w-3 animate-spin opacity-60" /> : null}
            {suggestions ? <span className="opacity-60">· tailored to your logline</span> : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(suggestions?.logline.styleChips ?? (STYLES as readonly string[])).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setStyle(s); setTouched((t) => ({ ...t, style: true })); }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition",
                  style === s
                    ? "border-foreground bg-foreground text-background"
                    : "border-hairline text-muted-foreground hover:text-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Aspect ratio</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ASPECTS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => setAspect(a.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition",
                  aspect === a.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-hairline text-muted-foreground hover:text-foreground",
                )}
              >
                {a.label} <span className="opacity-60">· {a.hint}</span>
              </button>
            ))}
          </div>
        </div>
        {analyzeError && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {analyzeError}
          </div>
        )}
      </Section>

      {/* 2. Cast & Setting */}
      <Section
        title="Set Cast & Environments"
        stepLabel={`Step 2 of ${TOTAL_STEPS}`}
        stepNumber={2}
        hint={undefined}
        done={allEntitiesHaveImages && entities.length > 0}
        active={openStep === 1}
        onBack={() => goBack(1)}
        cta={
          <Button
            type="button"
            onClick={() => void handleContinueFromCast()}
            disabled={entities.length === 0 || lockingRefs}
            className="h-12 w-full max-w-xs rounded-md text-base font-semibold shadow-none"
          >
            {lockingRefs ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Locking refs…</>
            ) : maxStep > 2 ? (
              "Update"
            ) : anyEntityMissingImage ? (
              "Lock refs & continue"
            ) : (
              "Continue"
            )}
          </Button>
        }
      >
        <p className="text-[11px] text-muted-foreground">
          Edit names and descriptions. Any entity without a reference image will be generated automatically when you continue.
        </p>
        {lockError && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{lockError}</span>
          </div>
        )}
        <div className="mt-3 space-y-2">
          {entities.map((e) => (
            <EntityCard
              key={e.uid}
              entity={e}
              projectId={projectId}
              canGenerate={!!style}
              onPatch={(patch) => patchEntity(e.uid, patch)}
              onGenerate={() => void handleGenerateEntity(e.uid)}
              onUpload={() => setEntityPickerFor(e.uid)}
              onRemove={() => removeEntity(e.uid)}
              onPickFromLibrary={
                e.kind === "character"
                  ? () => setCharLibraryOpen(true)
                  : undefined
              }
            />
          ))}
          {entities.length === 0 && (
            <div className="rounded-md border border-dashed border-hairline bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
              {analyzing ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Analyzing…</span>
              ) : (
                <>No cast yet. Hit <span className="font-medium text-foreground">Next</span> above, or add entities manually below.</>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCharLibraryOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-foreground/40 bg-foreground/5 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-foreground/10"
          >
            <Plus className="h-3 w-3" /> Add character
          </button>
          <button
            type="button"
            onClick={() => addEntity("environment")}
            className="inline-flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> Environment
          </button>
          {!product && (
            <button
              type="button"
              onClick={() => addEntity("product")}
              className="inline-flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Product
            </button>
          )}
        </div>
        <AssetPickerDialog
          open={entityPickerFor !== null}
          onOpenChange={(o) => { if (!o) setEntityPickerFor(null); }}
          accept="image"
          onPick={(r) => {
            const uid = entityPickerFor;
            setEntityPickerFor(null);
            if (uid) void handleEntityPick(uid, r);
          }}
        />
        <CharacterPickerDialog
          open={charLibraryOpen}
          onOpenChange={setCharLibraryOpen}
          onPick={(c) => importLibraryCharacter(c)}
        />

      </Section>

      {/* 3. Audio */}
      <Section
        title="Audio"
        stepLabel={`Step 3 of ${TOTAL_STEPS}`}
        stepNumber={3}
        done={maxStep > 2}
        active={openStep === 2}
        onBack={() => goBack(2)}
        cta={
          <Button
            type="button"
            onClick={() => (maxStep > 3 ? applyEdit() : commitStep(2))}
            className="h-12 w-full max-w-xs rounded-md text-base font-semibold shadow-none"
          >
            {maxStep > 3 ? "Update" : "Continue"}
          </Button>
        }
      >
        <p className="mb-3 text-[11px] text-muted-foreground">
          Pick any combination — or leave them all unchecked for a silent film.
          Your choices shape the dialogue and pacing of the storyboard.
        </p>
        <div className="space-y-2">
          {AUDIO_OPTIONS.filter(
            (o) => !(o.value === "voiceover" && suggestions?.audio.voEnabled === false),
          ).map((o) => {
            const checked = audioSelected[o.value];
            return (
              <div
                key={o.value}
                className={cn(
                  "rounded-md border border-hairline bg-background p-3 transition",
                  checked && "border-primary/60 ring-1 ring-primary/30",
                )}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAudio(o.value)}
                    className="mt-0.5 accent-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {o.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {o.hint}
                    </div>
                  </div>
                </label>
                {checked && (
                  <AppTextarea
                    value={audioNotes[o.value]}
                    onChange={(e) => setAudioNote(o.value, e.target.value)}
                    placeholder={o.notePlaceholder}
                    rows={2}
                    className="mt-3"
                  />
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* 4. Storyboard */}
      <Section
        title="Storyboard"
        stepLabel={`Step 4 of ${TOTAL_STEPS}`}
        stepNumber={4}
        hint={concept ? "editable" : undefined}
        done={!!concept && maxStep > 3}
        active={openStep === 3}
        onBack={() => goBack(3)}
        cta={
          <>
            <button
              type="button"
              onClick={() => void handleWriteConcept()}
              disabled={writingConcept}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              {writingConcept ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {concept ? "Regenerate" : "Write"}
            </button>
            <Button
              type="button"
              onClick={() => {
                if (!concept) { void handleWriteConcept(); return; }
                maxStep > 4 ? applyEdit() : commitStep(3);
              }}
              disabled={writingConcept}
              className="h-12 w-full max-w-xs rounded-md text-base font-semibold shadow-none"
            >
              {writingConcept ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Writing…</>
              ) : !concept ? (
                <>Write the storyboard</>
              ) : maxStep > 4 ? (
                <>Update</>
              ) : (
                <>Continue</>
              )}
            </Button>
          </>
        }
      >
        {!concept && !writingConcept && (
          <p className="text-xs text-muted-foreground">
            We'll generate a 3–5 shot storyboard from your logline and the cast
            you locked above. Each shot can get an optional first-frame
            reference (a keyframe) for tighter control.
          </p>
        )}
        {concept && (
          <div className="space-y-3">
            <input
              value={concept.title}
              onChange={(e) => setConcept({ ...concept, title: e.target.value })}
              className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-primary"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-hairline bg-muted/20 px-3 py-2">
              <div className="min-w-0 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">First frames</span>
                {" · "}
                Optional — leave empty to let the model frame the shot.
                {keyframeCount > 0 ? (
                  <span className="ml-1 text-foreground">
                    ({keyframeCount}/{concept.beats.length} set)
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void generateAllKeyframes()}
                  disabled={bulkKeyframeBusy || !conceptReady}
                  className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-[11px] text-foreground hover:bg-muted disabled:opacity-60"
                >
                  {bulkKeyframeBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Generate all
                </button>
                {keyframeCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearAllKeyframes}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              {concept.beats.map((b, i) => (
                <div key={i} className="rounded-md border border-hairline bg-background p-2.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      Shot {i + 1}
                      {suggestions?.storyboard.perBeat[i]?.keyframeRecommended && !keyframes[i] ? (
                        <span
                          title={suggestions.storyboard.perBeat[i]?.keyframeReason ?? "Recommended for this shot"}
                          className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-primary"
                        >
                          keyframe recommended
                        </span>
                      ) : null}
                    </span>
                    <input
                      value={b.timecode}
                      onChange={(e) => {
                        const beats = [...concept.beats];
                        beats[i] = { ...beats[i], timecode: e.target.value };
                        setConcept({ ...concept, beats });
                      }}
                      className="w-24 bg-transparent text-right text-[10px] uppercase tracking-wide text-muted-foreground/60 outline-none"
                    />
                  </div>

                  <div className="mt-1 flex gap-2.5">
                    <BeatKeyframeSlot
                      asset={keyframes[i] ?? null}
                      busy={!!keyframeBusy[i]}
                      onGenerate={() => void generateBeatKeyframe(i)}
                      onUpload={() => setKeyframePickerFor(i)}
                      onClear={() => clearBeatKeyframe(i)}
                      canGenerate={conceptReady}
                    />
                    <div className="min-w-0 flex-1">
                      <input
                        value={b.camera}
                        onChange={(e) => {
                          const beats = [...concept.beats];
                          beats[i] = { ...beats[i], camera: e.target.value };
                          setConcept({ ...concept, beats });
                        }}
                        placeholder="Camera"
                        className="w-full bg-transparent text-xs italic text-muted-foreground outline-none"
                      />
                      <textarea
                        value={b.action}
                        onChange={(e) => {
                          const beats = [...concept.beats];
                          beats[i] = { ...beats[i], action: e.target.value };
                          setConcept({ ...concept, beats });
                        }}
                        rows={2}
                        className="mt-1 w-full resize-none bg-transparent text-sm text-foreground outline-none"
                      />
                      {b.voiceover !== undefined ? (
                        <input
                          value={b.voiceover}
                          onChange={(e) => {
                            const beats = [...concept.beats];
                            beats[i] = { ...beats[i], voiceover: e.target.value };
                            setConcept({ ...concept, beats });
                          }}
                          placeholder="Voiceover (optional)"
                          className="mt-1 w-full bg-transparent text-xs italic text-muted-foreground outline-none"
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <AssetPickerDialog
              open={keyframePickerFor !== null}
              onOpenChange={(o) => { if (!o) setKeyframePickerFor(null); }}
              accept="image"
              onPick={(r) => {
                const i = keyframePickerFor;
                setKeyframePickerFor(null);
                if (i !== null) void uploadBeatKeyframe(i, r);
              }}
            />
          </div>
        )}
        {conceptError && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {conceptError}
          </div>
        )}
      </Section>


      {/* 5. Animate scene + Produce */}
      <Section
        title="Animate scene"
        stepLabel={`Step 5 of ${TOTAL_STEPS}`}
        stepNumber={5}
        done={maxStep > 4}
        active={openStep === 4}
        onBack={() => goBack(4)}
        cta={
          <Button
            type="button"
            onClick={() => void handleProduce()}
            disabled={!conceptReady || busy || sideRunBusy || klingBusy || seedanceBusy}
            className="h-12 w-full max-w-xs rounded-md text-base font-semibold shadow-none"
          >
            {(klingBusy || seedanceBusy) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {seedanceBusy
              ? `Rendering beat ${Math.min(beatsDone + 1, beatsTotal)} of ${beatsTotal}…`
              : klingBusy
              ? `Rendering ${concept?.beats.length ?? 0} shots…`
              : "Generate"}
          </Button>

        }
      >
        <div className="space-y-2">
          {(() => {
            const order = suggestions?.animate.pathOrder;
            const sorted = order
              ? [...RENDER_PATHS].sort((a, b) => {
                  const ia = order.indexOf(a.value);
                  const ib = order.indexOf(b.value);
                  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
                })
              : RENDER_PATHS;
            const recId = suggestions?.animate.recommendedPathId;
            return sorted.map((p) => (
              <label
                key={p.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border border-hairline bg-background p-3 transition hover:border-primary/40",
                  renderPath === p.value && "border-primary/60 ring-1 ring-primary/30",
                  p.disabled && "cursor-not-allowed opacity-50 hover:border-hairline",
                )}
              >
                <input
                  type="radio"
                  name="render-path"
                  value={p.value}
                  checked={renderPath === p.value}
                  disabled={p.disabled}
                  onChange={() => !p.disabled && setRenderPath(p.value)}
                  className="mt-0.5 accent-foreground"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {p.label}
                    {recId === p.value ? (
                      <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                        Recommended
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{p.hint}</div>
                  {recId === p.value && suggestions?.animate.reason ? (
                    <div className="mt-1 text-[11px] italic text-muted-foreground">{suggestions.animate.reason}</div>
                  ) : null}
                </div>
              </label>
            ));
          })()}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          We'll render with {renderLabel}
          {renderPath === "seedance"
            ? `, one generation per beat (${concept?.beats.length ?? 0} beats, ~${concept ? Math.max(4, Math.min(15, Math.round(lengthSec / Math.max(1, concept.beats.length)))) : 10}s each, up to 3 in parallel)${audioMode !== "silent" ? ", with audio baked into each beat natively" : ""}.`
            : audioMode !== "silent"
            ? `, plus ${audioMode === "voiceover" ? "a voiceover" : "a music bed"} in parallel.`
            : "."}
          {" "}Beats land in Outputs and the timeline as they finish.
        </p>


        {error && (
          <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </Section>

    </div>
  );
}

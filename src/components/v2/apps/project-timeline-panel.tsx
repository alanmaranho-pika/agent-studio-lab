import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Copy,
  LayoutGrid,
  List,
  Loader2,
  Maximize2,
  PanelRightClose,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Share2,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getProject,
  updateProjectState,
  attachLibraryAssetToProject,
  useLocalProjectFn,
} from "@/lib/local-projects";
import { deriveTracks, type ProjectAsset, type TimelineTrack, type TimelineTrim } from "@/lib/project-state";
import { SKILLS, type Skill } from "@/lib/skills";
import { getRecipeForSkill } from "@/lib/app-recipes";
import { getAppSwatch } from "@/lib/app-swatch";
import { cn } from "@/lib/utils";
import { stableAssetUrl } from "@/lib/v2/stable-asset-url";
import { AssetActionsBody } from "@/components/v2/apps/asset-actions-menu";
import { LibraryPickerModal } from "@/components/v2/library-picker-modal";
import { ExportDialog } from "@/components/v2/apps/export-dialog";
import { shareToCommunity } from "@/lib/community.functions";
import { startExport, getExportStatus } from "@/lib/export.functions";
import type { TimelineIntent } from "@/components/v2/apps/apps-workspace";

const CLIP_SECONDS = 5;
const TIMELINE_INSTANCE_SEP = "::timeline-instance::";
const DETACHED_AUDIO_SUFFIX = "::audio";

function makeTimelineRef(assetId: string) {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${assetId}${TIMELINE_INSTANCE_SEP}${id}`;
}

function isDetachedAudioRef(ref: string) {
  return ref.endsWith(DETACHED_AUDIO_SUFFIX);
}

function makeDetachedAudioRef(sourceRef: string) {
  return `${sourceRef}${DETACHED_AUDIO_SUFFIX}`;
}

function assetIdFromTimelineRef(ref: string) {
  return ref.includes(TIMELINE_INSTANCE_SEP)
    ? ref.split(TIMELINE_INSTANCE_SEP)[0]
    : ref;
}

function timelineRefAssetId(refOrAssetId: string, existingRefs: string[]) {
  return existingRefs.includes(refOrAssetId)
    ? assetIdFromTimelineRef(refOrAssetId)
    : refOrAssetId;
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Apps whose upload step accepts a given media kind (for "Edit with app").
function appsAcceptingKind(want: "image" | "video" | "audio"): Skill[] {
  return SKILLS.filter((s) => {
    const upload = getRecipeForSkill(s).steps.find((st) => st.kind === "upload");
    if (!upload) return false;
    return upload.accept === want || upload.accept === "any";
  });
}

// Apps that PRODUCE a given media kind (for "Add clip / Add audio").
function appsProducingKind(want: "visual" | "audio"): Skill[] {
  return SKILLS.filter((s) => {
    if (want === "audio") return s.kind === "audio" || s.kind === "speech";
    return s.kind === "image" || s.kind === "video";
  });
}

// Deterministic decorative waveform.
function fakeWave(seed: string, bars = 80): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const v = ((h >>> 8) % 100) / 100;
    const env = 0.35 + 0.55 * Math.sin((i / bars) * Math.PI);
    out.push(0.2 + v * 0.8 * env);
  }
  return out;
}

function AppPickerList({
  apps,
  onPick,
}: {
  apps: Skill[];
  onPick: (s: Skill) => void;
}) {
  if (apps.length === 0) {
    return (
      <p className="px-2 py-3 text-xs text-muted-foreground">
        No matching apps.
      </p>
    );
  }
  return (
    <div className="max-h-[60vh] overflow-y-auto">
      {apps.map((s) => {
        const Icon = s.icon;
        const sw = getAppSwatch(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-muted"
          >
            <div
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md"
              style={{ backgroundColor: sw.bg, color: sw.fg }}
            >
              <Icon className="h-3 w-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{s.label}</div>
              <div className="line-clamp-1 text-[10px] text-muted-foreground">
                {s.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export type TimelinePanelActions = {
  share: () => void;
  openExport: () => void;
  sharing: boolean;
  canShare: boolean;
  canExport: boolean;
};

export function ProjectTimelinePanel({
  projectId,
  onClose,
  onUseInApp,
  hideHeader,
  hideClose,
  actionsRef,
}: {
  projectId?: string;
  onClose: () => void;
  onUseInApp?: (args: {
    skill: Skill;
    asset: ProjectAsset | null;
    intent?: TimelineIntent;
  }) => void;
  hideHeader?: boolean;
  hideClose?: boolean;
  actionsRef?: Ref<TimelinePanelActions | null>;
}) {
  const qc = useQueryClient();
  const fetchProject = useLocalProjectFn(getProject);
  const updateState = useLocalProjectFn(updateProjectState);
  const attachLibrary = useLocalProjectFn(attachLibraryAssetToProject);
  const [libraryPickerFor, setLibraryPickerFor] = useState<
    null | { kind: "visual" | "audio"; trackId?: string }
  >(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareFn = useServerFn(shareToCommunity);
  const startExportFn = useServerFn(startExport);
  const exportStatusFn = useServerFn(getExportStatus);
  const projectQ = useQuery({
    queryKey: ["v2-project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId! } }),
    enabled: !!projectId && projectId !== "anonymous-draft",
  });

  const serverAssets = projectQ.data?.assets ?? [];
  const timeline = projectQ.data?.project?.projectState?.timeline;

  // Allowlist semantics: only assets whose ids appear in `order` are shown.
  const assetsById = useMemo(
    () => new Map(serverAssets.map((a) => [a.id, a] as const)),
    [serverAssets],
  );

  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [localTrims, setLocalTrims] = useState<Record<string, TimelineTrim> | null>(null);
  const [localVolumes, setLocalVolumes] = useState<Record<string, number> | null>(null);
  const [localVideoMuted, setLocalVideoMuted] = useState<Record<string, boolean> | null>(null);

  // Seed timeline with all existing project assets the first time it's
  // opened. After this, only outputs from apps invoked from the timeline
  // (via the popovers) are added automatically.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!projectId) return;
    if (!projectQ.data) return;
    if (timeline?.seeded) {
      seededRef.current = true;
      return;
    }
    if (serverAssets.length === 0) return;
    seededRef.current = true;
    // Skip reference uploads — those are inputs to the app, not timeline clips.
    const initial = serverAssets
      .filter((a) => a.kind !== "reference" && a.kind !== "likeness" && a.kind !== "logo")
      .map((a) => a.id);
    if (initial.length === 0) return;

    setLocalOrder(initial);
    void updateState({
      data: {
        id: projectId,
        patch: { timeline: { order: initial, seeded: true } },
      },
    })
      .then(() => qc.invalidateQueries({ queryKey: ["v2-project", projectId] }))
      .catch((e) => console.error("[timeline] seed failed", e));
  }, [projectId, projectQ.data, timeline?.seeded, serverAssets, updateState, qc]);

  const storedOrder = timeline?.order ?? [];
  const trimOrderFallback =
    storedOrder.length === 0 && timeline?.trims
      ? Object.keys(timeline.trims).filter((ref) =>
          assetsById.has(assetIdFromTimelineRef(ref)),
        )
      : [];
  const effectiveOrder = localOrder ?? (storedOrder.length > 0 ? storedOrder : trimOrderFallback);
  const effectiveTrims = localTrims ?? timeline?.trims ?? {};
  const effectiveVolumes = localVolumes ?? timeline?.volumes ?? {};
  const effectiveVideoMuted = localVideoMuted ?? timeline?.videoMuted ?? {};

  // Multi-track stack. V1/A1 are derived from `order` (so existing add/drag
  // /trim flows keep working). User-added extra tracks (V2+, A2+) plus
  // mute/solo flags for any track live in `timeline.tracks`.
  const [localTracks, setLocalTracks] = useState<TimelineTrack[] | null>(null);
  const storedTracks = timeline?.tracks ?? null;
  const effectiveTracks: TimelineTrack[] = useMemo(
    () =>
      deriveTracks({
        assets: serverAssets,
        timeline: {
          ...timeline,
          order: effectiveOrder,
          tracks: localTracks ?? storedTracks ?? undefined,
        },
      }),
    [localTracks, storedTracks, serverAssets, timeline, effectiveOrder],
  );

  // Strip V1/A1 ordering before persisting — those are owned by `order`.
  // Keep mute/solo/lock flags on V1/A1, plus full extras.
  const persistTracks = (next: TimelineTrack[]) => {
    const toPersist: TimelineTrack[] = next.map((t) =>
      t.id === "v1" || t.id === "a1"
        ? { id: t.id, kind: t.kind, name: t.name, order: [], mute: t.mute, solo: t.solo, lock: t.lock }
        : t,
    );
    setLocalTracks(toPersist);
    if (!projectId) return;
    void updateState({
      data: { id: projectId, patch: { timeline: { tracks: toPersist } } },
    })
      .then(() => {
        setLocalTracks(null);
        qc.invalidateQueries({ queryKey: ["v2-project", projectId] });
      })
      .catch((e) => console.error("[timeline] tracks update failed", e));
  };

  const addTrack = (kind: "video" | "audio") => {
    const same = effectiveTracks.filter((t) => t.kind === kind);
    const prefix = kind === "video" ? "V" : "A";
    const n = same.length + 1;
    const rand =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 6)
        : Math.random().toString(36).slice(2, 8);
    persistTracks([
      ...effectiveTracks,
      { id: `${prefix.toLowerCase()}${n}-${rand}`, kind, name: `${prefix}${n}`, order: [] },
    ]);
  };
  const toggleTrackMute = (id: string) =>
    persistTracks(effectiveTracks.map((t) => (t.id === id ? { ...t, mute: !t.mute } : t)));
  const toggleTrackSolo = (id: string) =>
    persistTracks(effectiveTracks.map((t) => (t.id === id ? { ...t, solo: !t.solo } : t)));
  const removeTrack = (id: string) => {
    if (id === "v1" || id === "a1") return; // defaults can't be removed
    persistTracks(effectiveTracks.filter((t) => t.id !== id));
  };

  // Which track owns this ref? Refs in extras' .order belong to that extra;
  // everything else belongs to V1 (visual) or A1 (audio) based on mime.
  const trackIdOfRef = (ref: string): string => {
    for (const t of effectiveTracks) {
      if (t.id === "v1" || t.id === "a1") continue;
      if (t.order.includes(ref)) return t.id;
    }
    const a = assetsById.get(assetIdFromTimelineRef(ref));
    if (a?.mime.startsWith("audio/") || isDetachedAudioRef(ref)) return "a1";
    return "v1";
  };

  // Move a ref from its current owner-track to `targetTrackId`. Routing:
  // V1/A1 refs live in `timeline.order`; extras own their own `.order`.
  const moveRefToTrack = (ref: string, targetTrackId: string) => {
    const sourceTrackId = trackIdOfRef(ref);
    if (sourceTrackId === targetTrackId) return;
    const targetTrack = effectiveTracks.find((t) => t.id === targetTrackId);
    if (!targetTrack) return;
    // Kind mismatch — caller should have filtered, but guard anyway.
    const sourceTrack = effectiveTracks.find((t) => t.id === sourceTrackId);
    if (sourceTrack && targetTrack.kind !== sourceTrack.kind) return;

    let nextOrder = effectiveOrder.slice();
    let nextTracksAll = effectiveTracks.map((t) => ({ ...t, order: [...t.order] }));

    if (sourceTrackId === "v1" || sourceTrackId === "a1") {
      nextOrder = nextOrder.filter((r) => r !== ref);
    } else {
      nextTracksAll = nextTracksAll.map((t) =>
        t.id === sourceTrackId ? { ...t, order: t.order.filter((r) => r !== ref) } : t,
      );
    }
    if (targetTrackId === "v1" || targetTrackId === "a1") {
      nextOrder.push(ref);
    } else {
      nextTracksAll = nextTracksAll.map((t) =>
        t.id === targetTrackId ? { ...t, order: [...t.order, ref] } : t,
      );
    }

    const tracksToPersist: TimelineTrack[] = nextTracksAll.map((t) =>
      t.id === "v1" || t.id === "a1"
        ? { id: t.id, kind: t.kind, name: t.name, order: [], mute: t.mute, solo: t.solo, lock: t.lock }
        : t,
    );
    setLocalOrder(nextOrder);
    setLocalTracks(tracksToPersist);
    if (!projectId) return;
    void updateState({
      data: {
        id: projectId,
        patch: { timeline: { order: nextOrder, tracks: tracksToPersist } },
      },
    })
      .then(() => {
        setLocalTracks(null);
        qc.invalidateQueries({ queryKey: ["v2-project", projectId] });
      })
      .catch((e) => console.error("[timeline] move-to-track failed", e));
  };



  const getVolume = (ref: string): number => {
    const v = effectiveVolumes[ref];
    return typeof v === "number" ? Math.max(0, Math.min(1, v)) : 1;
  };

  // Probed media durations (seconds) for audio/video assets whose DB row
  // is missing a stored duration. Filled in by the effect below.
  const [probedDurations, setProbedDurations] = useState<Record<string, number>>(
    {},
  );

  const getNaturalDuration = (assetId: string): number | undefined => {
    const a = assetsById.get(assetId);
    if (a && typeof a.duration === "number" && a.duration > 0) return a.duration;
    const p = probedDurations[assetId];
    return typeof p === "number" && p > 0 ? p : undefined;
  };

  const getTrim = (ref: string): TimelineTrim => {
    if (effectiveTrims[ref]) {
      const t = effectiveTrims[ref];
      // If the stored trim still reflects the placeholder default end and
      // we now know the real natural duration, prefer that.
      if (
        t.start === 0 &&
        (t.end === CLIP_SECONDS || t.end == null) &&
        typeof t.offset !== "number"
      ) {
        const nat = getNaturalDuration(assetIdFromTimelineRef(ref));
        if (nat) return { start: 0, end: nat };
      }
      return t;
    }
    const assetId = assetIdFromTimelineRef(ref);
    const a = assetsById.get(assetId);
    const nat = getNaturalDuration(assetId);
    const natural =
      a && (a.mime.startsWith("audio/") || a.mime.startsWith("video/")) && nat
        ? nat
        : CLIP_SECONDS;
    return { start: 0, end: natural };
  };

  const getDur = (ref: string) => {
    const t = getTrim(ref);
    return Math.max(0.2, t.end - t.start);
  };

  const visualEntries = useMemo(() => {
    const out: { ref: string; asset: ProjectAsset }[] = [];
    for (const ref of effectiveOrder) {
      if (isDetachedAudioRef(ref)) continue;
      const a = assetsById.get(assetIdFromTimelineRef(ref));
      if (a && (a.mime.startsWith("image/") || a.mime.startsWith("video/"))) {
        out.push({ ref, asset: a });
      }
    }
    return out;
  }, [effectiveOrder, assetsById]);

  const visualAssets = useMemo(
    () => visualEntries.map((entry) => entry.asset),
    [visualEntries],
  );

  const audioEntries = useMemo(() => {
    const out: { ref: string; asset: ProjectAsset }[] = [];
    for (const ref of effectiveOrder) {
      const a = assetsById.get(assetIdFromTimelineRef(ref));
      if (!a) continue;
      if (a.mime.startsWith("audio/")) out.push({ ref, asset: a });
      else if (isDetachedAudioRef(ref) && a.mime.startsWith("video/")) {
        out.push({ ref, asset: a });
      }
    }
    return out;
  }, [effectiveOrder, assetsById]);

  // Probe natural durations for audio/video assets whose DB row doesn't
  // include a stored `duration`, so the timeline clip width matches the
  // real media length instead of falling back to CLIP_SECONDS.
  useEffect(() => {
    const toProbe = serverAssets.filter(
      (a) =>
        (a.mime.startsWith("audio/") || a.mime.startsWith("video/")) &&
        !(typeof a.duration === "number" && a.duration > 0) &&
        probedDurations[a.id] == null &&
        !!a.url,
    );
    if (toProbe.length === 0) return;
    let cancelled = false;
    toProbe.forEach((a) => {
      const el = document.createElement(
        a.mime.startsWith("video/") ? "video" : "audio",
      ) as HTMLMediaElement;
      el.preload = "metadata";
      el.src = a.url;
      const done = () => {
        const d = el.duration;
        if (!cancelled && typeof d === "number" && isFinite(d) && d > 0) {
          setProbedDurations((prev) =>
            prev[a.id] ? prev : { ...prev, [a.id]: d },
          );
        }
        el.src = "";
      };
      el.addEventListener("loadedmetadata", done, { once: true });
      el.addEventListener("error", () => {
        if (!cancelled) {
          // Mark as probed with 0 so we don't retry forever.
          setProbedDurations((prev) =>
            prev[a.id] != null ? prev : { ...prev, [a.id]: 0 },
          );
        }
      }, { once: true });
    });
    return () => {
      cancelled = true;
    };
  }, [serverAssets, probedDurations]);

  // Resolved start time (seconds) per visual entry. Uses explicit offset
  // if set; otherwise lays the clip immediately after the previous one.
  const cumStarts = useMemo(() => {
    const out: number[] = [];
    let cursor = 0;
    for (const e of visualEntries) {
      const t = effectiveTrims[e.ref];
      const off = typeof t?.offset === "number" ? t.offset : cursor;
      out.push(off);
      cursor = off + getDur(e.ref);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualEntries, effectiveTrims]);

  const audioStarts = useMemo(() => {
    const out: number[] = [];
    let cursor = 0;
    for (const e of audioEntries) {
      const t = effectiveTrims[e.ref];
      const off = typeof t?.offset === "number" ? t.offset : cursor;
      out.push(off);
      cursor = off + getDur(e.ref);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioEntries, effectiveTrims]);

  const visualEnd = cumStarts.reduce(
    (m, s, i) => Math.max(m, s + getDur(visualEntries[i].ref)),
    0,
  );
  const audioEnd = audioStarts.reduce(
    (m, s, i) => Math.max(m, s + getDur(audioEntries[i].ref)),
    0,
  );
  // Include clips on extra tracks (V2/A2…) so the ruler and playhead bound
  // match the actual content length, not just V1/A1.
  let extrasEnd = 0;
  for (const tr of effectiveTracks) {
    if (tr.id === "v1" || tr.id === "a1") continue;
    let cursor = 0;
    for (const ref of tr.order) {
      const t = effectiveTrims[ref];
      const off = typeof t?.offset === "number" ? t.offset : cursor;
      const end = off + getDur(ref);
      if (end > extrasEnd) extrasEnd = end;
      cursor = end;
    }
  }
  const visualTotal = Math.max(visualEnd, audioEnd, extrasEnd);
  const totalSeconds = Math.max(visualTotal, CLIP_SECONDS);

  // Per-track layouts: entries scoped to a single track + their lane-local
  // start times + end time. V1 owns visualEntries minus refs claimed by V2+;
  // A1 owns audioEntries minus refs claimed by A2+; extras own their .order.
  type TrackLayout = {
    entries: { ref: string; asset: ProjectAsset }[];
    starts: number[];
    end: number;
  };
  const trackLayouts = useMemo(() => {
    const map = new Map<string, TrackLayout>();
    const visualRefSet = new Set(visualEntries.map((e) => e.ref));
    const audioRefSet = new Set(audioEntries.map((e) => e.ref));
    for (const tr of effectiveTracks) {
      let refs: string[] = [];
      if (tr.id === "v1") {
        refs = visualEntries
          .filter((e) => trackIdOfRef(e.ref) === "v1")
          .map((e) => e.ref);
      } else if (tr.id === "a1") {
        refs = audioEntries
          .filter((e) => trackIdOfRef(e.ref) === "a1")
          .map((e) => e.ref);
      } else {
        refs = tr.order.filter((r) =>
          tr.kind === "video" ? visualRefSet.has(r) || (!audioRefSet.has(r) && !!assetsById.get(assetIdFromTimelineRef(r)))
            : audioRefSet.has(r) || (!visualRefSet.has(r) && !!assetsById.get(assetIdFromTimelineRef(r))),
        );
      }
      const entries: { ref: string; asset: ProjectAsset }[] = [];
      for (const ref of refs) {
        const a = assetsById.get(assetIdFromTimelineRef(ref));
        if (!a) continue;
        const detached = isDetachedAudioRef(ref);
        if (tr.kind === "video") {
          if (detached) continue;
          if (!(a.mime.startsWith("image/") || a.mime.startsWith("video/"))) continue;
        } else {
          if (!(a.mime.startsWith("audio/") || (detached && a.mime.startsWith("video/")))) continue;
        }
        entries.push({ ref, asset: a });
      }
      const starts: number[] = [];
      let cursor = 0;
      for (const e of entries) {
        const t = effectiveTrims[e.ref];
        const off = typeof t?.offset === "number" ? t.offset : cursor;
        starts.push(off);
        cursor = off + getDur(e.ref);
      }
      const end = starts.reduce(
        (m, s, i) => Math.max(m, s + getDur(entries[i].ref)),
        0,
      );
      map.set(tr.id, { entries, starts, end });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTracks, visualEntries, audioEntries, assetsById, effectiveTrims, probedDurations]);

  const videoTracks = effectiveTracks.filter((t) => t.kind === "video");
  const audioTracks = effectiveTracks.filter((t) => t.kind === "audio");


  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedEntry =
    visualEntries.find((entry) => entry.ref === selectedId) ??
    audioEntries.find((entry) => entry.ref === selectedId) ??
    visualEntries[0] ??
    audioEntries[0] ??
    null;
  const selected = selectedEntry?.asset ?? null;
  useEffect(() => {
    if (!selectedEntry && (visualEntries[0] || audioEntries[0])) {
      setSelectedId((visualEntries[0] ?? audioEntries[0])!.ref);
    }
  }, [visualEntries, audioEntries, selectedEntry]);

  // Transport
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  // Hover-skim: previews frames under the cursor WITHOUT moving the playhead.
  // null = not skimming, fall back to currentTime for preview.
  const [skimTime, setSkimTime] = useState<number | null>(null);
  const previewTime = skimTime ?? currentTime;

  // Active visual under the preview time — null during a gap or past the end.
  const activeVisualEntry = (() => {
    for (let i = 0; i < visualEntries.length; i++) {
      const s = cumStarts[i];
      const d = getDur(visualEntries[i].ref);
      if (previewTime >= s && previewTime < s + d) return visualEntries[i];
    }
    return null;
  })();
  const activeVisual = activeVisualEntry?.asset ?? null;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      lastTickRef.current = null;
      return;
    }
    let raf = 0;
    const tick = (ts: number) => {
      if (lastTickRef.current == null) lastTickRef.current = ts;
      const dt = (ts - lastTickRef.current) / 1000;
      lastTickRef.current = ts;
      setCurrentTime((t) => {
        const next = t + dt;
        if (next >= totalSeconds) {
          setIsPlaying(false);
          return totalSeconds;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, totalSeconds]);

  useEffect(() => {
    if (!visualEntries.length) return;
    let idx = 0;
    for (let i = 0; i < visualEntries.length; i++) {
      const start = cumStarts[i];
      const end = start + getDur(visualEntries[i].ref);
      if (currentTime >= start && currentTime < end) {
        idx = i;
        break;
      }
      if (currentTime >= end) idx = i;
    }
    const ref = visualEntries[idx]?.ref;
    if (ref && ref !== selectedId) setSelectedId(ref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, visualEntries, cumStarts]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const perClipMuted = selectedId ? !!effectiveVideoMuted[selectedId] : false;
    v.muted = muted || perClipMuted;
    v.volume = selectedId ? getVolume(selectedId) : 1;
    if (isPlaying) {
      // Re-sync the video element to the current playhead before starting,
      // otherwise replaying after end (or after a seek) plays nothing.
      try {
        const idx = visualEntries.findIndex((e) => e.ref === selectedId);
        if (idx >= 0) {
          const clipStart = cumStarts[idx] ?? 0;
          const trim = getTrim(selectedId!);
          const target = (trim.start ?? 0) + Math.max(0, currentTime - clipStart);
          if (Number.isFinite(target)) v.currentTime = target;
        }
      } catch {}
      v.play().catch(() => {});
    } else {
      v.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, muted, selectedId, effectiveVideoMuted, effectiveVolumes]);

  // Sync the preview <video> to the playhead while scrubbing (paused).
  // When playing we let the element advance naturally.
  useEffect(() => {
    if (isPlaying) return;
    const v = videoRef.current;
    if (!v) return;
    if (!activeVisualEntry) return;
    const a = activeVisualEntry.asset;
    if (!a.mime.startsWith("video/")) return;
    // Find clip start on the timeline.
    const idx = visualEntries.findIndex((e) => e.ref === activeVisualEntry.ref);
    if (idx < 0) return;
    const clipStart = cumStarts[idx] ?? 0;
    const trim = getTrim(activeVisualEntry.ref);
    const localOffset = Math.max(0, previewTime - clipStart);
    const target = (trim.start ?? 0) + localOffset;
    const apply = () => {
      try {
        const max = Number.isFinite(v.duration) && v.duration > 0
          ? v.duration
          : target;
        const next = Math.max(0, Math.min(target, max));
        if (Math.abs((v.currentTime || 0) - next) > 0.03) {
          v.currentTime = next;
        }
      } catch {}
    };
    if (v.readyState >= 1) {
      apply();
    } else {
      const onMeta = () => {
        apply();
        v.removeEventListener("loadedmetadata", onMeta);
      };
      v.addEventListener("loadedmetadata", onMeta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewTime, activeVisualEntry?.ref, isPlaying]);


  // Audio playback sync — each audio clip has a timeline offset (audioStarts[i]).
  // It should only play while the transport playhead is inside its [start, end)
  // window, and the audio element's local time should track (currentTime - start).
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioStartByRef = useMemo(() => {
    const m = new Map<string, number>();
    audioEntries.forEach((e, i) => m.set(e.ref, audioStarts[i] ?? 0));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioEntries, audioStarts]);

  useEffect(() => {
    for (const [ref, el] of audioRefs.current.entries()) {
      el.muted = muted;
      el.volume = getVolume(ref);
      const start = audioStartByRef.get(ref) ?? 0;
      const dur = el.duration || getDur(ref);
      const local = currentTime - start;
      const inWindow = local >= 0 && local < dur;

      if (!isPlaying || !inWindow) {
        if (!el.paused) el.pause();
        // Reset to 0 when playhead is before this clip, so a future play starts
        // the file from the beginning.
        if (local < 0) {
          try { el.currentTime = 0; } catch { /* ignore */ }
        }
        continue;
      }

      // In window and transport is playing — sync local time if drifted, then play.
      if (Math.abs(el.currentTime - local) > 0.25) {
        try { el.currentTime = local; } catch { /* ignore */ }
      }
      if (el.paused) el.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, muted, currentTime, audioStartByRef, effectiveVolumes, audioEntries.map((e) => e.ref).join(",")]);




  // ---- History (undo/redo) ----
  type Snapshot = {
    order: string[];
    trims: Record<string, TimelineTrim>;
    volumes: Record<string, number>;
    videoMuted: Record<string, boolean>;
  };
  const historyRef = useRef<{ past: Snapshot[]; future: Snapshot[] }>({
    past: [],
    future: [],
  });
  const [historyTick, setHistoryTick] = useState(0);
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  const persistSnapshot = (snap: Snapshot) => {
    if (!projectId) return;
    void updateState({
      data: {
        id: projectId,
        patch: {
          timeline: {
            order: snap.order,
            trims: snap.trims,
            volumes: snap.volumes,
            videoMuted: snap.videoMuted,
          },
        },
      },
    })
      .then(() => qc.invalidateQueries({ queryKey: ["v2-project", projectId] }))
      .catch((e) => console.error("[timeline] persist failed", e));
  };

  const snapshot = (): Snapshot => ({
    order: effectiveOrder.slice(),
    trims: { ...effectiveTrims },
    volumes: { ...effectiveVolumes },
    videoMuted: { ...effectiveVideoMuted },
  });

  const commitSnap = (next: {
    order: string[];
    trims: Record<string, TimelineTrim>;
    volumes?: Record<string, number>;
    videoMuted?: Record<string, boolean>;
  }) => {
    const full: Snapshot = {
      order: next.order,
      trims: next.trims,
      volumes: next.volumes ?? effectiveVolumes,
      videoMuted: next.videoMuted ?? effectiveVideoMuted,
    };
    historyRef.current.past.push(snapshot());
    if (historyRef.current.past.length > 50) historyRef.current.past.shift();
    historyRef.current.future = [];
    setHistoryTick((n) => n + 1);
    setLocalOrder(full.order);
    setLocalTrims(full.trims);
    setLocalVolumes(full.volumes);
    setLocalVideoMuted(full.videoMuted);
    persistSnapshot(full);
  };

  const commit = (nextOrder: string[], nextTrims?: Record<string, TimelineTrim>) =>
    commitSnap({
      order: nextOrder,
      trims: nextTrims ?? effectiveTrims,
      volumes: effectiveVolumes,
      videoMuted: effectiveVideoMuted,
    });

  const persist = commit;

  const undo = () => {
    const prev = historyRef.current.past.pop();
    if (!prev) return;
    historyRef.current.future.push(snapshot());
    setHistoryTick((n) => n + 1);
    setLocalOrder(prev.order);
    setLocalTrims(prev.trims);
    setLocalVolumes(prev.volumes);
    setLocalVideoMuted(prev.videoMuted);
    persistSnapshot(prev);
  };
  const redo = () => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(snapshot());
    setHistoryTick((n) => n + 1);
    setLocalOrder(next.order);
    setLocalTrims(next.trims);
    setLocalVolumes(next.volumes);
    setLocalVideoMuted(next.videoMuted);
    persistSnapshot(next);
  };

  // ---- Zoom ----
  const [zoom, setZoom] = useState(1); // 0.5 - 2.5
  const clipPx = Math.round(80 * zoom);
  const pxPerSec = clipPx / CLIP_SECONDS;
  const clipGapPx = 6;
  void historyTick;

  // ---- Duplicate selected clip ----
  // ---- Per-clip volume + detach audio ----
  const setClipVolume = (ref: string, vol: number) => {
    const next = {
      ...effectiveVolumes,
      [ref]: Math.max(0, Math.min(1, vol)),
    };
    commitSnap({
      order: effectiveOrder.slice(),
      trims: { ...effectiveTrims },
      volumes: next,
      videoMuted: { ...effectiveVideoMuted },
    });
  };

  const detachAudio = (sourceRef: string) => {
    if (isDetachedAudioRef(sourceRef)) return;
    const a = assetsById.get(assetIdFromTimelineRef(sourceRef));
    if (!a || !a.mime.startsWith("video/")) return;
    const detachedRef = makeDetachedAudioRef(sourceRef);
    if (effectiveOrder.includes(detachedRef)) return;
    const idx = effectiveOrder.indexOf(sourceRef);
    if (idx < 0) return;
    const nextOrder = effectiveOrder.slice();
    nextOrder.splice(idx + 1, 0, detachedRef);
    const nextTrims = {
      ...effectiveTrims,
      [detachedRef]: { ...getTrim(sourceRef) },
    };
    const nextMuted = { ...effectiveVideoMuted, [sourceRef]: true };
    commitSnap({
      order: nextOrder,
      trims: nextTrims,
      volumes: { ...effectiveVolumes },
      videoMuted: nextMuted,
    });
  };

  const duplicateSelected = () => {
    if (!selectedEntry) return;
    const idx = effectiveOrder.indexOf(selectedEntry.ref);
    if (idx < 0) return;
    const next = effectiveOrder.slice();
    const newRef = makeTimelineRef(selectedEntry.asset.id);
    next.splice(idx + 1, 0, newRef);
    // Inherit the same trim window so a duplicate is truly a copy.
    const nextTrims = { ...effectiveTrims, [newRef]: { ...getTrim(selectedEntry.ref) } };
    commit(next, nextTrims);
    setSelectedId(newRef);
  };

  // ---- Split at playhead (works across visual + audio) ----
  const splitAtPlayhead = () => {
    type Track = { kind: "visual" | "audio"; entries: typeof visualEntries; starts: number[] };
    const tracks: Track[] = [
      { kind: "visual", entries: visualEntries, starts: cumStarts },
      { kind: "audio", entries: audioEntries, starts: audioStarts },
    ];
    let target: { ref: string; assetId: string; local: number } | null = null;
    for (const t of tracks) {
      for (let i = 0; i < t.entries.length; i++) {
        const start = t.starts[i];
        const end = start + getDur(t.entries[i].ref);
        if (currentTime >= start && currentTime < end) {
          target = {
            ref: t.entries[i].ref,
            assetId: t.entries[i].asset.id,
            local: currentTime - start,
          };
          break;
        }
      }
      if (target) break;
    }
    if (!target) return;
    performSplit(target.ref, target.assetId, target.local);
  };

  // Split a specific clip at an absolute timeline time.
  const splitAtTime = (ref: string, timelineTime: number) => {
    const inVisual = visualEntries.findIndex((e) => e.ref === ref);
    const inAudio = audioEntries.findIndex((e) => e.ref === ref);
    let start: number | null = null;
    if (inVisual >= 0) start = cumStarts[inVisual];
    else if (inAudio >= 0) start = audioStarts[inAudio];
    if (start == null) return;
    const assetId = assetIdFromTimelineRef(ref);
    performSplit(ref, assetId, timelineTime - start);
  };

  const performSplit = (ref: string, assetId: string, localOffset: number) => {
    const trim = getTrim(ref);
    const cutAt = trim.start + localOffset;
    if (cutAt - trim.start < 0.2 || trim.end - cutAt < 0.2) return;
    const newRef = makeTimelineRef(assetId);
    const next = effectiveOrder.slice();
    const orderIdx = next.indexOf(ref);
    next.splice(orderIdx + 1, 0, newRef);
    const nextTrims = {
      ...effectiveTrims,
      [ref]: { ...effectiveTrims[ref], start: trim.start, end: cutAt },
      [newRef]: { start: cutAt, end: trim.end },
    };
    commit(next, nextTrims);
    setSelectedId(newRef);
  };

  // ---- Trim handles (drag left/right edges of a clip) ----
  const beginTrim = (
    ref: string,
    edge: "start" | "end",
    e: React.PointerEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const baseTrim = getTrim(ref);
    const baseTrims = { ...effectiveTrims };
    const asset = assetsById.get(assetIdFromTimelineRef(ref));
    const isImage = asset?.mime.startsWith("image/") ?? false;
    const probed = asset ? probedDurations[asset.id] : 0;
    const naturalDur =
      typeof asset?.duration === "number" && asset.duration > 0
        ? asset.duration
        : probed && probed > 0
          ? probed
          : null;
    const maxEnd = isImage ? 600 : naturalDur ?? CLIP_SECONDS;

    // Locate this clip on its track to compute its anchored timeline-left.
    // Locate this clip on its owning track (V1/A1 or extra) so trim works on
    // every track, not just the defaults.
    let isVisualTrack = false;
    let clipStartTime = 0;
    let nextEntry: { ref: string; asset: ProjectAsset } | undefined;
    let nextEntryStart: number | undefined;
    const visIdx = visualEntries.findIndex((x) => x.ref === ref);
    const audIdx = audioEntries.findIndex((x) => x.ref === ref);
    if (visIdx >= 0) {
      isVisualTrack = true;
      clipStartTime = cumStarts[visIdx] ?? 0;
      nextEntry = visualEntries[visIdx + 1];
      nextEntryStart = cumStarts[visIdx + 1];
    } else if (audIdx >= 0) {
      isVisualTrack = false;
      clipStartTime = audioStarts[audIdx] ?? 0;
      nextEntry = audioEntries[audIdx + 1];
      nextEntryStart = audioStarts[audIdx + 1];
    } else {
      // Extra track: walk effectiveTracks and use trackLayouts.
      for (const t of effectiveTracks) {
        if (t.id === "v1" || t.id === "a1") continue;
        if (!t.order.includes(ref)) continue;
        const lay = trackLayouts.get(t.id);
        if (!lay) break;
        const idx = lay.entries.findIndex((e) => e.ref === ref);
        if (idx < 0) break;
        isVisualTrack = t.kind === "video";
        clipStartTime = lay.starts[idx] ?? 0;
        nextEntry = lay.entries[idx + 1];
        nextEntryStart = lay.starts[idx + 1];
        break;
      }
    }
    const snapTargets = collectSnapTargets(ref).concat([currentTime]);
    const snapSec = SNAP_PX / Math.max(1, pxPerSec);

    let latest = baseTrim;
    let altPin = false;
    const onMove = (ev: PointerEvent) => {
      altPin = ev.altKey;
      const dx = ev.clientX - startX;
      const dSec = dx / Math.max(1, pxPerSec);
      let nextStart = baseTrim.start;
      let nextEnd = baseTrim.end;
      if (edge === "end") {
        nextEnd = Math.max(Math.min(maxEnd, baseTrim.end + dSec), baseTrim.start + 0.2);
        // Snap the timeline right-edge to playhead / neighbor edges.
        const proposedRight = clipStartTime + (nextEnd - baseTrim.start);
        let best = proposedRight;
        let bestDist = snapSec;
        for (const t of snapTargets) {
          const d = Math.abs(proposedRight - t);
          if (d < bestDist) {
            bestDist = d;
            best = t;
          }
        }
        if (best !== proposedRight) {
          const snapped = baseTrim.start + (best - clipStartTime);
          nextEnd = Math.max(Math.min(maxEnd, snapped), baseTrim.start + 0.2);
        }
      } else {
        nextStart = Math.min(Math.max(0, baseTrim.start + dSec), baseTrim.end - 0.2);
        // Trim-start: pin the right edge in timeline space so the clip
        // appears to be trimmed in from the left (its on-timeline left
        // advances, leaving empty space before it). Snap the moving left
        // edge to neighbors / playhead.
        const baseLeft = clipStartTime;
        const baseRight = clipStartTime + (baseTrim.end - baseTrim.start);
        const proposedLeft = baseLeft + (nextStart - baseTrim.start);
        let best = proposedLeft;
        let bestDist = snapSec;
        for (const t of snapTargets) {
          const d = Math.abs(proposedLeft - t);
          if (d < bestDist) {
            bestDist = d;
            best = t;
          }
        }
        if (best !== proposedLeft) {
          const snappedStart = baseTrim.start + (best - baseLeft);
          nextStart = Math.min(Math.max(0, snappedStart), baseTrim.end - 0.2);
        }
        // Keep the right edge of the clip pinned at its original timeline
        // position by writing an explicit offset for this clip.
        void baseRight;
      }
      latest = { ...baseTrim, start: nextStart, end: nextEnd };
      if (edge === "start") {
        // Pin the clip's right edge to where it was on the timeline by
        // advancing its offset by however much we trimmed in.
        const baseOffset =
          typeof baseTrim.offset === "number" ? baseTrim.offset : clipStartTime;
        latest = { ...latest, offset: baseOffset + (nextStart - baseTrim.start) };
      }
      const nextTrims: Record<string, TimelineTrim> = { ...baseTrims, [ref]: latest };
      // Alt = "trim in place": pin the next clip so following clips don't
      // ripple along with this trim.
      if (altPin && nextEntry && typeof nextEntryStart === "number") {
        nextTrims[nextEntry.ref] = {
          ...getTrim(nextEntry.ref),
          offset: nextEntryStart,
        };
      }
      setLocalTrims(nextTrims);
      setTrimHud({
        durSec: latest.end - latest.start,
        leftPx: (latest.offset ?? clipStartTime) * pxPerSec,
        widthPx: (latest.end - latest.start) * pxPerSec,
        kind: isVisualTrack ? "visual" : "audio",
        altPin,
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const finalTrims: Record<string, TimelineTrim> = { ...baseTrims, [ref]: latest };
      if (altPin && nextEntry && typeof nextEntryStart === "number") {
        finalTrims[nextEntry.ref] = {
          ...getTrim(nextEntry.ref),
          offset: nextEntryStart,
        };
      }
      setTrimHud(null);
      commitSnap({ order: effectiveOrder.slice(), trims: finalTrims });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // ---- Move handles (drag a clip/audio body to reposition in time) ----
  const SNAP_PX = 12;
  const collectSnapTargets = (excludeRef: string): number[] => {
    const out: number[] = [0];
    visualEntries.forEach((e, i) => {
      if (e.ref === excludeRef) return;
      out.push(cumStarts[i]);
      out.push(cumStarts[i] + getDur(e.ref));
    });
    audioEntries.forEach((e, i) => {
      if (e.ref === excludeRef) return;
      out.push(audioStarts[i]);
      out.push(audioStarts[i] + getDur(e.ref));
    });
    return out;
  };
  const snapTime = (t: number, dur: number, targets: number[]) => {
    const snapSec = SNAP_PX / Math.max(1, pxPerSec);
    let best = t;
    let bestDist = snapSec;
    for (const target of targets) {
      // Snap clip start
      const d1 = Math.abs(t - target);
      if (d1 < bestDist) {
        best = target;
        bestDist = d1;
      }
      // Snap clip end (so end aligns with target)
      const d2 = Math.abs(t + dur - target);
      if (d2 < bestDist) {
        best = target - dur;
        bestDist = d2;
      }
    }
    return Math.max(0, best);
  };

  // ---- Drag-to-reorder (iMovie-style) ----
  // While dragging, the clip follows the cursor and a vertical indicator
  // line shows where it will land. On release, the clip snaps into that
  // slot and the timeline reflows.
  type DragState = {
    ref: string;
    kind: "visual" | "audio";
    rowIndex: number; // for audio rows
    ghostLeftPx: number; // left of ghost relative to track
    ghostTopPx: number; // top of ghost relative to track row
    widthPx: number;
    heightPx: number;
    insertIdx: number; // insertion index among the OTHER refs of this kind
    insertX: number; // px where the indicator line should render
  };
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [trimHud, setTrimHud] = useState<null | {
    durSec: number;
    leftPx: number;
    widthPx: number;
    kind: "visual" | "audio";
    altPin: boolean;
  }>(null);

  const beginMove = (
    ref: string,
    e: React.PointerEvent,
    kind: "visual" | "audio",
    trackId?: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const clipEl = e.currentTarget as HTMLElement;
    const trackEl = clipEl.closest<HTMLElement>(`[data-track-kind="${kind}"]`);
    if (!trackEl) return;
    const resolvedTrackId = trackId ?? trackEl.dataset.trackId ?? (kind === "visual" ? "v1" : "a1");
    const clipRect = clipEl.getBoundingClientRect();
    const trackRect = trackEl.getBoundingClientRect();
    // Shift-click = blade split at click X (no drag).
    if (e.shiftKey) {
      const xSec = (e.clientX - trackRect.left) / Math.max(1, pxPerSec);
      splitAtTime(ref, xSec);
      return;
    }
    const startClipLeft = clipRect.left - trackRect.left;
    const startClipTop = clipRect.top - trackRect.top;
    const grabOffsetX = e.clientX - clipRect.left;
    const grabOffsetY = e.clientY - clipRect.top;
    const widthPx = clipRect.width;
    const heightPx = clipRect.height;

    // Use track-scoped entries/starts so V2/A2 reorder works correctly.
    const lay = trackLayouts.get(resolvedTrackId);
    const entries = lay?.entries ?? (kind === "visual" ? visualEntries : audioEntries);
    const starts = lay?.starts ?? (kind === "visual" ? cumStarts : audioStarts);
    const others: { ref: string; start: number; end: number }[] = [];
    entries.forEach((en, i) => {
      if (en.ref === ref) return;
      others.push({ ref: en.ref, start: starts[i], end: starts[i] + getDur(en.ref) });
    });

    const movedDur = getDur(ref);
    const snapTargets = collectSnapTargets(ref);
    const computeInsert = (cursorXPx: number) => {
      const cursorSec = cursorXPx / Math.max(1, pxPerSec);
      const edges: { x: number; idx: number }[] = [{ x: 0, idx: 0 }];
      others.forEach((o, i) => {
        edges.push({ x: o.end, idx: i + 1 });
      });
      let best = edges[0];
      let bestDist = Infinity;
      for (const e of edges) {
        const d = Math.abs(cursorSec - e.x);
        if (d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
      return { insertIdx: best.idx, insertX: best.x * pxPerSec };
    };

    let moved = false;
    let lastEv: PointerEvent | null = null;
    let latest: DragState = {
      ref,
      kind,
      rowIndex: kind === "audio" ? entries.findIndex((x) => x.ref === ref) : 0,
      ghostLeftPx: startClipLeft,
      ghostTopPx: startClipTop,
      widthPx,
      heightPx,
      insertIdx: -1,
      insertX: 0,
    };

    const onMove = (ev: PointerEvent) => {
      lastEv = ev;
      const dx = ev.clientX - (trackRect.left + startClipLeft + grabOffsetX);
      const dy = ev.clientY - (trackRect.top + startClipTop + grabOffsetY);
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      moved = true;
      let ghostLeftPx = Math.max(
        -widthPx / 2,
        ev.clientX - trackRect.left - grabOffsetX,
      );
      const snappedSec = snapTime(
        ghostLeftPx / Math.max(1, pxPerSec),
        movedDur,
        snapTargets.concat([currentTime]),
      );
      ghostLeftPx = snappedSec * pxPerSec;
      const ghostTopPx = ev.clientY - trackRect.top - grabOffsetY;
      const cursorXPx = ev.clientX - trackRect.left;
      const { insertIdx, insertX } = computeInsert(cursorXPx);
      latest = { ...latest, ghostLeftPx, ghostTopPx, insertIdx, insertX };
      setDragState(latest);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragState(null);
      if (!moved) return; // treat as click

      // Cross-track drop: did the user release over a different track of the
      // same kind? Hit-test the cursor against any track lane element.
      if (lastEv) {
        const stack = document.elementsFromPoint(lastEv.clientX, lastEv.clientY);
        for (const el of stack) {
          const lane = (el as HTMLElement).closest?.(`[data-track-kind="${kind}"][data-track-id]`) as HTMLElement | null;
          if (lane) {
            const tid = lane.dataset.trackId;
            if (tid && tid !== resolvedTrackId) {
              moveRefToTrack(ref, tid);
              return;
            }
            break;
          }
        }
      }

      // Within-track reorder.
      const droppedSec = Math.max(0, latest.ghostLeftPx / Math.max(1, pxPerSec));
      const nextTrims = { ...effectiveTrims };
      nextTrims[ref] = { ...getTrim(ref), offset: droppedSec };

      // V1/A1 → reorder within `order`. Extras → reorder within tracks[i].order.
      if (resolvedTrackId === "v1" || resolvedTrackId === "a1") {
        const kindRefs = new Set(entries.map((x) => x.ref));
        const resolved = entries
          .map((en, i) =>
            en.ref === ref
              ? { ref, start: droppedSec }
              : { ref: en.ref, start: starts[i] },
          )
          .sort((a, b) => a.start - b.start);
        const newKindOrder = resolved.map((r) => r.ref);
        let k = 0;
        const newOrder = effectiveOrder.map((r) =>
          kindRefs.has(r) ? newKindOrder[k++] : r,
        );
        commitSnap({ order: newOrder, trims: nextTrims });
      } else {
        // Extras: write back the new ordering to that track's .order.
        const resolved = entries
          .map((en, i) =>
            en.ref === ref
              ? { ref, start: droppedSec }
              : { ref: en.ref, start: starts[i] },
          )
          .sort((a, b) => a.start - b.start);
        const newTrackOrder = resolved.map((r) => r.ref);
        const nextTracksAll = effectiveTracks.map((t) =>
          t.id === resolvedTrackId ? { ...t, order: newTrackOrder } : t,
        );
        const tracksToPersist: TimelineTrack[] = nextTracksAll.map((t) =>
          t.id === "v1" || t.id === "a1"
            ? { id: t.id, kind: t.kind, name: t.name, order: [], mute: t.mute, solo: t.solo, lock: t.lock }
            : t,
        );
        setLocalTracks(tracksToPersist);
        setLocalTrims(nextTrims);
        if (projectId) {
          void updateState({
            data: { id: projectId, patch: { timeline: { trims: nextTrims, tracks: tracksToPersist } } },
          })
            .then(() => {
              setLocalTracks(null);
              qc.invalidateQueries({ queryKey: ["v2-project", projectId] });
            })
            .catch((err) => console.error("[timeline] extra reorder failed", err));
        }
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };


  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((p) => {
          if (!p && currentTime >= totalSeconds - 0.05) setCurrentTime(0);
          return !p;
        });
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        handleDelete(selectedId, { leaveGap: !e.altKey });
        return;
      }
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && selectedId) {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        // Option/Alt = nudge the selected clip by 1 frame (1/30s) via offset.
        if (e.altKey) {
          const step = dir * (1 / 30);
          const cur = getTrim(selectedId);
          const inVisual = visualEntries.findIndex((v) => v.ref === selectedId);
          const inAudio = audioEntries.findIndex((v) => v.ref === selectedId);
          const baseStart =
            inVisual >= 0
              ? cumStarts[inVisual] ?? 0
              : inAudio >= 0
                ? audioStarts[inAudio] ?? 0
                : 0;
          const nextOffset = Math.max(0, baseStart + step);
          const nextTrims = {
            ...effectiveTrims,
            [selectedId]: { ...cur, offset: nextOffset },
          };
          commitSnap({ order: effectiveOrder.slice(), trims: nextTrims });
          return;
        }
        // Plain arrow: step selection through the merged track list.
        const merged = [
          ...visualEntries.map((v, i) => ({ ref: v.ref, start: cumStarts[i] ?? 0 })),
          ...audioEntries.map((v, i) => ({ ref: v.ref, start: audioStarts[i] ?? 0 })),
        ];
        if (merged.length === 0) return;
        const i = merged.findIndex((m) => m.ref === selectedId);
        const ni =
          dir > 0
            ? Math.min(i + 1, merged.length - 1)
            : Math.max(i - 1, 0);
        const next = merged[ni];
        if (next) {
          setSelectedId(next.ref);
          seekTo(next.start);
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (e.key.toLowerCase() === "s" && !mod) {
        e.preventDefault();
        splitAtPlayhead();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, visualEntries, effectiveOrder]);


  const [dragId, setDragId] = useState<string | null>(null);
  // dropHint encodes "kind:trackId" e.g. "visual:v1", "audio:a2", or null.
  const [dropHint, setDropHint] = useState<string | null>(null);

  const readDragData = (e: React.DragEvent) => {
    const timelineRef =
      e.dataTransfer.getData("application/x-v2-timeline-ref") || dragId;
    const assetId =
      e.dataTransfer.getData("application/x-v2-asset-id") ||
      (timelineRef ? timelineRefAssetId(timelineRef, effectiveOrder) : "");
    return { timelineRef, assetId };
  };

  const insertTimelineItem = (
    next: string[],
    assetId: string,
    timelineRef: string | null,
    targetRef: string | null,
    place: "before" | "after" | "append",
  ) => {
    const isMove = !!timelineRef && next.includes(timelineRef);
    const refToInsert = isMove ? timelineRef : makeTimelineRef(assetId);
    if (targetRef === refToInsert) return next;
    if (isMove) next.splice(next.indexOf(refToInsert), 1);
    if (!targetRef || place === "append") {
      next.push(refToInsert);
      return next;
    }
    const targetIndex = next.indexOf(targetRef);
    if (targetIndex < 0) {
      next.push(refToInsert);
      return next;
    }
    next.splice(place === "before" ? targetIndex : targetIndex + 1, 0, refToInsert);
    return next;
  };

  const dropPlacementFromElement = (el: HTMLElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2 ? "before" : "after";
  };

  const dropTargetFromTrack = (
    track: HTMLElement,
    clientX: number,
    selector: string,
  ) => {
    const items = Array.from(track.querySelectorAll<HTMLElement>(selector));
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) {
        return { targetRef: item.dataset.timelineRef ?? null, place: "before" as const };
      }
    }
    const last = items.at(-1);
    return {
      targetRef: last?.dataset.timelineRef ?? null,
      place: last ? ("after" as const) : ("append" as const),
    };
  };

  const handleDropOnItem = (
    targetRef: string,
    e: React.DragEvent,
    kind: "visual" | "audio",
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDropHint(null);
    const { timelineRef, assetId } = readDragData(e);
    if (!assetId) return;
    const mime =
      e.dataTransfer.getData("application/x-v2-asset-mime") ||
      assetsById.get(assetId)?.mime ||
      "";
    const isAudio = mime.startsWith("audio/");
    const isVisual = mime.startsWith("image/") || mime.startsWith("video/");
    if (kind === "visual" && !isVisual) return;
    if (kind === "audio" && !isAudio) return;
    const next = effectiveOrder.slice();
    insertTimelineItem(next, assetId, timelineRef, targetRef, dropPlacementFromElement(e.currentTarget as HTMLElement, e.clientX));
    setLocalOrder(next);
    persist(next);
    setDragId(null);
  };

  const handleAppendDrop = (
    e: React.DragEvent,
    kind: "visual" | "audio",
    targetTrackId?: string,
  ) => {
    e.preventDefault();
    setDropHint(null);
    const { timelineRef, assetId } = readDragData(e);
    if (!assetId) return;
    const mime =
      e.dataTransfer.getData("application/x-v2-asset-mime") ||
      assetsById.get(assetId)?.mime ||
      "";
    const isAudio = mime.startsWith("audio/");
    const isVisual = mime.startsWith("image/") || mime.startsWith("video/");
    if (kind === "visual" && !isVisual) return;
    if (kind === "audio" && !isAudio) return;

    // Cross-track move: dragging a clip already on the timeline onto a track
    // it isn't currently part of (same kind only).
    if (timelineRef && targetTrackId) {
      const sourceTrackId = trackIdOfRef(timelineRef);
      if (sourceTrackId !== targetTrackId) {
        moveRefToTrack(timelineRef, targetTrackId);
        setDragId(null);
        return;
      }
    }

    const next = effectiveOrder.slice();
    const selector = kind === "visual" ? "[data-timeline-kind='visual']" : "[data-timeline-kind='audio']";
    const target = dropTargetFromTrack(e.currentTarget as HTMLElement, e.clientX, selector);
    insertTimelineItem(next, assetId, timelineRef, target.targetRef, target.place);
    // If this drop is targeting an extra (V2+/A2+) for a brand-new asset, add
    // the ref into that extra's order instead of leaving it in `order` (where
    // V1/A1 would pick it up). New asset = no existing timelineRef → push.
    if (targetTrackId && targetTrackId !== "v1" && targetTrackId !== "a1" && !timelineRef) {
      const newRef = next[next.length - 1];
      const nextTracksAll = effectiveTracks.map((t) => ({ ...t, order: [...t.order] }));
      const i = nextTracksAll.findIndex((t) => t.id === targetTrackId);
      if (i >= 0) nextTracksAll[i].order = [...nextTracksAll[i].order, newRef];
      const tracksToPersist: TimelineTrack[] = nextTracksAll.map((t) =>
        t.id === "v1" || t.id === "a1"
          ? { id: t.id, kind: t.kind, name: t.name, order: [], mute: t.mute, solo: t.solo, lock: t.lock }
          : t,
      );
      setLocalTracks(tracksToPersist);
      setLocalOrder(next);
      if (projectId) {
        void updateState({
          data: { id: projectId, patch: { timeline: { order: next, tracks: tracksToPersist } } },
        })
          .then(() => {
            setLocalTracks(null);
            qc.invalidateQueries({ queryKey: ["v2-project", projectId] });
          })
          .catch((err) => console.error("[timeline] add-to-track failed", err));
      }
      setDragId(null);
      return;
    }

    setLocalOrder(next);
    persist(next);
    setDragId(null);
  };


  const handleDelete = (ref: string, opts?: { leaveGap?: boolean }) => {
    // Extras (V2/A2…) own their own .order — they aren't in effectiveOrder,
    // so delete from the owning track and persist tracks directly.
    const ownerTrackId = trackIdOfRef(ref);
    const ownerTrack = effectiveTracks.find((t) => t.id === ownerTrackId);
    if (ownerTrack && ownerTrack.id !== "v1" && ownerTrack.id !== "a1") {
      const idx = ownerTrack.order.indexOf(ref);
      const nextTrims = { ...effectiveTrims };
      if (opts?.leaveGap && idx >= 0) {
        const nextRef = ownerTrack.order[idx + 1];
        if (nextRef) {
          // Compute the about-to-be-removed clip's start on its lane.
          let cursor = 0;
          let startOfDeleted = 0;
          for (let i = 0; i <= idx; i += 1) {
            const r = ownerTrack.order[i];
            const t = effectiveTrims[r];
            const off = typeof t?.offset === "number" ? t.offset : cursor;
            if (i === idx) startOfDeleted = off;
            cursor = off + getDur(r);
          }
          const existing = nextTrims[nextRef];
          if (!existing || typeof existing.offset !== "number") {
            nextTrims[nextRef] = { ...getTrim(nextRef), offset: startOfDeleted };
          }
        }
      }
      delete nextTrims[ref];
      const nextTracksAll = effectiveTracks.map((t) =>
        t.id === ownerTrack.id ? { ...t, order: t.order.filter((r) => r !== ref) } : t,
      );
      const tracksToPersist: TimelineTrack[] = nextTracksAll.map((t) =>
        t.id === "v1" || t.id === "a1"
          ? { id: t.id, kind: t.kind, name: t.name, order: [], mute: t.mute, solo: t.solo, lock: t.lock }
          : t,
      );
      // Also drop the ref from timeline.order so V1/A1 don't reclaim it
      // (deriveTracks routes any unclaimed visual/audio ref back to V1/A1).
      const nextOrder = effectiveOrder.filter((r) => r !== ref);
      if (selectedId === ref) setSelectedId(null);
      setLocalTracks(tracksToPersist);
      setLocalTrims(nextTrims);
      setLocalOrder(nextOrder);
      if (projectId) {
        void updateState({
          data: { id: projectId, patch: { timeline: { order: nextOrder, tracks: tracksToPersist, trims: nextTrims } } },
        })
          .then(() => {
            setLocalTracks(null);
            qc.invalidateQueries({ queryKey: ["v2-project", projectId] });
          })
          .catch((e) => console.error("[timeline] delete extra failed", e));
      }
      return;
    }

    const visualIdx = visualEntries.findIndex((e) => e.ref === ref);
    const audioIdx = audioEntries.findIndex((e) => e.ref === ref);
    const isVisual = visualIdx >= 0;
    const entries = isVisual ? visualEntries : audioEntries;
    const starts = isVisual ? cumStarts : audioStarts;
    const idx = isVisual ? visualIdx : audioIdx;
    const nextTrims = { ...effectiveTrims };
    if (opts?.leaveGap && idx >= 0) {
      const nextEntry = entries[idx + 1];
      if (nextEntry) {
        const existing = nextTrims[nextEntry.ref];
        if (!existing || typeof existing.offset !== "number") {
          const nextStart = starts[idx + 1];
          nextTrims[nextEntry.ref] = {
            ...getTrim(nextEntry.ref),
            offset: nextStart,
          };
        }
      }
    }
    delete nextTrims[ref];
    const next = effectiveOrder.filter((x) => x !== ref);
    if (selectedId === ref) {
      const fallback =
        (isVisual ? visualEntries : audioEntries).filter((e) => e.ref !== ref)[0] ??
        (isVisual ? audioEntries : visualEntries)[0] ??
        null;
      setSelectedId(fallback?.ref ?? null);
    }
    commitSnap({ order: next, trims: nextTrims });
  };

  // Collapse a gap on a track: clear the explicit offset on the clip that
  // follows the gap so it (and everything after) flows leftward.
  const collapseGap = (_kind: "visual" | "audio", nextRef: string) => {
    const nextTrims = { ...effectiveTrims };
    const existing = nextTrims[nextRef];
    if (existing && typeof existing.offset === "number") {
      const { offset: _o, ...rest } = existing;
      void _o;
      nextTrims[nextRef] = rest;
    }
    commitSnap({ order: effectiveOrder.slice(), trims: nextTrims });
  };

  // Per-lane gaps are now computed inside the track render loop.

  const seekTo = (t: number) => {
    const clamped = Math.max(0, Math.min(totalSeconds, t));
    setCurrentTime(clamped);
  };




  // Popover open state
  const [editClipFor, setEditClipFor] = useState<string | null>(null);
  const [addClipForTrack, setAddClipForTrack] = useState<string | null>(null);
  const [editAudioFor, setEditAudioFor] = useState<string | null>(null);
  const [addAudioForTrack, setAddAudioForTrack] = useState<string | null>(null);

  const pickEditClip = (skill: Skill, asset: ProjectAsset, targetRef: string) => {
    onUseInApp?.({
      skill,
      asset,
      intent: { kind: "replaceClip", targetRef },
    });
    setEditClipFor(null);
  };
  const pickAddClip = (skill: Skill, trackId: string) => {
    onUseInApp?.({
      skill,
      asset: null,
      intent: { kind: "appendVisual", targetTrackId: trackId },
    });
    setAddClipForTrack(null);
  };
  const pickEditAudio = (skill: Skill, asset: ProjectAsset, targetRef: string) => {
    onUseInApp?.({
      skill,
      asset,
      intent: { kind: "replaceAudio", targetRef },
    });
    setEditAudioFor(null);
  };
  const pickAddAudio = (skill: Skill, trackId: string) => {
    onUseInApp?.({
      skill,
      asset: null,
      intent: { kind: "appendAudio", targetTrackId: trackId },
    });
    setAddAudioForTrack(null);
  };

  const handleLibraryPick = async (item: { id: string; mime: string }, trackId?: string) => {
    if (!projectId) return;
    try {
      const asset = await attachLibrary({
        data: { sourceAssetId: item.id, targetProjectId: projectId },
      });
      const newRef = makeTimelineRef(asset.id);
      const next = effectiveOrder.slice();
      next.push(newRef);
      // Route into an extra track if requested.
      if (trackId && trackId !== "v1" && trackId !== "a1") {
        const nextTracksAll = effectiveTracks.map((t) => ({ ...t, order: [...t.order] }));
        const i = nextTracksAll.findIndex((t) => t.id === trackId);
        if (i >= 0) {
          nextTracksAll[i] = { ...nextTracksAll[i], order: [...nextTracksAll[i].order, newRef] };
        }
        const tracksToPersist: TimelineTrack[] = nextTracksAll.map((t) =>
          t.id === "v1" || t.id === "a1"
            ? { id: t.id, kind: t.kind, name: t.name, order: [], mute: t.mute, solo: t.solo, lock: t.lock }
            : t,
        );
        setLocalOrder(next);
        setLocalTracks(tracksToPersist);
        await updateState({
          data: { id: projectId, patch: { timeline: { order: next, tracks: tracksToPersist } } },
        });
        setLocalTracks(null);
      } else {
        setLocalOrder(next);
        persist(next);
      }
      await qc.invalidateQueries({ queryKey: ["v2-project", projectId] });
    } catch (e) {
      console.error("[timeline] library attach failed", e);
    }
  };


  const handleShare = async () => {
    if (!projectId || sharing) return;
    if (visualEntries.length === 0) {
      toast.error("Add at least one clip to share.");
      return;
    }
    setSharing(true);
    // Always export the full timeline (all clips + audio + music) into a
    // single mp4 before sharing. We never silently fall back to a single
    // clip — the user wants the whole timeline on the community feed.
    const hasMusic = audioEntries.length > 0;
    const toastId = toast.loading("Rendering timeline for sharing…");
    try {
      const startRes = await startExportFn({
        data: {
          projectId,
          settings: {
            format: "mp4",
            resolution: "1080p",
            fps: 30,
            aspect: "original",
            quality: "medium",
            background: "black",
            includeMusic: hasMusic,
          },
        },
      });
      if (startRes.status === "failed" || !startRes.jobId) {
        throw new Error(startRes.error ?? "Render failed to start");
      }
      let stitchedUrl: string | null = null;
      const deadline = Date.now() + 15 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const s = await exportStatusFn({ data: { jobId: startRes.jobId } });
        if (s.progress) {
          toast.loading(`Rendering timeline… ${Math.round(s.progress)}%`, { id: toastId });
        }
        if (s.status === "done" && s.outputUrl) {
          stitchedUrl = s.outputUrl;
          break;
        }
        if (s.status === "failed") {
          throw new Error(s.error ?? "Render failed");
        }
      }
      if (!stitchedUrl) throw new Error("Render timed out");

      toast.loading("Posting to community…", { id: toastId });
      await shareFn({
        data: {
          projectId,
          videoUrl: stitchedUrl,
          thumbUrl: null,
          mime: "video/mp4",
          width: null,
          height: null,
          duration: null,
        },
      });
      qc.invalidateQueries({ queryKey: ["community-shares"] });
      toast.success("Shared to the community", { id: toastId });
    } catch (e) {
      console.error("[timeline] share failed", e);
      const msg = e instanceof Error ? e.message : "Couldn’t share — try again.";
      toast.error(`Couldn’t share: ${msg}`, { id: toastId });
    } finally {
      setSharing(false);
    }
  };

  useImperativeHandle(
    actionsRef,
    () => ({
      share: handleShare,
      openExport: () => setExportOpen(true),
      sharing,
      canShare: !!projectId && visualEntries.length > 0,
      canExport: !!projectId,
    }),
    [projectId, sharing, visualEntries.length],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header — matches project title font */}
      {!hideHeader && (
        <header className="flex items-center justify-between gap-3 px-6 py-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Timeline
          </h2>
          <div className="-my-1 flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="shadow-none hover:bg-foreground hover:text-background"
              onClick={handleShare}
              disabled={!projectId || sharing || visualEntries.length === 0}
              title="Share to community"
            >
              {sharing ? "Stitching…" : "Share"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="shadow-none hover:bg-foreground hover:text-background"
              onClick={() => setExportOpen(true)}
              disabled={!projectId}
            >
              Export
            </Button>
            {!hideClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                aria-label="Close timeline"
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            )}
          </div>
        </header>
      )}


      {/* Centered editor */}
      <div className="relative flex-1 min-h-0">
        <div className="flex h-full flex-col overflow-auto p-5">
        <div className="flex w-full flex-1 min-h-0 flex-col">
        {/* Preview + transport */}
        <div className="flex min-w-0 flex-1 min-h-0 flex-col items-center gap-4">
          {/* Preview */}
          <div className="flex w-full flex-1 min-h-0 items-center justify-center">
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl">
                {activeVisual ? (
                  activeVisual.mime.startsWith("video/") ? (
                    <video
                      key={activeVisualEntry?.ref ?? "v"}
                      ref={videoRef}
                      src={stableAssetUrl(activeVisual.id, activeVisual.url)}
                      className="max-h-full max-w-full object-contain"
                      playsInline
                      muted={muted}
                    />
                  ) : (
                    <img
                      key={activeVisualEntry?.ref ?? "v"}
                      src={stableAssetUrl(activeVisual.id, activeVisual.url)}
                      alt={activeVisual.label ?? activeVisual.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  )
                ) : visualEntries.length > 0 || audioEntries.length > 0 ? (
                  <div className="h-full w-full" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted px-6 text-center text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      No clips yet. Click <Plus className="h-3 w-3" /> below to add one.
                    </span>
                  </div>
                )}
            </div>
          </div>



          {/* Hidden audio elements for timeline preview playback */}
          {audioEntries.map(({ ref, asset: a }) => (
            <audio
              key={ref}
              src={stableAssetUrl(a.id, a.url)}
              ref={(el) => {
                if (el) audioRefs.current.set(ref, el);
                else audioRefs.current.delete(ref);
              }}
              preload="auto"
              className="hidden"
            />
          ))}

          {/* Transport */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="text-muted-foreground transition hover:text-foreground"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {fmt(currentTime)}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsPlaying((p) => {
                  if (!p && currentTime >= totalSeconds - 0.05) {
                    setCurrentTime(0);
                  }
                  return !p;
                });
              }}
              disabled={visualEntries.length === 0 && audioEntries.length === 0}
              className="grid h-12 w-12 place-items-center rounded-full bg-foreground text-background shadow-elegant transition hover:opacity-90 disabled:opacity-40"
              aria-label={isPlaying ? "Pause" : "Play"}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 fill-current" />
              )}
            </button>
            <span className="w-10 font-mono text-xs tabular-nums text-muted-foreground">
              {fmt(totalSeconds)}
            </span>
            <button
              type="button"
              className="text-muted-foreground transition hover:text-foreground"
              aria-label="Fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>

          {/* Editor toolbar */}
          <div className="flex w-full items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={undo}
                disabled={!canUndo}
                aria-label="Undo"
                title="Undo (⌘Z)"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={redo}
                disabled={!canRedo}
                aria-label="Redo"
                title="Redo (⇧⌘Z)"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
              <div className="mx-1 h-4 w-px bg-border" />
              <Button
                variant="ghost"
                size="sm"
                onClick={splitAtPlayhead}
                disabled={!visualEntries.length && !audioEntries.length}
                aria-label="Split at playhead"
                title="Split at playhead (S)"
              >
                <Scissors className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={duplicateSelected}
                disabled={!selectedEntry}
                aria-label="Duplicate clip"
                title="Duplicate clip (⌘D)"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => selectedId && handleDelete(selectedId, { leaveGap: !e.altKey })}
                disabled={!selectedId}
                aria-label="Delete clip"
                title="Delete (⌫)"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
                disabled={zoom <= 0.5}
                aria-label="Zoom out"
                title="Zoom out"
                className="grid h-7 w-7 place-items-center rounded-md transition hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <ZoomOut className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
                disabled={zoom >= 2.5}
                aria-label="Zoom in"
                title="Zoom in"
                className="grid h-7 w-7 place-items-center rounded-md transition hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <ZoomIn className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>

          {/* Time ruler + clip strip */}
          <div className="w-full overflow-x-auto px-3">
            <div
              className="relative min-w-full"
              style={{ width: Math.max(totalSeconds * pxPerSec + 80, 480) }}
            >
              {/* Ruler — wrapped in the same flex row shape as the track
                  lanes below (w-10 label spacer + gap-2 + flex-1 lane) so
                  ruler ticks and the playhead marker share the same left
                  origin as the clips. Without this the marker sits ~48px
                  right of the cursor while scrubbing. */}
              <div className="mb-1 flex items-stretch gap-2">
                <div className="w-10 shrink-0" aria-hidden="true" />
                <div
                  className="relative h-5 flex-1 cursor-pointer select-none"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    const rulerEl = e.currentTarget;
                    const r = rulerEl.getBoundingClientRect();
                    const seek = (clientX: number) =>
                      seekTo(Math.max(0, (clientX - r.left) / Math.max(1, pxPerSec)));
                    seek(e.clientX);
                    const onMove = (ev: PointerEvent) => seek(ev.clientX);
                    const onUp = () => {
                      window.removeEventListener("pointermove", onMove);
                      window.removeEventListener("pointerup", onUp);
                    };
                    window.addEventListener("pointermove", onMove);
                    window.addEventListener("pointerup", onUp);
                  }}
                >
                  {Array.from({
                    length: Math.max(Math.ceil(totalSeconds) + 1, 1),
                  }).map((_, i) => {
                    const isMajor = i % 5 === 0;
                    return (
                      <div
                        key={i}
                        className="absolute top-0 flex flex-col items-center"
                        style={{ left: `${i * pxPerSec}px` }}
                      >
                        <div
                          className={cn(
                            "w-px bg-border",
                            isMajor ? "h-2.5" : "h-1.5",
                          )}
                        />
                        {isMajor && i !== 0 && (
                          <span className="mt-0.5 text-[10px] text-muted-foreground">
                            {i}s
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>





              {/* Lane stack — one row per track (V1, V2, … then A1, A2, …). */}
              {videoTracks.map((tr) => {
                const lay = trackLayouts.get(tr.id) ?? { entries: [], starts: [], end: 0 };
                const laneGaps: { start: number; end: number; nextRef: string }[] = [];
                {
                  let cursor = 0;
                  lay.entries.forEach((e, i) => {
                    const s = lay.starts[i];
                    if (s > cursor + 0.01) laneGaps.push({ start: cursor, end: s, nextRef: e.ref });
                    cursor = s + getDur(e.ref);
                  });
                }
                const isFirstVideo = tr.id === "v1";
                const dragOnThisTrack =
                  !!dragState &&
                  dragState.kind === "visual" &&
                  trackIdOfRef(dragState.ref) === tr.id;
                return (
                  <div key={tr.id} className={cn("flex items-stretch gap-2", !isFirstVideo && "mt-1.5")}>
                    <div className="grid w-10 shrink-0 place-items-center rounded-md bg-foreground/5 text-[10px] font-mono font-semibold text-muted-foreground">
                      {tr.name}
                    </div>
                    <div
                      data-track-kind="visual"
                      data-track-id={tr.id}
                      className={cn(
                        "relative h-14 flex-1 rounded-lg transition",
                        dropHint === `visual:${tr.id}` && "bg-foreground/5 ring-2 ring-foreground/30",
                      )}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDropHint(`visual:${tr.id}`);
                      }}
                      onDragLeave={() => setDropHint(null)}
                      onDrop={(e) => handleAppendDrop(e, "visual", tr.id)}
                    >
                      {laneGaps.map((g, i) => (
                        <button
                          key={`vgap-${tr.id}-${i}`}
                          type="button"
                          onClick={() => collapseGap("visual", g.nextRef)}
                          style={{
                            left: `${g.start * pxPerSec}px`,
                            width: `${(g.end - g.start) * pxPerSec}px`,
                          }}
                          className="group absolute top-0 h-14 rounded-md border border-dashed border-hairline bg-foreground/[0.02] transition hover:bg-foreground/[0.06]"
                          aria-label="Remove gap"
                          title="Click to remove gap"
                        >
                          <span className="pointer-events-none flex h-full w-full items-center justify-center text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
                            Remove gap
                          </span>
                        </button>
                      ))}
                      {lay.entries.map(({ ref, asset: a }, idx) => {
                        const isSel = ref === selectedId;
                        const dur = getDur(ref);
                        const widthPx = Math.max(24, dur * pxPerSec);
                        const leftPx = lay.starts[idx] * pxPerSec;
                        return (
                          <Popover
                            key={ref}
                            open={editClipFor === ref}
                            onOpenChange={(o) => setEditClipFor(o ? ref : null)}
                          >
                            <PopoverTrigger asChild>
                              <div
                                data-timeline-kind="visual"
                                data-timeline-ref={ref}
                                onPointerDown={(e) => {
                                  const t = e.target as HTMLElement;
                                  if (t.closest && t.closest("[data-trim-handle]")) return;
                                  beginMove(ref, e, "visual", tr.id);
                                }}
                                onPointerMove={(e) => {
                                  if (e.buttons !== 0) return;
                                  if (dragState) return;
                                  if (isPlaying) return;
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const localPx = e.clientX - rect.left;
                                  const localSec = localPx / Math.max(1, pxPerSec);
                                  const clipStart = lay.starts[idx] ?? 0;
                                  const t = Math.max(
                                    clipStart,
                                    Math.min(clipStart + dur, clipStart + localSec),
                                  );
                                  setSkimTime(t);
                                }}
                                onPointerLeave={() => setSkimTime(null)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => handleDropOnItem(ref, e, "visual")}
                                onClick={(e) => {
                                  setSelectedId(ref);
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const localPx = e.clientX - rect.left;
                                  const localSec = localPx / Math.max(1, pxPerSec);
                                  const clipStart = lay.starts[idx] ?? 0;
                                  seekTo(
                                    Math.max(
                                      clipStart,
                                      Math.min(clipStart + dur, clipStart + localSec),
                                    ),
                                  );
                                  setSkimTime(null);
                                  setEditClipFor(ref);
                                }}
                                style={
                                  dragState?.ref === ref
                                    ? {
                                        width: widthPx,
                                        left: `${dragState.ghostLeftPx}px`,
                                        top: `${dragState.ghostTopPx}px`,
                                        zIndex: 40,
                                        pointerEvents: "none",
                                        opacity: 0.85,
                                        boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
                                      }
                                    : { width: widthPx, left: `${leftPx}px` }
                                }
                                className={cn(
                                  "group absolute top-0 h-14 cursor-grab overflow-hidden rounded-lg bg-muted transition active:cursor-grabbing",
                                  isSel
                                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                                    : "ring-1 ring-border hover:ring-foreground/40",
                                  dragState && dragState.ref !== ref && "opacity-60",
                                )}
                              >
                                {a.kind === "pending" ? (
                                  <div className="grid h-full w-full place-items-center bg-muted/60 text-muted-foreground">
                                    <div className="flex items-center gap-1.5 px-2 text-[10px] uppercase tracking-wider">
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      <span className="truncate">Rendering…</span>
                                    </div>
                                  </div>
                                ) : a.mime.startsWith("image/") ? (
                                  <img
                                    src={stableAssetUrl(a.id, a.url)}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    draggable={false}
                                  />
                                ) : (
                                  <video
                                    src={stableAssetUrl(a.id, a.url)}
                                    muted
                                    draggable={false}
                                    className="h-full w-full object-cover"
                                  />
                                )}
                                <div
                                  data-trim-handle="start"
                                  onPointerDown={(e) => beginTrim(ref, "start", e)}
                                  onClick={(e) => e.stopPropagation()}
                                  draggable={false}
                                  className="absolute inset-y-0 left-0 z-10 w-2.5 cursor-ew-resize bg-foreground/0 transition hover:bg-foreground/50 group-hover:bg-foreground/30"
                                  title="Trim start"
                                />
                                <div
                                  data-trim-handle="end"
                                  onPointerDown={(e) => beginTrim(ref, "end", e)}
                                  onClick={(e) => e.stopPropagation()}
                                  draggable={false}
                                  className="absolute inset-y-0 right-0 z-10 w-2.5 cursor-ew-resize bg-foreground/0 transition hover:bg-foreground/50 group-hover:bg-foreground/30"
                                  title="Trim end"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(ref, { leaveGap: !e.altKey });
                                  }}
                                  className="absolute right-1.5 top-0.5 z-20 grid h-5 w-5 place-items-center rounded-md bg-background/80 text-foreground opacity-0 backdrop-blur-sm transition group-hover:opacity-100"
                                  aria-label="Delete clip"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </PopoverTrigger>
                            <PopoverContent side="top" align="start" className="w-72 p-2">
                              <ClipControls
                                refId={ref}
                                volume={getVolume(ref)}
                                onVolumeChange={(v) => setClipVolume(ref, v)}
                                showDetach={
                                  a.mime.startsWith("video/") &&
                                  !effectiveOrder.includes(makeDetachedAudioRef(ref))
                                }
                                onDetach={() => detachAudio(ref)}
                              />
                              <AssetActionsBody
                                asset={a}
                                onPick={(s) => pickEditClip(s, a, ref)}
                              />
                            </PopoverContent>
                          </Popover>
                        );
                      })}

                      <Popover
                        open={addClipForTrack === tr.id}
                        onOpenChange={(o) => setAddClipForTrack(o ? tr.id : null)}
                      >
                        <PopoverTrigger asChild>
                          {lay.entries.length === 0 ? (
                            <button
                              type="button"
                              className="flex h-14 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-hairline bg-secondary/30 text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
                              aria-label="Add clip"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add a clip
                            </button>
                          ) : (
                            <button
                              type="button"
                              style={{ left: `${lay.end * pxPerSec + 6}px` }}
                              className="absolute top-0 grid h-14 w-10 place-items-center rounded-lg border border-hairline bg-muted text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
                              aria-label="Add clip"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                        </PopoverTrigger>
                        <PopoverContent side="top" align="start" className="w-72 p-2">
                          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            <Plus className="h-3 w-3" /> Add a clip to {tr.name}
                          </div>
                          <AppPickerList
                            apps={appsProducingKind("visual")}
                            onPick={(s) => pickAddClip(s, tr.id)}
                          />
                          <div className="my-2 border-t border-hairline" />
                          <button
                            type="button"
                            onClick={() => {
                              setAddClipForTrack(null);
                              setLibraryPickerFor({ kind: "visual", trackId: tr.id });
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-muted"
                          >
                            <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted text-foreground">
                              <Plus className="h-3 w-3" />
                            </div>
                            <span>Choose from library</span>
                          </button>
                        </PopoverContent>
                      </Popover>


                      {dragOnThisTrack && (
                        <div
                          className="pointer-events-none absolute -top-1 bottom-0 z-30 w-0.5 rounded-full bg-[oklch(0.7_0.18_45)] shadow-[0_0_8px_oklch(0.7_0.18_45)]"
                          style={{ left: `${dragState.insertX}px` }}
                        />
                      )}

                      {isFirstVideo && trimHud && trimHud.kind === "visual" && (
                        <div
                          className="pointer-events-none absolute -top-6 z-40 rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background shadow-lg"
                          style={{ left: `${trimHud.leftPx + trimHud.widthPx / 2 - 30}px` }}
                        >
                          {trimHud.durSec.toFixed(2)}s{trimHud.altPin ? " · pinned" : ""}
                        </div>
                      )}

                      {isFirstVideo && (
                        <div
                          className="pointer-events-none absolute -top-5 bottom-0 w-px bg-[oklch(0.7_0.18_45)]"
                          style={{ left: `${currentTime * pxPerSec}px` }}
                        >
                          <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-[oklch(0.7_0.18_45)]" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {audioTracks.map((tr) => {
                const lay = trackLayouts.get(tr.id) ?? { entries: [], starts: [], end: 0 };
                const audioGapsLane: { start: number; end: number; nextRef: string }[] = [];
                {
                  let cursor = 0;
                  lay.entries.forEach((e, i) => {
                    const s = lay.starts[i];
                    if (s > cursor + 0.01) audioGapsLane.push({ start: cursor, end: s, nextRef: e.ref });
                    cursor = s + getDur(e.ref);
                  });
                }
                const isFirstAudio = tr.id === "a1";
                return (
                  <div key={tr.id} className={cn("flex items-stretch gap-2", isFirstAudio ? "mt-3" : "mt-1.5")}>
                    <div className="grid w-10 shrink-0 place-items-center rounded-md bg-foreground/5 text-[10px] font-mono font-semibold text-muted-foreground">
                      {tr.name}
                    </div>
                    <div
                      data-track-kind="audio"
                      data-track-id={tr.id}
                      className={cn(
                        "relative h-10 flex-1 rounded-lg transition",
                        dropHint === `audio:${tr.id}` && "bg-foreground/5 ring-2 ring-foreground/30",
                      )}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDropHint(`audio:${tr.id}`);
                      }}
                      onDragLeave={() => setDropHint(null)}
                      onDrop={(e) => handleAppendDrop(e, "audio", tr.id)}
                    >
                      {isFirstAudio && trimHud && trimHud.kind === "audio" && (
                        <div
                          className="pointer-events-none absolute -top-6 z-40 rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background shadow-lg"
                          style={{ left: `${trimHud.leftPx + trimHud.widthPx / 2 - 30}px` }}
                        >
                          {trimHud.durSec.toFixed(2)}s{trimHud.altPin ? " · pinned" : ""}
                        </div>
                      )}
                      {audioGapsLane.map((g, gi) => (
                        <button
                          key={`agap-${tr.id}-${gi}`}
                          type="button"
                          onClick={() => collapseGap("audio", g.nextRef)}
                          style={{
                            left: `${g.start * pxPerSec}px`,
                            width: `${(g.end - g.start) * pxPerSec}px`,
                          }}
                          className="absolute top-0 h-10 rounded-md border border-dashed border-hairline bg-foreground/[0.02] transition hover:bg-foreground/[0.06]"
                          aria-label="Remove gap"
                          title="Click to remove gap"
                        />
                      ))}
                      {dragState && dragState.kind === "audio" && trackIdOfRef(dragState.ref) === tr.id && (
                        <div
                          className="pointer-events-none absolute -top-1 bottom-0 z-30 w-0.5 rounded-full bg-[oklch(0.7_0.18_45)] shadow-[0_0_8px_oklch(0.7_0.18_45)]"
                          style={{ left: `${dragState.insertX}px` }}
                        />
                      )}
                      {lay.entries.map(({ ref, asset: a }, idx) => {
                        const wave = fakeWave(a.id, 140);
                        const dur = getDur(ref);
                        const widthPx = Math.max(40, dur * pxPerSec);
                        const leftPx = lay.starts[idx] * pxPerSec;
                        return (
                          <Popover
                            key={ref}
                            open={editAudioFor === ref}
                            onOpenChange={(o) => setEditAudioFor(o ? ref : null)}
                          >
                            <PopoverTrigger asChild>
                              <div
                                data-timeline-kind="audio"
                                data-timeline-ref={ref}
                                onPointerDown={(e) => {
                                  const t = e.target as HTMLElement;
                                  if (t.closest && t.closest("[data-trim-handle]")) return;
                                  beginMove(ref, e, "audio", tr.id);
                                }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => handleDropOnItem(ref, e, "audio")}
                                onClick={() => setEditAudioFor(ref)}
                                style={
                                  dragState?.ref === ref
                                    ? {
                                        left: `${dragState.ghostLeftPx}px`,
                                        top: `${dragState.ghostTopPx}px`,
                                        width: widthPx,
                                        zIndex: 40,
                                        pointerEvents: "none",
                                        opacity: 0.85,
                                        boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
                                      }
                                    : { left: `${leftPx}px`, width: widthPx }
                                }
                                className={cn(
                                  "group absolute top-0 h-10 cursor-grab overflow-hidden rounded-lg border border-hairline bg-secondary/60 text-left transition hover:bg-secondary active:cursor-grabbing",
                                  dragState && dragState.ref !== ref && "opacity-60",
                                )}
                              >
                                {/* Waveform background — purely decorative */}
                                <div className="pointer-events-none absolute inset-0 flex items-center gap-[2px] px-1">
                                  {wave.map((v, i) => (
                                    <div
                                      key={i}
                                      className="flex-1 rounded-full bg-secondary-foreground/30"
                                      style={{ height: `${Math.round(v * 75)}%` }}
                                    />
                                  ))}
                                </div>
                                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 max-w-[70%] truncate text-[10px] font-medium text-secondary-foreground drop-shadow-[0_1px_0_var(--background)]">
                                  {a.label ?? a.name ?? "Audio"}
                                </span>
                                <div
                                  data-trim-handle="start"
                                  onPointerDown={(e) => beginTrim(ref, "start", e)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute inset-y-0 left-0 z-10 w-2.5 cursor-ew-resize bg-foreground/0 transition hover:bg-foreground/50 group-hover:bg-foreground/30"
                                  title="Trim start"
                                />
                                <div
                                  data-trim-handle="end"
                                  onPointerDown={(e) => beginTrim(ref, "end", e)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute inset-y-0 right-0 z-10 w-2.5 cursor-ew-resize bg-foreground/0 transition hover:bg-foreground/50 group-hover:bg-foreground/30"
                                  title="Trim end"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(ref, { leaveGap: !e.altKey });
                                  }}
                                  className="absolute right-1.5 top-0.5 z-20 grid h-4 w-4 place-items-center rounded-md bg-background/80 text-foreground opacity-0 backdrop-blur-sm transition group-hover:opacity-100"
                                  aria-label="Delete audio"
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            </PopoverTrigger>
                            <PopoverContent side="top" align="start" className="w-72 p-2">
                              <ClipControls
                                refId={ref}
                                volume={getVolume(ref)}
                                onVolumeChange={(v) => setClipVolume(ref, v)}
                                showDetach={false}
                              />
                              <AssetActionsBody
                                asset={a}
                                onPick={(s) => pickEditAudio(s, a, ref)}
                              />
                            </PopoverContent>
                          </Popover>
                        );
                      })}

                      <Popover
                        open={addAudioForTrack === tr.id}
                        onOpenChange={(o) => setAddAudioForTrack(o ? tr.id : null)}
                      >
                        <PopoverTrigger asChild>
                          {lay.entries.length === 0 ? (
                            <button
                              type="button"
                              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-hairline bg-secondary/30 text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
                              aria-label="Add audio"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add audio
                            </button>
                          ) : (
                            <button
                              type="button"
                              style={{ left: `${lay.end * pxPerSec + 6}px` }}
                              className="absolute top-0 grid h-10 w-10 place-items-center rounded-lg border border-hairline bg-muted text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
                              aria-label="Add audio"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                        </PopoverTrigger>
                        <PopoverContent side="top" align="start" className="w-72 p-2">
                          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            <Plus className="h-3 w-3" /> Add audio to {tr.name}
                          </div>
                          <AppPickerList
                            apps={appsProducingKind("audio")}
                            onPick={(s) => pickAddAudio(s, tr.id)}
                          />
                          <div className="my-2 border-t border-hairline" />
                          <button
                            type="button"
                            onClick={() => {
                              setAddAudioForTrack(null);
                              setLibraryPickerFor({ kind: "audio", trackId: tr.id });
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-muted"
                          >
                            <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted text-foreground">
                              <Plus className="h-3 w-3" />
                            </div>
                            <span>Choose from library</span>
                          </button>
                        </PopoverContent>
                      </Popover>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent" />
      </div>



      <LibraryPickerModal
        open={!!libraryPickerFor}
        onClose={() => setLibraryPickerFor(null)}
        accept={libraryPickerFor?.kind === "audio" ? "audio" : "any"}
        onPick={(item) => {
          if (libraryPickerFor?.kind === "visual") {
            if (
              !item.mime.startsWith("image/") &&
              !item.mime.startsWith("video/")
            )
              return;
          }
          if (libraryPickerFor?.kind === "audio") {
            if (!item.mime.startsWith("audio/")) return;
          }
          void handleLibraryPick(item, libraryPickerFor?.trackId);
        }}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        projectId={projectId}
        hasMusic={audioEntries.length > 0}
        visualCount={visualEntries.length}
      />
    </div>
  );
}

// Media panel shown next to the video preview. Grid by default, with a
// list toggle. Items are draggable using the same
// `application/x-v2-asset-*` payload the outputs panel uses, so tracks
// accept them natively.
function TimelineMediaStrip({ assets }: { assets: ProjectAsset[] }) {
  const items = assets.filter(
    (a) =>
      a.mime.startsWith("image/") ||
      a.mime.startsWith("video/") ||
      a.mime.startsWith("audio/"),
  );
  const [view, setView] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    const saved = window.localStorage.getItem("studio:mediaView");
    return saved === "list" ? "list" : "grid";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("studio:mediaView", view);
    }
  }, [view]);

  return (
    <aside className="hidden w-56 shrink-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-card/40 md:flex">
      <div className="flex items-center justify-between border-b border-hairline px-2.5 py-1.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Media
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-hairline p-0.5">
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-label="Grid view"
            title="Grid"
            aria-pressed={view === "grid"}
            className={`grid h-5 w-5 place-items-center rounded transition ${
              view === "grid"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-label="List view"
            title="List"
            aria-pressed={view === "list"}
            className={`grid h-5 w-5 place-items-center rounded transition ${
              view === "list"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-3 text-[11px] text-muted-foreground">
            No media yet. Generations appear here.
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-1.5">
            {items.map((a) => (
              <MediaTile key={a.id} asset={a} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {items.map((a) => (
              <MediaRow key={a.id} asset={a} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function useMediaDrag(a: ProjectAsset) {
  return {
    draggable: true as const,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData("application/x-v2-asset-id", a.id);
      e.dataTransfer.setData("application/x-v2-asset-mime", a.mime);
      e.dataTransfer.effectAllowed = "copyMove";
    },
  };
}

function MediaTile({ asset: a }: { asset: ProjectAsset }) {
  const drag = useMediaDrag(a);
  return (
    <div
      {...drag}
      title={a.label ?? a.name}
      className="group relative cursor-grab overflow-hidden rounded-md border border-hairline bg-muted/40 active:cursor-grabbing"
    >
      <div className="aspect-square w-full">
        {a.mime.startsWith("image/") && (
          <img
            src={stableAssetUrl(a.id, a.url)}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        )}
        {a.mime.startsWith("video/") && (
          <video
            src={stableAssetUrl(a.id, a.url)}
            muted
            draggable={false}
            className="h-full w-full object-cover"
          />
        )}
        {a.mime.startsWith("audio/") && (
          <div className="grid h-full w-full place-items-center bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            Audio
          </div>
        )}
      </div>
    </div>
  );
}

function MediaRow({ asset: a }: { asset: ProjectAsset }) {
  const drag = useMediaDrag(a);
  return (
    <div
      {...drag}
      title={a.label ?? a.name}
      className="flex cursor-grab items-center gap-2 rounded-md border border-hairline bg-muted/30 p-1.5 text-left transition hover:bg-muted/60 active:cursor-grabbing"
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded bg-muted/60">
        {a.mime.startsWith("image/") && (
          <img
            src={stableAssetUrl(a.id, a.url)}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        )}
        {a.mime.startsWith("video/") && (
          <video
            src={stableAssetUrl(a.id, a.url)}
            muted
            draggable={false}
            className="h-full w-full object-cover"
          />
        )}
        {a.mime.startsWith("audio/") && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
            Audio
          </span>
        )}
      </div>
      <span className="truncate text-[11px] text-foreground/80">
        {a.label ?? a.name}
      </span>
    </div>
  );
}


// Per-clip controls shown at the top of the clip popover.
function ClipControls({
  refId,
  volume,
  onVolumeChange,
  showDetach,
  onDetach,
}: {
  refId: string;
  volume: number;
  onVolumeChange: (v: number) => void;
  showDetach: boolean;
  onDetach?: () => void;
}) {
  const [local, setLocal] = useState(volume);
  // Sync when the underlying volume changes (undo/redo, external edits).
  useEffect(() => {
    setLocal(volume);
  }, [volume, refId]);
  const pct = Math.round(local * 100);
  return (
    <div className="mb-2 flex flex-col gap-2 rounded-md bg-muted/40 p-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onVolumeChange(local > 0 ? 0 : 1)}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={local > 0 ? "Mute clip" : "Unmute clip"}
          title={local > 0 ? "Mute clip" : "Unmute clip"}
        >
          {local > 0 ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </button>
        <Slider
          value={[pct]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => setLocal((v[0] ?? 0) / 100)}
          onValueCommit={(v) => onVolumeChange((v[0] ?? 0) / 100)}
          className="flex-1"
          aria-label="Clip volume"
        />
        <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
          {pct}%
        </span>
      </div>
      {showDetach && (
        <button
          type="button"
          onClick={onDetach}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-hairline bg-background px-2 py-1.5 text-xs text-foreground hover:bg-muted"
          title="Move this clip's audio onto its own audio track"
        >
          <Scissors className="h-3 w-3" />
          Detach audio
        </button>
      )}
    </div>
  );
}

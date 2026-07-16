import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pause, Play } from "lucide-react";
import { getProject, useLocalProjectFn } from "@/lib/local-projects";
import {
  deriveTracks,
  type ProjectAsset,
  type TimelineTrack,
} from "@/lib/project-state";
import { stableAssetUrl } from "@/lib/v2/stable-asset-url";
import { cn } from "@/lib/utils";

const CLIP_SECONDS = 5;
const TIMELINE_INSTANCE_SEP = "::timeline-instance::";
const DETACHED_AUDIO_SUFFIX = "::audio";

function assetIdFromRef(ref: string) {
  const stripped = ref.endsWith(DETACHED_AUDIO_SUFFIX)
    ? ref.slice(0, -DETACHED_AUDIO_SUFFIX.length)
    : ref;
  return stripped.includes(TIMELINE_INSTANCE_SEP)
    ? stripped.split(TIMELINE_INSTANCE_SEP)[0]
    : stripped;
}
function isDetachedAudioRef(ref: string) {
  return ref.endsWith(DETACHED_AUDIO_SUFFIX);
}

type Props = {
  projectId?: string;
  className?: string;
  aspectRatio?: string;
  background?: "black" | "white" | "transparent";
  maxHeight?: number | string;
};

type Entry = { ref: string; asset: ProjectAsset };
type TrackLayout = {
  track: TimelineTrack;
  entries: Entry[];
  starts: number[];
  end: number;
};

export function TimelinePlayer({
  projectId,
  className,
  aspectRatio = "16/9",
  background = "black",
  maxHeight,
}: Props) {
  const fetchProject = useLocalProjectFn(getProject);
  const projectQ = useQuery({
    queryKey: ["v2-project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId! } }),
    enabled: !!projectId && projectId !== "anonymous-draft",
  });

  const serverAssets = projectQ.data?.assets ?? [];
  const projectState = projectQ.data?.project?.projectState;
  const timeline = projectState?.timeline;
  const trims = timeline?.trims ?? {};
  const trackList: TimelineTrack[] = useMemo(
    () =>
      projectState
        ? deriveTracks({ assets: serverAssets, timeline })
        : [],
    [projectState, serverAssets, timeline],
  );

  const assetsById = useMemo(
    () => new Map(serverAssets.map((a) => [a.id, a] as const)),
    [serverAssets],
  );

  const [probed, setProbed] = useState<Record<string, number>>({});
  const natural = useCallback(
    (id: string): number | undefined => {
      const a = assetsById.get(id);
      if (a && typeof a.duration === "number" && a.duration > 0) return a.duration;
      const p = probed[id];
      return p && p > 0 ? p : undefined;
    },
    [assetsById, probed],
  );

  const getTrim = useCallback(
    (ref: string) => {
      const t = trims[ref];
      if (t && (t.end ?? 0) > (t.start ?? 0)) return t;
      const id = assetIdFromRef(ref);
      const a = assetsById.get(id);
      const nat =
        a && (a.mime.startsWith("video/") || a.mime.startsWith("audio/"))
          ? natural(id)
          : undefined;
      return { start: 0, end: nat ?? CLIP_SECONDS };
    },
    [trims, assetsById, natural],
  );
  const getDur = useCallback(
    (ref: string) => {
      const t = getTrim(ref);
      return Math.max(0.2, (t.end ?? CLIP_SECONDS) - (t.start ?? 0));
    },
    [getTrim],
  );

  // Build per-track layout (entries + clip start times along the timeline).
  const layouts: TrackLayout[] = useMemo(() => {
    const out: TrackLayout[] = [];
    for (const tr of trackList) {
      const entries: Entry[] = [];
      for (const ref of tr.order) {
        const a = assetsById.get(assetIdFromRef(ref));
        if (!a) continue;
        const detached = isDetachedAudioRef(ref);
        if (tr.kind === "video") {
          if (detached) continue; // detached audio ref isn't a visual
          if (!(a.mime.startsWith("image/") || a.mime.startsWith("video/") || a.kind === "pending")) continue;
        }
        if (tr.kind === "audio") {
          const ok = a.mime.startsWith("audio/") || (detached && a.mime.startsWith("video/"));
          if (!ok) continue;
        }
        entries.push({ ref, asset: a });
      }
      const starts: number[] = [];
      let cursor = 0;
      for (const e of entries) {
        const t = trims[e.ref];
        const off = typeof t?.offset === "number" ? t.offset : cursor;
        starts.push(off);
        cursor = off + getDur(e.ref);
      }
      const end = starts.reduce(
        (m, s, i) => Math.max(m, s + getDur(entries[i].ref)),
        0,
      );
      out.push({ track: tr, entries, starts, end });
    }
    return out;
  }, [trackList, assetsById, trims, getDur]);

  const videoLayouts = useMemo(
    () => layouts.filter((l) => l.track.kind === "video"),
    [layouts],
  );
  const audioLayouts = useMemo(
    () => layouts.filter((l) => l.track.kind === "audio"),
    [layouts],
  );

  const allAudioEntries = useMemo(() => {
    const out: { trackId: string; ref: string; asset: ProjectAsset; start: number }[] = [];
    for (const l of audioLayouts) {
      l.entries.forEach((e, i) => {
        out.push({ trackId: l.track.id, ref: e.ref, asset: e.asset, start: l.starts[i] ?? 0 });
      });
    }
    return out;
  }, [audioLayouts]);

  // Solo logic: if any video track is soloed, only soloed tracks are audible/visible.
  const videoHasSolo = videoLayouts.some((l) => l.track.solo);
  const audioHasSolo = audioLayouts.some((l) => l.track.solo);
  const isTrackAudible = useCallback(
    (t: TimelineTrack) => {
      if (t.mute) return false;
      const solos = t.kind === "video" ? videoHasSolo : audioHasSolo;
      if (solos && !t.solo) return false;
      return true;
    },
    [videoHasSolo, audioHasSolo],
  );

  // Probe durations for media missing stored duration.
  useEffect(() => {
    const toProbe = serverAssets.filter(
      (a) =>
        (a.mime.startsWith("audio/") || a.mime.startsWith("video/")) &&
        !(typeof a.duration === "number" && a.duration > 0) &&
        probed[a.id] == null &&
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
      el.addEventListener("loadedmetadata", () => {
        if (cancelled) return;
        const d = el.duration;
        if (isFinite(d) && d > 0) {
          setProbed((p) => (p[a.id] ? p : { ...p, [a.id]: d }));
        }
        el.src = "";
      }, { once: true });
      el.addEventListener("error", () => {
        if (!cancelled) setProbed((p) => (p[a.id] != null ? p : { ...p, [a.id]: 0 }));
      }, { once: true });
    });
    return () => {
      cancelled = true;
    };
  }, [serverAssets, probed]);

  const totalSeconds = Math.max(...layouts.map((l) => l.end), 0.1);

  // ------------------------------------------------------------------
  // Ref-driven playhead. Rewriting setCurrentTime state at 60fps was
  // causing the entire component subtree to re-render every frame,
  // which triggered per-frame video seeks and visible stutter. We now
  // keep the wall clock in a ref, sync media imperatively from a RAF
  // loop, and only setState when the *active clip* actually changes
  // (that's the only visual thing that swaps in React).
  // ------------------------------------------------------------------
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const currentTimeRef = useRef(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeKeyRef = useRef<string | null>(null);

  const computeActiveKey = useCallback(
    (t: number): string | null => {
      for (let li = videoLayouts.length - 1; li >= 0; li--) {
        const l = videoLayouts[li];
        if (!isTrackAudible(l.track)) continue;
        for (let i = 0; i < l.entries.length; i++) {
          const s = l.starts[i];
          const d = getDur(l.entries[i].ref);
          if (t >= s && t < s + d) {
            return `${l.track.id}:${i}`;
          }
        }
      }
      return null;
    },
    [videoLayouts, isTrackAudible, getDur],
  );

  const activeVisual = useMemo(() => {
    if (!activeKey) return null;
    const [trackId, idxStr] = activeKey.split(":");
    const l = videoLayouts.find((x) => x.track.id === trackId);
    if (!l) return null;
    const idx = Number(idxStr);
    const entry = l.entries[idx];
    return entry ? { layout: l, idx, entry } : null;
  }, [activeKey, videoLayouts]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Imperative audio sync — runs from the RAF loop, no React re-render.
  const audioMetaRef = useRef(allAudioEntries);
  audioMetaRef.current = allAudioEntries;
  const audioTrackByIdRef = useRef(new Map<string, TimelineTrack>());
  audioTrackByIdRef.current = new Map(audioLayouts.map((l) => [l.track.id, l.track] as const));
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const syncAudio = useCallback(
    (t: number) => {
      const meta = audioMetaRef.current;
      const tracks = audioTrackByIdRef.current;
      for (const [ref, el] of audioRefs.current.entries()) {
        const m = meta.find((a) => a.ref === ref);
        const tr = m ? tracks.get(m.trackId) : undefined;
        const audible = tr ? !tr.mute && (!(tr.kind === "audio" && audioHasSolo) || tr.solo) : true;
        el.muted = mutedRef.current || !audible;
        const start = m?.start ?? 0;
        const dur = el.duration || getDur(ref);
        const local = t - start;
        const inWindow = local >= 0 && local < dur;
        if (!isPlayingRef.current || !inWindow || !audible) {
          if (!el.paused) el.pause();
          if (local < 0) { try { el.currentTime = 0; } catch { /* noop */ } }
          continue;
        }
        if (Math.abs(el.currentTime - local) > 0.5) {
          try { el.currentTime = local; } catch { /* noop */ }
        }
        if (el.paused) el.play().catch(() => {});
      }
    },
    [audioHasSolo, getDur],
  );

  // RAF loop — advances currentTimeRef, updates audio imperatively,
  // only setState when the active visual clip changes.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last: number | null = null;
    const tick = (ts: number) => {
      if (last == null) last = ts;
      const dt = (ts - last) / 1000;
      last = ts;
      let next = currentTimeRef.current + dt;
      if (next >= totalSeconds) {
        next = totalSeconds;
        currentTimeRef.current = next;
        syncAudio(next);
        setIsPlaying(false);
        return;
      }
      currentTimeRef.current = next;
      syncAudio(next);
      const nk = computeActiveKey(next);
      if (nk !== activeKeyRef.current) {
        activeKeyRef.current = nk;
        setActiveKey(nk);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, totalSeconds, computeActiveKey, syncAudio]);

  // Seek video element only when the active clip changes or play toggles.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (!activeVisual || !activeVisual.entry.asset.mime.startsWith("video/")) {
      v.pause();
      return;
    }
    const clipStart = activeVisual.layout.starts[activeVisual.idx] ?? 0;
    const trim = getTrim(activeVisual.entry.ref);
    const target = (trim.start ?? 0) + Math.max(0, currentTimeRef.current - clipStart);
    if (Number.isFinite(target) && Math.abs(v.currentTime - target) > 0.4) {
      try { v.currentTime = target; } catch { /* noop */ }
    }
    if (isPlaying) v.play().catch(() => {});
    else v.pause();
  }, [isPlaying, muted, activeVisual, getTrim]);

  // Also react to muted changes for audio elements without touching state.
  useEffect(() => {
    syncAudio(currentTimeRef.current);
  }, [muted, syncAudio]);

  const hasContent = layouts.some((l) => l.entries.length > 0);
  const togglePlay = () => {
    if (!hasContent) return;
    if (currentTimeRef.current >= totalSeconds - 0.05) {
      currentTimeRef.current = 0;
      const nk = computeActiveKey(0);
      activeKeyRef.current = nk;
      setActiveKey(nk);
    } else if (!isPlayingRef.current) {
      // Ensure the visible clip matches the current playhead before starting.
      const nk = computeActiveKey(currentTimeRef.current);
      if (nk !== activeKeyRef.current) {
        activeKeyRef.current = nk;
        setActiveKey(nk);
      }
    }
    setIsPlaying((p) => !p);
  };

  const isPendingActive = activeVisual?.entry.asset.kind === "pending";

  return (
    <div className={cn("flex flex-col items-center gap-3 w-full", className)}>
      <div
        className={cn(
          "relative max-w-full overflow-hidden rounded-xl",
          background === "white" ? "bg-white" : "bg-black",
        )}
        style={{ aspectRatio, height: maxHeight, width: maxHeight ? "auto" : "100%" }}
      >
        {activeVisual && !isPendingActive ? (
          activeVisual.entry.asset.mime.startsWith("video/") ? (
            <video
              key={activeVisual.entry.ref}
              ref={videoRef}
              src={stableAssetUrl(activeVisual.entry.asset.id, activeVisual.entry.asset.url)}
              className="h-full w-full object-contain"
              playsInline
              muted={muted}
            />
          ) : (
            <img
              key={activeVisual.entry.ref}
              src={stableAssetUrl(activeVisual.entry.asset.id, activeVisual.entry.asset.url)}
              alt={activeVisual.entry.asset.label ?? activeVisual.entry.asset.name}
              className="h-full w-full object-contain"
            />
          )
        ) : isPendingActive ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/40 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
              Rendering…
            </span>
          </div>
        ) : hasContent ? (
          <div className="h-full w-full bg-black" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
            No timeline content
          </div>
        )}

        {hasContent && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className={cn(
              "group absolute inset-0 flex items-center justify-center transition",
              isPlaying ? "bg-transparent" : "bg-black/20 hover:bg-black/30",
            )}
          >
            <span
              className={cn(
                "grid h-14 w-14 place-items-center rounded-full bg-black/70 text-white transition",
                isPlaying
                  ? "opacity-0 group-hover:opacity-100"
                  : "opacity-100",
              )}
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6 translate-x-[2px]" />
              )}
            </span>
          </button>
        )}
      </div>

      {allAudioEntries.map(({ ref, asset: a }) => (
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
    </div>
  );
}

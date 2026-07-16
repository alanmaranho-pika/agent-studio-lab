// useTimelinePlayback — sequential playback over a TimelineModel, adapted
// from the v2 TimelinePlayer's ref-driven architecture:
//   • the wall clock lives in currentTimeRef; a RAF loop advances it and
//     syncs media imperatively — React state changes only at clip
//     boundaries (activeClip) and play/mute toggles.
//   • Playhead/timecode UI subscribes via subscribeTime and writes DOM
//     styles directly, so nothing re-renders per frame.
//   • Audio = pool of hidden <audio> elements registered by ref; drift
//     corrected past 0.5s while playing, exact on seek.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimelineClip, TimelineModel } from "./use-timeline-model";

export type TimelinePlayback = {
  isPlaying: boolean;
  muted: boolean;
  toggleMuted: () => void;
  togglePlay: () => void;
  pause: () => void;
  seek: (t: number) => void;
  stepClip: (dir: -1 | 1) => void;
  currentTimeRef: React.MutableRefObject<number>;
  activeClip: TimelineClip | null;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  registerAudio: (ref: string, el: HTMLAudioElement | null) => void;
  subscribeTime: (cb: (t: number) => void) => () => void;
  /** Playable window (scenes variant constrains to the focused scene). */
  range: { start: number; end: number };
};

export function useTimelinePlayback(
  model: TimelineModel,
  opts?: { range?: { start: number; end: number } },
): TimelinePlayback {
  const range = useMemo(
    () => ({
      start: Math.max(0, opts?.range?.start ?? 0),
      end: Math.min(model.totalDuration, opts?.range?.end ?? model.totalDuration) || 0.1,
    }),
    [opts?.range?.start, opts?.range?.end, model.totalDuration],
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [activeClip, setActiveClip] = useState<TimelineClip | null>(null);

  const currentTimeRef = useRef(range.start);
  const activeRefRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const subscribersRef = useRef<Set<(t: number) => void>>(new Set());

  // Mirror refs so RAF closures read fresh values without re-subscribing.
  const clipsRef = useRef(model.clips);
  clipsRef.current = model.clips;
  const audioMetaRef = useRef(model.audio);
  audioMetaRef.current = model.audio;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const notify = useCallback((t: number) => {
    for (const cb of subscribersRef.current) cb(t);
  }, []);

  const subscribeTime = useCallback((cb: (t: number) => void) => {
    subscribersRef.current.add(cb);
    cb(currentTimeRef.current);
    return () => {
      subscribersRef.current.delete(cb);
    };
  }, []);

  const computeActiveClip = useCallback((t: number): TimelineClip | null => {
    const clips = clipsRef.current;
    for (let i = clips.length - 1; i >= 0; i--) {
      const c = clips[i];
      if (t >= c.start && t < c.start + c.duration) return c;
    }
    return null;
  }, []);

  const setActive = useCallback(
    (t: number) => {
      const next = computeActiveClip(t);
      if ((next?.ref ?? null) !== activeRefRef.current) {
        activeRefRef.current = next?.ref ?? null;
        setActiveClip(next);
      }
      return next;
    },
    [computeActiveClip],
  );

  const syncAudio = useCallback((t: number) => {
    const meta = audioMetaRef.current;
    for (const [ref, el] of audioRefs.current.entries()) {
      const m = meta.find((a) => a.ref === ref);
      el.muted = mutedRef.current;
      const start = m?.start ?? 0;
      const trimStart = m?.trim.start ?? 0;
      const dur = m?.duration ?? el.duration ?? 0;
      const local = t - start;
      const inWindow = local >= 0 && local < dur;
      if (!isPlayingRef.current || !inWindow) {
        if (!el.paused) el.pause();
        if (local < 0) {
          try {
            el.currentTime = trimStart;
          } catch {
            /* noop */
          }
        }
        continue;
      }
      const target = trimStart + local;
      if (Math.abs(el.currentTime - target) > 0.5) {
        try {
          el.currentTime = target;
        } catch {
          /* noop */
        }
      }
      if (el.paused) el.play().catch(() => {});
    }
  }, []);

  /** Seek the paused/playing video element to match the wall clock. */
  const syncVideo = useCallback(
    (t: number, clip: TimelineClip | null, drift: number) => {
      const v = videoRef.current;
      if (!v || !clip || clip.kind !== "video") return;
      const target = clip.trim.start + Math.max(0, t - clip.start);
      if (!Number.isFinite(target)) return;
      const apply = () => {
        if (Math.abs(v.currentTime - target) > drift) {
          try {
            v.currentTime = target;
          } catch {
            /* noop */
          }
        }
      };
      if (v.readyState >= 1) apply();
      else v.addEventListener("loadedmetadata", apply, { once: true });
    },
    [],
  );

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(range.start, Math.min(range.end, t));
      currentTimeRef.current = clamped;
      const clip = setActive(clamped);
      syncAudio(clamped);
      syncVideo(clamped, clip, 0.03);
      notify(clamped);
    },
    [range.start, range.end, setActive, syncAudio, syncVideo, notify],
  );

  // RAF loop.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last: number | null = null;
    const tick = (ts: number) => {
      if (last == null) last = ts;
      const dt = (ts - last) / 1000;
      last = ts;
      let next = currentTimeRef.current + dt;
      if (next >= range.end) {
        next = range.end;
        currentTimeRef.current = next;
        syncAudio(next);
        notify(next);
        setIsPlaying(false);
        return;
      }
      currentTimeRef.current = next;
      syncAudio(next);
      setActive(next);
      notify(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, range.end, syncAudio, setActive, notify]);

  // Seek/play the video element when the active clip or play state changes.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (!activeClip || activeClip.kind !== "video") {
      v.pause();
      return;
    }
    syncVideo(currentTimeRef.current, activeClip, 0.4);
    if (isPlaying) v.play().catch(() => {});
    else v.pause();
  }, [isPlaying, muted, activeClip, syncVideo]);

  // Mute changes reach the audio pool without a state round-trip.
  useEffect(() => {
    syncAudio(currentTimeRef.current);
  }, [muted, syncAudio]);

  // Model swaps (reorder/trim) can leave the playhead outside the new
  // range or pointing at a stale clip — re-resolve.
  useEffect(() => {
    const t = Math.max(range.start, Math.min(range.end, currentTimeRef.current));
    currentTimeRef.current = t;
    setActive(t);
    notify(t);
  }, [model, range.start, range.end, setActive, notify]);

  const togglePlay = useCallback(() => {
    if (clipsRef.current.length === 0 && audioMetaRef.current.length === 0) return;
    if (currentTimeRef.current >= range.end - 0.05) {
      currentTimeRef.current = range.start;
      setActive(range.start);
      notify(range.start);
    } else if (!isPlayingRef.current) {
      setActive(currentTimeRef.current);
    }
    setIsPlaying((p) => !p);
  }, [range.start, range.end, setActive, notify]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const stepClip = useCallback(
    (dir: -1 | 1) => {
      const clips = clipsRef.current.filter(
        (c) => c.start + c.duration > range.start && c.start < range.end,
      );
      if (!clips.length) return;
      const t = currentTimeRef.current;
      if (dir === 1) {
        const next = clips.find((c) => c.start > t + 0.05);
        seek(next ? next.start : range.end);
      } else {
        const prevs = clips.filter((c) => c.start < t - 0.05);
        seek(prevs.length ? prevs[prevs.length - 1].start : range.start);
      }
    },
    [seek, range.start, range.end],
  );

  const registerAudio = useCallback((ref: string, el: HTMLAudioElement | null) => {
    if (el) audioRefs.current.set(ref, el);
    else audioRefs.current.delete(ref);
  }, []);

  const toggleMuted = useCallback(() => setMuted((m) => !m), []);

  return {
    isPlaying,
    muted,
    toggleMuted,
    togglePlay,
    pause,
    seek,
    stepClip,
    currentTimeRef,
    activeClip,
    videoRef,
    registerAudio,
    subscribeTime,
    range,
  };
}

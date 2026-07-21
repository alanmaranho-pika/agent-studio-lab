import { useEffect, useRef } from "react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

/**
 * Conversational voice mode. One getUserMedia stream powers three things:
 *
 *  1. Reactive glow — a smoothed RMS level is written to a CSS custom
 *     property on `glowRef` every animation frame (never re-renders React).
 *  2. VAD — the same level segments speech into utterances: speech starts
 *     when the level crosses START_LEVEL, ends after END_SILENCE_MS below
 *     END_LEVEL (a natural pause).
 *  3. Capture — a MediaRecorder runs continuously (so the first syllable is
 *     never clipped); on utterance end the recording is transcribed
 *     server-side (/api/transcribe → Whisper via fal) and `onFinal` fires.
 *     While speaking, periodic partial transcriptions stream words into the
 *     composer via `onPartial`.
 *
 * The Web Speech API was dropped: its cloud recognizer is unavailable in
 * Electron-based shells and several Chromium forks, so it silently produced
 * nothing. This pipeline only needs getUserMedia + MediaRecorder.
 */
export function useVoiceMode(opts: {
  /** Voice mode on/off. Flipping false tears everything down. */
  active: boolean;
  /** While true (agent busy), the glow keeps reacting but speech is ignored. */
  paused: boolean;
  /** Node whose `--voice-level` custom property receives the glow level. */
  glowRef: React.RefObject<HTMLElement | null>;
  /** Interim transcript while the user is mid-utterance. */
  onPartial: (text: string) => void;
  /** Final transcript for an utterance — caller submits it. */
  onFinal: (text: string) => void;
  /** Capture phase, for live UI feedback (placeholder, indicators). */
  onState?: (state: "idle" | "listening" | "transcribing") => void;
  /** Fatal capture failure (mic denied, recorder unavailable). */
  onFatal?: () => void;
}): void {
  const { active, paused, glowRef, onPartial, onFinal, onState, onFatal } = opts;

  // Latest-value refs so the main effect only restarts on `active` changes.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onPartialRef = useRef(onPartial);
  onPartialRef.current = onPartial;
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  const onFatalRef = useRef(onFatal);
  onFatalRef.current = onFatal;

  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onFatalRef.current?.();
      return;
    }

    // VAD tuning (levels are post-EMA, 0..1).
    const START_LEVEL = 0.1; // speech begins above this
    const END_LEVEL = 0.05; //  …and ends once below this…
    const END_SILENCE_MS = 900; //  …for this long (the "natural pause")
    const MIN_SPEECH_MS = 300; // shorter bursts are discarded as noise
    const MAX_UTTERANCE_MS = 30_000; // hard cap per utterance
    const PARTIAL_EVERY_MS = 700; // interim transcription cadence
    const FIRST_PARTIAL_MS = 450; // fire the first partial fast for early feedback
    const IDLE_RECYCLE_MS = 15_000; // bound silent-recording memory
    const ATTACK = 0.35;
    const RELEASE = 0.08;
    const GAIN = 3.5;

    let aborted = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let mimeType = "";
    let recorderStartedAt = 0;
    let smoothed = 0;

    // Utterance state.
    let speaking = false;
    let speechStartAt = 0;
    let lastVoiceAt = 0;
    let lastPartialAt = 0;
    let utterance = 0; // id — guards stale partials against the current utterance
    let finalizedUtterance = -1;
    let partialInFlight = false;
    let finalizing = false;

    const writeLevel = (v: string) => glowRef.current?.style.setProperty("--voice-level", v);

    let lastState = "";
    const emitState = (s: "idle" | "listening" | "transcribing") => {
      if (s === lastState) return;
      lastState = s;
      onStateRef.current?.(s);
    };

    const pickMime = (): string => {
      for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
        if (MediaRecorder.isTypeSupported(m)) return m;
      }
      return "";
    };

    const blobToDataUri = (blob: Blob): Promise<string> =>
      new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });

    const transcribe = async (blob: Blob): Promise<string> => {
      if (blob.size < 1_000) return ""; // near-empty container
      try {
        const audio = await blobToDataUri(blob);
        const res = await fetchWithAuth("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio }),
        });
        if (!res.ok) return "";
        const json = (await res.json().catch(() => ({}))) as { text?: string };
        return (json.text ?? "").trim();
      } catch {
        return "";
      }
    };

    const startRecorder = () => {
      if (aborted || !stream) return;
      chunks = [];
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      } catch {
        onFatalRef.current?.();
        return;
      }
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.start(250); // timeslice — chunks accumulate for partials
      recorderStartedAt = performance.now();
    };

    /** Stop the recorder and resolve with the complete (valid) recording. */
    const stopRecorder = (): Promise<Blob> =>
      new Promise((resolve) => {
        const rec = recorder;
        recorder = null;
        if (!rec || rec.state === "inactive") {
          resolve(new Blob(chunks, { type: mimeType || "audio/webm" }));
          return;
        }
        rec.onstop = () => resolve(new Blob(chunks, { type: mimeType || rec.mimeType }));
        try {
          rec.stop();
        } catch {
          resolve(new Blob(chunks, { type: mimeType || "audio/webm" }));
        }
      });

    /** Drop the current recording (silence, noise) and start a fresh one. */
    const recycleRecorder = () => {
      void stopRecorder().then(() => {
        if (!aborted) startRecorder();
      });
    };

    const finalizeUtterance = () => {
      const utt = utterance;
      finalizedUtterance = utt;
      finalizing = true;
      emitState("transcribing");
      void stopRecorder().then(async (blob) => {
        if (!aborted) startRecorder(); // re-arm for the next utterance immediately
        const text = await transcribe(blob);
        finalizing = false;
        if (aborted || utt !== finalizedUtterance) return;
        emitState("idle");
        // Always hand the result to the caller (even ""), which owns the
        // word-by-word reveal and the eventual dispatch.
        onFinalRef.current(text);
      });
    };

    const requestPartial = () => {
      const utt = utterance;
      partialInFlight = true;
      // Chunks flow every 250ms; a snapshot of what's accumulated is a valid
      // container (header lives in chunk 0).
      const blob = new Blob(chunks.slice(), { type: mimeType || "audio/webm" });
      void transcribe(blob).then((text) => {
        partialInFlight = false;
        if (aborted || !text) return;
        // Only surface if this utterance is still the live one.
        // Show even if speech just ended, until the final supersedes it.
        if (utt === utterance && utt !== finalizedUtterance) {
          onPartialRef.current(text);
        }
      });
    };

    const tick = () => {
      if (!ctx || aborted) return;
      raf = requestAnimationFrame(tick);
      if (!analyser) return;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const x = (buf[i] - 128) / 128;
        sum += x * x;
      }
      const raw = Math.min(1, Math.sqrt(sum / buf.length) * GAIN);
      smoothed += (raw > smoothed ? ATTACK : RELEASE) * (raw - smoothed);
      writeLevel(smoothed.toFixed(3));

      const now = performance.now();
      if (!speaking) {
        if (
          !pausedRef.current &&
          !finalizing &&
          smoothed >= START_LEVEL &&
          recorder?.state === "recording"
        ) {
          speaking = true;
          utterance += 1;
          speechStartAt = now;
          lastVoiceAt = now;
          // Bias the first partial to fire ~FIRST_PARTIAL_MS in, not a full interval.
          lastPartialAt = now - (PARTIAL_EVERY_MS - FIRST_PARTIAL_MS);
          emitState("listening");
        } else if (
          recorder?.state === "recording" &&
          now - recorderStartedAt > IDLE_RECYCLE_MS
        ) {
          recycleRecorder(); // don't let silent recordings grow unbounded
        }
        return;
      }

      // Speaking.
      if (pausedRef.current) {
        // Agent became busy mid-utterance (e.g. manual send) — drop it.
        speaking = false;
        emitState("idle");
        recycleRecorder();
        return;
      }
      if (smoothed >= END_LEVEL) lastVoiceAt = now;
      if (
        !partialInFlight &&
        now - lastPartialAt >= PARTIAL_EVERY_MS &&
        recorder?.state === "recording"
      ) {
        lastPartialAt = now;
        requestPartial();
      }
      const pausedLongEnough = now - lastVoiceAt >= END_SILENCE_MS;
      const maxed = now - speechStartAt >= MAX_UTTERANCE_MS;
      if (pausedLongEnough || maxed) {
        speaking = false;
        if (lastVoiceAt - speechStartAt >= MIN_SPEECH_MS) {
          finalizeUtterance();
        } else {
          emitState("idle"); // too short — noise
          recycleRecorder();
        }
      }
    };

    let analyser: AnalyserNode | null = null;
    let buf = new Uint8Array(0);

    const start = async () => {
      let localStream: MediaStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        onFatalRef.current?.();
        return;
      }
      if (aborted) {
        localStream.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = localStream;
      mimeType = pickMime();

      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        onFatalRef.current?.();
        return;
      }
      ctx = new Ctor();
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* ignore */
        }
      }
      if (aborted) return;

      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      ctx.createMediaStreamSource(stream).connect(analyser);
      buf = new Uint8Array(analyser.fftSize);

      startRecorder();
      raf = requestAnimationFrame(tick);
    };

    void start();

    return () => {
      aborted = true;
      if (raf) cancelAnimationFrame(raf);
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
      recorder = null;
      stream?.getTracks().forEach((t) => t.stop());
      if (ctx) {
        try {
          void ctx.close();
        } catch {
          /* already closed */
        }
      }
      writeLevel("0");
    };
  }, [active, glowRef]);
}

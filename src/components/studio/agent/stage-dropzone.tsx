// StageDropzone — full-viewport drag-and-drop for the center stage. Files can
// be dropped ANYWHERE on the window (the stage is the only interface): when an
// upload turn is on the stage the agent already has the context, otherwise the
// agent infers or asks. Two states, mirroring the Figma spec:
//   • dragging  → dark takeover, "Drop your files to start uploading" + hint
//   • uploading → green progress fill sweeping in from the left, "Uploading…"
// ESC cancels either state. The actual upload + dispatch is owned by the shell
// via `onDropFiles(files, signal)`; this component owns detection, the overlay,
// and the progress choreography, and aborts the handoff if the user hits ESC.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  SOFT_EASE,
  useReducedMotion,
} from "@/components/studio/agent/motion-primitives";

type Phase = "idle" | "dragging" | "uploading";

// A drop feels instant on small files; hold the "Uploading…" state briefly so
// the green sweep actually reads instead of flashing.
const MIN_UPLOAD_MS = 550;

export function StageDropzone({
  onDropFiles,
  disabled = false,
  acceptHint = "Images, video, or audio · up to 25 MB",
}: {
  onDropFiles: (files: File[], signal: AbortSignal) => Promise<void>;
  disabled?: boolean;
  acceptHint?: string;
}) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState(false);

  // Native drag events fire per-descendant; a depth counter tells us when the
  // cursor has truly left the window (depth back to 0) vs. crossed a child.
  const dragDepth = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Latest values read inside the window listeners (attached once).
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onDropFilesRef = useRef(onDropFiles);
  onDropFilesRef.current = onDropFiles;

  const reset = useCallback(() => {
    dragDepth.current = 0;
    abortRef.current = null;
    setPhase("idle");
    setDone(false);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    reset();
  }, [reset]);

  const runUpload = useCallback(
    async (files: File[]) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setDone(false);
      setPhase("uploading");
      const startedAt = Date.now();
      try {
        await onDropFilesRef.current(files, controller.signal);
      } catch (err) {
        console.error("[stage-dropzone] drop handling failed", err);
      }
      if (controller.signal.aborted) return; // ESC won the race
      const elapsed = Date.now() - startedAt;
      const finish = () => {
        if (controller.signal.aborted) return;
        setDone(true); // green sweeps to 100%
        window.setTimeout(() => {
          if (!controller.signal.aborted) reset();
        }, 320);
      };
      if (elapsed < MIN_UPLOAD_MS) window.setTimeout(finish, MIN_UPLOAD_MS - elapsed);
      else finish();
    },
    [reset],
  );
  const runUploadRef = useRef(runUpload);
  runUploadRef.current = runUpload;

  // Window-level file-drag detection (attached once). We always preventDefault
  // for file drags so a stray drop never navigates the tab away from the app,
  // even while disabled (busy / a picker is open) — we just don't take action.
  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (disabledRef.current || phaseRef.current === "uploading") return;
      dragDepth.current += 1;
      if (phaseRef.current === "idle") setPhase("dragging");
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer)
        e.dataTransfer.dropEffect = disabledRef.current ? "none" : "copy";
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0 && phaseRef.current === "dragging") setPhase("idle");
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      if (disabledRef.current || phaseRef.current === "uploading") {
        if (phaseRef.current === "dragging") setPhase("idle");
        return;
      }
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) {
        setPhase("idle");
        return;
      }
      void runUploadRef.current(files);
    };
    // Reset if a drag is abandoned outside the window.
    const onDragEnd = () => {
      dragDepth.current = 0;
      if (phaseRef.current === "dragging") setPhase("idle");
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", onDragEnd);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", onDragEnd);
    };
  }, []);

  // ESC cancels the drag prompt or an in-flight upload handoff.
  useEffect(() => {
    if (phase === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, cancel]);

  const uploading = phase === "uploading";

  return (
    <AnimatePresence>
      {phase !== "idle" && (
        <motion.div
          key="stage-dropzone"
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden"
          style={{ backgroundColor: "var(--surface-dark-2)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: SOFT_EASE }}
          role="dialog"
          aria-label={uploading ? "Uploading files" : "Drop files to upload"}
          aria-live="polite"
        >
          {/* Green upload progress — sweeps in from the left, snapping to full
              once the handoff resolves. */}
          {uploading && (
            <motion.div
              className="absolute inset-y-0 left-0"
              style={{ backgroundColor: "var(--green)" }}
              initial={{ width: "0%" }}
              animate={{ width: done ? "100%" : "90%" }}
              transition={
                done
                  ? { duration: 0.3, ease: SOFT_EASE }
                  : { duration: 6, ease: "linear" }
              }
            />
          )}

          {/* ESC to cancel — top right */}
          <div className="absolute right-10 top-10 z-10 flex items-center gap-2.5">
            <span
              className="flex h-11 items-center justify-center rounded-xl border px-3 text-[15px] font-medium leading-none"
              style={{
                borderColor: "rgba(255,255,255,0.25)",
                color: "rgba(252,250,247,0.7)",
              }}
            >
              ESC
            </span>
            <span
              className="text-[15px] font-medium"
              style={{ color: "rgba(252,250,247,0.7)" }}
            >
              to Cancel
            </span>
          </div>

          {/* Center message */}
          <div className="relative z-10 flex flex-col items-center gap-4 px-8 text-center">
            <motion.h2
              key={uploading ? "uploading" : "dragging"}
              className="font-display text-white"
              style={{ fontSize: "clamp(2rem, 5vw, 4rem)", lineHeight: 1 }}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: SOFT_EASE }}
            >
              {uploading ? "Uploading…" : "Drop your files to start uploading"}
            </motion.h2>
            {!uploading && (
              <p
                className="text-[17px]"
                style={{ color: "rgba(252,250,247,0.5)" }}
              >
                {acceptHint}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

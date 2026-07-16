import { useSyncExternalStore } from "react";
import type { Skill } from "@/lib/skills";

/**
 * Module-level store for in-flight app generation runs and output metadata.
 *
 * The Apps workspace component unmounts when the user navigates away (e.g. to
 * Projects or Library). Keeping run state in component-local `useState` meant
 * the in-progress UI vanished when the user came back, even though the async
 * polling closure was still running. Hoisting state out of the component lets
 * the running closures keep updating a singleton, and the workspace re-reads
 * it on remount.
 */

export type Subclip = { startSec: number; endSec: number; label?: string };

export type TimelineIntent =
  | { kind: "appendVisual"; targetTrackId?: string }
  | { kind: "appendAudio"; targetTrackId?: string }
  | { kind: "appendSubclips"; subclips: Subclip[] }
  | { kind: "replaceClip"; targetRef: string }
  | { kind: "replaceAudio"; targetRef: string };

export type ActiveRun = {
  id: string;
  skill: Skill;
  projectId: string;
  prompt: string;
  phase: "starting" | "polling" | "error";
  error?: string;
  intent?: TimelineIntent;
  refImageUrls?: string[];
};

export type OutputMeta = {
  prompt: string;
  skillId: string;
  /** Optional friendly display title (overrides skill.label in captions). */
  title?: string;
  /** Optional one-line description (overrides prompt in captions). */
  description?: string;
};

type State = {
  runs: Record<string, ActiveRun>;
  outputMeta: Record<string, OutputMeta>;
};

let state: State = { runs: {}, outputMeta: {} };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const runsStore = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setRun(id: string, run: ActiveRun) {
    state = { ...state, runs: { ...state.runs, [id]: run } };
    emit();
  },
  updateRun(id: string, patch: Partial<ActiveRun>) {
    const cur = state.runs[id];
    if (!cur) return;
    state = { ...state, runs: { ...state.runs, [id]: { ...cur, ...patch } } };
    emit();
  },
  dismissRun(id: string) {
    if (!(id in state.runs)) return;
    const next = { ...state.runs };
    delete next[id];
    state = { ...state, runs: next };
    emit();
  },
  setOutputMeta(assetId: string, meta: OutputMeta) {
    state = {
      ...state,
      outputMeta: { ...state.outputMeta, [assetId]: meta },
    };
    emit();
  },
};

export function useRunsStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    runsStore.subscribe,
    () => selector(state),
    () => selector(state),
  );
}

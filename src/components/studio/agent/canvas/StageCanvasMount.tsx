// Client-only boundary for the full-stage WebGL renderer. Pixi must never
// execute during TanStack Start SSR, so the stage is lazy-loaded behind a
// mounted guard; pixi.js (~450KB min) only downloads when a canvas turn
// actually renders.

import { lazy, Suspense, useEffect, useState } from "react";
import type { RenderTurn } from "@/lib/agent/ui-schema";
import type { CardAnswer } from "@/components/studio/generative-card";

const CanvasStage = lazy(() => import("./CanvasStage"));

export type StageCanvasProps = {
  turn: RenderTurn;
  /** Last user prompt, echoed above the prose ("| …"). */
  echoText?: string;
  /** Status line under the prose ("Waiting for you"). */
  statusText?: string;
  /** Stable per-turn key (assistant message id) — seeds scatter + keys the
   * turn entrance. */
  seedKey?: string;
  onAnswer: (answer: CardAnswer) => void;
};

export function StageCanvasMount(props: StageCanvasProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <CanvasStage {...props} />
    </Suspense>
  );
}

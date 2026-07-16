// StageSkeleton — the "composing workspace" placeholder. While the agent is
// busy building the next turn, this renders a light wireframe of the
// generation to come in the same stage slot, and the shell's keyed
// AnimatePresence swaps it for the real content when blocks are ready.
//
// Flexibility contract: one skeleton VARIANT per generation kind, registered
// in SKELETON_VARIANTS below. The shell sniffs the streaming render_turn
// input for the first block `type` and passes it as `hint`; unknown or
// missing hints fall back to the generic workspace. Adding a future
// generation kind = adding one entry here (and nothing else).

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  AnimatePresence,
  motion,
  SOFT_EASE,
  useReducedMotion,
} from "@/components/studio/agent/motion-primitives";

/** One shimmering placeholder block. All skeleton layouts compose this. */
function Bone({ className }: { className?: string }) {
  return <div className={cn("skel-bone", className)} />;
}

// Skeletons wireframe the incoming CONTENT only — no CTA/button placeholders
// and no progress affordances. Guessing the action row (count, width) reads
// as a promise the real turn often breaks; the content shape is enough to
// hold the space calmly while the agent composes.
const SKELETON_VARIANTS: Record<string, () => ReactNode> = {
  // Choice grid — three tall option cards, like .gen-options.
  options: () => (
    <div className="grid grid-cols-3 gap-4">
      {Array.from({ length: 3 }, (_, i) => (
        <Bone key={i} className="h-[300px] !rounded-[44px]" />
      ))}
    </div>
  ),
  // Single hero media.
  media: () => (
    <div className="flex justify-center">
      <Bone className="aspect-video w-full max-w-3xl !rounded-[24px]" />
    </div>
  ),
  // 2–3 stills at mixed aspects.
  gallery: () => (
    <div className="flex items-start justify-center gap-4">
      <Bone className="h-[300px] w-[225px] !rounded-[24px]" />
      <Bone className="h-[300px] w-[300px] !rounded-[24px]" />
      <Bone className="h-[300px] w-[420px] !rounded-[24px]" />
    </div>
  ),
  // Masonry collage columns.
  moodboard: () => (
    <div className="grid grid-cols-3 gap-4">
      <div className="flex flex-col gap-4">
        <Bone className="h-56 !rounded-[24px]" />
        <Bone className="h-16 !rounded-full" />
      </div>
      <div className="flex flex-col gap-4">
        <Bone className="h-40 !rounded-[24px]" />
        <Bone className="h-32 !rounded-[24px]" />
      </div>
      <div className="flex flex-col gap-4">
        <Bone className="h-48 !rounded-[24px]" />
        <Bone className="h-24 !rounded-[24px]" />
      </div>
    </div>
  ),
  // One wide cinematic slide.
  storyboard: () => (
    <Bone className="aspect-[15/8] w-full !rounded-[44px]" />
  ),
  list: () => (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <Bone key={i} className="h-16 !rounded-[16px]" />
      ))}
    </div>
  ),
  form: () => (
    <Bone className="h-40 w-full !rounded-[24px]" />
  ),
  upload: () => (
    <div className="grid grid-cols-2 gap-4">
      <Bone className="h-[300px] !rounded-[44px]" />
      <Bone className="h-[300px] !rounded-[44px]" />
    </div>
  ),
  // Full-stage React view (timeline / beats / character).
  stage: () => (
    <Bone className="min-h-[320px] w-full flex-1 !rounded-[24px]" />
  ),
  // Generic workspace — used when the shape isn't known yet.
  default: () => (
    <div className="flex justify-center">
      <Bone className="h-64 w-full max-w-3xl !rounded-[24px]" />
    </div>
  ),
};

/**
 * Sniff the FIRST block type from a (possibly partial) render_turn input so
 * the skeleton can take the incoming generation's shape while it streams.
 * Works on the raw object — partial JSON parses expose `blocks[0].type`
 * early because the model writes `"type"` first in each block.
 */
export function sniffSkeletonHint(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const blocks = (input as { blocks?: unknown }).blocks;
  if (Array.isArray(blocks)) {
    for (const b of blocks) {
      const t = (b as { type?: unknown })?.type;
      if (typeof t === "string" && t in SKELETON_VARIANTS) return t;
      if (typeof t === "string") return null; // known-unknown → generic
    }
  }
  return null;
}

export function StageSkeleton({ hint }: { hint?: string | null }) {
  const reduce = useReducedMotion();
  const key = hint && SKELETON_VARIANTS[hint] ? hint : "default";
  const render = SKELETON_VARIANTS[key];
  // The hint sharpens while the turn streams (generic → tool prediction →
  // exact block type): cross-dissolve between shapes instead of snapping.
  return (
    <div aria-hidden data-stage-skeleton={key} className="relative w-full">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={key}
          className="w-full"
          initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(6px)" }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(6px)" }}
          transition={{ duration: 0.3, ease: SOFT_EASE }}
        >
          {render()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Motion framework for the agent center stage.
//
// Single source of truth for stage motion: tokens, shared variants, and text
// primitives. Everything is Motion-for-React based, animates compositable
// properties only (transform / opacity / filter), and honors
// `useReducedMotion()`. CSS-side animations (gc-child-in, gen-option enters,
// storyboard fills) mirror these timings via the --ease-* / --dur-* vars in
// styles.css — change them together.

import { useEffect, useRef } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";

export { AnimatePresence, LayoutGroup, motion, useReducedMotion };

// ─── Tokens ──────────────────────────────────────────────────────────────────

export const SPRING = { type: "spring" as const, stiffness: 240, damping: 28, mass: 0.9 };
export const SOFT_EASE = [0.22, 1, 0.36, 1] as const;
export const SOFT_TWEEN = { duration: 0.32, ease: SOFT_EASE };
/** Exit timing — quicker than enters so outgoing content never lingers. */
export const EXIT_TWEEN = { duration: 0.28, ease: SOFT_EASE };
/** How long a clicked option stays highlighted before its turn exits. */
export const HOLD_MS = 500;
/** Beat between the user's answer and the acknowledgement appearing — lets
 *  the selection settle before the agent "responds", so the ack reads as a
 *  reply rather than an instant echo. */
export const ACK_SHOW_DELAY_MS = 500;
/** Minimum time the transient ack message stays on stage before the
 *  question replaces it — prevents a sub-perceptual ack flash when the
 *  next turn arrives quickly. */
export const MIN_ACK_LEAD_MS = 700;
/** Per-word delay of the message ramp (scaled down for long texts). */
export const WORD_STAGGER = 0.045;
/** Longest a full word-ramp may take, regardless of text length. */
const WORD_RAMP_CAP_S = 1.2;
/** Longest a reverse word-ramp exit may take. */
const WORD_EXIT_CAP_S = 0.35;

// ─── Shared variants ─────────────────────────────────────────────────────────

/**
 * Turn-zone enter/exit — the one transition every stage zone (prose, card,
 * stage view) uses so a turn always moves as a single choreographed piece.
 * `custom` is the navigation direction: +1 forward (new turn / next), -1
 * browsing back — the y-axis flips so history feels spatial.
 */
export const turnZone: Variants = {
  initial: (dir: number = 1) => ({
    opacity: 0,
    y: 14 * (dir >= 0 ? 1 : -1),
    filter: "blur(8px)",
  }),
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: SPRING,
  },
  exit: (dir: number = 1) => ({
    opacity: 0,
    y: -12 * (dir >= 0 ? 1 : -1),
    filter: "blur(6px)",
    transition: EXIT_TWEEN,
  }),
};

/** Reduced-motion twin of `turnZone` — opacity only, near-instant. */
export const turnZoneReduced: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

/** Pick the right turn-zone variants for the current motion preference. */
export function useTurnZone(): Variants {
  const reduce = useReducedMotion();
  return reduce ? turnZoneReduced : turnZone;
}

/**
 * In-place dissolve — for content that REPLACES something already occupying
 * its spot (skeleton → generation). No travel: pure opacity/blur with a
 * whisper of scale, so the new content materializes exactly where the
 * placeholder sat.
 */
export const dissolveZone: Variants = {
  initial: { opacity: 0, scale: 0.99, filter: "blur(6px)" },
  animate: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: SOFT_TWEEN,
  },
  exit: {
    opacity: 0,
    filter: "blur(5px)",
    transition: { duration: 0.25, ease: SOFT_EASE },
  },
};

export function useDissolveZone(): Variants {
  const reduce = useReducedMotion();
  return reduce ? turnZoneReduced : dissolveZone;
}

// ─── FadeSwap ────────────────────────────────────────────────────────────────

/**
 * Cross-fade + move-up between successive children keyed by `id`. Tuned for
 * small inline content (the agent status line): quick tween, subtle travel.
 */
export function FadeSwap({
  id,
  children,
  className,
  mode = "popLayout",
}: {
  id: string | number;
  children: React.ReactNode;
  className?: string;
  mode?: "popLayout" | "wait" | "sync";
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode={mode} initial={false}>
      <motion.div
        key={id}
        className={className}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(3px)" }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(3px)" }}
        transition={reduce ? { duration: 0.15 } : { duration: 0.22, ease: SOFT_EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── WordsRamp ───────────────────────────────────────────────────────────────

/**
 * Word-by-word fade/rise reveal for agent messages. Streaming-safe: words are
 * keyed by index, and words already on screen never re-animate — only newly
 * appended words ramp in, delayed relative to their own arrival batch. On
 * exit (when the surrounding turn zone leaves), words fade out in a quick
 * reverse stagger, propagated down from the parent AnimatePresence.
 */
export function WordsRamp({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  // Keep whitespace as its own tokens so wrapping/pre spacing is exact.
  const tokens = text.split(/(\s+)/);
  const prevCountRef = useRef(0);
  const prevCount = prevCountRef.current;
  useEffect(() => {
    prevCountRef.current = tokens.length;
  });

  if (reduce) {
    return <div className={className}>{text}</div>;
  }

  const wordCount = tokens.reduce((n, t) => (t.trim() ? n + 1 : n), 0) || 1;
  const stagger = Math.min(WORD_STAGGER, WORD_RAMP_CAP_S / wordCount);
  const exitStagger = Math.min(0.02, WORD_EXIT_CAP_S / wordCount);

  let wordIndex = -1;
  let newWordIndex = -1;
  return (
    <div className={className} aria-label={text}>
      {tokens.map((tok, i) => {
        if (!tok.trim()) {
          return (
            <span key={i} style={{ whiteSpace: "pre-wrap" }}>
              {tok}
            </span>
          );
        }
        wordIndex += 1;
        const isNew = i >= prevCount;
        if (isNew) newWordIndex += 1;
        const reverseIndex = wordCount - 1 - wordIndex;
        return (
          <motion.span
            key={i}
            aria-hidden
            style={{ display: "inline-block", whiteSpace: "pre" }}
            initial={isNew ? { opacity: 0, y: 6, filter: "blur(4px)" } : false}
            animate={{
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              transition: {
                duration: 0.4,
                ease: SOFT_EASE,
                delay: Math.max(0, newWordIndex) * stagger,
              },
            }}
            exit={{
              opacity: 0,
              y: -4,
              filter: "blur(3px)",
              transition: {
                duration: 0.18,
                ease: SOFT_EASE,
                delay: reverseIndex * exitStagger,
              },
            }}
          >
            {tok}
          </motion.span>
        );
      })}
    </div>
  );
}

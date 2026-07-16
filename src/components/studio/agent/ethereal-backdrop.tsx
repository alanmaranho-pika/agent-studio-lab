// EtherealBackdrop — the ambient layer behind the center stage. Two or three
// very large, heavily blurred gradient blobs drift on slow loops, tinted by
// the project's inferred theme, so the stage reads as a camera floating in an
// endless soft space rather than content swapping on a flat page. On turn
// navigation the whole layer is nudged vertically with a lazy spring
// (opposite the content) for a subtle parallax depth cue.

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { ProjectState } from "@/lib/project-state";
import { pickThemeSwatch } from "@/components/studio/agent/stage-generations";

type Blob = {
  size: string;
  top: string;
  left: string;
  color: string;
  opacity: number;
  drift: { x: number; y: number };
  duration: number;
};

export function EtherealBackdrop({
  project,
  /** +1 while moving toward newer turns, -1 toward older. */
  navDir = 1,
  /** Bump on each turn navigation to trigger the parallax nudge. */
  navTick = 0,
}: {
  project: ProjectState;
  navDir?: number;
  navTick?: number;
}) {
  const reduceMotion = useReducedMotion();
  const swatch = useMemo(() => pickThemeSwatch(project), [project]);

  const blobs = useMemo<Blob[]>(
    () => [
      {
        size: "80vw",
        top: "-30%",
        left: "-15%",
        color: swatch.accent,
        opacity: 0.07,
        drift: { x: 40, y: 30 },
        duration: 80,
      },
      {
        size: "70vw",
        top: "45%",
        left: "55%",
        color: swatch.fg,
        opacity: 0.05,
        drift: { x: -50, y: -35 },
        duration: 95,
      },
      {
        size: "60vw",
        top: "20%",
        left: "20%",
        color: swatch.bg,
        opacity: 0.06,
        drift: { x: 30, y: -45 },
        duration: 70,
      },
    ],
    [swatch],
  );

  // Parallax nudge on turn navigation: the backdrop settles the opposite way
  // from the content, on a much lazier spring, so the space itself seems to
  // move past the stage. Retargeting (rather than remounting) keeps the slow
  // drift loops running uninterrupted.
  const [nudge, setNudge] = useState(0);
  useEffect(() => {
    if (!navTick || reduceMotion) return;
    setNudge(navDir * -40);
    const t = setTimeout(() => setNudge(0), 40);
    return () => clearTimeout(t);
  }, [navTick, navDir, reduceMotion]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      animate={{ y: reduceMotion ? 0 : nudge }}
      transition={{ type: "spring", stiffness: 40, damping: 18 }}
    >
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: b.size,
            height: b.size,
            top: b.top,
            left: b.left,
            opacity: b.opacity,
            background: `radial-gradient(circle at 50% 50%, ${b.color}, transparent 70%)`,
            filter: "blur(80px)",
            willChange: "transform",
          }}
          animate={
            reduceMotion
              ? undefined
              : {
                  x: [0, b.drift.x, 0, -b.drift.x, 0],
                  y: [0, -b.drift.y, 0, b.drift.y, 0],
                }
          }
          transition={{
            duration: b.duration,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </motion.div>
  );
}

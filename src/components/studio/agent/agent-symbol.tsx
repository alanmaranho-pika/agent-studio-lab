// AgentSymbol — the animated agent glyph (Lottie). Replaces the static
// AgentMark SVG. The mark rests as a 4-petal star and morphs/spins while the
// agent is thinking:
//   • playing = false → paused at the resting frame (idle).
//   • playing = true  → looping animation (working / streaming).
//
// The source Lottie ships a hard white fill on a black background solid. We
// strip the background layer and let CSS recolor the paths via `currentColor`
// (see `.agent-symbol svg path` in styles.css), so the glyph keeps inheriting
// text-foreground / text-primary / opacity utilities exactly like AgentMark
// did. `prefers-reduced-motion` is honored — the glyph stays at rest.

import { useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web";
import { cn } from "@/lib/utils";
import rawAnimation from "./agent-symbol.json";

// Strip the full-bleed black background solid (layer type 1) once at module
// load. Each mount gets a structuredClone so lottie-web's in-place mutation
// never leaks across instances.
const BASE_ANIMATION = (() => {
  const data = rawAnimation as unknown as { layers?: Array<{ ty?: number }> };
  return {
    ...data,
    layers: (data.layers ?? []).filter((layer) => layer.ty !== 1),
  };
})();

export function AgentSymbol({
  playing = false,
  className,
}: {
  /** Play the looping animation (agent working); false rests at frame 0. */
  playing?: boolean;
  className?: string;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  // Mount / unmount the lottie instance once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const anim = lottie.loadAnimation({
      container: host,
      renderer: "svg",
      loop: true,
      autoplay: false,
      animationData: structuredClone(BASE_ANIMATION),
      rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
    });
    animRef.current = anim;
    return () => {
      anim.destroy();
      animRef.current = null;
    };
  }, []);

  // Drive play/pause from the `playing` prop (respecting reduced motion).
  useEffect(() => {
    const anim = animRef.current;
    if (!anim) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (playing && !reduce) {
      anim.play();
    } else {
      // Snap back to the clean resting star rather than freezing mid-morph.
      anim.goToAndStop(0, true);
    }
  }, [playing]);

  return (
    <span
      ref={hostRef}
      className={cn("agent-symbol", className)}
      style={{ display: "inline-block", lineHeight: 0 }}
      aria-hidden
    />
  );
}

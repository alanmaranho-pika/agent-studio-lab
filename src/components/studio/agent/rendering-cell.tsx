// Generating-state placeholder. Shown wherever a clip/shot is still rendering.
// Two upgrades over the old "spinner + Rendering…" text:
//   • the same liquid-metal shader used by the agent status pill fills the
//     cell, so a generating element reads as "the agent is working here"
//   • the animated agent-symbol (Lottie) replaces the generic lucide spinner
//
// `shader` is opt-out because each <LiquidMetal> is its own WebGL context and
// browsers cap how many can be live at once — the big surfaces (player, hero)
// get the shader; the many small timeline chips fall back to a dark cell with
// just the animated glyph.

import { LiquidMetal } from "@paper-design/shaders-react";
import { AgentSymbol } from "@/components/studio/agent/agent-symbol";
import { cn } from "@/lib/utils";

export function RenderingCell({
  label = "Rendering…",
  shader = true,
  size = "md",
  className,
}: {
  /** Caption under the glyph; hidden on `size="sm"`. Pass null to omit. */
  label?: string | null;
  /** Fill with the liquid-metal shader (one WebGL context). */
  shader?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const glyph = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  return (
    <div
      className={cn(
        "relative grid h-full w-full place-items-center overflow-hidden bg-black",
        className,
      )}
    >
      {shader && (
        <LiquidMetal
          className="absolute inset-0 h-full w-full"
          colorBack="#000000"
          colorTint="#c4c0d8"
          shape="none"
          repetition={1}
          softness={1}
          shiftRed={0.5}
          shiftBlue={0.5}
          distortion={1}
          contour={0}
          angle={0}
          speed={1}
          scale={3}
          rotation={0}
          offsetX={0}
          offsetY={0}
          fit="cover"
        />
      )}
      {/* Legibility scrim between the shader and the glyph. */}
      <div className="absolute inset-0 bg-black/35" aria-hidden />
      <div className="relative flex flex-col items-center gap-2 text-white/85">
        <AgentSymbol playing className={cn(glyph, "text-white/90")} />
        {label && size !== "sm" && (
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/70">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

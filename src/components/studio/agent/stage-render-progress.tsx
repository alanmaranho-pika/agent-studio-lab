// StageRenderProgress — the "a render is cooking" state on the center stage.
// Shown while a background generation (run_model_app / queued render) is in
// flight and the stage would otherwise be idle. A shimmering media frame at
// the project's aspect ratio with the agent glyph + a label centered on it,
// mirroring the Figma rendering state (a blurred frame + centered loader).
//
// `progress` (0–1) drives a percentage when a real value is available; in
// agent mode fal's queue doesn't report fine-grained progress, so the frame
// runs as an indeterminate shimmer with a label instead of a fabricated %.

import { AgentSymbol } from "@/components/studio/agent/agent-symbol";

/** "16:9" → "16 / 9" for CSS aspect-ratio; falls back to 16/9. */
function toCssAspect(ratio?: string): string {
  const m = (ratio || "").match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  return m ? `${m[1]} / ${m[2]}` : "16 / 9";
}

export function StageRenderProgress({
  label,
  aspectRatio,
  progress,
}: {
  label?: string;
  aspectRatio?: string;
  progress?: number | null;
}) {
  const pct =
    typeof progress === "number" && progress > 0
      ? Math.round(Math.min(1, progress) * 100)
      : null;
  return (
    // The frame IS the .skel-bone (it sets position:relative + the sweeping
    // sheen), sized by aspect-ratio, with a defined surface + hairline border
    // so it reads as the video slot that's rendering. Content sits above the
    // sheen via z-10.
    <div
      className="skel-bone relative mx-auto w-full max-w-4xl !rounded-[24px] border border-[color:var(--hairline)]"
      style={{
        aspectRatio: toCssAspect(aspectRatio),
        background:
          "linear-gradient(135deg, var(--surface-dark-5), var(--surface-dark-6))",
      }}
      aria-label="Rendering in progress"
    >
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <AgentSymbol playing className="h-10 w-10 shrink-0 text-[#8b8790]" />
        {pct != null && (
          <div className="font-display text-3xl font-medium tracking-tight text-foreground/75">
            {pct}%
          </div>
        )}
        <div className="max-w-[80%] truncate text-sm font-medium text-muted-foreground">
          {label || "Generating…"}
        </div>
      </div>
    </div>
  );
}

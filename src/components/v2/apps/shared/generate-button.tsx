import { Loader2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { costForSkill } from "@/components/v2/monetization/costs";
import type { Skill } from "@/lib/skills";
import { cn } from "@/lib/utils";

type GenerateButtonProps = {
  skill: Pick<Skill, "id" | "kind">;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  label?: string;
  className?: string;
  type?: "button" | "submit";
};

/**
 * Shared lavender "Generate" CTA used across every app panel.
 * Renders the action label on the left and the per-run credit cost
 * (derived from `costForSkill`) on the right.
 */
export function GenerateButton({
  skill,
  onClick,
  disabled,
  busy,
  busyLabel,
  label = "Generate",
  className,
  type = "button",
}: GenerateButtonProps) {
  const cost = costForSkill(skill);
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "h-14 w-full rounded-lg text-base font-semibold shadow-none",
        className,
      )}
    >
      {busy ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span>{busyLabel ?? "Generating…"}</span>
        </>
      ) : (
        <>
          <span className="flex-1 text-center">{label}</span>
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-2 text-xs font-medium tabular-nums">
            <Zap className="h-3 w-3 fill-current" />
            {cost.toLocaleString()}
          </span>
        </>
      )}
    </Button>
  );
}

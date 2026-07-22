// Hover tooltip for not-yet-functional chrome (invite, edit, library stack…).
// Self-contained: bundles its own TooltipProvider so callers don't depend on a
// global one. Wrap a single element (it becomes the trigger via `asChild`).

import type { ComponentProps, ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ComingSoon({
  children,
  side = "bottom",
  label = "Coming soon",
}: {
  children: ReactNode;
  side?: ComponentProps<typeof TooltipContent>["side"];
  label?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

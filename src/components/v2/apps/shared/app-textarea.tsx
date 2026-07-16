import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared textarea treatment used across all app panels.
 * Matches the "Describe Short Film" logline input.
 */
export const AppTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function AppTextarea({ className, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "w-full resize-none rounded-md border border-hairline bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-primary",
        className,
      )}
      {...props}
    />
  );
});

// Shared shell for "Special Apps" — multi-step app panels (Product Ad,
// Short Film, …). Supports two modes:
//   • Collapsible "rung" mode: pass `open` + `onToggle` and the section
//     always renders as an accordion row with a one-line summary.
//   • Legacy wizard mode: pass `active` and the section only renders when
//     active. Used by panels that haven't migrated yet.

import { ArrowLeft, Check, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function MultiShotBadge({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-muted/40 px-2 py-0.5">
        <Sparkles className="h-3 w-3" />
        Multi-shot
      </span>
      {subtitle ? <span>{subtitle}</span> : null}
    </div>
  );
}

export function Section({
  title,
  hint,
  stepLabel,
  stepNumber,
  summary,
  done,
  open,
  onToggle,
  active,
  onBack,
  cta,
  children,
}: {
  title: string;
  hint?: string;
  stepLabel?: string;
  stepNumber?: number;
  /** One-line preview shown when the rung is collapsed (rung mode). */
  summary?: string;
  /** Marks the step as completed (filled circle + check, rung mode). */
  done?: boolean;
  /** Controlled open state (rung mode). */
  open?: boolean;
  /** Toggle handler — called on header click (rung mode). */
  onToggle?: () => void;
  /** Legacy wizard mode — section only renders when active. */
  active?: boolean;
  /** Legacy wizard mode — renders a back chevron in the header. */
  onBack?: () => void;
  cta?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Rung (collapsible) mode.
  if (onToggle) {
    return (
      <section
        className={cn(
          "overflow-hidden rounded-lg border border-hairline bg-card transition",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!!open}
          className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-muted/30"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                done
                  ? "bg-foreground text-background"
                  : open
                    ? "bg-foreground/10 text-foreground"
                    : "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              {done ? <Check className="h-3.5 w-3.5" /> : (stepNumber ?? "•")}
            </div>
            <div className="min-w-0">
              {null}

              <div className="truncate text-sm font-semibold text-foreground">
                {title}
              </div>
              {!open && summary ? (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {summary}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hint && open ? (
              <span className="text-[11px] text-muted-foreground">{hint}</span>
            ) : null}
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </div>
        </button>
        {open ? (
          <div className="border-t border-hairline p-4 animate-in fade-in slide-in-from-top-1 duration-150">
            {children}
            {cta ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{cta}</div>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  // Legacy wizard mode.
  if (!active) return null;
  return (
    <section
      className={cn(
        "transition",
        "animate-in fade-in slide-in-from-bottom-1 duration-200",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {title}
          </div>
        </div>
        {hint ? (
          <div className="shrink-0 text-[11px] text-muted-foreground">{hint}</div>
        ) : null}
      </div>
      {children}
      {cta ? <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{cta}</div> : null}
    </section>
  );
}


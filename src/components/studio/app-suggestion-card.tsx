import { Sparkles, X } from "lucide-react";
import { SKILL_BY_ID } from "@/lib/skills";
import type { AppSuggestion } from "@/lib/app-suggest.functions";

export function AppSuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: AppSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const skill = SKILL_BY_ID[suggestion.skillId];
  const Icon = skill?.icon ?? Sparkles;
  return (
    <div className="relative flex items-start gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 shadow-sm">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-gradient text-primary-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Suggested App
          </span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {Math.round(suggestion.confidence * 100)}% match
          </span>
        </div>
        <div className="mt-0.5 truncate font-semibold text-foreground">
          {suggestion.label}
        </div>
        {suggestion.reason && (
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {suggestion.reason}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button
            onClick={onAccept}
            className="rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90"
          >
            Use this App
          </button>
          <button
            onClick={onDismiss}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss suggestion"
        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

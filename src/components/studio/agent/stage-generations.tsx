// Stage Generations — full-stage React views for gen outputs the agent has
// produced (script beats, storyboards, timelines, character sheets). Unlike
// option pickers, these are not "pick one to proceed" — they're a group with
// contextual suggested actions rendered below.
//
// The model emits a tiny wrapper:
//
//   <div data-gen-view="script-beats" data-focus-scene="s1010"></div>
//   <p data-prose>All 5 keyframes are ready — review each in the storyboard.</p>
//   <div data-gen-actions>
//     <button data-action="answer" data-value="Lock it in" data-primary>Lock it in</button>
//     <button data-action="answer" data-value="Rework a beat">Rework a beat</button>
//   </div>
//
// The `extractStageGeneration` helper parses this out of the raw assistant
// HTML; `<StageGeneration>` renders the matching view + action row.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HOLD_MS } from "@/components/studio/agent/motion-primitives";
import {
  RefreshCcw,
  Wand2,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Send,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { resolveThumb, type ProjectAsset, type ProjectPatch, type ProjectState, type Scene } from "@/lib/project-state";
import { pickSwatchFromText, type Swatch } from "@/lib/theme-swatch";
import { stableAssetUrl } from "@/lib/v2/stable-asset-url";
import {
  StageTimelineView,
  TIMELINE_VARIANTS,
  type TimelineVariant,
} from "@/components/studio/agent/stage-timeline";
import type { StageIntent } from "./intents";
import { AskAgentPanel } from "@/components/studio/agent/ask-agent-panel";


// ─── Extractor ──────────────────────────────────────────────────────────────

export type StageGenKind = "script-beats" | "storyboard" | "timeline" | "character";

export type StageGenAction = {
  value: string;
  label: string;
  primary?: boolean;
  /** Declared shape of the NEXT turn (chambers the composing skeleton). */
  next?: string;
  /** Pre-written acknowledgement shown instantly when this action is picked. */
  ack?: string;
};

export type StageGeneration = {
  kind: StageGenKind;
  /** Timeline layout variant (preview default | editor | scenes). */
  variant?: TimelineVariant;
  focusSceneId?: string;
  focusCastId?: string;
  actions: StageGenAction[];
};

const GEN_VIEW_RE = /<div\b[^>]*\bdata-gen-view=["']([^"']+)["'][^>]*>[\s\S]*?<\/div>/i;
const GEN_ACTIONS_RE = /<div\b[^>]*\bdata-gen-actions\b[^>]*>([\s\S]*?)<\/div>/i;
const ACTION_BTN_RE =
  /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;

function attr(html: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}=["']([^"']*)["']`, "i");
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : undefined;
}

// The serializer escapes &/</>/" — undo it when lifting values back out of
// the HTML so button labels don't render "Approve &amp; generate".
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function hasAttr(html: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`, "i").test(html);
}

export function extractStageGeneration(html: string): StageGeneration | null {
  const viewMatch = html.match(GEN_VIEW_RE);
  if (!viewMatch) return null;
  const openTag = viewMatch[0].slice(0, viewMatch[0].indexOf(">") + 1);
  const kindRaw = viewMatch[1].trim().toLowerCase();
  const kind = (["script-beats", "storyboard", "timeline", "character"] as const).find(
    (k) => k === kindRaw,
  );
  if (!kind) return null;

  const focusSceneId = attr(openTag, "data-focus-scene");
  const focusCastId = attr(openTag, "data-focus-cast");
  const variantRaw = attr(openTag, "data-variant");
  const variant = TIMELINE_VARIANTS.find((v) => v === variantRaw);

  const actions: StageGenAction[] = [];
  const actionsBlock = html.match(GEN_ACTIONS_RE);
  if (actionsBlock) {
    ACTION_BTN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ACTION_BTN_RE.exec(actionsBlock[1]))) {
      const attrs = m[1];
      const inner = m[2];
      const value = attr(attrs, "data-value");
      if (!value) continue;
      const label = decodeEntities(inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()) || value;
      actions.push({
        value,
        label,
        primary: hasAttr(attrs, "data-primary"),
        next: attr(attrs, "data-next"),
        ack: attr(attrs, "data-ack"),
      });
    }
  }
  return { kind, variant, focusSceneId, focusCastId, actions };
}

/** Strip the stage-generation markup from the HTML so nothing else re-renders it. */
export function stripStageGeneration(html: string): string {
  return html.replace(GEN_VIEW_RE, "").replace(GEN_ACTIONS_RE, "");
}

// ─── Frame ──────────────────────────────────────────────────────────────────

function StageFrame({
  children,
  contentRef,
}: {
  children: React.ReactNode;
  contentRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className="flex h-full max-h-full min-h-0 w-full flex-1 flex-col items-stretch justify-center overflow-hidden">
      <div ref={contentRef} className="flex h-full max-h-full min-h-0 w-full flex-col justify-center overflow-y-auto overflow-x-hidden">{children}</div>
    </div>
  );
}

function StageActionsRow({
  actions,
  onAnswer,
}: {
  actions: StageGenAction[];
  onAnswer: (value: string, next?: string, ack?: string) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="gen-actions shrink-0">
      {actions.map((a) => (
        <button
          key={a.value}
          type="button"
          onClick={(e) => {
            // Selection acknowledgment — mirror the card behavior: highlight
            // the pick, dim siblings, hold, then dispatch (busy flip plays
            // the stage exit).
            const btn = e.currentTarget;
            const row = btn.parentElement;
            if (row?.getAttribute("data-answered") === "1") return;
            row?.setAttribute("data-answered", "1");
            btn.setAttribute("data-selected", "1");
            window.setTimeout(() => onAnswer(a.value, a.next, a.ack), HOLD_MS);
          }}
          className={cn(
            "gen-cta",
            a.primary ? "gen-cta-primary" : "gen-cta-secondary",
          )}
        >
          {a.primary ? <span className="text-base">✓</span> : null}
          {a.label}
        </button>
      ))}
    </div>
  );
}


function ToolbarIcons({
  onRegenerate,
  onEdit,
  onMore,
}: {
  onRegenerate?: () => void;
  onEdit?: () => void;
  onMore?: () => void;
}) {
  const items = [
    onRegenerate ? { Icon: RefreshCcw, label: "Regenerate", onClick: onRegenerate } : null,
    onEdit ? { Icon: Wand2, label: "Edit with agent", onClick: onEdit } : null,
    onMore ? { Icon: MoreHorizontal, label: "More", onClick: onMore } : null,
  ].filter((i): i is { Icon: typeof RefreshCcw; label: string; onClick: () => void } => i !== null);

  if (items.length === 0) return null;

  return (
    <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
      {items.map(({ Icon, label, onClick }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          title={label}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="grid h-9 w-9 place-items-center rounded-full bg-black/10 text-current transition hover:bg-black/20"
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

// ─── Aspect helpers ─────────────────────────────────────────────────────────

function aspectRatio(meta: ProjectState["meta"] | undefined): number {
  const s = meta?.aspectRatio ?? "16:9";
  const [w, h] = s.split(":").map((n) => Number(n));
  if (!Number.isFinite(w) || !Number.isFinite(h) || !w || !h) return 16 / 9;
  return w / h;
}

/** Container that constrains its child to the project's aspect ratio while
 *  filling the available height. Height-first so the stage doesn't overflow. */
function AspectStage({
  ratio,
  className,
  children,
}: {
  ratio: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center">
      <div
        className={cn("relative h-full w-full max-h-full max-w-full", className)}
        style={{ aspectRatio: `${ratio}`, maxWidth: `calc(100% )` }}
      >
        <div
          data-stage-card
          className="absolute inset-0 mx-auto"
          style={{ aspectRatio: `${ratio}`, maxHeight: "100%", maxWidth: "100%" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Theme swatch inference ─────────────────────────────────────────────────
// Palette library lives in the shared module so the inline storyboard card
// enhancer speaks the same color language (see src/lib/theme-swatch.ts).

export type { Swatch } from "@/lib/theme-swatch";

export function pickThemeSwatch(project: ProjectState): Swatch {
  const hay = [
    project.meta?.title,
    project.meta?.logline,
    project.meta?.format,
    project.styleLock?.anchor,
    ...(project.scenes ?? []).slice(0, 6).flatMap((s) => [s.title, s.prompt, s.voPrompt]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return pickSwatchFromText(hay);
}

// ─── Editable inline text ───────────────────────────────────────────────────

export type AgentAssist = {
  fieldKey: string;
  fieldLabel: string;
  onAsk: (instruction: string) => Promise<InlineAskResult> | InlineAskResult;
};

export type InlineAskResult = {
  ok: boolean;
  assistantText?: string;
  /** Fresh media URL when an inline media edit regenerated an image. */
  mediaUrl?: string;
  error?: string;
};

const QUICK_INSTRUCTIONS = [
  "Rewrite",
  "Shorter",
  "More action",
  "Wider shot",
];

// ─── Inline Ask context ─────────────────────────────────────────────────────
// Coordinates which editable field is currently being discussed with the
// agent so the sidebar (not a floating popover) hosts the whole conversation.

type InlineAskOpen = {
  key: string;
  label: string;
  value: string;
  onAsk: (instruction: string) => Promise<InlineAskResult> | InlineAskResult;
};

type InlineAskCtx = {
  openFor: InlineAskOpen | null;
  busyKey: string | null;
  open: (info: InlineAskOpen) => void;
  updateValue: (key: string, value: string) => void;
  close: () => void;
};

const InlineAskContext = createContext<InlineAskCtx | null>(null);

function useInlineAsk(): InlineAskCtx | null {
  return useContext(InlineAskContext);
}

type TranscriptEntry = {
  id: number;
  instruction: string;
  wasValue: string;
  nowValue?: string;
  assistantText?: string;
  error?: string;
  status: "pending" | "done" | "error";
};

function InlineAskSidebar({
  openFor,
  busyKey,
  onClose,
  maxHeight,
}: {
  openFor: InlineAskOpen;
  busyKey: string | null;
  onClose: () => void;
  maxHeight?: number | null;
}) {

  const reduce = useReducedMotion();
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [draft, setDraft] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const latestValueRef = useRef(openFor.value);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Reset transcript whenever we switch to a different field.
  useEffect(() => {
    setTranscript([]);
    setDraft("");
    // Focus composer after mount
    const t = window.setTimeout(() => taRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [openFor.key]);

  const busyForMe = busyKey === openFor.key;

  useEffect(() => {
    latestValueRef.current = openFor.value;
  }, [openFor.value]);

  // Auto-scroll transcript to bottom on new entries.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length, busyForMe]);

  const submit = async () => {
    const v = draft.trim();
    if (!v || busyForMe) return;
    const id = Date.now() + Math.random();
    setTranscript((entries) => [
      ...entries,
      { id, instruction: v, wasValue: openFor.value, status: "pending" },
    ]);
    setDraft("");
    try {
      const result = await openFor.onAsk(v);
      setTranscript((entries) =>
        entries.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status: result.ok ? "done" : "error",
                assistantText: result.assistantText,
                error: result.error,
                nowValue: latestValueRef.current,
              }
            : entry,
        ),
      );
    } catch (err) {
      setTranscript((entries) =>
        entries.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status: "error",
                error: err instanceof Error ? err.message : "Inline edit failed",
                nowValue: latestValueRef.current,
              }
            : entry,
        ),
      );
    }
  };

  return (
    <motion.aside
      role="dialog"
      aria-label={`Ask agent about ${openFor.label}`}
      initial={reduce ? false : { x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { x: 24, opacity: 0 }}
      transition={reduce ? { duration: 0.1 } : { type: "spring", stiffness: 380, damping: 32 }}
      className="flex w-[380px] shrink-0 flex-col overflow-hidden rounded-3xl border border-hairline bg-popover text-popover-foreground"
      style={maxHeight ? { maxHeight, height: maxHeight } : undefined}

      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="rounded-full bg-[color:var(--surface-dark-6)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
            style={{ fontFamily: '"Telka Extended", "Telka", system-ui, sans-serif' }}
          >
            Editing
          </span>
          <span
            className="truncate text-sm"
            style={{ fontFamily: '"Telka Extended", "Telka", system-ui, sans-serif', fontWeight: 500 }}
          >
            {openFor.label}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Context — current value */}
      <div className="border-b border-hairline bg-muted/20 px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current</div>
        <div className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs leading-snug text-foreground/80">
          {openFor.value?.trim() ? `“${openFor.value}”` : <span className="italic opacity-60">Empty</span>}
        </div>
      </div>

      {/* Transcript */}
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {transcript.length === 0 && !busyForMe ? (
          <div className="grid h-full place-items-center text-center text-[11px] text-muted-foreground">
            <div className="max-w-[220px] leading-snug">
              Ask the agent to rework this field. Your conversation stays here.
            </div>
          </div>
        ) : null}
        <AnimatePresence initial={false}>
          {transcript.map((t) => (
            <motion.div
              key={t.id}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-1.5"
            >
              {/* user bubble */}
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-xs text-primary-foreground">
                {t.instruction}
              </div>
              {/* agent status */}
              {t.status === "pending" ? (
                <div className="mr-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                  <motion.span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full bg-current"
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.15, 0.8] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <Shimmer as="span" className="text-inherit">Reworking…</Shimmer>
                </div>
              ) : t.status === "error" ? (
                <div className="mr-auto max-w-[95%] rounded-2xl rounded-tl-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] leading-snug text-destructive">
                  {t.error || "Inline edit failed"}
                </div>
              ) : (
                <div className="mr-auto max-w-[95%] rounded-2xl rounded-tl-sm border border-hairline bg-muted/40 px-3 py-2 text-[11px] leading-snug text-foreground/80">
                  <div className="flex items-center gap-1 text-[10px] font-medium text-primary">
                    <Check className="h-3 w-3" />
                    <span>Applied</span>
                  </div>
                  {t.assistantText ? (
                    <div className="mt-1 whitespace-pre-wrap">{t.assistantText}</div>
                  ) : null}
                  {t.nowValue && t.nowValue !== t.wasValue ? (
                    <div className="mt-1 space-y-1">
                      <div className="line-through opacity-50">{t.wasValue || "—"}</div>
                      <div>{t.nowValue}</div>
                    </div>
                  ) : null}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Composer */}
      <div className="border-t border-hairline p-3">
        <textarea
          ref={taRef}
          rows={2}
          value={draft}
          disabled={busyForMe}
          onChange={(e) => {
            setDraft(e.target.value);
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); }
            if (e.key === "Escape") { e.preventDefault(); onClose(); }
          }}
          placeholder="e.g. wider shot, more action, remove the dog…"
          className="w-full resize-none rounded-lg border border-hairline bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_INSTRUCTIONS.map((q) => (
            <motion.button
              key={q}
              type="button"
              disabled={busyForMe}
              whileHover={reduce ? undefined : { scale: 1.04 }}
              whileTap={reduce ? undefined : { scale: 0.96 }}
              onClick={() => {
                setDraft((d) => (d ? d : q));
                taRef.current?.focus();
              }}
              className="inline-flex h-8 items-center rounded-full border border-hairline bg-muted/40 px-3 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {q}
            </motion.button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-hairline bg-muted/40 px-1 py-0.5">↵</kbd>
            <span>send</span>
            <kbd className="rounded border border-hairline bg-muted/40 px-1 py-0.5">Esc</kbd>
            <span>close</span>
          </div>
          <motion.button
            type="button"
            onClick={() => void submit()}
            disabled={!draft.trim() || busyForMe}
            whileHover={reduce || !draft.trim() ? undefined : { scale: 1.04 }}
            whileTap={reduce || !draft.trim() ? undefined : { scale: 0.96 }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
            Send
          </motion.button>
        </div>
      </div>
    </motion.aside>
  );
}

function EditableText({
  value,
  onCommit,
  multiline = false,
  className,
  placeholder,
  style,
  as = "span",
  agentAssist,
  busy = false,
}: {
  value: string;
  onCommit: (next: string) => void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  style?: React.CSSProperties;
  as?: "span" | "div" | "h2" | "p";
  agentAssist?: AgentAssist;
  busy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [flash, setFlash] = useState(false);
  const [hover, setHover] = useState(false);
  const wrapRef = useRef<HTMLElement | null>(null);
  const wasBusy = useRef(false);
  const ask = useInlineAsk();
  const askOpen = !!(agentAssist && ask?.openFor?.key === agentAssist.fieldKey);

  useEffect(() => setDraft(value), [value]);

  // Keep the sidebar in sync with the current value of this field.
  useEffect(() => {
    if (askOpen && agentAssist) ask?.updateValue(agentAssist.fieldKey, value);
  }, [askOpen, value, agentAssist?.fieldKey, ask]);

  useEffect(() => {
    if (wasBusy.current && !busy) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(t);
    }
    wasBusy.current = busy;
  }, [busy]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== value) onCommit(next);
  };

  const openAsk = useCallback(() => {
    if (!agentAssist || !ask) return;
    setEditing(false);
    ask.open({
      key: agentAssist.fieldKey,
      label: agentAssist.fieldLabel,
      value,
      onAsk: agentAssist.onAsk,
    });
  }, [agentAssist, ask, value]);

  // Busy: agent is reworking this field --------------------------------------
  if (busy) {
    const Wrap = as as any;
    return (
      <Wrap
        className={cn(
          "relative inline-flex items-center gap-2 rounded-md px-1 -mx-1",
          className,
        )}
        style={style}
      >
        <motion.span
          aria-hidden
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.15, 0.8] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <Shimmer as="span" className="text-inherit">
          {value || placeholder || "Reworking…"}
        </Shimmer>
      </Wrap>
    );
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          ref={(el) => {
            if (el) {
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }
          }}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
            if (e.key === "/" && (e.metaKey || e.ctrlKey) && agentAssist) {
              e.preventDefault();
              openAsk();
            }
          }}
          placeholder={placeholder}
          className={cn(
            "w-full min-w-0 resize-none overflow-hidden bg-transparent outline-none ring-2 ring-current/30 rounded-md px-1 -mx-1 focus:ring-current/60 leading-relaxed",
            className,
          )}
          style={{ ...style, color: "inherit" }}
        />
      );
    }
    return (
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "/" && (e.metaKey || e.ctrlKey) && agentAssist) {
            e.preventDefault();
            openAsk();
          }
        }}
        placeholder={placeholder}
        className={cn(
          "w-full min-w-0 bg-transparent outline-none ring-2 ring-current/30 rounded-md px-1 -mx-1 focus:ring-current/60",
          className,
        )}
        style={{ ...style, color: "inherit" }}
      />
    );
  }

  const Wrap = as as any;
  return (
    <Wrap
      ref={wrapRef as any}
      role="textbox"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onClick={(e: React.MouseEvent) => {
        if (askOpen) return;
        e.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !askOpen) setEditing(true);
        if (e.key === "/" && (e.metaKey || e.ctrlKey) && agentAssist) {
          e.preventDefault();
          openAsk();
        }
      }}
      className={cn(
        "group/edit relative cursor-text rounded-md px-1 -mx-1 transition-all hover:bg-[color:var(--surface-dark-5)]",
        agentAssist && "hover:outline hover:outline-1 hover:outline-dashed hover:outline-current/30 hover:outline-offset-2",
        askOpen && "outline outline-2 outline-current/60 outline-offset-2 bg-[color:var(--surface-dark-5)]",
        !value && "opacity-60 italic",
        flash && "ring-2 ring-current/40",
        className,
      )}
      style={style}
    >
      {value || placeholder || "—"}
      {agentAssist && (
        <AnimatePresence>
          {hover && !askOpen && (
            <motion.button
              key="ask-pill"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openAsk();
              }}
              title="Ask the agent to rework this (⌘/)"
              aria-label="Ask the agent to rework this"
              initial={{ opacity: 0, scale: 0.9, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="ask-agent-pill absolute top-2 right-2 z-10"
            >
              <Sparkles />
              <span>Ask agent</span>
            </motion.button>
          )}
        </AnimatePresence>
      )}
    </Wrap>
  );
}




// ─── Duration editor (digits only, "s" suffix is fixed) ─────────────────────

function DurationEditor({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (next: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value || ""));
  useEffect(() => setDraft(String(value || "")), [value]);

  const commit = () => {
    setEditing(false);
    const n = parseInt(draft, 10);
    if (Number.isFinite(n) && n > 0 && n !== value) onCommit(n);
    else setDraft(String(value || ""));
  };

  if (editing) {
    return (
      <span className="inline-flex items-center rounded-md px-1 -mx-1 ring-2 ring-current/60">
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setDraft(String(value || "")); setEditing(false); }
            if (e.key === "Enter") { e.preventDefault(); commit(); }
          }}
          className="w-8 min-w-0 bg-transparent text-right outline-none"
          style={{ color: "inherit" }}
        />
        <span className="pointer-events-none select-none">s</span>
      </span>
    );
  }

  return (
    <span
      role="textbox"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      onKeyDown={(e) => { if (e.key === "Enter") setEditing(true); }}
      className="cursor-text rounded-md px-1 -mx-1 transition-colors hover:bg-[color:var(--surface-dark-5)]"
    >
      {value || 0}s
    </span>
  );
}



// ─── Autoplay + hover-pause hook ────────────────────────────────────────────

function useAutoAdvance({
  count,
  idx,
  setIdx,
  hovered,
  perSlideMs = 3500,
}: {
  count: number;
  idx: number;
  setIdx: (updater: (i: number) => number) => void;
  hovered: boolean;
  perSlideMs?: number;
}) {
  useEffect(() => {
    if (hovered || count <= 1) return;
    const t = window.setTimeout(() => {
      setIdx((i) => (i + 1) % count);
    }, perSlideMs);
    return () => window.clearTimeout(t);
  }, [idx, hovered, count, perSlideMs, setIdx]);
}

function StepperFill({
  state,
  durationSec,
  color,
  paused,
}: {
  state: "past" | "active" | "future";
  durationSec: number;
  color: string;
  paused: boolean;
}) {
  if (state === "future") return null;
  if (state === "past") {
    return (
      <div
        className="absolute inset-y-0 left-0 w-full"
        style={{ background: color }}
      />
    );
  }
  // active — animate scaleX 0→1 over durationSec; pauses on hover.
  return (
    <div
      key={`${durationSec}`}
      className="absolute inset-y-0 left-0 w-full"
      style={{
        background: color,
        transformOrigin: "left center",
        animation: `stepper-fill ${durationSec}s linear forwards`,
        animationPlayState: paused ? "paused" : "running",
      }}
    />
  );
}



// ─── View: Script Beats ─────────────────────────────────────────────────────

function ScriptBeatsView({
  project,
  focusSceneId,
  onPatch,
  onAgentAssist,
  busyField,
  onIntent,
}: {
  project: ProjectState;
  focusSceneId?: string;
  onPatch?: (patch: ProjectPatch) => void;
  onAgentAssist?: (args: { sceneId: string; field: "title" | "prompt" | "voPrompt"; currentValue: string; instruction: string }) => InlineAskResult | Promise<InlineAskResult>;
  busyField?: { sceneId: string; field: string } | null;
  onIntent?: (intent: StageIntent) => void;
}) {
  const scenes = project.scenes ?? [];
  const initialIdx = Math.max(
    0,
    focusSceneId ? scenes.findIndex((s) => s.id === focusSceneId) : 0,
  );
  const [idx, setIdx] = useState(initialIdx);
  const [hovered, setHovered] = useState(false);
  useEffect(() => setIdx(initialIdx), [initialIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(scenes.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scenes.length]);

  const activeDurationSec = scenes[Math.min(idx, Math.max(0, scenes.length - 1))]?.duration || 4;
  const ask = useInlineAsk();
  const paused = hovered || !!ask?.openFor;
  useAutoAdvance({ count: scenes.length, idx, setIdx, hovered: paused, perSlideMs: activeDurationSec * 1000 });


  const ratio = aspectRatio(project.meta);
  const swatch = useMemo(() => pickThemeSwatch(project), [project]);

  const patchScene = useCallback(
    (id: string, patch: Partial<Scene>) => {
      if (!onPatch) return;
      onPatch({ scenes: [{ id, ...patch }] });
    },
    [onPatch],
  );

  const assistFor = useCallback(
    (sceneId: string, field: "title" | "prompt" | "voPrompt", label: string, currentValue: string): AgentAssist | undefined => {
      if (!onAgentAssist) return undefined;
      return {
        fieldKey: `${sceneId}:${field}`,
        fieldLabel: label,
        onAsk: (instruction) => onAgentAssist({ sceneId, field, currentValue, instruction }),
      };
    },
    [onAgentAssist],
  );

  const isBusy = (sceneId: string, field: string) =>
    !!busyField && busyField.sceneId === sceneId && busyField.field === field;

  // Open the InlineAsk sidebar for a field — same plumbing as the EditableText
  // "Ask agent" pill, so toolbar Edit and inline Edit land in the same thread.
  const openAskFor = useCallback(
    (assist: AgentAssist | undefined, currentValue: string) => {
      if (!assist || !ask) return;
      ask.open({
        key: assist.fieldKey,
        label: assist.fieldLabel,
        value: currentValue,
        onAsk: assist.onAsk,
      });
    },
    [ask],
  );

  if (!scenes.length) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center rounded-3xl border border-dashed border-border text-sm text-muted-foreground">
        No beats yet.
      </div>
    );
  }

  const beat = scenes[Math.min(idx, scenes.length - 1)];

  return (
    <AspectStage ratio={ratio}>
      <div
        className="group relative flex h-full w-full flex-col overflow-hidden rounded-3xl p-10"
        style={{ background: swatch.bg, color: swatch.fg }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <ToolbarIcons
          onRegenerate={
            onIntent
              ? () => onIntent({ kind: "regenerate", targetTitle: beat.title || undefined })
              : undefined
          }
          onEdit={
            onIntent && onAgentAssist && ask
              ? () =>
                  openAskFor(
                    assistFor(beat.id, "prompt", "Scene description", beat.prompt || ""),
                    beat.prompt || "",
                  )
              : undefined
          }
        />
        <div className="flex items-center gap-2 text-sm opacity-80">
          <span>Beat {beat.n}</span>
          <span>·</span>
          <DurationEditor
            value={beat.duration || 0}
            onCommit={(n) => patchScene(beat.id, { duration: n })}
          />
        </div>



        <EditableText
          as="h2"
          value={beat.title || ""}
          placeholder={`Beat ${beat.n}`}
          onCommit={(v) => patchScene(beat.id, { title: v })}
          className="mt-8 font-display text-5xl leading-[1.05] tracking-tight"
          style={{ fontFamily: '"Telka Extended", "Telka", system-ui, sans-serif' }}
          agentAssist={assistFor(beat.id, "title", "Scene title", beat.title || "")}
          busy={isBusy(beat.id, "title")}
        />

        <div className="mt-auto space-y-4 font-mono opacity-90" style={{ fontSize: 18, fontWeight: 400 }}>
          <EditableText
            as="p"
            multiline
            value={beat.prompt || ""}
            placeholder="Scene description…"
            onCommit={(v) => patchScene(beat.id, { prompt: v })}
            className="max-w-2xl whitespace-pre-wrap leading-relaxed"
            agentAssist={assistFor(beat.id, "prompt", "Scene description", beat.prompt || "")}
            busy={isBusy(beat.id, "prompt")}
          />

          <div className="flex max-w-2xl items-start gap-2">
            <span className="opacity-70 shrink-0">VO:</span>
            <EditableText
              as="p"
              multiline
              value={beat.voPrompt || ""}
              placeholder="Voiceover line…"
              onCommit={(v) => patchScene(beat.id, { voPrompt: v })}
              className="flex-1 leading-relaxed"
              agentAssist={assistFor(beat.id, "voPrompt", "Voiceover", beat.voPrompt || "")}
              busy={isBusy(beat.id, "voPrompt")}
            />
          </div>
        </div>


        {/* Time ruler + Pager — widths proportional to scene duration */}
        {(() => {
          const totalSec = scenes.reduce((a, s) => a + (s.duration || 0), 0);
          let cum = 0;
          return (
            <div className="mt-8">
              <div
                className="mb-2 flex items-center font-mono"
                style={{ fontSize: 12, color: swatch.fg, opacity: 0.7 }}
              >
                {scenes.map((s) => {
                  const startSec = cum;
                  cum += s.duration || 0;
                  return (
                    <div
                      key={s.id}
                      className="relative flex items-center"
                      style={{ flexGrow: s.duration || 1, flexBasis: 0 }}
                    >
                      <span>{startSec}s</span>
                      <span
                        aria-hidden
                        className="absolute top-1/2 -translate-y-1/2"
                        style={{ left: "50%", opacity: 0.4 }}
                      >
                        |
                      </span>
                    </div>
                  );
                })}
                <span className="pl-2">{totalSec}s</span>
              </div>
              <div className="flex items-center gap-2">
                {scenes.map((s, i) => {
                  const state: "past" | "active" | "future" =
                    i < idx ? "past" : i === idx ? "active" : "future";
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setIdx(i)}
                      aria-label={`Beat ${s.n}`}
                      className="relative h-1 overflow-hidden rounded-full transition"
                      style={{
                        flexGrow: s.duration || 1,
                        flexBasis: 0,
                        background: `${swatch.fg}33`,
                      }}
                    >
                      <StepperFill
                        state={state}
                        durationSec={s.duration || 1}
                        color={swatch.fg}
                        paused={paused}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}


        <NavArrows
          idx={idx}
          count={scenes.length}
          setIdx={setIdx}
          color={swatch.fg}
        />
      </div>
    </AspectStage>
  );
}

// ─── Nav arrows ─────────────────────────────────────────────────────────────

function NavArrows({
  idx,
  count,
  setIdx,
  color = "#fff",
}: {
  idx: number;
  count: number;
  setIdx: (updater: (i: number) => number) => void;
  color?: string;
}) {
  if (count <= 1) return null;
  const btn =
    "grid h-11 w-11 place-items-center rounded-full bg-black/30 backdrop-blur-sm opacity-0 transition group-hover:opacity-100 hover:bg-black/50 disabled:opacity-0 disabled:group-hover:opacity-30";

  return (
    <>
      <button
        type="button"
        aria-label="Previous"
        disabled={idx <= 0}
        onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.max(0, i - 1)); }}
        className={cn(btn, "absolute left-4 top-1/2 z-20 -translate-y-1/2")}
        style={{ color }}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Next"
        disabled={idx >= count - 1}
        onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.min(count - 1, i + 1)); }}
        className={cn(btn, "absolute right-4 top-1/2 z-20 -translate-y-1/2")}
        style={{ color }}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </>
  );
}

// ─── View: Storyboard ───────────────────────────────────────────────────────

function StoryboardView({
  project,
  assets,
  focusSceneId,
  onPatch,
  onIntent,
}: {
  project: ProjectState;
  assets: ProjectAsset[];
  focusSceneId?: string;
  onPatch?: (patch: ProjectPatch) => void;
  onIntent?: (intent: StageIntent) => void;
}) {
  const scenes = project.scenes ?? [];
  const initialIdx = Math.max(
    0,
    focusSceneId ? scenes.findIndex((s) => s.id === focusSceneId) : 0,
  );
  const [idx, setIdx] = useState(initialIdx);
  const [hovered, setHovered] = useState(false);
  useEffect(() => setIdx(initialIdx), [initialIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(scenes.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scenes.length]);

  const askCtx = useInlineAsk();
  useAutoAdvance({ count: scenes.length, idx, setIdx, hovered: hovered || !!askCtx?.openFor });

  const patchScene = useCallback(
    (id: string, patch: Partial<Scene>) => {
      if (!onPatch) return;
      onPatch({ scenes: [{ id, ...patch }] });
    },
    [onPatch],
  );

  if (!scenes.length) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center rounded-3xl border border-dashed border-border text-sm text-muted-foreground">
        No storyboard yet.
      </div>
    );
  }

  const ratio = aspectRatio(project.meta);
  // One shared themed palette across all slides — same language as the
  // inline storyboard card.
  const tint = pickThemeSwatch(project);
  const active = scenes[Math.min(idx, scenes.length - 1)];
  const activeThumb = resolveThumb(active.thumb, assets);
  const stableUrl = stableAssetUrl(active.id, activeThumb);
  const pad = "clamp(24px, 4.5vw, 64px)";

  return (
    <AspectStage ratio={ratio}>
      <div
        className="group relative flex h-full w-full flex-col overflow-hidden rounded-[44px]"
        style={{ background: tint.bg, color: tint.fg }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <ToolbarIcons
          onRegenerate={
            onIntent
              ? () => onIntent({ kind: "regenerate", targetTitle: active.title || undefined })
              : undefined
          }
        />

        {/* Keyframe fills the slide once rendered; themed tint until then. */}
        {stableUrl && (
          <div className="absolute inset-0">
            <img
              src={stableUrl}
              alt={active.title}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70" />
          </div>
        )}

        {/* Slide content — eyebrow + title top-left, description + VO bottom-left. */}
        <div
          className="relative z-10 flex h-full min-h-0 flex-col"
          style={{ padding: pad, paddingBottom: `calc(${pad} + 28px)` }}
        >
          <div
            className="font-display text-base font-medium leading-5"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.25)" }}
          >
            Beat {active.n} • {active.duration}s
          </div>
          <EditableText
            as="div"
            value={active.title || ""}
            placeholder={`Beat ${active.n}`}
            onCommit={(v) => patchScene(active.id, { title: v })}
            className="mt-6 max-w-[60%] font-display text-[clamp(28px,4vw,48px)] font-medium leading-none drop-shadow"
          />
          <div className="min-h-6 flex-1" />
          <div className="flex max-w-[626px] flex-col gap-8">
            <EditableText
              as="div"
              multiline
              value={active.prompt || ""}
              placeholder="Scene description…"
              onCommit={(v) => patchScene(active.id, { prompt: v })}
              className="font-mono text-[clamp(14px,1.8vw,20px)] leading-[1.25] tracking-[0.4px] drop-shadow"
            />
            {(active.voPrompt || onPatch) && (
              <EditableText
                as="div"
                multiline
                value={active.voPrompt || ""}
                placeholder="VO line…"
                onCommit={(v) => patchScene(active.id, { voPrompt: v })}
                className="max-w-[268px] text-[15px] leading-[18px] drop-shadow"
              />
            )}
          </div>
        </div>

        {/* Segmented progress — one segment per beat, filled up to current. */}
        <div
          className="absolute bottom-8 z-10 flex items-center gap-2"
          style={{ left: pad, right: pad }}
        >
          {scenes.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Beat ${s.n}`}
              className="h-1 min-w-px flex-1 rounded-[1px] transition-colors"
              style={{
                background:
                  i <= idx
                    ? "#FCFAF7"
                    : "rgba(255, 255, 255, 0.25)",
              }}
            />
          ))}
        </div>

        <NavArrows idx={idx} count={scenes.length} setIdx={setIdx} />
      </div>
    </AspectStage>
  );
}


// ─── View: Character ────────────────────────────────────────────────────────

function CharacterView({
  project,
  assets,
  focusCastId,
  onIntent,
}: {
  project: ProjectState;
  assets: ProjectAsset[];
  focusCastId?: string;
  onIntent?: (intent: StageIntent) => void;
}) {
  const cast = project.cast ?? [];
  const initialIdx = Math.max(
    0,
    focusCastId ? cast.findIndex((c) => c.id === focusCastId) : 0,
  );
  const [idx, setIdx] = useState(initialIdx);
  useEffect(() => setIdx(initialIdx), [initialIdx]);

  if (!cast.length) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center rounded-3xl border border-dashed border-border text-sm text-muted-foreground">
        No characters yet.
      </div>
    );
  }

  const active = cast[Math.min(idx, cast.length - 1)];
  const refUrl = resolveThumb(active.ref, assets);
  const src = stableAssetUrl(active.id, refUrl);

  return (
    <div className="relative flex h-full min-h-[420px] w-full overflow-hidden rounded-3xl bg-muted/40">
      <ToolbarIcons
        onRegenerate={
          onIntent
            ? () => onIntent({ kind: "regenerate", targetTitle: active.name })
            : undefined
        }
      />
      <div className="flex min-h-0 w-2/3 items-center justify-center bg-black/5">
        {src ? (
          <img src={src} alt={active.name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
            No portrait yet
          </div>
        )}
      </div>
      <div className="flex w-1/3 flex-col gap-4 p-8">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {active.role || "Character"}
        </div>
        <h2
          className="font-display text-3xl leading-tight tracking-tight text-foreground"
          style={{ fontFamily: '"Telka Extended", "Telka", system-ui, sans-serif' }}
        >
          {active.name}
        </h2>
        {active.notes && (
          <p className="text-sm leading-relaxed text-muted-foreground">{active.notes}</p>
        )}
        {cast.length > 1 && (
          <div className="mt-auto flex flex-wrap gap-2">
            {cast.map((c, i) => {
              const t = stableAssetUrl(c.id, resolveThumb(c.ref, assets));
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={cn(
                    "h-10 w-10 overflow-hidden rounded-full border-2 transition",
                    i === idx ? "border-foreground" : "border-transparent opacity-70 hover:opacity-100",
                  )}
                  aria-label={c.name}
                >
                  {t ? (
                    <img src={t} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-muted text-[10px]">
                      {c.name.slice(0, 1)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export function StageGenerationView({
  gen,
  project,
  assets,
  onAnswer,
  onPatch,
  onAgentAssist,
  busyField,
  onIntent,
}: {
  gen: StageGeneration;
  project: ProjectState;
  assets: ProjectAsset[];
  onAnswer: (value: string, next?: string, ack?: string) => void;
  onPatch?: (patch: ProjectPatch) => void;
  onAgentAssist?: (args: { sceneId: string; field: "title" | "prompt" | "voPrompt"; currentValue: string; instruction: string }) => InlineAskResult | Promise<InlineAskResult>;
  busyField?: { sceneId: string; field: string } | null;
  onIntent?: (intent: StageIntent) => void;
}) {
  const body = useMemo(() => {
    switch (gen.kind) {
      case "script-beats":
        return <ScriptBeatsView project={project} focusSceneId={gen.focusSceneId} onPatch={onPatch} onAgentAssist={onAgentAssist} busyField={busyField} onIntent={onIntent} />;
      case "storyboard":
        return <StoryboardView project={project} assets={assets} focusSceneId={gen.focusSceneId} onPatch={onPatch} onIntent={onIntent} />;
      case "timeline":
        return (
          <StageTimelineView
            project={project}
            assets={assets}
            variant={gen.variant}
            focusSceneId={gen.focusSceneId}
            onPatch={onPatch}
            onIntent={onIntent}
          />
        );
      case "character":

        return <CharacterView project={project} assets={assets} focusCastId={gen.focusCastId} onIntent={onIntent} />;
    }
  }, [gen, project, assets, onPatch, onAgentAssist, busyField, onIntent]);

  const [openFor, setOpenFor] = useState<InlineAskOpen | null>(null);
  const busyKey = busyField ? `${busyField.sceneId}:${busyField.field}` : null;

  const ctx = useMemo<InlineAskCtx>(
    () => ({
      openFor,
      busyKey,
      open: (info) => setOpenFor(info),
      updateValue: (key, value) =>
        setOpenFor((prev) => (prev && prev.key === key && prev.value !== value ? { ...prev, value } : prev)),
      close: () => setOpenFor(null),
    }),
    [openFor, busyKey],
  );

  // Auto-close sidebar when the gen kind changes (different stage entirely).
  useEffect(() => {
    setOpenFor(null);
  }, [gen.kind]);

  const stageContentRef = useRef<HTMLDivElement | null>(null);
  const [stageContentHeight, setStageContentHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!openFor) {
      setStageContentHeight(null);
      return;
    }
    const root = stageContentRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    // Prefer measuring the inner stage card (aspect-ratio constrained) so the
    // sidebar matches the visible main element, not the full scroll area.
    const pickTarget = () =>
      (root.querySelector("[data-stage-card]") as HTMLElement | null) ?? root;
    let target = pickTarget();
    const update = () => {
      target = pickTarget();
      setStageContentHeight(target.getBoundingClientRect().height);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(root);
    if (target && target !== root) ro.observe(target);
    return () => ro.disconnect();
  }, [openFor, gen.kind]);


  const stageKey = `${gen.kind}:${gen.focusSceneId ?? gen.focusCastId ?? ""}`;
  const sidebarOpen = !!openFor;
  const reduceMotion = useReducedMotion();


  return (
    <InlineAskContext.Provider value={ctx}>
      <motion.div layout className="flex h-full max-h-full min-h-0 w-full flex-col gap-6 overflow-hidden">
        <section className="flex min-h-0 w-full flex-1 items-center gap-4 overflow-hidden">
          {/* Stage content column — coupled with sidebar entry: subtle scale
              + translate so the two feel like one gesture. */}
          <motion.div
            layout
            className="flex h-full max-h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            animate={
              reduceMotion
                ? {}
                : sidebarOpen
                  ? { scale: 0.985, x: -6 }
                  : { scale: 1, x: 0 }
            }
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            style={{ transformOrigin: "left center" }}
          >
            <StageFrame contentRef={stageContentRef}>
              <AnimatePresence mode="wait" initial={false}>
                {/* Kind/focus swaps WITHIN a turn — turn-level choreography
                    (incl. the post-answer hold) is owned by agent-shell, so
                    no exit delay here; timings match the shared tokens. */}
                <motion.div
                  key={stageKey}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, filter: "blur(8px)" }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={
                    reduceMotion
                      ? { opacity: 0, transition: { duration: 0.1 } }
                      : {
                          opacity: 0, y: -12, filter: "blur(6px)",
                          transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                        }
                  }
                  transition={
                    reduceMotion
                      ? { duration: 0.15 }
                      : { type: "spring", stiffness: 240, damping: 28, mass: 0.9 }
                  }
                  className="h-full max-h-full min-h-0 w-full"
                >
                  {body}
                </motion.div>
              </AnimatePresence>
            </StageFrame>
          </motion.div>
          <AnimatePresence initial={false}>
            {openFor && (
              <InlineAskSidebar
                key={openFor.key}
                openFor={openFor}
                busyKey={busyKey}
                maxHeight={stageContentHeight}
                onClose={() => setOpenFor(null)}
              />
            )}
          </AnimatePresence>
        </section>
        <StageActionsRow actions={gen.actions} onAnswer={onAnswer} />
      </motion.div>
    </InlineAskContext.Provider>
  );
}





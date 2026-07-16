// AskAgentPanel — the single "Ask agent to rework this field/piece" UI.
// Extracted from the image-triggered CaptionAskPopover so the stage sidebar
// and the floating popover render the exact same header/thread/composer.
// Consumers own only the outer shell (positioned card vs. docked aside).

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Plus } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AGENT_SYMBOL_SVG } from "@/components/studio/generative-card";
import type { InlineAskResult } from "@/components/studio/agent/stage-generations";

export type { InlineAskResult };

export const QUICK_CAPTION_INSTRUCTIONS = [
  "Rewrite",
  "Shorter",
  "Punchier",
  "More cinematic",
];

export const QUICK_MEDIA_INSTRUCTIONS: Record<
  "image" | "video" | "audio",
  string[]
> = {
  image: ["More cinematic", "Brighter", "Change background", "Zoom in"],
  video: ["Slower", "More dynamic", "Different angle", "More cinematic"],
  audio: ["Softer", "More energetic", "Slower", "Different mood"],
};

export function quickInstructionsFor(
  mode: "caption" | "media",
  mediaKind?: "image" | "video" | "audio",
): string[] {
  if (mode === "media" && mediaKind) return QUICK_MEDIA_INSTRUCTIONS[mediaKind];
  return QUICK_CAPTION_INSTRUCTIONS;
}

type AskThreadEntry = {
  id: number;
  instruction: string;
  status: "pending" | "done" | "error";
  replyText?: string;
  error?: string;
};

export function AskAgentPanel({
  title,
  currentValue,
  heading,
  suggestions,
  onAsk,
  onClose,
}: {
  title: string;
  currentValue: string;
  heading?: string;
  suggestions?: string[];
  onAsk: (instruction: string) => Promise<InlineAskResult> | InlineAskResult;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [thread, setThread] = useState<AskThreadEntry[]>([]);
  const busy = thread.some((t) => t.status === "pending");
  const idRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      inputRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread]);

  const send = (instruction: string) => {
    const v = instruction.trim();
    if (!v || busy) return;
    const id = ++idRef.current;
    setThread((t) => [...t, { id, instruction: v, status: "pending" }]);
    setValue("");
    void (async () => {
      try {
        const result = await onAsk(v);
        setThread((t) =>
          t.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: result.ok ? "done" : "error",
                  replyText: result.assistantText,
                  error: result.ok
                    ? undefined
                    : (result.error ?? "Something went wrong"),
                }
              : e,
          ),
        );
      } catch (err) {
        setThread((t) =>
          t.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: "error",
                  error:
                    err instanceof Error ? err.message : "Something went wrong",
                }
              : e,
          ),
        );
      } finally {
        requestAnimationFrame(() =>
          inputRef.current?.focus({ preventScroll: true }),
        );
      }
    })();
  };

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6" style={{ height: 81 }}>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex size-6 items-center justify-center text-black"
            dangerouslySetInnerHTML={{
              __html: AGENT_SYMBOL_SVG.replace(
                'width="14" height="14"',
                'width="22" height="22"',
              ),
            }}
          />
          <p
            className="text-[16px] font-medium leading-[20px] text-black"
            style={{ fontFamily: '"Telka Extended", Telka, sans-serif' }}
          >
            {heading ?? (title ? `Edit ${title}` : "Edit with Agent")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-[33px] items-center justify-center rounded-[12px] border px-2 text-[12px] font-medium leading-4"
            style={{
              borderColor: "var(--surface-dark-6)",
              color: "var(--content-dark-quaternary)",
              fontFamily: "Telka, sans-serif",
            }}
          >
            ESC
          </button>
          <span
            className="text-[12px] font-medium leading-4"
            style={{
              color: "var(--content-dark-quaternary)",
              fontFamily: "Telka, sans-serif",
            }}
          >
            to Close
          </span>
        </div>
      </div>

      {/* Body — conversation */}
      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4"
      >
        {thread.length === 0 && currentValue && (
          <div
            className="line-clamp-3 text-[13px] leading-[18px]"
            style={{
              color: "var(--content-dark-quaternary)",
              fontFamily: "Telka, sans-serif",
            }}
          >
            {currentValue}
          </div>
        )}
        {thread.map((t) => (
          <div key={t.id} className="flex flex-col gap-3">
            <div className="flex flex-col items-end">
              <div
                className="rounded-[16px] px-[10px] py-[10px] text-[15px] leading-[18px]"
                style={{
                  background: "var(--surface-accent-4)",
                  color: "var(--content-dark-secondary)",
                  fontFamily: "Telka, sans-serif",
                  maxWidth: "85%",
                }}
              >
                {t.instruction}
              </div>
            </div>
            {t.status === "pending" && (
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex size-4 items-center justify-center"
                  style={{ color: "var(--content-dark-quaternary)" }}
                  dangerouslySetInnerHTML={{ __html: AGENT_SYMBOL_SVG }}
                />
                <div
                  className="text-[12px] leading-4"
                  style={{
                    color: "var(--content-dark-quaternary)",
                    fontFamily: '"Telka Extended", Telka, sans-serif',
                    fontWeight: 500,
                  }}
                >
                  <Shimmer>Regenerating...</Shimmer>
                </div>
              </div>
            )}
            {t.status === "done" && (
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex size-4 items-center justify-center"
                  style={{ color: "var(--content-accent-darkened)" }}
                  dangerouslySetInnerHTML={{ __html: AGENT_SYMBOL_SVG }}
                />
                <span
                  className="text-[12px] leading-4"
                  style={{
                    color: "var(--content-dark-quaternary)",
                    fontFamily: '"Telka Extended", Telka, sans-serif',
                    fontWeight: 500,
                  }}
                >
                  Applied
                </span>
              </div>
            )}
            {t.status === "error" && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                {t.error}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer — quick chips + composer */}
      <div className="flex flex-col gap-[10px] p-3">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={busy}
            aria-label="Add"
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40"
            style={{
              background: "var(--surface-light-2)",
              color: "var(--content-dark-tertiary)",
            }}
          >
            <Plus className="size-4" strokeWidth={2} />
          </button>
          {(suggestions ?? QUICK_CAPTION_INSTRUCTIONS).map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => send(q)}
              className="inline-flex items-center justify-center rounded-[99px] px-3 pt-2 pb-[10px] text-[12px] leading-4 transition disabled:opacity-40"
              style={{
                background: "transparent",
                color: "var(--content-dark-quaternary)",
                fontFamily: "Telka, sans-serif",
                fontWeight: 500,
              }}
            >
              {q}
            </button>
          ))}
        </div>
        <div
          className="flex items-center justify-between gap-2 rounded-[16px] border p-2"
          style={{
            background: "var(--surface-light-2)",
            borderColor: "var(--surface-dark-6)",
          }}
        >
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(value);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Describe the change..."
            disabled={busy}
            className="flex-1 bg-transparent pl-4 text-[15px] leading-[18px] outline-none placeholder:opacity-50 disabled:opacity-60"
            style={{
              color: "var(--content-dark-primary)",
              fontFamily: "Telka, sans-serif",
            }}
          />
          <button
            type="button"
            onClick={() => send(value)}
            disabled={!value.trim() || busy}
            aria-label="Ask agent"
            className="flex h-10 min-w-12 items-center justify-center rounded-[18px] px-3 py-[10px] text-white transition disabled:opacity-40"
            style={{ background: "var(--surface-dark-1)" }}
          >
            <ArrowUp className="size-5" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
}

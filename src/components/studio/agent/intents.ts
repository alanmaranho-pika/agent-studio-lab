// StageIntent — the single vocabulary for everything a user can "do" to the
// center stage. Every interaction surface (option cards, media-card actions,
// stage toolbar icons, the composer, keyboard nav — and later, voice) builds
// one of these and hands it to the shell's dispatcher. New input modalities
// plug in by producing intents; they never need bespoke wiring.

import type { ProjectAsset } from "@/lib/project-state";

export type EditableSceneField = "title" | "prompt" | "voPrompt";

export type StageIntent =
  /** Answer the current question / submit a choice (option cards, forms, CTAs). */
  | { kind: "answer"; value: string; assets?: ProjectAsset[] }
  /** Free-form composer message. */
  | { kind: "compose"; text: string }
  /** Re-roll a generated media item, same intent, new take. */
  | { kind: "regenerate"; targetTitle?: string }
  /** Natural-language edit of a generated media item. */
  | { kind: "edit-media"; targetTitle?: string; instruction: string }
  /** Rework a single scene field via the inline-ask side thread. */
  | {
      kind: "edit-field";
      sceneId: string;
      field: EditableSceneField;
      currentValue: string;
      instruction: string;
    }
  /** Navigate the turn history: back = older, forward = newer, live = latest. */
  | { kind: "history"; dir: "back" | "forward" | "live" };

export type InlineAskOutcome = {
  ok: boolean;
  assistantText?: string;
  error?: string;
};

/**
 * Dispatch signature. Most intents are fire-and-forget; `edit-field` resolves
 * with the inline-ask outcome so the side thread can render applied/error
 * states.
 */
export type IntentDispatcher = (
  intent: StageIntent,
) => Promise<InlineAskOutcome | void> | void;

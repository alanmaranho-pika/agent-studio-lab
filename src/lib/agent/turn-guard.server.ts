// Turn guard — runtime enforcement of the invariants the old prompt begged
// for in ALL-CAPS prose. Structural violations are returned as tool errors
// (the model self-corrects in-loop); repairable issues (over-length ack,
// missing media block) are fixed deterministically with zero retries.

import type { RenderTurn, TurnBlock } from "./ui-schema";
import { isInteractiveBlock, isPrimaryStageBlock } from "./ui-schema";

export type ProducedMedia = {
  url: string;
  kind: "image" | "video" | "audio";
  title?: string;
};

// Flags prose that reads like a LIVE status line ("Generating your beats…"),
// not any sentence containing a work verb ("Ready to start rendering?" is a
// legitimate question). Match when the turn opens with a progress gerund, or
// a waiting phrase runs straight into an ellipsis.
const PROGRESS_RE =
  /^\s*(generating|rendering|processing)\b|(generating|rendering|processing|working on it|one (?:sec|moment)|hang tight|please wait)\s*(…|\.\.\.)/i;

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function truncateWords(s: string, maxWords: number): string {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return s.trim();
  return `${words.slice(0, maxWords).join(" ")}…`;
}

export type TurnGuard = {
  /** Call from tool executes whenever a tool produces a visible media URL. */
  trackMedia: (media: ProducedMedia) => void;
  /** Whether any render job was actually started this turn (gates the
   * fake-progress lint — "kicked off, watch the stage" is legit then). */
  markJobStarted: () => void;
  /**
   * Validate + repair the model's render_turn payload.
   * Returns `{ ok: false, errors }` for structural violations the model
   * must fix, or `{ ok: true, turn }` with deterministic repairs applied.
   */
  finalize: (turn: RenderTurn) => { ok: true; turn: RenderTurn } | { ok: false; errors: string[] };
};

export function createTurnGuard(): TurnGuard {
  const produced: ProducedMedia[] = [];
  let jobStarted = false;

  return {
    trackMedia(media) {
      if (media.url && /^https?:/.test(media.url)) produced.push(media);
    },
    markJobStarted() {
      jobStarted = true;
    },
    finalize(turn) {
      const errors: string[] = [];
      const blocks: TurnBlock[] = [...(turn.blocks ?? [])];

      // One decision per turn — by construction.
      const interactive = blocks.filter(isInteractiveBlock);
      if (interactive.length > 1) {
        errors.push(
          `One decision per turn: you sent ${interactive.length} interactive blocks (${interactive
            .map((b) => b.type)
            .join(", ")}). Keep the single most important one and ask the rest on later turns.`,
        );
      }

      // The center stage is a single surface, not a vertical feed. A gallery
      // plus a media card (or any other pair of primary blocks) competes for
      // attention and can push the useful content underneath the composer.
      const primaryStageBlocks = blocks.filter(isPrimaryStageBlock);
      if (primaryStageBlocks.length > 1) {
        errors.push(
          `One primary stage surface per turn: you sent ${primaryStageBlocks.length} (${primaryStageBlocks
            .map((b) => b.type)
            .join(", ")}). Keep the one that represents the current decision; put its CTAs in that block's actions.`,
        );
      }

      // Stage/timeline views own the whole stage — no competing interactive block.
      const hasStage = blocks.some((b) => b.type === "stage" || b.type === "timeline");
      if (hasStage && interactive.length > 0) {
        errors.push(
          "A stage/timeline block fills the whole stage — put next steps in its `actions` instead of adding an options/form/upload block.",
        );
      }

      // Media URLs must come from this turn's tools or be plausibly real.
      for (const b of blocks) {
        if (b.type === "media" && !/^(https?:|blob:|data:)/.test(b.url)) {
          errors.push(
            `media block url "${b.url.slice(0, 60)}" is not a real URL. Use the exact url a tool returned.`,
          );
        }
        if (b.type === "gallery") {
          for (const it of b.items) {
            if (!/^(https?:|blob:|data:)/.test(it.url)) {
              errors.push(
                `gallery image url "${it.url.slice(0, 60)}" is not a real URL. Use the exact url a tool returned.`,
              );
            }
          }
        }
        if (b.type === "moodboard") {
          for (const it of b.items) {
            if (it.kind === "image" && !/^(https?:|blob:|data:)/.test(it.url)) {
              errors.push(
                `moodboard image url "${it.url.slice(0, 60)}" is not a real URL. Use the exact url a tool returned.`,
              );
            }
          }
        }
      }

      // Fake progress lint — frozen turns must not claim live work unless a
      // job genuinely started this turn.
      if (!jobStarted && PROGRESS_RE.test(turn.prose)) {
        errors.push(
          `prose reads as a live status ("${turn.prose}") but no job was started this turn. Either start the job first or state a finished fact.`,
        );
      }

      if (errors.length) return { ok: false, errors };

      // --- Deterministic repairs ---

      // Shot lists belong in the storyboard slides, not a plain list. When
      // the model reaches for `list` but the items read as shots/beats
      // ("Shot 1 · 5s"), coerce to a storyboard block: meta carries over,
      // and "Title — description" text splits at the first dash.
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.type !== "list" || b.items.length < 2) continue;
        const shotLike = b.items.filter((it) => /^(shot|beat|scene)\s*\d/i.test(it.meta ?? ""));
        if (shotLike.length < Math.ceil(b.items.length / 2)) continue;
        blocks[i] = {
          type: "storyboard",
          title: b.title,
          items: b.items.map((it) => {
            const split = /^(.{1,64}?)\s+[—–-]\s+(.+)$/s.exec(it.text);
            const title = (split ? split[1] : it.text).slice(0, 64).trim() || "Shot";
            const text = split ? split[2].slice(0, 280).trim() : undefined;
            return { meta: it.meta, title, text };
          }),
          actions: b.actions,
        };
      }

      // An actions row is a confirm/next-step strip UNDER content — never the
      // turn's primary choice set. A standalone multi-button actions block
      // (no media/list/stage/custom_html anywhere in the turn) is really the
      // model asking a question, so coerce it into a proper options grid.
      // Single-button rows stay: a lone "Continue" under prose is a
      // legitimate pure-confirmation CTA.
      const hasContentBlock = blocks.some(
        (b) =>
          b.type === "media" ||
          b.type === "gallery" ||
          b.type === "moodboard" ||
          b.type === "list" ||
          b.type === "storyboard" ||
          b.type === "stage" ||
          b.type === "timeline" ||
          b.type === "custom_html",
      );
      if (!hasContentBlock && !blocks.some(isInteractiveBlock)) {
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          if (b.type === "actions" && b.buttons.length >= 2) {
            blocks[i] = {
              type: "options",
              items: b.buttons.map((btn) => ({
                value: btn.value,
                title: btn.label,
              })),
            };
          }
        }
      }

      let ack = turn.ack?.trim() || undefined;
      if (ack && wordCount(ack) > 8) ack = truncateWords(ack, 8);
      let prose = turn.prose.trim();
      if (wordCount(prose) > 18) prose = truncateWords(prose, 18);

      // Media-in-same-turn: if tools produced media the payload doesn't
      // show (and no stage view is doing the showing), append it.
      const shownUrls = new Set(
        blocks.flatMap((b) =>
          b.type === "media"
            ? [b.url, ...(b.variants ?? [])]
            : b.type === "gallery"
              ? b.items.map((it) => it.url)
              : b.type === "moodboard"
                ? b.items.flatMap((it) => (it.kind === "image" ? [it.url] : []))
                : [],
        ),
      );
      const missing = produced.filter((m) => !shownUrls.has(m.url));
      if (missing.length && !hasStage) {
        const latest = missing[missing.length - 1];
        const siblings = missing.slice(0, -1).map((m) => m.url);
        blocks.push({
          type: "media",
          url: latest.url,
          mediaKind: latest.kind,
          title: latest.title,
          variants: siblings.length ? [...siblings, latest.url] : undefined,
          actions: [],
        });
      }

      // Preserve `next` — the chambered hint for the FOLLOWING turn's
      // skeleton; dropping it here would silently disable prediction.
      return { ok: true, turn: { ack, prose, blocks, next: turn.next } };
    },
  };
}

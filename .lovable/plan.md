## Problem

Two implementations of the inline "Ask agent to rework this field" UI exist:

- **Canonical (keep)** — `CaptionAskPopover` in `src/components/studio/generative-card.tsx` (~lines 1623–1923). This is the one triggered from images / video / audio pieces and from the field-level "AI Rewrite" button. Pika‑style card: agent‑symbol header + "ESC to Close", `surface-accent-4` user bubble, agent‑symbol "Regenerating…" / "Applied" rows, chip row led by a `+` circle, rounded composer with `ArrowUp` submit.
- **Legacy (replace)** — `InlineAskSidebar` in `src/components/studio/agent/stage-generations.tsx` (~lines 347–600). Docked sidebar with `Editing` chip, `Current` context block, `Reworking…` bouncing dot, `Check` was/now diff, plain chip row. This is what the user is looking at now on the scene editor.

The sidebar must render the same panel we built earlier for images.

## Approach

Extract the panel content from `CaptionAskPopover` into a reusable component and mount it inside the existing sidebar shell. `CaptionAskPopover`'s outer positioned card also switches to the extracted component so both entry points render from one source.

### New file — `src/components/studio/agent/ask-agent-panel.tsx`

Export `AskAgentPanel` — the header + thread + footer that lives in `CaptionAskPopover` today, with no positioning concerns:

- Props: `title`, `currentValue`, `heading?`, `suggestions?`, `onAsk`, `onClose`.
- Owns: `thread` state, composer `value`, `send()` mapping `onAsk` result to `pending / done / error`, auto‑scroll, autofocus, `Enter` / `Shift+Enter` / `Escape`.
- Renders the exact JSX currently inside `CaptionAskPopover`'s inner card:
  - Header: `AGENT_SYMBOL_SVG` glyph + title + `ESC` chip + "to Close" label.
  - Body: empty‑state `currentValue` preview, right‑aligned user bubble on `surface-accent-4`, agent status row with symbol + `Shimmer` "Regenerating…" / "Applied", destructive error block.
  - Footer: chip row led by a `+` circle button, then `suggestions ?? QUICK_CAPTION_INSTRUCTIONS`; rounded composer input with `ArrowUp` submit.
- Also exports `QUICK_CAPTION_INSTRUCTIONS`, `QUICK_MEDIA_INSTRUCTIONS`, `quickInstructionsFor`, and re-exports the `InlineAskResult` type so both call sites import from one place.

### Update `generative-card.tsx`

- Delete the local `AskThreadEntry`, quick‑instruction constants, and the entire body of `CaptionAskPopover`.
- Keep `CaptionAskPopover` as a thin shell: compute `top / left / height` from `rect + placement` exactly as today, render the fixed backdrop + positioned rounded card, and place `<AskAgentPanel …/>` inside it. Public props and all call sites stay unchanged.

### Update `stage-generations.tsx`

- Replace the entire `InlineAskSidebar` body (Editing chip, Current block, transcript, composer, chip row, `X` close, `Shimmer` "Reworking…", `Check` diff) with `<AskAgentPanel title={openFor.label} currentValue={openFor.value} onAsk={openFor.onAsk} onClose={onClose} />` inside the existing `motion.aside` shell — the 380px docked width, `maxHeight` clamp, and spring entry/exit animation stay.
- Move `InlineAskResult` to be imported from `ask-agent-panel.tsx`.
- Drop now‑unused imports (`Check`, `X`, `Shimmer`, `AnimatePresence`, `QUICK_INSTRUCTIONS`, `TranscriptEntry`). `InlineAskContext`, `useInlineAsk`, `AgentAssist`, `busyKey` plumbing all stay so every existing call site keeps working.

### Behavior parity to preserve

- Sidebar entry/exit animation and docked width.
- `openFor.onAsk(instruction)` remains the sole async path; result shape (`{ ok, assistantText, mediaUrl?, error? }`) unchanged.
- `Escape` closes the panel from both shells.
- Quick chips default to `QUICK_CAPTION_INSTRUCTIONS` in both entry points — the sidebar's old `Rewrite / Shorter / More action / Wider shot` list is dropped so images and fields show the same suggestions.

### Out of scope

- No change to who opens the panel, no change to `onAsk` implementations, no change to `CaptionAskPopover`'s positioning math or callers, no backend / server function changes.
- No visual redesign — the sidebar simply adopts the existing image‑triggered panel look.

## Technical details

- Files: 1 new (`src/components/studio/agent/ask-agent-panel.tsx`), 2 edited (`generative-card.tsx`, `stage-generations.tsx`).
- Moved imports into the new file: `AGENT_SYMBOL_SVG` from `@/components/studio/agent/agent-symbol`, `ArrowUp` / `Plus` from `lucide-react`, `Shimmer` from `@/components/ai-elements/shimmer`.
- No route, schema, or public API changes.
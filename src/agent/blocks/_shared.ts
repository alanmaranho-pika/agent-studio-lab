// Shared sub-schemas reused by multiple blocks (option items, action
// buttons, form fields, visuals). Kept in one place so every block file
// can import the same primitives — the discriminated union is composed in
// _registry.ts.

import { z } from "zod";
import { ICON_SLUGS, NEXT_UI_HINTS } from "./types";

export const NextHintSchema = z
  .enum(NEXT_UI_HINTS)
  .optional()
  .describe(
    "What the NEXT turn will most likely show once the user answers — powers the placeholder shown while you compose. Follow your playbook: another question → options; model pick made → media; beats locked → stage; cut ready for review → timeline; prose-only reply → none.",
  );

export const VisualSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ratio"),
    ratio: z
      .enum(["9:16", "16:9", "1:1"])
      .describe("Rule-of-thirds aspect box — use for aspect-ratio choices"),
  }),
  z.object({
    kind: z.literal("icon"),
    icon: z.enum(ICON_SLUGS),
    bg: z
      .string()
      .regex(/^#[0-9a-fA-F]{3,8}$/)
      .optional()
      .describe("Hex tint behind the icon, e.g. #FFD43B"),
  }),
  z.object({
    kind: z.literal("image"),
    url: z.string().describe("Image URL from project assets / tool results — never invent one"),
  }),
]);

export const OptionItemSchema = z.object({
  value: z
    .string()
    .min(1)
    .max(160)
    .describe(
      "Echoed verbatim as the user's reply when tapped — write it as natural language ('Describe it to you'), never snake_case ids",
    ),
  title: z.string().min(1).max(48),
  subtitle: z.string().max(72).optional().describe("One short line, ~6 words"),
  body: z
    .string()
    .max(360)
    .optional()
    .describe(
      "2–4 sentence pitch (concepts, loglines, treatments). Turns the option into a tinted full-text 'pitch card' — use when comparing exclusive creative alternatives side-by-side; subtitle becomes the eyebrow (e.g. 'Concept A · 30s')",
    ),
  titleFont: z
    .string()
    .max(48)
    .regex(/^[A-Za-z0-9 ]+$/)
    .optional()
    .describe(
      "PITCH CARDS ONLY. Exact Google Fonts family name for THIS option's title, chosen to match its mood (e.g. 'Playfair Display' for elegant, 'Bebas Neue' for bold, 'Space Mono' for technical). The client loads it live from Google Fonts. Letters/digits/spaces only — must be a real family.",
    ),
  palette: z
    .object({
      bg: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).describe("Card background, deep enough for bright text"),
      fg: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).describe("Text color — high contrast on bg"),
      accent: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional().describe("Eyebrow / highlight tint"),
    })
    .optional()
    .describe(
      "PITCH CARDS ONLY. A UNIQUE palette for THIS option matching its mood — so each concept reads distinctly, not as variations of one swatch. Omit to inherit the shared project swatch.",
    ),
  visual: VisualSchema.optional().describe("Strongly recommended — options look empty without one (skip for pitch cards with `body`)"),
  next: NextHintSchema.describe(
    "Per-option override of the turn-level `next` when answers diverge (e.g. 'Upload photo' → upload, 'Describe it' → form)",
  ),
  ack: z
    .string()
    .max(60)
    .optional()
    .describe(
      "Pre-written reaction (≤8 words, no question) shown INSTANTLY when the user picks this, while you compose the next turn. Mirror the ack you'd open the next turn with.",
    ),
});

export const ActionButtonSchema = z.object({
  value: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Echoed as the user's reply when clicked. Must express the SAME choice as `label` (a fuller sentence of it is fine) — never a different idea.",
    ),
  label: z.string().min(1).max(40).describe("What the user sees on the button"),
  primary: z.boolean().optional().describe("Mark at most one confirm/primary action"),
  next: NextHintSchema.describe(
    "Per-action override of the turn-level `next` when actions diverge (e.g. 'Approve' → media render vs 'Rework a beat' → form)",
  ),
  ack: z
    .string()
    .max(60)
    .optional()
    .describe(
      "Pre-written reaction (≤8 words, no question) shown INSTANTLY when the user picks this, while you compose the next turn. Mirror the ack you'd open the next turn with.",
    ),
});

export const FormFieldSchema = z.object({
  type: z.enum([
    "text",
    "textarea",
    "url",
    "number",
    "slider",
    "color",
    "date",
    "checkboxes",
    "chips",
  ]),
  key: z.string().min(1).max(48).describe("Field name, snake_case"),
  label: z.string().min(1).max(60),
  placeholder: z.string().max(140).optional(),
  options: z
    .array(z.string().max(60))
    .max(12)
    .optional()
    .describe("Required for checkboxes/chips — the selectable values"),
  multi: z.boolean().optional().describe("chips only: allow selecting several"),
  min: z.number().optional().describe("slider/number"),
  max: z.number().optional().describe("slider/number"),
  step: z.number().optional().describe("slider/number"),
  value: z.union([z.string(), z.number()]).optional().describe("Prefill / default"),
});

export type TurnOptionItem = z.infer<typeof OptionItemSchema>;
export type TurnActionButton = z.infer<typeof ActionButtonSchema>;
export type TurnFormField = z.infer<typeof FormFieldSchema>;

/** Shared form-field HTML renderer used by form + upload blocks. */
import { esc } from "./types";

export function formFieldHtml(f: TurnFormField): string {
  const label = `<span class="text-sm text-muted-foreground">${esc(f.label)}</span>`;
  const name = esc(f.key);
  const placeholder = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : "";
  const prefill = f.value != null ? ` value="${esc(String(f.value))}"` : "";
  switch (f.type) {
    case "textarea": {
      const inner = f.value != null ? esc(String(f.value)) : "";
      return `<div data-input-field><label>${esc(f.label)}</label><textarea name="${name}" rows="3"${placeholder}>${inner}</textarea></div>`;
    }
    case "text":
    case "url":
      return `<div data-input-field><label>${esc(f.label)}</label><input type="${f.type}" name="${name}"${placeholder}${prefill} /></div>`;
    case "number":
      return `<div data-input-field><label>${esc(f.label)}</label><input type="number" name="${name}"${f.min != null ? ` min="${f.min}"` : ""}${f.max != null ? ` max="${f.max}"` : ""}${f.step != null ? ` step="${f.step}"` : ""}${prefill} /></div>`;
    case "slider":
      return `<label class="flex flex-col gap-2">${label}<input type="range" name="${name}" min="${f.min ?? 1}" max="${f.max ?? 10}" step="${f.step ?? 1}"${prefill} /></label>`;
    case "color":
      return `<label class="flex flex-col gap-2">${label}<input type="color" name="${name}"${prefill} /></label>`;
    case "date":
      return `<label class="flex flex-col gap-2">${label}<input type="date" name="${name}"${prefill} /></label>`;
    case "checkboxes": {
      const boxes = (f.options ?? [])
        .map(
          (o) =>
            `<label class="flex items-center gap-3 rounded-2xl border border-border p-4 cursor-pointer hover:border-primary/50"><input type="checkbox" name="${name}" value="${esc(o)}" /> <span>${esc(o)}</span></label>`,
        )
        .join("");
      return `<div class="flex flex-col gap-2">${label}<div class="grid grid-cols-2 gap-3">${boxes}</div></div>`;
    }
    case "chips": {
      const chips = (f.options ?? [])
        .map(
          (o) =>
            `<button type="button" data-pill data-group="${name}"${f.multi ? " data-multi" : ""} data-value="${esc(o)}" class="rounded-full border border-border px-4 py-3 text-sm">${esc(o)}</button>`,
        )
        .join("");
      return `<div class="flex flex-col gap-2">${label}<div class="flex flex-wrap gap-2">${chips}</div></div>`;
    }
  }
  return "";
}

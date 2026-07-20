# BLK_FORM

Structured input — 1–2 named fields the user fills before submitting. Use for briefs, prompts, custom parameters, and any input the app registry describes as `text`, `url`, `number`, `slider`, `color`, `date`, `chips`, or `checkboxes`.

## When to use

- Free-text answers ("What's the tagline?"), URLs, numbers, sliders, colors.
- Chip / checkbox picks that carry multi-select or need a submit step.

## When NOT to use

- Single-choice pickers with visuals — use `options`.
- Uploads or paste-URL asset intake — use `upload`.

## Author checklist

- Keep the field count to 1–2. If you need more, split across turns.
- Provide `placeholder` for open-ended text. Prefill via `value` when reopening a prior answer.
- The submit label defaults to "Continue"; override only for a domain-specific verb.


// Serializes a RenderTurn (the typed Gen-UI contract in ui-schema.ts) into
// the stage's existing HTML dialect — the same data-* markup the model used
// to hand-write. This lets the typed contract reuse the entire proven
// runtime unchanged: DOMPurify sanitization, gen-option-enhancer visuals,
// GenerativeCard's delegated click handling, and the data-gen-view stage
// path. Isomorphic (no DOM / React imports) so both server-side guards and
// the client can call it.

import type { RenderTurn, TurnBlock, TurnActionButton, TurnFormField } from "./ui-schema";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function actionButtons(actions: TurnActionButton[] | undefined): string {
  if (!actions?.length) return "";
  const buttons = actions
    .map(
      (a) =>
        `<button data-action="answer" data-value="${esc(a.value)}"${a.primary ? " data-primary" : ""}${a.next ? ` data-next="${esc(a.next)}"` : ""}${a.ack ? ` data-ack="${esc(a.ack)}"` : ""}>${esc(a.label)}</button>`,
    )
    .join("");
  return `<div data-gen-actions>${buttons}</div>`;
}

function formField(f: TurnFormField): string {
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
}

function blockToHtml(block: TurnBlock): string {
  switch (block.type) {
    case "options": {
      const items = block.items
        .map((item) => {
          let visual = "";
          const v = item.visual;
          if (v?.kind === "ratio") {
            visual = `<span data-visual="ratio-${v.ratio.replace(":", "-")}"></span>`;
          } else if (v?.kind === "icon") {
            visual = `<span data-visual="icon" data-icon="${esc(v.icon)}"${v.bg ? ` data-icon-bg="${esc(v.bg)}"` : ""}></span>`;
          } else if (v?.kind === "image") {
            visual = `<span data-visual="image" data-src="${esc(v.url)}"></span>`;
          }
          const subtitle = item.subtitle ? `<span data-subtitle>${esc(item.subtitle)}</span>` : "";
          return `<button data-action="answer" data-value="${esc(item.value)}"${item.next ? ` data-next="${esc(item.next)}"` : ""}${item.ack ? ` data-ack="${esc(item.ack)}"` : ""}>${visual}<span data-title>${esc(item.title)}</span>${subtitle}</button>`;
        })
        .join("");
      return `<div data-options${block.cols ? ` data-cols="${block.cols}"` : ""}>${items}</div>`;
    }
    case "form": {
      const fields = block.fields.map(formField).join("");
      return [
        `<div data-card><form data-action="answer" class="flex flex-col gap-5">`,
        fields,
        `<div class="flex flex-wrap items-center justify-end gap-3">`,
        `<button type="button" data-action="answer" data-value="You decide for me">You decide</button>`,
        `<button type="submit" data-primary>${esc(block.submitLabel || "Continue")}</button>`,
        `</div></form></div>`,
      ].join("");
    }
    case "upload": {
      const accept =
        block.kind === "voice" || block.kind === "audio"
          ? "audio/*"
          : block.kind === "video"
            ? "video/*"
            : "image/*";
      const uploadIcon =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
      const linkIcon =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
      const hint = block.hint ? `<span class="gen-upload-hint">${esc(block.hint)}</span>` : "";
      const uploadCard =
        `<label class="gen-upload-card gen-upload-card--file">` +
        `<span class="gen-upload-icon">${uploadIcon}</span>` +
        `<input type="file" data-upload data-kind="${block.kind}" data-value="${esc(block.label)}" accept="${accept}" class="hidden" />` +
        `<span class="gen-upload-body"><span class="gen-upload-title">${esc(block.label)}</span>${hint}</span>` +
        `</label>`;

      // Upload + Paste URL — two tall cards inside a form, committed via a
      // Continue button (upload stages its file, URL fills its field).
      if (block.allowUrl) {
        const skip = block.skipValue
          ? `<button type="button" data-action="answer" data-value="${esc(block.skipValue)}" class="gen-cta gen-cta-secondary">Agent Decides</button>`
          : "";
        const urlCard =
          `<div class="gen-upload-card gen-upload-card--url">` +
          `<span class="gen-upload-icon">${linkIcon}</span>` +
          `<span class="gen-upload-body"><span class="gen-upload-title">Paste URL</span>` +
          `<input type="url" name="url" placeholder="www…" class="gen-upload-url-input" /></span>` +
          `</div>`;
        return [
          `<div data-card><form data-action="answer">`,
          `<div class="gen-upload" data-cols="2">${uploadCard}${urlCard}</div>`,
          `<div class="gen-upload-actions">`,
          `<button type="submit" class="gen-cta gen-cta-primary">Continue</button>`,
          skip,
          `</div>`,
          `</form></div>`,
        ].join("");
      }

      // Upload only — a single tall card that auto-submits on file pick.
      const camera = block.allowCamera
        ? `<button data-action="capture" data-capture="camera" data-kind="${block.kind}" class="gen-cta gen-cta-secondary">Take a photo</button>`
        : "";
      const skip = block.skipValue
        ? `<button type="button" data-action="answer" data-value="${esc(block.skipValue)}" class="gen-cta gen-cta-secondary">Skip</button>`
        : "";
      const actions =
        camera || skip
          ? `<div class="gen-upload-actions">${camera}${skip}</div>`
          : "";
      return `<div class="gen-upload" data-cols="1">${uploadCard}</div>${actions}`;
    }
    case "media": {
      const title = block.title ? `<h3 data-card-title>${esc(block.title)}</h3>` : "";
      const caption = block.caption ? `<p data-card-caption>${esc(block.caption)}</p>` : "";
      const media =
        block.mediaKind === "video"
          ? `<video src="${esc(block.url)}" class="w-full h-auto rounded-2xl" controls autoplay muted playsinline></video>`
          : block.mediaKind === "audio"
            ? `<audio src="${esc(block.url)}" controls class="w-full"></audio>`
            : `<img src="${esc(block.url)}" class="w-full h-auto rounded-2xl" />`;
      const cardActions =
        block.mediaKind === "audio"
          ? ""
          : `<button data-card-action="regenerate"></button><button data-card-action="edit"></button><button data-card-action="more"></button>`;
      const variants = block.variants?.length
        ? `<div data-variants>${block.variants
            .map(
              (u) =>
                `<button data-variant${u === block.url ? ` data-active="true"` : ""}><img src="${esc(u)}" /></button>`,
            )
            .join("")}</div>`
        : "";
      return `<div data-card>${media}${title}${caption}${cardActions}${variants}</div>${actionButtons(block.actions)}`;
    }
    case "gallery": {
      // Count-adaptive image grid — 1 centered, 2–3 across, 4–6 wrap. The
      // serializer stays layout-pure: `data-count` drives the CSS grid and
      // enhanceGalleries picks one shared aspect ratio client-side so a set
      // of mixed-shape sources still reads as one consistent row.
      const count = block.items.length;
      const cards = block.items
        .map((item) => {
          const label = item.label
            ? `<span class="gen-gallery-label">${esc(item.label)}</span>`
            : "";
          return `<figure class="gen-gallery-item"><img src="${esc(item.url)}" />${label}</figure>`;
        })
        .join("");
      return `<div data-card${block.title ? ` data-card-title="${esc(block.title)}"` : ""}><div class="gen-gallery" data-count="${count}">${cards}</div></div>${actionButtons(block.actions)}`;
    }
    case "moodboard": {
      // Masonry collage — CSS multi-columns pack mixed-shape tiles, every
      // image at its native aspect ratio (width: 100%, height: auto — no
      // aspect boxes, no cropping). Colors travel as data attrs because
      // DOMPurify strips inline styles; enhanceMoodboards paints them
      // client-side after sanitize.
      const cols = block.items.length <= 4 ? "2" : block.items.length >= 8 ? "4" : "3";
      const tiles = block.items
        .map((tile) => {
          if (tile.kind === "image") {
            const label = tile.label
              ? `<span class="gen-gallery-label">${esc(tile.label)}</span>`
              : "";
            return `<figure class="gen-mood-tile gen-mood-image"><img src="${esc(tile.url)}" />${label}</figure>`;
          }
          if (tile.kind === "palette") {
            const swatches = tile.colors
              .map((c) => `<span class="gen-mood-swatch" data-swatch="${esc(c)}"></span>`)
              .join("");
            return `<div class="gen-mood-tile gen-mood-palette">${swatches}</div>`;
          }
          const lines = tile.text
            .split("\n")
            .map((l) => esc(l))
            .join("<br />");
          const label = tile.label
            ? `<span class="gen-gallery-label">${esc(tile.label)}</span>`
            : "";
          return `<div class="gen-mood-tile gen-mood-type"${tile.bg ? ` data-bg="${esc(tile.bg)}"` : ""}><span class="gen-mood-type-text">${lines}</span>${label}</div>`;
        })
        .join("");
      return `<div data-card${block.title ? ` data-card-title="${esc(block.title)}"` : ""}><div class="gen-moodboard" data-cols="${cols}">${tiles}</div></div>${actionButtons(block.actions)}`;
    }
    case "list": {
      const items = block.items
        .map(
          (item) =>
            `<li class="rounded-2xl border border-border p-4">${item.meta ? `<div class="text-sm text-muted-foreground">${esc(item.meta)}</div>` : ""}<div class="font-medium">${esc(item.text)}</div></li>`,
        )
        .join("");
      return `<div data-card${block.title ? ` data-card-title="${esc(block.title)}"` : ""}><ol class="space-y-3 my-4">${items}</ol></div>${actionButtons(block.actions)}`;
    }
    case "storyboard": {
      // Stories-style slides — one shot visible at a time. Tinting +
      // navigation are wired client-side by enhanceStoryboards (the
      // serializer is server-pure and DOMPurify strips inline styles).
      const slides = block.items
        .map((item, i) => {
          const eyebrow = item.meta ? `<span class="gen-shot-eyebrow">${esc(item.meta)}</span>` : "";
          const text = item.text ? `<p class="gen-shot-text">${esc(item.text)}</p>` : "";
          const vo = item.vo ? `<p class="gen-shot-vo">${esc(item.vo)}</p>` : "";
          const body = text || vo ? `<div class="gen-shot-body">${text}${vo}</div>` : "";
          return `<section class="gen-shot" data-shot="${i}">${eyebrow}<h3 class="gen-shot-title">${esc(item.title)}</h3>${body}</section>`;
        })
        .join("");
      const segments = block.items
        .map(
          (_, i) =>
            `<button type="button" data-shot-seg="${i}" aria-label="Shot ${i + 1}"><span class="gen-seg-fill"></span></button>`,
        )
        .join("");
      return `<div data-card${block.title ? ` data-card-title="${esc(block.title)}"` : ""} data-storyboard><div class="gen-storyboard">${slides}<div class="gen-storyboard-progress">${segments}</div></div></div>${actionButtons(block.actions)}`;
    }
    case "stage": {
      const focus =
        (block.variant ? ` data-variant="${esc(block.variant)}"` : "") +
        (block.focusSceneId ? ` data-focus-scene="${esc(block.focusSceneId)}"` : "") +
        (block.focusCastId ? ` data-focus-cast="${esc(block.focusCastId)}"` : "");
      return `<div data-gen-view="${block.view}"${focus}></div>${actionButtons(block.actions)}`;
    }
    case "actions":
      return actionButtons(block.buttons);
    case "custom_html":
      return block.html;
  }
}

/**
 * Serialize a RenderTurn into the legacy stage HTML dialect. The output
 * flows through the exact same client pipeline as hand-written model HTML
 * (sanitize → enhance → delegate), so typed turns and legacy turns are
 * indistinguishable at render time.
 */
export function renderTurnToHtml(turn: RenderTurn): string {
  const parts: string[] = [];
  if (turn.ack) parts.push(`<p data-ack>${esc(turn.ack)}</p>`);
  parts.push(`<p data-prose>${esc(turn.prose)}</p>`);
  for (const block of turn.blocks ?? []) parts.push(blockToHtml(block));
  return parts.join("\n");
}

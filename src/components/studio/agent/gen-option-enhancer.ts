// Enhances streamed Gen-UI option pickers into the styled option cards.
//
// The model emits a raw grid:
//   <div data-options data-cols="3">
//     <button data-action="answer" data-value="9:16">
//       <span data-visual="ratio-9-16"></span>
//       <span data-title>9:16</span>
//       <span data-subtitle>Vertical / Social</span>
//     </button>
//     …
//   </div>
//
// After DOMPurify has run, this helper walks each `[data-options]`, applies
// grid + card classes, materializes visuals (rule-of-thirds ratio boxes,
// lucide icons in tinted squares, or images), wraps the title+subtitle in
// a bottom-aligned body, and appends the "Agent Decides" fallback pill.

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AGENT_MARK_SVG_MARKUP as AGENT_MARK_SVG } from "@/components/studio/agent/agent-mark";
import {
  Music,
  Users,
  UserRound,
  Mic,
  Camera,
  Film,
  Image as ImageIcon,
  Palette,
  Sparkles,
  Wand2,
  Zap,
  Sun,
  Moon,
  Cloud,
  Star,
  Heart,
  Play,
  Volume2,
  Speaker,
  Video,
  Clapperboard,
  Type,
  Layers,
  Square,
  Circle,
  Triangle,
  Smile,
  ShoppingBag,
  Shirt,
  Coffee,
  Flame,
  Waves,
  TreePine,
  Building,
  Car,
  Rocket,
  Globe,
  MessageCircle,
  ArrowRight,
  RefreshCcw,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { pickSwatchFromText } from "@/lib/theme-swatch";
import { loadGoogleFont } from "@/lib/google-font-loader";

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

const ICONS: Record<string, typeof Music> = {
  music: Music,
  users: Users,
  user: UserRound,
  voice: Mic,
  mic: Mic,
  camera: Camera,
  film: Film,
  image: ImageIcon,
  palette: Palette,
  sparkles: Sparkles,
  wand: Wand2,
  zap: Zap,
  sun: Sun,
  moon: Moon,
  cloud: Cloud,
  star: Star,
  heart: Heart,
  play: Play,
  volume: Volume2,
  speaker: Speaker,
  video: Video,
  clapperboard: Clapperboard,
  type: Type,
  layers: Layers,
  square: Square,
  circle: Circle,
  triangle: Triangle,
  smile: Smile,
  bag: ShoppingBag,
  shirt: Shirt,
  coffee: Coffee,
  flame: Flame,
  waves: Waves,
  tree: TreePine,
  building: Building,
  car: Car,
  rocket: Rocket,
  globe: Globe,
  message: MessageCircle,
  arrow: ArrowRight,
  plus: Plus,
};

function renderIcon(name: string): string {
  const key = name.toLowerCase().trim();
  const Comp = ICONS[key] ?? Sparkles;
  return renderToStaticMarkup(createElement(Comp, { size: 32, strokeWidth: 2 }));
}

// ---------- Fan layout ----------
// Option cards fan out like a hand of cards — the visual signature for "pick
// one". Within each row, rotation ramps linearly from a left lean on the first
// card to a right lean on the last, and a shallow arc lifts the centre so the
// tops form a gentle arch (the outer cards sit a little lower). Fully
// deterministic from each card's position in its row: a row always fans the
// same way across re-renders and history revisits, and the whole set reads as
// one deliberate spread rather than a random scatter.

const FAN_MAX_ROT = 4; // degrees of lean at the outermost cards
const FAN_ARC = 14; // px the outer cards drop below the centre

function applyFan(
  opt: HTMLElement,
  col: number,
  rowCount: number,
  flatIndex: number,
): void {
  // A lone card in its row stays upright and aligned.
  if (rowCount <= 1) {
    clearFan(opt);
    opt.style.setProperty("--glow-angle", "90deg");
    opt.style.animationDelay = `${(flatIndex * 0.05).toFixed(3)}s`;
    return;
  }
  const center = (rowCount - 1) / 2;
  const norm = (col - center) / center; // -1 (first) … +1 (last)
  const rot = norm * FAN_MAX_ROT;
  const ty = norm * norm * FAN_ARC; // 0 at centre, +ARC at edges (edges sit lower)
  opt.style.setProperty("--rot", `${rot.toFixed(2)}deg`);
  // Hover eases the card partway toward upright, never past 0.
  opt.style.setProperty("--rot-hover", `${(rot * 0.35).toFixed(2)}deg`);
  opt.style.setProperty("--ty", `${ty.toFixed(1)}px`);
  opt.style.setProperty("--glow-angle", `${Math.round(90 + norm * 30)}deg`);
  opt.style.animationDelay = `${(flatIndex * 0.05).toFixed(3)}s`;
}

function clearFan(opt: HTMLElement): void {
  opt.style.setProperty("--rot", "0deg");
  opt.style.setProperty("--rot-hover", "0deg");
  opt.style.setProperty("--ty", "0px");
}



function isRatioVisual(v: string): v is "ratio-9-16" | "ratio-16-9" | "ratio-1-1" {
  return v === "ratio-9-16" || v === "ratio-16-9" || v === "ratio-1-1";
}

function ratioBox(ratio: string): string {
  const key = ratio.replace(/^ratio-/, "");
  return `<div class="gen-option-ratio" data-ratio="${key}"></div>`;
}

function iconBadge(name: string, bg?: string | null): string {
  // Restrict background to safe color forms (hex or rgb/rgba/hsl functional).
  const safe = bg && /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([^)"';]{1,60}\))$/.test(bg.trim())
    ? bg.trim()
    : "var(--surface-light-2)";
  return `<div class="gen-option-icon" style="background:${safe}">${renderIcon(name)}</div>`;
}

function inferCols(count: number): string {
  if (count <= 2) return "2";
  if (count === 3) return "3";
  if (count === 4) return "4";
  if (count <= 6) return "3";
  if (count <= 9) return "3x3";
  return "3";
}

function normalizeLegacyOptionCards(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-card]").forEach((card) => {
    if (card.querySelector("[data-options]")) return;
    if (card.querySelector("form, input, select, textarea, label, [data-upload], [data-capture], video, audio")) return;

    const options = Array.from(
      card.querySelectorAll<HTMLElement>('button[data-action="answer"]'),
    );
    if (options.length < 2 || options.length > 9) return;

    const grid = document.createElement("div");
    grid.setAttribute("data-options", "1");
    grid.setAttribute("data-cols", inferCols(options.length));
    grid.setAttribute("data-legacy-options", "1");
    options.forEach((option) => grid.appendChild(option));
    card.replaceWith(grid);
  });
}


function enhanceOption(btn: HTMLElement): void {
  if (btn.getAttribute("data-enhanced") === "1") return;
  btn.classList.add("gen-option");
  btn.setAttribute("type", "button");

  // Extract title / subtitle. Prefer explicit hooks; fall back to first two
  // spans, or the whole text content.
  const titleEl = btn.querySelector<HTMLElement>("[data-title]");
  const subtitleEl = btn.querySelector<HTMLElement>("[data-subtitle]");
  const bodyEl = btn.querySelector<HTMLElement>("[data-body]");
  const visualEl = btn.querySelector<HTMLElement>("[data-visual]");
  const imgEl = btn.querySelector<HTMLImageElement>("img");

  let titleHtml = titleEl?.innerHTML;
  let subtitleHtml = subtitleEl?.innerHTML ?? "";
  if (!titleHtml) {
    const spans = Array.from(btn.querySelectorAll("span")).filter(
      (s) => !s.hasAttribute("data-visual") && !s.hasAttribute("data-body"),
    );
    titleHtml = spans[0]?.innerHTML ?? btn.textContent?.trim() ?? "";
    subtitleHtml = spans[1]?.innerHTML ?? "";
  }

  // Pitch card — an option with prose (`data-body`): concept pitches,
  // loglines, treatments. Storyboard-slide anatomy (eyebrow / display title /
  // bottom-aligned mono text) on a theme-tinted card so exclusive creative
  // alternatives compare side-by-side. Tint is applied per-grid (shared
  // swatch) in enhanceOptionGrids.
  if (bodyEl) {
    const bodyHtml = bodyEl.innerHTML;
    btn.classList.add("gen-option-pitch");

    // Per-option palette (agent-chosen, mood-matched) — overrides the grid's
    // shared swatch so each concept reads distinctly. Re-validate the hex
    // values post-sanitization before writing them to inline styles.
    const palBg = btn.getAttribute("data-palette-bg");
    const palFg = btn.getAttribute("data-palette-fg");
    const palAccent = btn.getAttribute("data-palette-accent");
    if (palBg && HEX_RE.test(palBg)) btn.style.background = palBg;
    if (palFg && HEX_RE.test(palFg)) btn.style.color = palFg;

    // Per-option title typeface (agent-chosen Google Font, loaded live).
    const fontAttr = btn.getAttribute("data-title-font");
    const family = fontAttr ? loadGoogleFont(fontAttr) : null;
    const titleStyle = family
      ? ` style="font-family: '${family}', 'Telka Extended', system-ui, sans-serif"`
      : "";
    const eyebrowStyle =
      palAccent && HEX_RE.test(palAccent) ? ` style="color: ${palAccent}; opacity: 1"` : "";

    btn.innerHTML = `
      <div class="gen-option-pitch-head">
        ${subtitleHtml ? `<span class="gen-option-pitch-eyebrow"${eyebrowStyle}>${subtitleHtml}</span>` : ""}
        <div class="gen-option-pitch-title"${titleStyle}>${titleHtml}</div>
      </div>
      <p class="gen-option-pitch-text">${bodyHtml}</p>
    `;
    btn.setAttribute("data-enhanced", "1");
    return;
  }

  // Build the visual slot.
  let visualHtml = "";
  if (visualEl) {
    const kind = visualEl.getAttribute("data-visual") ?? "";
    if (isRatioVisual(kind)) {
      visualHtml = ratioBox(kind);
    } else if (kind === "icon") {
      const iconName = visualEl.getAttribute("data-icon") ?? "sparkles";
      const bg = visualEl.getAttribute("data-icon-bg");
      visualHtml = iconBadge(iconName, bg);
    } else if (kind === "image") {
      const src = visualEl.getAttribute("data-src") ?? imgEl?.src ?? "";
      if (src) visualHtml = `<img src="${src}" alt="" />`;
    }
  } else if (imgEl?.src) {
    visualHtml = `<img src="${imgEl.src}" alt="${imgEl.alt ?? ""}" />`;
  } else {
    // Fallback: a subtle icon so the card never looks empty.
    visualHtml = iconBadge("sparkles");
  }

  btn.innerHTML = `
    <div class="gen-option-visual">${visualHtml}</div>
    <div class="gen-option-body">
      <div class="gen-option-title">${titleHtml}</div>
      ${subtitleHtml ? `<div class="gen-option-subtitle">${subtitleHtml}</div>` : ""}
    </div>
  `;
  btn.setAttribute("data-enhanced", "1");

  // "Custom" tile — clicking swaps in an inline text input. Enter (or the
  // submit affordance) rewrites data-value and re-dispatches the click so
  // the root delegate handles it as a normal answer.
  if (btn.hasAttribute("data-custom")) {
    btn.classList.add("gen-option-custom");
    btn.addEventListener("click", (e) => {
      // Programmatic re-dispatch after Enter — let it bubble to root.
      if (btn.getAttribute("data-dispatching") === "1") return;
      if (btn.getAttribute("data-expanded") === "1") {
        // If the click landed on the input/submit, don't collapse; the
        // submit/keydown handlers below take care of dispatch.
        const t = e.target as HTMLElement | null;
        if (t && t.closest("input, [data-custom-submit]")) return;
        e.stopPropagation();
        e.preventDefault();
        const input = btn.querySelector<HTMLInputElement>("input");
        input?.focus();
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      btn.setAttribute("data-expanded", "1");
      btn.classList.add("gen-option-custom-open");
      btn.innerHTML = `
        <div class="gen-option-visual">
          <div class="gen-option-custom-hint">
            <span class="gen-option-custom-key">Enter <span aria-hidden="true">↵</span></span>
            <span class="gen-option-custom-hint-label">to Confirm</span>
          </div>
        </div>
        <div class="gen-option-body">
          <div class="gen-option-title">
            <textarea
              class="gen-option-custom-input"
              rows="1"
              placeholder="Type your answer…"
              autocomplete="off"
              spellcheck="false"
            ></textarea>
          </div>
        </div>
      `;
      const input = btn.querySelector<HTMLTextAreaElement>("textarea")!;
      const dispatch = () => {
        const v = input.value.trim();
        if (!v) {
          input.focus();
          return;
        }
        btn.setAttribute("data-value", v);
        btn.setAttribute("data-dispatching", "1");
        // Bubble a fresh click to the root delegate for normal dispatch.
        btn.click();
      };
      const autoGrow = () => {
        input.style.height = "auto";
        input.style.height = `${input.scrollHeight}px`;
      };
      input.addEventListener("input", autoGrow);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          if (ev.shiftKey) return; // allow newline with Shift+Enter
          ev.preventDefault();
          dispatch();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          input.blur();
        }
      });
      requestAnimationFrame(() => {
        input.focus();
        autoGrow();
      });
    });
  }
}

/**
 * Walk the card DOM and upgrade every `[data-options]` grid into a styled
 * option-picker with per-card animated glow + an "Agent Decides" pill. Cards
 * fan out deterministically by position (see applyFan); `seedKey` is retained
 * for call-site compatibility but no longer affects layout.
 */
/**
 * Pitch-card aspect ratio: the project ratio eased HALFWAY toward square.
 * Keep the shorter side; move the longer side to the midpoint of the two.
 * So 16:9 → 25:18, 3:4 → 6:7, 1:1 → 1:1. The card hints at the project's
 * orientation without being as extreme (a full 16:9 pitch card is too short
 * to read comfortably). Returns a CSS `aspect-ratio` value, or null if the
 * project ratio is unparseable.
 */
function pitchCardAspect(ratio?: string): string | null {
  if (!ratio) return null;
  const m = ratio.trim().match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return null;
  if (w > h) return `${w + h} / ${2 * h}`; // landscape → e.g. 16:9 → 25:18
  if (h > w) return `${2 * w} / ${w + h}`; // portrait  → e.g. 3:4  → 6:7
  return `1 / 1`;
}

export function enhanceOptionGrids(
  root: HTMLElement,
  seedKey?: string,
  aspectRatio?: string,
): void {
  normalizeLegacyOptionCards(root);
  const grids = root.querySelectorAll<HTMLElement>("[data-options]");
  grids.forEach((grid, gridIndex) => {
    grid.classList.add("gen-options");
    const childCount = grid.querySelectorAll(
      ':scope > button, :scope > [data-action="answer"]',
    ).length;
    // Default cols by child count if unset.
    if (!grid.getAttribute("data-cols")) {
      if (childCount === 2) grid.setAttribute("data-cols", "2");
      else if (childCount === 4) grid.setAttribute("data-cols", "4");
      else if (childCount <= 3) grid.setAttribute("data-cols", "3");
      else grid.setAttribute("data-cols", "3");
    }
    // Force 4 options into a single row to avoid vertical scroll on the stage.
    if (childCount === 4) {
      grid.setAttribute("data-cols", "4");
    }

    // LAYOUT (code-enforced, count-driven). The option area always spans the
    // full viewport width (.gen-options--breakout). Card WIDTH scales by how
    // many there are, and the grid never exceeds two rows — it grows sideways,
    // not down, so it stays within the viewport height:
    //   ≤2 cards → 25vw each, one centered row
    //   3–5      → 20vw each, one centered row
    //   >5       → fill the width evenly, columns = ceil(count/2) (two rows)
    // vw widths are capped maxes (minmax(0, …)) so gaps/padding can never
    // push a full row into horizontal overflow.
    const n = childCount;
    let colCount: number;
    let rows: number;
    if (n <= 2) {
      colCount = n;
      rows = 1;
      grid.style.gridTemplateColumns = `repeat(${n}, minmax(0, 25vw))`;
    } else if (n <= 5) {
      colCount = n;
      rows = 1;
      grid.style.gridTemplateColumns = `repeat(${n}, minmax(0, 20vw))`;
    } else {
      colCount = Math.min(6, Math.ceil(n / 2));
      rows = Math.ceil(n / colCount);
      grid.style.gridTemplateColumns = `repeat(${colCount}, minmax(0, 1fr))`;
    }
    grid.setAttribute("data-cols", String(colCount));
    grid.style.setProperty("--gen-rows", String(rows));
    grid.classList.add("gen-options--breakout");

    const options = grid.querySelectorAll<HTMLElement>(
      ':scope > button[data-action="answer"], :scope > [data-action="answer"]',
    );
    options.forEach((opt) => enhanceOption(opt));

    // Pitch cards share ONE theme swatch (like storyboard slides) so the
    // set reads as variations of the same project, not unrelated tiles.
    const pitches = grid.querySelectorAll<HTMLElement>(":scope > .gen-option-pitch");
    if (pitches.length) {
      const tint = pickSwatchFromText(
        Array.from(pitches)
          .map((p) => p.textContent ?? "")
          .join(" "),
      );
      grid.style.setProperty("--pitch-bg", tint.bg);
      grid.style.setProperty("--pitch-fg", tint.fg);
      // Pitch cards take the project's aspect ratio EASED halfway to square
      // (see pitchCardAspect) instead of the default fixed card height, so the
      // set hints at the finished piece's orientation while staying readable.
      // Row height goes auto so aspect-ratio (width-derived) drives it.
      const ar = pitchCardAspect(aspectRatio);
      if (ar) {
        grid.style.gridAutoRows = "auto";
        grid.style.setProperty("--pitch-ar", ar);
        grid.setAttribute("data-pitch-ar", "1");
      }
    }

    // Fan the cards out like a hand — deterministic per row, only when there's
    // an actual choice to make. A lone option stays aligned per the layout
    // rules. For a wrapped grid each row fans independently (col/rowCount are
    // computed relative to the row the card falls in).
    options.forEach((opt, i) => {
      if (options.length >= 2) {
        const rowStart = Math.floor(i / colCount) * colCount;
        const rowCount = Math.min(colCount, options.length - rowStart);
        applyFan(opt, i - rowStart, rowCount, i);
      } else {
        clearFan(opt);
      }
    });

    // Flag single-row grids so CSS can render taller cards.
    if (options.length > 0 && options.length <= colCount) {
      grid.setAttribute("data-single-row", "1");
    }

    // Append the "Agent Decides" fallback pill after the grid, unless the
    // model already emitted its own or the grid is followed by one.
    const already = grid.parentElement?.querySelector(
      ':scope > .gen-agent-decides, :scope > [data-agent-decides], :scope > .gen-actions [data-agent-decides]',
    );
    if (!already) {
      const wrap = document.createElement("div");
      wrap.className = "gen-actions";
      wrap.setAttribute("data-agent-decides", "1");
      wrap.innerHTML = `
        <button type="button" class="gen-cta gen-cta-agent" data-action="answer" data-value="Agent decides">
          ${AGENT_MARK_SVG}
          <span>Agent Decides</span>
        </button>
      `;
      grid.after(wrap);
    }
  });

  enhanceInputFields(root);
  enhanceActionRows(root);
  enhanceStoryboards(root);
}

// Editable slide fields — clicking any of these puts the caret in place for
// direct inline editing (see .gen-shot-editable in styles.css for the hover
// treatment). Edits are local to the card's DOM.
const SHOT_EDIT_SEL = ".gen-shot-eyebrow, .gen-shot-title, .gen-shot-text, .gen-shot-vo";

const DEFAULT_SHOT_SECS = 4;

/** Read the shot length (seconds) from its eyebrow, e.g. "Shot 5 · 4s" → 4. */
function shotSeconds(shot: HTMLElement): number {
  const eyebrow = shot.querySelector(".gen-shot-eyebrow")?.textContent ?? "";
  const m = eyebrow.match(/(\d+(?:\.\d+)?)\s*s\b/i);
  const secs = m ? parseFloat(m[1]) : 0;
  return secs > 0 ? secs : DEFAULT_SHOT_SECS;
}

/**
 * Wire the storyboard slides: theme-swatch tinting, one-active-slide
 * navigation (click zones, progress segments, arrow keys), inline editing of
 * every field, duration-matched autoplay, and progress segments sized to each
 * shot's share of the total runtime. The serializer emits static markup only —
 * everything stateful happens here so the same HTML re-enhances cleanly after
 * streaming/HMR re-renders.
 */
export function enhanceStoryboards(root: HTMLElement): void {
  const boards = root.querySelectorAll<HTMLElement>("[data-storyboard] .gen-storyboard");
  boards.forEach((board) => {
    if (board.getAttribute("data-enhanced") === "1") return;
    board.setAttribute("data-enhanced", "1");

    const shots = Array.from(board.querySelectorAll<HTMLElement>(".gen-shot"));
    const segs = Array.from(board.querySelectorAll<HTMLElement>("[data-shot-seg]"));
    if (!shots.length) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Theme tint — the shot text itself is the theme signal. One shared
    // palette across all slides so the storyboard reads as a single piece.
    const tint = pickSwatchFromText((board.textContent ?? "").toLowerCase());
    board.style.setProperty("--sb-bg", tint.bg);
    board.style.setProperty("--sb-fg", tint.fg);

    // Make every field directly editable in place.
    for (const shot of shots) {
      shot.querySelectorAll<HTMLElement>(SHOT_EDIT_SEL).forEach((el) => {
        el.classList.add("gen-shot-editable");
        el.contentEditable = "true";
        el.spellcheck = false;
      });
    }

    // Ensure each segment has a fill bar (self-sufficient even if the
    // serialized markup predates it).
    const fillOf = (i: number): HTMLElement | null => {
      const seg = segs[i];
      if (!seg) return null;
      let fill = seg.querySelector<HTMLElement>(".gen-seg-fill");
      if (!fill) {
        fill = document.createElement("span");
        fill.className = "gen-seg-fill";
        seg.appendChild(fill);
      }
      return fill;
    };

    // Progress segments sized to each shot's share of the total runtime.
    const sizeSegments = () => {
      segs.forEach((s, i) => {
        s.style.flexGrow = String(shotSeconds(shots[i] ?? shots[shots.length - 1]));
      });
    };
    sizeSegments();

    let idx = 0;
    let hovering = false;
    let editing = false;
    let askOpen = false;
    let anim: Animation | null = null;

    const cancelAnim = () => {
      if (anim) { anim.cancel(); anim = null; }
    };

    // Paint segment fills for the current index: past = full, current/future
    // start empty (the current one animates during playFill). Under reduced
    // motion the current segment reads as full (no animation).
    const paintSegments = () => {
      cancelAnim();
      segs.forEach((_, i) => {
        const fill = fillOf(i);
        if (!fill) return;
        fill.style.transform =
          i < idx || (i === idx && reduceMotion) ? "scaleX(1)" : "scaleX(0)";
      });
    };

    // Animate the current segment's fill 0→1 over the shot's duration; advance
    // when it finishes. Skipped while paused (hover/edit) or reduced-motion.
    const playFill = () => {
      if (reduceMotion || shots.length < 2 || hovering || editing || askOpen) return;
      const fill = fillOf(idx);
      if (!fill) return;
      cancelAnim();
      anim = fill.animate(
        [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
        { duration: shotSeconds(shots[idx]) * 1000, easing: "linear", fill: "forwards" },
      );
      anim.onfinish = () => {
        if (board.isConnected) show((idx + 1) % shots.length);
      };
    };

    const show = (next: number) => {
      idx = Math.max(0, Math.min(shots.length - 1, next));
      shots.forEach((s, i) => {
        if (i === idx) s.setAttribute("data-active", "1");
        else s.removeAttribute("data-active");
      });
      paintSegments();
      playFill();
    };

    // Resume after a pause: continue the frozen fill, or start a fresh one.
    const resume = () => {
      if (reduceMotion || hovering || editing || askOpen || shots.length < 2) return;
      if (anim && anim.playState === "paused") anim.play();
      else playFill();
    };

    // Ask-popover coupling — generative-card dispatches these while an
    // inline ask popup targets a piece of this board, so the slide can't
    // change under the user mid-instruction.
    board.addEventListener("sb:pause", () => { askOpen = true; anim?.pause(); });
    board.addEventListener("sb:resume", () => { askOpen = false; resume(); });

    show(0);

    // Stories-style click zones: left third = back, rest = forward. Clicks on
    // an editable field or a progress segment don't navigate.
    board.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".gen-shot-editable")) return;
      const seg = target.closest<HTMLElement>("[data-shot-seg]");
      if (seg) {
        e.stopPropagation();
        show(Number(seg.getAttribute("data-shot-seg")) || 0);
        return;
      }
      const rect = board.getBoundingClientRect();
      const back = e.clientX - rect.left < rect.width / 3;
      show(back ? idx - 1 : idx === shots.length - 1 ? 0 : idx + 1);
    });

    board.addEventListener("mouseenter", () => { hovering = true; anim?.pause(); });
    board.addEventListener("mouseleave", () => { hovering = false; resume(); });

    // Pause autoplay while editing; on commit, re-measure (a changed duration
    // resizes its segment) and resume.
    board.addEventListener("focusin", (e) => {
      if ((e.target as HTMLElement).closest(".gen-shot-editable")) {
        editing = true;
        anim?.pause();
      }
    });
    board.addEventListener("focusout", (e) => {
      if ((e.target as HTMLElement).closest(".gen-shot-editable")) {
        editing = false;
        sizeSegments();
        resume();
      }
    });

    // Arrow-key navigation while hovering (and not editing — arrows move the
    // caret then).
    const onKey = (e: KeyboardEvent) => {
      if (!board.isConnected) { window.removeEventListener("keydown", onKey); cancelAnim(); return; }
      if (!hovering || editing) return;
      if (e.key === "ArrowLeft") show(idx - 1);
      if (e.key === "ArrowRight") show(idx + 1);
    };
    window.addEventListener("keydown", onKey);
  });
}

/**
 * Wrap every text-ish input / textarea into the "field card" treatment.
 *
 * The model is inconsistent about the wrapper (sometimes emits
 * `<div data-input-field>` with a `<label>`, sometimes a bare
 * `<div class="text-sm">Title</div><textarea/>`, sometimes just a
 * `<textarea/>`). We force the card treatment regardless: every text /
 * url / email / number / search input and every textarea inside the card
 * gets wrapped in `.gen-field`, with the immediately preceding sibling
 * (if it looks like a title/label) folded in as `.gen-field-label`.
 */
export function enhanceInputFields(root: HTMLElement): void {
  const TEXT_INPUT_SELECTOR =
    'input[type="text"], input[type="url"], input[type="email"], input[type="number"], input[type="search"], input:not([type]), textarea';

  const inputs = Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(TEXT_INPUT_SELECTOR),
  );

  inputs.forEach((el) => {
    if (el.getAttribute("data-enhanced-field") === "1") return;
    // Upload cards (BLK_UPLOAD) are hand-designed: the Paste-URL card is a
    // flat tile — icon top, 32px title + placeholder bottom (Figma node
    // 27116-65772) — NOT a form field. No inner group box, no attach/AI
    // Rewrite tools.
    if (el.closest(".gen-upload-card")) return;
    el.setAttribute("data-enhanced-field", "1");

    // Find (or create) the wrapping card.
    let card: HTMLElement | null = null;
    const parent = el.parentElement;

    const LABEL_TAGS = new Set([
      "LABEL", "DIV", "SPAN", "P", "H1", "H2", "H3", "H4", "H5", "H6",
    ]);
    const hasInteractive = (n: Element) =>
      !!n.querySelector("input, textarea, button, select, form");
    const isLabelish = (n: Element | null): n is HTMLElement =>
      !!n &&
      n instanceof HTMLElement &&
      LABEL_TAGS.has(n.tagName) &&
      !hasInteractive(n);

    if (parent && parent.hasAttribute("data-input-field")) {
      card = parent;
    } else if (parent && parent.classList.contains("gen-field")) {
      card = parent;
    } else if (
      parent &&
      // <label> / <div> / etc. that wraps exactly this one input as its only
      // interactive child — promote the wrapper itself into the card so any
      // title span/text inside sits inside the white area.
      parent.querySelectorAll("input, textarea, select").length === 1 &&
      (parent.tagName === "LABEL" || LABEL_TAGS.has(parent.tagName))
    ) {
      card = parent;
      parent.setAttribute("data-input-field", "1");
    } else {
      // Wrap the input plus its preceding label-ish sibling in a new card.
      card = document.createElement("div");
      card.setAttribute("data-input-field", "1");
      const prev = el.previousElementSibling;
      if (parent) parent.insertBefore(card, el);
      if (isLabelish(prev)) card.appendChild(prev);
      card.appendChild(el);
    }

    card.classList.add("gen-field");

    // Style every non-input child as the field label.
    Array.from(card.children).forEach((child) => {
      if (child === el) return;
      if (child instanceof HTMLElement && !hasInteractive(child) && child !== el) {
        child.classList.add("gen-field-label");
        child.classList.remove(
          "text-sm",
          "text-xs",
          "text-base",
          "text-muted-foreground",
          "mb-2",
          "mb-1",
          "mb-3",
        );
      }
    });

    // Group the label + input together with their own inset (16px), leaving
    // the toolbar (appended below, after this group) at the card's single
    // 16px inset — matches the Figma field layout (card padding + nested
    // label/input padding, tools row un-nested).
    if (!card.querySelector(":scope > .gen-field-group")) {
      const group = document.createElement("div");
      group.className = "gen-field-group";
      card.insertBefore(group, card.firstChild);
      Array.from(card.children).forEach((child) => {
        if (child === group) return;
        group.appendChild(child);
      });
    }


    // Style the input itself.
    el.classList.add("gen-field-input");
    // Strip Tailwind-ish styling the model may have added.
    el.classList.remove(
      "border",
      "border-border",
      "border-hairline",
      "rounded",
      "rounded-md",
      "rounded-lg",
      "rounded-xl",
      "rounded-2xl",
      "bg-background",
      "bg-card",
      "bg-muted",
      "px-2",
      "px-3",
      "px-4",
      "py-2",
      "py-3",
      "p-2",
      "p-3",
      "p-4",
    );
    el.style.background = "transparent";
    el.style.border = "0";
    el.style.padding = "0";
    el.style.outline = "none";
    if (el.tagName === "TEXTAREA") {
      (el as HTMLTextAreaElement).style.resize = "none";
      if (!el.getAttribute("rows")) el.setAttribute("rows", "3");
    }

    // Append the field toolbar ([+] attach + AI Rewrite) once per field —
    // TEXTAREA only. Long-form fields (character traits, scene descriptions)
    // benefit from attach/rewrite; short single-line fields (name, url) don't
    // need them, and omitting the row lets the card shrink to fit the input.
    // The buttons carry data hooks — generative-card wires the actual
    // behavior (library picker for attach, inline-agent popover for
    // rewrite). A hidden multi-file input rides with the field so the
    // form-submit collector picks up any attachments alongside the text.
    if (el.tagName === "TEXTAREA" && !card.querySelector('[data-field-tools="1"]')) {
      const name = (el.getAttribute("name") || "").trim();

      const hiddenFile = document.createElement("input");
      hiddenFile.type = "file";
      hiddenFile.multiple = true;
      hiddenFile.setAttribute("data-field-file", "1");
      hiddenFile.style.display = "none";
      if (name) hiddenFile.name = `${name}_attachments`;
      card.appendChild(hiddenFile);

      const tools = document.createElement("div");
      tools.setAttribute("data-field-tools", "1");
      tools.className = "gen-field-tools";

      const attach = document.createElement("button");
      attach.type = "button";
      attach.setAttribute("data-field-attach", "1");
      attach.setAttribute("aria-label", "Attach files");
      attach.className = "gen-field-tool gen-field-tool-attach";
      attach.innerHTML =
        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>';
      tools.appendChild(attach);

      const rewrite = document.createElement("button");
      rewrite.type = "button";
      rewrite.setAttribute("data-field-rewrite", "1");
      rewrite.className = "gen-field-tool gen-field-tool-rewrite";
      rewrite.innerHTML = `${AGENT_MARK_SVG}<span>AI Rewrite</span>`;
      tools.appendChild(rewrite);

      card.appendChild(tools);
    }
  });
}


/**
 * Style inline action rows (form submit rows, stage-gen action rows, and the
 * Agent-Decides pill row) with the shared `.gen-actions` + `.gen-cta` look.
 * Runs after option grids so the appended Agent-Decides wrapper is picked up
 * and merged with any adjacent `<div data-gen-actions>` from the model.
 */
export function enhanceActionRows(root: HTMLElement): void {
  // 1. Style bare form-submit rows (form > :last-child with buttons).
  const formRows = root.querySelectorAll<HTMLElement>(
    'form > div:last-child:has(button[type="submit"]), form > div:last-child:has(button[data-action="answer"])',
  );
  formRows.forEach((row) => styleActionRow(row));

  // 2. Style explicit stage-gen action rows.
  root
    .querySelectorAll<HTMLElement>("[data-gen-actions]")
    .forEach((row) => styleActionRow(row));

  // 3. Merge adjacent Agent-Decides wrapper into a preceding action row.
  root.querySelectorAll<HTMLElement>("[data-agent-decides]").forEach((agent) => {
    const prev = agent.previousElementSibling as HTMLElement | null;
    if (
      prev &&
      (prev.classList.contains("gen-actions") ||
        prev.matches('[data-gen-actions]') ||
        prev.matches('form > div:last-child'))
    ) {
      // Move children of agent wrapper into the previous row, with divider.
      if (prev.querySelector(":scope > button, :scope > [data-action]")) {
        const divider = document.createElement("span");
        divider.className = "gen-actions-divider";
        prev.appendChild(divider);
      }
      Array.from(agent.children).forEach((c) => prev.appendChild(c));
      agent.remove();
      styleActionRow(prev);
    }
  });

  // 4. Fallback: promote any un-tagged div whose direct children are only
  //    action-like buttons into a styled `.gen-actions` row. This catches
  //    LLM output that emits inline Tailwind-styled buttons (e.g.
  //    `bg-brand-gradient` / `rounded-full`) without wrapping them in
  //    `<div data-gen-actions>`. Ensures every button row uses the same
  //    Button-56 treatment.
  root
    .querySelectorAll<HTMLElement>(
      "div:not([data-options]):not(.gen-actions):not([data-gen-actions]):not([data-field-tools])",
    )
    .forEach((div) => {
      // The field toolbar ([+] attach + AI Rewrite) owns its own styling —
      // never CTA-ize it into a pill row.
      if (div.hasAttribute("data-field-tools") || div.closest("[data-field-tools]")) return;
      if (
        div.closest(
          "[data-options], .gen-options, .gen-option, .gen-actions, [data-gen-actions]",
        ) !== div &&
        div.closest(
          "[data-options], .gen-options, .gen-option, .gen-actions, [data-gen-actions]",
        )
      ) {
        return;
      }
      const children = Array.from(div.children).filter(
        (c) => c instanceof HTMLElement,
      ) as HTMLElement[];
      if (children.length === 0 || children.length > 4) return;
      const allButtons = children.every(
        (c) => c.tagName === "BUTTON" || c.getAttribute("role") === "button",
      );
      if (!allButtons) return;
      const anyActionable = children.some(
        (c) =>
          c.getAttribute("data-action") === "answer" ||
          c.hasAttribute("data-primary") ||
          c.getAttribute("type") === "submit" ||
          (c.textContent ?? "").trim().length > 0,
      );
      if (!anyActionable) return;
      styleActionRow(div);
    });
}

const AGENT_LABEL_RE = /\b(agent\s+decides|you\s+decide|you\s+pick|let\s+agent|agent\s+picks|surprise\s+me)\b/i;

// Tailwind / inline utility classes that break the Button-56 (.gen-cta)
// treatment when the LLM emits inline-styled buttons. We strip them so the
// row layout and pill styling stay consistent across every action row.
const CTA_STRIP_PREFIXES = [
  "bg-", "text-", "border", "rounded", "shadow",
  "p-", "px-", "py-", "pt-", "pb-", "pl-", "pr-",
  "h-", "min-h-", "max-h-", "w-", "min-w-", "max-w-",
  "font-", "leading-", "tracking-", "ring-", "hover:",
  "gap-", "flex", "inline-", "items-", "justify-",
];
const CTA_STRIP_EXACT = new Set([
  "bg-brand-gradient", "shadow-glow", "shadow-elegant",
]);
function stripCtaConflictClasses(btn: HTMLElement): void {
  const keep: string[] = [];
  btn.classList.forEach((c) => {
    if (c.startsWith("gen-cta") || c.startsWith("gen-agent")) {
      keep.push(c);
      return;
    }
    if (CTA_STRIP_EXACT.has(c)) return;
    if (CTA_STRIP_PREFIXES.some((p) => c === p || c.startsWith(p))) return;
    keep.push(c);
  });
  btn.className = keep.join(" ");
  // Inline styles from the LLM can also override .gen-cta background/height.
  const style = btn.getAttribute("style") ?? "";
  if (style) {
    const cleaned = style
      .split(";")
      .map((d) => d.trim())
      .filter((d) => {
        const p = d.split(":")[0]?.trim().toLowerCase();
        return (
          !!p &&
          ![
            "background", "background-color", "background-image",
            "color", "border", "border-radius", "box-shadow",
            "padding", "height", "width", "min-height", "min-width",
            "font-family", "font-size", "font-weight",
          ].some((bad) => p === bad || p.startsWith(`${bad}-`))
        );
      })
      .join("; ");
    if (cleaned) btn.setAttribute("style", cleaned);
    else btn.removeAttribute("style");
  }
}

function styleActionRow(row: HTMLElement): void {
  row.classList.add("gen-actions");
  // Drop legacy positioning classes so the row lays out as a plain flex row.
  row.classList.remove("justify-end", "justify-center");
  // Also drop Tailwind layout classes that the LLM may attach to the wrapper
  // (mt-*, flex-*, gap-*, wrap, etc.) so `.gen-actions` styling is authoritative.
  Array.from(row.classList).forEach((c) => {
    if (c === "gen-actions") return;
    if (
      c.startsWith("mt-") || c.startsWith("mb-") || c.startsWith("mx-") || c.startsWith("my-") ||
      c.startsWith("gap-") || c === "flex" || c.startsWith("flex-") ||
      c.startsWith("items-") || c.startsWith("justify-") ||
      c === "flex-wrap" || c === "flex-nowrap"
    ) {
      row.classList.remove(c);
    }
  });

  const buttons = Array.from(
    row.querySelectorAll<HTMLElement>(
      ':scope > button, :scope > [role="button"]',
    ),
  );
  buttons.forEach((btn) => {
    if (btn.classList.contains("gen-cta")) return;
    // Detect intent BEFORE stripping classes/attributes.
    const label = (btn.textContent ?? "").trim();
    const value = btn.getAttribute("data-value") ?? "";
    const isAgent =
      btn.hasAttribute("data-agent-decides") ||
      btn.classList.contains("gen-cta-agent") ||
      btn.classList.contains("gen-agent-decides-pill") ||
      AGENT_LABEL_RE.test(value) ||
      AGENT_LABEL_RE.test(label);
    // Treat gradient/brand-styled or explicitly submit/data-primary buttons
    // as the primary CTA in the row so the Button-56 treatment matches intent.
    const isPrimary =
      btn.hasAttribute("data-primary") ||
      btn.getAttribute("type") === "submit" ||
      btn.classList.contains("bg-brand-gradient") ||
      btn.classList.contains("shadow-glow");

    stripCtaConflictClasses(btn);
    btn.classList.add("gen-cta");
    if (isAgent) {
      btn.classList.add("gen-cta-agent");
      btn.setAttribute("data-agent-decides", "1");
      // Normalize label to "Agent Decides" and (re)build with agent symbol.
      btn.innerHTML = `${AGENT_MARK_SVG}<span>Agent Decides</span>`;
    } else if (isPrimary) btn.classList.add("gen-cta-primary");
    else btn.classList.add("gen-cta-secondary");
  });


  // Insert a 16px vertical divider before the first agent-decides button when
  // it has any sibling CTA to its left.
  const rowButtons = Array.from(row.children).filter(
    (c) => c instanceof HTMLElement && (c.tagName === "BUTTON" || c.getAttribute("role") === "button"),
  ) as HTMLElement[];
  rowButtons.forEach((btn) => {
    if (!btn.classList.contains("gen-cta-agent")) return;
    const prev = btn.previousElementSibling;
    if (!prev) return;
    if (prev instanceof HTMLElement && prev.classList.contains("gen-actions-divider")) return;
    if (prev instanceof HTMLElement && (prev.tagName === "BUTTON" || prev.getAttribute("role") === "button")) {
      const divider = document.createElement("span");
      divider.className = "gen-actions-divider";
      row.insertBefore(divider, btn);
    }
  });
}

// ---------- Media-card action trio ----------
// The model declares `<button data-card-action="regenerate|edit|more">` on
// media cards; the runtime paints the icons and positions the trio top-right
// of the card. Clicks are wired by GenerativeCard's delegated handler.

const CARD_ACTION_META: Record<string, { icon: typeof RefreshCcw; label: string }> = {
  regenerate: { icon: RefreshCcw, label: "Regenerate" },
  edit: { icon: Wand2, label: "Edit with agent" },
  more: { icon: MoreHorizontal, label: "More" },
};

export function enhanceCardActions(root: HTMLElement): void {
  const buttons = Array.from(
    root.querySelectorAll<HTMLElement>("[data-card-action]"),
  );
  if (!buttons.length) return;

  const byCard = new Map<HTMLElement, HTMLElement[]>();
  for (const btn of buttons) {
    const card = btn.closest<HTMLElement>("[data-card]") ?? root;
    const list = byCard.get(card) ?? [];
    list.push(btn);
    byCard.set(card, list);
  }

  byCard.forEach((btns, card) => {
    if (card !== root && getComputedStyle(card).position === "static") {
      card.style.position = "relative";
    }
    let row = card.querySelector<HTMLElement>(":scope > .gen-card-actions");
    if (!row) {
      row = document.createElement("div");
      row.className = "gen-card-actions";
      card.appendChild(row);
    }
    for (const btn of btns) {
      if (btn.getAttribute("data-enhanced") === "1") continue;
      const originalParent = btn.parentElement;
      const meta =
        CARD_ACTION_META[(btn.getAttribute("data-card-action") ?? "").toLowerCase()] ??
        CARD_ACTION_META.more;
      btn.setAttribute("type", "button");
      btn.setAttribute("data-enhanced", "1");
      btn.setAttribute("aria-label", meta.label);
      btn.title = meta.label;
      btn.className = "gen-card-action";
      btn.innerHTML = renderToStaticMarkup(
        createElement(meta.icon, { size: 16, strokeWidth: 2 }),
      );
      row.appendChild(btn);
      // Drop the model's now-empty wrapper row, if any.
      if (
        originalParent &&
        originalParent !== row &&
        originalParent !== card &&
        originalParent.children.length === 0 &&
        !originalParent.textContent?.trim()
      ) {
        originalParent.remove();
      }
    }
  });
}

// ---------- Variant thumb strip ----------
// `<div data-variants>` on a media card becomes a bottom-left overlay of
// selectable thumbnails; clicking one swaps the card's main media (handled
// client-side in GenerativeCard, no agent round trip).

// Image gallery — the serializer emits count-driven markup (see .gen-gallery
// in styles.css). Each image keeps its NATIVE aspect ratio; the only stateful
// bit is measuring every image once it loads and writing its natural shape to
// the item as --item-aspect (drives the box) and --item-grow (flex-grow ∝
// aspect ratio, so a mixed-shape row settles on one shared height without any
// cropping). Runs per image, so slow-loading images upgrade independently.
// Wand-2 glyph (matches the media-card "edit" action icon) for the per-image
// hover pill.
const GALLERY_EDIT_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/>' +
  '<path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>';

export function enhanceGalleries(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".gen-gallery").forEach((gallery) => {
    if (gallery.getAttribute("data-enhanced") === "1") return;
    gallery.setAttribute("data-enhanced", "1");
    gallery
      .querySelectorAll<HTMLElement>(".gen-gallery-item")
      .forEach((item) => {
        const img = item.querySelector<HTMLImageElement>("img");
        if (!img) return;
        const apply = () => {
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          if (!w || !h) return;
          item.style.setProperty("--item-aspect", `${w} / ${h}`);
          item.style.setProperty("--item-grow", String(w / h));
        };
        if (img.complete) apply();
        else img.addEventListener("load", apply, { once: true });

        // Hover-reveal "Edit" pill — targets THIS image. Added here (after
        // enhanceCardActions has run) so the card-action trio never sweeps
        // it up; GenerativeCard's delegate handles the click via
        // [data-gallery-edit].
        if (!item.querySelector(":scope > .gen-gallery-edit")) {
          const edit = document.createElement("button");
          edit.type = "button";
          edit.className = "gen-gallery-edit";
          edit.setAttribute("data-gallery-edit", "1");
          edit.setAttribute("aria-label", "Edit with agent");
          edit.title = "Edit with agent";
          edit.innerHTML = `${GALLERY_EDIT_ICON}<span>Edit</span>`;
          item.appendChild(edit);
        }
      });
  });
}

// Moodboard collage — the serializer emits the masonry markup (CSS columns
// do the packing; images are native-aspect by construction). The stateful
// bit lives here because DOMPurify strips inline styles: paint palette
// swatches from data-swatch (stacked dominant-first), and type-specimen
// tiles from data-bg with a luminance-picked text color.
const MOOD_HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

function hexLuminance(hex: string): number {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function enhanceMoodboards(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".gen-moodboard").forEach((board) => {
    if (board.getAttribute("data-enhanced") === "1") return;
    board.setAttribute("data-enhanced", "1");
    board.querySelectorAll<HTMLElement>(".gen-mood-palette").forEach((pal) => {
      const swatches = pal.querySelectorAll<HTMLElement>(".gen-mood-swatch");
      swatches.forEach((sw, i) => {
        const c = sw.getAttribute("data-swatch") ?? "";
        if (MOOD_HEX_RE.test(c)) sw.style.backgroundColor = c;
        sw.style.zIndex = String(swatches.length - i);
      });
    });
    board.querySelectorAll<HTMLElement>(".gen-mood-type").forEach((tile) => {
      const bg = tile.getAttribute("data-bg") ?? "";
      if (!MOOD_HEX_RE.test(bg)) return;
      tile.style.backgroundColor = bg;
      tile.style.color = hexLuminance(bg) > 0.55 ? "#0d0d0d" : "#fcfaf7";
    });
  });
}

export function enhanceVariantStrips(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-variants]").forEach((strip) => {
    if (strip.getAttribute("data-enhanced") === "1") return;
    strip.setAttribute("data-enhanced", "1");
    strip.classList.add("gen-variants");
    const card = strip.closest<HTMLElement>("[data-card]");
    if (card && getComputedStyle(card).position === "static") {
      card.style.position = "relative";
    }
    Array.from(strip.children).forEach((child, i) => {
      if (!(child instanceof HTMLElement)) return;
      let btn: HTMLElement;
      if (child.tagName === "BUTTON") {
        btn = child;
      } else {
        btn = document.createElement("button");
        child.replaceWith(btn);
        btn.appendChild(child);
      }
      btn.setAttribute("type", "button");
      btn.classList.add("gen-variant");
      if (!btn.hasAttribute("data-variant")) {
        btn.setAttribute("data-variant", String(i));
      }
      const img = btn.querySelector("img");
      const src = btn.getAttribute("data-src") ?? img?.getAttribute("src");
      if (src && !btn.getAttribute("data-src")) btn.setAttribute("data-src", src);
      btn.setAttribute("aria-label", `Variant ${i + 1}`);
      if (i === 0 && !strip.querySelector('[data-active="true"]')) {
        btn.setAttribute("data-active", "true");
      }
    });
  });
}



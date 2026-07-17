// Deterministic count-driven layout for canvas blocks. Pure functions from
// (block, width) → rects + measured text heights, mirroring the CSS
// behavior of the DOM renderer (options: ≤4 one centered row, 5+ two rows;
// gallery: 1 centered / 2–3 across / 4–6 two rows; storyboard: one slide at
// a time, tallest slide wins). Text is measured with Pixi's CanvasTextMetrics
// so components never re-measure. No flexbox engine — the target blocks'
// layouts are enumerable arithmetic over a known width.

import { CanvasTextMetrics, TextStyle } from "pixi.js";
import type { OptionsBlockValue } from "@/agent/blocks/options/block";
import type { GalleryBlockValue } from "@/agent/blocks/gallery/block";
import type { StoryboardBlockValue } from "@/agent/blocks/storyboard/block";
import type { RenderTurn, TurnBlock, TurnActionButton } from "@/lib/agent/ui-schema";
import type { CanvasTheme } from "./theme";

export type Rect = { x: number; y: number; w: number; h: number };

const clamp = (min: number, v: number, max: number) => Math.max(min, Math.min(max, v));

// ---------- Seeded scatter (mirrors gen-option-enhancer's PRNG) ----------

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Text measurement ----------

function measure(
  text: string,
  opts: {
    fontFamily: string;
    fontSize: number;
    fontWeight?: string;
    fontStyle?: "normal" | "italic";
    wrapWidth: number;
    lineHeight?: number;
  },
): { width: number; height: number } {
  const style = new TextStyle({
    fontFamily: opts.fontFamily,
    fontSize: opts.fontSize,
    fontWeight: (opts.fontWeight ?? "400") as TextStyle["fontWeight"],
    fontStyle: opts.fontStyle ?? "normal",
    wordWrap: opts.wrapWidth > 0,
    wordWrapWidth: Math.max(10, opts.wrapWidth),
    breakWords: true,
    lineHeight: opts.lineHeight ?? Math.round(opts.fontSize * 1.25),
  });
  const m = CanvasTextMetrics.measureText(text, style);
  return { width: m.width, height: m.height };
}

// ---------- Options ----------

export type OptionCardLayout = {
  rect: Rect;
  pad: number;
  radius: number;
  titleSize: number;
  subtitleSize: number;
  /** Icon tile size / visual slot height. */
  visualSize: number;
  titleH: number;
  subtitleH: number;
  /** Seeded scatter — rotation (radians) and vertical offset. */
  rot: number;
  ty: number;
};

export type OptionsLayout = {
  kind: "options";
  block: OptionsBlockValue;
  height: number;
  cards: OptionCardLayout[];
  titleWrap: number;
};

export function layoutOptions(
  block: OptionsBlockValue,
  width: number,
  theme: CanvasTheme,
  seedKey: string,
): OptionsLayout {
  const n = block.items.length;
  const gap = 16;
  let rows = n <= 4 ? 1 : 2;
  let cols = Math.ceil(n / rows);
  // Never let cards get uncomfortably narrow.
  while ((width - gap * (cols - 1)) / cols < 168 && rows < 3) {
    rows += 1;
    cols = Math.ceil(n / rows);
  }
  const cardW = (width - gap * (cols - 1)) / cols;
  const cardH = clamp(210, cardW * 1.05, 340);
  const pad = clamp(16, cardW * 0.1, 30);
  const radius = Math.min(36, cardW * 0.16);
  const titleSize = clamp(15, cardW * 0.085, 26);
  const subtitleSize = clamp(12, cardW * 0.052, 14);
  const visualSize = clamp(40, cardW * 0.22, 56);
  const titleWrap = cardW - pad * 2;

  const rand = mulberry32(hashSeed(seedKey || "canvas-options"));
  const scatterPad = 10;

  const cards: OptionCardLayout[] = block.items.map((item, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, n - row * cols);
    // Center incomplete rows.
    const rowOffset = (width - (inRow * cardW + (inRow - 1) * gap)) / 2;
    const col = i - row * cols;
    const t = measure(item.title, {
      fontFamily: theme.fontBody,
      fontSize: titleSize,
      wrapWidth: titleWrap,
    });
    const s = item.subtitle
      ? measure(item.subtitle, {
          fontFamily: theme.fontBody,
          fontSize: subtitleSize,
          wrapWidth: titleWrap,
        })
      : { width: 0, height: 0 };
    return {
      rect: {
        x: rowOffset + col * (cardW + gap),
        y: scatterPad + row * (cardH + gap),
        w: cardW,
        h: cardH,
      },
      pad,
      radius,
      titleSize,
      subtitleSize,
      visualSize,
      titleH: t.height,
      subtitleH: s.height,
      rot: (rand() * 2 - 1) * 0.03, // ±~1.7deg — the "pick one" scatter
      ty: (rand() * 2 - 1) * 6,
    };
  });

  return {
    kind: "options",
    block,
    cards,
    titleWrap,
    height: scatterPad * 2 + rows * cardH + (rows - 1) * gap,
  };
}

// ---------- Actions row ----------

export type ActionButtonLayout = {
  action: TurnActionButton;
  rect: Rect;
  textW: number;
};

export type ActionsRowLayout = {
  height: number;
  buttons: ActionButtonLayout[];
  fontSize: number;
};

export function layoutActionsRow(
  actions: TurnActionButton[],
  width: number,
  theme: CanvasTheme,
  yOffset: number,
): ActionsRowLayout {
  const fontSize = 14;
  const btnH = 42;
  const gap = 10;
  const padX = 20;
  const sized = actions.map((action) => {
    const m = measure(action.label, {
      fontFamily: theme.fontBody,
      fontSize,
      fontWeight: "500",
      wrapWidth: 0,
    });
    return { action, w: Math.ceil(m.width) + padX * 2, textW: m.width };
  });
  // Single row, centered; shrink-wrap. (Agent caps at 4 actions.)
  const total = sized.reduce((acc, b) => acc + b.w, 0) + gap * (sized.length - 1);
  let x = Math.max(0, (width - total) / 2);
  const buttons: ActionButtonLayout[] = sized.map((b) => {
    const rect = { x, y: yOffset, w: b.w, h: btnH };
    x += b.w + gap;
    return { action: b.action, rect, textW: b.textW };
  });
  return { height: btnH, buttons, fontSize };
}

// ---------- Gallery ----------

export type GalleryTileLayout = {
  rect: Rect;
  url: string;
  label?: string;
  labelW: number;
};

export type GalleryLayout = {
  kind: "gallery";
  block: GalleryBlockValue;
  height: number;
  eyebrowH: number;
  tiles: GalleryTileLayout[];
  actions: ActionsRowLayout | null;
  radius: number;
};

export function layoutGallery(
  block: GalleryBlockValue,
  width: number,
  theme: CanvasTheme,
): GalleryLayout {
  const n = block.items.length;
  const gap = 14;
  const cols = n === 1 ? 1 : n <= 3 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / cols);
  const tileW = n === 1 ? Math.min(width, 620) : (width - gap * (cols - 1)) / cols;
  const tileH = tileW * 0.72;
  const radius = Math.min(24, tileW * 0.08);
  const eyebrowH = block.title ? 30 : 0;

  const tiles: GalleryTileLayout[] = block.items.map((item, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, n - row * cols);
    const rowOffset = (width - (inRow * tileW + (inRow - 1) * gap)) / 2;
    const col = i - row * cols;
    const labelW = item.label
      ? measure(item.label, {
          fontFamily: theme.fontBody,
          fontSize: 12,
          fontWeight: "500",
          wrapWidth: 0,
        }).width
      : 0;
    return {
      rect: {
        x: rowOffset + col * (tileW + gap),
        y: eyebrowH + row * (tileH + gap),
        w: tileW,
        h: tileH,
      },
      url: item.url,
      label: item.label,
      labelW,
    };
  });

  const gridBottom = eyebrowH + rows * tileH + (rows - 1) * gap;
  const actions = block.actions?.length
    ? layoutActionsRow(block.actions, width, theme, gridBottom + 18)
    : null;

  return {
    kind: "gallery",
    block,
    eyebrowH,
    tiles,
    actions,
    radius,
    height: actions ? gridBottom + 18 + actions.height : gridBottom,
  };
}

// ---------- Storyboard ----------

export type StoryboardSlideLayout = {
  metaH: number;
  titleH: number;
  textH: number;
  voH: number;
};

export type StoryboardLayout = {
  kind: "storyboard";
  block: StoryboardBlockValue;
  height: number;
  panel: Rect;
  pad: number;
  radius: number;
  titleSize: number;
  textSize: number;
  textWrap: number;
  slides: StoryboardSlideLayout[];
  /** Progress segment rects (bottom of the panel). */
  segments: Rect[];
  actions: ActionsRowLayout | null;
};

export function layoutStoryboard(
  block: StoryboardBlockValue,
  width: number,
  theme: CanvasTheme,
): StoryboardLayout {
  const pad = clamp(24, width * 0.05, 40);
  const titleSize = clamp(22, width * 0.045, 32);
  const textSize = 15;
  const textWrap = Math.min(600, width - pad * 2);

  const slides: StoryboardSlideLayout[] = block.items.map((item) => ({
    metaH: item.meta ? 18 : 0,
    titleH: measure(item.title, {
      fontFamily: theme.fontDisplay,
      fontSize: titleSize,
      wrapWidth: width - pad * 2,
    }).height,
    textH: item.text
      ? measure(item.text, {
          fontFamily: theme.fontBody,
          fontSize: textSize,
          wrapWidth: textWrap,
        }).height
      : 0,
    voH: item.vo
      ? measure(`“${item.vo}”`, {
          fontFamily: theme.fontBody,
          fontSize: 14,
          fontStyle: "italic",
          wrapWidth: textWrap,
        }).height
      : 0,
  }));

  const contentH = Math.max(
    ...slides.map(
      (s) =>
        (s.metaH ? s.metaH + 10 : 0) +
        s.titleH +
        (s.textH ? 14 + s.textH : 0) +
        (s.voH ? 12 + s.voH : 0),
    ),
    120,
  );
  const progressH = 28; // segment bar + spacing above it
  const panelH = pad + contentH + progressH + pad;
  const panel: Rect = { x: 0, y: 0, w: width, h: panelH };

  const segGap = 6;
  const segCount = block.items.length;
  const segW = (width - pad * 2 - segGap * (segCount - 1)) / segCount;
  const segments: Rect[] = block.items.map((_, i) => ({
    x: pad + i * (segW + segGap),
    y: panelH - pad - 4,
    w: segW,
    h: 4,
  }));

  const actions = block.actions?.length
    ? layoutActionsRow(block.actions, width, theme, panelH + 18)
    : null;

  return {
    kind: "storyboard",
    block,
    panel,
    pad,
    radius: 28,
    titleSize,
    textSize,
    textWrap,
    slides,
    segments,
    actions,
    height: actions ? panelH + 18 + actions.height : panelH,
  };
}

// ---------- Turn ----------

export type BlockLayout = OptionsLayout | GalleryLayout | StoryboardLayout;

export type TurnLayout = {
  totalHeight: number;
  entries: { layout: BlockLayout; y: number }[];
};

const BLOCK_GAP = 24;

export function layoutTurn(
  turn: RenderTurn,
  width: number,
  theme: CanvasTheme,
  seedKey: string,
): TurnLayout {
  const entries: TurnLayout["entries"] = [];
  let y = 0;
  for (const block of (turn.blocks ?? []) as TurnBlock[]) {
    let layout: BlockLayout | null = null;
    if (block.type === "options") {
      layout = layoutOptions(block, width, theme, seedKey);
    } else if (block.type === "gallery") {
      layout = layoutGallery(block, width, theme);
    } else if (block.type === "storyboard") {
      layout = layoutStoryboard(block, width, theme);
    }
    if (!layout) continue; // unsupported types never reach here (support.ts gate)
    entries.push({ layout, y });
    y += layout.height + BLOCK_GAP;
  }
  return { entries, totalHeight: Math.max(0, y - BLOCK_GAP) };
}

// ---------- Full stage (echo line + prose + status + blocks) ----------

export type WordPos = { text: string; x: number; y: number };

/** Manual word-wrap for the prose ramp: each word gets its own position so
 * the entrance can stagger per word (canvas WordsRamp equivalent). */
export function layoutWords(
  text: string,
  opts: {
    fontFamily: string;
    fontSize: number;
    fontWeight?: string;
    wrapWidth: number;
    lineHeight: number;
  },
): { words: WordPos[]; height: number } {
  const style = new TextStyle({
    fontFamily: opts.fontFamily,
    fontSize: opts.fontSize,
    fontWeight: (opts.fontWeight ?? "400") as TextStyle["fontWeight"],
  });
  const spaceW = CanvasTextMetrics.measureText(" ", style).width;
  const words = text.split(/\s+/).filter(Boolean);
  const out: WordPos[] = [];
  let x = 0;
  let y = 0;
  for (const word of words) {
    const w = CanvasTextMetrics.measureText(word, style).width;
    if (x > 0 && x + w > opts.wrapWidth) {
      x = 0;
      y += opts.lineHeight;
    }
    out.push({ text: word, x, y });
    x += w + spaceW;
  }
  return { words: out, height: words.length ? y + opts.lineHeight : 0 };
}

export type StageTurnLayout = {
  /** Top of the content stack (vertically centered in the stage). */
  contentY: number;
  totalHeight: number;
  /** Prose/echo/status column (mirrors the DOM grid's 8/16 column). */
  proseX: number;
  proseW: number;
  proseSize: number;
  proseLineHeight: number;
  echo: { y: number; height: number } | null;
  proseWords: WordPos[];
  proseY: number;
  status: { y: number };
  /** Blocks column (mirrors the DOM grid's 10/16 column). */
  blocksX: number;
  blocksY: number;
  blocks: TurnLayout;
};

export function layoutStageTurn(opts: {
  turn: RenderTurn;
  echoText: string;
  stageW: number;
  stageH: number;
  theme: CanvasTheme;
  seedKey: string;
}): StageTurnLayout {
  const { turn, echoText, stageW, stageH, theme, seedKey } = opts;
  const proseW = Math.min(stageW * 0.5, 760);
  const proseX = (stageW - proseW) / 2;
  const blocksW = Math.min(stageW * 0.64, 1160);
  const blocksX = (stageW - blocksW) / 2;
  const proseSize = 24;
  const proseLineHeight = 33; // leading-snug at text-2xl

  let y = 0;

  // Last user prompt echo ("| …"), small muted line.
  let echo: StageTurnLayout["echo"] = null;
  if (echoText) {
    const m = measure(echoText, {
      fontFamily: theme.fontBody,
      fontSize: 14,
      wrapWidth: proseW - 16,
      lineHeight: 20,
    });
    echo = { y, height: m.height };
    y += m.height + 14;
  }

  // Prose — per-word layout for the ramp entrance.
  const prose = layoutWords(turn.prose ?? "", {
    fontFamily: theme.fontDisplay,
    fontSize: proseSize,
    fontWeight: "500",
    wrapWidth: proseW,
    lineHeight: proseLineHeight,
  });
  const proseY = y;
  y += prose.height + 16;

  // Status line (glyph + text).
  const status = { y };
  y += 20 + 24;

  // Blocks.
  const blocks = layoutTurn(turn, blocksW, theme, seedKey);
  const blocksY = y;
  y += blocks.totalHeight;

  const totalHeight = y;
  const contentY = Math.max(16, (stageH - totalHeight) / 2);

  return {
    contentY,
    totalHeight,
    proseX,
    proseW,
    proseSize,
    proseLineHeight,
    echo,
    proseWords: prose.words,
    proseY,
    status,
    blocksX,
    blocksY,
    blocks,
  };
}

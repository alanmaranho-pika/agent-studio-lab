// Bridges the app's CSS design tokens (Tailwind v4 variables in styles.css)
// into Pixi-consumable values: hex color numbers + font family names. Colors
// are resolved from computed styles once per mount so theme changes at the
// CSS level flow through on next mount.

export type CanvasTheme = {
  /** Card surface fill (DOM: --surface-light-1). */
  card: number;
  /** Primary text on cards (DOM: --content-dark-secondary). */
  text: number;
  /** Strong text / icon stroke (DOM: --content-dark-primary). */
  textStrong: number;
  /** Hairline borders (--color-border). */
  border: number;
  /** Accent / hover ring (--color-primary). */
  primary: number;
  /** Muted surface (loading shimmer, progress track). */
  muted: number;
  /** Muted foreground (eyebrows, subtitles). */
  mutedFg: number;
  fontBody: string;
  fontDisplay: string;
};

const FALLBACK: CanvasTheme = {
  card: 0xffffff,
  text: 0x2b2622,
  textStrong: 0x171310,
  border: 0xe7e2da,
  primary: 0x171310,
  muted: 0xefeae2,
  mutedFg: 0x8a827a,
  fontBody: "Telka, system-ui, sans-serif",
  fontDisplay: '"Telka Extended", Telka, system-ui, sans-serif',
};

let colorCtx: CanvasRenderingContext2D | null = null;

/** Normalize any CSS color (named, rgb, oklch, hex) to a Pixi hex number via
 * the canvas fillStyle round-trip. Returns null for unparseable input. */
export function cssColorToHex(css: string): number | null {
  const value = css.trim();
  if (!value) return null;
  if (!colorCtx) {
    colorCtx = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    });
    if (!colorCtx) return null;
  }
  const ctx = colorCtx;
  ctx.fillStyle = "#010203"; // sentinel
  ctx.fillStyle = value;
  const normalized = String(ctx.fillStyle);
  if (normalized.startsWith("#")) {
    const hex = normalized.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex.slice(0, 6);
    const n = Number.parseInt(full, 16);
    return Number.isNaN(n) ? null : n;
  }
  const m = normalized.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((c) => Math.round(Number(c)));
    return (r << 16) | (g << 8) | b;
  }
  // Modern browsers may normalize to color(srgb r g b) for wide-gamut input.
  const cm = normalized.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (cm) {
    const [r, g, b] = [cm[1], cm[2], cm[3]].map((c) => Math.round(Number(c) * 255));
    return (r << 16) | (g << 8) | b;
  }
  return null;
}

function readVar(styles: CSSStyleDeclaration, name: string): number | null {
  return cssColorToHex(styles.getPropertyValue(name));
}

/** Resolve the canvas theme from the document's computed CSS variables. */
export function resolveCanvasTheme(): CanvasTheme {
  if (typeof document === "undefined") return FALLBACK;
  const styles = getComputedStyle(document.documentElement);
  return {
    card: readVar(styles, "--surface-light-1") ?? FALLBACK.card,
    text: readVar(styles, "--content-dark-secondary") ?? FALLBACK.text,
    textStrong: readVar(styles, "--content-dark-primary") ?? FALLBACK.textStrong,
    border: readVar(styles, "--color-border") ?? FALLBACK.border,
    primary: readVar(styles, "--color-primary") ?? FALLBACK.primary,
    muted: readVar(styles, "--color-muted") ?? FALLBACK.muted,
    mutedFg: readVar(styles, "--color-muted-foreground") ?? FALLBACK.mutedFg,
    fontBody: FALLBACK.fontBody,
    fontDisplay: FALLBACK.fontDisplay,
  };
}

/** Preload the app fonts so the first canvas Text draw isn't a fallback
 * font (canvas rasterizes immediately — no reflow-on-load like DOM). */
export async function loadCanvasFonts(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    await Promise.all([
      document.fonts.load('400 16px "Telka"'),
      document.fonts.load('500 16px "Telka"'),
      document.fonts.load('400 16px "Telka Extended"'),
    ]);
  } catch {
    // Font loading is best-effort — canvas falls back to system-ui.
  }
}

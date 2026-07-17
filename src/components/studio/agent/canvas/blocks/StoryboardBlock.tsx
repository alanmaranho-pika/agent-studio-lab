// Canvas storyboard — one cinematic slide at a time on a themed dark panel
// (same swatch language as the DOM stage), with a tappable segment progress
// bar and crossfade between slides.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Container, Graphics, Rectangle, TextStyle } from "pixi.js";
import { pickSwatchFromText } from "@/lib/theme-swatch";
import type { CardAnswer } from "@/components/studio/generative-card";
import type { StoryboardLayout } from "../layout";
import { cssColorToHex, type CanvasTheme } from "../theme";
import { tween } from "../tween";
import { ActionsRowView } from "./ActionsRow";

export function StoryboardBlockView({
  layout,
  y,
  theme,
  onAnswer,
}: {
  layout: StoryboardLayout;
  y: number;
  theme: CanvasTheme;
  onAnswer: (answer: CardAnswer) => void;
}) {
  const [active, setActive] = useState(0);
  const contentRef = useRef<Container | null>(null);
  const { block, panel, pad } = layout;
  const item = block.items[Math.min(active, block.items.length - 1)];
  const slide = layout.slides[Math.min(active, layout.slides.length - 1)];

  // Themed swatch from the storyboard's own content — matches the DOM
  // stage's color language.
  const swatch = useMemo(() => {
    const hay = [block.title, ...block.items.map((i) => `${i.title} ${i.text ?? ""}`)]
      .filter(Boolean)
      .join(" ");
    const s = pickSwatchFromText(hay);
    return {
      bg: cssColorToHex(s.bg) ?? 0x1b1522,
      fg: cssColorToHex(s.fg) ?? 0xede3f1,
      accent: cssColorToHex(s.accent) ?? 0xb79ce0,
    };
  }, [block]);

  // Crossfade + slight rise on slide change.
  useEffect(() => {
    const c = contentRef.current;
    if (!c) return;
    c.alpha = 0;
    c.y = 6;
    const t = tween(
      c as unknown as Record<string, unknown>,
      { alpha: 1, y: 0 },
      {
        duration: 280,
      },
    );
    return () => t.cancel();
  }, [active]);

  const drawPanel = useCallback(
    (g: Graphics) => {
      g.clear();
      g.roundRect(0, 0, panel.w, panel.h, layout.radius);
      g.fill(swatch.bg);
    },
    [panel.w, panel.h, layout.radius, swatch.bg],
  );

  const metaStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: theme.fontBody,
        fontSize: 12,
        fontWeight: "500",
        fill: swatch.accent,
        letterSpacing: 1.4,
      }),
    [theme, swatch.accent],
  );
  const titleStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: theme.fontDisplay,
        fontSize: layout.titleSize,
        fill: swatch.fg,
        wordWrap: true,
        wordWrapWidth: panel.w - pad * 2,
        breakWords: true,
        lineHeight: Math.round(layout.titleSize * 1.25),
      }),
    [theme, layout.titleSize, panel.w, pad, swatch.fg],
  );
  const textStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: theme.fontBody,
        fontSize: layout.textSize,
        fill: swatch.fg,
        wordWrap: true,
        wordWrapWidth: layout.textWrap,
        breakWords: true,
        lineHeight: Math.round(layout.textSize * 1.5),
      }),
    [theme, layout.textSize, layout.textWrap, swatch.fg],
  );
  const voStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: theme.fontBody,
        fontSize: 14,
        fontStyle: "italic",
        fill: swatch.accent,
        wordWrap: true,
        wordWrapWidth: layout.textWrap,
        breakWords: true,
        lineHeight: 21,
      }),
    [theme, layout.textWrap, swatch.accent],
  );

  // Slide content stacking (top-aligned inside the panel padding).
  let cursor = 0;
  const metaY = cursor;
  if (item.meta) cursor += slide.metaH + 10;
  const titleY = cursor;
  cursor += slide.titleH;
  const textY = cursor + 14;
  if (item.text) cursor += 14 + slide.textH;
  const voY = cursor + 12;

  return (
    <pixiContainer y={y}>
      <pixiGraphics draw={drawPanel} />
      <pixiContainer x={pad} y={pad}>
        <pixiContainer ref={contentRef} key={`slide-${active}`}>
          {item.meta ? (
            <pixiText text={item.meta.toUpperCase()} style={metaStyle} y={metaY} />
          ) : null}
          <pixiText text={item.title} style={titleStyle} y={titleY} />
          {item.text ? <pixiText text={item.text} style={textStyle} y={textY} /> : null}
          {item.vo ? <pixiText text={`“${item.vo}”`} style={voStyle} y={voY} /> : null}
        </pixiContainer>
      </pixiContainer>
      {layout.segments.map((seg, i) => (
        <Segment
          key={`seg-${i}`}
          rect={seg}
          active={i === active}
          accent={swatch.accent}
          fg={swatch.fg}
          onTap={() => setActive(i)}
        />
      ))}
      {layout.actions ? (
        <ActionsRowView layout={layout.actions} yOffset={0} theme={theme} onAnswer={onAnswer} />
      ) : null}
    </pixiContainer>
  );
}

function Segment({
  rect,
  active,
  accent,
  fg,
  onTap,
}: {
  rect: { x: number; y: number; w: number; h: number };
  active: boolean;
  accent: number;
  fg: number;
  onTap: () => void;
}) {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      g.roundRect(0, 0, rect.w, rect.h, rect.h / 2);
      g.fill({ color: active ? accent : fg, alpha: active ? 1 : 0.28 });
    },
    [rect.w, rect.h, active, accent, fg],
  );
  // Generous hit area — the visual bar is only 4px tall.
  const hitArea = useMemo(() => new Rectangle(-4, -10, rect.w + 8, rect.h + 20), [rect.w, rect.h]);
  return (
    <pixiContainer
      x={rect.x}
      y={rect.y}
      eventMode="static"
      cursor="pointer"
      hitArea={hitArea}
      onPointerTap={onTap}
    >
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
}

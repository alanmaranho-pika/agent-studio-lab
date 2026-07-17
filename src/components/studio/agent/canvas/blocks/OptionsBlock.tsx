// Canvas option cards — the "pick one" grid. Mirrors the DOM enhancer's
// card anatomy (visual slot top, title/subtitle anchored bottom, seeded
// scatter rotation) and produces the identical CardAnswer on tap.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Container, Graphics, TextStyle, Texture } from "pixi.js";
import type { TurnOptionItem } from "@/lib/agent/ui-schema";
import type { CardAnswer } from "@/components/studio/generative-card";
import type { OptionsLayout, OptionCardLayout } from "../layout";
import { cssColorToHex, type CanvasTheme } from "../theme";
import { loadIconTexture } from "../icons";
import { useCoverTexture, coverFit } from "../images";
import { tween, tweenScale, easeOutBack } from "../tween";

export function OptionsBlockView({
  layout,
  y,
  theme,
  onAnswer,
}: {
  layout: OptionsLayout;
  y: number;
  theme: CanvasTheme;
  onAnswer: (answer: CardAnswer) => void;
}) {
  return (
    <pixiContainer y={y}>
      {layout.block.items.map((item, i) => (
        <OptionCard
          key={`${item.value}-${i}`}
          item={item}
          card={layout.cards[i]}
          index={i}
          theme={theme}
          onAnswer={onAnswer}
        />
      ))}
    </pixiContainer>
  );
}

function useIconTexture(slug: string | null, colorCss: string): Texture | null {
  const [tex, setTex] = useState<Texture | null>(null);
  useEffect(() => {
    let alive = true;
    if (!slug) {
      setTex(null);
      return;
    }
    void loadIconTexture(slug, colorCss).then((t) => {
      if (alive) setTex(t);
    });
    return () => {
      alive = false;
    };
  }, [slug, colorCss]);
  return tex;
}

function OptionCard({
  item,
  card,
  index,
  theme,
  onAnswer,
}: {
  item: TurnOptionItem;
  card: OptionCardLayout;
  index: number;
  theme: CanvasTheme;
  onAnswer: (answer: CardAnswer) => void;
}) {
  const outerRef = useRef<Container | null>(null);
  const [hover, setHover] = useState(false);
  const { rect, pad, radius, visualSize } = card;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2 + card.ty;

  // Entrance: fade + rise with a per-card stagger, once per mount.
  useEffect(() => {
    const c = outerRef.current;
    if (!c) return;
    c.alpha = 0;
    c.y = cy + 16;
    const t = tween(
      c as unknown as Record<string, unknown>,
      { alpha: 1, y: cy },
      {
        duration: 420,
        delay: index * 45,
        ease: easeOutBack,
      },
    );
    return () => t.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hover / press spring on the container scale.
  useEffect(() => {
    const c = outerRef.current;
    if (!c) return;
    const t = tweenScale(c.scale, hover ? 1.03 : 1, {
      duration: 220,
      ease: easeOutBack,
    });
    return () => t.cancel();
  }, [hover]);

  const drawBg = useCallback(
    (g: Graphics) => {
      g.clear();
      g.roundRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h, radius);
      g.fill(theme.card);
      g.stroke({
        width: hover ? 1.5 : 1,
        color: hover ? theme.primary : theme.border,
        alpha: hover ? 0.9 : 1,
      });
    },
    [rect.w, rect.h, radius, hover, theme],
  );

  const titleStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: theme.fontBody,
        fontSize: card.titleSize,
        fill: theme.text,
        wordWrap: true,
        wordWrapWidth: rect.w - pad * 2,
        breakWords: true,
        lineHeight: Math.round(card.titleSize * 1.25),
      }),
    [theme, card.titleSize, rect.w, pad],
  );
  const subtitleStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: theme.fontBody,
        fontSize: card.subtitleSize,
        fill: theme.mutedFg,
        wordWrap: true,
        wordWrapWidth: rect.w - pad * 2,
        breakWords: true,
        lineHeight: Math.round(card.subtitleSize * 1.25),
      }),
    [theme, card.subtitleSize, rect.w, pad],
  );

  const bodyH = card.titleH + (item.subtitle ? 4 + card.subtitleH : 0);
  const left = -rect.w / 2 + pad;
  const top = -rect.h / 2 + pad;
  const bodyTop = rect.h / 2 - pad - bodyH;

  return (
    <pixiContainer
      ref={outerRef}
      x={cx}
      y={cy}
      rotation={card.rot}
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
      onPointerDown={() => {
        const c = outerRef.current;
        if (c) tweenScale(c.scale, 0.97, { duration: 90 });
      }}
      onPointerUp={() => {
        const c = outerRef.current;
        if (c) tweenScale(c.scale, hover ? 1.03 : 1, { duration: 160 });
      }}
      onPointerTap={() =>
        onAnswer({
          summary: item.value,
          assets: [],
          next: item.next,
          ack: item.ack,
        })
      }
    >
      <pixiGraphics draw={drawBg} />
      <CardVisual visual={item.visual} x={left} y={top} size={visualSize} theme={theme} />
      <pixiText text={item.title} style={titleStyle} x={left} y={bodyTop} />
      {item.subtitle ? (
        <pixiText
          text={item.subtitle}
          style={subtitleStyle}
          x={left}
          y={bodyTop + card.titleH + 4}
        />
      ) : null}
    </pixiContainer>
  );
}

// ---------- Visual slot (ratio box / icon tile / circular image) ----------

function CardVisual({
  visual,
  x,
  y,
  size,
  theme,
}: {
  visual: TurnOptionItem["visual"];
  x: number;
  y: number;
  size: number;
  theme: CanvasTheme;
}) {
  if (visual?.kind === "ratio") {
    return <RatioBox ratio={visual.ratio} x={x} y={y} size={size} theme={theme} />;
  }
  if (visual?.kind === "image") {
    return <CircleImage url={visual.url} x={x} y={y} size={size} theme={theme} />;
  }
  // Icon (or fallback sparkles, like the DOM enhancer).
  const slug = visual?.kind === "icon" ? visual.icon : "sparkles";
  const bg = visual?.kind === "icon" ? visual.bg : undefined;
  return <IconTile slug={slug} bg={bg} x={x} y={y} size={size} theme={theme} />;
}

function IconTile({
  slug,
  bg,
  x,
  y,
  size,
  theme,
}: {
  slug: string;
  bg?: string;
  x: number;
  y: number;
  size: number;
  theme: CanvasTheme;
}) {
  const colorCss = `#${theme.textStrong.toString(16).padStart(6, "0")}`;
  const texture = useIconTexture(slug, colorCss);
  const bgColor = (bg ? cssColorToHex(bg) : null) ?? theme.muted;
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      g.roundRect(0, 0, size, size, size * 0.3);
      g.fill(bgColor);
    },
    [size, bgColor],
  );
  const iconSize = size * 0.55;
  return (
    <pixiContainer x={x} y={y}>
      <pixiGraphics draw={draw} />
      {texture ? (
        <pixiSprite
          texture={texture}
          x={(size - iconSize) / 2}
          y={(size - iconSize) / 2}
          width={iconSize}
          height={iconSize}
        />
      ) : null}
    </pixiContainer>
  );
}

function RatioBox({
  ratio,
  x,
  y,
  size,
  theme,
}: {
  ratio: "9:16" | "16:9" | "1:1";
  x: number;
  y: number;
  size: number;
  theme: CanvasTheme;
}) {
  const [rw, rh] = ratio.split(":").map(Number);
  const h = size;
  const w = (h * rw) / rh;
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      g.roundRect(0, 0, w, h, 6);
      g.stroke({ width: 1.5, color: theme.textStrong, alpha: 0.85 });
      // Rule-of-thirds guides.
      for (const fx of [w / 3, (2 * w) / 3]) {
        g.moveTo(fx, 2).lineTo(fx, h - 2);
      }
      for (const fy of [h / 3, (2 * h) / 3]) {
        g.moveTo(2, fy).lineTo(w - 2, fy);
      }
      g.stroke({ width: 0.75, color: theme.mutedFg, alpha: 0.5 });
    },
    [w, h, theme],
  );
  return <pixiGraphics draw={draw} x={x} y={y} />;
}

function CircleImage({
  url,
  x,
  y,
  size,
  theme,
}: {
  url: string;
  x: number;
  y: number;
  size: number;
  theme: CanvasTheme;
}) {
  const { texture, status } = useCoverTexture(url);
  const [mask, setMask] = useState<Graphics | null>(null);
  const drawMask = useCallback(
    (g: Graphics) => {
      g.clear();
      g.circle(size / 2, size / 2, size / 2);
      g.fill(0xffffff);
    },
    [size],
  );
  const drawFallback = useCallback(
    (g: Graphics) => {
      g.clear();
      g.circle(size / 2, size / 2, size / 2);
      g.fill(theme.muted);
    },
    [size, theme],
  );
  const fit = texture ? coverFit(texture, size, size) : null;
  return (
    <pixiContainer x={x} y={y} mask={mask}>
      <pixiGraphics ref={setMask} draw={drawMask} />
      {status === "ok" && texture && fit ? (
        <pixiSprite texture={texture} x={fit.x} y={fit.y} scale={fit.scale} />
      ) : (
        <pixiGraphics draw={drawFallback} />
      )}
    </pixiContainer>
  );
}

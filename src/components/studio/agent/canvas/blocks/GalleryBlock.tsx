// Canvas gallery — 1–6 cover-fit image tiles with optional label chips and
// a shared actions row, mirroring the DOM gen-gallery's count-driven grid.

import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { Container, Graphics, TextStyle } from "pixi.js";
import { useTick } from "@pixi/react";
import type { CardAnswer } from "@/components/studio/generative-card";
import type { GalleryLayout, GalleryTileLayout } from "../layout";
import type { CanvasTheme } from "../theme";
import { useCoverTexture, coverFit } from "../images";
import { tween } from "../tween";
import { ActionsRowView } from "./ActionsRow";

export function GalleryBlockView({
  layout,
  y,
  theme,
  onAnswer,
}: {
  layout: GalleryLayout;
  y: number;
  theme: CanvasTheme;
  onAnswer: (answer: CardAnswer) => void;
}) {
  const eyebrowStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: theme.fontDisplay,
        fontSize: 13,
        fontWeight: "500",
        fill: theme.mutedFg,
        letterSpacing: 1.2,
      }),
    [theme],
  );

  return (
    <pixiContainer y={y}>
      {layout.block.title ? (
        <pixiText text={layout.block.title.toUpperCase()} style={eyebrowStyle} x={0} y={4} />
      ) : null}
      {layout.tiles.map((tile, i) => (
        <GalleryTile
          key={`${tile.url}-${i}`}
          tile={tile}
          radius={layout.radius}
          index={i}
          theme={theme}
        />
      ))}
      {layout.actions ? (
        <ActionsRowView layout={layout.actions} yOffset={0} theme={theme} onAnswer={onAnswer} />
      ) : null}
    </pixiContainer>
  );
}

function GalleryTile({
  tile,
  radius,
  index,
  theme,
}: {
  tile: GalleryTileLayout;
  radius: number;
  index: number;
  theme: CanvasTheme;
}) {
  const rootRef = useRef<Container | null>(null);
  const shimmerRef = useRef<Graphics | null>(null);
  const [mask, setMask] = useState<Graphics | null>(null);
  const { texture, status } = useCoverTexture(tile.url);
  const { rect } = tile;

  // Entrance fade-up.
  useEffect(() => {
    const c = rootRef.current;
    if (!c) return;
    c.alpha = 0;
    c.y = rect.y + 10;
    const t = tween(
      c as unknown as Record<string, unknown>,
      { alpha: 1, y: rect.y },
      {
        duration: 360,
        delay: index * 60,
      },
    );
    return () => t.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loading shimmer pulse.
  useTick({
    callback: () => {
      const g = shimmerRef.current;
      if (g) g.alpha = 0.55 + 0.25 * Math.sin(performance.now() / 260);
    },
    isEnabled: status === "loading",
  });

  const drawMask = useCallback(
    (g: Graphics) => {
      g.clear();
      g.roundRect(0, 0, rect.w, rect.h, radius);
      g.fill(0xffffff);
    },
    [rect.w, rect.h, radius],
  );
  const drawPlaceholder = useCallback(
    (g: Graphics) => {
      g.clear();
      g.roundRect(0, 0, rect.w, rect.h, radius);
      g.fill(theme.muted);
    },
    [rect.w, rect.h, radius, theme],
  );

  const labelStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: theme.fontBody,
        fontSize: 12,
        fontWeight: "500",
        fill: 0xffffff,
      }),
    [theme],
  );
  const chipW = tile.labelW + 20;
  const drawChip = useCallback(
    (g: Graphics) => {
      g.clear();
      g.roundRect(0, 0, chipW, 24, 12);
      g.fill({ color: 0x000000, alpha: 0.55 });
    },
    [chipW],
  );

  const fit = texture ? coverFit(texture, rect.w, rect.h) : null;

  return (
    <pixiContainer ref={rootRef} x={rect.x} y={rect.y}>
      <pixiContainer mask={mask}>
        <pixiGraphics ref={setMask} draw={drawMask} />
        {status === "ok" && texture && fit ? (
          <pixiSprite texture={texture} x={fit.x} y={fit.y} scale={fit.scale} />
        ) : (
          <pixiGraphics ref={shimmerRef} draw={drawPlaceholder} />
        )}
      </pixiContainer>
      {tile.label ? (
        <pixiContainer x={10} y={rect.h - 34}>
          <pixiGraphics draw={drawChip} />
          <pixiText text={tile.label} style={labelStyle} x={10} y={5} />
        </pixiContainer>
      ) : null}
    </pixiContainer>
  );
}

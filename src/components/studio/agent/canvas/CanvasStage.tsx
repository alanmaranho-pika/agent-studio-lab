// The full-stage WebGL scene. One persistent Pixi Application fills the
// center-stage zone; a "world" container provides the camera (pinch/⌘-wheel
// zoom to cursor, wheel pan) that future view modes — design canvas, timeline,
// drawing — will build on. Echo line, prose (word-ramp), status, and blocks
// are all painted; nav/composer stay DOM outside this component.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Application, extend } from "@pixi/react";
import { Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import type { StageCanvasProps } from "./StageCanvasMount";
import { layoutStageTurn, type StageTurnLayout } from "./layout";
import { resolveCanvasTheme, loadCanvasFonts, type CanvasTheme } from "./theme";
import { tween, tweenScale } from "./tween";
import { OptionsBlockView } from "./blocks/OptionsBlock";
import { GalleryBlockView } from "./blocks/GalleryBlock";
import { StoryboardBlockView } from "./blocks/StoryboardBlock";

extend({ Container, Graphics, Sprite, Text });

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;
const clamp = (min: number, v: number, max: number) => Math.max(min, Math.min(max, v));

export default function CanvasStage({
  turn,
  echoText,
  statusText,
  seedKey,
  onAnswer,
}: StageCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<Container | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [theme, setTheme] = useState<CanvasTheme | null>(null);
  const [zoomPct, setZoomPct] = useState(100);

  // Fonts first, then theme — layout measures text with the real typefaces.
  useEffect(() => {
    let alive = true;
    void loadCanvasFonts().then(() => {
      if (alive) setTheme(resolveCanvasTheme());
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setSize((prev) =>
        Math.abs(prev.w - r.width) > 1 || Math.abs(prev.h - r.height) > 1
          ? { w: r.width, h: r.height }
          : prev,
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Camera: pinch / ctrl(cmd)+wheel zooms around the cursor, plain wheel
  // pans (Figma-style). Native listener with passive:false so the page
  // never scrolls underneath.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const world = worldRef.current;
      if (!world) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const prev = world.scale.x;
        const next = clamp(ZOOM_MIN, prev * Math.exp(-e.deltaY * 0.012), ZOOM_MAX);
        const f = next / prev;
        world.scale.set(next);
        world.x = mx - f * (mx - world.x);
        world.y = my - f * (my - world.y);
        setZoomPct(Math.round(next * 100));
      } else {
        world.x -= e.deltaX;
        world.y -= e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const resetCamera = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    tween(world as unknown as Record<string, unknown>, { x: 0, y: 0 }, { duration: 260 });
    tweenScale(world.scale, 1, { duration: 260 });
    setZoomPct(100);
  }, []);

  const layout = useMemo(
    () =>
      theme && size.w > 120 && size.h > 120
        ? layoutStageTurn({
            turn,
            echoText: echoText ?? "",
            stageW: size.w,
            stageH: size.h,
            theme,
            seedKey: seedKey ?? "turn",
          })
        : null,
    [turn, echoText, size, theme, seedKey],
  );

  return (
    <div
      ref={wrapRef}
      data-canvas-stage
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      {layout && theme ? (
        <Application
          resizeTo={wrapRef}
          backgroundAlpha={0}
          antialias
          autoDensity
          resolution={Math.min(window.devicePixelRatio || 1, 2)}
        >
          <pixiContainer ref={worldRef}>
            <StageTurnView
              key={seedKey ?? "turn"}
              layout={layout}
              theme={theme}
              echoText={echoText ?? ""}
              statusText={statusText ?? "Waiting for you"}
              onAnswer={onAnswer}
            />
          </pixiContainer>
        </Application>
      ) : null}
      {/* Zoom pill — deliberately DOM (stage chrome, not scene content). */}
      <button
        type="button"
        onClick={resetCamera}
        title="Reset zoom"
        style={{
          position: "absolute",
          right: 16,
          bottom: 12,
          fontSize: 11,
          fontWeight: 500,
          padding: "4px 10px",
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(255,255,255,0.7)",
          color: "rgba(0,0,0,0.55)",
          cursor: "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        {zoomPct}%
      </button>
    </div>
  );
}

// ---------- The turn scene ----------

function StageTurnView({
  layout,
  theme,
  echoText,
  statusText,
  onAnswer,
}: {
  layout: StageTurnLayout;
  theme: CanvasTheme;
  echoText: string;
  statusText: string;
  onAnswer: StageCanvasProps["onAnswer"];
}) {
  const rootRef = useRef<Container | null>(null);

  // Whole-turn entrance: fade + rise once per turn key.
  useEffect(() => {
    const c = rootRef.current;
    if (!c) return;
    c.alpha = 0;
    const targetY = layout.contentY;
    c.y = targetY + 14;
    const t = tween(
      c as unknown as Record<string, unknown>,
      { alpha: 1, y: targetY },
      { duration: 360 },
    );
    return () => t.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const echoStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: theme.fontBody,
        fontSize: 14,
        fill: theme.text,
        wordWrap: true,
        wordWrapWidth: layout.proseW - 16,
        breakWords: true,
        lineHeight: 20,
      }),
    [theme, layout.proseW],
  );
  const statusStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: theme.fontBody,
        fontSize: 14,
        fill: theme.text,
      }),
    [theme],
  );

  const drawEchoBar = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(0, 2, 2, 16);
      g.fill({ color: theme.mutedFg, alpha: 0.5 });
    },
    [theme],
  );

  return (
    <pixiContainer ref={rootRef} y={layout.contentY}>
      {/* Echo line */}
      {layout.echo ? (
        <pixiContainer x={layout.proseX} y={layout.echo.y}>
          <pixiGraphics draw={drawEchoBar} />
          <pixiText text={echoText} style={echoStyle} x={16} alpha={0.8} />
        </pixiContainer>
      ) : null}

      {/* Prose — word ramp */}
      <pixiContainer x={layout.proseX} y={layout.proseY}>
        {layout.proseWords.map((w, i) => (
          <RampWord key={`${w.text}-${i}`} word={w} index={i} theme={theme} layout={layout} />
        ))}
      </pixiContainer>

      {/* Status line */}
      <pixiContainer x={layout.proseX} y={layout.status.y}>
        <AgentMark size={16} color={0x969098} />
        <pixiText text={statusText} style={statusStyle} x={24} y={1} alpha={0.4} />
      </pixiContainer>

      {/* Blocks */}
      <pixiContainer x={layout.blocksX} y={layout.blocksY}>
        {layout.blocks.entries.map((entry, i) => {
          const l = entry.layout;
          if (l.kind === "options") {
            return (
              <OptionsBlockView
                key={`options-${i}`}
                layout={l}
                y={entry.y}
                theme={theme}
                onAnswer={onAnswer}
              />
            );
          }
          if (l.kind === "gallery") {
            return (
              <GalleryBlockView
                key={`gallery-${i}`}
                layout={l}
                y={entry.y}
                theme={theme}
                onAnswer={onAnswer}
              />
            );
          }
          return (
            <StoryboardBlockView
              key={`storyboard-${i}`}
              layout={l}
              y={entry.y}
              theme={theme}
              onAnswer={onAnswer}
            />
          );
        })}
      </pixiContainer>
    </pixiContainer>
  );
}

function RampWord({
  word,
  index,
  theme,
  layout,
}: {
  word: { text: string; x: number; y: number };
  index: number;
  theme: CanvasTheme;
  layout: StageTurnLayout;
}) {
  const ref = useRef<Text | null>(null);
  const style = useMemo(
    () =>
      new TextStyle({
        fontFamily: theme.fontDisplay,
        fontSize: layout.proseSize,
        fontWeight: "500",
        fill: theme.textStrong,
      }),
    [theme, layout.proseSize],
  );
  useEffect(() => {
    const t0 = ref.current;
    if (!t0) return;
    t0.alpha = 0;
    t0.y = word.y + 6;
    const t = tween(
      t0 as unknown as Record<string, unknown>,
      { alpha: 1, y: word.y },
      { duration: 300, delay: index * 26 },
    );
    return () => t.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <pixiText ref={ref} text={word.text} style={style} x={word.x} y={word.y} />;
}

/** The four-point agent star (same path as the DOM AGENT_MARK_SVG). */
function AgentMark({ size, color }: { size: number; color: number }) {
  const draw = useCallback(
    (g: Graphics) => {
      const s = size / 100;
      g.clear();
      g.moveTo(50 * s, 2 * s);
      g.bezierCurveTo(58 * s, 22 * s, 78 * s, 42 * s, 98 * s, 50 * s);
      g.bezierCurveTo(78 * s, 58 * s, 58 * s, 78 * s, 50 * s, 98 * s);
      g.bezierCurveTo(42 * s, 78 * s, 22 * s, 58 * s, 2 * s, 50 * s);
      g.bezierCurveTo(22 * s, 42 * s, 42 * s, 22 * s, 50 * s, 2 * s);
      g.closePath();
      g.fill(color);
    },
    [size, color],
  );
  return <pixiGraphics draw={draw} y={2} />;
}

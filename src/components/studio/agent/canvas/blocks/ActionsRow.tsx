// Shared CTA pill row — canvas equivalent of the DOM gen-actions row.
// Clicking a pill produces the same CardAnswer the DOM delegate dispatches.

import { useCallback, useMemo, useState } from "react";
import { Graphics, TextStyle } from "pixi.js";
import type { CardAnswer } from "@/components/studio/generative-card";
import type { ActionsRowLayout } from "../layout";
import type { CanvasTheme } from "../theme";

export function ActionsRowView({
  layout,
  yOffset,
  theme,
  onAnswer,
}: {
  layout: ActionsRowLayout;
  yOffset: number;
  theme: CanvasTheme;
  onAnswer: (answer: CardAnswer) => void;
}) {
  return (
    <pixiContainer y={yOffset}>
      {layout.buttons.map((btn, i) => (
        <ActionPill
          key={`${btn.action.value}-${i}`}
          btn={btn}
          fontSize={layout.fontSize}
          theme={theme}
          onAnswer={onAnswer}
        />
      ))}
    </pixiContainer>
  );
}

function ActionPill({
  btn,
  fontSize,
  theme,
  onAnswer,
}: {
  btn: ActionsRowLayout["buttons"][number];
  fontSize: number;
  theme: CanvasTheme;
  onAnswer: (answer: CardAnswer) => void;
}) {
  const [hover, setHover] = useState(false);
  const { rect, action } = btn;
  const primary = !!action.primary;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      g.roundRect(0, 0, rect.w, rect.h, rect.h / 2);
      if (primary) {
        g.fill({ color: theme.primary, alpha: hover ? 0.88 : 1 });
      } else {
        g.fill({ color: theme.card, alpha: hover ? 1 : 0.85 });
        g.stroke({ width: 1, color: hover ? theme.primary : theme.border });
      }
    },
    [rect.w, rect.h, primary, hover, theme],
  );

  const style = useMemo(
    () =>
      new TextStyle({
        fontFamily: theme.fontBody,
        fontSize,
        fontWeight: "500",
        fill: primary ? 0xffffff : theme.text,
      }),
    [theme, fontSize, primary],
  );

  return (
    <pixiContainer
      x={rect.x}
      y={rect.y}
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
      onPointerTap={() =>
        onAnswer({
          summary: action.value,
          assets: [],
          next: action.next,
          ack: action.ack,
        })
      }
    >
      <pixiGraphics draw={draw} />
      <pixiText text={action.label} style={style} anchor={0.5} x={rect.w / 2} y={rect.h / 2} />
    </pixiContainer>
  );
}

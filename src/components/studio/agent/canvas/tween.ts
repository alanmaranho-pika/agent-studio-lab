// Minimal rAF tween utility for animating Pixi display objects outside the
// React render cycle (entrance staggers, hover springs, crossfades). No
// animation dependency — two easings cover the PoC.

export type TweenTarget = Record<string, unknown>;

type ActiveTween = {
  cancel: () => void;
};

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Slightly overshooting spring-like ease (matches the framer-motion
 * cardVariants feel without a physics sim). */
export function easeOutBack(t: number): number {
  const c1 = 1.20158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export type TweenOptions = {
  duration?: number;
  delay?: number;
  ease?: (t: number) => number;
  onComplete?: () => void;
};

/** Tween numeric properties on any object (e.g. a Pixi Container's
 * `alpha`/`y`, or its `scale` via a wrapper). Returns a cancel handle. */
export function tween(
  target: TweenTarget,
  to: Record<string, number>,
  { duration = 320, delay = 0, ease = easeOutCubic, onComplete }: TweenOptions = {},
): ActiveTween {
  let raf = 0;
  let start = 0;
  const from: Record<string, number> = {};
  let cancelled = false;

  const begin = () => {
    if (cancelled) return;
    for (const key of Object.keys(to)) {
      const v = target[key];
      from[key] = typeof v === "number" ? v : 0;
    }
    start = performance.now();
    raf = requestAnimationFrame(step);
  };

  const step = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / duration);
    const k = ease(t);
    for (const key of Object.keys(to)) {
      target[key] = from[key] + (to[key] - from[key]) * k;
    }
    if (t < 1) {
      raf = requestAnimationFrame(step);
    } else {
      onComplete?.();
    }
  };

  const timer = delay > 0 ? window.setTimeout(begin, delay) : (begin(), 0);

  return {
    cancel() {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    },
  };
}

/** Convenience: tween a Pixi scale (which lives on `.scale.x/.y`). */
export function tweenScale(
  scale: { x: number; y: number },
  value: number,
  opts?: TweenOptions,
): ActiveTween {
  return tween(scale as unknown as TweenTarget, { x: value, y: value }, opts);
}

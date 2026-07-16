import { useEffect, useRef, useState } from "react";

/**
 * Measures how much vertical space a fixed chrome element reserves at the top
 * or bottom edge of the viewport, so layout code can size the stage against
 * the real chrome instead of hardcoded pixel bands.
 *
 * For `edge: "top"` the band is the distance from the viewport top to the
 * element's bottom edge; for `edge: "bottom"` it's the distance from the
 * element's top edge to the viewport bottom. Re-measures on element resize
 * and window resize. Returns `fallback` until the ref is attached.
 */
export function useViewportBand(edge: "top" | "bottom", fallback: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [band, setBand] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const next =
        edge === "top" ? rect.bottom : window.innerHeight - rect.top;
      if (Number.isFinite(next) && next >= 0) setBand(Math.ceil(next));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [edge]);

  return { ref, band } as const;
}

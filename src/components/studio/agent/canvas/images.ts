// Remote-image loading for canvas tiles. Wraps Pixi Assets.load (URL-cached
// across turns/history revisits) with a React status hook plus cover-fit
// math for drawing into a fixed rect.

import { useEffect, useState } from "react";
import { Assets, Texture } from "pixi.js";

export type TextureStatus = "loading" | "ok" | "error";

export function useCoverTexture(url: string | undefined): {
  texture: Texture | null;
  status: TextureStatus;
} {
  const [state, setState] = useState<{
    texture: Texture | null;
    status: TextureStatus;
  }>({ texture: null, status: "loading" });

  useEffect(() => {
    let alive = true;
    if (!url) {
      setState({ texture: null, status: "error" });
      return;
    }
    setState({ texture: null, status: "loading" });
    Assets.load<Texture>(url)
      .then((texture) => {
        if (alive) setState({ texture, status: "ok" });
      })
      .catch(() => {
        if (alive) setState({ texture: null, status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [url]);

  return state;
}

/** Cover-fit a texture into a w×h box: returns sprite scale + centered
 * offsets (like CSS object-fit: cover). */
export function coverFit(
  texture: Texture,
  w: number,
  h: number,
): { scale: number; x: number; y: number } {
  const tw = texture.width || 1;
  const th = texture.height || 1;
  const scale = Math.max(w / tw, h / th);
  return {
    scale,
    x: (w - tw * scale) / 2,
    y: (h - th * scale) / 2,
  };
}

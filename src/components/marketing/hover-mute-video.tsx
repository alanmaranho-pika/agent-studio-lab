import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "muted" | "onClick" | "src"> & {
  src: string;
  className?: string;
  videoClassName?: string;
  /** If provided, click fires this instead of toggling manual mute. */
  onTileClick?: () => void;
};

/**
 * Hover-to-hear video tile.
 * - Hover in: instantly unmuted (and mutes any other tile that was audible).
 * - Hover out: instantly muted.
 * - Click: toggles a manual mute while hovered — overrides hover until you leave.
 */

let currentActive: HTMLVideoElement | null = null;

function activate(v: HTMLVideoElement) {
  if (currentActive && currentActive !== v) {
    currentActive.muted = true;
  }
  currentActive = v;
  v.muted = false;
  try { v.volume = 1; } catch {}
  const p = v.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

function deactivate(v: HTMLVideoElement) {
  v.muted = true;
  if (currentActive === v) currentActive = null;
}

export function HoverMuteVideo({
  className,
  videoClassName,
  src,
  poster,
  onTileClick,
  ...rest
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const visibleRef = useRef(false);
  const hoveredRef = useRef(false);
  const [manualMute, setManualMute] = useState(false);
  const [audible, setAudible] = useState(false);

  // Lazy attach src + play once on screen.
  useEffect(() => {
    const el = wrapRef.current;
    const v = videoRef.current;
    if (!el || !v) return;
    v.muted = true;
    let hls: { destroy: () => void } | null = null;

    const attachSrc = async () => {
      const isHls = /\.m3u8(\?|$)/i.test(src);
      if (isHls && !v.canPlayType("application/vnd.apple.mpegurl")) {
        const Hls = (await import("hls.js")).default;
        if (Hls.isSupported()) {
          const instance = new Hls({ enableWorker: true });
          instance.loadSource(src);
          instance.attachMedia(v);
          hls = instance;
          return;
        }
      }
      if (v.getAttribute("src") !== src) {
        v.setAttribute("src", src);
        v.load();
      }
    };

    const apply = (vis: boolean) => {
      visibleRef.current = vis;
      if (vis) {
        void attachSrc().then(() => {
          v.play().catch(() => {});
        });
      } else {
        v.pause();
        if (currentActive === v) {
          v.muted = true;
          currentActive = null;
        }
      }
    };

    if (typeof IntersectionObserver === "undefined") {
      apply(true);
      return () => {
        if (hls) hls.destroy();
      };
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => apply(e.isIntersecting)),
      { rootMargin: "200px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (hls) hls.destroy();
      if (currentActive === v) currentActive = null;
    };
  }, [src]);

  // Pause on tab hidden.
  useEffect(() => {
    const onVis = () => {
      const v = videoRef.current;
      if (!v) return;
      if (document.hidden) {
        if (currentActive === v) currentActive = null;
        v.muted = true;
        v.pause();
      } else if (visibleRef.current) {
        v.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const onEnter = () => {
    hoveredRef.current = true;
    const v = videoRef.current;
    if (!v || manualMute) return;
    activate(v);
    setAudible(true);
  };

  const onLeave = () => {
    hoveredRef.current = false;
    const v = videoRef.current;
    if (!v) return;
    deactivate(v);
    setAudible(false);
    // Reset manual override when the cursor leaves.
    setManualMute(false);
  };

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onTileClick) {
      onTileClick();
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    if (audible) {
      deactivate(v);
      setAudible(false);
      setManualMute(true);
    } else {
      activate(v);
      setAudible(true);
      setManualMute(false);
    }
  };

  const cursorUrl = audible ? CURSOR_MUTE : CURSOR_SPEAKER;

  return (
    <div
      ref={wrapRef}
      className={cn("group/audio relative", className)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{ cursor: `url("${cursorUrl}") 16 16, pointer` }}
    >
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="none"
        poster={poster}
        {...rest}
        className={cn("h-full w-full object-cover", videoClassName)}
      />
    </div>
  );
}

// 32x32 SVG cursors: dark translucent circle backdrop + white lucide icon
// (Volume2 for "click to mute", VolumeX for "click to unmute"). Hotspot 16,16.
const CURSOR_SPEAKER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="rgba(0,0,0,0.7)"/>
      <g transform="translate(4 4)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/>
        <path d="M16 9a5 5 0 0 1 0 6"/>
        <path d="M19.36 5.64a9 9 0 0 1 0 12.72"/>
      </g>
    </svg>`,
  );

const CURSOR_MUTE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="rgba(0,0,0,0.7)"/>
      <g transform="translate(4 4)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/>
        <line x1="22" x2="16" y1="9" y2="15"/>
        <line x1="16" x2="22" y1="9" y2="15"/>
      </g>
    </svg>`,
  );


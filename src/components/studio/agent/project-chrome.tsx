import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";

import chromeLogo from "@/assets/logo.png";
import { cn } from "@/lib/utils";
import { PENDING_MIME, resolveThumb, type ProjectAsset } from "@/lib/project-state";

/**
 * ProjectChrome — the project workspace frame (Figma 27613-381467 / -381573).
 *
 * The screen is a flat chrome layer holding a left rail and a rounded "main
 * stage" wrapper. The rail is icon-only by default and expands on hover
 * (72px → 350px), pushing the wrapper right. Leaving the project happens ONLY
 * through the nav logo — there is no hover nav to Projects/Library/Blocks
 * anymore.
 *
 * Rail contents: logo (leave project) · project title + meta (expanded) ·
 * surface switcher (Main Stage / Timeline Editor / …) · library summary of
 * the assets generated so far. Everything else renders inside the wrapper
 * via `children`.
 */

export type ProjectSurface = {
  id: string;
  label: string;
  /** 20px glyph rendered in the row's icon slot. */
  icon: ReactNode;
  /** Mock/future surface — selectable UI but routed to a placeholder. */
  comingSoon?: boolean;
  /** Accent-colored label (the "New View" affordance). */
  accent?: boolean;
};

export type ProjectChromeProps = {
  projectTitle: string;
  /** "Docudrama teaser • 0 Shots • 0:00" pieces, rendered dot-separated. */
  projectMeta: string[];
  assets: ProjectAsset[];
  surfaces: ProjectSurface[];
  activeSurface: string;
  onSurfaceSelect: (id: string) => void;
  /** Nav logo tap — the only way out of the project. */
  onLeaveProject: () => void;
  onTitleClick?: () => void;
  children: ReactNode;
};

const RAIL_CLOSED = 72;
const RAIL_OPEN = 350;

export function ProjectChrome({
  projectTitle,
  projectMeta,
  assets,
  surfaces,
  activeSurface,
  onSurfaceSelect,
  onLeaveProject,
  onTitleClick,
  children,
}: ProjectChromeProps) {
  const [open, setOpen] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  // Expand only after a 300ms dwell so brushing past the rail's column while
  // reaching for stage content never pops it open. Leaving cancels a pending
  // open and closes after a short grace period.
  const enter = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (openTimer.current || open) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      setOpen(true);
    }, 300);
  };
  const leave = () => {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  // Library summary. The badge is the actual asset count — every real library
  // item (image, video, audio, reference, …), excluding only in-flight
  // pending placeholders. The stack preview can only paint image-mime URLs,
  // so it collects those separately; the count and the preview are allowed to
  // diverge (2 thumbs shown, N total).
  const { thumbs, assetCount } = useMemo(() => {
    const imgs: string[] = [];
    let count = 0;
    for (let i = assets.length - 1; i >= 0; i--) {
      const a = assets[i];
      const mime = a.mime ?? "";
      if (a.kind === "pending" || mime === PENDING_MIME) continue;
      count++;
      const isVideo = mime.startsWith("video/") || (!mime && a.kind === "video");
      const isImage =
        mime.startsWith("image/") ||
        (!isVideo && ["image", "keyframe", "reference", "likeness", "logo"].includes(a.kind));
      if (isImage) {
        const t = resolveThumb(a.url, assets);
        if (t) imgs.push(t);
      }
    }
    return { thumbs: imgs, assetCount: count };
  }, [assets]);

  // The rail's children (logo, title, surface switcher, library) are each
  // absolutely positioned, so the rail's own width can't rely on normal-flow
  // auto-sizing — it has to be measured. Widen only to the widest visible
  // row's right edge (+ a little breathing room) so the open rail hugs its
  // content instead of always claiming a fixed 350px hover zone, which made
  // it feel oversized and hard to dismiss once the switcher pills went
  // auto-width.
  const railRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLButtonElement | null>(null);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const newViewRef = useRef<HTMLDivElement | null>(null);
  const libraryRef = useRef<HTMLDivElement | null>(null);
  const [openWidth, setOpenWidth] = useState(RAIL_OPEN);
  useLayoutEffect(() => {
    if (!open) return;
    const railLeft = railRef.current?.getBoundingClientRect().left ?? 0;
    // newViewRef is measured explicitly because it's absolutely positioned —
    // it doesn't expand switcherRef's own box, so it wouldn't be counted.
    const edges = [
      titleRef.current,
      switcherRef.current,
      newViewRef.current,
      libraryRef.current,
    ].map((el) => (el ? el.getBoundingClientRect().right - railLeft : 0));
    setOpenWidth(Math.ceil(Math.max(...edges, RAIL_CLOSED)) + 12);
  }, [open, thumbs.length, projectTitle, projectMeta, surfaces]);

  const renderSurface = (s: ProjectSurface) => {
    const active = s.id === activeSurface;
    return (
      <button
        type="button"
        onClick={() => onSurfaceSelect(s.id)}
        title={s.comingSoon ? `${s.label} — coming soon` : s.label}
        className={cn(
          "flex h-12 items-center gap-2 overflow-hidden rounded-[18px] py-2 pl-2 pr-5 transition-all duration-300",
          active
            ? "bg-[color:var(--surface-dark-7)]"
            : "hover:bg-[color:var(--surface-dark-7)]/60",
        )}
        // Collapsed: fixed 48px icon square. Expanded: width auto so the pill
        // hugs its label instead of filling the rail.
        style={{ width: open ? "auto" : 48 }}
      >
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center",
            active
              ? "text-[color:var(--content-dark-secondary)]"
              : "text-[color:var(--content-dark-quaternary)]",
          )}
        >
          {s.icon}
        </span>
        <span
          className={cn(
            "whitespace-nowrap text-[15px] font-medium leading-[18px] transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0",
            active
              ? "text-[color:var(--content-dark-secondary)]"
              : "text-[color:var(--content-dark-quaternary)]",
          )}
        >
          {s.label}
        </span>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-10 overflow-hidden text-foreground"
      style={{
        backgroundColor: "var(--surface-light-2)",
        backgroundImage: "linear-gradient(rgba(0,0,0,0.02), rgba(0,0,0,0.02))",
      }}
    >
      {/* --- Left rail (hover to expand) --- */}
      <div
        ref={railRef}
        className="absolute inset-y-0 left-0 z-30"
        style={{ width: open ? openWidth : RAIL_CLOSED }}
        onMouseEnter={enter}
        onMouseLeave={leave}
      >
        {/* Logo — leave the project. On hover (rail open) it crossfades to a
            back arrow to signal it's the way out. */}
        <button
          type="button"
          onClick={onLeaveProject}
          aria-label="Back to projects"
          title="Back to projects"
          className="absolute left-3 top-4 grid h-12 w-12 place-items-center rounded-2xl transition hover:bg-[color:var(--surface-dark-7)]"
        >
          <img
            src={chromeLogo}
            alt=""
            className={cn(
              "col-start-1 row-start-1 h-7 w-7 object-contain transition-opacity duration-200",
              open ? "opacity-0" : "opacity-100",
            )}
          />
          <ArrowLeft
            className={cn(
              "col-start-1 row-start-1 h-5 w-5 text-[color:var(--content-dark-secondary)] transition-opacity duration-200",
              open ? "opacity-100" : "opacity-0",
            )}
            aria-hidden
          />
        </button>

        {/* Project title + meta — always visible, floating at the top-left
            just past the logo (the rail floats over the full-page stage). */}
        <button
          ref={titleRef}
          type="button"
          onClick={onTitleClick}
          className="absolute left-[72px] top-6 flex flex-col items-start gap-1 text-left transition-all duration-300"
        >
          <span className="flex items-center gap-1">
            <span className="font-display max-w-[15rem] truncate text-[16px] font-medium leading-5 text-[color:var(--content-dark-secondary)]">
              {projectTitle || "Untitled project"}
            </span>
            <ChevronDown className="h-3 w-3 text-[color:var(--content-dark-secondary)]" />
          </span>
          <span className="flex items-center gap-2.5 whitespace-nowrap text-[12px] leading-4 text-[color:var(--content-dark-quaternary)]">
            {projectMeta.map((piece, i) => (
              <span key={`${piece}-${i}`} className="flex items-center gap-2.5">
                {i > 0 && <span aria-hidden>•</span>}
                <span>{piece}</span>
              </span>
            ))}
          </span>
        </button>

        {/* Surface switcher — vertically centered. Hidden while Main Stage is
            the only surface; it only earns its place once the project has an
            alternate view to switch to. */}
        {surfaces.length > 1 && (
        <div
          ref={switcherRef}
          className="absolute left-3 top-1/2 flex -translate-y-1/2 flex-col items-start gap-2"
        >
          {surfaces.filter((s) => !s.accent).map((s) => (
            <div key={s.id}>{renderSurface(s)}</div>
          ))}
          {/* "New View" affordance: only shows while the rail is open, and is
              positioned ABSOLUTELY below the in-flow surfaces so mounting it
              never changes the (vertically-centered) column height — otherwise
              the icons above would jump up when it appears. */}
          {open &&
            surfaces
              .filter((s) => s.accent)
              .map((s) => (
                <div
                  key={s.id}
                  ref={newViewRef}
                  className="absolute left-0 top-full flex flex-col items-start gap-2 pt-2"
                >
                  <span
                    aria-hidden
                    className="ml-2 h-px w-8 bg-[color:var(--surface-dark-5)]"
                  />
                  {renderSurface(s)}
                </div>
              ))}
        </div>
        )}

        {/* Library — bottom of the rail (Figma 27704-424131 / -425023).
            Empty: just the glyph. With assets: overlapping thumb stack +
            count badge. The "Library" label fades in when the rail opens. */}
        <div ref={libraryRef} className="absolute bottom-3 left-3 flex h-12 items-center gap-2">
          <span className="relative grid h-12 w-12 shrink-0 place-items-center">
            {assetCount > 0 ? (
              <>
                {/* 32×32 thumbs, 8px radius, both at the same top (top-2 =
                    (48-32)/2) so the stack is vertically aligned. */}
                {thumbs[1] && (
                  <img
                    src={thumbs[1]}
                    alt=""
                    className="absolute left-2 top-2 h-8 w-8 rounded-[8px] border border-[color:var(--surface-light-2)] object-cover"
                  />
                )}
                {thumbs[0] ? (
                  <img
                    src={thumbs[0]}
                    alt=""
                    className="absolute left-0 top-2 h-8 w-8 rounded-[8px] border border-[color:var(--surface-light-2)] object-cover"
                  />
                ) : (
                  // Non-image assets only (nothing an <img> can draw) — keep
                  // the glyph behind the count badge.
                  <span className="text-[color:var(--content-dark-quaternary)]">
                    <LibraryGlyph />
                  </span>
                )}
                <span className="absolute right-0 top-4 flex h-4 min-w-4 items-center justify-center rounded-full border border-[color:var(--surface-dark-5)] bg-[color:var(--surface-light-1)] px-1 text-[10px] font-medium leading-none text-[color:var(--content-dark-primary)]">
                  {assetCount}
                </span>
              </>
            ) : (
              <span className="text-[color:var(--content-dark-quaternary)]">
                <LibraryGlyph />
              </span>
            )}
          </span>
          <span
            className={cn(
              "whitespace-nowrap text-[15px] font-medium leading-[18px] text-[color:var(--content-dark-quaternary)] transition-opacity duration-200",
              open ? "opacity-100" : "opacity-0",
            )}
          >
            Library
          </span>
        </div>
      </div>

      {/* --- Main stage — full page. The rail floats on top of it (z-30);
          the stage no longer lives in an inset wrapper, so hovering the rail
          never pushes or resizes the content. --- */}
      <div className="absolute inset-0 z-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** 20px library glyph (stacked shelves) — matches the figma's library-line. */
function LibraryGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 3.5v13M8 3.5v13M12.2 4.2l4.3 12.1" />
    </svg>
  );
}

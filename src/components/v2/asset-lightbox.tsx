// Reusable fullscreen lightbox for viewing a single asset (image / video /
// audio) with metadata. Used by the Library grid and the Outputs panel.
//
// Style mirrors the "Made with Pika" lightbox on the logged-out home: black
// overlay, large media area, meta panel to the side.

import { useEffect } from "react";
import { Download, Heart, X } from "lucide-react";
import { AudioPlayer } from "@/components/v2/audio-player";
import { cn } from "@/lib/utils";

export type LightboxAsset = {
  id: string;
  url: string;
  mime: string;
  name: string;
  label?: string;
  projectTitle?: string;
  kind?: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  createdAt?: string | null;
};

function fmtDuration(sec?: number | null): string | null {
  if (!sec || !Number.isFinite(sec)) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function kindLabel(asset: LightboxAsset): string {
  if (asset.mime.startsWith("image/")) return "Image";
  if (asset.mime.startsWith("video/")) return "Video";
  if (asset.mime.startsWith("audio/")) return "Audio";
  return asset.kind ?? "File";
}

export function AssetLightbox({
  asset,
  onClose,
  isFavorite,
  onToggleFavorite,
}: {
  asset: LightboxAsset | null;
  onClose: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  useEffect(() => {
    if (!asset) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [asset, onClose]);

  if (!asset) return null;

  const isImage = asset.mime.startsWith("image/");
  const isVideo = asset.mime.startsWith("video/");
  const isAudio = asset.mime.startsWith("audio/");
  const title = asset.label || asset.name || "Asset";
  const dur = fmtDuration(asset.duration);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="flex max-h-full w-full max-w-6xl flex-col items-stretch gap-6 md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Media */}
        <div
          className="relative mx-auto flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black shadow-2xl"
          style={{ maxHeight: "85vh" }}
        >
          {isImage && (
            <img
              src={asset.url}
              alt={title}
              className="block max-h-[85vh] w-auto max-w-full object-contain"
            />
          )}
          {isVideo && (
            <video
              src={asset.url}
              autoPlay
              controls
              loop
              playsInline
              className="block max-h-[85vh] w-auto max-w-full object-contain"
            />
          )}
          {isAudio && (
            <div className="w-full max-w-xl p-8">
              <AudioPlayer src={asset.url} title={title} />
            </div>
          )}
          {!isImage && !isVideo && !isAudio && (
            <div className="grid h-64 w-full place-items-center text-white/60">
              No preview available
            </div>
          )}
        </div>

        {/* Meta panel */}
        <div className="w-full shrink-0 self-center text-white md:w-80">
          {asset.projectTitle && (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
              {asset.projectTitle}
            </p>
          )}
          <h3 className="mt-3 font-display text-2xl leading-tight">{title}</h3>

          <dl className="mt-6 space-y-3 text-sm">
            <Row label="Type" value={kindLabel(asset)} />
            {asset.width && asset.height && (
              <Row label="Dimensions" value={`${asset.width} × ${asset.height}`} />
            )}
            {dur && <Row label="Duration" value={dur} />}
            {asset.createdAt && (
              <Row
                label="Created"
                value={new Date(asset.createdAt).toLocaleDateString()}
              />
            )}
            <Row label="File" value={asset.name} mono />
          </dl>

          <div className="mt-6 flex items-center gap-2">
            <a
              href={asset.url}
              download
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-xs font-medium text-black transition hover:bg-white/90"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
            {onToggleFavorite && (
              <button
                type="button"
                onClick={onToggleFavorite}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white transition hover:bg-white/10"
              >
                <Heart
                  className={cn(
                    "h-4 w-4",
                    isFavorite ? "fill-rose-500 text-rose-500" : "text-white",
                  )}
                />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-2">
      <dt className="text-xs uppercase tracking-wider text-white/50">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right text-white",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

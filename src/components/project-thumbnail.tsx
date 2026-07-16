import { useState, type CSSProperties } from "react";
import { Film } from "lucide-react";

import { BrandMark } from "@/components/pika-mark";
import { cn } from "@/lib/utils";

type ProjectThumbnailProps = {
  url?: string | null;
  kind?: "image" | "video" | null;
  title?: string | null;
  className?: string;
  placeholderClassName?: string;
  iconClassName?: string;
  brand?: boolean;
  style?: CSSProperties;
};

export function ProjectThumbnail({
  url,
  kind,
  title,
  className,
  placeholderClassName,
  iconClassName,
  brand = false,
  style,
}: ProjectThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const mediaKind = kind ?? (url && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ? "video" : "image");

  if (!url || failed) {
    return (
      <div
        style={style}
        className={cn(
          "grid place-items-center bg-muted text-muted-foreground",
          className,
          placeholderClassName,
        )}
      >
        {brand ? (
          <BrandMark className={cn("opacity-15", iconClassName)} />
        ) : (
          <Film className={cn("h-6 w-6", iconClassName)} />
        )}
      </div>
    );
  }

  if (mediaKind === "video") {
    // Append a media-fragment hint so browsers paint the first frame as a
    // poster instead of a black box. Only add it if the URL doesn't already
    // have its own fragment.
    const videoSrc = url.includes("#") ? url : `${url}#t=0.1`;
    return (
      <video
        src={videoSrc}
        style={style}
        preload="metadata"
        muted
        playsInline
        onError={() => setFailed(true)}
        className={cn("bg-muted object-cover", className)}
      />
    );
  }


  return (
    <img
      src={url}
      style={style}
      alt={title || "Project thumbnail"}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("bg-muted object-cover", className)}
    />
  );
}
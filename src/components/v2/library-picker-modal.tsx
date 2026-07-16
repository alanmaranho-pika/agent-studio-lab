import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { listLibraryAssets } from "@/lib/library.functions";
import { cn } from "@/lib/utils";

type Kind = "image" | "video" | "audio" | "any";

type LibraryItem = {
  id: string;
  projectId: string;
  projectTitle: string;
  kind: string;
  mime: string;
  name: string;
  url: string;
  thumbUrl?: string;
  label: string | null;
  createdAt: string;
};

function matchesKind(item: LibraryItem, kind: Kind): boolean {
  if (kind === "any") return true;
  if (kind === "image") return item.mime.startsWith("image/");
  if (kind === "video") return item.mime.startsWith("video/");
  if (kind === "audio") return item.mime.startsWith("audio/");
  return true;
}

export function LibraryPickerModal({
  open,
  onClose,
  onPick,
  accept = "any",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: LibraryItem) => void;
  accept?: Kind;
}) {
  const fetchLib = useServerFn(listLibraryAssets);
  const [tab, setTab] = useState<"all" | "refs">("all");
  const q = useQuery({
    queryKey: ["v2-library-picker"],
    queryFn: () => fetchLib(),
    enabled: open,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (!open) return null;

  const pool: LibraryItem[] = [
    ...(q.data?.generations ?? []),
    ...(q.data?.references ?? []),
  ];
  const filtered = pool.filter((i) => matchesKind(i, accept));
  const visible =
    tab === "refs"
      ? filtered.filter((i) => (q.data?.references ?? []).some((r) => r.id === i.id))
      : filtered;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-hairline bg-card shadow-elegant"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Pick from Library
            </h2>
            <p className="text-xs text-muted-foreground">
              {accept === "any"
                ? "All assets"
                : `${accept.charAt(0).toUpperCase() + accept.slice(1)} only`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-hairline p-0.5 text-xs">
              {(["all", "refs"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-full px-3 py-1 transition",
                    tab === t
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t === "all" ? "All" : "References"}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {q.isLoading ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              No matching assets.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {visible.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onPick(item);
                    onClose();
                  }}
                  className="group overflow-hidden rounded-xl border border-hairline bg-background text-left transition hover:bg-muted/40 hover:shadow-md"
                >
                  <div className="aspect-square w-full bg-muted/40">
                    {item.mime.startsWith("image/") ? (
                      <img
                        src={item.thumbUrl ?? item.url}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : item.mime.startsWith("video/") ? (
                      <video
                        src={item.url}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        preload="none"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-3xl text-muted-foreground">
                        {item.mime.startsWith("audio/") ? "♪" : "•"}
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <div className="truncate text-xs font-medium text-foreground">
                      {item.label || item.name}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {item.projectTitle}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Folder, Plus, Trash2 } from "lucide-react";
import { BrandMark } from "@/components/pika-mark";
import { ProjectThumbnail } from "@/components/project-thumbnail";
import {
  listProjects,
  createProject,
  deleteProject,
  useLocalProjectFn,
} from "@/lib/local-projects";

export const Route = createFileRoute("/_authenticated/projects")({
  ssr: false,
  loader: ({ context }) => {
    // Start the first-page fetch as soon as the URL matches, in parallel
    // with the component JS finishing hydration.
    void context.queryClient.prefetchInfiniteQuery({
      queryKey: ["projects-list"],
      queryFn: () => listProjects({ data: { limit: 24 } }),
      initialPageParam: null as string | null,
    });
  },
  component: ProjectsPage,
  errorComponent: ProjectsError,
});

function ProjectsError({ reset }: { reset: () => void }) {
  const queryClient = useQueryClient();
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Projects didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This can happen right after a slow sign-in. Try again.
        </p>
        <button
          onClick={async () => {
            await queryClient.resetQueries({ queryKey: ["projects-list"] });
            reset();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

// "Updated 2min ago" — compact relative time for the card meta line (Figma:
// 2min / 10min / 6h / 20d).
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---------- Thumb fan ----------
// Cards show their latest stills as a fan of tilted mini-frames hanging off
// the top-right corner (geometry lifted from the Figma presets for 3 / 2 / 1
// thumbs; 0 thumbs shows a tilted placeholder tile with the brand mark).
// Each entry is the rotated tile's bounding box (right/top/width/height in
// card px) + the unrotated tile size + rotation; DOM order is back→front.

type FanTile = {
  right: number;
  top: number;
  w: number;
  h: number;
  tileW: number;
  tileH: number;
  rot: number;
};

const FAN_3: FanTile[] = [
  { right: -28.5, top: -1, w: 125.8, h: 114.8, tileW: 107, tileH: 92, rot: 13.79 },
  { right: 39.5, top: 13, w: 121.5, h: 109.4, tileW: 107, tileH: 92, rot: -10.12 },
  { right: 14.9, top: 25.7, w: 116.1, h: 102.8, tileW: 107, tileH: 92, rot: 6.08 },
];
const FAN_2: FanTile[] = [
  { right: -28.5, top: 0, w: 127.4, h: 116.8, tileW: 107, tileH: 92, rot: 15.18 },
  { right: 21.8, top: 23.7, w: 116.1, h: 102.8, tileW: 107, tileH: 92, rot: 6.08 },
];
const FAN_1: FanTile[] = [
  { right: 7.5, top: 4, w: 120.5, h: 143.4, tileW: 107, tileH: 132.8, rot: 6.08 },
];
const FAN_EMPTY: FanTile = {
  right: 9.9,
  top: 7,
  w: 116.8,
  h: 140.5,
  tileW: 107,
  tileH: 132.8,
  rot: 4.35,
};

// Stable pseudo-random angle in (−1, 1) deg, seeded by a string so a given
// tile always resolves to the SAME messy angle across renders/hovers (no
// jitter) while different tiles/cards land differently.
function seededHoverRot(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return +(((h >>> 0) % 2000) / 1000 - 1).toFixed(2); // [-1, 1)
}

function ThumbFan({ urls, videoUrl }: { urls: string[]; videoUrl?: string | null }) {
  // Fall back to the project's (possibly video) thumbnail when no stills
  // exist yet, so a video-only project still shows one tile.
  const tiles = urls.length ? urls : videoUrl ? [videoUrl] : [];
  if (!tiles.length) {
    return (
      <FanFrame tile={FAN_EMPTY} seed="empty">
        <div
          className="grid h-full w-full place-items-center rounded-[24px] border"
          style={{
            background: "var(--surface-dark-7)",
            borderColor: "var(--surface-light-2)",
          }}
        >
          <BrandMark className="h-8 w-8 opacity-30" />
        </div>
      </FanFrame>
    );
  }
  const preset = tiles.length >= 3 ? FAN_3 : tiles.length === 2 ? FAN_2 : FAN_1;
  // Back tile first in DOM (paints underneath); front tile = newest still.
  const ordered = tiles.slice(0, preset.length).reverse();
  return (
    <>
      {ordered.map((url, i) => (
        <FanFrame key={`${url}-${i}`} tile={preset[i]} seed={`${url}-${i}`}>
          <ProjectThumbnail
            url={url}
            className="h-full w-full rounded-[24px] border object-cover"
            style={{ borderColor: "var(--surface-light-2)" }}
          />
        </FanFrame>
      ))}
    </>
  );
}

function FanFrame({
  tile,
  seed,
  children,
}: {
  tile: FanTile;
  seed: string;
  children: React.ReactNode;
}) {
  // On card hover the fan relaxes toward a looser, near-flat stack — each tile
  // eases to its own stable random angle within ±1°, so it stays messy rather
  // than snapping to a uniform lean.
  const rotHover = seededHoverRot(seed);
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{ right: tile.right, top: tile.top, width: tile.w, height: tile.h }}
    >
      <div
        className="flex-none overflow-hidden rounded-[24px] transition-transform duration-300 ease-out [transform:rotate(var(--tile-rot))] group-hover:[transform:rotate(var(--tile-rot-hover))]"
        style={
          {
            width: tile.tileW,
            height: tile.tileH,
            "--tile-rot": `${tile.rot}deg`,
            "--tile-rot-hover": `${rotHover}deg`,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

// Pill button per the Figma Button/56 component: 56px tall, 18px radius,
// plus icon + Telka Medium 17px label.
function NewProjectButton({
  onClick,
  disabled,
  variant,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant: "accent" | "dark";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-14 shrink-0 items-center justify-center gap-1 rounded-[var(--radius-lg)] px-4 transition hover:opacity-90 disabled:opacity-50"
      style={
        variant === "accent"
          ? { background: "rgba(207,195,255,0.2)", color: "var(--content-accent-darkened)" }
          : { background: "var(--surface-dark-1)", color: "var(--content-light-primary, #fff)" }
      }
    >
      <Plus className="h-5 w-5" />
      <span
        className="px-1 text-[17px] font-medium leading-[17px]"
        style={{ fontFamily: '"Telka", system-ui, sans-serif' }}
      >
        New Project
      </span>
    </button>
  );
}

function ProjectsPage() {
  const navigate = useNavigate();
  const fetchList = useLocalProjectFn(listProjects);
  const createNew = useLocalProjectFn(createProject);
  const remove = useLocalProjectFn(deleteProject);
  const queryClient = useQueryClient();

  const q = useInfiniteQuery({
    queryKey: ["projects-list"],
    queryFn: ({ pageParam }) => fetchList({ data: { limit: 24, cursor: pageParam ?? undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? null,
  });

  const createMut = useMutation({
    mutationFn: (id: string) => createNew({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects-list"] });
    },
    onError: () => {
      // If create failed, get the user back to the projects list.
      void navigate({ to: "/projects" });
    },
  });

  const handleCreate = async () => {
    const id = crypto.randomUUID();
    // Await the create so the row exists before we navigate — otherwise the
    // studio loader fetches a not-yet-committed project (retry: false) and
    // redirects straight back to /projects.
    try {
      await createMut.mutateAsync(id);
    } catch {
      return; // createMut.onError already bounces the user back to the list
    }
    void navigate({ to: "/studio/$projectId", params: { projectId: id } });
  };

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects-list"] }),
  });

  const projects = (q.data?.pages ?? []).flatMap((p) => p.projects);
  const isEmpty = !q.isLoading && projects.length === 0;

  // Infinite scroll sentinel.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) {
          void q.fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage]);

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground">
      <div className="flex h-full flex-1 flex-col overflow-hidden">
        <header className="px-8 pb-4 pt-6">
          <div className="mx-auto flex w-full max-w-[1112px] items-center justify-between gap-4">
            <h1
              className="font-display text-[22px] font-medium leading-none tracking-normal"
              style={{ color: "var(--content-dark-primary)" }}
            >
              Projects
            </h1>
            <NewProjectButton
              onClick={handleCreate}
              disabled={createMut.isPending}
              variant="accent"
            />
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          <div className="h-full overflow-y-auto px-8 pb-8 pt-4">
            {isEmpty ? (
              /* Blank state — centered dashed tile + display heading + dark CTA. */
              <div className="grid h-full place-items-center">
                <div className="flex w-full max-w-[662px] flex-col items-center gap-[26px] pb-16">
                  <div
                    className="rounded-[24px] border border-dashed p-6"
                    style={{
                      background: "var(--surface-dark-7)",
                      borderColor: "var(--surface-dark-5)",
                    }}
                  >
                    <Folder
                      className="h-8 w-8"
                      strokeWidth={1.5}
                      style={{ color: "var(--content-dark-secondary)" }}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-3 text-center">
                    <h2
                      className="font-display text-[32px] font-medium leading-none tracking-normal"
                      style={{ color: "var(--content-dark-primary)" }}
                    >
                      No Projects yet
                    </h2>
                    <p
                      className="text-[15px] leading-[18px]"
                      style={{
                        fontFamily: '"Telka", system-ui, sans-serif',
                        color: "var(--content-dark-tertiary)",
                      }}
                    >
                      Every project you work on will be listed here.{" "}
                      <Link
                        to="/studio"
                        className="underline-offset-4 hover:underline"
                      >
                        Start creating now!
                      </Link>
                    </p>
                  </div>
                  <NewProjectButton
                    onClick={handleCreate}
                    disabled={createMut.isPending}
                    variant="dark"
                  />
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-[1112px]">
                {q.isLoading && (
                  <div className="p-6 text-sm text-muted-foreground">Loading…</div>
                )}

                <div className="flex flex-wrap gap-2">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className="group relative h-[326px] w-[272px] overflow-hidden rounded-[24px] border transition hover:shadow-sm"
                      style={{
                        background: "var(--surface-light-1)",
                        borderColor: "var(--surface-dark-6)",
                      }}
                    >
                      <Link
                        to="/studio/$projectId"
                        params={{ projectId: p.id }}
                        className="block h-full w-full"
                      >
                        <ThumbFan
                          urls={(p.mediaUrls ?? []).slice(0, 3)}
                          videoUrl={p.thumbnailUrl}
                        />
                        {/* Bottom-anchored title + meta */}
                        <div className="absolute bottom-[31px] left-[31px] flex w-[208px] flex-col gap-2">
                          <div
                            className="font-display line-clamp-4 break-words text-[28px] font-medium leading-none tracking-normal"
                            style={{ color: "var(--content-dark-secondary)" }}
                          >
                            {p.title}
                          </div>
                          <div
                            className="flex items-center gap-[10px] whitespace-nowrap text-[12px] leading-4"
                            style={{
                              fontFamily: '"Telka", system-ui, sans-serif',
                              color: "var(--content-dark-tertiary)",
                            }}
                          >
                            <span>
                              {p.sceneCount} Shot{p.sceneCount === 1 ? "" : "s"}
                            </span>
                            <span aria-hidden>•</span>
                            <span>Updated {timeAgo(p.updatedAt)}</span>
                          </div>
                        </div>
                      </Link>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${p.title}"? This cannot be undone.`))
                            deleteMut.mutate(p.id);
                        }}
                        aria-label="Delete project"
                        className="absolute left-3 top-3 hidden h-8 w-8 place-items-center rounded-full bg-white/80 text-muted-foreground backdrop-blur hover:text-destructive group-hover:grid"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {q.hasNextPage && (
                  <div
                    ref={sentinelRef}
                    className="mt-8 flex justify-center py-6 text-sm text-muted-foreground"
                  >
                    {q.isFetchingNextPage ? "Loading more…" : ""}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent" />
        </div>
      </div>
    </div>
  );
}

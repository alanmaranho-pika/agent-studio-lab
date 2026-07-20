import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Film, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectThumbnail } from "@/components/project-thumbnail";
import logoUrl from "@/assets/logo.png";
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

function ProjectsPage() {
  const navigate = useNavigate();
  const fetchList = useLocalProjectFn(listProjects);
  const createNew = useLocalProjectFn(createProject);
  const remove = useLocalProjectFn(deleteProject);
  const queryClient = useQueryClient();

  const q = useInfiniteQuery({
    queryKey: ["projects-list"],
    queryFn: ({ pageParam }) =>
      fetchList({ data: { limit: 24, cursor: pageParam ?? undefined } }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["projects-list"] }),
  });

  const projects = (q.data?.pages ?? []).flatMap((p) => p.projects);

  // Infinite scroll sentinel.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) {
        void q.fetchNextPage();
      }
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-screen flex-1 flex-col overflow-hidden">
        <header className="px-8 pb-4 pt-6">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src={logoUrl}
                alt="Logo"
                className="h-10 w-10 object-contain"
              />
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Projects
              </h1>
            </div>
            <Button
              onClick={handleCreate}
              disabled={createMut.isPending}
              className="shrink-0 rounded-full bg-yellow-400 px-5 text-xs font-semibold text-black shadow-none hover:bg-yellow-300 hover:shadow-none"
            >
              New Project
            </Button>
          </div>
        </header>

        <div className="relative flex-1 min-h-0">
          <div className="h-full overflow-y-auto px-8 pb-8 pt-4">
            <div className="mx-auto w-full max-w-6xl">
              {q.isLoading && (
                <div className="p-6 text-sm text-muted-foreground">Loading…</div>
              )}
              {!q.isLoading && projects.length === 0 && (
                <div className="rounded-3xl border border-dashed border-border bg-card/40 p-12 text-center">
                  <Film className="mx-auto h-8 w-8 text-muted-foreground" />
                  <h2
                    className="mt-4"
                    style={{ fontFamily: '"Telka Extended", "Telka", system-ui, sans-serif', fontWeight: 400, fontSize: 40, lineHeight: 1.1 }}
                  >
                    No projects yet
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Head to{" "}
                    <Link
                      to="/studio"
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      Apps
                    </Link>{" "}
                    to get started.
                  </p>
                </div>
              )}

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="group relative overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/50 hover:shadow-glow"
                  >
                    <Link
                      to="/studio/$projectId"
                      params={{ projectId: p.id }}
                      className="block"
                    >
                      <ProjectThumbnail
                        url={p.thumbnailUrl}
                        kind={p.thumbnailKind}
                        title={p.title}
                        className="aspect-video w-full object-cover"
                        iconClassName="h-12 w-12"
                        brand
                      />
                      <div className="p-4">
                        <div className="truncate text-base font-semibold">
                          {p.title}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {p.sceneCount} shot{p.sceneCount === 1 ? "" : "s"} · updated{" "}
                          {new Date(p.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </Link>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${p.title}"? This cannot be undone.`))
                          deleteMut.mutate(p.id);
                      }}
                      aria-label="Delete project"
                      className="absolute right-2 top-2 hidden h-8 w-8 place-items-center rounded-full bg-background/80 text-muted-foreground hover:text-destructive group-hover:grid"
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
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent" />
        </div>
      </div>
    </div>
  );
}

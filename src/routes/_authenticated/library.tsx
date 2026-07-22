import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Download,
  FileText,
  Loader2,
  Music2,
  Plus,
  Search,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { listLibrary } from "@/lib/library.functions";
import { listCharacters, type LibraryCharacter } from "@/lib/characters.functions";
import {
  listLibrarySubjects,
  type LibrarySubject,
  type LibrarySubjectKind,
} from "@/lib/library-subjects.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/library")({
  component: LibraryPage,
});

const TELKA = '"Telka", system-ui, sans-serif';

type LibraryTab = "assets" | "characters" | "elements";

// ---------- Small design-system pieces (Figma Button/32, Badge, empty state) ----------

/** 32px chip button per the Figma Button/32 component. */
function Chip({
  label,
  active,
  onClick,
  icon,
  variant = "outline",
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  /** outline = white + hairline; dark = #222; accent = lavender tint. */
  variant?: "outline" | "dark" | "accent";
}) {
  const styles: React.CSSProperties =
    active || variant === "dark"
      ? { background: "var(--surface-dark-1)", color: "#fff" }
      : variant === "accent"
        ? { background: "rgba(207,195,255,0.2)", color: "var(--content-accent-darkened)" }
        : {
            background: "var(--surface-light-1)",
            border: "1px solid var(--surface-dark-6)",
            color: "var(--content-dark-secondary)",
          };
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 shrink-0 items-center justify-center gap-1 rounded-[12px] px-2 text-[12px] font-medium leading-3 transition hover:opacity-80"
      style={{ ...styles, fontFamily: TELKA }}
    >
      {icon}
      <span className="px-1">{label}</span>
    </button>
  );
}

/** Count badge next to a section title. */
function CountBadge({ n }: { n: number }) {
  return (
    <span
      className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-medium leading-4"
      style={{
        background: "var(--surface-dark-6)",
        color: "var(--content-dark-tertiary)",
        fontFamily: TELKA,
      }}
    >
      {n}
    </span>
  );
}

/** Centered blank-state: icon tile + display heading + sub + dark CTA. */
function EmptyState({
  icon,
  title,
  subtitle,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: React.ReactNode;
  cta: { label: string; to: string };
}) {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex w-full max-w-[662px] flex-col items-center gap-[26px] pb-16">
        <div
          className="rounded-[24px] border border-dashed p-6"
          style={{ background: "var(--surface-dark-7)", borderColor: "var(--surface-dark-5)" }}
        >
          {icon}
        </div>
        <div className="flex flex-col items-center gap-3 text-center">
          <h2
            className="font-display text-[32px] font-medium leading-none tracking-normal"
            style={{ color: "var(--content-dark-primary)" }}
          >
            {title}
          </h2>
          <p
            className="text-[15px] leading-[18px]"
            style={{ fontFamily: TELKA, color: "var(--content-dark-tertiary)" }}
          >
            {subtitle}
          </p>
        </div>
        <Link
          to={cta.to}
          className="flex h-14 shrink-0 items-center justify-center gap-1 rounded-[var(--radius-lg)] px-4 text-white transition hover:opacity-90"
          style={{ background: "var(--surface-dark-1)" }}
        >
          <Plus className="h-5 w-5" />
          <span className="px-1 text-[17px] font-medium leading-[17px]" style={{ fontFamily: TELKA }}>
            {cta.label}
          </span>
        </Link>
      </div>
    </div>
  );
}

// ---------- Page ----------

function LibraryPage() {
  const [tab, setTab] = useState<LibraryTab>("assets");

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground">
      <div className="flex h-full flex-1 flex-col overflow-hidden">
        {/* Tab bar — Telka Extended 22, active = underline, inactive 50%. */}
        <header className="px-8 pt-6">
          <div
            className="mx-auto flex h-12 w-full max-w-[1112px] items-center gap-12 border-b"
            style={{ borderColor: "var(--surface-dark-6)" }}
          >
            {(
              [
                ["assets", "Assets"],
                ["characters", "Characters"],
                ["elements", "Elements"],
              ] as Array<[LibraryTab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "-mb-px flex h-12 items-center font-display text-[22px] font-medium leading-none tracking-normal transition",
                  tab === id ? "border-b" : "opacity-50 hover:opacity-75",
                )}
                style={{
                  color: "var(--content-dark-primary)",
                  borderColor: tab === id ? "var(--surface-dark-1)" : undefined,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          <div className="h-full overflow-y-auto px-8 pb-8 pt-8">
            <div className="mx-auto h-full w-full max-w-[1112px]">
              {tab === "assets" && <AssetsTab />}
              {tab === "characters" && <CharactersTab />}
              {tab === "elements" && <ElementsTab />}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent" />
        </div>
      </div>
    </div>
  );
}

// ---------- Assets ----------

type Item = {
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

const REFERENCE_KINDS = new Set(["reference", "likeness", "logo", "voice"]);

type AssetFilter = "all" | "images" | "videos" | "audios" | "references" | "exports";

const ASSET_FILTERS: Array<[AssetFilter, string]> = [
  ["all", "All"],
  ["images", "Images"],
  ["videos", "Videos"],
  ["audios", "Audios"],
  ["references", "References"],
  ["exports", "Exports"],
];

function AssetsTab() {
  const fetchLib = useServerFn(listLibrary);
  const q = useQuery({
    queryKey: ["library"],
    queryFn: () => fetchLib(),
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });

  // Refetch whenever any render_job row changes for this user.
  useEffect(() => {
    const client = getBrowserSupabase();
    if (!client) return;
    const channel = client
      .channel("library-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "render_jobs" }, () => {
        void q.refetch();
      })
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filter, setFilter] = useState<AssetFilter>("all");
  const [search, setSearch] = useState("");

  const data = q.data ?? { references: [], generations: [], queue: [], exports: [] };

  // Exports become plain items so they slot into the same grouped grid.
  const exportItems: Item[] = (data.exports ?? [])
    .filter((e) => e.status === "done" && e.outputUrl)
    .map((e) => ({
      id: e.id,
      projectId: e.projectId,
      projectTitle: e.projectTitle,
      kind: "export",
      mime: e.format === "mp3" ? "audio/mpeg" : e.format === "gif" ? "image/gif" : "video/mp4",
      name: `export.${e.format}`,
      url: e.outputUrl!,
      label: `Export · ${e.format}`,
      createdAt: e.createdAt,
    }));

  const allItems: Item[] = [...data.generations, ...data.references, ...exportItems];

  const filtered = useMemo(() => {
    let items = allItems;
    if (filter === "images") items = items.filter((i) => i.mime.startsWith("image/") && !REFERENCE_KINDS.has(i.kind) && i.kind !== "export");
    else if (filter === "videos") items = items.filter((i) => i.mime.startsWith("video/") && i.kind !== "export");
    else if (filter === "audios") items = items.filter((i) => i.mime.startsWith("audio/") && i.kind !== "export");
    else if (filter === "references") items = items.filter((i) => REFERENCE_KINDS.has(i.kind));
    else if (filter === "exports") items = items.filter((i) => i.kind === "export");
    const needle = search.trim().toLowerCase();
    if (needle) {
      items = items.filter((i) =>
        [i.label ?? "", i.name, i.projectTitle].some((s) => s.toLowerCase().includes(needle)),
      );
    }
    return items;
  }, [allItems, filter, search]);

  // Group by project, newest asset first within and across groups.
  const groups = useMemo(() => {
    const byProject = new Map<string, { title: string; items: Item[] }>();
    for (const it of filtered) {
      const g = byProject.get(it.projectId) ?? { title: it.projectTitle, items: [] };
      g.items.push(it);
      byProject.set(it.projectId, g);
    }
    return [...byProject.entries()].map(([projectId, g]) => ({ projectId, ...g }));
  }, [filtered]);

  const isEmpty = !q.isLoading && allItems.length === 0;

  if (isEmpty) {
    return (
      <EmptyState
        icon={<FileText className="h-8 w-8" strokeWidth={1.5} style={{ color: "var(--content-dark-secondary)" }} />}
        title="No assets yet"
        subtitle="Every asset you create or upload will be shown here. Start creating now!"
        cta={{ label: "New Asset", to: "/studio" }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-12">
      {/* Filter chips + search */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1">
          {ASSET_FILTERS.map(([id, label]) => (
            <Chip key={id} label={label} active={filter === id} onClick={() => setFilter(id)} />
          ))}
        </div>
        <label
          className="flex h-8 shrink-0 items-center gap-1 rounded-[12px] px-2"
          style={{ background: "var(--surface-dark-6)" }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--content-dark-secondary)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Library..."
            className="w-32 bg-transparent px-1 text-[12px] font-medium leading-3 outline-none placeholder:opacity-50"
            style={{ fontFamily: TELKA, color: "var(--content-dark-secondary)" }}
          />
        </label>
      </div>

      {/* In-flight queue (live renders) — kept from the old page, restyled. */}
      {data.queue.length > 0 && (
        <div className="flex flex-col gap-2">
          <div
            className="flex items-center gap-2 text-[12px] font-medium"
            style={{ fontFamily: TELKA, color: "var(--content-dark-tertiary)" }}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering · {data.queue.length} active
          </div>
        </div>
      )}

      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!q.isLoading && filtered.length === 0 && (
        <p className="text-[15px]" style={{ fontFamily: TELKA, color: "var(--content-dark-tertiary)" }}>
          Nothing matches this filter.
        </p>
      )}

      {/* Grouped by project */}
      <div className="flex flex-col gap-12">
        {groups.map((g) => (
          <section key={g.projectId} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Link
                to="/studio/$projectId"
                params={{ projectId: g.projectId }}
                className="text-[15px] font-medium leading-[18px] hover:underline"
                style={{ fontFamily: TELKA, color: "var(--content-dark-secondary)" }}
              >
                {g.title}
              </Link>
              <CountBadge n={g.items.length} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {g.items.map((it) => (
                <AssetTile key={it.id} item={it} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** 179px square media tile (Figma asset tile). */
function AssetTile({ item }: { item: Item }) {
  const isImage = item.mime.startsWith("image/");
  const isVideo = item.mime.startsWith("video/");
  const isAudio = item.mime.startsWith("audio/");
  return (
    <div
      className="group relative size-[179px] overflow-hidden rounded-[12px]"
      style={{ background: "var(--surface-light-1)" }}
      title={item.label ?? item.name}
    >
      {isImage && (
        <img
          src={item.thumbUrl ?? item.url}
          alt={item.label ?? item.name}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      )}
      {isVideo && (
        <video
          src={item.url}
          muted
          loop
          playsInline
          preload="metadata"
          onMouseEnter={(e) => void (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
          onMouseLeave={(e) => (e.currentTarget as HTMLVideoElement).pause()}
          className="h-full w-full object-cover"
        />
      )}
      {isAudio && (
        <div className="grid h-full w-full place-items-center">
          <Music2 className="h-6 w-6" style={{ color: "var(--content-accent-darkened)" }} />
        </div>
      )}
      {!isImage && !isVideo && !isAudio && (
        <div className="grid h-full w-full place-items-center">
          <FileText className="h-6 w-6" style={{ color: "var(--content-dark-tertiary)" }} />
        </div>
      )}
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        download={item.name}
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/80 text-muted-foreground opacity-0 backdrop-blur transition hover:text-foreground group-hover:opacity-100"
        aria-label="Download"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

// ---------- Characters ----------

function CharactersTab() {
  const fetchChars = useServerFn(listCharacters);
  const q = useQuery({
    queryKey: ["library-characters"],
    queryFn: () => fetchChars(),
    retry: false, // table may not exist in this environment — treat as empty
  });
  const characters: LibraryCharacter[] = q.isError ? [] : (q.data ?? []);

  if (!q.isLoading && characters.length === 0) {
    return (
      <EmptyState
        icon={<UserRound className="h-8 w-8" strokeWidth={1.5} style={{ color: "var(--content-dark-secondary)" }} />}
        title="No characters yet"
        subtitle="Create one to reuse across your projects."
        cta={{ label: "New Character", to: "/studio" }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          to="/studio"
          className="inline-flex h-8 items-center justify-center gap-1 rounded-[12px] px-2 text-[12px] font-medium leading-3 transition hover:opacity-80"
          style={{
            background: "rgba(207,195,255,0.2)",
            color: "var(--content-accent-darkened)",
            fontFamily: TELKA,
          }}
        >
          <UserRoundPlus className="h-4 w-4" />
          <span className="px-1">New Character</span>
        </Link>
      </div>
      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <div className="flex flex-wrap gap-2">
        {characters.map((c) => (
          <SubjectCard
            key={c.id}
            imageUrl={c.imageUrl}
            name={c.name}
            meta={c.voiceLabel ?? c.description ?? ""}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Elements ----------

const ELEMENT_FILTERS: Array<[LibrarySubjectKind | "all", string]> = [
  ["all", "All"],
  ["character", "Characters"],
  ["product", "Products"],
  ["scene", "Scenes"],
  ["logo", "Logos"],
  ["brand_asset", "Brand Assets"],
];

const KIND_LABEL: Record<LibrarySubjectKind, string> = {
  character: "Character",
  product: "Product",
  scene: "Scene",
  logo: "Logo",
  brand_asset: "Brand Asset",
};

function ElementsTab() {
  const fetchSubjects = useServerFn(listLibrarySubjects);
  const q = useQuery({
    queryKey: ["library-subjects"],
    queryFn: () => fetchSubjects({ data: {} }),
    retry: false, // table may not exist in this environment — treat as empty
  });
  const subjects: LibrarySubject[] = q.isError ? [] : (q.data ?? []);
  const [filter, setFilter] = useState<LibrarySubjectKind | "all">("all");

  if (!q.isLoading && subjects.length === 0) {
    return (
      <EmptyState
        icon={<Copy className="h-8 w-8" strokeWidth={1.5} style={{ color: "var(--content-dark-secondary)" }} />}
        title="No elements yet"
        subtitle="Save reusable products, scenes, and logos so every project renders them consistently."
        cta={{ label: "New Element", to: "/studio" }}
      />
    );
  }

  const filtered = filter === "all" ? subjects : subjects.filter((s) => s.kind === filter);

  return (
    <div className="flex flex-col gap-12">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1">
          {ELEMENT_FILTERS.map(([id, label]) => (
            <Chip key={id} label={label} active={filter === id} onClick={() => setFilter(id)} />
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {["New Product", "New Scene", "New Logo"].map((label) => (
            <Link
              key={label}
              to="/studio"
              className="inline-flex h-8 items-center justify-center gap-1 rounded-[12px] px-2 text-[12px] font-medium leading-3 transition hover:opacity-80"
              style={{
                background: "rgba(207,195,255,0.2)",
                color: "var(--content-accent-darkened)",
                fontFamily: TELKA,
              }}
            >
              <Plus className="h-4 w-4" />
              <span className="px-1">{label}</span>
            </Link>
          ))}
        </div>
      </div>
      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {filtered.length === 0 && !q.isLoading && (
        <p className="text-[15px]" style={{ fontFamily: TELKA, color: "var(--content-dark-tertiary)" }}>
          Nothing matches this filter.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {filtered.map((s) => (
          <SubjectCard
            key={s.id}
            imageUrl={s.imageUrl}
            name={s.name}
            meta={s.brand ? `${KIND_LABEL[s.kind]} • ${s.brand}` : KIND_LABEL[s.kind]}
          />
        ))}
      </div>
    </div>
  );
}

/** 366px card with a 244px image area + name/meta block (characters + elements). */
function SubjectCard({
  imageUrl,
  name,
  meta,
}: {
  imageUrl: string | null;
  name: string;
  meta: string;
}) {
  return (
    <div
      className="flex w-[366px] flex-col overflow-hidden rounded-[24px] border"
      style={{ background: "var(--surface-light-1)", borderColor: "var(--surface-dark-6)" }}
    >
      <div className="h-[244px] w-full" style={{ background: "var(--surface-dark-7)" }}>
        {imageUrl ? (
          <img src={imageUrl} alt={name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <UserRound className="h-8 w-8" style={{ color: "var(--content-dark-tertiary)" }} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-6">
        <p
          className="text-[15px] font-medium leading-[18px]"
          style={{ fontFamily: TELKA, color: "var(--content-dark-secondary)" }}
        >
          {name}
        </p>
        {meta && (
          <p
            className="text-[12px] leading-4"
            style={{ fontFamily: TELKA, color: "var(--content-dark-tertiary)" }}
          >
            {meta}
          </p>
        )}
      </div>
    </div>
  );
}

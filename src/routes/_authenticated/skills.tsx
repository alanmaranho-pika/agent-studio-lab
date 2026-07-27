import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BrainCircuit,
  Image,
  Mic2,
  Music2,
  Plus,
  Search,
  Sparkles,
  Video,
  Workflow,
  Wrench,
} from "lucide-react";

import { NewSkillDialog } from "@/components/skills/new-skill-dialog";
import {
  SkillEditorOverlay,
  type SkillEditorSelection,
} from "@/components/skills/skill-editor-panel";
import {
  listAgentSkillsForCatalog,
  type AgentSkillCatalogItem,
} from "@/lib/skills/agent-skills.functions";
import {
  listPikaApis,
  type PikaApiCatalogItem,
} from "@/lib/pika-catalog.functions";

export const Route = createFileRoute("/_authenticated/skills")({
  component: SkillsPage,
});

const GROUPS: Array<{
  kind: AgentSkillCatalogItem["kind"];
  title: string;
  description: string;
  icon: typeof Workflow;
}> = [
  {
    kind: "wizard",
    title: "Workflows",
    description: "Guided, multi-step capabilities that move a project from brief to result.",
    icon: Workflow,
  },
  {
    kind: "meta",
    title: "Meta skills",
    description: "System capabilities that help the agent create and maintain other skills.",
    icon: BrainCircuit,
  },
];

const API_CATEGORIES: Array<{
  id: "all" | PikaApiCatalogItem["category"];
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "image", label: "Image" },
  { id: "audio", label: "Audio & voice" },
  { id: "llm", label: "LLMs" },
];

function modeIcon(mode: AgentSkillCatalogItem["mode"], kind: AgentSkillCatalogItem["kind"]) {
  if (kind === "wizard") return Workflow;
  if (kind === "meta") return BrainCircuit;
  switch (mode) {
    case "image":
      return Image;
    case "video":
      return Video;
    case "audio":
      return Music2;
    case "speech":
      return Mic2;
    default:
      return Wrench;
  }
}

function SkillCard({
  skill,
  onOpen,
}: {
  skill: AgentSkillCatalogItem;
  onOpen: (skill: SkillEditorSelection) => void;
}) {
  const Icon = modeIcon(skill.mode, skill.kind);
  const typeLabel =
    skill.kind === "wizard"
      ? "Workflow"
      : skill.kind === "meta"
        ? "Meta"
        : skill.mode
          ? `${skill.mode[0].toUpperCase()}${skill.mode.slice(1)} model`
          : "Model";

  return (
    <button
      type="button"
      onClick={() => onOpen({ appId: skill.appId, label: skill.label })}
      aria-label={`Open ${skill.label} skill editor`}
      className="flex min-h-[214px] flex-col rounded-[24px] border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      style={{
        background: "var(--surface-light-1)",
        borderColor: "var(--surface-dark-6)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
          style={{ background: "var(--surface-dark-7)" }}
        >
          <Icon className="h-5 w-5" style={{ color: "var(--content-accent-darkened)" }} />
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <span>{typeLabel}</span>
          <span aria-hidden>·</span>
          <span>v{skill.version}</span>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="font-display text-xl font-medium leading-tight">{skill.label}</h3>
        <p className="mt-2 line-clamp-3 text-sm leading-5 text-muted-foreground">
          {skill.oneLiner}
        </p>
      </div>

      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-1.5 pt-5">
        <span className="max-w-full truncate rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
          {skill.appId}
        </span>
        {skill.matches.slice(0, 2).map((match) => (
          <span
            key={match}
            className="max-w-[140px] truncate rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground"
          >
            {match}
          </span>
        ))}
      </div>
    </button>
  );
}

function humanizeApiFunction(value: string | null) {
  if (!value) return "Language model";
  return value
    .split("-")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function ApiCard({ api }: { api: PikaApiCatalogItem }) {
  const Icon = modeIcon(
    api.category === "llm"
      ? null
      : api.category === "audio"
        ? "audio"
        : api.category,
    "model",
  );
  const pricing =
    api.priceUsd && api.priceUnit
      ? `$${Number(api.priceUsd).toFixed(Number(api.priceUsd) < 0.01 ? 4 : 3)} / ${api.priceUnit.replaceAll("_", " ")}`
      : null;

  return (
    <article
      className="flex min-h-[204px] flex-col rounded-[24px] border p-5"
      style={{
        background: "var(--surface-light-1)",
        borderColor: "var(--surface-dark-6)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
          style={{ background: "var(--surface-dark-7)" }}
        >
          <Icon className="h-5 w-5" style={{ color: "var(--content-accent-darkened)" }} />
        </div>
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {api.vendor}
        </span>
      </div>

      <div className="mt-5">
        <h3 className="font-display text-xl font-medium leading-tight">{api.name}</h3>
        <p className="mt-2 text-sm leading-5 text-muted-foreground">
          {humanizeApiFunction(api.function)}
          {pricing ? ` · ${pricing}` : ""}
        </p>
      </div>

      <div className="mt-auto pt-5">
        <span className="block truncate rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
          {api.apiId}
        </span>
      </div>
    </article>
  );
}

function PikaApiCatalog() {
  const listApis = useServerFn(listPikaApis);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof API_CATEGORIES)[number]["id"]>("all");
  const query = useQuery({
    queryKey: ["pika-api-catalog"],
    queryFn: () => listApis(),
    staleTime: 5 * 60_000,
  });
  const apis = query.data?.apis ?? [];
  const filteredApis = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return apis.filter((api) => {
      if (category !== "all" && api.category !== category) return false;
      if (!needle) return true;
      return [api.name, api.vendor, api.apiId, api.function]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [apis, category, search]);

  return (
    <section>
      <div className="mb-4 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-8 w-8 place-items-center rounded-xl bg-muted">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-medium">Pika API catalog</h2>
              {!query.isLoading && (
                <span className="text-xs text-muted-foreground">{query.data?.total ?? 0}</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every live endpoint available through the Pika API, refreshed automatically.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {API_CATEGORIES.map((item) => {
              const count =
                item.id === "all"
                  ? apis.length
                  : apis.filter((api) => api.category === item.id).length;
              const active = category === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  className={`rounded-full px-3 py-1.5 text-xs transition ${
                    active
                      ? "bg-foreground text-background"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label} · {count}
                </button>
              );
            })}
          </div>

          <label className="flex h-9 min-w-0 items-center gap-2 rounded-full border border-border bg-background px-3 sm:w-64">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search APIs"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-[204px] animate-pulse rounded-[24px] border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : query.isError ? (
        <div className="rounded-[24px] border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">The Pika API catalog didn’t load.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-4 rounded-full bg-foreground px-4 py-2 text-sm text-background"
          >
            Try again
          </button>
        </div>
      ) : filteredApis.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredApis.map((api) => (
            <ApiCard key={api.apiId} api={api} />
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No APIs match this search.</p>
        </div>
      )}
    </section>
  );
}

function SkillsPage() {
  const listSkills = useServerFn(listAgentSkillsForCatalog);
  const [newSkillOpen, setNewSkillOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillEditorSelection | null>(null);
  const query = useQuery({
    queryKey: ["agent-skills-catalog"],
    queryFn: () => listSkills(),
  });
  const skills = (query.data?.skills ?? []).filter((skill) => skill.kind !== "model");

  return (
    <div className="h-full overflow-y-auto bg-background">
      <main className="mx-auto w-full max-w-[1112px] px-5 pb-20 pt-3">
        <div className="flex items-end justify-between gap-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[28px] font-medium leading-none">
                Skills & APIs
              </h1>
              {!query.isLoading && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs text-muted-foreground"
                  style={{ background: "var(--surface-dark-6)" }}
                >
                  {skills.length} skills
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Editable agent skills and every endpoint available through the Pika API.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setNewSkillOpen(true)}
            className="flex h-14 shrink-0 items-center justify-center gap-1 rounded-[var(--radius-lg)] px-4 transition hover:opacity-90"
            style={{
              background: "rgba(207,195,255,0.2)",
              color: "var(--content-accent-darkened)",
            }}
          >
            <Plus className="h-5 w-5" />
            <span
              className="px-1 text-[17px] font-medium leading-[17px]"
              style={{ fontFamily: '"Telka", system-ui, sans-serif' }}
            >
              New Skill
            </span>
          </button>
        </div>

        {query.isLoading ? (
          <div className="grid grid-cols-1 gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-[214px] animate-pulse rounded-[24px] border border-border bg-muted/40"
              />
            ))}
          </div>
        ) : query.isError ? (
          <div className="mt-10 rounded-[24px] border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Skills didn’t load.</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-4 rounded-full bg-foreground px-4 py-2 text-sm text-background"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="space-y-12 pt-5">
            {GROUPS.slice(0, 1).map((group) => {
              const groupSkills = skills.filter((skill) => skill.kind === group.kind);
              if (!groupSkills.length) return null;
              const GroupIcon = group.icon;
              return (
                <section key={group.kind}>
                  <div className="mb-4 flex items-start gap-3">
                    <div className="mt-0.5 grid h-8 w-8 place-items-center rounded-xl bg-muted">
                      <GroupIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-lg font-medium">{group.title}</h2>
                        <span className="text-xs text-muted-foreground">
                          {groupSkills.length}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {group.description}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {groupSkills.map((skill) => (
                      <SkillCard key={skill.id} skill={skill} onOpen={setSelectedSkill} />
                    ))}
                  </div>
                </section>
              );
            })}
            <PikaApiCatalog />
            {GROUPS.slice(1).map((group) => {
              const groupSkills = skills.filter((skill) => skill.kind === group.kind);
              if (!groupSkills.length) return null;
              const GroupIcon = group.icon;
              return (
                <section key={group.kind}>
                  <div className="mb-4 flex items-start gap-3">
                    <div className="mt-0.5 grid h-8 w-8 place-items-center rounded-xl bg-muted">
                      <GroupIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-lg font-medium">{group.title}</h2>
                        <span className="text-xs text-muted-foreground">
                          {groupSkills.length}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {group.description}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {groupSkills.map((skill) => (
                      <SkillCard key={skill.id} skill={skill} onOpen={setSelectedSkill} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <NewSkillDialog open={newSkillOpen} onOpenChange={setNewSkillOpen} />
      <SkillEditorOverlay
        selectedApp={selectedSkill}
        onClose={() => setSelectedSkill(null)}
      />
    </div>
  );
}

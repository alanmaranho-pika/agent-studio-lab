import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  BrainCircuit,
  Image,
  Mic2,
  Music2,
  Plus,
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
    kind: "model",
    title: "Models",
    description: "Direct image, video, audio, and voice generation capabilities.",
    icon: Bot,
  },
  {
    kind: "meta",
    title: "Meta skills",
    description: "System capabilities that help the agent create and maintain other skills.",
    icon: BrainCircuit,
  },
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

function SkillsPage() {
  const listSkills = useServerFn(listAgentSkillsForCatalog);
  const [newSkillOpen, setNewSkillOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillEditorSelection | null>(null);
  const query = useQuery({
    queryKey: ["agent-skills-catalog"],
    queryFn: () => listSkills(),
  });
  const skills = query.data?.skills ?? [];

  return (
    <div className="h-full overflow-y-auto bg-background">
      <main className="mx-auto w-full max-w-[1112px] px-5 pb-20 pt-3">
        <div className="flex items-end justify-between gap-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[28px] font-medium leading-none">Skills</h1>
              {!query.isLoading && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs text-muted-foreground"
                  style={{ background: "var(--surface-dark-6)" }}
                >
                  {skills.length}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Everything the agent can run, organized by capability.
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
            {GROUPS.map((group) => {
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

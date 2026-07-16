import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, ArrowLeft } from "lucide-react";
import type { Skill } from "@/lib/skills";
import { getRecipeForSkill } from "@/lib/app-recipes";
import { HowItWorksButton } from "@/components/v2/apps/how-it-works-button";
import { AppWizardV2 } from "@/components/v2/apps/app-wizard-v2";
import { ModelAppPanel } from "@/components/v2/apps/model-app-panel";
import { createProject, useLocalProjectFn } from "@/lib/local-projects";
import type { ProjectAsset } from "@/lib/project-state";

import { CharacterCreatorPanel } from "@/components/v2/apps/character-creator-panel";
import { TalkingHeadPanel } from "@/components/v2/apps/talking-head-panel";
import { SpecialProductAdPanel } from "@/components/v2/apps/special-product-ad-panel";
import { ShortFilmPanel } from "@/components/v2/apps/short-film-panel";
import { WorldCup2026Panel } from "@/components/v2/apps/world-cup-panel";
import { AnimeWorldCup2026Panel } from "@/components/v2/apps/anime-world-cup-panel";
import { TimeTouristPanel } from "@/components/v2/apps/time-tourist-panel";
import { useAuthUser } from "@/hooks/use-auth-user";

// Raw model apps (one app per fal model) use the model-shaped panel
// instead of the guided recipe wizard.
const MODEL_APP_PREFIXES = ["image-", "video-", "audio-", "speech-", "model-"];
function isModelApp(skillId: string): boolean {
  return MODEL_APP_PREFIXES.some((p) => skillId.startsWith(p));
}

export type AppRunResult = {
  assetId: string;
  assetUrl: string;
  mime: string;
  projectId: string;
  prompt: string;
};

export function AppRunner({
  skill,
  projectId: existingProjectId,
  busy,
  seedAsset,
  onSeedConsumed,
  onBack,
  onProjectReady,
  onStartRun,
}: {
  skill: Skill;
  projectId?: string;
  /** Disable submit (a generation is already in flight). */
  busy: boolean;
  /** Optional asset to pre-fill the first upload step with. */
  seedAsset?: ProjectAsset | null;
  /** Called once the wizard has consumed the seed (so parent can clear it). */
  onSeedConsumed?: () => void;
  onBack: () => void;
  /** Called when a project has been ensured for this app session. */
  onProjectReady?: (projectId: string) => void;
  /** Page-level orchestrator handles the actual generation. */
  onStartRun: (args: {
    skill: Skill;
    projectId: string;
    prompt: string;
    assets: ProjectAsset[];
    params?: Record<string, string | number | boolean | string[]>;
    modelOverride?: string;
    intent?: import("@/components/v2/apps/runs-store").TimelineIntent;
  }) => void;
}) {
  const recipe = getRecipeForSkill(skill);
  const modelApp = isModelApp(skill.id);
  const createProj = useLocalProjectFn(createProject);
  const { signedIn } = useAuthUser();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [draftProjectId, setDraftProjectId] = useState<string | null>(
    existingProjectId ?? null,
  );
  const [subView, setSubView] = useState<{ label: string; onBack: () => void } | null>(
    null,
  );

  // Sync when parent reports a new project id (e.g. after first run).
  useEffect(() => {
    if (existingProjectId && existingProjectId !== draftProjectId) {
      setDraftProjectId(existingProjectId);
    }
  }, [existingProjectId, draftProjectId]);

  const creatingRef = useRef<Promise<string> | null>(null);
  const ensureProject = async (): Promise<string> => {
    if (draftProjectId) return draftProjectId;
    if (creatingRef.current) return creatingRef.current;
    creatingRef.current = (async () => {
      const out = await createProj({
        data: {
          title: skill.label,
          skill: skill.id,
          studioMode: skill.kind,
          studioModel: skill.model,
        },
      });
      setDraftProjectId(out.id);
      onProjectReady?.(out.id);
      return out.id;
    })();
    try {
      return await creatingRef.current;
    } finally {
      creatingRef.current = null;
    }
  };

  // Project is created lazily on first submit (handleSubmit -> ensureProject),
  // so opening an app does not pollute the project list with empty drafts.

  const goToLogin = (draft?: {
    prompt?: string;
    assets?: ProjectAsset[];
    params?: Record<string, string | number | boolean | string[]>;
    modelOverride?: string;
  }) => {
    const qs = typeof window !== "undefined" ? window.location.search : "";
    const redirect = pathname + qs;
    if (typeof window !== "undefined") {
      try {
        const assets = draft?.assets ?? [];
        const firstImage = assets.find((a) => a.mime?.startsWith("image/")) ?? assets[0];
        const payload = {
          skillId: skill.id,
          skillLabel: skill.label,
          prompt: draft?.prompt ?? "",
          assets,
          params: draft?.params,
          modelOverride: draft?.modelOverride,
          refUrl: firstImage?.url ?? "",
          refName: firstImage?.name ?? "",
          ts: Date.now(),
        };
        window.sessionStorage.setItem("pika.intent.draft", JSON.stringify(payload));
      } catch {
        // ignore storage failures
      }
    }
    void navigate({
      to: "/login",
      search: { redirect },
    });
  };

  const handleSubmit = async ({
    prompt,
    assets,
    params,
    modelOverride,
    intent,
  }: {
    prompt: string;
    assets: ProjectAsset[];
    params?: Record<string, string | number | boolean | string[]>;
    modelOverride?: string;
    intent?: import("@/components/v2/apps/runs-store").TimelineIntent;
  }) => {
    // Local projects do not require a hosted account.
    // if (!signedIn) { goToLogin({ prompt, assets, params, modelOverride }); return; }
    const projectId = await ensureProject();
    onStartRun({ skill, projectId, prompt, assets, params, modelOverride, intent });
  };

  // After sign-in: if a fresh draft was saved for this app, auto-resume the
  // generation the user attempted before being bounced to /login.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!signedIn || resumedRef.current) return;
    if (typeof window === "undefined") return;
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem("pika.intent.draft");
    } catch {
      return;
    }
    if (!raw) return;
    let parsed: {
      skillId: string;
      prompt?: string;
      assets?: ProjectAsset[];
      params?: Record<string, string | number | boolean | string[]>;
      modelOverride?: string;
      ts?: number;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (parsed.skillId !== skill.id) return;
    if (parsed.ts && Date.now() - parsed.ts > 10 * 60 * 1000) {
      try { window.sessionStorage.removeItem("pika.intent.draft"); } catch { /* noop */ }
      return;
    }
    resumedRef.current = true;
    try { window.sessionStorage.removeItem("pika.intent.draft"); } catch { /* noop */ }
    void (async () => {
      const projectId = await ensureProject();
      onStartRun({
        skill,
        projectId,
        prompt: parsed.prompt ?? "",
        assets: parsed.assets ?? [],
        params: parsed.params,
        modelOverride: parsed.modelOverride,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, skill.id]);



  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-3">
        <button
          onClick={() => (subView ? subView.onBack() : onBack())}
          className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"
          aria-label={subView ? "Back to character creator" : "Back to apps"}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{skill.label}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {subView ? subView.label : skill.category}
          </div>
        </div>
        <HowItWorksButton skill={skill} />
      </div>


      <div className="relative flex-1 min-h-0">
        <div className="h-full overflow-y-auto p-5">
        {(() => {
          const panelProjectId = draftProjectId ?? "anonymous-draft";

          const panel =
            skill.id === "app-character-creator" ? (
              <CharacterCreatorPanel
                skill={skill}
                projectId={panelProjectId}
                busy={busy}
                seedAsset={seedAsset ?? null}
                onSeedConsumed={onSeedConsumed}
                onSubmit={handleSubmit}
                onSubViewChange={setSubView}
                onEnsureProject={async () => {
                  if (!signedIn) {
                    goToLogin();
                    throw new Error("not signed in");
                  }
                  return ensureProject();
                }}
              />
            ) : skill.id === "app-pika-lipsync" ? (
              <TalkingHeadPanel
                skill={skill}
                projectId={panelProjectId}
                busy={busy}
                seedAsset={seedAsset ?? null}
                onSeedConsumed={onSeedConsumed}
                onSubmit={handleSubmit}
              />
            ) : skill.id === "app-special-product-ad" ? (
              <SpecialProductAdPanel
                skill={skill}
                projectId={panelProjectId}
                busy={busy}
                seedAsset={seedAsset ?? null}
                onSeedConsumed={onSeedConsumed}
                onSubmit={handleSubmit}
                onEnsureProject={async () => {
                  if (!signedIn) {
                    goToLogin();
                    throw new Error("not signed in");
                  }
                  return ensureProject();
                }}
              />

            ) : skill.id === "app-short-film" ? (
              <ShortFilmPanel
                skill={skill}
                projectId={panelProjectId}
                busy={busy}
                seedAsset={seedAsset ?? null}
                onSeedConsumed={onSeedConsumed}
                onSubmit={handleSubmit}
                onEnsureProject={async () => {
                  if (!signedIn) {
                    goToLogin();
                    throw new Error("not signed in");
                  }
                  return ensureProject();
                }}
              />
            ) : skill.id === "app-world-cup-2026" ? (
              <WorldCup2026Panel
                skill={skill}
                projectId={panelProjectId}
                busy={busy}
                seedAsset={seedAsset ?? null}
                onSeedConsumed={onSeedConsumed}
                onEnsureProject={async () => {
                  if (!signedIn) {
                    goToLogin();
                    throw new Error("not signed in");
                  }
                  return ensureProject();
                }}
              />
            ) : skill.id === "app-anime-world-cup-2026" ? (
              <AnimeWorldCup2026Panel
                skill={skill}
                projectId={panelProjectId}
                busy={busy}
                seedAsset={seedAsset ?? null}
                onSeedConsumed={onSeedConsumed}
                onEnsureProject={async () => {
                  if (!signedIn) {
                    goToLogin();
                    throw new Error("not signed in");
                  }
                  return ensureProject();
                }}
              />
            ) : skill.id === "app-time-tourist-v2" ? (
              <TimeTouristPanel
                skill={skill}
                projectId={panelProjectId}
                busy={busy}
                seedAsset={seedAsset ?? null}
                onSeedConsumed={onSeedConsumed}
                onEnsureProject={async () => {
                  if (!signedIn) {
                    goToLogin();
                    throw new Error("not signed in");
                  }
                  return ensureProject();
                }}
              />
            ) : modelApp ? (
              <ModelAppPanel
                skill={skill}
                projectId={panelProjectId}
                busy={busy}
                seedAsset={seedAsset ?? null}
                onSeedConsumed={onSeedConsumed}
                onSubmit={handleSubmit}
              />
            ) : (
              <AppWizardV2
                recipe={recipe}
                projectId={panelProjectId}
                busy={busy}
                seedAsset={seedAsset ?? null}
                onSeedConsumed={onSeedConsumed}
                onSubmit={handleSubmit}
              />
            );
          return panel;
        })()}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white to-transparent" />
      </div>
    </div>
  );
}

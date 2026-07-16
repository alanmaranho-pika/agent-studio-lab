// WorldCup2026Panel — guided template app for the FIFA World Cup 2026 vibes.
// Takes a selfie + team + name + scenario, generates a fake live broadcast
// screenshot (GPT Image 2 /edit), then animates it into a 10s clip with
// Seedance 2.0 reference-to-video.

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload as UploadIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GenerateButton } from "@/components/v2/apps/shared/generate-button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Skill } from "@/lib/skills";
import { getProject, uploadProjectAsset, useLocalProjectFn } from "@/lib/local-projects";
import type { ProjectAsset } from "@/lib/project-state";
import { runsStore } from "@/components/v2/apps/runs-store";
import {
  directGenerateStart,
  directGeneratePoll,
} from "@/lib/generate.functions";
import {
  AssetPickerDialog,
  type PickerResult,
} from "@/components/studio/asset-picker-dialog";
import {
  WORLD_CUP_TEAMS,
  WORLD_CUP_SCENARIOS,
  WORLD_CUP_LANGUAGES,
  buildImagePrompt,
  buildVideoPrompt,
  defaultLanguageForTeam,
  pickOpponent,
  type WorldCupLanguage,
  type WorldCupScenarioId,
} from "@/lib/world-cup.functions";
import { cn } from "@/lib/utils";
import { fileToProjectAsset as sharedUpload } from "@/lib/v2/upload-asset";

async function fileToProjectAsset(
  file: File,
  projectId: string,
): Promise<ProjectAsset> {
  return sharedUpload(file, projectId, "reference");
}

type Phase = "idle" | "image" | "video" | "done" | "error";

export function WorldCup2026Panel({
  skill,
  projectId,
  seedAsset,
  onSeedConsumed,
  onEnsureProject,
}: {
  skill: Skill;
  projectId: string;
  busy?: boolean;
  seedAsset?: ProjectAsset | null;
  onSeedConsumed?: () => void;
  onSubmit?: (args: unknown) => void;
  onEnsureProject?: () => Promise<string>;
}) {
  const runStart = useServerFn(directGenerateStart);
  const runPoll = useServerFn(directGeneratePoll);
  const qc = useQueryClient();

  const [selfie, setSelfie] = useState<ProjectAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [team, setTeam] = useState<string>("Brazil");
  const [language, setLanguage] = useState<WorldCupLanguage>(() =>
    defaultLanguageForTeam("Brazil"),
  );
  const [languageTouched, setLanguageTouched] = useState(false);
  const [name, setName] = useState<string>("");
  const [scenario, setScenario] = useState<WorldCupScenarioId>("score_goal");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  

  // Consume incoming seed asset (e.g. from library → Use in app).
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedAsset) return;
    if (seededRef.current === seedAsset.id) return;
    seededRef.current = seedAsset.id;
    if (seedAsset.mime?.startsWith("image/")) setSelfie(seedAsset);
    onSeedConsumed?.();
  }, [seedAsset, onSeedConsumed]);

  // Rehydrate the selfie when returning to an existing project: pick the
  // most recent reference-style image from project assets so the form isn't
  // empty even though the upload is right there in the Outputs column.
  const fetchProject = useLocalProjectFn(getProject);
  const isRealProject = !!projectId && projectId !== "anonymous-draft";
  const projectQ = useQuery({
    queryKey: ["v2-project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId } }),
    enabled: isRealProject,
  });
  const hydratedFromProjectRef = useRef<string | null>(null);
  const userClearedRef = useRef(false);
  useEffect(() => {
    if (!isRealProject) return;
    if (selfie) return;
    if (userClearedRef.current) return;
    if (hydratedFromProjectRef.current === projectId) return;
    const assets = projectQ.data?.assets ?? [];
    if (assets.length === 0) return;
    // Prefer the most recent "reference" image (what uploads land as), then
    // fall back to any image we can find on the project.
    const images = assets.filter((a) => a.mime?.startsWith("image/"));
    const refs = images.filter((a) => a.kind === "reference");
    const pick = refs[refs.length - 1] ?? images[images.length - 1] ?? null;
    if (pick) {
      hydratedFromProjectRef.current = projectId;
      setSelfie(pick);
    }
  }, [isRealProject, projectId, projectQ.data, selfie]);

  const clearSelfie = () => {
    userClearedRef.current = true;
    setSelfie(null);
  };


  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const pid = onEnsureProject ? await onEnsureProject() : projectId;
      setSelfie(await fileToProjectAsset(file, pid));
    } catch (err) {
      console.error("[world-cup] upload failed", err);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handlePicked = async (result: PickerResult) => {
    if (result.kind === "library") {
      const first = result.assets[0];
      if (first) setSelfie(first);
      return;
    }
    const file = result.files[0];
    if (file) await handleFile(file);
  };


  const canSubmit =
    !!selfie && team.trim().length > 0 && name.trim().length > 0 &&
    phase !== "image" && phase !== "video";

  const handleGenerate = async () => {
    if (!selfie) return;
    setError(null);
    setPhase("image");

    const startedAt = Date.now();
    const imageRunId = `wc-img-${startedAt}`;
    const videoRunId = `wc-vid-${startedAt}`;
    const scenarioLabel =
      WORLD_CUP_SCENARIOS.find((s) => s.id === scenario)?.label ?? scenario;
    const refImageUrls = [selfie.url];
    const imageCardPrompt = `Broadcast screenshot — ${team} · ${scenarioLabel}`;
    const videoCardPrompt = `Animated clip — ${team} · ${scenarioLabel}`;
    const opponent = pickOpponent(team);
    const imagePrompt = buildImagePrompt(team, opponent, language);
    const videoPrompt = buildVideoPrompt({
      scenario,
      name: name.trim(),
      team,
      language,
    });

    const pollAsset = async (args: {
      projectId: string;
      mode: "image" | "video";
      model: string;
      prompt: string;
      assistantMessageId: string;
      statusUrl: string;
      responseUrl: string;
      params?: Record<string, string | number | boolean | string[]>;
    }) => {
      const deadline = Date.now() + 20 * 60_000;
      let transientFailures = 0;
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        let tick: Awaited<ReturnType<typeof runPoll>>;
        try {
          tick = await runPoll({ data: args });
        } catch (err) {
          // Network blip / transient worker error. The server-side fal job
          // keeps running independently — retry instead of failing the whole
          // run. Only give up after many consecutive failures.
          transientFailures += 1;
          console.warn("[world-cup] poll transient error", err);
          if (transientFailures > 20) {
            throw err instanceof Error ? err : new Error(String(err));
          }
          continue;
        }
        transientFailures = 0;
        if (tick.status !== "done") continue;
        if (!tick.ok) throw new Error(tick.assistantText ?? "Generation failed");
        return tick;
      }
      throw new Error("Generation timed out.");
    };

    try {
      const pid = onEnsureProject ? await onEnsureProject() : projectId;
      runsStore.setRun(imageRunId, {
        id: imageRunId,
        skill,
        projectId: pid,
        prompt: imageCardPrompt,
        phase: "polling",
        refImageUrls,
      });
      runsStore.setRun(videoRunId, {
        id: videoRunId,
        skill,
        projectId: pid,
        prompt: videoCardPrompt,
        phase: "polling",
        refImageUrls,
      });

      const imageAssistantId = crypto.randomUUID();
      const imageStarted = await runStart({
        data: {
          projectId: pid,
          prompt: imagePrompt,
          mode: "image",
          model: "openai/gpt-image-2/edit",
          userMessageId: crypto.randomUUID(),
          assistantMessageId: imageAssistantId,
          referenceImageUrls: [selfie.url],
          params: {
            image_size: "landscape_16_9",
            quality: "high",
            num_images: 1,
            output_format: "png",
          },
        },
      });
      if (!imageStarted.ok) throw new Error(imageStarted.assistantText ?? "Couldn't start broadcast screenshot.");
      const imageOut = await pollAsset({
        projectId: pid,
        mode: "image",
        model: "openai/gpt-image-2/edit",
        prompt: imagePrompt,
        assistantMessageId: imageAssistantId,
        statusUrl: imageStarted.statusUrl,
        responseUrl: imageStarted.responseUrl,
        params: { image_size: "landscape_16_9", quality: "high", num_images: 1, output_format: "png" },
      });
      runsStore.setOutputMeta(imageOut.assetId, {
        prompt: imagePrompt.slice(0, 200),
        skillId: skill.id,
      });
      runsStore.dismissRun(imageRunId);
      void qc.invalidateQueries({ queryKey: ["v2-project", pid] });

      setPhase("video");
      runsStore.updateRun(videoRunId, { refImageUrls: [imageOut.assetUrl] });
      const videoAssistantId = crypto.randomUUID();
      const videoParams = {
        aspect_ratio: "16:9",
        resolution: "720p",
        duration: "10",
        generate_audio: true,
      };
      const videoStarted = await runStart({
        data: {
          projectId: pid,
          prompt: videoPrompt,
          mode: "video",
          model: "bytedance/seedance-2.0/reference-to-video",
          userMessageId: crypto.randomUUID(),
          assistantMessageId: videoAssistantId,
          referenceImageUrls: [imageOut.assetUrl],
          params: videoParams,
        },
      });
      if (!videoStarted.ok) throw new Error(videoStarted.assistantText ?? "Couldn't start Seedance video.");
      const videoOut = await pollAsset({
        projectId: pid,
        mode: "video",
        model: "bytedance/seedance-2.0/reference-to-video",
        prompt: videoPrompt,
        assistantMessageId: videoAssistantId,
        statusUrl: videoStarted.statusUrl,
        responseUrl: videoStarted.responseUrl,
        params: videoParams,
      });
      runsStore.setOutputMeta(videoOut.assetId, {
        prompt: videoPrompt.slice(0, 200),
        skillId: skill.id,
      });
      runsStore.dismissRun(videoRunId);
      setPhase("done");

      // Refresh library / project queries so the new assets appear.
      void qc.invalidateQueries({ queryKey: ["v2-library"] });
      void qc.invalidateQueries({ queryKey: ["v2-library-picker"] });
      void qc.invalidateQueries({ queryKey: ["v2-project", pid] });
      void qc.invalidateQueries({ queryKey: ["v2-projects"] });
      void qc.invalidateQueries({ queryKey: ["v2-jobs"] });
    } catch (err) {
      console.error("[world-cup] generation failed", err);
      const msg = err instanceof Error ? err.message : "Generation failed";
      setError(msg);
      setPhase("error");
      runsStore.updateRun(imageRunId, { phase: "error", error: msg });
      runsStore.updateRun(videoRunId, { phase: "error", error: msg });
    }
  };


  const generating = phase === "image" || phase === "video";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="p-5">
        <div className="mb-3">
          <h2 className="text-base font-semibold">Star in the World Cup 2026</h2>
        </div>



        {/* Selfie */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium">Your selfie</label>
          {selfie ? (
            <div className="relative inline-block">
              <img
                src={selfie.url}
                alt="selfie"
                className="h-28 w-28 rounded-lg object-cover ring-1 ring-border"
              />
              <button
                type="button"
                onClick={clearSelfie}
                className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-background shadow ring-1 ring-border"
                aria-label="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={uploading}
              className={cn(
                "flex h-28 w-full items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors",
                "hover:border-foreground/30 hover:bg-muted/40",
                uploading && "opacity-60",
              )}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadIcon className="h-4 w-4" />
              )}
              {uploading ? "Uploading…" : "Choose a selfie"}
            </button>
          )}
          <AssetPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            accept="image"
            onPick={(r) => void handlePicked(r)}
          />
        </div>

        {/* Team */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium">Your team</label>
          <Select
            value={team}
            onValueChange={(t) => {
              setTeam(t);
              if (!languageTouched) setLanguage(defaultLanguageForTeam(t));
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORLD_CUP_TEAMS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Broadcast language */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium">
            Broadcast language
          </label>
          <Select
            value={language}
            onValueChange={(l) => {
              setLanguage(l as WorldCupLanguage);
              setLanguageTouched(true);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORLD_CUP_LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Name */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium">Your name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should the announcer call you?"
            maxLength={60}
          />
        </div>

        {/* Scenario */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium">Your moment</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {WORLD_CUP_SCENARIOS.filter((s) => !s.bonus).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScenario(s.id)}
                className={cn(
                  "rounded-lg border p-3 text-left text-sm transition-colors",
                  scenario === s.id
                    ? "border-foreground bg-foreground/5"
                    : "hover:border-foreground/30 hover:bg-muted/40",
                )}
              >
                <div className="font-medium">{s.label}</div>
              </button>
            ))}
          </div>

          {(() => {
            const bonus = WORLD_CUP_SCENARIOS.filter((s) => s.bonus);
            const bonusSelected = bonus.find((s) => s.id === scenario);
            return (
              <div className="mt-2">
                <Select
                  value={bonusSelected ? scenario : ""}
                  onValueChange={(v) => setScenario(v as WorldCupScenarioId)}
                >
                  <SelectTrigger className="w-full border-dashed">
                    <SelectValue placeholder="Even more moments…">
                      {bonusSelected ? bonusSelected.label : "Even more moments…"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {bonus.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="font-medium">{s.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}
        </div>

        <GenerateButton
          skill={skill}
          onClick={handleGenerate}
          disabled={!canSubmit}
          busy={generating}
          busyLabel={
            phase === "image"
              ? "Generating broadcast screenshot…"
              : "Animating with Seedance 2.0…"
          }
          label="Generate World Cup video"
        />

        {error && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

    </div>
  );
}

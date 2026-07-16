// AnimeWorldCup2026Panel — sibling to the World Cup app. Same selfie +
// team input, but the output is an open-ended ~15s anime sequence
// produced by Seedance 2.0 reference-to-video. Steered by anime
// "genre modes" rather than scripted moments — Seedance is left free
// to invent scene, action, camera and supporting characters.

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Upload as UploadIcon, X } from "lucide-react";

import { GenerateButton } from "@/components/v2/apps/shared/generate-button";
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
  ANIME_MODES,
  LANGUAGES,
  WORLD_CUP_TEAMS,
  buildAnimePrompt,
  
  type AnimeAspect,
  type AnimeModeId,
  type LanguageId,
} from "@/lib/anime-world-cup.functions";
import { cn } from "@/lib/utils";

import battleShonenImg from "@/assets/anime-modes/battle_shonen.jpg";
import magicalGirlImg from "@/assets/anime-modes/magical_girl.jpg";
import sportsAnimeImg from "@/assets/anime-modes/sports_anime.jpg";
import fantasyAdventureImg from "@/assets/anime-modes/fantasy_adventure.jpg";
import cinematicAnimeImg from "@/assets/anime-modes/cinematic_anime.jpg";
import superheroImg from "@/assets/anime-modes/superhero.jpg";
import psychicImg from "@/assets/anime-modes/psychic.jpg";
import mechaImg from "@/assets/anime-modes/mecha.jpg";
import cyberpunkImg from "@/assets/anime-modes/cyberpunk.jpg";
import retro90sCelImg from "@/assets/anime-modes/retro_90s_cel.jpg";
import romanceDramaImg from "@/assets/anime-modes/romance_drama.jpg";
import comedyImg from "@/assets/anime-modes/comedy.jpg";
import { fileToProjectAsset as sharedUpload } from "@/lib/v2/upload-asset";

const MODE_IMAGES: Record<AnimeModeId, string> = {
  battle_shonen: battleShonenImg,
  magical_girl: magicalGirlImg,
  sports_anime: sportsAnimeImg,
  fantasy_adventure: fantasyAdventureImg,
  cinematic_anime: cinematicAnimeImg,
  superhero: superheroImg,
  psychic: psychicImg,
  mecha: mechaImg,
  cyberpunk: cyberpunkImg,
  retro_90s_cel: retro90sCelImg,
  romance_drama: romanceDramaImg,
  comedy: comedyImg,
};

async function fileToProjectAsset(
  file: File,
  projectId: string,
): Promise<ProjectAsset> {
  return sharedUpload(file, projectId, "reference");
}

const MAX_MODES = 2;

const ASPECTS: ReadonlyArray<{ id: AnimeAspect; label: string }> = [
  { id: "9:16", label: "9:16" },
  { id: "16:9", label: "16:9" },
  { id: "1:1", label: "1:1" },
];

const MAX_CONCURRENT = 3;

export function AnimeWorldCup2026Panel({
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
  const [heroName, setHeroName] = useState<string>("");
  const [team, setTeam] = useState<string>("Brazil");
  const [opponent, setOpponent] = useState<string>("Argentina");
  const [language, setLanguage] = useState<LanguageId>("japanese");
  const [modeIds, setModeIds] = useState<AnimeModeId[]>(["battle_shonen"]);
  const [aspect, setAspect] = useState<AnimeAspect>("9:16");
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleLanguageChange = (id: LanguageId) => {
    setLanguage(id);
  };


  const [activeCount, setActiveCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Consume incoming seed asset (library → Use in app).
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedAsset) return;
    if (seededRef.current === seedAsset.id) return;
    seededRef.current = seedAsset.id;
    if (seedAsset.mime?.startsWith("image/")) setSelfie(seedAsset);
    onSeedConsumed?.();
  }, [seedAsset, onSeedConsumed]);

  // Rehydrate the selfie when returning to an existing project.
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
      console.error("[anime-world-cup] upload failed", err);
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

  const toggleMode = (id: AnimeModeId) => {
    setModeIds((prev) => {
      if (prev.includes(id)) {
        // Don't allow zero selections.
        return prev.length === 1 ? prev : prev.filter((m) => m !== id);
      }
      if (prev.length >= MAX_MODES) {
        // Replace the oldest selection.
        return [...prev.slice(1), id];
      }
      return [...prev, id];
    });
  };

  const canSubmit =
    !!selfie && team.trim().length > 0 && modeIds.length > 0 && activeCount < MAX_CONCURRENT;

  const handleGenerate = async () => {
    if (!selfie) return;
    if (activeCount >= MAX_CONCURRENT) return;
    setError(null);
    setActiveCount((n) => n + 1);

    const startedAt = Date.now();
    const runId = `awc-vid-${startedAt}`;
    const videoPrompt = buildAnimePrompt({
      team,
      opponent,
      heroName,
      modeIds,
      language,
      seed: startedAt,
    });
    const modeLabel = modeIds
      .map((id) => ANIME_MODES.find((m) => m.id === id)?.label ?? id)
      .join(" + ");
    const cardPrompt = `Anime World Cup — ${team} vs ${opponent} · ${modeLabel}`;
    const refImageUrls = [selfie.url];

    const pollAsset = async (args: {
      projectId: string;
      mode: "video";
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
          transientFailures += 1;
          console.warn("[anime-world-cup] poll transient error", err);
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
      runsStore.setRun(runId, {
        id: runId,
        skill,
        projectId: pid,
        prompt: cardPrompt,
        phase: "polling",
        refImageUrls,
      });

      const assistantId = crypto.randomUUID();
      const params = {
        aspect_ratio: aspect,
        resolution: "1080p",
        duration: "15",
        generate_audio: true,
      };
      const started = await runStart({
        data: {
          projectId: pid,
          prompt: videoPrompt,
          mode: "video",
          model: "bytedance/seedance-2.0/reference-to-video",
          userMessageId: crypto.randomUUID(),
          assistantMessageId: assistantId,
          referenceImageUrls: [selfie.url],
          params,
        },
      });
      if (!started.ok) {
        throw new Error(started.assistantText ?? "Couldn't start Seedance video.");
      }
      const out = await pollAsset({
        projectId: pid,
        mode: "video",
        model: "bytedance/seedance-2.0/reference-to-video",
        prompt: videoPrompt,
        assistantMessageId: assistantId,
        statusUrl: started.statusUrl,
        responseUrl: started.responseUrl,
        params,
      });
      runsStore.setOutputMeta(out.assetId, {
        prompt: videoPrompt.slice(0, 200),
        skillId: skill.id,
      });
      runsStore.dismissRun(runId);

      void qc.invalidateQueries({ queryKey: ["v2-library"] });
      void qc.invalidateQueries({ queryKey: ["v2-library-picker"] });
      void qc.invalidateQueries({ queryKey: ["v2-project", pid] });
      void qc.invalidateQueries({ queryKey: ["v2-projects"] });
      void qc.invalidateQueries({ queryKey: ["v2-jobs"] });
    } catch (err) {
      console.error("[anime-world-cup] generation failed", err);
      const msg = err instanceof Error ? err.message : "Generation failed";
      setError(msg);
      runsStore.updateRun(runId, { phase: "error", error: msg });
    } finally {
      setActiveCount((n) => Math.max(0, n - 1));
    }
  };

  const generating = activeCount > 0;
  const atLimit = activeCount >= MAX_CONCURRENT;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="p-5">

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

        {/* Hero name (optional) */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium">
            Hero name <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            type="text"
            value={heroName}
            onChange={(e) => setHeroName(e.target.value)}
            placeholder=""
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground/60 focus:border-foreground/40"
            maxLength={24}
          />
        </div>

        {/* Team vs Opponent */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-sm font-medium">Your team</label>
            <Select value={team} onValueChange={setTeam}>
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
          <div>
            <label className="mb-2 block text-sm font-medium">Opponent</label>
            <Select value={opponent} onValueChange={setOpponent}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORLD_CUP_TEAMS.filter((t) => t !== team).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Language */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium">
            Language
          </label>

          <Select value={language} onValueChange={(v) => handleLanguageChange(v as LanguageId)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>


        {/* Anime Mode */}
        <div className="mb-5">
          <div className="mb-2 flex items-baseline justify-between">
            <label className="text-sm font-medium">Anime mode</label>
            <span className="text-xs text-muted-foreground">
              Pick 1–{MAX_MODES}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ANIME_MODES.map((m) => {
              const active = modeIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMode(m.id)}
                  aria-pressed={active}
                  className={cn(
                    "hover-lift relative aspect-square overflow-hidden rounded-lg text-left transition-all",
                    active
                      ? "ring-[3px] ring-foreground ring-offset-2 ring-offset-background"
                      : "ring-1 ring-inset ring-hairline",
                  )}
                >
                  <img
                    src={MODE_IMAGES[m.id]}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                    width={512}
                    height={512}
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  {active && (
                    <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-foreground text-background shadow-md ring-2 ring-background">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  )}
                  <span className="absolute bottom-2 left-2.5 right-2.5 text-xs font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                    {m.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Aspect ratio */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium">Aspect ratio</label>
          <div className="flex gap-2">
            {ASPECTS.map((a) => {
              const active = aspect === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAspect(a.id)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "border-foreground bg-foreground/5"
                      : "hover:border-foreground/30 hover:bg-muted/40",
                  )}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>

        <GenerateButton
          skill={skill}
          onClick={handleGenerate}
          disabled={!canSubmit}
          busy={atLimit}
          busyLabel={`Max ${MAX_CONCURRENT} running — please wait…`}
          label={
            generating
              ? `Generate another (${activeCount}/${MAX_CONCURRENT} running)`
              : "Generate anime"
          }
        />
        {generating && !atLimit && (
          <p className="mt-2 text-xs text-muted-foreground">
            You can queue up to {MAX_CONCURRENT} generations at once.
          </p>
        )}

        {error && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

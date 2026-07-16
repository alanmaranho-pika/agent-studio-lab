// TimeTouristPanel — mirrors the "time-tourist-v2" Agent-mode skill.
// Selfie + destination (+ tone, duration) → Phase 1 GPT Image 2 opening
// frame (9:16) → Phase 2 Seedance 2.0 reference-to-video using the Phase 1
// image as reference (mandatory — that's what preserves likeness).

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload as UploadIcon, X } from "lucide-react";

import { GenerateButton } from "@/components/v2/apps/shared/generate-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Skill } from "@/lib/skills";
import { getProject, useLocalProjectFn } from "@/lib/local-projects";
import type { ProjectAsset } from "@/lib/project-state";
import { runsStore } from "@/components/v2/apps/runs-store";
import {
  AssetPickerDialog,
  type PickerResult,
} from "@/components/studio/asset-picker-dialog";
import {
  TIME_TOURIST_DESTINATIONS,
  TIME_TOURIST_TONES,
  produceTimeTouristVideo,
  type TimeTouristDestinationId,
  type TimeTouristTone,
  type TimeTouristDuration,
} from "@/lib/time-tourist.functions";
import { cn } from "@/lib/utils";
import { fileToProjectAsset as sharedUpload } from "@/lib/v2/upload-asset";

async function fileToProjectAsset(
  file: File,
  projectId: string,
): Promise<ProjectAsset> {
  return sharedUpload(file, projectId, "reference");
}

type Phase = "idle" | "image" | "video" | "done" | "error";

const DURATIONS: ReadonlyArray<{ id: TimeTouristDuration; label: string }> = [
  { id: "5", label: "5s" },
  { id: "10", label: "10s" },
  { id: "15", label: "15s" },
];

export function TimeTouristPanel({
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
  const produce = useServerFn(produceTimeTouristVideo);
  const qc = useQueryClient();

  const [selfie, setSelfie] = useState<ProjectAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [destination, setDestination] =
    useState<TimeTouristDestinationId | "custom">("ancient_rome");
  const [customLabel, setCustomLabel] = useState("");
  const [customSetting, setCustomSetting] = useState("");
  const [customEnvironment, setCustomEnvironment] = useState("");
  const [tone, setTone] = useState<TimeTouristTone>("funny");
  const [duration, setDuration] = useState<TimeTouristDuration>("15");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
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
      console.error("[time-tourist] upload failed", err);
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

  const customValid =
    destination !== "custom" || customSetting.trim().length > 0;
  const canSubmit =
    !!selfie && customValid && phase !== "image" && phase !== "video";

  const handleGenerate = async () => {
    if (!selfie) return;
    setError(null);
    setPhase("video");

    const runId = `tt-${Date.now()}`;
    const custom =
      destination === "custom"
        ? {
            label: customLabel.trim() || "Custom destination",
            setting: customSetting.trim(),
            environment: customEnvironment.trim(),
          }
        : null;
    const destLabel =
      destination === "custom"
        ? custom!.label
        : TIME_TOURIST_DESTINATIONS.find((d) => d.id === destination)?.label ??
          destination;
    const toneLabel =
      TIME_TOURIST_TONES.find((t) => t.id === tone)?.label ?? tone;
    const cardPrompt = `Time Tourist — ${destLabel} · ${toneLabel} · ${duration}s`;

    try {
      const pid = onEnsureProject ? await onEnsureProject() : projectId;
      runsStore.setRun(runId, {
        id: runId,
        skill,
        projectId: pid,
        prompt: cardPrompt,
        phase: "polling",
        refImageUrls: [selfie.url],
      });

      const result = await produce({
        data: {
          projectId: pid,
          refImageUrl: selfie.url,
          destination,
          tone,
          duration,
          custom,
        },
      });

      if (!result.ok) {
        throw new Error(result.message);
      }

      runsStore.setOutputMeta(result.image.assetId, {
        prompt: result.imagePrompt.slice(0, 200),
        skillId: skill.id,
      });
      runsStore.setOutputMeta(result.video.assetId, {
        prompt: result.videoPrompt.slice(0, 200),
        skillId: skill.id,
      });
      runsStore.dismissRun(runId);
      setPhase("done");

      void qc.invalidateQueries({ queryKey: ["v2-library"] });
      void qc.invalidateQueries({ queryKey: ["v2-library-picker"] });
      void qc.invalidateQueries({ queryKey: ["v2-project", pid] });
      void qc.invalidateQueries({ queryKey: ["v2-projects"] });
      void qc.invalidateQueries({ queryKey: ["v2-jobs"] });
    } catch (err) {
      console.error("[time-tourist] generation failed", err);
      const msg = err instanceof Error ? err.message : "Generation failed";
      setError(msg);
      setPhase("error");
      runsStore.updateRun(runId, { phase: "error", error: msg });
    }
  };

  const generating = phase === "image" || phase === "video";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="p-5">
        <div className="mb-3">
          <h2 className="text-base font-semibold">Time Tourist</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload a selfie, pick a destination — get a first-person vlog from
            history. Two-phase render: opening frame with GPT Image 2, then a
            15-second Seedance clip locked to your likeness.
          </p>
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

        {/* Destination */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium">Destination</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TIME_TOURIST_DESTINATIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDestination(d.id)}
                className={cn(
                  "rounded-lg border p-3 text-left text-sm transition-colors",
                  destination === d.id
                    ? "border-foreground bg-foreground/5"
                    : "hover:border-foreground/30 hover:bg-muted/40",
                )}
              >
                <div className="font-medium">{d.label}</div>
              </button>
            ))}
          </div>

          <div className="mt-3">
            <input
              type="text"
              value={customSetting}
              onChange={(e) => {
                setCustomSetting(e.target.value);
                setCustomLabel(e.target.value);
                setCustomEnvironment("");
                if (e.target.value.trim().length > 0) {
                  setDestination("custom");
                }
              }}
              onFocus={() => {
                if (customSetting.trim().length > 0) setDestination("custom");
              }}
              placeholder="Or type your own destination…"
              className={cn(
                "w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none transition-colors",
                destination === "custom"
                  ? "border-foreground"
                  : "border-dashed hover:border-foreground/30",
              )}
            />
          </div>
        </div>

        {/* Tone (optional) */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium">
            Tone{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <Select value={tone} onValueChange={(v) => setTone(v as TimeTouristTone)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_TOURIST_TONES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Duration */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium">
            Duration{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (default 15s)
            </span>
          </label>
          <div className="flex gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDuration(d.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  duration === d.id
                    ? "border-foreground bg-foreground/5"
                    : "hover:border-foreground/30 hover:bg-muted/40",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <GenerateButton
          skill={skill}
          onClick={handleGenerate}
          disabled={!canSubmit}
          busy={generating}
          busyLabel={
            phase === "image"
              ? "Rendering the opening frame…"
              : "Animating with Seedance 2.0…"
          }
          label="Generate Time Tourist video"
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
